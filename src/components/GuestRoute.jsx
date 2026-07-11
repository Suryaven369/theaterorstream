import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AuthLoadingScreen() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
            <div className="text-white/50 text-sm">Loading…</div>
        </div>
    );
}

/**
 * Auth-only pages — redirect signed-in users away from /auth.
 * Users always go to home or their previous location after login.
 */
export function GuestRoute({ children }) {
    const { loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AuthLoadingScreen />;
    }

    if (isAuthenticated) {
        const from = location.state?.from;
        // Always go to home or previous location, never force onboarding
        const destination = from && from !== '/auth' ? from : '/';
        return <Navigate to={destination} replace />;
    }

    return children;
}

export default GuestRoute;
