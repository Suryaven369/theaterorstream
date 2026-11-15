import React, { useState } from 'react';
import {
    getEmailValidationError,
    getPasswordValidationError,
    sendSignupOtp,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    verifyEmailOtp,
    requestPasswordReset,
} from '../../lib/auth';
import { markTasteOnboardingPending } from '../../lib/tasteOnboarding';

export function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
    );
}

// Visual themes: the app's orange, or the landing page's marquee gold.
const THEMES = {
    default: {
        input: 'focus:border-orange-500',
        primary: 'bg-gradient-to-r from-orange-500 to-red-500 text-white',
        link: 'text-orange-400',
    },
    gold: {
        input: 'focus:border-[#f5c518]',
        primary: 'bg-[#f5c518] text-[#14181c] hover:bg-[#f5c518]/90 shadow-[0_8px_30px_-8px_rgba(245,197,24,0.45)]',
        link: 'text-[#f5c518]',
    },
};

export const AUTH_MODE_TITLES = {
    signup: 'Create your free account',
    verify: 'Verify your email',
    login: 'Welcome back',
    forgot: 'Reset your password',
};

/**
 * Email/password + Google sign-in, sign-up (with one-time email code), and
 * password reset. Used by /auth and the landing page hero.
 * Signed-in redirects are handled by whoever renders this (route guards).
 */
