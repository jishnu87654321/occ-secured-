import fs from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { prisma } from "./lib/prisma";
import { env } from "./config/env";
import { corsOptions } from "./config/cors";
import { uploadDir } from "./config/upload";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import postRoutes from "./routes/posts";
import clubRoutes from "./routes/clubs";
import settingsRoutes from "./routes/settings";
import adminRoutes from "./routes/admin";
import uploadRoutes from "./routes/uploads";
import searchRoutes from "./routes/search";

fs.mkdirSync(uploadDir, { recursive: true });

export const app = express();
app.disable("x-powered-by");
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), env.uploadDir), {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  })
);

function healthPayload() {
  return {
    success: true,
    message: "Health check successful",
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  };
}

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "OCC backend is running",
    data: {
      service: "occ-backend",
      docsHint: "Use /api or /api/v1 endpoints for application requests",
      health: "/health"
    }
  });
});

app.head("/", (_req, res) => {
  res.status(200).end();
});

app.get("/health", (_req, res) => {
  res.json(healthPayload());
});

app.get("/api/health", (_req, res) => {
  res.json(healthPayload());
});

app.get("/api/v1/health", (_req, res) => {
  res.json(healthPayload());
});

app.get("/ready", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: "Readiness check successful",
      data: {
        status: "ready",
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ready", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: "Readiness check successful",
      data: {
        status: "ready",
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/ready", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: "Readiness check successful",
      data: {
        status: "ready",
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1", authRoutes);
app.use("/api/v1", userRoutes);
app.use("/api/v1", postRoutes);
app.use("/api/v1", clubRoutes);
app.use("/api/v1", settingsRoutes);
app.use("/api/v1", uploadRoutes);
app.use("/api/v1", searchRoutes);
app.use("/api/v1", adminRoutes);

app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", postRoutes);
app.use("/api", clubRoutes);
app.use("/api", settingsRoutes);
app.use("/api", uploadRoutes);
app.use("/api", searchRoutes);
app.use("/api", adminRoutes);

app.use(notFound);
app.use(errorHandler);
