"use client";

import { type ComponentType, useCallback, useEffect, useState } from "react";
import { Shield, Users, Building2, FileText, AlertTriangle, LogOut, ArrowRight } from "lucide-react";
import PublicPageGrid from "@/components/PublicPageGrid";
import api from "@/lib/api";
import { useUser } from "@/context/UserContext";

interface DashboardStats {
  usersCount: number;
  clubsCount: number;
  postsCount: number;
  reportsCount: number;
  pendingReportsCount: number;
}

interface AdminUserItem {
  id: string;
  email?: string;
  role?: string;
  status?: string;
  profile?: {
    displayName?: string | null;
    university?: string | null;
  } | null;
}

interface AdminClubItem {
  id: string;
  name: string;
  category?: {
    name?: string | null;
  } | null;
  memberCount?: number;
  postCount?: number;
  visibility?: string;
}

interface AdminPostItem {
  id: string;
  content: string;
  moderationStatus?: string;
  likesCount?: number;
  commentsCount?: number;
  author?: {
    profile?: {
      displayName?: string | null;
    } | null;
  } | null;
  club?: {
    name?: string | null;
  } | null;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0_0_#000]">
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-brutal-blue p-3 text-white border-2 border-black">
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-black uppercase tracking-[0.2em] text-black/60">{label}</span>
      </div>
      <p className="text-4xl font-black text-black">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-brutal-gray border-4 border-black p-8">
      <h3 className="text-2xl font-black uppercase tracking-tighter text-black">{title}</h3>
      <p className="mt-2 font-bold text-black/70">{description}</p>
    </div>
  );
}

