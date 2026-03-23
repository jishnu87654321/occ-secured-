// @ts-nocheck
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";
import { successResponse, paginatedResponse } from "../utils/response";
import { parsePagination } from "../utils/pagination";
import { serializeClub, serializePost, serializeUser } from "../utils/serializers";
import { ensureUniqueSlug } from "../utils/slug";
import { HttpError } from "../lib/httpError";

const router = Router();

const userPatchSchema = z.object({
  isActive: z.boolean().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "PENDING"]).optional()
});

const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "PENDING"])
});

const userRoleSchema = z.object({
  role: z.enum(["USER", "CLUB_ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN"])
});

const categorySchema = z.object({
  name: z.string().min(2).max(80)
});

const adminClubCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(2000).default(""),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional()
});

const adminClubUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().min(2).max(2000).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  university: z.string().max(120).nullable().optional(),
  locationName: z.string().max(180).nullable().optional()
});

const reportSchema = z.object({
  status: z.enum(["PENDING", "IN_REVIEW", "RESOLVED", "DISMISSED"])
});

const moderationSchema = z.object({
  moderationStatus: z.enum(["PUBLISHED", "PENDING", "REJECTED", "REMOVED"])
});

router.use(requireAuth, requireAdmin);

async function ensureManageableUserTarget(actor: NonNullable<Express.Request["user"]>, targetUserId: string) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { profile: true, settings: true, privacy: true }
  });

  if (!target) {
    throw new HttpError(404, "User not found");
  }

  const actorIsSuperAdmin = actor.role === "SUPER_ADMIN";
  const targetIsPrivileged = ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(target.role);

  if (!actorIsSuperAdmin && targetIsPrivileged) {
    throw new HttpError(403, "Only super admins can manage privileged admin accounts");
  }

  if (target.role === "SUPER_ADMIN" && actor.id !== target.id && !actorIsSuperAdmin) {
    throw new HttpError(403, "Only super admins can manage other super admins");
  }

  return target;
}

async function logAdminAction(adminId: string, actionType: string, targetType: string, targetId: string, metadata: any = {}) {
  await prisma.adminActionLog.create({
    data: { adminId, actionType, targetType, targetId, metadata }
  });
}

router.get(
  "/occ-gate-842/dashboard",
  asyncHandler(async (_req, res) => {
    const [usersCount, clubsCount, postsCount, reportsCount, pendingReportsCount] = await Promise.all([
      prisma.user.count(),
      prisma.club.count(),
      prisma.post.count({ where: { deletedAt: null } }),
      prisma.report.count(),
      prisma.report.count({ where: { status: "PENDING" } })
    ]);

    return successResponse(res, "Admin dashboard fetched successfully", {
      stats: { usersCount, clubsCount, postsCount, reportsCount, pendingReportsCount }
    });
  })
);

router.get(
  "/occ-gate-842/users",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = req.query.q
      ? {
          OR: [
            { email: { contains: String(req.query.q), mode: "insensitive" as const } },
            { profile: { is: { displayName: { contains: String(req.query.q), mode: "insensitive" as const } } } }
          ]
        }
      : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { profile: true, settings: true, privacy: true }
      })
    ]);

    return paginatedResponse(res, users.map(u => serializeUser(u)), page, limit, total, "Admin users fetched successfully");
  })
);

router.get(
  "/occ-gate-842/users/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      include: { profile: true, settings: true, privacy: true }
    });
    if (!user) throw new HttpError(404, "User not found");
    return successResponse(res, "Admin user fetched successfully", { user: serializeUser(user as any) });
  })
);

router.patch(
  "/occ-gate-842/users/:id",
  validate(userPatchSchema),
  asyncHandler(async (req, res) => {
    await ensureManageableUserTarget(req.user!, req.params.id as string);
    // P1 FIX: Explicit allowlist — never spread req.body into Prisma
    const allowedData: any = {};
    if (req.body.isActive !== undefined) allowedData.isActive = req.body.isActive;
    if (req.body.status !== undefined) allowedData.status = req.body.status;

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: allowedData,
      include: { profile: true, settings: true, privacy: true }
    });
    await logAdminAction(req.user!.id, "USER_PATCHED", "USER", user.id, allowedData);
    return successResponse(res, "Admin user updated successfully", { user: serializeUser(user as any) });
  })
);

