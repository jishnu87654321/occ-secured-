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
import { ensureUniqueSlug } from "../utils/slug";
import { HttpError } from "../lib/httpError";
import { getClubAccess } from "../middleware/requireRole";

const router = Router();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const emptyStringToNull = (value: unknown) => {
  if (value === null || value === "null") {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  return value;
};

const stringToBoolean = (value: unknown) => {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
};

const clubSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(2000),
  categoryId: z.preprocess(emptyStringToUndefined, z.string().cuid().nullable().optional()),
  university: z.preprocess(emptyStringToUndefined, z.string().max(120).optional()),
  locationName: z.preprocess(emptyStringToUndefined, z.string().max(180).optional()),
  latitude: z.preprocess(emptyStringToUndefined, z.coerce.number().nullable().optional()),
  longitude: z.preprocess(emptyStringToUndefined, z.coerce.number().nullable().optional()),
  bannerUrl: z.preprocess(emptyStringToNull, z.string().url().nullable().optional()),
  visibility: z.preprocess(emptyStringToUndefined, z.enum(["PUBLIC", "PRIVATE"]).optional()),
  removeLogo: z.preprocess(stringToBoolean, z.boolean().optional()),
  removeBanner: z.preprocess(stringToBoolean, z.boolean().optional())
});

const clubUpdateSchema = clubSchema.partial();
const memberUpdateSchema = z.object({
  membershipRole: z.enum(["OWNER", "ADMIN", "MEMBER"])
});
const joinRequestActionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"])
});
const clubListQuerySchema = z.object({
  categoryId: z.string().cuid().optional(),
  university: z.string().max(120).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional()
});

async function ensureClubOwner(clubId: string, user: NonNullable<Express.Request["user"]>) {
  const access = await getClubAccess(clubId, user.id);
  const isPlatformAdmin = ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(user.role);
  if (!access.isOwner && !isPlatformAdmin) {
    throw new HttpError(403, "Only the club owner can manage this club");
  }
  return access;
}

async function findClubByIdOrSlug(identifier: string) {
  return prisma.club.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }]
    }
  });
}

async function getResolvedClubId(identifier: string) {
  const club = await findClubByIdOrSlug(identifier);
  if (!club) {
    throw new HttpError(404, "Club not found");
  }
  return club.id;
}

async function getClubVisibilityContext(clubIdentifier: string, user: Express.Request["user"] | undefined) {
  const resolvedClubId = await getResolvedClubId(clubIdentifier);
  const club = await prisma.club.findUnique({
    where: { id: resolvedClubId },
    include: user
      ? {
          members: {
            where: { userId: user.id }
          }
        }
      : undefined
  });

  if (!club) {
    throw new HttpError(404, "Club not found");
  }

  const isAdmin = !!user && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isOwner = !!user && club.ownerId === user.id;
  const isMember = !!user && !!(club as any).members?.some((member: any) => member.userId === user.id);

  return { club, isAdmin, isOwner, isMember };
}

router.get(
  "/clubs",
  optionalAuth,
  validate(clubListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = {
      ...(req.query.categoryId ? { categoryId: String(req.query.categoryId) } : {}),
      ...(req.query.university ? { university: { contains: String(req.query.university), mode: "insensitive" as const } } : {}),
      ...(req.query.visibility ? { visibility: req.query.visibility as any } : {}),
      ...(req.query.q
        ? {
            OR: [
              { name: { contains: String(req.query.q), mode: "insensitive" as const } },
              { description: { contains: String(req.query.q), mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [total, clubs] = await Promise.all([
      prisma.club.count({ where }),
      prisma.club.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          category: true,
          owner: { include: { profile: true, settings: true, privacy: true } },
          members: req.user ? { where: { userId: req.user.id } } : undefined,
          joinRequests: req.user ? { where: { userId: req.user.id } } : undefined,
          _count: { select: { members: true, posts: true, joinRequests: true } }
        }
      })
    ]);

    return paginatedResponse(
      res,
      clubs.map((club) => serializeClub(club, req.user?.id || null)),
      page,
      limit,
      total,
      "Clubs fetched successfully"
    );
  })
);

router.post(
  "/clubs",
  requireAuth,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 }
  ]),
  validate(clubSchema),
  asyncHandler(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const slug = await ensureUniqueSlug(prisma.club, req.body.name);
    const logo = files?.logo?.[0];
    const banner = files?.banner?.[0];

    const club = await prisma.club.create({
      data: {
        name: req.body.name,
        slug,
        description: req.body.description,
        categoryId: req.body.categoryId || null,
        university: req.body.university || null,
        locationName: req.body.locationName || null,
        latitude: req.body.latitude ?? null,
        longitude: req.body.longitude ?? null,
        logoUrl: fileToRelativeUrl(logo),
        bannerUrl: fileToRelativeUrl(banner) || req.body.bannerUrl || null,
        visibility: req.body.visibility || "PUBLIC",
        ownerId: req.user!.id,
        members: {
          create: {
            userId: req.user!.id,
            membershipRole: "OWNER"
          }
        }
      },
      include: {
        category: true,
        owner: { include: { profile: true, settings: true, privacy: true } },
        members: { where: { userId: req.user!.id } },
        joinRequests: { where: { userId: req.user!.id } },
        _count: { select: { members: true, posts: true, joinRequests: true } }
      }
    });

    if (req.user!.role === "USER") {
      await prisma.user.update({ where: { id: req.user!.id }, data: { role: "CLUB_ADMIN" } });
    }

    return successResponse(res, "Club created successfully", { club: serializeClub(club, req.user!.id) }, 201);
  })
);

