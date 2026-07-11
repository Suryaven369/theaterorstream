import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AuthLoadingScreen() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center animate-pulse">
                    <span className="text-2xl">🎬</span>
                </div>
                <p className="text-white/50 text-sm">Loading…</p>
            </div>
        </div>
    );
}

/**
 * Nested route guard — guests can browse the public feed/catalog,
 * but AI recommendations, collections, blogs, and account pages require sign-in.
 */
export function RequireAuth() {
    const { loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AuthLoadingScreen />;
    }

    if (!isAuthenticated) {
        return (
            <Navigate
                to="/auth"
                replace
                state={{ from: location.pathname + location.search }}
            />
        );
    }

    return <Outlet />;
}

export default RequireAuth;
