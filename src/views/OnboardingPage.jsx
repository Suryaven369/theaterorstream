import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkUsernameAvailable, completeOnboarding } from '../lib/supabase';

// Predefined avatars
const AVATARS = [
    { id: 'avatar_1', emoji: '🎬', name: 'Director', bg: 'from-purple-500 to-pink-500' },
    { id: 'avatar_2', emoji: '🎭', name: 'Drama', bg: 'from-blue-500 to-cyan-500' },
    { id: 'avatar_3', emoji: '🎪', name: 'Fun', bg: 'from-green-500 to-emerald-500' },
    { id: 'avatar_4', emoji: '🌟', name: 'Star', bg: 'from-yellow-500 to-orange-500' },
    { id: 'avatar_5', emoji: '🎯', name: 'Focus', bg: 'from-red-500 to-pink-500' },
    { id: 'avatar_6', emoji: '🦋', name: 'Discovery', bg: 'from-indigo-500 to-purple-500' },
    { id: 'avatar_7', emoji: '🌈', name: 'Colorful', bg: 'from-pink-500 to-rose-500' },
    { id: 'avatar_8', emoji: '🎸', name: 'Rock', bg: 'from-teal-500 to-cyan-500' },
    { id: 'avatar_9', emoji: '🎮', name: 'Gamer', bg: 'from-violet-500 to-purple-500' },
    { id: 'avatar_10', emoji: '📚', name: 'Scholar', bg: 'from-amber-500 to-orange-500' },
    { id: 'avatar_11', emoji: '🚀', name: 'Explorer', bg: 'from-sky-500 to-blue-500' },
    { id: 'avatar_12', emoji: '🎨', name: 'Creative', bg: 'from-rose-500 to-pink-500' },
];

