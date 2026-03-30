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
import { serializeClub, serializeGigApplication, serializeGigProtected, serializeGigPublic, serializePost, serializeUser } from "../utils/serializers";
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
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  bannerUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().optional()
});

const adminClubUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().min(2).max(2000).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  university: z.string().max(120).nullable().optional(),
  locationName: z.string().max(180).nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional()
});

const clubApprovalStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  rejectionReason: z.string().max(500).optional().nullable()
});

const clubApprovalStatusFilterSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional()
});

const adminGigSchema = z.object({
  title: z.string().min(2).max(160),
  shortDescription: z.string().min(10).max(400),
  fullDescription: z.string().min(20).max(4000),
  category: z.string().min(2).max(120),
  pricing: z.string().max(1200).optional().nullable(),
  instructions: z.string().max(4000).optional().nullable(),
  requirements: z.string().max(4000).optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional()
});

const adminGigUpdateSchema = adminGigSchema.partial();

const applicationStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PENDING"])
});

const applicationStatusFilterSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional()
});

const reportSchema = z.object({
  status: z.enum(["PENDING", "IN_REVIEW", "RESOLVED", "DISMISSED"])
});

const moderationSchema = z.object({
  moderationStatus: z.enum(["PUBLISHED", "PENDING", "REJECTED", "REMOVED"])
});

function buildAdminUserWhere(query: any = {}) {
  const clauses = [];
  const q = String(query.q || "").trim();
  const role = String(query.role || "").trim();
  const status = String(query.status || "").trim();

  if (q) {
    clauses.push({
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { profile: { is: { displayName: { contains: q, mode: "insensitive" } } } },
        { profile: { is: { university: { contains: q, mode: "insensitive" } } } }
      ]
    });
  }

  if (role && role !== "ALL") {
    clauses.push({ role });
  }

  if (status && status !== "ALL") {
    clauses.push({ status });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

function serializeAdminUserRecord(user: any) {
  const joinedClubs = (user.memberships || [])
    .filter((membership: any) => membership.club)
    .map((membership: any) => ({
      id: membership.club.id,
      name: membership.club.name,
      slug: membership.club.slug,
      membershipRole: membership.membershipRole,
      joinedAt: membership.joinedAt
    }));

  const ownedClubs = (user.clubsOwned || []).map((club: any) => ({
    id: club.id,
    name: club.name,
    slug: club.slug,
    approvalStatus: club.approvalStatus,
    visibility: club.visibility,
    isActive: club.isActive
  }));

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: user.profile
      ? {
          id: user.profile.id,
          displayName: user.profile.displayName,
          username: user.profile.displayName,
          university: user.profile.university,
          phoneNumber: user.profile.phoneNumber,
          hobbies: user.profile.hobbies,
          bio: user.profile.bio,
          avatarUrl: user.profile.avatarUrl,
          coverUrl: user.profile.coverUrl
        }
      : null,
    membershipCount: user._count?.memberships ?? joinedClubs.length,
    ownedClubsCount: user._count?.clubsOwned ?? ownedClubs.length,
    postsCount: user._count?.posts ?? 0,
    gigApplicationsCount: user._count?.gigApplications ?? 0,
    joinedClubs,
    ownedClubs
  };
}

router.use(requireAuth, requireAdmin);

const adminClubInclude = {
  category: true,
  owner: {
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: true,
      profile: true,
      privacy: true,
    }
  },
  reviewedByAdmin: {
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: true,
      profile: true,
      privacy: true,
    }
  },
  _count: { select: { members: true, posts: true, joinRequests: true } }
} as const;

const adminGigApplicationInclude = {
  gig: true,
  user: {
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          id: true,
          displayName: true,
          bio: true,
          university: true,
          phoneNumber: true,
          hobbies: true,
          avatarUrl: true,
          coverUrl: true,
          createdAt: true,
          updatedAt: true,
        }
      }
    }
  },
  reviewedByAdmin: {
    select: {
      id: true,
      email: true,
      role: true,
      profile: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        }
      }
    }
  }
} as const;

