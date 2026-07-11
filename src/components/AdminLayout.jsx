import { Outlet, Link, useLocation } from "react-router-dom";
import { FiHome, FiFilm, FiGrid, FiTag, FiSettings, FiLogOut, FiLayout, FiActivity, FiSearch, FiList, FiVideo, FiRss } from "react-icons/fi";

const AdminLayout = () => {
    const location = useLocation();

    const navItems = [
        { path: "/admin", label: "Dashboard", icon: FiHome, exact: true },
        { path: "/admin/pipeline", label: "Pipeline", icon: FiActivity },
        { path: "/admin/library", label: "Library", icon: FiFilm },
        { path: "/admin/browse", label: "Browse TMDB", icon: FiSearch },
        { path: "/admin/sections", label: "Sections", icon: FiLayout },
        { path: "/admin/trailers", label: "Trailers", icon: FiVideo },
        { path: "/admin/articles", label: "Articles", icon: FiRss },
        { path: "/admin/collections", label: "Collections", icon: FiTag },
        { path: "/admin/settings", label: "Settings", icon: FiSettings },
        { path: "/admin/legacy", label: "Legacy Panel", icon: FiList },
    ];

    const isActive = (item) => {
        if (item.exact) return location.pathname === item.path;
        return location.pathname.startsWith(item.path);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex">
            {/* Sidebar */}
            <aside className="w-56 bg-[#111] border-r border-white/10 flex flex-col fixed h-full">
                {/* Logo */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">T</span>
                        </div>
                        <div>
                            <div className="text-white font-semibold text-sm">TOS Admin</div>
                            <div className="text-white/40 text-[10px]">Content Management</div>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${active
                                        ? "bg-orange-500/20 text-orange-400"
                                        : "text-white/60 hover:bg-white/5 hover:text-white"
                                    }`}
                            >
                                <Icon className="text-base" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-white/10">
                    <Link
                        to="/"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white transition-all"
                    >
                        <FiLogOut className="text-base" />
                        Back to Site
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-56">
                <Outlet />
            </main>
        </div>
    );
};

export default AdminLayout;