router.patch(
  "/occ-gate-842/users/:id/status",
  validate(userStatusSchema),
  asyncHandler(async (req, res) => {
    await ensureManageableUserTarget(req.user!, req.params.id);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: req.body.status, isActive: req.body.status === "ACTIVE" },
      include: { profile: true, settings: true, privacy: true }
    });
    await logAdminAction(req.user!.id, "USER_STATUS_UPDATED", "USER", user.id, req.body);
    return successResponse(res, "Admin user status updated successfully", { user: serializeUser(user as any) });
  })
);

router.patch(
  "/occ-gate-842/users/:id/role",
  validate(userRoleSchema),
  asyncHandler(async (req, res) => {
    const target = await ensureManageableUserTarget(req.user!, req.params.id);

    if (req.user!.role !== "SUPER_ADMIN" && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(req.body.role)) {
      throw new HttpError(403, "Only super admins can assign platform-level admin roles");
    }

    if (target.role === "SUPER_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      throw new HttpError(403, "Only super admins can modify super admin roles");
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: req.body.role },
      include: { profile: true, settings: true, privacy: true }
    });
    await logAdminAction(req.user!.id, "USER_ROLE_UPDATED", "USER", user.id, req.body);
    return successResponse(res, "User role updated successfully", { user: serializeUser(user) });
  })
);

router.get(
  "/occ-gate-842/clubs",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const [total, clubs] = await Promise.all([
      prisma.club.count(),
      prisma.club.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          category: true,
          owner: { include: { profile: true, settings: true, privacy: true } },
          _count: { select: { members: true, posts: true, joinRequests: true } }
        }
      })
    ]);
    return paginatedResponse(
      res,
      clubs.map((club) => serializeClub(club, req.user!.id)),
      page,
      limit,
      total,
      "Admin clubs fetched successfully"
    );
  })
);

router.post(
  "/occ-gate-842/clubs",
  validate(adminClubCreateSchema),
  asyncHandler(async (req, res) => {
    const owner = await prisma.user.findFirst({
      where: { role: { in: ["CLUB_ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN"] } }
    });
    if (!owner) throw new HttpError(400, "Create an owner account before creating clubs from admin");

    const slug = await ensureUniqueSlug(prisma.club, String(req.body.name || "club"));
    const club = await prisma.club.create({
      data: {
        name: req.body.name,
        slug,
        description: req.body.description || "",
        ownerId: owner.id,
        visibility: req.body.visibility || "PUBLIC"
      },
      include: {
        category: true,
        owner: { include: { profile: true, settings: true, privacy: true } },
        _count: { select: { members: true, posts: true, joinRequests: true } }
      }
    });
    await logAdminAction(req.user!.id, "CLUB_CREATED", "CLUB", club.id, req.body);
    return successResponse(res, "Admin club created successfully", { club: serializeClub(club, req.user!.id) }, 201);
  })
);

router.patch(
  "/occ-gate-842/clubs/:id",
  validate(adminClubUpdateSchema),
  asyncHandler(async (req, res) => {
    const club = await prisma.club.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        category: true,
        owner: { include: { profile: true, settings: true, privacy: true } },
        _count: { select: { members: true, posts: true, joinRequests: true } }
      }
    });
    await logAdminAction(req.user!.id, "CLUB_UPDATED", "CLUB", club.id, req.body);
    return successResponse(res, "Admin club updated successfully", { club: serializeClub(club, req.user!.id) });
  })
);

router.delete(
  "/occ-gate-842/clubs/:id",
  asyncHandler(async (req, res) => {
    await prisma.club.delete({ where: { id: req.params.id } });
    await logAdminAction(req.user!.id, "CLUB_DELETED", "CLUB", req.params.id, {});
    return successResponse(res, "Admin club deleted successfully", {});
  })
);