async function ensureManageableUserTarget(actor: NonNullable<Express.Request["user"]>, targetUserId: string) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { profile: true }
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
    const [usersCount, clubsCount, gigsCount, applicationsCount, postsCount, reportsCount, pendingReportsCount, pendingClubsCount] = await Promise.all([
      prisma.user.count(),
      prisma.club.count(),
      prisma.gig.count(),
      prisma.gigApplication.count(),
      prisma.post.count({ where: { deletedAt: null } }),
      prisma.report.count(),
      prisma.report.count({ where: { status: "PENDING" } }),
      prisma.club.count({ where: { approvalStatus: "PENDING" } })
    ]);

    return successResponse(res, "Admin dashboard fetched successfully", {
      stats: { usersCount, clubsCount, gigsCount, applicationsCount, postsCount, reportsCount, pendingReportsCount, pendingClubsCount }
    });
  })
);

router.get(
  "/occ-gate-842/users",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = buildAdminUserWhere(req.query);

    const [total, users, activeUsers, adminUsers, membersWithClubs] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          profile: true,
          memberships: {
            orderBy: { joinedAt: "desc" },
            take: 5,
            include: {
              club: {
                select: {
                  id: true,
                  name: true,
                  slug: true
                }
              }
            }
          },
          clubsOwned: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              name: true,
              slug: true,
              approvalStatus: true,
              visibility: true,
              isActive: true
            }
          },
          _count: {
            select: {
              memberships: true,
              clubsOwned: true,
              posts: true,
              gigApplications: true
            }
          }
        }
      }),
      prisma.user.count({ where: { ...where, isActive: true, status: "ACTIVE" } }),
      prisma.user.count({ where: { ...where, role: { in: ["PLATFORM_ADMIN", "SUPER_ADMIN"] } } }),
      prisma.user.count({ where: { ...where, memberships: { some: {} } } })
    ]);

    return successResponse(res, "Admin users fetched successfully", {
      items: users.map((user) => serializeAdminUserRecord(user)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalUsers: total,
        activeUsers,
        adminUsers,
        membersWithClubs
      }
    });
  })
);

router.get(
  "/occ-gate-842/users/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      include: {
        profile: true,
        memberships: {
          orderBy: { joinedAt: "desc" },
          include: {
            club: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        },
        clubsOwned: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            slug: true,
            approvalStatus: true,
            visibility: true,
            isActive: true
          }
        },
        _count: {
          select: {
            memberships: true,
            clubsOwned: true,
            posts: true,
            gigApplications: true
          }
        }
      }
    });
    if (!user) throw new HttpError(404, "User not found");
    return successResponse(res, "Admin user fetched successfully", { user: serializeAdminUserRecord(user) });
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
      include: { profile: true }
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
      include: { profile: true }
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
      include: { profile: true }
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
          owner: { include: { profile: true } },
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
        visibility: req.body.visibility || "PUBLIC",
        approvalStatus: "APPROVED",
        isActive: req.body.isActive ?? true,
        reviewedAt: new Date(),
        reviewedByAdminId: req.user!.id
      },
      include: {
        category: true,
        owner: { include: { profile: true } },
        _count: { select: { members: true, posts: true, joinRequests: true } }
      }
    });
    await prisma.clubMember.upsert({
      where: {
        clubId_userId: {
          clubId: club.id,
          userId: owner.id
        }
      },
      update: {
        membershipRole: "OWNER"
      },
      create: {
        clubId: club.id,
        userId: owner.id,
        membershipRole: "OWNER"
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
        owner: { include: { profile: true } },
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
    await prisma.club.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    await logAdminAction(req.user!.id, "CLUB_DEACTIVATED", "CLUB", req.params.id, {});
    return successResponse(res, "Admin club deactivated successfully", {});
  })
);

router.get(
  "/admin/clubs",
  validate(clubApprovalStatusFilterSchema, "query"),
  asyncHandler(async (req, res) => {
    const where = req.query.status ? { approvalStatus: req.query.status as any } : {};
    const [clubs, groupedCounts] = await Promise.all([
      prisma.club.findMany({
        where,
        orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
        include: adminClubInclude
      }),
      prisma.club.groupBy({
        by: ["approvalStatus"],
        _count: { _all: true }
      })
    ]);

    const summary = groupedCounts.reduce(
      (acc, item) => {
        const key = item.approvalStatus.toLowerCase() as "pending" | "approved" | "rejected";
        acc[key] = item._count._all;
        acc.total += item._count._all;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      }
    );

    return successResponse(res, "Admin clubs fetched successfully", {
      summary,
      items: clubs.map((club) => serializeClub(club, req.user!.id))
    });
  })
);

