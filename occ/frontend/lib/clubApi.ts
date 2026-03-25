import api from "@/lib/api";
import type { ClubRecord } from "@/lib/mockData/clubs";
import { clearRequestCache, withRequestCache } from "@/lib/requestCache";

export const CLUB_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export const CLUB_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif";
export const CLUB_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

type ApiClub = {
  id: string;
  slug?: string | null;
  name: string;
  description: string;
  university?: string | null;
  locationName?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  memberCount?: number;
  category?: { name?: string | null } | null;
  isActive?: boolean;
  isOwner?: boolean;
  isMember?: boolean;
  visibility?: "PUBLIC" | "PRIVATE";
  membershipRole?: "OWNER" | "ADMIN" | "MEMBER" | null;
  hasPendingJoinRequest?: boolean;
  canJoin?: boolean;
  canRequestToJoin?: boolean;
  canLeave?: boolean;
  canEdit?: boolean;
  canPost?: boolean;
  createdAt?: string;
  updatedAt?: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  owner?: {
    id?: string;
    email?: string;
    profile?: {
      displayName?: string | null;
      university?: string | null;
      phoneNumber?: string | null;
    } | null;
  } | null;
  reviewedByAdmin?: {
    id?: string;
    email?: string;
    profile?: {
      displayName?: string | null;
    } | null;
  } | null;
};

type ListClubsResponse = {
  data?: {
    items?: ApiClub[];
  };
};

type SingleClubResponse = {
  data?: {
    club?: ApiClub | null;
  };
};

export type ClubUpsertInput = {
  name: string;
  description: string;
  category: string;
  university?: string;
  location?: string;
  logoFile?: File | null;
  bannerFile?: File | null;
  removeLogo?: boolean;
  removeBanner?: boolean;
};

export type AdminClubSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type AdminClubRecord = ClubRecord & {
  description: string;
  createdAt?: string;
  updatedAt?: string;
  owner?: ApiClub["owner"];
  reviewedByAdmin?: ApiClub["reviewedByAdmin"];
};

const toTagline = (name: string, description: string) => {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const firstSentence = trimmedDescription.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 72) {
    return firstSentence;
  }
  return `${trimmedName} starts here.`;
};

export const toClubRecord = (club: ApiClub, fallbackCategory = "Club"): ClubRecord => {
  const resolvedLogo = club.logoUrl?.trim() || "/globe.svg";
  const resolvedDescription = club.description?.trim() || "A new OCC club is taking shape.";
  const resolvedName = club.name?.trim() || "Untitled Club";

  return {
    id: club.id,
    slug: club.slug?.trim() || undefined,
    name: resolvedName,
    description: resolvedDescription,
    tagline: toTagline(resolvedName, resolvedDescription),
    fullDescription: resolvedDescription,
    logo: resolvedLogo,
    bannerImage: club.bannerUrl?.trim() || "",
    bannerUrl: club.bannerUrl?.trim() || null,
    profileImage: resolvedLogo,
    category: club.category?.name?.trim() || fallbackCategory,
    location: club.locationName?.trim() || "Campus Hub",
    university: club.university?.trim() || "Independent",
    membersCount: club.memberCount ?? 0,
    eventsCount: 0,
    members: [],
    events: [],
    gallery: [],
    isJoined: !!club.isMember || !!club.isOwner,
    isOwner: !!club.isOwner,
    visibility: club.visibility || "PUBLIC",
    isActive: club.isActive ?? true,
    membershipRole: club.membershipRole || null,
    hasPendingJoinRequest: !!club.hasPendingJoinRequest,
    canJoin: !!club.canJoin,
    canRequestToJoin: !!club.canRequestToJoin,
    canLeave: !!club.canLeave,
    canEdit: !!club.canEdit,
    canPost: !!club.canPost,
    approvalStatus: club.approvalStatus || "APPROVED",
    reviewedAt: club.reviewedAt || null,
    rejectionReason: club.rejectionReason || null,
    createdAt: club.createdAt,
    updatedAt: club.updatedAt,
    owner: club.owner || null,
    reviewedByAdmin: club.reviewedByAdmin || null,
  };
};