router.get(
  "/clubs/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const club = await prisma.club.findFirst({
      where: {
        OR: [{ id: req.params.id as string }, { slug: req.params.id as string }]
      },
      include: {
        category: true,
        owner: { include: { profile: true, settings: true, privacy: true } },
        members: req.user ? { where: { userId: req.user.id } } : undefined,
        joinRequests: req.user ? { where: { userId: req.user.id } } : undefined,
        _count: { select: { members: true, posts: true, joinRequests: true } }
      }
    });

    if (!club) throw new HttpError(404, "Club not found");
    return successResponse(res, "Club fetched successfully", { club: serializeClub(club, req.user?.id || null) });
  })
);

router.patch(
  "/clubs/:id",
  requireAuth,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 }
  ]),
  validate(clubUpdateSchema),
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    await ensureClubOwner(resolvedClubId, req.user!);
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const club = await prisma.club.update({
      where: { id: resolvedClubId },
      data: {
        name: req.body.name,
        description: req.body.description,
        categoryId: req.body.categoryId,
        university: req.body.university,
        locationName: req.body.locationName,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        visibility: req.body.visibility,
        logoUrl: req.body.removeLogo ? null : fileToRelativeUrl(files?.logo?.[0]) || undefined,
        bannerUrl: req.body.removeBanner
          ? null
          : fileToRelativeUrl(files?.banner?.[0]) || req.body.bannerUrl || undefined
      },
      include: {
        category: true,
        owner: { include: { profile: true, settings: true, privacy: true } },
        members: { where: { userId: req.user!.id } },
        joinRequests: { where: { userId: req.user!.id } },
        _count: { select: { members: true, posts: true, joinRequests: true } }
      }
    });

    return successResponse(res, "Club updated successfully", { club: serializeClub(club, req.user!.id) });
  })
);

router.delete(
  "/clubs/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    await ensureClubOwner(resolvedClubId, req.user!);
    await prisma.club.delete({ where: { id: resolvedClubId } });
    return successResponse(res, "Club deleted successfully", {});
  })
);

router.post(
  "/clubs/:id/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    const club = await prisma.club.findUnique({ where: { id: resolvedClubId } });
    if (!club) throw new HttpError(404, "Club not found");
    if (club.visibility !== "PUBLIC") throw new HttpError(400, "This club requires an approval request");
    if (club.ownerId === req.user!.id) {
      throw new HttpError(400, "You already own this club");
    }

    const membership = await prisma.clubMember.upsert({
      where: { clubId_userId: { clubId: resolvedClubId, userId: req.user!.id } },
      create: { clubId: resolvedClubId, userId: req.user!.id, membershipRole: "MEMBER" },
      update: {}
    });

    await prisma.clubJoinRequest.deleteMany({ where: { clubId: resolvedClubId, userId: req.user!.id } });
    return successResponse(res, "Club joined successfully", { membership });
  })
);

router.post(
  "/clubs/:id/request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    const club = await prisma.club.findUnique({ where: { id: resolvedClubId } });
    if (!club) throw new HttpError(404, "Club not found");
    if (club.visibility === "PUBLIC") throw new HttpError(400, "Public clubs can be joined directly");
    if (club.ownerId === req.user!.id) {
      throw new HttpError(400, "You already own this club");
    }

    const joinRequest = await prisma.clubJoinRequest.upsert({
      where: { clubId_userId: { clubId: resolvedClubId, userId: req.user!.id } },
      create: { clubId: resolvedClubId, userId: req.user!.id, status: "PENDING" },
      update: { status: "PENDING" }
    });

    return successResponse(res, "Join request submitted successfully", { joinRequest }, 201);
  })
);

