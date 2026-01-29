import { useAuth } from "../context/AuthContext";

/**
 * AdminRoute - Protects admin routes
 * Shows 404 page for non-admin users (not a redirect)
 * This makes the admin page invisible to unauthorized users
 */
const AdminRoute = ({ children }) => {
    const { loading, isAdmin } = useAuth();

    // Show loading state while checking auth
    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-pulse text-white/40">Loading...</div>
            </div>
        );
    }

    // Show 404 for non-admins (this hides the admin page completely)
    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-8xl font-bold text-white/10 mb-4">404</h1>
                    <h2 className="text-2xl font-semibold text-white mb-2">Page Not Found</h2>
                    <p className="text-white/50 mb-6">The page you're looking for doesn't exist.</p>
                    <a
                        href="/"
                        className="inline-block px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                        Go Home
                    </a>
                </div>
            </div>
        );
    }

    // User is admin, render children
    return children;
};

export default AdminRoute;
