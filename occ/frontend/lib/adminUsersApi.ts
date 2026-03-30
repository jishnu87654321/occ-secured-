import api from "@/lib/api";
import { resolveAssetUrl } from "@/lib/assetUrl";

export type AdminMemberClub = {
  id: string;
  name: string;
  slug: string;
  membershipRole?: string;
  joinedAt?: string;
  approvalStatus?: string;
  visibility?: string;
  isActive?: boolean;
};

export type AdminMemberRecord = {
  id: string;
  email: string;
  role: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  profile: {
    id: string;
    displayName: string;
    username?: string | null;
    university?: string | null;
    phoneNumber?: string | null;
    hobbies?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
  } | null;
  membershipCount: number;
  ownedClubsCount: number;
  postsCount: number;
  gigApplicationsCount: number;
  joinedClubs: AdminMemberClub[];
  ownedClubs: AdminMemberClub[];
};

export type AdminMembersSummary = {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  membersWithClubs: number;
};

type AdminUsersEnvelope = {
  data: {
    items: AdminMemberRecord[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    summary: AdminMembersSummary;
  };
};

type AdminUserEnvelope = {
  data: {
    user: AdminMemberRecord;
  };
};

function normalizeMember(member: AdminMemberRecord): AdminMemberRecord {
  return {
    ...member,
    profile: member.profile
      ? {
          ...member.profile,
          avatarUrl: resolveAssetUrl(member.profile.avatarUrl) || null,
          coverUrl: resolveAssetUrl(member.profile.coverUrl) || null,
        }
      : null,
  };
}

export async function listAdminUsers(options?: {
  page?: number;
  limit?: number;
  q?: string;
  role?: string;
  status?: string;
}) {
  const response = await api.get<AdminUsersEnvelope>("/occ-gate-842/users", {
    params: {
      page: options?.page ?? 1,
      limit: options?.limit ?? 12,
      q: options?.q || undefined,
      role: options?.role && options.role !== "ALL" ? options.role : undefined,
      status: options?.status && options.status !== "ALL" ? options.status : undefined,
    },
  });

  return {
    items: (response.data.data.items || []).map(normalizeMember),
    page: response.data.data.page,
    limit: response.data.data.limit,
    total: response.data.data.total,
    totalPages: response.data.data.totalPages,
    summary: response.data.data.summary,
  };
}

export async function getAdminUser(userId: string) {
  const response = await api.get<AdminUserEnvelope>(`/occ-gate-842/users/${userId}`);
  return normalizeMember(response.data.data.user);
}
