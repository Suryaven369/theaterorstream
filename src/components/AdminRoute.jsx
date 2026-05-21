import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function AuthLoadingScreen() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
            <div className="animate-pulse text-white/40">Loading...</div>
        </div>
    );
}

/**
 * AdminRoute - Requires login + admin role.
 * Non-admins see 404 (admin URL stays hidden).
 */
const AdminRoute = ({ children }) => {
    const { loading, isAuthenticated, isAdmin } = useAuth();

    if (loading) {
        return <AuthLoadingScreen />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/auth" replace />;
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-8xl font-bold text-white/10 mb-4">404</h1>
                    <h2 className="text-2xl font-semibold text-white mb-2">Page Not Found</h2>
                    <p className="text-white/50 mb-6">The page you&apos;re looking for doesn&apos;t exist.</p>
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

    return children;
};

export default AdminRoute;