router.get(
  "/occ-gate-842/posts",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = {
      ...(req.query.moderationStatus ? { moderationStatus: req.query.moderationStatus as any } : {}),
      deletedAt: null
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
              _count: { select: { members: true, posts: true, joinRequests: true } }
            }
          },
          _count: { select: { likes: true, comments: true, shares: true } }
        }
      })
    ]);
    return paginatedResponse(
      res,
      posts.map((post) => serializePost(post, req.user!.id)),
      page,
      limit,
      total,
      "Admin posts fetched successfully"
    );
  })
);

router.delete(
  "/occ-gate-842/posts/:id",
  asyncHandler(async (req, res) => {
    await prisma.post.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), moderationStatus: "REMOVED" }
    });
    await logAdminAction(req.user!.id, "POST_REMOVED", "POST", req.params.id, {});
    return successResponse(res, "Admin post deleted successfully", {});
  })
);

router.patch(
  "/occ-gate-842/posts/:id/moderation",
  validate(z.object({ moderationStatus: z.enum(["PUBLISHED", "PENDING", "REJECTED", "REMOVED"]) })),
  asyncHandler(async (req, res) => {
    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: { moderationStatus: req.body.moderationStatus },
      include: {
        author: { include: { profile: true, settings: true, privacy: true } },
        club: {
          include: {
            category: true,
            owner: { include: { profile: true, settings: true, privacy: true } },
            _count: { select: { members: true, posts: true, joinRequests: true } }
          }
        },
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });
    await logAdminAction(req.user!.id, "POST_MODERATED", "POST", post.id, req.body);
    return successResponse(res, "Post moderation updated successfully", { post: serializePost(post, req.user!.id) });
  })
);

router.get(
  "/occ-gate-842/reports",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = req.query.status ? { status: req.query.status as any } : {};
    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          post: true,
          reporter: { include: { profile: true, settings: true, privacy: true } },
          reviewedByAdmin: { include: { profile: true, settings: true, privacy: true } }
        }
      })
    ]);
    return paginatedResponse(res, reports, page, limit, total, "Admin reports fetched successfully");
  })
);

router.get(
  "/occ-gate-842/reports/:id",
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        post: true,
        reporter: { include: { profile: true, settings: true, privacy: true } },
        reviewedByAdmin: { include: { profile: true, settings: true, privacy: true } }
      }
    });
    if (!report) throw new HttpError(404, "Report not found");
    return successResponse(res, "Admin report fetched successfully", { report });
  })
);

router.patch(
  "/occ-gate-842/reports/:id",
  validate(reportSchema),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        status: req.body.status,
        reviewedByAdminId: req.user!.id,
        reviewedAt: new Date()
      }
    });
    await logAdminAction(req.user!.id, "REPORT_UPDATED", "REPORT", report.id, req.body);
    return successResponse(res, "Report updated successfully", { report });
  })
);

router.get(
  "/occ-gate-842/categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return successResponse(res, "Categories fetched successfully", { items: categories });
  })
);

router.post(
  "/occ-gate-842/categories",
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.create({
      data: { name: req.body.name, slug: await ensureUniqueSlug(prisma.category, req.body.name) }
    });
    await logAdminAction(req.user!.id, "CATEGORY_CREATED", "CATEGORY", category.id, req.body);
    return successResponse(res, "Category created successfully", { category }, 201);
  })
);

router.patch(
  "/occ-gate-842/categories/:id",
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name: req.body.name, slug: await ensureUniqueSlug(prisma.category, req.body.name) }
    });
    await logAdminAction(req.user!.id, "CATEGORY_UPDATED", "CATEGORY", category.id, req.body);
    return successResponse(res, "Category updated successfully", { category });
  })
);

router.delete(
  "/occ-gate-842/categories/:id",
  asyncHandler(async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } });
    await logAdminAction(req.user!.id, "CATEGORY_DELETED", "CATEGORY", req.params.id, {});
    return successResponse(res, "Category deleted successfully", {});
  })
);

export default router;
