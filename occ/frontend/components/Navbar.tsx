"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { LayoutDashboard, Compass, LogIn, LogOut, IndianRupee, UserPlus } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useTransition } from "@/context/TransitionContext";
import ImageWithFallback from "@/components/ImageWithFallback";

export default function Navbar() {
  const { user, logout, isLoggedIn, isAuthLoading } = useUser();
  const { triggerTransition, isTransitioning } = useTransition();
  const isHydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  // Show authenticated nav if we are hydrated AND (logged in OR still loading auth state)
  // This prevents the flicker to 'Login' button when we actually have a valid token
  const showAuthenticatedNav = isHydrated && (isLoggedIn || isAuthLoading);
  const profileImageSrc = user?.profilePicture?.trim() || null;

  const handleLogout = () => {
    logout();
  };

  const handleNavigation = (e: React.MouseEvent, route: string) => {
    e.preventDefault();
    if (isTransitioning) return;
    triggerTransition(route);
  };

  return (
    <nav className="bg-white border-b-4 border-black p-4 sticky top-0 z-50 shadow-[0_4px_0_0_rgba(0,0,0,0.05)]">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-4 md:px-6">
        <Link href="/" className="flex flex-col group">
          <div className="text-4xl font-black uppercase tracking-tighter text-black flex items-center gap-2">
            OCC<span className="text-brutal-blue group-hover:animate-bounce">.</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-tight text-black">
            Off Campus Clubs
          </div>
        </Link>
        
        {/* Desktop Links */}
        <div className="hidden md:flex gap-10 items-center">
          <Link href="/feed" onClick={(e) => handleNavigation(e, "/feed")} className="flex items-center gap-2 font-black uppercase text-sm text-black hover:text-brutal-blue transition-colors">
            <LayoutDashboard className="w-4 h-4" /> Feed
          </Link>
          <Link href="/explore" onClick={(e) => handleNavigation(e, "/explore")} className="flex items-center gap-2 font-black uppercase text-sm text-black hover:text-brutal-blue transition-colors">
            <Compass className="w-4 h-4" /> Explore
          </Link>
          <Link href="/earn" onClick={(e) => handleNavigation(e, "/earn")} className="flex items-center gap-2 font-black uppercase text-sm text-black hover:text-brutal-blue transition-colors">
            <IndianRupee className="w-4 h-4" /> Earn
          </Link>
          
          {showAuthenticatedNav ? (
            <>
              <div className="flex items-center gap-4">
                <Link
                  href="/profile"
                  onClick={(e) => handleNavigation(e, "/profile")}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  aria-label="Profile"
                >
                  <div className="w-8 h-8 rounded-full bg-brutal-blue border-2 border-black flex items-center justify-center">
                    {profileImageSrc ? (
                      <ImageWithFallback
                        src={profileImageSrc} 
                        fallbackSrc="/globe.svg"
                        alt={user?.name || "User"}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-black text-sm">
                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <span className="font-black uppercase text-sm text-black">
                    {user?.name || 'User'}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-brutal-blue text-white px-6 py-2 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center gap-2"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/register" onClick={(e) => handleNavigation(e, "/register")} className="bg-white text-black px-6 py-3 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Join OCC
              </Link>
              <Link href="/login" onClick={(e) => handleNavigation(e, "/login")} className="bg-black text-white px-8 py-3 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center gap-2">
                <LogIn className="w-4 h-4" /> Login
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Mini Links */}
        <div className="flex md:hidden gap-4">
          <Link href="/feed" onClick={(e) => handleNavigation(e, "/feed")} className="p-2 border-2 border-black hover:bg-brutal-gray transition-colors" aria-label="Feed">
            <LayoutDashboard className="w-5 h-5"/>
          </Link>
          <Link href="/explore" onClick={(e) => handleNavigation(e, "/explore")} className="p-2 border-2 border-black hover:bg-brutal-gray transition-colors" aria-label="Explore">
            <Compass className="w-5 h-5"/>
          </Link>
          <Link href="/earn" onClick={(e) => handleNavigation(e, "/earn")} className="p-2 border-2 border-black hover:bg-brutal-gray transition-colors" aria-label="Earn">
            <IndianRupee className="w-5 h-5"/>
          </Link>
          {showAuthenticatedNav ? (
            <>
              <Link
                href="/profile"
                onClick={(e) => handleNavigation(e, "/profile")}
                className="p-2 border-2 border-black hover:bg-brutal-gray transition-colors"
                aria-label="Profile"
              >
                <div className="w-5 h-5 rounded-full bg-brutal-blue border border-black flex items-center justify-center overflow-hidden">
                  {profileImageSrc ? (
                    <ImageWithFallback
                      src={profileImageSrc}
                      fallbackSrc="/globe.svg"
                      alt={user?.name || "User"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-black text-[10px]">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 bg-brutal-blue text-white border-2 border-black hover:bg-black hover:translate-x-1 transition-all"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5"/>
              </button>
            </>
          ) : (
            <>
              <Link href="/register" onClick={(e) => handleNavigation(e, "/register")} className="p-2 border-2 border-black bg-white hover:bg-brutal-gray transition-colors" aria-label="Register">
                <UserPlus className="w-5 h-5"/>
              </Link>
              <Link href="/login" onClick={(e) => handleNavigation(e, "/login")} className="p-2 bg-black text-white border-2 border-black hover:bg-brutal-blue hover:translate-x-1 transition-all" aria-label="Login">
                <LogIn className="w-5 h-5"/>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