export default function AdminPage() {
  const { user, login, logout, isLoggedIn, isAuthLoading } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    usersCount: 0,
    clubsCount: 0,
    postsCount: 0,
    reportsCount: 0,
    pendingReportsCount: 0,
  });
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [clubs, setClubs] = useState<AdminClubItem[]>([]);
  const [posts, setPosts] = useState<AdminPostItem[]>([]);

  const hasAdminAccess = user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_ADMIN";

  const loadAdminData = useCallback(async () => {
    if (!hasAdminAccess) return;

    setIsLoadingData(true);
    setError("");

    try {
      const [dashboardResponse, usersResponse, clubsResponse, postsResponse] = await Promise.all([
        api.get("/occ-gate-842/dashboard"),
        api.get("/occ-gate-842/users?limit=10"),
        api.get("/occ-gate-842/clubs?limit=10"),
        api.get("/occ-gate-842/posts?limit=10"),
      ]);

      setStats(dashboardResponse.data.data.stats);
      setUsers(usersResponse.data.data.items || []);
      setClubs(clubsResponse.data.data.items || []);
      setPosts(postsResponse.data.data.items || []);
    } catch {
      setError("Unable to load admin data right now.");
    } finally {
      setIsLoadingData(false);
    }
  }, [hasAdminAccess]);

  useEffect(() => {
    if (!isAuthLoading && hasAdminAccess) {
      loadAdminData();
    }
  }, [hasAdminAccess, isAuthLoading, loadAdminData]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const nextUser = await login({ email, password });
      const isAdmin = nextUser.role === "SUPER_ADMIN" || nextUser.role === "PLATFORM_ADMIN";
      if (!isAdmin) {
        logout();
        setError("This account does not have admin access.");
      }
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return (
      <PublicPageGrid className="min-h-screen bg-brutal-gray flex items-center justify-center p-4">
        <div className="bg-white border-4 border-black p-8 shadow-[12px_12px_0_0_#1d2cf3]">
          <p className="font-black uppercase tracking-[0.2em] text-black">Checking admin session...</p>
        </div>
      </PublicPageGrid>
    );
  }

  if (!isLoggedIn) {
    return (
      <PublicPageGrid className="min-h-screen bg-brutal-gray flex items-center justify-center p-4">
        <div className="bg-white border-4 border-black shadow-[12px_12px_0_0_#1d2cf3] w-full max-w-md p-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-brutal-blue text-white p-3 border-2 border-black">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Admin Access</h1>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div>
              <label className="font-black uppercase text-sm block mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border-4 border-black p-4 font-bold text-lg focus:outline-none focus:border-brutal-blue"
                placeholder="admin@occ.local"
              />
            </div>

            <div>
              <label className="font-black uppercase text-sm block mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-4 border-black p-4 font-bold text-lg focus:outline-none focus:border-brutal-blue"
                placeholder="Enter your password"
              />
            </div>

            {error ? (
              <p className="bg-red-500 text-white p-3 border-4 border-black font-black uppercase text-sm">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black text-white py-4 font-black uppercase text-lg border-4 border-black shadow-[6px_6px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:translate-x-0 disabled:hover:translate-y-0"
            >
              {isSubmitting ? "Signing In..." : "Enter Admin"} <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </PublicPageGrid>
    );
  }

  if (!hasAdminAccess) {
    return (
      <PublicPageGrid className="min-h-screen bg-brutal-gray flex items-center justify-center p-4">
        <div className="bg-white border-4 border-black shadow-[12px_12px_0_0_#000] w-full max-w-lg p-10">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-black">Access Restricted</h1>
          <p className="mt-4 font-bold text-black/70">
            This account is signed in, but it does not have platform admin permissions.
          </p>
          <button
            onClick={logout}
            className="mt-8 bg-black text-white px-6 py-3 font-black uppercase border-4 border-black shadow-[6px_6px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
          >
            Sign Out
          </button>
        </div>
      </PublicPageGrid>
    );
  }

  return (
    <div className="min-h-screen bg-brutal-gray">
      <div className="bg-white border-b-8 border-black sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-brutal-blue text-white p-2 border-2 border-black">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-2xl font-black uppercase tracking-tighter">OCC Admin</span>
              <span className="block text-xs font-black uppercase tracking-[0.2em] text-black/50">
                {user?.email}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 bg-black text-white px-5 py-2 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-10">
        {error ? (
          <div className="bg-red-500 text-white p-4 border-4 border-black font-black uppercase text-sm">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
          <StatCard icon={Users} label="Users" value={stats.usersCount} />
          <StatCard icon={Building2} label="Clubs" value={stats.clubsCount} />
          <StatCard icon={FileText} label="Posts" value={stats.postsCount} />
          <StatCard icon={AlertTriangle} label="Reports" value={stats.reportsCount} />
          <StatCard icon={Shield} label="Pending" value={stats.pendingReportsCount} />
        </section>

        <section className="bg-white border-4 border-black border-l-8 border-l-brutal-blue p-8 shadow-[8px_8px_0_0_#000]">
          <div className="flex items-center justify-between gap-4 border-b-4 border-black pb-4">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter text-black">Database State</h2>
              <p className="mt-2 font-bold text-black/65">
                Dummy frontend data has been removed. This page now reflects only backend records.
              </p>
            </div>
            <button
              onClick={loadAdminData}
              disabled={isLoadingData}
              className="bg-black text-white px-5 py-3 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-70 disabled:hover:translate-x-0 disabled:hover:translate-y-0"
            >
              {isLoadingData ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0_0_#000]">
            <h3 className="text-2xl font-black uppercase tracking-tighter border-b-4 border-black pb-4">Users</h3>
            <div className="mt-6 space-y-3">
              {users.length > 0 ? (
                users.map((item) => (
                  <div key={item.id} className="border-2 border-black bg-brutal-gray p-4">
                    <p className="font-black text-black">{item.profile?.displayName || item.email || "Unnamed user"}</p>
                    <p className="text-sm font-bold text-black/60">{item.email || "No email"}</p>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.15em] text-black/50">
                      {item.role || "USER"} | {item.status || "UNKNOWN"}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState title="No users beyond admin" description="Only database-backed user records appear here." />
              )}
            </div>
          </div>

          <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0_0_#000]">
            <h3 className="text-2xl font-black uppercase tracking-tighter border-b-4 border-black pb-4">Clubs</h3>
            <div className="mt-6 space-y-3">
              {clubs.length > 0 ? (
                clubs.map((item) => (
                  <div key={item.id} className="border-2 border-black bg-brutal-gray p-4">
                    <p className="font-black text-black">{item.name}</p>
                    <p className="mt-2 text-sm font-bold text-black/60">
                      {(item.category?.name || "Uncategorized")} | {item.visibility || "PUBLIC"}
                    </p>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.15em] text-black/50">
                      {item.memberCount || 0} members | {item.postCount || 0} posts
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState title="No clubs in database" description="Create clubs from the real app flow and they will appear here." />
              )}
            </div>
          </div>
        </section>

        <section className="bg-white border-4 border-black p-8 shadow-[8px_8px_0_0_#000]">
          <h3 className="text-2xl font-black uppercase tracking-tighter border-b-4 border-black pb-4">Recent Posts</h3>
          <div className="mt-6 space-y-3">
            {posts.length > 0 ? (
              posts.map((item) => (
                <div key={item.id} className="border-2 border-black bg-brutal-gray p-4">
                  <p className="font-black text-black line-clamp-2">{item.content || "Untitled post"}</p>
                  <p className="mt-2 text-sm font-bold text-black/60">
                    {item.author?.profile?.displayName || "Unknown author"}
                    {item.club?.name ? ` | ${item.club.name}` : ""}
                  </p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.15em] text-black/50">
                    {item.moderationStatus || "PUBLISHED"} | {item.likesCount || 0} likes | {item.commentsCount || 0} comments
                  </p>
                </div>
              ))
            ) : (
              <EmptyState title="No posts in database" description="The feed will stay empty until someone creates a real post." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
