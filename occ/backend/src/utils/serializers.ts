import type {
  Club,
  ClubMember,
  Comment,
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
  settings: UserSetting | null;
  privacy: PrivacySetting | null;
};

type ClubWithRelations = Club & {
  category?: { id: string; name: string; slug: string; createdAt: Date } | null;
  owner?: UserWithRelations | null;
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

type UserView = "public" | "private";

export function serializeUser(user: UserWithRelations | null | undefined, view: UserView = "private") {
  if (!user) return null;
  const isPublic = view === "public";
  const canShowUniversity = !isPublic || user.privacy?.showUniversity !== false;

  return {
    id: user.id,
    email: isPublic ? undefined : user.email,
    role: isPublic ? undefined : user.role,
    status: user.status,
    isActive: user.isActive,
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
  const hasPendingJoinRequest = currentUserId
    ? joinRequests.some((request) => request.userId === currentUserId && request.status === "PENDING")
    : false;
  const canJoin = !isOwner && !isMember && club.visibility === "PUBLIC";
  const canRequestToJoin = !isOwner && !isMember && club.visibility === "PRIVATE" && !hasPendingJoinRequest;
  const canLeave = isMember && !isOwner;
  const canEdit = isOwner;
  const canPost = isMember;
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
    createdAt: club.createdAt,
    updatedAt: club.updatedAt,
    memberCount: club._count?.members ?? memberItems.length,
    postCount: club._count?.posts ?? 0,
    joinRequestCount: club._count?.joinRequests ?? 0,
    owner: serializeUser(club.owner, userView),
    category: club.category ?? null,
    ownerId: club.ownerId,
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
