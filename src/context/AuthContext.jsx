import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getUserProfile, ensureUserProfile } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

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
            return null;
        } catch (error) {
            return null;
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            try {
                // Check active session
                const { data: { session } } = await supabase.auth.getSession();

                if (mounted && session?.user) {
                    setUser(session.user);
                    await loadProfile(session.user.id);
                    setLoading(false);
                    return;
                }

                // If no session, try manual recovery from localStorage
                const storedSessionStr = localStorage.getItem('theaterorstream-auth');
                if (storedSessionStr) {
                    try {
                        const storedSession = JSON.parse(storedSessionStr);
                        if (storedSession?.access_token && storedSession?.refresh_token) {
                            const { data, error: refreshError } = await supabase.auth.setSession({
                                access_token: storedSession.access_token,
                                refresh_token: storedSession.refresh_token,
                            });

                            if (!refreshError && data?.session?.user) {
                                if (mounted) {
                                    setUser(data.session.user);
                                    await loadProfile(data.session.user.id);
                                    setLoading(false);
                                    return;
                                }
                            }
                        }
                    } catch (e) {
                        // Parse error, continue
                    }
                }

                if (mounted) {
                    setLoading(false);
                }
            } catch (error) {
                if (mounted) setLoading(false);
            }
        };

        initializeAuth();

        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;

                if (session?.user) {
                    setUser(session.user);
                    if (['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED'].includes(event)) {
                        await loadProfile(session.user.id);
                    }
                    if (event === 'INITIAL_SESSION') {
                        setLoading(false);
                    }
                } else if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                }
            }
        );

        return () => {
            mounted = false;
            subscription?.unsubscribe();
        };
    }, []);

    const refreshProfile = useCallback(async () => {
        if (user?.id) {
            return await loadProfile(user.id);
        }
        return null;
    }, [user?.id, loadProfile]);

    const value = {
        user,
        profile,
        loading,
        isAuthenticated: !!user,
        isOnboarded: !!profile?.is_onboarded,
        isAdmin: !!profile?.is_admin,
        refreshProfile,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
