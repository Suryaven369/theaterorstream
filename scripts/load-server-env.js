/**
 * Load server-side env vars for local /api/* handlers (Vite dev).
 * Merges .env files the same way Vite does, without exposing secrets to the client bundle.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};

    const result = {};
    const content = fs.readFileSync(filePath, 'utf8');

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!(key in process.env)) {
            result[key] = value;
        }
    }

    return result;
}

function mergeEnvFiles(root, mode) {
    const files = [
        '.env',
        '.env.local',
        `.env.${mode}`,
        `.env.${mode}.local`,
    ];

    const merged = {};
    for (const file of files) {
        Object.assign(merged, parseEnvFile(path.join(root, file)));
    }
    return merged;
}

function normalizeServerEnv() {
    if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
        process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    }
}

export function loadServerEnv(mode = 'development', root = process.cwd()) {
    const fromVite = loadEnv(mode, root, '');
    const fromFiles = mergeEnvFiles(root, mode);

    Object.assign(process.env, fromFiles, fromVite);
    normalizeServerEnv();

    return process.env;
}

export function getServerEnvStatus() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const tmdbKey = process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN;

    const missing = [];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL or SUPABASE_URL');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!tmdbKey) missing.push('TMDB_API_KEY or TMDB_ACCESS_TOKEN');

    return { ok: missing.length === 0, missing, supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey };
}

export function formatServerEnvHelp(missing) {
    return [
        'Local admin sync needs server-side keys in .env or .env.local (not committed to git).',
        `Missing: ${missing.join(', ')}`,
        'Get SUPABASE_SERVICE_ROLE_KEY from Supabase → Project Settings → API → service_role.',
        'Never use a VITE_ prefix for the service role key.',
    ].join(' ');
}
