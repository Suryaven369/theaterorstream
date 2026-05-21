import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getUserProfile, ensureUserProfile, isProfileOnboarded } from '../lib/supabase';
import { signOutUser } from '../lib/auth';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [sessionReady, setSessionReady] = useState(false);
    const [profileReady, setProfileReady] = useState(true);

    const loadProfile = useCallback(async (userId) => {
        try {
            let userProfile = await getUserProfile(userId);

            if (!userProfile) {
                userProfile = await ensureUserProfile(userId);
            }

            if (userProfile) {
                setProfile(userProfile);
                return userProfile;
            }

            setProfile(null);
            return null;
        } catch {
            setProfile(null);
            return null;
        }
    }, []);

    const signOut = useCallback(async () => {
        setUser(null);
        setProfile(null);
        setProfileReady(true);
        await signOutUser();
    }, []);

    // Session listener only — never await Supabase data calls here (avoids auth deadlock).
    useEffect(() => {
        let mounted = true;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!mounted) return;
            setUser(session?.user ?? null);
            setSessionReady(true);
        }).catch(() => {
            if (mounted) setSessionReady(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) return;
            setUser(session?.user ?? null);
            if (!session?.user) {
                setProfile(null);
                setProfileReady(true);
            }
        });

        return () => {
            mounted = false;
            subscription?.unsubscribe();
        };
    }, []);

    // Profile fetch runs in its own effect when user id changes.
    useEffect(() => {
        if (!user?.id) {
            setProfile(null);
            setProfileReady(true);
            return undefined;
        }

        let cancelled = false;
        setProfileReady(false);

        const timeoutId = setTimeout(() => {
            if (!cancelled) setProfileReady(true);
        }, 10000);

        loadProfile(user.id).finally(() => {
            clearTimeout(timeoutId);
            if (!cancelled) {
                setProfileReady(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [user?.id, loadProfile]);

    const refreshProfile = useCallback(async () => {
        if (!user?.id) return null;
        setProfileReady(false);
        try {
            return await loadProfile(user.id);
        } finally {
            setProfileReady(true);
        }
    }, [user?.id, loadProfile]);

    const loading = !sessionReady || (!!user && !profileReady);

    const value = {
        user,
        profile,
        loading,
        isAuthenticated: !!user,
        isOnboarded: isProfileOnboarded(profile),
        isAdmin: !!profile?.is_admin,
        refreshProfile,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
