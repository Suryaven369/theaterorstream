import { Link } from "react-router-dom";

/**
 * Shared 404 page for unmatched routes. (Non-admins hitting /admin get this same
 * "doesn't exist" treatment via AdminRoute, so the admin area stays hidden.)
 */
const NotFound = () => (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center">
            <h1 className="text-8xl font-bold text-white/10 mb-4">404</h1>
            <h2 className="text-2xl font-semibold text-white mb-2">Page Not Found</h2>
            <p className="text-white/50 mb-6">The page you&apos;re looking for doesn&apos;t exist.</p>
            <Link
                to="/"
                className="inline-block px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
                Go Home
            </Link>
        </div>
    </div>
);

export default NotFound;
