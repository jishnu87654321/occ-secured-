import type {
  Club,
  ClubMember,
  Comment,
  Gig,
  GigApplication,
  Like,
  Post,
  PrivacySetting,
  Profile,
  User,
  UserSetting
} from "@prisma/client";
import { normalizeUrl } from "./fileUrl";

type UserWithRelations = User & {
  profile: Profile | null;
  settings?: UserSetting | null;
  privacy?: PrivacySetting | null;
};

type ClubWithRelations = Club & {
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  category?: { id: string; name: string; slug: string; createdAt: Date } | null;
  owner?: UserWithRelations | null;
  reviewedByAdmin?: UserWithRelations | null;
  members?: Array<ClubMember>;
  joinRequests?: Array<{ userId: string; status: string }>;
  _count?: { members?: number; posts?: number; joinRequests?: number };
};

type PostWithRelations = Post & {
  author?: UserWithRelations | null;
  club?: ClubWithRelations | null;
  likes?: Array<Like>;
  _count?: { likes?: number; comments?: number; shares?: number };
};

type CommentWithRelations = Comment & {
  author?: UserWithRelations | null;
};

type GigWithRelations = Gig & {
  applications?: Array<GigApplication>;
  _count?: { applications?: number };
};

type GigApplicationWithRelations = GigApplication & {
  gig?: Gig | null;
  user?: UserWithRelations | null;
  reviewedByAdmin?: UserWithRelations | null;
};

type GigApplicationSerializeOptions = {
  includeProtectedGig?: boolean;
  includeUser?: boolean;
  includeReviewedByAdmin?: boolean;
};

type UserView = "public" | "private";

export function serializeUser(user: UserWithRelations | null | undefined, view: UserView = "private") {
  if (!user) return null;
  const isPublic = view === "public";
  const canShowUniversity = !isPublic || user.privacy?.showUniversity !== false;

  return {
    id: user.id,
    email: isPublic ? undefined : user.email,
    role: isPublic ? undefined : user.role,
    status: isPublic ? undefined : user.status,
    isActive: isPublic ? undefined : user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: user.profile
      ? {
          id: user.profile.id,
          displayName: user.profile.displayName,
          bio: user.profile.bio,
          university: canShowUniversity ? user.profile.university : null,
          phoneNumber: isPublic ? null : user.profile.phoneNumber,
          hobbies: user.profile.hobbies,
          avatarUrl: normalizeUrl(user.profile.avatarUrl),
          coverUrl: normalizeUrl(user.profile.coverUrl),
          createdAt: user.profile.createdAt,
          updatedAt: user.profile.updatedAt
        }
      : null,
    settings: !isPublic && user.settings
      ? {
          themePreference: user.settings.themePreference,
          notificationPreferences: user.settings.notificationPreferences,
          updatedAt: user.settings.updatedAt
        }
      : null,
    privacy: !isPublic && user.privacy
      ? {
          profileVisibility: user.privacy.profileVisibility,
          showUniversity: user.privacy.showUniversity,
          showClubMembership: user.privacy.showClubMembership,
          postVisibilityDefault: user.privacy.postVisibilityDefault,
          updatedAt: user.privacy.updatedAt
        }
      : null
  };
}

