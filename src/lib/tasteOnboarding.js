import { TASTE_ONBOARDING_NEW_ACCOUNT_MS } from '../constants/tasteOnboarding';

export const TASTE_PENDING_KEY = 'tos_pending_taste_onboarding';
export const TASTE_AFTER_KEY = 'tos_after_taste';
export const TASTE_RESOLVED_KEY = 'tos_taste_onboarding_resolved';

function cacheKey(userId) {
    return `tos_taste_questionnaire_${userId}`;
}

export function markTasteOnboardingPending() {
    try {
        sessionStorage.setItem(TASTE_PENDING_KEY, '1');
    } catch {
        /* private mode */
    }
}

export function clearTasteOnboardingPending() {
    try {
        sessionStorage.removeItem(TASTE_PENDING_KEY);
    } catch {
        /* ignore */
    }
}

export function isTasteOnboardingPending() {
    try {
        return sessionStorage.getItem(TASTE_PENDING_KEY) === '1';
    } catch {
        return false;
    }
}

export function rememberAfterTastePath(path) {
    if (!path || path === '/auth' || path.startsWith('/onboarding')) return;
    try {
        sessionStorage.setItem(TASTE_AFTER_KEY, path);
    } catch {
        /* ignore */
    }
}

export function consumeAfterTastePath() {
    try {
        const path = sessionStorage.getItem(TASTE_AFTER_KEY);
        sessionStorage.removeItem(TASTE_AFTER_KEY);
        return path || '/';
    } catch {
        return '/';
    }
}

export function getCachedQuestionnaireStatus(userId) {
    if (!userId) return null;
    try {
        return localStorage.getItem(cacheKey(userId));
    } catch {
        return null;
    }
}

export function setCachedQuestionnaireStatus(userId, status) {
    if (!userId || !status) return;
    try {
        localStorage.setItem(cacheKey(userId), status);
    } catch {
        /* ignore */
    }
}

export function isNewAccountForTasteOnboarding(user) {
    const created = Date.parse(user?.created_at);
    if (!Number.isFinite(created)) return false;
    return Date.now() - created < TASTE_ONBOARDING_NEW_ACCOUNT_MS;
}

export function markTasteOnboardingResolved() {
    try {
        sessionStorage.setItem(TASTE_RESOLVED_KEY, '1');
        sessionStorage.removeItem(TASTE_PENDING_KEY);
    } catch {
        /* ignore */
    }
}

export function isTasteOnboardingResolved() {
    try {
        return sessionStorage.getItem(TASTE_RESOLVED_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * True when a signed-in user should be sent to the taste questionnaire
 * instead of the home feed (no movie posts/titles on first run).
 */
export function shouldGateTasteOnboarding(user) {
    if (!user?.id) return false;
    if (isTasteOnboardingResolved()) return false;
    const cached = getCachedQuestionnaireStatus(user.id);
    if (cached === 'completed' || cached === 'skipped') return false;
    if (isTasteOnboardingPending()) return true;
    return isNewAccountForTasteOnboarding(user);
}
