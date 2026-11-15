import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/auth/AuthForm';

const AuthPage = () => {
    const location = useLocation();
    const { loading: authLoading } = useAuth();
    const [mode, setMode] = useState(() => (
        new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login'
    ));
    const [authMessage, setAuthMessage] = useState('');

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

    if (authLoading) {
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
                    <img
                        src="https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg"
                        alt="TheaterOrStream Logo"
                        className="w-16 h-16 mx-auto mb-4 rounded-full object-cover"
                    />
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

                <AuthForm mode={mode} onModeChange={setMode} />

                <p className="text-center text-xs text-white/30 mt-8">
                    By continuing, you agree to our{' '}
                    <Link to="/terms" className="text-white/50 hover:text-white/80 underline underline-offset-2">
                        Terms
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" className="text-white/50 hover:text-white/80 underline underline-offset-2">
                        Privacy Policy
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default AuthPage;
