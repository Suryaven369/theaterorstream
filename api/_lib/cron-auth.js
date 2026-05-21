function getRequestHeader(request, name) {
    const lower = name.toLowerCase();
    if (request?.headers && typeof request.headers.get === 'function') {
        return request.headers.get(name) || request.headers.get(lower);
    }
    const headers = request?.headers || {};
    return headers[lower] || headers[name];
}

export function verifyCronRequest(request) {
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
        const auth = getRequestHeader(request, 'authorization');
        if (auth === `Bearer ${cronSecret}`) {
            return { ok: true };
        }
        return { ok: false, status: 401, message: 'Invalid cron secret' };
    }

    // Local / unprotected dev only — set CRON_SECRET in production
    if (process.env.VERCEL === '1') {
        return { ok: false, status: 401, message: 'CRON_SECRET is not configured' };
    }

    return { ok: true };
}
