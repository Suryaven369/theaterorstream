/**
 * The viewer's country, detected once on app load and used everywhere
 * (Explore rails, Coming Soon, where-to-watch, streaming services, picks).
 *
 * Priority: a country the user picked by hand → server IP country (Vercel) →
 * device time zone → device language → India.
 */
import { useEffect, useState } from 'react';

const KEY = 'selectedRegion';
const SOURCE_KEY = 'selectedRegionSource';      // 'manual' | 'auto'
const DETECTED_AT_KEY = 'selectedRegionDetectedAt';
const REDETECT_MS = 3 * 24 * 60 * 60 * 1000;    // re-check auto country every few days (travel)
const EVENT = 'tos:region-change';
const FALLBACK = 'IN';

// Keep in sync with src/constants/regions.js (not imported to avoid a cycle).
const SUPPORTED = new Set(['IN', 'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'KR', 'BR']);

/** Time zone → country for the regions we support. */
const TZ_COUNTRY = {
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Europe/London': 'GB', 'Europe/Belfast': 'GB',
    'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
    'Europe/Paris': 'FR',
    'Asia/Tokyo': 'JP',
    'Asia/Seoul': 'KR',
    'America/Sao_Paulo': 'BR', 'America/Fortaleza': 'BR', 'America/Recife': 'BR', 'America/Manaus': 'BR', 'America/Bahia': 'BR', 'America/Belem': 'BR',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA',
};

function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

export function normalizeCountry(code) {
    const c = String(code || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** Map any country to one we have catalog data for. */
function toSupported(code) {
    const c = normalizeCountry(code);
    if (!c) return null;
    if (SUPPORTED.has(c)) return c;
    return 'US'; // closest broad catalog for unsupported countries
}

/** Best guess from the device alone (no network). */
export function guessRegionFromDevice() {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
        if (tz.startsWith('Australia/')) return 'AU';
        if (tz.startsWith('America/')) return 'US';
    } catch { /* ignore */ }
    const langs = typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [];
    for (const lang of langs) {
        const region = String(lang || '').split('-')[1];
        if (region && SUPPORTED.has(region.toUpperCase())) return region.toUpperCase();
    }
    return FALLBACK;
}

/** Current region code (sync — safe to call during render). */
export function getUserRegionCode() {
    const saved = normalizeCountry(safeGet(KEY));
    if (saved && SUPPORTED.has(saved)) return saved;
    return guessRegionFromDevice();
}

export function isManualRegion() {
    return safeGet(SOURCE_KEY) === 'manual';
}

function store(code, source) {
    const prev = getUserRegionCode();
    safeSet(KEY, code);
    safeSet(SOURCE_KEY, source);
    if (source === 'auto') safeSet(DETECTED_AT_KEY, String(Date.now()));
    if (prev !== code && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: code }));
    }
}

/** The user chose a country — it wins over detection from now on. */
export function setManualRegion(code) {
    const c = toSupported(code);
    if (c) store(c, 'manual');
}

let detecting = null;

/**
 * Detect the viewer's country once per few days (never overrides a manual pick).
 * Uses Vercel's IP-country header via /api/content/geo, then device signals.
 */
export function detectUserRegion() {
    if (isManualRegion()) return Promise.resolve(getUserRegionCode());
    const last = Number(safeGet(DETECTED_AT_KEY)) || 0;
    if (safeGet(KEY) && Date.now() - last < REDETECT_MS) return Promise.resolve(getUserRegionCode());
    if (detecting) return detecting;

    detecting = (async () => {
        let country = null;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const res = await fetch('/api/content/geo', { signal: controller.signal, cache: 'no-store' });
            clearTimeout(timer);
            if (res.ok) country = normalizeCountry((await res.json())?.country);
        } catch { /* offline / local dev — fall back to device */ }
        const code = toSupported(country) || guessRegionFromDevice();
        if (!isManualRegion()) store(code, 'auto');
        return code;
    })().finally(() => { detecting = null; });
    return detecting;
}

/** React hook: current region code, updates when detection finishes or the user changes it. */
export function useUserRegion() {
    const [code, setCode] = useState(getUserRegionCode);
    useEffect(() => {
        const onChange = (e) => setCode(e.detail || getUserRegionCode());
        window.addEventListener(EVENT, onChange);
        return () => window.removeEventListener(EVENT, onChange);
    }, []);
    return code;
}

export const REGION_CHANGE_EVENT = EVENT;
