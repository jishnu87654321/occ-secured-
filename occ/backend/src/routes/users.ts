// @ts-nocheck
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { successResponse, paginatedResponse } from "../utils/response";
import { parsePagination } from "../utils/pagination";
import { serializeClub, serializePost, serializeUser } from "../utils/serializers";
import { upload } from "../config/upload";
import { fileToRelativeUrl } from "../utils/fileUrl";

const router = Router();

const updateMeSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
  university: z.string().max(120).nullable().optional(),
  phoneNumber: z.string().regex(/^[+]?[\d\s\-()]{10,30}$/).max(30).nullable().optional(),
  hobbies: z.string().max(240).nullable().optional(),
  coverUrl: z.string().url().nullable().optional()
});

router.get(
  "/users/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const memberships = await prisma.clubMember.findMany({
      where: { userId: req.user!.id },
      include: {
        club: {
          include: {
            category: true,
            owner: { include: { profile: true, settings: true, privacy: true } },
            _count: { select: { members: true, posts: true, joinRequests: true } },
            members: { where: { userId: req.user!.id } }
          }
        }
      }
    });

    return successResponse(res, "Current user profile fetched successfully", {
      user: serializeUser(req.user),
      memberships: memberships.map((membership) => ({
        id: membership.id,
        membershipRole: membership.membershipRole,
        joinedAt: membership.joinedAt,
        club: serializeClub(membership.club, req.user!.id)
      }))
    });
  })
);

router.patch(
  "/users/me",
  requireAuth,
  upload.single("avatar"),
  validate(updateMeSchema),
  asyncHandler(async (req, res) => {
    const avatarUrl = fileToRelativeUrl(req.file || undefined);
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        profile: {
          update: {
            displayName: req.body.displayName,
            bio: req.body.bio,
            university: req.body.university,
            phoneNumber: req.body.phoneNumber,
            hobbies: req.body.hobbies,
            coverUrl: req.body.coverUrl,
            ...(avatarUrl ? { avatarUrl } : {})
          }
        }
      },
      include: {
        profile: true,
        settings: true,
        privacy: true
      }
    });

    return successResponse(res, "Profile updated successfully", { user: serializeUser(updated) });
  })
);

router.get(
  "/users/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      include: {
        profile: true,
        settings: true,
        privacy: true,
        memberships: {
          include: {
            club: {
              include: {
                category: true,
                owner: { include: { profile: true, settings: true, privacy: true } },
                _count: { select: { members: true, posts: true, joinRequests: true } }
              }
            }
          }
        },
        _count: {
          select: {
            posts: true,
            memberships: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found", errors: [] });
    }

    const isSelf = req.user?.id === user.id;
    const isAdmin = !!req.user && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(req.user.role);
    if (!isSelf && !isAdmin && user.privacy?.profileVisibility === "PRIVATE") {
      return res.status(403).json({ success: false, message: "This profile is private", errors: [] });
    }

    return successResponse(res, "Public user profile fetched successfully", {
      user: serializeUser(user as any, isSelf || isAdmin ? "private" : "public"),
      memberships:
        user.privacy?.showClubMembership === false
          ? []
          : user.memberships.map((membership: any) => ({
              id: membership.id,
              membershipRole: membership.membershipRole,
              joinedAt: membership.joinedAt,
              club: serializeClub(membership.club, req.user?.id || null)
            })),
      stats: {
        postCount: (user as any)._count.posts,
        membershipCount: (user as any)._count.memberships
      }
    });
  })
);

router.get(
  "/users/:id/posts",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = {
      authorId: req.params.id as string,
      deletedAt: null,
      moderationStatus: "PUBLISHED" as const,
      ...(req.user?.id === req.params.id as string || ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(req.user?.role || "USER")
        ? {}
        : {
            OR: [{ clubId: null, visibility: "PUBLIC" as const }, { visibility: "PUBLIC" as const, club: { is: { visibility: "PUBLIC" as const } } }]
          })
    };

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { include: { profile: true, settings: true, privacy: true } },
          club: {
            include: {
              category: true,
              owner: { include: { profile: true, settings: true, privacy: true } },
              members: req.user ? { where: { userId: req.user.id } } : undefined,
              _count: { select: { members: true, posts: true, joinRequests: true } }
            }
          },
          likes: req.user ? { where: { userId: req.user.id } } : undefined,
          _count: { select: { likes: true, comments: true, shares: true } }
        }
      })
    ]);

    return paginatedResponse(
      res,
      posts.map((post) => serializePost(post, req.user?.id || null)),
      page,
      limit,
      total,
      "User posts fetched successfully"
    );
  })
);

export default router;
