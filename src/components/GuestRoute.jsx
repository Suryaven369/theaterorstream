import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isTasteOnboardingPending, rememberAfterTastePath } from '../lib/tasteOnboarding';

function AuthLoadingScreen() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
            <div className="text-white/50 text-sm">Loading…</div>
        </div>
    );
}

/**
 * Auth-only pages — redirect signed-in users away from /auth.
 * New signups with a pending taste questionnaire go there first (no feed).
 */
export function GuestRoute({ children }) {
    const { loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AuthLoadingScreen />;
    }

    if (isAuthenticated) {
        const from = location.state?.from;
        if (from && from !== '/auth') rememberAfterTastePath(from);
        const destination = isTasteOnboardingPending()
            ? '/onboarding/taste'
            : (from && from !== '/auth' ? from : '/');
        return <Navigate to={destination} replace />;
    }

    return children;
}

export default GuestRoute;
