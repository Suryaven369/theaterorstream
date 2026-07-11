import { supabase } from './supabase';

export const AUTH_STORAGE_KEY = 'theaterorstream-auth';
export const SITE_ORIGIN = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://www.theaterorstream.com';

export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

export function getEmailValidationError(email) {
    if (!email) return null;
    const normalized = normalizeEmail(email);
    if (!normalized.includes('@') || !normalized.split('@')[1]?.includes('.')) {
        return 'Enter a valid email address';
    }
    return null;
}

export function getPasswordValidationError(password, confirmPassword = null) {
    if (password.length < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return 'Password must include at least one letter and one number';
    }
    if (confirmPassword !== null && password !== confirmPassword) {
        return 'Passwords do not match';
    }
    return null;
}

function mapAuthError(error) {
    const message = error?.message || 'Something went wrong. Please try again.';

    if (message.includes('User already registered')) {
        return 'An account with this email already exists. Please log in instead.';
    }
    if (message.includes('Invalid login credentials')) {
        return 'Invalid email or password. If you recently signed up, verify your email first.';
    }
    if (message.includes('Email not confirmed')) {
        return 'Please verify your email before logging in.';
    }
    if (message.includes('Token has expired') || message.includes('otp_expired')) {
        return 'Verification code expired. Request a new code.';
    }
    if (message.includes('Invalid OTP') || message.includes('invalid')) {
        return 'Invalid verification code. Please try again.';
    }
    if (message.includes('For security purposes')) {
        return 'Please wait a moment before requesting another code.';
    }

    if (message.includes('Failed to fetch') || message.includes('fetch failed') || message.includes('aborted')) {
        return 'Cannot reach Supabase. Check your internet, restart `npm run dev`, or try again in a minute.';
    }

    if (message.includes('521') || message.includes('522') || message.includes('Web server is down')) {
        return 'Supabase Auth is unavailable (project may be paused). Open supabase.com/dashboard → your project → Restore if paused, then retry.';
    }

    return message;
}

export async function signUpWithPassword(email, password) {
    const normalized = normalizeEmail(email);
    const emailError = getEmailValidationError(normalized);
    if (emailError) {
        return { success: false, error: emailError };
    }

    const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: {
            emailRedirectTo: `${SITE_ORIGIN}/auth`,
        },
    });

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }

    return { success: true, data, needsVerification: !data.session };
}

export async function sendSignupOtp(email) {
    const normalized = normalizeEmail(email);
    const emailError = getEmailValidationError(normalized);
    if (emailError) {
        return { success: false, error: emailError };
    }

    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalized,
        options: {
            emailRedirectTo: `${SITE_ORIGIN}/auth`,
        },
    });

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }

    return { success: true };
}

export async function sendLoginOtp(email) {
    const normalized = normalizeEmail(email);
    const emailError = getEmailValidationError(normalized);
    if (emailError) {
        return { success: false, error: emailError };
    }

    const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
            shouldCreateUser: false,
        },
    });

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }

    return { success: true };
}

export async function verifyEmailOtp(email, token, type = 'signup') {
    const normalized = normalizeEmail(email);

    const { data, error } = await supabase.auth.verifyOtp({
        email: normalized,
        token: token.trim(),
        type,
    });

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }

    return { success: true, data };
}

export async function signInWithPassword(email, password) {
    const normalized = normalizeEmail(email);
    const emailError = getEmailValidationError(normalized);
    if (emailError) {
        return { success: false, error: emailError };
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: normalized,
            password,
        });

        if (error) {
            const mapped = mapAuthError(error);
            // Only true email-confirmation failures — never wrong-password / other errors
            const needsVerification = error.message.includes('Email not confirmed');

            return {
                success: false,
                error: mapped,
                needsVerification,
            };
        }

        return { success: true, data };
    } catch (err) {
        const msg = err?.message || String(err);
        if (err?.status === 521 || err?.status === 522 || msg.includes('521') || msg.includes('522')) {
            return {
                success: false,
                error: 'Supabase Auth is down for this project (521). In supabase.com/dashboard open project "tos" and click Restore if it is paused.',
            };
        }
        return { success: false, error: mapAuthError(err) };
    }
}

/**
 * Start the Google OAuth flow. supabase-js builds the provider authorize URL from
 * the client's configured base URL — in dev that base is the local /supabase-proxy
 * path, which can't relay Google's 302 redirect. So we ask for the URL without
 * auto-redirecting, rewrite the proxy prefix back to the real Supabase host, and
 * navigate there ourselves. The PKCE verifier supabase-js stored in localStorage is
 * exchanged automatically on return (detectSessionInUrl). In prod the base is already
 * the real host, so the rewrite is a no-op.
 */
export async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${SITE_ORIGIN}/auth`,
                skipBrowserRedirect: true,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'select_account',
                },
            },
        });

        if (error || !data?.url) {
            return { success: false, error: mapAuthError(error || new Error('Could not start Google sign-in')) };
        }

        let url = data.url;
        const realBase = import.meta.env.VITE_SUPABASE_URL;
        if (realBase && typeof window !== 'undefined') {
            const proxyBase = `${window.location.origin}/supabase-proxy`;
            if (url.startsWith(proxyBase)) {
                url = realBase.replace(/\/$/, '') + url.slice(proxyBase.length);
            }
        }

        window.location.href = url;
        return { success: true };
    } catch (err) {
        return { success: false, error: mapAuthError(err) };
    }
}

export async function requestPasswordReset(email) {
    const normalized = normalizeEmail(email);
    const emailError = getEmailValidationError(normalized);
    if (emailError) {
        return { success: false, error: emailError };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${SITE_ORIGIN}/reset-password`,
    });

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }

    return { success: true };
}

export async function updatePassword(newPassword) {
    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
        return { success: false, error: passwordError };
    }

    const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
    });

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }

    return { success: true, data };
}

export async function signOutUser() {
    const { error } = await supabase.auth.signOut({ scope: 'global' });

    if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        sessionStorage.removeItem('authMessage');
    }

    if (error) {
        return { success: false, error: mapAuthError(error) };
    }
    return { success: true };
}