router.get(
  "/clubs/:id/members",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    const members = await prisma.clubMember.findMany({
      where: { clubId: resolvedClubId },
      include: {
        user: { include: { profile: true, settings: true, privacy: true } }
      },
      orderBy: { joinedAt: "asc" }
    });

    const { club, isAdmin, isOwner, isMember } = await getClubVisibilityContext(resolvedClubId, req.user);
    if (club.visibility === "PRIVATE" && !isAdmin && !isOwner && !isMember) {
      throw new HttpError(403, "You do not have permission to view this member list");
    }

    return successResponse(res, "Club members fetched successfully", {
      items: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        membershipRole: member.membershipRole,
        joinedAt: member.joinedAt,
        user: serializeUser(member.user, "public")
      }))
    });
  })
);

router.patch(
  "/clubs/:id/members/:memberId",
  requireAuth,
  validate(memberUpdateSchema),
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    await ensureClubOwner(resolvedClubId, req.user!);
    const member = await prisma.clubMember.findFirst({
      where: {
        clubId: resolvedClubId,
        OR: [{ id: req.params.memberId }, { userId: req.params.memberId }]
      }
    });
    if (!member) throw new HttpError(404, "Club member not found");

    const updated = await prisma.clubMember.update({
      where: { id: member.id },
      data: { membershipRole: req.body.membershipRole }
    });

    return successResponse(res, "Club member updated successfully", { member: updated });
  })
);

router.delete(
  "/clubs/:id/members/:memberId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const isSelf = req.params.memberId === req.user!.id;
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    const club = await prisma.club.findUnique({ where: { id: resolvedClubId } });
    if (!club) throw new HttpError(404, "Club not found");
    if (club.ownerId === req.user!.id && isSelf) {
      throw new HttpError(400, "Club owners cannot leave their own club");
    }
    if (!isSelf) {
      await ensureClubOwner(resolvedClubId, req.user!);
    }

    const member = await prisma.clubMember.findFirst({
      where: {
        clubId: resolvedClubId,
        OR: [{ id: req.params.memberId }, { userId: req.params.memberId }]
      }
    });
    if (!member) throw new HttpError(404, "Club member not found");
    await prisma.clubMember.delete({ where: { id: member.id } });
    return successResponse(res, "Club member removed successfully", {});
  })
);

router.get(
  "/clubs/:id/posts",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    const { club, isAdmin, isOwner, isMember } = await getClubVisibilityContext(resolvedClubId, req.user);
    if (club.visibility === "PRIVATE" && !isAdmin && !isOwner && !isMember) {
      throw new HttpError(403, "You do not have permission to view this club's posts");
    }

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const where = {
      clubId: resolvedClubId,
      deletedAt: null,
      moderationStatus: "PUBLISHED" as const,
      ...(!isAdmin && !isOwner && !isMember ? { visibility: "PUBLIC" as const } : {})
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
      "Club posts fetched successfully"
    );
  })
);

router.get(
  "/clubs/:id/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    await ensureClubOwner(resolvedClubId, req.user!);
    const requests = await prisma.clubJoinRequest.findMany({
      where: { clubId: resolvedClubId },
      include: {
        user: { include: { profile: true, settings: true, privacy: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return successResponse(res, "Club join requests fetched successfully", {
      items: requests.map((request) => ({
        id: request.id,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        user: serializeUser(request.user)
      }))
    });
  })
);

router.patch(
  "/clubs/:id/requests/:requestId",
  requireAuth,
  validate(joinRequestActionSchema),
  asyncHandler(async (req, res) => {
    const resolvedClubId = await getResolvedClubId(req.params.id as string);
    await ensureClubOwner(resolvedClubId, req.user!);
    const request = await prisma.clubJoinRequest.findFirst({
      where: { id: req.params.requestId, clubId: resolvedClubId }
    });
    if (!request) throw new HttpError(404, "Join request not found");

    const updated = await prisma.clubJoinRequest.update({
      where: { id: request.id },
      data: { status: req.body.status }
    });

    if (req.body.status === "APPROVED") {
      await prisma.clubMember.upsert({
        where: { clubId_userId: { clubId: resolvedClubId, userId: request.userId } },
        create: { clubId: resolvedClubId, userId: request.userId, membershipRole: "MEMBER" },
        update: {}
      });
    }

    return successResponse(res, "Join request updated successfully", { request: updated });
  })
);

export default router;
