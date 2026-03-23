// @ts-nocheck
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { HttpError } from "../lib/httpError";
import { parsePagination } from "../utils/pagination";
import { successResponse, paginatedResponse } from "../utils/response";
import { serializeComment, serializePost } from "../utils/serializers";
import { upload } from "../config/upload";
import { fileToRelativeUrl } from "../utils/fileUrl";

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

const feedQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  clubId: z.string().cuid().optional(),
  authorId: z.string().cuid().optional(),
  sort: z.enum(["latest", "popular"]).optional(),
  includeClubPosts: z.preprocess(stringToBoolean, z.boolean().optional()),
  includeGeneralPosts: z.preprocess(stringToBoolean, z.boolean().optional())
});

const postSchema = z.object({
  clubId: z.preprocess(emptyStringToNull, z.string().cuid().nullable().optional()),
  content: z.string().min(1).max(5000),
  imageUrl: z.preprocess(emptyStringToNull, z.string().url().nullable().optional()),
  visibility: z.preprocess(emptyStringToUndefined, z.enum(["PUBLIC", "CLUB", "MEMBERS_ONLY"]).optional()),
  removeImage: z.preprocess(stringToBoolean, z.boolean().optional())
});

const postUpdateSchema = postSchema.partial();

const commentSchema = z.object({
  content: z.string().min(1).max(1500),
  parentId: z.string().cuid().nullable().optional()
});

const reportSchema = z.object({
  reason: z.string().min(2).max(120),
  description: z.string().max(1000).optional()
});

function canViewPost(
  post: {
    authorId: string;
    visibility: "PUBLIC" | "CLUB" | "MEMBERS_ONLY";
    club: { ownerId: string; visibility: "PUBLIC" | "PRIVATE"; members?: Array<{ userId: string }> } | null;
  },
  currentUser: Express.Request["user"] | undefined
) {
  if (currentUser && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(currentUser.role)) {
    return true;
  }

  if (currentUser?.id === post.authorId) return true;

  const isClubOwner = post.club?.ownerId === currentUser?.id;
  const isMember = !!currentUser && !!post.club?.members?.some((member) => member.userId === currentUser.id);

  if (isClubOwner || isMember) return true;

  if (post.visibility !== "PUBLIC") return false;
  if (!post.club) return true;

  return post.club.visibility === "PUBLIC";
}

function buildPostVisibilityWhere(currentUser: Express.Request["user"] | undefined) {
  if (currentUser && ["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(currentUser.role)) {
    return {};
  }

  if (!currentUser) {
    return {
      OR: [{ clubId: null, visibility: "PUBLIC" as const }, { visibility: "PUBLIC" as const, club: { is: { visibility: "PUBLIC" as const } } }]
    };
  }

  return {
    OR: [
      { authorId: currentUser.id },
      { club: { is: { ownerId: currentUser.id } } },
      { club: { is: { members: { some: { userId: currentUser.id } } } } },
      { clubId: null, visibility: "PUBLIC" as const },
      { visibility: "PUBLIC" as const, club: { is: { visibility: "PUBLIC" as const } } }
    ]
  };
}

async function getPostOrThrow(postId: string, currentUser?: Express.Request["user"]) {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    include: {
      author: { include: { profile: true, settings: true, privacy: true } },
      club: {
        include: {
          category: true,
          owner: { include: { profile: true, settings: true, privacy: true } },
          members: currentUser ? { where: { userId: currentUser.id } } : undefined,
          _count: { select: { members: true, posts: true, joinRequests: true } }
        }
      },
      likes: currentUser ? { where: { userId: currentUser.id } } : undefined,
      _count: { select: { likes: true, comments: true, shares: true } }
    }
  });

  if (!post) throw new HttpError(404, "Post not found");
  if (!canViewPost(post, currentUser)) {
    throw new HttpError(404, "Post not found");
  }
  return post;
}

router.get(
  "/feed",
  optionalAuth,
  validate(feedQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const sort = req.query.sort === "popular" ? "popular" : "latest";
    const includeClubPosts = req.query.includeClubPosts !== false;
    const includeGeneralPosts = req.query.includeGeneralPosts !== false;
    const postTypeFilter =
      includeClubPosts && includeGeneralPosts
        ? {}
        : includeClubPosts
          ? { clubId: { not: null } }
          : includeGeneralPosts
            ? { clubId: null }
            : { id: "__no_matching_posts__" };
    const where = {
      deletedAt: null,
      moderationStatus: "PUBLISHED" as const,
      ...buildPostVisibilityWhere(req.user),
      ...(req.query.clubId ? { clubId: String(req.query.clubId) } : {}),
      ...(req.query.authorId ? { authorId: String(req.query.authorId) } : {}),
      ...postTypeFilter
    };
    const orderBy =
      sort === "popular"
        ? [
            { likes: { _count: "desc" as const } },
            { comments: { _count: "desc" as const } },
            { shares: { _count: "desc" as const } },
            { createdAt: "desc" as const }
          ]
        : [{ createdAt: "desc" as const }];

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
      "Feed fetched successfully"
    );
  })
);

