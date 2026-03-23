import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../lib/httpError";
import { successResponse } from "../utils/response";
import { requireAuth } from "../middleware/auth";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshExpiryDate,
  hashStoredToken
} from "../lib/tokens";
import { serializeUser } from "../utils/serializers";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    errors: []
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(80),
  bio: z.string().max(280).optional(),
  university: z.string().trim().min(2).max(120),
  phoneNumber: z
    .string()
    .trim()
    .min(10)
    .max(30)
    .regex(/^[+]?[\d\s\-()]{10,30}$/, "Please provide a valid phone number"),
  hobbies: z.string().max(240).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8)
});

async function issueTokens(user: { id: string; role: any; email?: string }) {
  const accessToken = signAccessToken({ id: user.id, role: user.role, email: user.email || "" });
  const refreshToken = signRefreshToken({ id: user.id, role: user.role });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: hashStoredToken(refreshToken),
      expiresAt: getRefreshExpiryDate()
    }
  });
  return { accessToken, refreshToken };
}

router.post(
  "/auth/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const existingUser = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (existingUser) throw new HttpError(409, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: req.body.email,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        isActive: true,
        profile: {
          create: {
            displayName: req.body.displayName,
            bio: req.body.bio || null,
            university: req.body.university || null,
            phoneNumber: req.body.phoneNumber || null,
            hobbies: req.body.hobbies || null
          }
        },
        settings: {
          create: {
            themePreference: "system",
            notificationPreferences: { email: true, push: true, marketing: false }
          }
        },
        privacy: {
          create: {
            profileVisibility: "PUBLIC",
            showUniversity: true,
            showClubMembership: true,
            postVisibilityDefault: "PUBLIC"
          }
        }
      },
      include: {
        profile: true,
        settings: true,
        privacy: true
      }
    });

    const tokens = await issueTokens(user);
    return successResponse(res, "Registration successful", { user: serializeUser(user), ...tokens }, 201);
  })
);

router.post(
  "/auth/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { email: req.body.email },
      include: { profile: true, settings: true, privacy: true }
    });

    if (!user) throw new HttpError(401, "Invalid email or password");
    const isValid = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!isValid) throw new HttpError(401, "Invalid email or password");
    if (!user.isActive || user.status === "BANNED") throw new HttpError(403, "This account has been disabled");

    const tokens = await issueTokens(user);
    return successResponse(res, "Login successful", { user: serializeUser(user), ...tokens });
  })
);

router.post(
  "/auth/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user && user.isActive && user.status !== "BANNED") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashedToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        }
      });

      import("../utils/email")
        .then(({ sendPasswordResetEmail }) => sendPasswordResetEmail(user.email, rawToken))
        .catch((err) => {
          // Log but don't fail the request if email util fails to load or send
          import("../lib/logger").then(({ logger }) => logger.error("Email failed:", err));
        });
    }

    // Always return success to prevent timing/enumeration attacks
    return successResponse(res, "If an account with that email exists, we sent a password reset link", {});
  })
);

router.post(
  "/auth/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    // We use SHA-256 for the token hash instead of bcrypt. Bcrypt uses a random salt 
    // for every hash, making it impossible to perform a direct DB lookup by token:
    // `where: { token: hashedToken }`. To use bcrypt, the token link would need to 
    // include the userId (e.g., /reset-password?userId=123&token=abc), which changes 
    // the requested flow. SHA-256 provides synchronous, deterministic hashing which is 
    // perfectly secure for 32-byte high-entropy random hex strings.
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true }
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      throw new HttpError(400, "Invalid or expired password reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() }
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: resetRecord.userId }
      })
    ]);

    return successResponse(res, "Password has been successfully reset", {});
  })
);

router.post(
  "/auth/logout",
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    const refreshToken = req.body.refreshToken;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: hashStoredToken(refreshToken) } });
    }
    return successResponse(res, "Logout successful", {});
  })
);

router.post(
  "/auth/refresh",
  authLimiter,
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: hashStoredToken(req.body.refreshToken),
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          include: { profile: true, settings: true, privacy: true }
        }
      }
    });

    if (!storedToken) throw new HttpError(401, "Refresh token is invalid or expired");
    verifyRefreshToken(req.body.refreshToken);
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    const tokens = await issueTokens(storedToken.user);
    return successResponse(res, "Token refresh successful", {
      user: serializeUser(storedToken.user),
      ...tokens
    });
  })
);

router.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    return successResponse(res, "Current user fetched successfully", {
      user: serializeUser(req.user)
    });
  })
);

export default router;
