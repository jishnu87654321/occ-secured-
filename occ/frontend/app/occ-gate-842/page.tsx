
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, CirclePlus, Clock3, LogOut, RefreshCw, Shield, Users, XCircle } from "lucide-react";
import api from "@/lib/api";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import {
  listAdminClubs,
  updateClubApprovalStatus,
  type AdminClubRecord,
  type AdminClubSummary,
} from "@/lib/clubApi";
import {
  createAdminGig,
  deleteAdminGig,
  listAdminApplications,
  listAdminGigs,
  listApplicationsForGig,
  updateApplicationStatus,
  updateAdminGig,
  type AdminApplicationSummary,
  type AdminGigInput,
  type GigApplicationRecord,
  type GigDetails,
} from "@/lib/gigApi";
import SiteContainer from "@/components/SiteContainer";

type AdminClubForm = {
  name: string;
  description: string;
  visibility: "PUBLIC" | "PRIVATE";
  bannerUrl: string;
  isActive: boolean;
};

type AdminStats = {
  usersCount: number;
  clubsCount: number;
  gigsCount: number;
  applicationsCount: number;
  postsCount: number;
  reportsCount: number;
  pendingReportsCount: number;
  pendingClubsCount?: number;
};

const emptyClub: AdminClubForm = { name: "", description: "", visibility: "PUBLIC", bannerUrl: "", isActive: true };
const emptyGig: AdminGigInput = {
  title: "",
  shortDescription: "",
  fullDescription: "",
  category: "",
  pricing: "",
  instructions: "",
  requirements: "",
  bannerUrl: "",
  isActive: true,
  isPublic: true,
};

const statusBadgeClasses: Record<string, string> = {
  PENDING: "bg-[#fff2bf] text-black",
  APPROVED: "bg-[#d5f5df] text-black",
  REJECTED: "bg-[#ffd9d9] text-black",
};

function summarizeApplications(items: GigApplicationRecord[]): AdminApplicationSummary {
  return items.reduce(
    (acc, application) => {
      acc.total += 1;
      if (application.status === "PENDING") acc.pending += 1;
      if (application.status === "APPROVED") acc.approved += 1;
      if (application.status === "REJECTED") acc.rejected += 1;
      return acc;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 },
  );
}

