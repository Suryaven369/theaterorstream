import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
    FiHome,
    FiFilm,
    FiTag,
    FiSettings,
    FiLogOut,
    FiLayout,
    FiActivity,
    FiSearch,
    FiList,
    FiVideo,
    FiRss,
    FiLink,
    FiCpu,
    FiLayers,
    FiMenu,
    FiX,
} from "react-icons/fi";

const AdminLayout = () => {
    const location = useLocation();
    const [navOpen, setNavOpen] = useState(false);

    const navItems = [
        { path: "/admin", label: "Dashboard", icon: FiHome, exact: true },
        { path: "/admin/pipeline", label: "Pipeline", icon: FiActivity },
        { path: "/admin/library", label: "Library", icon: FiFilm },
        { path: "/admin/browse", label: "Browse TMDB", icon: FiSearch },
        { path: "/admin/sections", label: "Sections", icon: FiLayout },
        { path: "/admin/trailers", label: "Trailers", icon: FiVideo },
        { path: "/admin/articles", label: "Articles", icon: FiRss },
        { path: "/admin/news-intel", label: "News Intel", icon: FiCpu },
        { path: "/admin/collections", label: "Collections", icon: FiTag },
        { path: "/admin/franchise-lists", label: "List Moderation", icon: FiLayers },
        { path: "/admin/settings", label: "Settings", icon: FiSettings, exact: true },
        { path: "/admin/settings/profile-connect", label: "Profile Connect", icon: FiLink },
        { path: "/admin/legacy", label: "Legacy Panel", icon: FiList },
    ];

    const isActive = (item) => {
        if (item.exact) return location.pathname === item.path;
        if (item.path === "/admin/settings" && location.pathname.startsWith("/admin/settings/")) {
            return false;
        }
        return location.pathname.startsWith(item.path);
    };

    const activeLabel =
        navItems.find((item) => isActive(item))?.label || "Admin";

    useEffect(() => {
        setNavOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!navOpen) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [navOpen]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            {/* Mobile top bar */}
            <header className="lg:hidden sticky top-0 z-40 border-b border-white/10 bg-[#111]/95 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
                <div className="flex items-center gap-3 h-14 px-3">
                    <button
                        type="button"
                        onClick={() => setNavOpen(true)}
                        className="p-2.5 -ml-1 rounded-lg text-white/80 hover:bg-white/10 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Open admin menu"
                    >
                        <FiMenu className="text-xl" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wide text-white/35">TOS Admin</p>
                        <p className="text-sm font-semibold text-white truncate">{activeLabel}</p>
                    </div>
                    <Link
                        to="/"
                        className="text-xs text-white/50 hover:text-white px-2 py-2 shrink-0"
                    >
                        Site
                    </Link>
                </div>
            </header>

            {/* Mobile drawer overlay */}
            {navOpen && (
                <button
                    type="button"
                    aria-label="Close menu"
                    className="lg:hidden fixed inset-0 z-40 bg-black/65"
                    onClick={() => setNavOpen(false)}
                />
            )}

            {/* Sidebar — drawer on mobile, fixed on desktop */}
            <aside
                className={`fixed z-50 top-0 left-0 h-full w-[min(18rem,86vw)] bg-[#111] border-r border-white/10 flex flex-col transition-transform duration-200 ease-out
                    ${navOpen ? "translate-x-0" : "-translate-x-full"}
                    lg:translate-x-0 lg:w-56`}
            >
                <div className="p-4 border-b border-white/10 flex items-center justify-between gap-2 shrink-0 pt-[calc(env(safe-area-inset-top,0px)+1rem)] lg:pt-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-sm">T</span>
                        </div>
                        <div className="min-w-0">
                            <div className="text-white font-semibold text-sm truncate">TOS Admin</div>
                            <div className="text-white/40 text-[10px]">Content Management</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setNavOpen(false)}
                        className="lg:hidden p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                        aria-label="Close menu"
                    >
                        <FiX className="text-lg" />
                    </button>
                </div>

                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto overscroll-contain">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all min-h-[44px] ${
                                    active
                                        ? "bg-orange-500/20 text-orange-400"
                                        : "text-white/60 hover:bg-white/5 hover:text-white"
                                }`}
                            >
                                <Icon className="text-base shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-white/10 shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] lg:pb-3">
                    <Link
                        to="/"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white transition-all min-h-[44px]"
                    >
                        <FiLogOut className="text-base shrink-0" />
                        Back to Site
                    </Link>
                </div>
            </aside>

            {/* Main content */}
            <main className="min-w-0 w-full max-w-full overflow-x-hidden lg:ml-56">
                <div className="min-h-[calc(100dvh-3.5rem)] lg:min-h-screen min-w-0 max-w-full pb-[env(safe-area-inset-bottom,0px)]">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