router.post(
  "/admin/clubs",
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
        visibility: req.body.visibility || "PUBLIC",
        bannerUrl: req.body.bannerUrl || null,
        approvalStatus: "APPROVED",
        isActive: req.body.isActive ?? true,
        reviewedAt: new Date(),
        reviewedByAdminId: req.user!.id
      },
      include: {
        ...adminClubInclude
      }
    });
    await prisma.clubMember.upsert({
      where: {
        clubId_userId: {
          clubId: club.id,
          userId: owner.id
        }
      },
      update: {
        membershipRole: "OWNER"
      },
      create: {
        clubId: club.id,
        userId: owner.id,
        membershipRole: "OWNER"
      }
    });
    await logAdminAction(req.user!.id, "CLUB_CREATED", "CLUB", club.id, req.body);
    return successResponse(res, "Admin club created successfully", { club: serializeClub(club, req.user!.id) }, 201);
  })
);

router.put(
  "/admin/clubs/:id",
  validate(adminClubUpdateSchema),
  asyncHandler(async (req, res) => {
    const club = await prisma.club.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        ...adminClubInclude
      }
    });
    await logAdminAction(req.user!.id, "CLUB_UPDATED", "CLUB", club.id, req.body);
    return successResponse(res, "Admin club updated successfully", { club: serializeClub(club, req.user!.id) });
  })
);

router.patch(
  "/admin/clubs/:id/status",
  validate(clubApprovalStatusSchema),
  asyncHandler(async (req, res) => {
    const currentClub = await prisma.club.findUnique({
      where: { id: req.params.id },
      include: {
        ...adminClubInclude
      }
    });

    if (!currentClub) {
      throw new HttpError(404, "Club not found");
    }

    const nextStatus = req.body.status;
    const updatedClub = await prisma.club.update({
      where: { id: req.params.id },
      data: {
        approvalStatus: nextStatus,
        isActive: nextStatus === "APPROVED",
        reviewedAt: new Date(),
        reviewedByAdminId: req.user!.id,
        rejectionReason: nextStatus === "REJECTED" ? req.body.rejectionReason || null : null,
      },
      include: {
        ...adminClubInclude
      }
    });

    if (nextStatus === "APPROVED") {
      const owner = await prisma.user.findUnique({ where: { id: updatedClub.ownerId } });
      if (owner?.role === "USER") {
        await prisma.user.update({
          where: { id: updatedClub.ownerId },
          data: { role: "CLUB_ADMIN" }
        });
      }
    }

    await logAdminAction(req.user!.id, "CLUB_STATUS_UPDATED", "CLUB", updatedClub.id, {
      previousStatus: currentClub.approvalStatus,
      status: nextStatus,
      rejectionReason: req.body.rejectionReason || null
    });

    return successResponse(res, "Club status updated successfully", {
      club: serializeClub(updatedClub, req.user!.id)
    });
  })
);

router.delete(
  "/admin/clubs/:id",
  asyncHandler(async (req, res) => {
    await prisma.club.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    await logAdminAction(req.user!.id, "CLUB_DEACTIVATED", "CLUB", req.params.id, {});
    return successResponse(res, "Club deactivated successfully", {});
  })
);

router.delete(
  "/admin/clubs/:id/permanent",
  asyncHandler(async (req, res) => {
    const existingClub = await prisma.club.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true }
    });

    if (!existingClub) {
      throw new HttpError(404, "Club not found");
    }

    await prisma.club.delete({ where: { id: req.params.id } });
    await logAdminAction(req.user!.id, "CLUB_DELETED", "CLUB", req.params.id, {
      name: existingClub.name
    });
    return successResponse(res, "Club deleted permanently successfully", {});
  })
);

router.get(
  "/admin/gigs",
  asyncHandler(async (_req, res) => {
    const gigs = await prisma.gig.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { applications: true } }
      }
    });

    return successResponse(res, "Admin gigs fetched successfully", {
      items: gigs.map((gig) => serializeGigProtected(gig))
    });
  })
);

