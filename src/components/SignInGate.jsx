import { Link, useLocation } from 'react-router-dom';

/**
 * Inline CTA shown when a guest hits a signed-in-only feature (Watch / AI reco).
 */
export default function SignInGate({
    title = 'Sign in to continue',
    description = 'Create a free account to unlock personalized recommendations, collections, blogs, and more.',
}) {
    const location = useLocation();
    const from = location.pathname + location.search;

    return (
        <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
            <div className="max-w-md w-full text-center rounded-2xl border border-white/10 bg-white/[0.03] p-8">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-2xl">
                    🎬
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
                <p className="text-sm text-white/55 mb-6 leading-relaxed">{description}</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        to="/auth"
                        state={{ from }}
                        className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Sign in
                    </Link>
                    <Link
                        to="/"
                        className="px-5 py-2.5 rounded-full bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors"
                    >
                        Keep browsing
                    </Link>
                </div>
            </div>
        </div>
    );
}
