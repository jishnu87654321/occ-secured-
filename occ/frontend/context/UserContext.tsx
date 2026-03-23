"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { type ClubMembership, type Post } from "@/lib/dataProvider";
import { ClubRecord } from "@/lib/mockData/clubs";
import { createClubOnApi, listClubsFromApi, toClubRecord, type ClubUpsertInput, updateClubOnApi } from "@/lib/clubApi";
import { joinClubOnApi, leaveClubOnApi } from "@/lib/clubApi";
import { requestClubJoinOnApi } from "@/lib/clubApi";
import { createPostOnApi, deletePostOnApi, listFeedFromApi, type PostUpsertInput, updatePostOnApi } from "@/lib/postApi";
import { fetchCurrentUser, loginWithPassword, type SessionUser } from "@/lib/authApi";


interface User extends SessionUser {}

interface UserContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<User>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  posts: Post[];
  clubs: ClubRecord[];
  memberships: string[];
  addPost: (postData: PostUpsertInput) => Promise<Post | null>;
  deletePost: (postId: string) => Promise<void>;
  updatePost: (updatedPost: Post) => Promise<Post | null>;
  updatePosts: (posts: Post[]) => void;
  createClub: (clubData: ClubUpsertInput & { logoPreview?: string; bannerPreview?: string }) => Promise<string | null>;
  updateClub: (clubId: string, clubData: ClubUpsertInput & { logoPreview?: string; bannerPreview?: string }) => Promise<ClubRecord | null>;
  joinClub: (clubId: string) => Promise<boolean>;
  requestToJoinClub: (clubId: string) => Promise<boolean>;
  leaveClub: (clubId: string) => Promise<boolean>;
  isClubJoined: (clubId: string) => boolean;
  getMembershipItems: () => ClubMembership[];
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const normalizeAssetSrc = (value?: string | null, fallback?: string) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed && !trimmed.startsWith("blob:") && !trimmed.startsWith("file:") && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
};

const normalizeUserRecord = (value: User): User => ({
  ...value,
  profilePicture: normalizeAssetSrc(value.profilePicture),
});

const normalizePostRecord = (value: Post): Post => ({
  ...value,
  clubLogo: normalizeAssetSrc(value.clubLogo, "/globe.svg") || "/globe.svg",
  image: normalizeAssetSrc(value.image),
});

const normalizeClubRecord = (value: ClubRecord): ClubRecord => ({
  ...value,
  slug: normalizeAssetSrc(value.slug),
  logo: normalizeAssetSrc(value.logo, "/globe.svg") || "/globe.svg",
  bannerImage: normalizeAssetSrc(value.bannerImage, "") || "",
  profileImage: normalizeAssetSrc(value.profileImage, normalizeAssetSrc(value.logo, "/globe.svg")) || "/globe.svg",
  isJoined: !!value.isJoined,
  isOwner: !!value.isOwner,
  members: value.members.map((member) => ({
    ...member,
    avatar: normalizeAssetSrc(member.avatar, "/globe.svg") || "/globe.svg",
  })),
  gallery: value.gallery.map((item) => ({
    ...item,
    image: normalizeAssetSrc(item.image, "/window.svg") || "/window.svg",
  })),
});

