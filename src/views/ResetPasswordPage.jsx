import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPasswordValidationError, updatePassword, signOutUser } from '../lib/auth';
import { supabase } from '../lib/supabase';

const ResetPasswordPage = () => {
    const navigate = useNavigate();
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [sessionReady, setSessionReady] = useState(false);
    const [checkingLink, setCheckingLink] = useState(true);

    useEffect(() => {
        let mounted = true;

        const initRecoverySession = async () => {
            const hash = window.location.hash || '';
            const isRecoveryLink = hash.includes('type=recovery') || hash.includes('access_token');

            if (isRecoveryLink) {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (!mounted) return;

                if (error || !session) {
                    setError('This reset link is invalid or has expired. Request a new one from the login page.');
                } else {
                    setSessionReady(true);
                }
                setCheckingLink(false);
                return;
            }

            if (!authLoading) {
                if (isAuthenticated) {
                    setSessionReady(true);
                } else {
                    setError('Open the password reset link from your email to continue.');
                }
                setCheckingLink(false);
            }
        };

        initRecoverySession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!mounted) return;
            if (event === 'PASSWORD_RECOVERY' && session) {
                setSessionReady(true);
                setError('');
                setCheckingLink(false);
            }
        });

        return () => {
            mounted = false;
            subscription?.unsubscribe();
        };
    }, [authLoading, isAuthenticated]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const passwordError = getPasswordValidationError(password, confirmPassword);
        if (passwordError) {
            setError(passwordError);
            return;
        }

        setLoading(true);
        const result = await updatePassword(password);
        setLoading(false);

        if (!result.success) {
            setError(result.error);
            return;
        }

        setSuccess('Password updated! Redirecting to login…');
        window.history.replaceState(null, '', '/reset-password');
        await signOutUser();
        setTimeout(() => navigate('/auth', { replace: true }), 1200);
    };

    if (authLoading || checkingLink) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-white/60 text-sm">Loading…</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                        <span className="text-3xl">🔐</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Set a new password</h1>
                    <p className="text-sm text-white/50 mt-1">Choose a strong password for your account</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                        {!sessionReady && (
                            <div className="mt-3">
                                <Link to="/auth" className="text-orange-400 hover:underline">
                                    Back to login
                                </Link>
                            </div>
                        )}
                    </div>
                )}

                {success && (
                    <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                        {success}
                    </div>
                )}

                {sessionReady && !success && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">New password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Confirm password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm your password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !password || !confirmPassword}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Updating…' : 'Update password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordPage;