function summarizeClubs(items: AdminClubRecord[]): AdminClubSummary {
  return items.reduce(
    (acc, club) => {
      acc.total += 1;
      if (club.approvalStatus === "PENDING") acc.pending += 1;
      if (club.approvalStatus === "APPROVED") acc.approved += 1;
      if (club.approvalStatus === "REJECTED") acc.rejected += 1;
      return acc;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 },
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-4 border-black bg-white p-6 shadow-[8px_8px_0_0_#000]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: React.ReactNode }) {
  return (
    <div className={`h-full border-4 border-black p-5 shadow-[6px_6px_0_0_#000] ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[11rem] text-xs font-black uppercase tracking-[0.18em] leading-6 break-words">{label}</p>
        <div className="shrink-0 pt-1">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
}

function AdminSection({
  kicker,
  title,
  description,
  actions,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-4 border-black bg-white p-8 shadow-[8px_8px_0_0_#000]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-black pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brutal-blue">{kicker}</p>
          <h2 className="mt-2 text-3xl font-black uppercase tracking-tighter">{title}</h2>
          <p className="mt-2 max-w-3xl font-bold text-gray-600">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function AdminPage() {
  const { user, login, logout, isLoggedIn, isAuthLoading, refreshClubs } = useUser();
  const hasAdminAccess = user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_ADMIN";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clubs, setClubs] = useState<AdminClubRecord[]>([]);
  const [clubSummary, setClubSummary] = useState<AdminClubSummary>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [clubForm, setClubForm] = useState<AdminClubForm>(emptyClub);
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [gigs, setGigs] = useState<GigDetails[]>([]);
  const [gigForm, setGigForm] = useState<AdminGigInput>(emptyGig);
  const [editingGigId, setEditingGigId] = useState<string | null>(null);
  const [applications, setApplications] = useState<GigApplicationRecord[]>([]);
  const [summary, setSummary] = useState<AdminApplicationSummary>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [query, setQuery] = useState("");
  const [selectedGigId, setSelectedGigId] = useState("");
  const [selectedGigApplications, setSelectedGigApplications] = useState<GigApplicationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isLoadingGigApplicants, setIsLoadingGigApplicants] = useState(false);
  const [actioningApplicationId, setActioningApplicationId] = useState("");
  const [actioningClubId, setActioningClubId] = useState("");
  const [clubStatusFilter, setClubStatusFilter] = useState("PENDING");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  const selectedGig = useMemo(() => gigs.find((gig) => gig.id === selectedGigId) || null, [gigs, selectedGigId]);
  const filteredClubSubmissions = useMemo(
    () => (clubStatusFilter === "ALL" ? clubs : clubs.filter((club) => (club.approvalStatus || "PENDING") === clubStatusFilter)),
    [clubStatusFilter, clubs]
  );

  const filteredApplications = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return applications;
    return applications.filter((application) => {
      const applicantName = application.user?.profile?.displayName || application.name;
      return [
        applicantName,
        application.email,
        application.phone,
        application.college,
        application.reason,
        application.relevantExperience,
        application.gig?.title,
        application.gig?.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [applications, query]);

  const applyApplicationUpdate = useCallback((updatedApplication: GigApplicationRecord) => {
    setApplications((prev) => {
      const next = prev.map((application) =>
        application.id === updatedApplication.id ? { ...application, ...updatedApplication } : application,
      );
      setSummary(summarizeApplications(next));
      return next;
    });
    setSelectedGigApplications((prev) =>
      prev.map((application) =>
        application.id === updatedApplication.id ? { ...application, ...updatedApplication } : application,
      ),
    );
    setLastUpdatedAt(new Date().toISOString());
  }, []);

  const applyClubUpdate = useCallback((updatedClub: AdminClubRecord) => {
    setClubs((prev) => {
      const next = prev.map((club) => (club.id === updatedClub.id ? { ...club, ...updatedClub } : club));
      setClubSummary(summarizeClubs(next));
      return next;
    });
  }, []);

  const loadPrimaryAdminData = useCallback(async () => {
    if (!hasAdminAccess) return;
    setIsLoading(true);
    setError("");
    try {
      const [statsResponse, applicationsResponse] = await Promise.all([
        api.get("/occ-gate-842/dashboard"),
        listAdminApplications(statusFilter),
      ]);
      setStats(statsResponse.data?.data?.stats || null);
      setApplications(applicationsResponse.items);
      setSummary(applicationsResponse.summary);
      setLastUpdatedAt(new Date().toISOString());
    } catch {
      setError("Unable to load admin data right now.");
    } finally {
      setIsLoading(false);
    }
  }, [hasAdminAccess, statusFilter]);

  const loadSecondaryAdminData = useCallback(async () => {
    if (!hasAdminAccess) return;
    setIsLoadingCollections(true);
    try {
      const [clubsResponse, gigsResponse] = await Promise.all([listAdminClubs("ALL"), listAdminGigs()]);
      setClubs(clubsResponse.items);
      setClubSummary(clubsResponse.summary);
      setGigs(gigsResponse);
    } catch {
      setError((prev) => prev || "Unable to load clubs and gigs right now.");
    } finally {
      setIsLoadingCollections(false);
    }
  }, [hasAdminAccess]);

  useEffect(() => {
    if (!isAuthLoading && hasAdminAccess) {
      loadPrimaryAdminData();
      loadSecondaryAdminData();
    }
  }, [hasAdminAccess, isAuthLoading, loadPrimaryAdminData, loadSecondaryAdminData]);

  useEffect(() => {
    if (!selectedGigId || !hasAdminAccess) return;
    let active = true;
    setIsLoadingGigApplicants(true);
    listApplicationsForGig(selectedGigId)
      .then((items) => {
        if (active) setSelectedGigApplications(items);
      })
      .catch(() => {
        if (active) setSelectedGigApplications([]);
      })
      .finally(() => {
        if (active) setIsLoadingGigApplicants(false);
      });
    return () => {
      active = false;
    };
  }, [hasAdminAccess, selectedGigId]);

  const jumpToGigForm = (nextForm?: Partial<AdminGigInput>) => {
    setEditingGigId(null);
    setGigForm({ ...emptyGig, ...nextForm });
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("admin-gig-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const nextUser = await login({ email, password });
      if (!(nextUser.role === "SUPER_ADMIN" || nextUser.role === "PLATFORM_ADMIN")) {
        logout();
        setError("This account does not have admin access.");
      }
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClubSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingClubId) {
        await api.put(`/admin/clubs/${editingClubId}`, clubForm);
      } else {
        await api.post("/admin/clubs", clubForm);
      }
      setClubForm(emptyClub);
      setEditingClubId(null);
      await loadSecondaryAdminData();
      await refreshClubs({ force: true });
    } catch {
      setError("Unable to save club changes.");
    }
  };

  const handleGigSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingGigId) {
        await updateAdminGig(editingGigId, gigForm);
      } else {
        await createAdminGig(gigForm);
      }
      setGigForm(emptyGig);
      setEditingGigId(null);
      await loadSecondaryAdminData();
    } catch {
      setError("Unable to save gig changes.");
    }
  };

  const handleGigDelete = async (gigId: string) => {
    await deleteAdminGig(gigId);
    if (selectedGigId === gigId) {
      setSelectedGigId("");
      setSelectedGigApplications([]);
    }
    await loadSecondaryAdminData();
  };

  const handleStatusUpdate = async (applicationId: string, status: "APPROVED" | "REJECTED" | "PENDING") => {
    setActioningApplicationId(applicationId);
    try {
      const updatedApplication = await updateApplicationStatus(applicationId, status);
      applyApplicationUpdate(updatedApplication);
    } catch {
      setError("Unable to update application status right now.");
    } finally {
      setActioningApplicationId("");
    }
  };

  const handleClubDeactivate = async (clubId: string) => {
    setActioningClubId(clubId);
    try {
      await api.delete(`/admin/clubs/${clubId}`);
      await loadSecondaryAdminData();
      await refreshClubs({ force: true });
    } catch {
      setError("Unable to deactivate this club right now.");
    } finally {
      setActioningClubId("");
    }
  };

  const handleClubDelete = async (clubId: string) => {
    setActioningClubId(clubId);
    try {
      await api.delete(`/admin/clubs/${clubId}/permanent`);
      setClubs((prev) => {
        const next = prev.filter((club) => club.id !== clubId);
        setClubSummary(summarizeClubs(next));
        return next;
      });
      if (editingClubId === clubId) {
        setEditingClubId(null);
        setClubForm(emptyClub);
      }
      await refreshClubs({ force: true });
    } catch {
      setError("Unable to permanently delete this club right now.");
    } finally {
      setActioningClubId("");
    }
  };

  const handleClubStatusUpdate = async (clubId: string, status: "APPROVED" | "REJECTED" | "PENDING") => {
    setActioningClubId(clubId);
    try {
      const updatedClub = await updateClubApprovalStatus(clubId, status);
      applyClubUpdate(updatedClub);
      await refreshClubs({ force: true });
    } catch {
      setError("Unable to update club approval status right now.");
    } finally {
      setActioningClubId("");
    }
  };

  if (isAuthLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-brutal-gray"><div className="border-4 border-black bg-white p-8 font-black uppercase">Checking admin session...</div></div>;
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brutal-gray px-4">
        <div className="w-full max-w-md border-4 border-black bg-white p-10 shadow-[12px_12px_0_0_#1d2cf3]">
          <div className="mb-8 flex items-center gap-4">
            <div className="border-2 border-black bg-brutal-blue p-3 text-white"><Shield className="h-8 w-8" /></div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Admin Access</h1>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-5">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@occ.local" className="occ-field" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="occ-field" />
            {error ? <p className="border-4 border-black bg-red-500 p-3 font-black uppercase text-white">{error}</p> : null}
            <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-3 border-4 border-black bg-black py-4 font-black uppercase text-white shadow-[6px_6px_0_0_#1d2cf3]">
              {isSubmitting ? "Signing In..." : "Enter Admin"} <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brutal-gray px-4">
        <div className="w-full max-w-lg border-4 border-black bg-white p-10 shadow-[12px_12px_0_0_#000]">
          <h1 className="text-4xl font-black uppercase tracking-tighter">Access Restricted</h1>
          <p className="mt-4 font-bold text-black/70">This account is signed in, but it does not have platform admin permissions.</p>
          <button onClick={logout} className="mt-8 border-4 border-black bg-black px-6 py-3 font-black uppercase text-white shadow-[6px_6px_0_0_#1d2cf3]">Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brutal-gray">
      <div className="sticky top-0 z-40 border-b-8 border-black bg-white">
        <SiteContainer className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-4">
            <div className="border-2 border-black bg-brutal-blue p-2 text-white"><Shield className="h-6 w-6" /></div>
            <div>
              <span className="block text-2xl font-black uppercase tracking-tighter">OCC Admin Panel</span>
              <span className="block text-xs font-black uppercase tracking-[0.2em] text-black/50">{user?.email}</span>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 border-2 border-black bg-black px-5 py-2 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3]">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </SiteContainer>
      </div>

      <SiteContainer className="space-y-10 py-10">
        {error ? <div className="border-4 border-black bg-red-500 p-4 font-black uppercase text-white">{error}</div> : null}
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="border-4 border-black bg-white p-8 shadow-[10px_10px_0_0_#000]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brutal-blue">Moderation Console</p>
            <h1 className="mt-3 text-5xl font-black uppercase tracking-tighter md:text-6xl">OCC Admin Panel</h1>
            <p className="mt-4 max-w-3xl text-lg font-bold text-gray-700">Review applications, manage gigs, moderate clubs, and control platform workflows from one command center.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">Admin: {user?.email}</span>
              <span className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">Pending Reviews: {summary.pending}</span>
              <span className="border-2 border-black bg-brutal-gray px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">Last Sync: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Loading"}</span>
              <Link href="/occ-gate-842/members" className="border-2 border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] shadow-[3px_3px_0_0_#000]">
                View Members
              </Link>
            </div>
          </div>

          <div className="border-4 border-black bg-black p-8 text-white shadow-[10px_10px_0_0_#1d2cf3]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/60">Review Priority</p>
            <p className="mt-4 text-5xl font-black">{summary.pending}</p>
            <p className="mt-2 text-xl font-black uppercase">Pending Applications</p>
            <p className="mt-3 font-bold text-white/75">New gig applications land here first. Approvals and rejections update the database immediately and reflect in the applicant dashboard after refresh.</p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs font-black uppercase tracking-[0.16em]">
              <div className="occ-dark-inset px-3 py-3"><p>{summary.total}</p><p className="mt-1">Total</p></div>
              <div className="occ-dark-inset px-3 py-3"><p>{summary.approved}</p><p className="mt-1">Approved</p></div>
              <div className="occ-dark-inset px-3 py-3"><p>{summary.rejected}</p><p className="mt-1">Rejected</p></div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-8">
          <StatCard label="Total Users" value={stats?.usersCount || 0} />
          <StatCard label="Total Clubs" value={stats?.clubsCount || 0} />
          <StatCard label="Pending Clubs" value={stats?.pendingClubsCount || 0} />
          <StatCard label="Total Gigs" value={stats?.gigsCount || 0} />
          <StatCard label="Applications" value={stats?.applicationsCount || 0} />
          <StatCard label="Posts" value={stats?.postsCount || 0} />
          <StatCard label="Reports" value={stats?.reportsCount || 0} />
          <StatCard label="Pending Reports" value={stats?.pendingReportsCount || 0} />
        </section>

        <AdminSection
          kicker="Quick Actions"
          title="Gig Publishing Controls"
          description="Start a new gig draft or jump straight into posting a live public opportunity."
          actions={
            <>
              <button type="button" onClick={() => jumpToGigForm({ isActive: false, isPublic: false })} className="flex items-center gap-2 border-2 border-black bg-white px-5 py-3 font-black uppercase shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                <CirclePlus className="h-4 w-4" /> Add Gig Draft
              </button>
              <button type="button" onClick={() => jumpToGigForm({ isActive: true, isPublic: true })} className="flex items-center gap-2 border-2 border-black bg-black px-5 py-3 font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                <BriefcaseBusiness className="h-4 w-4" /> Post Gig
              </button>
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="border-2 border-black bg-[#fff9d9] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Moderation Focus</p><p className="mt-2 font-bold text-gray-700">Applications review sits at the top so admins can clear pending work before managing content.</p></div>
            <div className="border-2 border-black bg-[#e8faef] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Publishing Flow</p><p className="mt-2 font-bold text-gray-700">Draft hidden gigs first, or publish live public gigs directly from this control panel.</p></div>
            <div className="border-2 border-black bg-[#eef1ff] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">User Sync</p><p className="mt-2 font-bold text-gray-700">Application decisions update the applicant dashboard and protected gig access on the next refresh.</p></div>
          </div>
        </AdminSection>

        <AdminSection
          kicker="Moderation Queue"
          title="Applications Review Workspace"
          description="Review every submitted gig application, search by applicant or gig, filter by status, and take action from one place."
          actions={
            <button onClick={loadPrimaryAdminData} disabled={isLoading} className="flex items-center gap-2 border-2 border-black bg-black px-4 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Refreshing..." : "Refresh Queue"}
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="All Applications" value={summary.total} tone="bg-white" icon={<Users className="h-5 w-5" />} />
            <SummaryCard label="Pending" value={summary.pending} tone="bg-[#fff9d9]" icon={<Clock3 className="h-5 w-5" />} />
            <SummaryCard label="Approved" value={summary.approved} tone="bg-[#e8faef]" icon={<CheckCircle2 className="h-5 w-5" />} />
            <SummaryCard label="Rejected" value={summary.rejected} tone="bg-[#ffe7e7]" icon={<XCircle className="h-5 w-5" />} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">Search Applications</label>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applicant, email, college, gig, reason" className="occ-field" />
            </div>
            <div className="flex flex-wrap gap-3">
              {["ALL", "PENDING", "APPROVED", "REJECTED"].map((status) => (
                <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`border-2 border-black px-4 py-2 text-sm font-black uppercase shadow-[3px_3px_0_0_#000] transition-all ${statusFilter === status ? "bg-black text-white" : "bg-white text-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none"}`}>
                  {status === "ALL" ? "All statuses" : status}
                </button>
              ))}
            </div>
          </div>

          {filteredApplications.length > 0 ? (
            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              {filteredApplications.map((application) => {
                const applicantName = application.user?.profile?.displayName || application.name;
                const reviewer = application.reviewedByAdmin?.profile?.displayName || application.reviewedByAdmin?.email;
                const isUpdating = actioningApplicationId === application.id;
                const profile = application.user?.profile;
                return (
                  <article key={application.id} className="border-2 border-black bg-[#f3f4f7] p-5 shadow-[4px_4px_0_0_#000]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-2xl font-black uppercase">{applicantName}</p>
                        <p className="mt-2 text-sm font-black uppercase tracking-[0.16em] text-gray-500">Applied {new Date(application.createdAt).toLocaleDateString("en-IN")} | {application.gig?.title || "Gig"}</p>
                      </div>
                      <span className={`border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${statusBadgeClasses[application.status] || "bg-white text-black"}`}>{application.status}</span>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Applicant Details</p>
                        <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                          <p><span className="font-black uppercase text-black">Name:</span> {applicantName}</p>
                          <p><span className="font-black uppercase text-black">Email:</span> {application.user?.email || application.email}</p>
                          <p><span className="font-black uppercase text-black">Phone:</span> {profile?.phoneNumber || application.phone}</p>
                          <p><span className="font-black uppercase text-black">College:</span> {profile?.university || application.college}</p>
                          <p><span className="font-black uppercase text-black">User ID:</span> {application.user?.id || application.userId || "Not linked"}</p>
                          <p><span className="font-black uppercase text-black">Application ID:</span> {application.id}</p>
                          <p><span className="font-black uppercase text-black">Role:</span> {application.user?.role || "USER"}</p>
                          <p><span className="font-black uppercase text-black">Account:</span> {application.user?.isActive === false ? "Inactive" : "Active"}{application.user?.status ? ` / ${application.user.status}` : ""}</p>
                        </div>
                      </div>
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Stored Profile</p>
                        <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                          <p><span className="font-black uppercase text-black">Bio:</span> {profile?.bio || "Not added"}</p>
                          <p><span className="font-black uppercase text-black">Hobbies:</span> {profile?.hobbies || "Not added"}</p>
                          <p><span className="font-black uppercase text-black">Joined OCC:</span> {application.user?.createdAt ? new Date(application.user.createdAt).toLocaleDateString("en-IN") : "Unknown"}</p>
                          <p><span className="font-black uppercase text-black">Profile Updated:</span> {profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString("en-IN") : "Unknown"}</p>
                          <p><span className="font-black uppercase text-black">Reviewed:</span> {application.reviewedAt ? new Date(application.reviewedAt).toLocaleDateString("en-IN") : "Not reviewed yet"}</p>
                          <p><span className="font-black uppercase text-black">Reviewed By:</span> {reviewer || "Decision pending"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Gig Details</p>
                        <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                          <p><span className="font-black uppercase text-black">Gig:</span> {application.gig?.title || "Gig"}</p>
                          <p><span className="font-black uppercase text-black">Category:</span> {application.gig?.category || "Opportunity"}</p>
                          <p><span className="font-black uppercase text-black">Summary:</span> {application.gig?.shortDescription || "No summary added."}</p>
                        </div>
                      </div>
                      <div className="border-2 border-black bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Application Response</p>
                        <div className="mt-3 space-y-3 text-sm font-bold text-gray-700">
                          <div>
                            <p className="font-black uppercase text-black">Reason:</p>
                            <p className="mt-1">{application.reason}</p>
                          </div>
                          <div>
                            <p className="font-black uppercase text-black">Relevant Experience:</p>
                            <p className="mt-1">{application.relevantExperience || "No extra experience added."}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="button" onClick={() => handleStatusUpdate(application.id, "APPROVED")} disabled={isUpdating || application.status === "APPROVED"} className="border-2 border-black bg-black px-4 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60">
                        {isUpdating && application.status !== "APPROVED" ? "Saving..." : "Approve"}
                      </button>
                      <button type="button" onClick={() => handleStatusUpdate(application.id, "REJECTED")} disabled={isUpdating || application.status === "REJECTED"} className="border-2 border-black bg-white px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60">
                        {isUpdating && application.status !== "REJECTED" ? "Saving..." : "Reject"}
                      </button>
                      {application.status !== "PENDING" ? (
                        <button type="button" onClick={() => handleStatusUpdate(application.id, "PENDING")} disabled={isUpdating} className="border-2 border-black bg-[#fff2bf] px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60">
                          Move To Pending
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 border-2 border-dashed border-black p-6 font-bold text-gray-600">{query ? "No applications match the current search or filter." : "No applications match the current filter yet."}</div>
          )}
        </AdminSection>

        <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <AdminSection kicker="Gig Management" title="Manage Gigs" description="Create, edit, publish, hide, and inspect applicant queues for every gig.">
            <form id="admin-gig-form" onSubmit={handleGigSubmit} className="grid gap-4">
              <input required value={gigForm.title} onChange={(e) => setGigForm({ ...gigForm, title: e.target.value })} placeholder="Gig title" className="occ-field" />
              <input required value={gigForm.category} onChange={(e) => setGigForm({ ...gigForm, category: e.target.value })} placeholder="Category" className="occ-field" />
              <textarea required value={gigForm.shortDescription} onChange={(e) => setGigForm({ ...gigForm, shortDescription: e.target.value })} placeholder="Short description" rows={3} className="occ-textarea" />
              <textarea required value={gigForm.fullDescription} onChange={(e) => setGigForm({ ...gigForm, fullDescription: e.target.value })} placeholder="Full description" rows={5} className="occ-textarea" />
              <input value={gigForm.pricing || ""} onChange={(e) => setGigForm({ ...gigForm, pricing: e.target.value })} placeholder="Pricing" className="occ-field" />
              <textarea value={gigForm.instructions || ""} onChange={(e) => setGigForm({ ...gigForm, instructions: e.target.value })} placeholder="Instructions" rows={3} className="occ-textarea" />
              <textarea value={gigForm.requirements || ""} onChange={(e) => setGigForm({ ...gigForm, requirements: e.target.value })} placeholder="Requirements" rows={3} className="occ-textarea" />
              <input value={gigForm.bannerUrl || ""} onChange={(e) => setGigForm({ ...gigForm, bannerUrl: e.target.value })} placeholder="Banner URL" className="occ-field" />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 border-4 border-black p-4 font-black uppercase"><input type="checkbox" checked={!!gigForm.isActive} onChange={(e) => setGigForm({ ...gigForm, isActive: e.target.checked })} className="occ-check" />Active</label>
                <label className="flex items-center gap-3 border-4 border-black p-4 font-black uppercase"><input type="checkbox" checked={!!gigForm.isPublic} onChange={(e) => setGigForm({ ...gigForm, isPublic: e.target.checked })} className="occ-check" />Public</label>
              </div>
              <button className="border-4 border-black bg-black px-6 py-4 font-black uppercase text-white shadow-[6px_6px_0_0_#1d2cf3]">{editingGigId ? "Update Gig" : "Create Gig"}</button>
            </form>

            <div className="mt-8 space-y-4">
              {isLoadingCollections && gigs.length === 0 ? <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">Loading gigs...</div> : null}
              {gigs.map((gig) => (
                <div key={gig.id} className="border-2 border-black bg-brutal-gray p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xl font-black uppercase">{gig.title}</p>
                      <p className="mt-2 font-bold text-gray-700">{gig.shortDescription}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-gray-500">{gig.category} | {gig.isPublic ? "Public" : "Hidden"} | {gig.isActive ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => { setEditingGigId(gig.id); setGigForm({ title: gig.title, shortDescription: gig.shortDescription, fullDescription: gig.fullDescription || "", category: gig.category, pricing: gig.pricing || "", instructions: gig.instructions || "", requirements: gig.requirements || "", bannerUrl: gig.bannerUrl || "", isActive: !!gig.isActive, isPublic: !!gig.isPublic }); }} className="border-2 border-black bg-white px-4 py-2 font-black uppercase">Edit</button>
                      <button onClick={() => setSelectedGigId(gig.id)} className="border-2 border-black bg-white px-4 py-2 font-black uppercase">Applicants</button>
                      <button onClick={() => handleGigDelete(gig.id)} className="border-2 border-black bg-black px-4 py-2 font-black uppercase text-white">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AdminSection>

          <div className="grid gap-8">
            <AdminSection kicker="Gig Queue" title="Applicants By Gig" description={selectedGig ? `Viewing the full applicant queue for ${selectedGig.title}.` : "Pick a gig from Manage Gigs to inspect its applicant list."}>
              {isLoadingGigApplicants ? (
                <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">Loading applicants...</div>
              ) : selectedGigApplications.length > 0 ? (
                <div className="grid gap-4">
                  {selectedGigApplications.map((application) => {
                    const isUpdating = actioningApplicationId === application.id;
                    const profile = application.user?.profile;
                    return (
                      <div key={application.id} className="border-2 border-black bg-[#f3f4f7] p-5 shadow-[4px_4px_0_0_#000]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xl font-black uppercase">{application.user?.profile?.displayName || application.name}</p>
                            <p className="mt-2 font-bold text-gray-700">{application.email}</p>
                          </div>
                          <span className={`border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${statusBadgeClasses[application.status] || "bg-white text-black"}`}>{application.status}</span>
                        </div>
                        <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                          <p><span className="font-black uppercase text-black">Phone:</span> {profile?.phoneNumber || application.phone}</p>
                          <p><span className="font-black uppercase text-black">College:</span> {profile?.university || application.college}</p>
                          <p><span className="font-black uppercase text-black">Bio:</span> {profile?.bio || "Not added"}</p>
                          <p><span className="font-black uppercase text-black">Hobbies:</span> {profile?.hobbies || "Not added"}</p>
                          <p><span className="font-black uppercase text-black">Reason:</span> {application.reason}</p>
                          <p><span className="font-black uppercase text-black">Experience:</span> {application.relevantExperience || "No extra experience added."}</p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button type="button" onClick={() => handleStatusUpdate(application.id, "APPROVED")} disabled={isUpdating || application.status === "APPROVED"} className="border-2 border-black bg-black px-4 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3] disabled:opacity-60">
                            {isUpdating && application.status !== "APPROVED" ? "Saving..." : "Approve"}
                          </button>
                          <button type="button" onClick={() => handleStatusUpdate(application.id, "REJECTED")} disabled={isUpdating || application.status === "REJECTED"} className="border-2 border-black bg-white px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] disabled:opacity-60">
                            {isUpdating && application.status !== "REJECTED" ? "Saving..." : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">{selectedGigId ? "No applicants for this gig yet." : "No gig selected yet."}</div>
              )}
            </AdminSection>

            <AdminSection
              kicker="Club Moderation"
              title="Club Approval Queue"
              description="User-submitted clubs stay pending until an admin approves them. Approvals make clubs public and joinable, while rejections keep them hidden."
              actions={
                <>
                  {["ALL", "PENDING", "APPROVED", "REJECTED"].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setClubStatusFilter(status)}
                      className={`border-2 border-black px-4 py-2 text-sm font-black uppercase shadow-[3px_3px_0_0_#000] transition-all ${clubStatusFilter === status ? "bg-black text-white" : "bg-white text-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none"}`}
                    >
                      {status}
                    </button>
                  ))}
                </>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Club Submissions" value={clubSummary.total} tone="bg-white" icon={<Shield className="h-5 w-5" />} />
                <SummaryCard label="Pending Clubs" value={clubSummary.pending} tone="bg-[#fff9d9]" icon={<Clock3 className="h-5 w-5" />} />
                <SummaryCard label="Approved Clubs" value={clubSummary.approved} tone="bg-[#e8faef]" icon={<CheckCircle2 className="h-5 w-5" />} />
                <SummaryCard label="Rejected Clubs" value={clubSummary.rejected} tone="bg-[#ffe7e7]" icon={<XCircle className="h-5 w-5" />} />
              </div>

              <div className="mt-8 space-y-4">
                {isLoadingCollections && clubs.length === 0 ? <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">Loading club moderation queue...</div> : null}
                {filteredClubSubmissions.length > 0 ? filteredClubSubmissions.map((club) => {
                  const isUpdatingClub = actioningClubId === club.id;
                  const creatorName = club.owner?.profile?.displayName || club.owner?.email || "Club Creator";
                  const reviewerName = club.reviewedByAdmin?.profile?.displayName || club.reviewedByAdmin?.email || "Decision pending";
                  return (
                    <article key={club.id} className="border-2 border-black bg-[#f3f4f7] p-5 shadow-[4px_4px_0_0_#000]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-2xl font-black uppercase">{club.name}</p>
                          <p className="mt-2 text-sm font-black uppercase tracking-[0.16em] text-gray-500">
                            Submitted {club.createdAt ? new Date(club.createdAt).toLocaleDateString("en-IN") : "Recently"} | {club.category || "Club"} | {club.visibility}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${statusBadgeClasses[club.approvalStatus || "PENDING"] || "bg-white text-black"}`}>
                            {club.approvalStatus || "PENDING"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        <div className="border-2 border-black bg-white p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Creator Details</p>
                          <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                            <p><span className="font-black uppercase text-black">Name:</span> {creatorName}</p>
                            <p><span className="font-black uppercase text-black">Email:</span> {club.owner?.email || "Not available"}</p>
                            <p><span className="font-black uppercase text-black">Phone:</span> {club.owner?.profile?.phoneNumber || "Not added"}</p>
                            <p><span className="font-black uppercase text-black">College:</span> {club.owner?.profile?.university || "Not added"}</p>
                          </div>
                        </div>
                        <div className="border-2 border-black bg-white p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Club Details</p>
                          <div className="mt-3 space-y-2 text-sm font-bold text-gray-700">
                            <p><span className="font-black uppercase text-black">Description:</span> {club.description}</p>
                            <p><span className="font-black uppercase text-black">Members:</span> {club.membersCount ?? 0}</p>
                            <p><span className="font-black uppercase text-black">Reviewer:</span> {reviewerName}</p>
                            <p><span className="font-black uppercase text-black">Reviewed:</span> {club.reviewedAt ? new Date(club.reviewedAt).toLocaleDateString("en-IN") : "Not reviewed yet"}</p>
                            <p><span className="font-black uppercase text-black">Rejection:</span> {club.rejectionReason || "None"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleClubStatusUpdate(club.id, "APPROVED")}
                          disabled={isUpdatingClub || club.approvalStatus === "APPROVED"}
                          className="border-2 border-black bg-black px-4 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0_0_#1d2cf3] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60"
                        >
                          {isUpdatingClub && club.approvalStatus !== "APPROVED" ? "Saving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClubStatusUpdate(club.id, "REJECTED")}
                          disabled={isUpdatingClub || club.approvalStatus === "REJECTED"}
                          className="border-2 border-black bg-white px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60"
                        >
                          {isUpdatingClub && club.approvalStatus !== "REJECTED" ? "Saving..." : "Reject"}
                        </button>
                        {club.approvalStatus !== "PENDING" ? (
                          <button
                            type="button"
                            onClick={() => handleClubStatusUpdate(club.id, "PENDING")}
                            disabled={isUpdatingClub}
                            className="border-2 border-black bg-[#fff2bf] px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-60"
                          >
                            Move To Pending
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                }) : (
                  <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">No clubs match the current moderation filter yet.</div>
                )}
              </div>
            </AdminSection>

            <AdminSection kicker="Club Controls" title="Manage Approved Clubs" description="Create admin-owned clubs directly, edit them, deactivate them, or permanently delete them when they should be removed from OCC entirely.">
              <form onSubmit={handleClubSubmit} className="grid gap-4">
                <input required value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} placeholder="Club name" className="occ-field" />
                <textarea required value={clubForm.description} onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })} placeholder="Description" rows={4} className="occ-textarea" />
                <input value={clubForm.bannerUrl} onChange={(e) => setClubForm({ ...clubForm, bannerUrl: e.target.value })} placeholder="Banner URL" className="occ-field" />
                <div className="grid gap-4 md:grid-cols-2">
                  <select value={clubForm.visibility} onChange={(e) => setClubForm({ ...clubForm, visibility: e.target.value as "PUBLIC" | "PRIVATE" })} className="occ-select">
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="PRIVATE">PRIVATE</option>
                  </select>
                  <label className="flex items-center gap-3 border-4 border-black p-4 font-black uppercase"><input type="checkbox" checked={clubForm.isActive} onChange={(e) => setClubForm({ ...clubForm, isActive: e.target.checked })} className="occ-check" />Active</label>
                </div>
                <button className="border-4 border-black bg-black px-6 py-4 font-black uppercase text-white shadow-[6px_6px_0_0_#1d2cf3]">{editingClubId ? "Update Club" : "Create Club"}</button>
              </form>

              <div className="mt-8 space-y-4">
                {isLoadingCollections && clubs.length === 0 ? <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">Loading clubs...</div> : null}
                {clubs.filter((club) => club.approvalStatus === "APPROVED").length > 0 ? (
                  clubs.filter((club) => club.approvalStatus === "APPROVED").map((club) => {
                    const isUpdatingManagedClub = actioningClubId === club.id;
                    return (
                    <div key={club.id} className="border-2 border-black bg-brutal-gray p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xl font-black uppercase">{club.name}</p>
                          <p className="mt-2 font-bold text-gray-700">{club.description}</p>
                          <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-gray-500">{club.visibility} | {club.isActive ? "Active" : "Inactive"} | {club.membersCount || 0} members</p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => { setEditingClubId(club.id); setClubForm({ name: club.name, description: club.description, visibility: club.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC", bannerUrl: club.bannerUrl || "", isActive: !!club.isActive }); }}
                            disabled={isUpdatingManagedClub}
                            className="border-2 border-black bg-white px-4 py-2 font-black uppercase disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleClubDeactivate(club.id)}
                            disabled={isUpdatingManagedClub}
                            className="border-2 border-black bg-black px-4 py-2 font-black uppercase text-white disabled:opacity-60"
                          >
                            {isUpdatingManagedClub ? "Working..." : "Deactivate"}
                          </button>
                          <button
                            onClick={() => handleClubDelete(club.id)}
                            disabled={isUpdatingManagedClub}
                            className="border-2 border-black bg-red-500 px-4 py-2 font-black uppercase text-white disabled:opacity-60"
                          >
                            {isUpdatingManagedClub ? "Working..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )})
                ) : (
                  <div className="border-2 border-dashed border-black p-6 font-bold text-gray-600">No approved clubs are ready for admin management yet.</div>
                )}
              </div>
            </AdminSection>
          </div>
        </section>
      </SiteContainer>
    </div>
  );
}
