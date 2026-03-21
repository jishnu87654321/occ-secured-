/**
 * dataProvider.ts
 * Central data layer for the OCC frontend.
 * All functions return empty arrays/null until connected to the backend.
 * TODO: Replace each function body with a real API call using the api client.
 */

import api from "@/lib/api";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Comment {
  id: string;
  author: string;
  content: string;
}

export interface Post {
  id: string;
  clubId: string;
  clubName: string;
  clubLogo: string;
  author: string;
  content: string;
  image?: string;
  timestamp: string;
  likes: number;
  comments: Comment[];
  isLiked?: boolean;
  commentsCount?: number;
}

export interface Club {
  id: string;
  slug?: string;
  name: string;
  description: string;
  logo: string;
  category: string;
  tagline?: string;
  fullDescription?: string;
  bannerImage?: string;
  profileImage?: string;
  location?: string;
  university?: string;
  membersCount?: number;
  eventsCount?: number;
  isJoined?: boolean;
  isOwner?: boolean;
  visibility?: "PUBLIC" | "PRIVATE";
  membershipRole?: "OWNER" | "ADMIN" | "MEMBER" | null;
  hasPendingJoinRequest?: boolean;
  canJoin?: boolean;
  canRequestToJoin?: boolean;
  canLeave?: boolean;
  canEdit?: boolean;
  canPost?: boolean;
}

export interface UserProfile {
  email: string;
  name: string;
  university: string;
  profilePicture?: string;
  phoneNumber?: string;
  hobbies?: string;
}

export interface ClubMembership {
  id: string;
  name: string;
  role: string;
  logo: string;
  description?: string;
  university?: string;
  category?: string;
  slug?: string;
  joinedAt?: string;
}

export interface ClubMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

export interface ClubEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
}

export interface ClubGalleryItem {
  id: string;
  image: string;
  caption: string;
}

export interface ActivityStats {
  postsCreated: number;
  clubsJoined: number;
  eventsAttended: number;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  reward: string;
  host: string;
  location: string;
  status: string;
  vertical?: string;
}

// ─── Data Provider Functions ──────────────────────────────────────────────────

// TODO: Replace with API call — GET /api/posts
export const getPosts = async (): Promise<Post[]> => {
  return [];
};

// TODO: Replace with API call — GET /api/users
export const getUsers = async (): Promise<UserProfile[]> => {
  return [];
};

// TODO: Replace with API call — GET /api/clubs
export const getClubs = async (): Promise<Club[]> => {
  return [];
};

// TODO: Replace with API call — GET /api/opportunities
export const getOpportunities = async (): Promise<Opportunity[]> => {
  return [];
};

// TODO: Replace with API call — GET /api/posts/:id
export const getPostById = async (_id: string): Promise<Post | null> => {
  return null;
};

// TODO: Replace with API call — GET /api/clubs/:id
export const getClubById = async (_id: string): Promise<Club | null> => {
  return null;
};

// TODO: Replace with API call — GET /api/users/:id/memberships
export const getUserMemberships = async (_userId: string): Promise<ClubMembership[]> => {
  return [];
};

// TODO: Replace with API call — GET /api/users/:id/stats
export const getUserActivityStats = async (_userId: string): Promise<ActivityStats> => {
  return { postsCreated: 0, clubsJoined: 0, eventsAttended: 0 };
};

// TODO: Replace with API call — GET /api/opportunities/featured
export const getFeaturedOpportunities = async (): Promise<Opportunity[]> => {
  return [];
};

// TODO: Replace with API call — GET /api/opportunities?vertical=:id
export const getOpportunitiesByVertical = async (_verticalId: string): Promise<Opportunity[]> => {
  return [];
};
