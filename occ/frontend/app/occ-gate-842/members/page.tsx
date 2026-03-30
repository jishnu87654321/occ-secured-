"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogOut, RefreshCw, Search, Shield, Users } from "lucide-react";
import SiteContainer from "@/components/SiteContainer";
import ImageWithFallback from "@/components/ImageWithFallback";
import { useUser } from "@/context/UserContext";
import { getAdminUser, listAdminUsers, type AdminMemberRecord, type AdminMembersSummary } from "@/lib/adminUsersApi";

const roleOptions = ["ALL", "USER", "CLUB_ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN"];
const statusOptions = ["ALL", "ACTIVE", "PENDING", "SUSPENDED", "BANNED"];

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-4 border-black bg-white p-5 shadow-[6px_6px_0_0_#000]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
}

export default function AdminMembersPage() {
  const { user, login, logout, isLoggedIn, isAuthLoading } = useUser();
  const hasAdminAccess = user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_ADMIN";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [members, setMembers] = useState<AdminMemberRecord[]>([]);
  const [summary, setSummary] = useState<AdminMembersSummary>({ totalUsers: 0, activeUsers: 0, adminUsers: 0, membersWithClubs: 0 });
  const [selectedMember, setSelectedMember] = useState<AdminMemberRecord | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!hasAdminAccess) return;
    setIsLoading(true);
    setError("");
    try {
      const response = await listAdminUsers({ page, limit: 12, q: query, role: roleFilter, status: statusFilter });
      setMembers(response.items);
      setSummary(response.summary);
      setTotalPages(response.totalPages || 1);

      if (response.items.length === 0) {
        setSelectedMember(null);
        return;
      }

      setSelectedMember((current) => {
        if (current) {
          const updatedCurrent = response.items.find((member) => member.id === current.id);
          if (updatedCurrent) return updatedCurrent;
        }
        return response.items[0];
      });
    } catch {
      setError("Unable to load OCC registrations right now.");
    } finally {
      setIsLoading(false);
    }
  }, [hasAdminAccess, page, query, roleFilter, statusFilter]);

  useEffect(() => {
    if (!isAuthLoading && hasAdminAccess) {
      loadMembers();
    }
  }, [hasAdminAccess, isAuthLoading, loadMembers]);

  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  const handleSelectMember = useCallback(async (memberId: string) => {
    setIsLoadingDetails(true);
    try {
      const nextMember = await getAdminUser(memberId);
      setSelectedMember(nextMember);
    } catch {
      setError("Unable to load member details right now.");
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const nextUser = await login({ email, password });
      if (!(nextUser.role === "SUPER_ADMIN" || nextUser.role === "PLATFORM_ADMIN")) {
        setError("This account does not have admin access.");
      }
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedJoinedClubs = useMemo(() => selectedMember?.joinedClubs || [], [selectedMember]);
  const selectedOwnedClubs = useMemo(() => selectedMember?.ownedClubs || [], [selectedMember]);

  if (isAuthLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-brutal-gray"><div className="border-4 border-black bg-white p-8 font-black uppercase">Checking admin session...</div></div>;
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brutal-gray px-4">
        <div className="w-full max-w-xl border-4 border-black bg-white p-8 shadow-[12px_12px_0_0_#000]">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brutal-blue">Admin Members</p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tighter">Admin Access</h1>
          <p className="mt-3 font-bold text-black/70">Sign in with an OCC platform admin account to view all registrations and member records.</p>
          <form onSubmit={handleAdminLogin} className="mt-8 space-y-5">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@occ.local" className="occ-field" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="occ-field" />
            {error ? <div className="border-2 border-black bg-red-500 p-3 font-black uppercase text-white">{error}</div> : null}
            <button type="submit" disabled={isSubmitting} className="w-full border-4 border-black bg-black px-6 py-4 font-black uppercase text-white shadow-[6px_6px_0_0_#1d2cf3]">
              {isSubmitting ? "Signing In..." : "Enter Admin"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brutal-gray px-4">
        <div className="w-full max-w-xl border-4 border-black bg-white p-8 shadow-[12px_12px_0_0_#000]">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brutal-blue">Admin Members</p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tighter">Access Restricted</h1>
          <p className="mt-4 font-bold text-black/70">This account is signed in, but it does not have platform admin permissions.</p>
          <div className="mt-6">
            <Link href="/dashboard" className="inline-flex items-center gap-2 border-2 border-black bg-black px-5 py-3 font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3]">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brutal-gray">
      <div className="sticky top-0 z-40 border-b-8 border-black bg-white">
        <SiteContainer className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-4">
            <div className="border-2 border-black bg-brutal-blue p-2 text-white"><Shield className="h-6 w-6" /></div>
            <div>
              <span className="block text-2xl font-black uppercase tracking-tighter">OCC Admin Panel</span>
              <span className="block text-xs font-black uppercase tracking-[0.2em] text-black/50">{user?.email}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/occ-gate-842" className="border-2 border-black bg-white px-4 py-2 text-sm font-black uppercase shadow-[3px_3px_0_0_#000]">Overview</Link>
            <Link href="/occ-gate-842/members" className="border-2 border-black bg-black px-4 py-2 text-sm font-black uppercase text-white shadow-[3px_3px_0_0_#1d2cf3]">Members</Link>
            <button onClick={logout} className="flex items-center gap-2 border-2 border-black bg-black px-5 py-2 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3]">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </SiteContainer>
      </div>

      <SiteContainer className="space-y-10 py-10">
        {error ? <div className="border-4 border-black bg-red-500 p-4 font-black uppercase text-white">{error}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="border-4 border-black bg-white p-8 shadow-[10px_10px_0_0_#000]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brutal-blue">Admin Members</p>
            <h1 className="mt-3 text-5xl font-black uppercase tracking-tighter md:text-6xl">Registered OCC Users</h1>
            <p className="mt-4 max-w-3xl text-lg font-bold text-gray-700">See every registered OCC user, inspect memberships, review owned clubs, and search the member base from one admin-only page.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">Total Results: {summary.totalUsers}</span>
              <span className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">Page: {page} / {Math.max(totalPages, 1)}</span>
            </div>
          </div>

          <div className="border-4 border-black bg-black p-8 text-white shadow-[10px_10px_0_0_#1d2cf3]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/60">Current Focus</p>
            <p className="mt-4 text-5xl font-black">{summary.membersWithClubs}</p>
            <p className="mt-2 text-xl font-black uppercase">Members In Clubs</p>
            <p className="mt-3 font-bold text-white/75">This panel gives admins a clean registration list plus club context, so it is easy to inspect real OCC member activity and account status.</p>
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Users" value={summary.totalUsers} />
          <SummaryCard label="Active Users" value={summary.activeUsers} />
          <SummaryCard label="Admins" value={summary.adminUsers} />
          <SummaryCard label="Users In Clubs" value={summary.membersWithClubs} />
        </section>

        <section className="border-4 border-black bg-white p-8 shadow-[8px_8px_0_0_#000]">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">Search Members</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or university" className="occ-field pl-11" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">Role</label>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="occ-select min-w-[180px]">
                {roleOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">Status</label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="occ-select min-w-[180px]">
                {statusOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <button onClick={loadMembers} disabled={isLoading} className="flex items-center justify-center gap-2 border-2 border-black bg-black px-4 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3] disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="border-4 border-black bg-white p-6 shadow-[8px_8px_0_0_#000]">
            <div className="flex items-center justify-between border-b-4 border-black pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-brutal-blue">Registration List</p>
                <h2 className="mt-2 text-3xl font-black uppercase tracking-tighter">All Members</h2>
              </div>
              <span className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">{members.length} visible</span>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">Loading OCC registrations...</div> : null}
              {!isLoading && members.length === 0 ? <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">No registrations match the current search and filters.</div> : null}

              {members.map((member) => {
                const isSelected = selectedMember?.id === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleSelectMember(member.id)}
                    className={`w-full border-2 border-black p-4 text-left shadow-[4px_4px_0_0_#000] transition-all ${isSelected ? "bg-[#eef1ff]" : "bg-white hover:translate-x-1 hover:translate-y-1 hover:shadow-none"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="h-14 w-14 overflow-hidden border-2 border-black bg-brutal-gray">
                          <ImageWithFallback src={member.profile?.avatarUrl || "/window.svg"} fallbackSrc="/window.svg" alt={member.profile?.displayName || member.email} className="h-full w-full object-cover" />
                        </div>
                        <div>
                          <p className="text-xl font-black uppercase">{member.profile?.displayName || member.email}</p>
                          <p className="mt-1 font-bold text-gray-700">{member.email}</p>
                          <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                            {member.role} | {member.status} | Joined {new Date(member.createdAt).toLocaleDateString("en-IN")}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-2 text-right text-xs font-black uppercase tracking-[0.14em] text-gray-600">
                        <span>{member.membershipCount} joined clubs</span>
                        <span>{member.ownedClubsCount} owned clubs</span>
                        <span>{member.postsCount} posts</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t-4 border-black pt-4">
              <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1} className="border-2 border-black bg-white px-4 py-2 text-sm font-black uppercase shadow-[3px_3px_0_0_#000] disabled:opacity-50">
                Previous
              </button>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-gray-500">Page {page} of {Math.max(totalPages, 1)}</p>
              <button type="button" onClick={() => setPage((current) => Math.min(current + 1, Math.max(totalPages, 1)))} disabled={page >= totalPages} className="border-2 border-black bg-black px-4 py-2 text-sm font-black uppercase text-white shadow-[3px_3px_0_0_#1d2cf3] disabled:opacity-50">
                Next
              </button>
            </div>
          </div>

          <div className="border-4 border-black bg-white p-6 shadow-[8px_8px_0_0_#000]">
            <div className="border-b-4 border-black pb-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-brutal-blue">Member Details</p>
              <h2 className="mt-2 text-3xl font-black uppercase tracking-tighter">Inspect Registration</h2>
            </div>

            {!selectedMember ? <div className="mt-6 border-2 border-dashed border-black p-6 font-bold text-gray-600">Select a member from the list to inspect details.</div> : null}

            {selectedMember ? (
              <div className="mt-6 space-y-6">
                {isLoadingDetails ? <div className="border-2 border-dashed border-black p-4 font-bold text-gray-600">Loading member details...</div> : null}

                <div className="flex items-start gap-4">
                  <div className="h-20 w-20 overflow-hidden border-4 border-black bg-brutal-gray">
                    <ImageWithFallback src={selectedMember.profile?.avatarUrl || "/window.svg"} fallbackSrc="/window.svg" alt={selectedMember.profile?.displayName || selectedMember.email} className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <p className="text-2xl font-black uppercase">{selectedMember.profile?.displayName || selectedMember.email}</p>
                    <p className="mt-1 font-bold text-gray-700">{selectedMember.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="border-2 border-black bg-brutal-gray px-3 py-1 text-xs font-black uppercase">{selectedMember.role}</span>
                      <span className="border-2 border-black bg-brutal-gray px-3 py-1 text-xs font-black uppercase">{selectedMember.status}</span>
                      <span className="border-2 border-black bg-brutal-gray px-3 py-1 text-xs font-black uppercase">{selectedMember.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border-2 border-black bg-[#f3f4f7] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Registration</p>
                    <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                      <p><span className="font-black uppercase text-black">Joined:</span> {new Date(selectedMember.createdAt).toLocaleString("en-IN")}</p>
                      <p><span className="font-black uppercase text-black">University:</span> {selectedMember.profile?.university || "Not added"}</p>
                      <p><span className="font-black uppercase text-black">Phone:</span> {selectedMember.profile?.phoneNumber || "Not added"}</p>
                      <p><span className="font-black uppercase text-black">Username:</span> {selectedMember.profile?.username || selectedMember.profile?.displayName || "Not available"}</p>
                    </div>
                  </div>

                  <div className="border-2 border-black bg-[#f3f4f7] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Activity</p>
                    <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                      <p><span className="font-black uppercase text-black">Joined Clubs:</span> {selectedMember.membershipCount}</p>
                      <p><span className="font-black uppercase text-black">Owned Clubs:</span> {selectedMember.ownedClubsCount}</p>
                      <p><span className="font-black uppercase text-black">Posts:</span> {selectedMember.postsCount}</p>
                      <p><span className="font-black uppercase text-black">Gig Applications:</span> {selectedMember.gigApplicationsCount}</p>
                    </div>
                  </div>
                </div>

                <div className="border-2 border-black bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Joined Clubs</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedJoinedClubs.length > 0 ? selectedJoinedClubs.map((club) => (
                      <span key={`${club.id}-${club.membershipRole || "member"}`} className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase">
                        {club.name} {club.membershipRole ? `(${club.membershipRole})` : ""}
                      </span>
                    )) : <span className="font-bold text-gray-600">No joined clubs yet.</span>}
                  </div>
                </div>

                <div className="border-2 border-black bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Owned Clubs</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedOwnedClubs.length > 0 ? selectedOwnedClubs.map((club) => (
                      <span key={club.id} className="border-2 border-black bg-[#eef1ff] px-3 py-2 text-xs font-black uppercase">
                        {club.name} {club.approvalStatus ? `(${club.approvalStatus})` : ""}
                      </span>
                    )) : <span className="font-bold text-gray-600">No owned clubs.</span>}
                  </div>
                </div>

                <div className="border-2 border-black bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Bio / Hobbies</p>
                  <p className="mt-3 font-bold text-gray-700">{selectedMember.profile?.bio || selectedMember.profile?.hobbies || "No extra profile details added yet."}</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </SiteContainer>
    </div>
  );
}