router.post(
  "/admin/gigs",
  validate(adminGigSchema),
  asyncHandler(async (req, res) => {
    const slug = await ensureUniqueSlug(prisma.gig, req.body.title);
    const gig = await prisma.gig.create({
      data: {
        title: req.body.title,
        slug,
        shortDescription: req.body.shortDescription,
        fullDescription: req.body.fullDescription,
        category: req.body.category,
        pricing: req.body.pricing || null,
        instructions: req.body.instructions || null,
        requirements: req.body.requirements || null,
        bannerUrl: req.body.bannerUrl || null,
        isActive: req.body.isActive ?? true,
        isPublic: req.body.isPublic ?? true
      },
      include: {
        _count: { select: { applications: true } }
      }
    });
    await logAdminAction(req.user!.id, "GIG_CREATED", "GIG", gig.id, req.body);
    return successResponse(res, "Gig created successfully", { gig: serializeGigProtected(gig) }, 201);
  })
);

router.put(
  "/admin/gigs/:id",
  validate(adminGigUpdateSchema),
  asyncHandler(async (req, res) => {
    const data = { ...req.body };
    if (req.body.title) {
      data.slug = await ensureUniqueSlug(prisma.gig, req.body.title);
    }

    const gig = await prisma.gig.update({
      where: { id: req.params.id },
      data,
      include: {
        _count: { select: { applications: true } }
      }
    });
    await logAdminAction(req.user!.id, "GIG_UPDATED", "GIG", gig.id, req.body);
    return successResponse(res, "Gig updated successfully", { gig: serializeGigProtected(gig) });
  })
);

router.delete(
  "/admin/gigs/:id",
  asyncHandler(async (req, res) => {
    await prisma.gig.delete({ where: { id: req.params.id } });
    await logAdminAction(req.user!.id, "GIG_DELETED", "GIG", req.params.id, {});
    return successResponse(res, "Gig deleted successfully", {});
  })
);

router.get(
  "/admin/applications",
  validate(applicationStatusFilterSchema, "query"),
  asyncHandler(async (req, res) => {
    const where = req.query.status ? { status: req.query.status as any } : {};
    const [applications, groupedCounts] = await Promise.all([
      prisma.gigApplication.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: adminGigApplicationInclude
      }),
      prisma.gigApplication.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
    ]);

    const summary = groupedCounts.reduce(
      (acc, item) => {
        const key = item.status.toLowerCase() as "pending" | "approved" | "rejected";
        acc[key] = item._count._all;
        acc.total += item._count._all;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      }
    );

    return successResponse(res, "Applications fetched successfully", {
      summary,
      items: applications.map((application) =>
        serializeGigApplication(application, {
          includeProtectedGig: true,
          includeUser: true,
          includeReviewedByAdmin: true
        })
      )
    });
  })
);

router.get(
  "/admin/gigs/:id/applications",
  asyncHandler(async (req, res) => {
    const applications = await prisma.gigApplication.findMany({
      where: { gigId: req.params.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: adminGigApplicationInclude
    });

    return successResponse(res, "Gig applications fetched successfully", {
      items: applications.map((application) =>
        serializeGigApplication(application, {
          includeProtectedGig: true,
          includeUser: true,
          includeReviewedByAdmin: true
        })
      )
    });
  })
);

router.patch(
  "/admin/applications/:id/status",
  validate(applicationStatusSchema),
  asyncHandler(async (req, res) => {
    const application = await prisma.gigApplication.update({
      where: { id: req.params.id },
      data: {
        status: req.body.status,
        reviewedByAdminId: req.user!.id,
        reviewedAt: new Date()
      },
      include: {
        gig: true,
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                id: true,
                displayName: true,
                bio: true,
                university: true,
                phoneNumber: true,
                hobbies: true,
                avatarUrl: true,
                coverUrl: true,
                createdAt: true,
                updatedAt: true,
              }
            }
          }
        },
        reviewedByAdmin: {
          select: {
            id: true,
            email: true,
            role: true,
            profile: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                createdAt: true,
                updatedAt: true,
              }
            }
          }
        }
      }
    });

    await logAdminAction(req.user!.id, "APPLICATION_STATUS_UPDATED", "GIG_APPLICATION", application.id, req.body);
    return successResponse(res, "Application status updated successfully", {
      application: serializeGigApplication(application, {
        includeProtectedGig: true,
        includeUser: true,
        includeReviewedByAdmin: true
      })
    });
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
          author: { include: { profile: true } },
          club: {
            include: {
              category: true,
              owner: { include: { profile: true } },
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
        author: { include: { profile: true } },
        club: {
          include: {
            category: true,
            owner: { include: { profile: true } },
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
          reporter: { include: { profile: true } },
          reviewedByAdmin: { include: { profile: true } }
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
        reporter: { include: { profile: true } },
        reviewedByAdmin: { include: { profile: true } }
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
