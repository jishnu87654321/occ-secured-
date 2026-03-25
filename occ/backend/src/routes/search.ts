import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { optionalAuth } from "../middleware/auth";
import { parsePagination } from "../utils/pagination";
import { successResponse, paginatedResponse } from "../utils/response";
import { serializeClub, serializePost, serializeUser } from "../utils/serializers";
import { validate } from "../middleware/validate";

const router = Router();

const exploreQuerySchema = z.object({
  categorySlug: z.string().max(120).optional(),
  university: z.string().max(120).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional()
});

const searchQuerySchema = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().optional()
});

function buildVisibleClubWhere(user: Express.Request["user"] | undefined) {
  if (user && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return {};
  }

  return {
    isActive: true,
    approvalStatus: "APPROVED" as const
  };
}

function buildVisiblePostWhere(user: Express.Request["user"] | undefined) {
  if (user && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return {};
  }

  if (!user) {
    return {
      OR: [
        { clubId: null, visibility: "PUBLIC" as const },
        {
          visibility: "PUBLIC" as const,
          club: { is: { visibility: "PUBLIC" as const, isActive: true, approvalStatus: "APPROVED" as const } }
        }
      ]
    };
  }

  return {
    OR: [
      { authorId: user.id },
      { club: { is: { ownerId: user.id } } },
      { club: { is: { members: { some: { userId: user.id } } } } },
      { clubId: null, visibility: "PUBLIC" as const },
      {
        visibility: "PUBLIC" as const,
        club: { is: { visibility: "PUBLIC" as const, isActive: true, approvalStatus: "APPROVED" as const } }
      }
    ]
  };
}

router.get(
  "/explore",
  optionalAuth,
  validate(exploreQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = {
      ...buildVisibleClubWhere(req.user),
      ...(req.query.categorySlug
        ? { category: { is: { slug: String(req.query.categorySlug) } } }
        : {}),
      ...(req.query.university ? { university: { contains: String(req.query.university), mode: "insensitive" as const } } : {}),
      ...(req.query.visibility ? { visibility: req.query.visibility as any } : {})
    };

    const [total, clubs, categories, recentPosts] = await Promise.all([
      prisma.club.count({ where }),
      prisma.club.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          category: true,
          owner: { include: { profile: true } },
          members: req.user ? { where: { userId: req.user.id } } : undefined,
          _count: { select: { members: true, posts: true, joinRequests: true } }
        }
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.post.findMany({
        where: { deletedAt: null, moderationStatus: "PUBLISHED", ...buildVisiblePostWhere(req.user) },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          author: { include: { profile: true } },
          club: {
            include: {
              category: true,
              owner: { include: { profile: true } },
              members: req.user ? { where: { userId: req.user.id } } : undefined,
              _count: { select: { members: true, posts: true, joinRequests: true } }
            }
          },
          likes: req.user ? { where: { userId: req.user.id } } : undefined,
          _count: { select: { likes: true, comments: true, shares: true } }
        }
      })
    ]);

    return res.json({
      success: true,
      message: "Explore data fetched successfully",
      data: {
        items: clubs.map((club) => serializeClub(club, req.user?.id || null)),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        categories,
        featuredPosts: recentPosts.map((post) => serializePost(post, req.user?.id || null))
      }
    });
  })
);

router.get(
  "/search",
  optionalAuth,
  validate(searchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 20);
    if (!query) {
      return successResponse(res, "Search results fetched successfully", { clubs: [], users: [], posts: [] });
    }

    const [clubs, users, posts] = await Promise.all([
      prisma.club.findMany({
        where: {
          ...buildVisibleClubWhere(req.user),
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { university: { contains: query, mode: "insensitive" } }
          ]
        },
        take: limit,
        include: {
          category: true,
          owner: { include: { profile: true } },
          members: req.user ? { where: { userId: req.user.id } } : undefined,
          _count: { select: { members: true, posts: true, joinRequests: true } }
        }
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          status: { not: "BANNED" as const },
          ...(!(req.user && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(req.user.role))
            ? { privacy: { is: { profileVisibility: "PUBLIC" as const } } }
            : {}),
          OR: [
            { profile: { is: { displayName: { contains: query, mode: "insensitive" } } } },
            { profile: { is: { university: { contains: query, mode: "insensitive" } } } }
          ]
        },
        take: limit,
        include: { profile: true, settings: true, privacy: true }
      }),
      prisma.post.findMany({
        where: {
          AND: [
            { deletedAt: null, moderationStatus: "PUBLISHED" },
            buildVisiblePostWhere(req.user),
            {
              OR: [
                { content: { contains: query, mode: "insensitive" } },
                { author: { is: { profile: { is: { displayName: { contains: query, mode: "insensitive" } } } } } }
              ]
            }
          ]
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { include: { profile: true } },
          club: {
            include: {
              category: true,
              owner: { include: { profile: true } },
              members: req.user ? { where: { userId: req.user.id } } : undefined,
              _count: { select: { members: true, posts: true, joinRequests: true } }
            }
          },
          likes: req.user ? { where: { userId: req.user.id } } : undefined,
          _count: { select: { likes: true, comments: true, shares: true } }
        }
      })
    ]);

    return successResponse(res, "Search results fetched successfully", {
      clubs: clubs.map((club) => serializeClub(club, req.user?.id || null)),
      users: users.map((user) => serializeUser(user, "public")),
      posts: posts.map((post) => serializePost(post, req.user?.id || null))
    });
  })
);

export default router;
