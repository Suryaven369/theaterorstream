import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// Allowed email providers
const ALLOWED_EMAIL_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in',
    'outlook.com', 'hotmail.com', 'live.com',
    'icloud.com', 'me.com', 'mac.com'
];

const AuthPage = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isOnboarded, loading: authLoading } = useAuth();

    // Modes: 'signup', 'verify', 'login', 'forgot'
    const [mode, setMode] = useState('signup');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [authMessage, setAuthMessage] = useState('');

    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otp, setOtp] = useState('');

    // Check for redirect message
    useEffect(() => {
        const message = sessionStorage.getItem('authMessage');
        if (message) {
            setAuthMessage(message);
            sessionStorage.removeItem('authMessage');
        }
    }, []);

    // Redirect if already authenticated
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            if (!isOnboarded) {
                navigate('/onboarding');
            } else {
                navigate('/');
            }
        }
    }, [isAuthenticated, isOnboarded, authLoading, navigate]);

    // Validate email provider
    const isEmailProviderAllowed = (emailAddress) => {
        const domain = emailAddress.split('@')[1]?.toLowerCase();
        return ALLOWED_EMAIL_PROVIDERS.includes(domain);
    };

    const getEmailError = () => {
        if (!email) return null;
        if (!email.includes('@')) return 'Enter a valid email';
        if (!isEmailProviderAllowed(email)) {
            return 'Please use Gmail, Yahoo, Outlook, or iCloud email';
        }
        return null;
    };

    // SIGN UP - Create account with email and password
    const handleSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const emailError = getEmailError();
        if (emailError) {
            setError(emailError);
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        try {
            console.log('Signing up with:', email.trim().toLowerCase());

            const { data, error } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password: password,
                options: {
                    emailRedirectTo: `${window.location.origin}/`,
                }
            });

            console.log('Signup response:', { data, error });

            if (error) {
                if (error.message.includes('User already registered')) {
                    setError('An account with this email already exists. Please login instead.');
                } else {
                    setError(error.message);
                }
            } else if (data?.user) {
                // Account created successfully
                // Supabase automatically sends a verification email
                // We'll also try to send an OTP for quick verification
                try {
                    await supabase.auth.signInWithOtp({
                        email: email.trim().toLowerCase(),
                        options: {
                            shouldCreateUser: false,
                        }
                    });
                } catch (e) {
                    // OTP might fail, that's ok - they can use the email link
                    console.log('OTP send failed, using email link instead');
                }

                setSuccess('Account created! Check your email for the verification code.');
                setMode('verify');
            }
        } catch (err) {
            console.error('Signup error:', err);
            setError('Something went wrong. Please try again.');
        }

        setLoading(false);
    };

    // VERIFY OTP
    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token: otp,
                type: 'email'
            });

            if (error) {
                setError(error.message || 'Invalid verification code');
            } else if (data?.session) {
                // Successfully verified and logged in!
                setSuccess('Verified successfully!');
                // Session is automatically stored by Supabase
            }
        } catch (err) {
            setError('Verification failed. Please try again.');
        }

        setLoading(false);
    };

    // LOGIN - Sign in with email and password
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password: password,
            });

            if (error) {
                console.log('Login error:', error.message);

                // Handle different error types
                if (error.message.includes('Invalid login credentials')) {
                    // This could mean wrong password OR unverified email
                    // Try to check if user exists by attempting OTP
                    setError('Invalid email or password. If you recently signed up, check your email for verification.');
                } else if (error.message.includes('Email not confirmed')) {
                    // Send OTP to verify
                    const { error: otpError } = await supabase.auth.signInWithOtp({
                        email: email.trim().toLowerCase(),
                    });
                    if (!otpError) {
                        setSuccess('Please verify your email first. Verification code sent!');
                        setMode('verify');
                    } else {
                        setError('Email not verified. Please check your inbox for the verification link.');
                    }
                } else if (error.message.includes('User not found')) {
                    setError('No account found with this email. Please sign up first.');
                } else {
                    setError(error.message);
                }
            } else if (data?.session) {
                // Login successful!
                setSuccess('Login successful!');
                // AuthContext will handle the redirect
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Login failed. Please try again.');
        }

        setLoading(false);
    };

    // Resend verification email
    const handleResendVerification = async () => {
        if (!email) {
            setError('Please enter your email first');
            return;
        }

        setLoading(true);
        setError('');

        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim().toLowerCase(),
        });

        if (!error) {
            setSuccess('Verification code sent! Check your email.');
            setMode('verify');
        } else {
            setError('Failed to send verification. Try signing up again.');
        }

        setLoading(false);
    };

    // FORGOT PASSWORD
    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const emailError = getEmailError();
        if (emailError) {
            setError(emailError);
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(
                email.trim().toLowerCase(),
                { redirectTo: `${window.location.origin}/reset-password` }
            );

            if (error) {
                setError(error.message);
            } else {
                setSuccess('Password reset link sent to your email!');
            }
        } catch (err) {
            setError('Failed to send reset email.');
        }

        setLoading(false);
    };

    // RESEND OTP
    const handleResendOTP = async () => {
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim().toLowerCase(),
            });

            if (error) {
                setError(error.message);
            } else {
                setSuccess('New verification code sent!');
            }
        } catch (err) {
            setError('Failed to resend code.');
        }

        setLoading(false);
    };

    // Show loading while checking auth state
    if (authLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 pt-20 pb-10">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
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

                {/* Auth redirect message */}
                {authMessage && (
                    <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm text-center">
                        {authMessage}
                    </div>
                )}

                {/* Error/Success Messages */}
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

                {/* SIGN UP MODE */}
                {mode === 'signup' && (
                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@gmail.com"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                            />
                            {email && getEmailError() && (
                                <p className="text-xs text-red-400 mt-1">{getEmailError()}</p>
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
                            />
                        </div>

                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm your password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email || !password || !confirmPassword || getEmailError()}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Creating Account...' : 'Create Account'}
                        </button>

                        <div className="text-center mt-4">
                            <span className="text-white/40 text-sm">Already have an account? </span>
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                                className="text-orange-400 text-sm hover:underline"
                            >
                                Login
                            </button>
                        </div>
                    </form>
                )}

                {/* VERIFY OTP MODE */}
                {mode === 'verify' && (
                    <form onSubmit={handleVerifyOTP} className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Verification Code</label>
                            <input
                                type="text"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                placeholder="Enter 6-digit code"
                                maxLength={6}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-4 text-white text-center text-2xl tracking-widest placeholder-white/30 focus:outline-none focus:border-orange-500"
                                required
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
                            {loading ? 'Verifying...' : 'Verify & Continue'}
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
                                onClick={() => { setMode('signup'); setOtp(''); setError(''); setSuccess(''); }}
                                className="text-white/50"
                            >
                                Back
                            </button>
                        </div>
                    </form>
                )}

                {/* LOGIN MODE */}
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
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </button>

                        <div className="flex justify-between text-sm">
                            <button
                                type="button"
                                onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                                className="text-orange-400 hover:underline"
                            >
                                Forgot password?
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                                className="text-white/50"
                            >
                            </button>
                        </div>
                    </form>
                )}

                {/* FORGOT PASSWORD MODE */}
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
                            />
                            {email && getEmailError() && (
                                <p className="text-xs text-red-400 mt-1">{getEmailError()}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || getEmailError()}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                            className="w-full py-3 text-white/50 text-sm"
                        >
                            ← Back to login
                        </button>
                    </form>
                )}

                {/* Footer */}
                <p className="text-center text-xs text-white/30 mt-8">
                    By continuing, you agree to our Terms of Service
                </p>
            </div>
        </div>
    );
};

export default AuthPage;
