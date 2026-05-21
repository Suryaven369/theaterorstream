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
 * Guards app routes — unauthenticated users go to /auth,
 * authenticated but not onboarded go to /onboarding.
 */
export function ProtectedRoute({ requireOnboarding = true }) {
    const { loading, isAuthenticated, isOnboarded } = useAuth();
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

    if (isOnboarded && location.pathname === '/onboarding') {
        return <Navigate to="/" replace />;
    }

    if (requireOnboarding && !isOnboarded && location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />;
    }

    return <Outlet />;
}

export default ProtectedRoute;