function appendOptionalField(formData: FormData, key: string, value?: string) {
  const trimmed = value?.trim();
  if (trimmed) {
    formData.append(key, trimmed);
  }
}

function buildClubFormData(input: ClubUpsertInput) {
  const formData = new FormData();
  formData.append("name", input.name.trim());
  formData.append("description", input.description.trim());
  appendOptionalField(formData, "university", input.university);
  appendOptionalField(formData, "locationName", input.location);

  if (input.logoFile) {
    formData.append("logo", input.logoFile);
  }

  if (input.bannerFile) {
    formData.append("banner", input.bannerFile);
  }

  if (input.removeLogo) {
    formData.append("removeLogo", "true");
  }

  if (input.removeBanner) {
    formData.append("removeBanner", "true");
  }

  return formData;
}

export async function listClubsFromApi() {
  return withRequestCache(
    "clubs:public",
    async () => {
      const response = await api.get<ListClubsResponse>("/clubs");
      return response.data?.data?.items ?? [];
    },
    60_000,
  );
}

export async function joinClubOnApi(clubId: string) {
  await api.post(`/clubs/${clubId}/join`);
}

export async function requestClubJoinOnApi(clubId: string) {
  await api.post(`/clubs/${clubId}/request`);
}

export async function leaveClubOnApi(clubId: string, userId: string) {
  await api.post(`/clubs/${clubId}/leave`, { userId });
}

export async function createClubOnApi(input: ClubUpsertInput) {
  const response = await api.post<SingleClubResponse>("/clubs", buildClubFormData(input));
  const club = response.data?.data?.club;
  if (!club) {
    throw new Error("Club response did not include a club record.");
  }
  clearRequestCache("clubs:");
  return toClubRecord(club, input.category);
}

export async function updateClubOnApi(clubId: string, input: ClubUpsertInput) {
  const response = await api.patch<SingleClubResponse>(`/clubs/${clubId}`, buildClubFormData(input));
  const club = response.data?.data?.club;
  if (!club) {
    throw new Error("Club response did not include a club record.");
  }
  clearRequestCache("clubs:");
  return toClubRecord(club, input.category);
}

export async function fetchClubFromApi(clubIdOrSlug: string) {
  return withRequestCache(
    `clubs:detail:${clubIdOrSlug}`,
    async () => {
      const response = await api.get<SingleClubResponse>(`/clubs/${clubIdOrSlug}`);
      const club = response.data?.data?.club;
      if (!club) {
        throw new Error("Club response did not include a club record.");
      }
      return toClubRecord(club);
    },
    60_000,
  );
}

type AdminClubsResponse = {
  data?: {
    items?: ApiClub[];
    summary?: AdminClubSummary;
  };
};

export async function listAdminClubs(status?: "PENDING" | "APPROVED" | "REJECTED" | "ALL") {
  const response = await api.get<AdminClubsResponse>("/admin/clubs", {
    params: status && status !== "ALL" ? { status } : undefined,
  });

  return {
    items: (response.data?.data?.items || []).map((club) => toClubRecord(club) as AdminClubRecord),
    summary: response.data?.data?.summary || { total: 0, pending: 0, approved: 0, rejected: 0 },
  };
}

export async function updateClubApprovalStatus(
  clubId: string,
  status: "PENDING" | "APPROVED" | "REJECTED",
  rejectionReason?: string,
) {
  const response = await api.patch<SingleClubResponse>(`/admin/clubs/${clubId}/status`, {
    status,
    rejectionReason: rejectionReason?.trim() || undefined,
  });
  const club = response.data?.data?.club;
  if (!club) {
    throw new Error("Club response did not include a club record.");
  }
  clearRequestCache("clubs:");
  return toClubRecord(club) as AdminClubRecord;
}