export default function AuthForm({ mode, onModeChange, theme = 'default', compact = false }) {
    const t = THEMES[theme] || THEMES.default;
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otp, setOtp] = useState('');

    const switchMode = (nextMode) => {
        onModeChange(nextMode);
        setError('');
        setSuccess('');
        setOtp('');
    };

    const handleGoogle = async () => {
        setGoogleLoading(true);
        setError('');
        setSuccess('');
        const result = await signInWithGoogle();
        // On success the browser navigates away to Google, so we only land here on failure.
        if (!result.success) {
            setError(result.error || 'Could not sign in with Google.');
            setGoogleLoading(false);
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const emailError = getEmailValidationError(email);
        if (emailError) { setError(emailError); setLoading(false); return; }
        const passwordError = getPasswordValidationError(password, confirmPassword);
        if (passwordError) { setError(passwordError); setLoading(false); return; }

        const signUpResult = await signUpWithPassword(email, password);
        if (!signUpResult.success) { setError(signUpResult.error); setLoading(false); return; }

        if (signUpResult.data?.session) {
            markTasteOnboardingPending();
            setSuccess('Account created! Redirecting…');
            setLoading(false);
            return;
        }

        const otpResult = await sendSignupOtp(email);
        onModeChange('verify');
        if (!otpResult.success) {
            setSuccess('Account created! Check your email for the verification code.');
            setError(otpResult.error);
        } else {
            setSuccess('Account created! Enter the 6-digit code once to verify your email. After that, log in with just your password.');
            setError('');
        }
        setLoading(false);
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        if (otp.length !== 6) { setError('Enter the 6-digit verification code'); setLoading(false); return; }
        const result = await verifyEmailOtp(email, otp, 'signup');
        if (!result.success) { setError(result.error); setLoading(false); return; }
        markTasteOnboardingPending();
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
        // Unverified signup: one-time email OTP only (not a login step)
        if (result.needsVerification) {
            const otpResult = await sendSignupOtp(email);
            onModeChange('verify');
            if (otpResult.success) {
                setSuccess('Finish signup first: enter the 6-digit code we sent to verify your email. After that, log in with just your password.');
                setError('');
            } else {
                setError(result.error || otpResult.error);
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
        const result = await sendSignupOtp(email);
        if (!result.success) setError(result.error);
        else setSuccess('New signup verification code sent!');
        setLoading(false);
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        const result = await requestPasswordReset(email);
        if (!result.success) setError(result.error);
        else setSuccess('If an account exists for this email, a reset link has been sent.');
        setLoading(false);
    };

    const emailError = email ? getEmailValidationError(email) : null;
    const inputCls = `w-full bg-white/5 border border-white/10 rounded-lg px-4 ${compact ? 'py-2.5' : 'py-3'} text-[15px] text-white placeholder-white/30 focus:outline-none ${t.input}`;
    const primaryCls = `w-full ${compact ? 'py-2.5' : 'py-3'} rounded-lg font-semibold transition disabled:opacity-50 ${t.primary}`;
    const space = compact ? 'space-y-3' : 'space-y-4';

    const googleBlock = (
        <>
            <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading || loading}
                className={`w-full flex items-center justify-center gap-3 ${compact ? 'py-2.5' : 'py-3'} rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors`}
            >
                <GoogleIcon />
                {googleLoading ? 'Connecting…' : 'Continue with Google'}
            </button>
            <div className={`flex items-center gap-3 ${compact ? 'my-3' : 'my-4'}`}>
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/30">or</span>
                <div className="flex-1 h-px bg-white/10" />
            </div>
        </>
    );

    return (
        <div>
            {error && (
                <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">{error}</div>
            )}
            {success && (
                <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">{success}</div>
            )}

            {mode === 'signup' && (
                <form onSubmit={handleSignUp} className={space}>
                    {googleBlock}
                    <div>
                        <label htmlFor="auth-email" className="text-xs text-white/50 mb-1 block">Email address</label>
                        <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@gmail.com" className={inputCls} required autoComplete="email" />
                        {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
                        {!compact && <p className="text-[10px] text-white/30 mt-1">Accepted: Gmail, Yahoo, Outlook, iCloud</p>}
                    </div>
                    <div className={compact ? 'grid grid-cols-2 gap-2' : 'space-y-4'}>
                        <div>
                            <label htmlFor="auth-password" className="text-xs text-white/50 mb-1 block">Password</label>
                            <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder={compact ? '8+ characters' : 'Min 8 chars, with a letter & number'}
                                className={inputCls} required minLength={8} autoComplete="new-password" />
                        </div>
                        <div>
                            <label htmlFor="auth-confirm" className="text-xs text-white/50 mb-1 block">Confirm password</label>
                            <input id="auth-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder={compact ? 'Once more' : 'Confirm your password'}
                                className={inputCls} required minLength={8} autoComplete="new-password" />
                        </div>
                    </div>
                    <button type="submit" disabled={loading || (!compact && (!email || !password || !confirmPassword || !!emailError))} className={primaryCls}>
                        {loading ? 'Creating account…' : (compact ? 'Create free account' : 'Create account')}
                    </button>
                    <p className="text-center text-sm text-white/45">
                        Already have an account?{' '}
                        <button type="button" onClick={() => switchMode('login')} className={`${t.link} hover:underline`}>Log in</button>
                    </p>
                </form>
            )}

            {mode === 'verify' && (
                <form onSubmit={handleVerifyOTP} className={space}>
                    <div>
                        <label htmlFor="auth-otp" className="text-xs text-white/50 mb-1 block">Verification code</label>
                        <input id="auth-otp" type="text" inputMode="numeric" value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000" maxLength={6}
                            className={`w-full bg-white/5 border border-white/10 rounded-lg px-4 py-4 text-white text-center text-2xl tracking-[0.4em] placeholder-white/30 focus:outline-none ${t.input}`}
                            required autoComplete="one-time-code" />
                        <p className="text-xs text-white/40 mt-2 text-center">
                            One-time signup code sent to {email}. After verifying, you only need your password to log in.
                        </p>
                    </div>
                    <button type="submit" disabled={loading || otp.length !== 6} className={primaryCls}>
                        {loading ? 'Verifying…' : 'Verify & continue'}
                    </button>
                    <div className="flex justify-between text-sm">
                        <button type="button" onClick={handleResendOTP} disabled={loading} className={`${t.link} hover:underline disabled:opacity-50`}>Resend code</button>
                        <button type="button" onClick={() => switchMode('login')} className="text-white/50 hover:text-white">Back to login</button>
                    </div>
                </form>
            )}

            {mode === 'login' && (
                <form onSubmit={handleLogin} className={space}>
                    {googleBlock}
                    <div>
                        <label htmlFor="auth-login-email" className="text-xs text-white/50 mb-1 block">Email</label>
                        <input id="auth-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@gmail.com" className={inputCls} required autoComplete="email" />
                    </div>
                    <div>
                        <label htmlFor="auth-login-password" className="text-xs text-white/50 mb-1 block">Password</label>
                        <input id="auth-login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                            placeholder="Your password" className={inputCls} required autoComplete="current-password" />
                    </div>
                    <button type="submit" disabled={loading || (!compact && (!email || !password))} className={primaryCls}>
                        {loading ? 'Logging in…' : 'Log in'}
                    </button>
                    <div className="flex justify-between items-center text-sm">
                        <button type="button" onClick={() => switchMode('forgot')} className={`${t.link} hover:underline`}>Forgot password?</button>
                        <button type="button" onClick={() => switchMode('signup')} className="text-white/50 hover:text-white">Create account</button>
                    </div>
                </form>
            )}

            {mode === 'forgot' && (
                <form onSubmit={handleForgotPassword} className={space}>
                    <div>
                        <label htmlFor="auth-forgot-email" className="text-xs text-white/50 mb-1 block">Email</label>
                        <input id="auth-forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@gmail.com" className={inputCls} required autoComplete="email" />
                        {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
                    </div>
                    <button type="submit" disabled={loading || !!emailError || !email} className={primaryCls}>
                        {loading ? 'Sending…' : 'Send reset link'}
                    </button>
                    <button type="button" onClick={() => switchMode('login')} className="w-full py-2 text-white/50 text-sm hover:text-white">
                        ← Back to login
                    </button>
                </form>
            )}
        </div>
    );
}
