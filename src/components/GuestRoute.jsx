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
 */
export function GuestRoute({ children }) {
    const { loading, isAuthenticated, isOnboarded } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AuthLoadingScreen />;
    }

    if (isAuthenticated) {
        const from = location.state?.from;
        const destination = isOnboarded
            ? (from && from !== '/auth' ? from : '/')
            : '/onboarding';
        return <Navigate to={destination} replace />;
    }

    return children;
}

export default GuestRoute;
