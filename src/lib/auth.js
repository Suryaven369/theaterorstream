import { supabase } from './supabase';

export const ALLOWED_EMAIL_PROVIDERS = [
    'gmail.com',
    'yahoo.com',
    'yahoo.in',
    'yahoo.co.in',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'me.com',
    'mac.com',
];

export const AUTH_STORAGE_KEY = 'theaterorstream-auth';
export const SITE_ORIGIN = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://www.theaterorstream.com';

export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

export function isEmailProviderAllowed(email) {
    const domain = normalizeEmail(email).split('@')[1];
    return ALLOWED_EMAIL_PROVIDERS.includes(domain);
}

export function getEmailValidationError(email) {
    if (!email) return null;
    const normalized = normalizeEmail(email);
    if (!normalized.includes('@')) return 'Enter a valid email address';
    if (!isEmailProviderAllowed(normalized)) {
        return 'Please use Gmail, Yahoo, Outlook, or iCloud email';
    }
    return null;
}

export function getPasswordValidationError(password, confirmPassword = null) {
    if (password.length < 6) {
        return 'Password must be at least 6 characters';
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

    const { data, error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
    });

    if (error) {
        const mapped = mapAuthError(error);
        const needsVerification = error.message.includes('Email not confirmed')
            || error.message.includes('Invalid login credentials');

        return {
            success: false,
            error: mapped,
            needsVerification,
        };
    }

    return { success: true, data };
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
