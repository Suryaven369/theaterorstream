import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    getEmailValidationError,
    getPasswordValidationError,
    sendLoginOtp,
    sendSignupOtp,
    signInWithPassword,
    signUpWithPassword,
    verifyEmailOtp,
    requestPasswordReset,
} from '../lib/auth';

const AuthPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { loading: authLoading } = useAuth();

    const [mode, setMode] = useState('login');
    const [verifyType, setVerifyType] = useState('signup');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [authMessage, setAuthMessage] = useState('');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otp, setOtp] = useState('');

    useEffect(() => {
        const message = sessionStorage.getItem('authMessage');
        if (message) {
            setAuthMessage(message);
            sessionStorage.removeItem('authMessage');
            return;
        }
        if (location.state?.from) {
            setAuthMessage('Sign in or create an account to access TheaterOrStream.');
        }
    }, [location.state]);

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setError('');
        setSuccess('');
        setOtp('');
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const emailError = getEmailValidationError(email);
        if (emailError) {
            setError(emailError);
            setLoading(false);
            return;
        }

        const passwordError = getPasswordValidationError(password, confirmPassword);
        if (passwordError) {
            setError(passwordError);
            setLoading(false);
            return;
        }

        const signUpResult = await signUpWithPassword(email, password);
        if (!signUpResult.success) {
            setError(signUpResult.error);
            setLoading(false);
            return;
        }

        if (signUpResult.data?.session) {
            setSuccess('Account created! Redirecting…');
            setLoading(false);
            return;
        }

        const otpResult = await sendSignupOtp(email);
        setVerifyType('signup');
        setMode('verify');

        if (!otpResult.success) {
            setSuccess('Account created! Check your email for the verification code.');
            setError(otpResult.error);
        } else {
            setSuccess('Account created! Enter the 6-digit code sent to your email.');
            setError('');
        }

        setLoading(false);
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        if (otp.length !== 6) {
            setError('Enter the 6-digit verification code');
            setLoading(false);
            return;
        }

        const result = await verifyEmailOtp(email, otp, verifyType);
        if (!result.success) {
            setError(result.error);
            setLoading(false);
            return;
        }

        setSuccess('Email verified! Redirecting…');
        setLoading(false);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const result = await signInWithPassword(email, password);
        if (result.success) {
            setSuccess('Welcome back!');
            setLoading(false);
            return;
        }

        if (result.needsVerification) {
            const otpResult = await sendLoginOtp(email);
            if (otpResult.success) {
                setVerifyType('email');
                setMode('verify');
                setSuccess('Verify your email to continue. We sent a new 6-digit code.');
                setError('');
            } else {
                setError(result.error);
            }
            setLoading(false);
            return;
        }

        setError(result.error);
        setLoading(false);
    };

    const handleResendOTP = async () => {
        setLoading(true);
        setError('');
        setSuccess('');

        const sendFn = verifyType === 'signup' ? sendSignupOtp : sendLoginOtp;
        const result = await sendFn(email);

        if (!result.success) {
            setError(result.error);
        } else {
            setSuccess('New verification code sent!');
        }

        setLoading(false);
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const result = await requestPasswordReset(email);
        if (!result.success) {
            setError(result.error);
        } else {
            setSuccess('If an account exists for this email, a reset link has been sent.');
        }

        setLoading(false);
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-white/60 text-sm">Loading…</div>
            </div>
        );
    }

    const emailError = email ? getEmailValidationError(email) : null;

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                        <span className="text-3xl">🎬</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">TheaterOrStream</h1>
                    <p className="text-sm text-white/50 mt-1">
                        {mode === 'signup' && 'Create your account'}
                        {mode === 'verify' && 'Verify your email'}
                        {mode === 'login' && 'Welcome back'}
                        {mode === 'forgot' && 'Reset your password'}
                    </p>
                </div>

                {authMessage && (
                    <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm text-center">
                        {authMessage}
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                        {success}
                    </div>
                )}

                {mode === 'signup' && (
                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Email address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@gmail.com"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                autoComplete="email"
                            />
                            {emailError && (
                                <p className="text-xs text-red-400 mt-1">{emailError}</p>
                            )}
                            <p className="text-[10px] text-white/30 mt-1">
                                Accepted: Gmail, Yahoo, Outlook, iCloud
                            </p>
                        </div>

                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Password</label>
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
                            disabled={loading || !email || !password || !confirmPassword || !!emailError}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Creating account…' : 'Create account'}
                        </button>

                        <p className="text-center text-sm text-white/40">
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={() => switchMode('login')}
                                className="text-orange-400 hover:underline"
                            >
                                Log in
                            </button>
                        </p>
                    </form>
                )}

                {mode === 'verify' && (
                    <form onSubmit={handleVerifyOTP} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Verification code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                maxLength={6}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-4 text-white text-center text-2xl tracking-[0.4em] placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                autoComplete="one-time-code"
                            />
                            <p className="text-xs text-white/40 mt-2 text-center">
                                Code sent to {email}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || otp.length !== 6}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Verifying…' : 'Verify & continue'}
                        </button>

                        <div className="flex justify-between text-sm">
                            <button
                                type="button"
                                onClick={handleResendOTP}
                                disabled={loading}
                                className="text-orange-400 hover:underline disabled:opacity-50"
                            >
                                Resend code
                            </button>
                            <button
                                type="button"
                                onClick={() => switchMode('login')}
                                className="text-white/50 hover:text-white"
                            >
                                Back to login
                            </button>
                        </div>
                    </form>
                )}

                {mode === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@gmail.com"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Your password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                autoComplete="current-password"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Logging in…' : 'Log in'}
                        </button>

                        <div className="flex justify-between items-center text-sm">
                            <button
                                type="button"
                                onClick={() => switchMode('forgot')}
                                className="text-orange-400 hover:underline"
                            >
                                Forgot password?
                            </button>
                            <button
                                type="button"
                                onClick={() => switchMode('signup')}
                                className="text-white/50 hover:text-white"
                            >
                                Create account
                            </button>
                        </div>
                    </form>
                )}

                {mode === 'forgot' && (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@gmail.com"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                                autoComplete="email"
                            />
                            {emailError && (
                                <p className="text-xs text-red-400 mt-1">{emailError}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !!emailError || !email}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Sending…' : 'Send reset link'}
                        </button>

                        <button
                            type="button"
                            onClick={() => switchMode('login')}
                            className="w-full py-3 text-white/50 text-sm hover:text-white"
                        >
                            ← Back to login
                        </button>
                    </form>
                )}

                <p className="text-center text-xs text-white/30 mt-8">
                    By continuing, you agree to our Terms of Service
                </p>
            </div>
        </div>
    );
};

export default AuthPage;