const OnboardingPage = () => {
    const navigate = useNavigate();
    const { user, profile, isAuthenticated, isOnboarded, refreshProfile } = useAuth();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Form data
    const [username, setUsername] = useState('');
    const [usernameAvailable, setUsernameAvailable] = useState(null);
    const [checkingUsername, setCheckingUsername] = useState(false);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState(null);

    // Redirect if not authenticated or already onboarded
    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/auth');
        } else if (isOnboarded) {
            navigate('/');
        }
    }, [isAuthenticated, isOnboarded, navigate]);

    // Check username availability with debounce
    useEffect(() => {
        if (username.length < 3) {
            setUsernameAvailable(null);
            return;
        }

        const timer = setTimeout(async () => {
            setCheckingUsername(true);
            const available = await checkUsernameAvailable(username);
            setUsernameAvailable(available);
            setCheckingUsername(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [username]);

    const validateUsername = (value) => {
        // Only allow letters, numbers, underscores
        return /^[a-zA-Z0-9_]+$/.test(value);
    };

    const handleUsernameChange = (e) => {
        const value = e.target.value.toLowerCase();
        if (value === '' || validateUsername(value)) {
            setUsername(value);
        }
    };

    const handleNextStep = () => {
        setError('');

        if (step === 1) {
            if (username.length < 3) {
                setError('Username must be at least 3 characters');
                return;
            }
            if (!usernameAvailable) {
                setError('This username is taken');
                return;
            }
            setStep(2);
        } else if (step === 2) {
            if (!dateOfBirth) {
                setError('Please enter your date of birth');
                return;
            }
            // Check if user is at least 13 years old
            const dob = new Date(dateOfBirth);
            const today = new Date();
            const age = Math.floor((today - dob) / (365.25 * 24 * 60 * 60 * 1000));
            if (age < 13) {
                setError('You must be at least 13 years old');
                return;
            }
            setStep(3);
        }
    };

    const handleComplete = async () => {
        if (!selectedAvatar) {
            setError('Please select an avatar');
            return;
        }

        setLoading(true);
        setError('');

        const result = await completeOnboarding(user.id, {
            username,
            displayName: username, // Username is also the display name
            dateOfBirth,
            avatarId: selectedAvatar
        });

        setLoading(false);

        if (result.success) {
            await refreshProfile();
            navigate('/');
        } else {
            setError(result.error?.message || 'Failed to complete setup');
        }
    };

    const getSelectedAvatarData = () => {
        return AVATARS.find(a => a.id === selectedAvatar);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 pt-20 pb-10">
            <div className="w-full max-w-lg">
                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                                : 'bg-white/10 text-white/40'
                                }`}>
                                {step > s ? '✓' : s}
                            </div>
                            {s < 3 && (
                                <div className={`w-12 h-0.5 mx-1 ${step > s ? 'bg-orange-500' : 'bg-white/10'}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                {/* Step 1: Username */}
                {step === 1 && (
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white mb-2">Choose a Username</h2>
                        <p className="text-sm text-white/50 mb-6">This is how others will see you</p>

                        <div className="mb-6">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={handleUsernameChange}
                                    placeholder="username"
                                    maxLength={20}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-4 text-white text-lg placeholder-white/30 focus:outline-none focus:border-orange-500"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                                    {checkingUsername && <span className="text-white/40">...</span>}
                                    {!checkingUsername && usernameAvailable === true && <span className="text-green-400">✓</span>}
                                    {!checkingUsername && usernameAvailable === false && <span className="text-red-400">✗</span>}
                                </span>
                            </div>
                            {username.length > 0 && username.length < 3 && (
                                <p className="text-xs text-white/40 mt-2">At least 3 characters</p>
                            )}
                            {usernameAvailable === false && (
                                <p className="text-xs text-red-400 mt-2">Username is taken</p>
                            )}
                        </div>



                        <button
                            onClick={handleNextStep}
                            disabled={!usernameAvailable || checkingUsername}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                        >
                            Continue
                        </button>
                    </div>
                )}

                {/* Step 2: Date of Birth */}
                {step === 2 && (
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white mb-2">When's Your Birthday? 🎂</h2>
                        <p className="text-sm text-white/50 mb-6">We use this to personalize your experience</p>

                        <div className="mb-6">
                            <input
                                type="date"
                                value={dateOfBirth}
                                onChange={(e) => setDateOfBirth(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-orange-500"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 py-4 rounded-xl bg-white/5 border border-white/10 text-white/70"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleNextStep}
                                disabled={!dateOfBirth}
                                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Choose Avatar */}
                {step === 3 && (
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white mb-2">Pick Your Avatar</h2>
                        <p className="text-sm text-white/50 mb-6">Choose one that represents you</p>

                        {/* Selected Avatar Preview */}
                        {selectedAvatar && (
                            <div className="mb-6">
                                <div className={`w-24 h-24 mx-auto rounded-full bg-gradient-to-br ${getSelectedAvatarData()?.bg} flex items-center justify-center ring-4 ring-orange-500`}>
                                    <span className="text-5xl">{getSelectedAvatarData()?.emoji}</span>
                                </div>
                                <p className="text-sm text-white/60 mt-2">@{username}</p>
                            </div>
                        )}

                        {/* Avatar Grid */}
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            {AVATARS.map((avatar) => (
                                <button
                                    key={avatar.id}
                                    onClick={() => setSelectedAvatar(avatar.id)}
                                    className={`aspect-square rounded-2xl bg-gradient-to-br ${avatar.bg} flex items-center justify-center transition-all ${selectedAvatar === avatar.id
                                        ? 'ring-4 ring-orange-500 scale-105'
                                        : 'hover:scale-105 opacity-70 hover:opacity-100'
                                        }`}
                                >
                                    <span className="text-3xl">{avatar.emoji}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(2)}
                                className="flex-1 py-4 rounded-xl bg-white/5 border border-white/10 text-white/70"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleComplete}
                                disabled={loading || !selectedAvatar}
                                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50"
                            >
                                {loading ? 'Setting up...' : "Let's Go! 🎉"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OnboardingPage;
