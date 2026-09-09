import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { shouldGateTasteOnboarding } from '../lib/tasteOnboarding';

/**
 * New signups skip the home feed (movie posts/titles) until they answer or skip
 * the taste questionnaire.
 */
export default function TasteOnboardingGate({ children }) {
    const { user, loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated || loading) return children;
    if (location.pathname.startsWith('/onboarding/taste')) return children;
    if (!shouldGateTasteOnboarding(user)) return children;

    return <Navigate to="/onboarding/taste" replace />;
}