router.post(
  "/posts",
  requireAuth,
  upload.single("image"),
  validate(postSchema),
  asyncHandler(async (req, res) => {
    const uploadedImageUrl = fileToRelativeUrl(req.file || undefined);
    const imageUrl = uploadedImageUrl || req.body.imageUrl || null;

    if (req.body.clubId) {
      const membership = await prisma.clubMember.findFirst({
        where: { clubId: req.body.clubId, userId: req.user!.id }
      });
      const club = await prisma.club.findUnique({ where: { id: req.body.clubId } });
      if (!club) throw new HttpError(404, "Club not found");
      if (club.ownerId !== req.user!.id && !membership) {
        throw new HttpError(403, "You must be a club member to post in this club");
      }
    }

    const post = await prisma.post.create({
      data: {
        authorId: req.user!.id,
        clubId: req.body.clubId || null,
        content: req.body.content,
        imageUrl,
        visibility: req.body.visibility || req.user?.privacy?.postVisibilityDefault || "PUBLIC",
        moderationStatus: "PUBLISHED"
      },
      include: {
        author: { include: { profile: true, settings: true, privacy: true } },
        club: {
          include: {
            category: true,
            owner: { include: { profile: true, settings: true, privacy: true } },
            members: { where: { userId: req.user!.id } },
            _count: { select: { members: true, posts: true, joinRequests: true } }
          }
        },
        likes: { where: { userId: req.user!.id } },
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });

    return successResponse(res, "Post created successfully", { post: serializePost(post, req.user!.id) }, 201);
  })
);

router.get(
  "/posts/:id",
  optionalAuth,
  asyncHandler(async (req, res) =>
    successResponse(res, "Post fetched successfully", {
      post: serializePost(await getPostOrThrow(req.params.id as string, req.user), req.user?.id || null)
    })
  )
);

router.patch(
  "/posts/:id",
  requireAuth,
  upload.single("image"),
  validate(postUpdateSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.post.findUnique({ where: { id: req.params.id as string } });
    if (!existing || existing.deletedAt) throw new HttpError(404, "Post not found");
    if (existing.authorId !== req.user!.id && !["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
      throw new HttpError(403, "You can only edit your own posts");
    }

    const uploadedImageUrl = fileToRelativeUrl(req.file || undefined);
    const post = await prisma.post.update({
      where: { id: req.params.id as string },
      data: {
        content: req.body.content,
        visibility: req.body.visibility,
        imageUrl: req.body.removeImage ? null : uploadedImageUrl || req.body.imageUrl || undefined
      },
      include: {
        author: { include: { profile: true, settings: true, privacy: true } },
        club: {
          include: {
            category: true,
            owner: { include: { profile: true, settings: true, privacy: true } },
            members: { where: { userId: req.user!.id } },
            _count: { select: { members: true, posts: true, joinRequests: true } }
          }
        },
        likes: { where: { userId: req.user!.id } },
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });

    return successResponse(res, "Post updated successfully", { post: serializePost(post, req.user!.id) });
  })
);

router.delete(
  "/posts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.post.findUnique({ where: { id: req.params.id as string } });
    if (!existing || existing.deletedAt) throw new HttpError(404, "Post not found");
    if (existing.authorId !== req.user!.id && !["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(req.user!.role)) {
      throw new HttpError(403, "You can only delete your own posts");
    }

    await prisma.post.update({
      where: { id: req.params.id as string },
      data: { deletedAt: new Date(), moderationStatus: "REMOVED" }
    });

    return successResponse(res, "Post deleted successfully", {});
  })
);

router.post(
  "/posts/:id/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    await getPostOrThrow(req.params.id as string, req.user);
    await prisma.like.upsert({
      where: { postId_userId: { postId: req.params.id as string, userId: req.user!.id } },
      create: { postId: req.params.id as string, userId: req.user!.id },
      update: {}
    });
    return successResponse(res, "Post liked successfully", {});
  })
);

router.delete(
  "/posts/:id/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.like.deleteMany({ where: { postId: req.params.id as string, userId: req.user!.id } });
    return successResponse(res, "Post unliked successfully", {});
  })
);

router.get(
  "/posts/:id/comments",
  optionalAuth,
  asyncHandler(async (req, res) => {
    await getPostOrThrow(req.params.id as string, req.user);
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id as string },
      orderBy: { createdAt: "asc" },
      include: { author: { include: { profile: true, settings: true, privacy: true } } }
    });
    return successResponse(res, "Comments fetched successfully", { items: comments.map(c => serializeComment(c)) });
  })
);

router.post(
  "/posts/:id/comments",
  requireAuth,
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    await getPostOrThrow(req.params.id as string, req.user);
    const comment = await prisma.comment.create({
      data: {
        postId: req.params.id as string,
        authorId: req.user!.id,
        content: req.body.content,
        parentId: req.body.parentId || null
      },
      include: { author: { include: { profile: true, settings: true, privacy: true } } }
    });
    return successResponse(res, "Comment created successfully", { comment: serializeComment(comment) }, 201);
  })
);

router.post(
  "/posts/:id/share",
  requireAuth,
  asyncHandler(async (req, res) => {
    await getPostOrThrow(req.params.id as string, req.user);
    const share = await prisma.share.create({ data: { postId: req.params.id as string, userId: req.user!.id } });
    return successResponse(res, "Post shared successfully", { share });
  })
);

router.post(
  "/posts/:id/report",
  requireAuth,
  validate(reportSchema),
  asyncHandler(async (req, res) => {
    await getPostOrThrow(req.params.id as string, req.user);
    const report = await prisma.report.create({
      data: {
        postId: req.params.id as string,
        reporterId: req.user!.id,
        reason: req.body.reason,
        description: req.body.description || null
      }
    });
    return successResponse(res, "Report submitted successfully", { report }, 201);
  })
);

export default router;