export function serializeClub(
  club: ClubWithRelations | null | undefined,
  currentUserId: string | null = null,
  userView: UserView = "public"
) {
  if (!club) return null;
  const memberItems = club.members || [];
  const joinRequests = club.joinRequests || [];
  const activeMembership = currentUserId ? memberItems.find((member) => member.userId === currentUserId) : null;
  const isOwner = currentUserId ? club.ownerId === currentUserId : false;
  const isMember = !!activeMembership || isOwner;
  const isApprovedAndLive = club.approvalStatus === "APPROVED" && club.isActive;
  const hasPendingJoinRequest = currentUserId
    ? joinRequests.some((request) => request.userId === currentUserId && request.status === "PENDING")
    : false;
  const canJoin = isApprovedAndLive && !isOwner && !isMember && club.visibility === "PUBLIC";
  const canRequestToJoin = isApprovedAndLive && !isOwner && !isMember && club.visibility === "PRIVATE" && !hasPendingJoinRequest;
  const canLeave = isApprovedAndLive && isMember && !isOwner;
  const canEdit = isOwner;
  const canPost = isApprovedAndLive && isMember;
  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
    description: club.description,
    university: club.university,
    locationName: club.locationName,
    latitude: club.latitude,
    longitude: club.longitude,
    logoUrl: normalizeUrl(club.logoUrl),
    bannerUrl: normalizeUrl(club.bannerUrl),
    visibility: club.visibility,
    isActive: club.isActive,
    approvalStatus: club.approvalStatus,
    reviewedAt: club.reviewedAt,
    rejectionReason: club.rejectionReason,
    createdAt: club.createdAt,
    updatedAt: club.updatedAt,
    memberCount: club._count?.members ?? memberItems.length,
    postCount: club._count?.posts ?? 0,
    joinRequestCount: club._count?.joinRequests ?? 0,
    owner: serializeUser(club.owner, userView),
    category: club.category ?? null,
    ownerId: club.ownerId,
    reviewedByAdmin: serializeUser(club.reviewedByAdmin, "private"),
    isMember,
    isOwner,
    membershipRole: isOwner ? "OWNER" : activeMembership?.membershipRole ?? null,
    hasPendingJoinRequest,
    canJoin,
    canRequestToJoin,
    canLeave,
    canEdit,
    canPost
  };
}

export function serializeGigPublic(gig: GigWithRelations | null | undefined) {
  if (!gig) return null;
  return {
    id: gig.id,
    title: gig.title,
    slug: gig.slug,
    shortDescription: gig.shortDescription,
    category: gig.category,
    bannerUrl: normalizeUrl(gig.bannerUrl),
    isActive: gig.isActive,
    isPublic: gig.isPublic,
    applicationCount: gig._count?.applications ?? gig.applications?.length ?? 0,
    createdAt: gig.createdAt,
    updatedAt: gig.updatedAt
  };
}

export function serializeGigProtected(gig: GigWithRelations | null | undefined) {
  if (!gig) return null;
  return {
    ...serializeGigPublic(gig),
    fullDescription: gig.fullDescription,
    pricing: gig.pricing,
    instructions: gig.instructions,
    requirements: gig.requirements
  };
}

export function serializeGigApplication(
  application: GigApplicationWithRelations | null | undefined,
  options: GigApplicationSerializeOptions = {}
) {
  if (!application) return null;
  const {
    includeProtectedGig = false,
    includeUser = false,
    includeReviewedByAdmin = false
  } = options;

  return {
    id: application.id,
    userId: application.userId,
    gigId: application.gigId,
    name: application.name,
    email: application.email,
    phone: application.phone,
    college: application.college,
    reason: application.reason,
    relevantExperience: application.relevantExperience,
    status: application.status,
    reviewedAt: application.reviewedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    gig: application.gig
      ? includeProtectedGig
        ? serializeGigProtected(application.gig)
        : serializeGigPublic(application.gig)
      : null,
    user: includeUser && application.user ? serializeUser(application.user) : null,
    reviewedByAdmin: includeReviewedByAdmin && application.reviewedByAdmin ? serializeUser(application.reviewedByAdmin) : null
  };
}

export function serializePost(
  post: PostWithRelations | null | undefined,
  currentUserId: string | null = null,
  userView: UserView = "public"
) {
  if (!post) return null;
  const likes = post.likes || [];
  return {
    id: post.id,
    content: post.content,
    imageUrl: normalizeUrl(post.imageUrl),
    visibility: post.visibility,
    moderationStatus: post.moderationStatus,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    deletedAt: post.deletedAt,
    likesCount: post._count?.likes ?? likes.length,
    commentsCount: post._count?.comments ?? 0,
    sharesCount: post._count?.shares ?? 0,
    isLikedByCurrentUser: currentUserId ? likes.some((like) => like.userId === currentUserId) : false,
    author: serializeUser(post.author, userView),
    club: serializeClub(post.club, currentUserId, userView)
  };
}

export function serializeComment(comment: CommentWithRelations | null | undefined, userView: UserView = "public") {
  if (!comment) return null;
  return {
    id: comment.id,
    content: comment.content,
    parentId: comment.parentId,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: serializeUser(comment.author, userView)
  };
}