const readStoredValue = <T,>(key: string, fallback: T, normalize?: (value: T) => T): T => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storedValue = localStorage.getItem(key);
  if (!storedValue) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(storedValue) as T;
    return normalize ? normalize(parsed) : parsed;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
};

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [clubs, setClubs] = useState<ClubRecord[]>([]);
  const [memberships, setMemberships] = useState<string[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Initial load from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedUser = readStoredValue<User | null>("occ-user", null, (value) => (value ? normalizeUserRecord(value) : null));
    const storedPosts = readStoredValue<Post[]>("occ-posts", [], (value) => value.map(normalizePostRecord));
    const storedClubs = readStoredValue<ClubRecord[]>("occ-clubs", [], (value) => value.map(normalizeClubRecord));
    const storedMemberships = readStoredValue<string[]>("occ-memberships", []);

    if (storedUser) setUser(storedUser);
    if (storedPosts.length > 0) setPosts(storedPosts);
    if (storedClubs.length > 0) setClubs(storedClubs);
    if (storedMemberships.length > 0) setMemberships(storedMemberships);
    
    // If no user in storage, we can stop loading early. 
    // Otherwise bootstrapUser effect will handle completion.
    if (!storedUser && !localStorage.getItem("token")) {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageVersion = localStorage.getItem("occ-data-version");
    if (storageVersion === "db-only-v1") return;

    localStorage.removeItem("occ-posts");
    localStorage.removeItem("occ-clubs");
    localStorage.removeItem("occ-memberships");
    localStorage.setItem("occ-data-version", "db-only-v1");
    setPosts([]);
    setClubs([]);
    setMemberships([]);
  }, []);

  useEffect(() => {
    let isActive = true;

    const bootstrapUser = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) {
        if (!isActive) return;
        localStorage.removeItem("occ-user");
        setUser(null);
        setIsAuthLoading(false);
        return;
      }

      try {
        const currentUser = normalizeUserRecord(await fetchCurrentUser());
        if (!isActive) return;
        setUser(currentUser);
        localStorage.setItem("occ-user", JSON.stringify(currentUser));
      } catch {
        if (!isActive) return;
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("occ-user");
        setUser(null);
      } finally {
        if (isActive) setIsAuthLoading(false);
      }
    };

    bootstrapUser();

    return () => {
      isActive = false;
    };
  }, []);

  const mergeClubs = useCallback((incoming: ClubRecord[], preserveOrder = false) => {
    setClubs((prev) => {
      const map = new Map<string, ClubRecord>();
      const previousIds = prev.map((club) => club.id);
      const incomingIds = incoming.map((club) => club.id);

      for (const club of prev) {
        const existing = map.get(club.id);
        map.set(
          club.id,
          normalizeClubRecord({
            ...(existing || club),
            ...club,
            members: club.members.length > 0 ? club.members : existing?.members || [],
            events: club.events.length > 0 ? club.events : existing?.events || [],
            gallery: club.gallery.length > 0 ? club.gallery : existing?.gallery || [],
          }),
        );
      }

      for (const club of incoming) {
        const existing = map.get(club.id);
        map.set(
          club.id,
          normalizeClubRecord({
            ...(existing || club),
            ...club,
            members: club.members.length > 0 ? club.members : existing?.members || [],
            events: club.events.length > 0 ? club.events : existing?.events || [],
            gallery: club.gallery.length > 0 ? club.gallery : existing?.gallery || [],
          }),
        );
      }

      const previousIdsSet = new Set(previousIds);
      const incomingIdsSet = new Set(incomingIds);

      const orderedIds = preserveOrder
        ? [...previousIds, ...incomingIds.filter((id) => !previousIdsSet.has(id))]
        : [...incomingIds, ...previousIds.filter((id) => !incomingIdsSet.has(id))];

      return orderedIds.map((id) => map.get(id)!).filter(Boolean);
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadRemoteClubs = async () => {
      try {
        const apiClubs = await listClubsFromApi();
        if (!isActive) return;
        if (apiClubs.length === 0) {
          setClubs([]);
          setMemberships([]);
          return;
        }

        const mappedClubs = apiClubs.map((club) => toClubRecord(club));
        mergeClubs(mappedClubs);
        setMemberships(
          mappedClubs
            .filter((club) => club.isJoined || club.isOwner)
            .map((club) => club.id),
        );
      } catch {
        // Keep local data when the API is unavailable.
      }
    };

    if (!user) {
      setMemberships([]);
    }

    loadRemoteClubs();

    return () => {
      isActive = false;
    };
  }, [mergeClubs, user]);

  // Note: loadRemotePosts was removed from here because the FeedPage and Home page 
  // already handle their own specific post hydration. This prevents redundant high-latency
  // API calls during application startup and navigation.

  useEffect(() => {
    localStorage.setItem("occ-clubs", JSON.stringify(clubs));
  }, [clubs]);

  useEffect(() => {
    localStorage.setItem("occ-posts", JSON.stringify(posts));
  }, [posts]);

  useEffect(() => {
    localStorage.setItem("occ-memberships", JSON.stringify(memberships));
  }, [memberships]);

  const login = async ({ email, password }: { email: string; password: string }) => {
    const session = await loginWithPassword(email, password);
    if (typeof window !== "undefined") {
      localStorage.setItem("token", session.accessToken);
      localStorage.setItem("refreshToken", session.refreshToken);
    }
    const nextUser = normalizeUserRecord(session.user);
    setUser(nextUser);
    localStorage.setItem("occ-user", JSON.stringify(nextUser));
    return nextUser;
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("occ-user");
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = normalizeUserRecord({ ...user, ...userData });
      setUser(updatedUser);
      localStorage.setItem("occ-user", JSON.stringify(updatedUser));
    }
  };

  const addPost = async (postData: PostUpsertInput) => {
    try {
      const created = await createPostOnApi(postData);
      setPosts(prev => [normalizePostRecord(created), ...prev]);
      return created;
    } catch {
      return null;
    }
  };

  const deletePost = async (postId: string) => {
    await deletePostOnApi(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const updatePost = async (updatedPost: Post) => {
    try {
      const updated = await updatePostOnApi(updatedPost.id, {
        content: updatedPost.content,
        clubId: updatedPost.clubId === "general" ? null : updatedPost.clubId,
      });
      setPosts(prev => prev.map(p => p.id === updated.id ? normalizePostRecord(updated) : p));
      return updated;
    } catch {
      return null;
    }
  };

  const updatePosts = (newPosts: Post[]) => {
    setPosts(newPosts.map(normalizePostRecord));
  };

  const createClub = async (clubData: ClubUpsertInput & { logoPreview?: string; bannerPreview?: string }) => {
    if (!user) return null;

    try {
      const createdClub = await createClubOnApi(clubData);
      const normalizedClub = normalizeClubRecord({
        ...createdClub,
        membersCount: Math.max(createdClub.membersCount, 1),
        members: createdClub.members.length > 0
          ? createdClub.members
          : [
              {
                id: `member-${Date.now()}`,
                name: user.name,
                role: "Founder",
                avatar: user.profilePicture || "/globe.svg",
              },
            ],
        university: createdClub.university || user.university || "Independent",
        isJoined: true,
        isOwner: true,
        membershipRole: "OWNER",
        canEdit: true,
        canLeave: false,
        canJoin: false,
        canRequestToJoin: false,
        hasPendingJoinRequest: false,
        canPost: true,
      });

      mergeClubs([normalizedClub]);
      setMemberships(prev => (prev.includes(normalizedClub.id) ? prev : [...prev, normalizedClub.id]));
      return normalizedClub.slug || normalizedClub.id;
    } catch {
      return null;
    }
  };

  const updateClub = async (
    clubId: string,
    clubData: ClubUpsertInput & { logoPreview?: string; bannerPreview?: string },
  ) => {
    const existingClub = clubs.find((club) => club.id === clubId || club.slug === clubId);
    if (!existingClub) return null;

    try {
      const updatedClub = await updateClubOnApi(existingClub.id, clubData);
      const normalizedClub = normalizeClubRecord({
        ...existingClub,
        ...updatedClub,
        category: updatedClub.category || clubData.category || existingClub.category,
        members: existingClub.members,
        events: existingClub.events,
        gallery: existingClub.gallery,
        isJoined: updatedClub.isJoined ?? existingClub.isJoined,
        isOwner: existingClub.isOwner || updatedClub.isOwner,
      });
      mergeClubs([normalizedClub], true);
      return normalizedClub;
    } catch {
      return null;
    }
  };

  const joinClub = async (clubId: string) => {
    if (!user) return false;

    try {
      await joinClubOnApi(clubId);
      setMemberships((prev) => (prev.includes(clubId) ? prev : [...prev, clubId]));
      setClubs((prev) =>
        prev.map((club) => {
          if (club.id !== clubId) return club;
          if (club.members.some((member) => member.name === user.name)) {
            return normalizeClubRecord({
              ...club,
              isJoined: true,
              hasPendingJoinRequest: false,
              canJoin: false,
              canRequestToJoin: false,
              canLeave: !club.isOwner,
              canPost: true,
            });
          }

          return normalizeClubRecord({
            ...club,
            isJoined: true,
            hasPendingJoinRequest: false,
            canJoin: false,
            canRequestToJoin: false,
            canLeave: !club.isOwner,
            canPost: true,
            membersCount: club.membersCount + 1,
            members: [
              ...club.members,
              {
                id: `member-${clubId}-${Date.now()}`,
                name: user.name,
                role: "Member",
                avatar: user.profilePicture || "/globe.svg",
              },
            ],
          });
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const requestToJoinClub = async (clubId: string) => {
    if (!user) return false;

    try {
      await requestClubJoinOnApi(clubId);
      setClubs((prev) =>
        prev.map((club) =>
          club.id === clubId
            ? normalizeClubRecord({
                ...club,
                hasPendingJoinRequest: true,
                canJoin: false,
                canRequestToJoin: false,
                canPost: false,
              })
            : club,
        ),
      );
      return true;
    } catch {
      return false;
    }
  };

  const leaveClub = async (clubId: string) => {
    if (!user) return false;

    try {
      await leaveClubOnApi(clubId, user.id);
      setMemberships((prev) => prev.filter((id) => id !== clubId));
      setClubs((prev) =>
        prev.map((club) => {
          if (club.id !== clubId) return club;
          const nextMembers = club.members.filter((member) => member.name !== user.name);

          return normalizeClubRecord({
            ...club,
            isJoined: false,
            hasPendingJoinRequest: false,
            canJoin: club.visibility === "PUBLIC",
            canRequestToJoin: club.visibility === "PRIVATE",
            canLeave: false,
            canPost: false,
            membersCount: Math.max(0, nextMembers.length),
            members: nextMembers,
          });
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const isClubJoined = (clubId: string) =>
    memberships.includes(clubId) || clubs.some((club) => club.id === clubId && (club.isJoined || club.isOwner));

  const getMembershipItems = () =>
    clubs
      .filter(club => memberships.includes(club.id))
      .map(club => ({
        id: club.id,
        slug: club.slug || club.id,
        name: club.name,
        role: "Member",
        logo: club.logo,
        description: club.description,
        university: club.university,
        category: club.category,
      }));

  return (
    <UserContext.Provider value={{
      user,
      login,
      logout,
      updateUser,
      isLoggedIn: !!user,
      isAuthLoading,
      posts,
      clubs,
      memberships,
      addPost,
      deletePost,
      updatePost,
      updatePosts,
      createClub,
      updateClub,
      joinClub,
      requestToJoinClub,
      leaveClub,
      isClubJoined,
      getMembershipItems,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
