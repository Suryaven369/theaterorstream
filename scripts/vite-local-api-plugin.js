/**
 * Serves /api/* routes during `vite` dev (Vercel serverless handlers).
 * Production still uses Vercel; this removes the 404 on localhost:5173.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerEnv, getServerEnvStatus, formatServerEnvHelp } from './load-server-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '../api');

const NODE_API_PREFIXES = ['/api/admin/', '/api/cron/', '/api/taste/', '/api/recommendations/', '/api/social/', '/api/feed/', '/api/content/movie/', '/api/websub'];

function isNodeHandler(urlPath) {
    return NODE_API_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

function resolveHandlerPath(urlPath) {
    const relative = urlPath.replace(/^\/api\/?/, '').replace(/\/$/, '');
    if (!relative) return null;

    const direct = path.join(API_ROOT, `${relative}.js`);
    if (fs.existsSync(direct)) return { handlerPath: direct, params: {} };

    const parts = relative.split('/');
    if (parts.length >= 1) {
        const dir = path.join(API_ROOT, ...parts.slice(0, -1));
        if (fs.existsSync(dir)) {
            const dynamicFile = fs.readdirSync(dir).find(
                (name) => name.startsWith('[') && !name.startsWith('[...') && name.endsWith('].js'),
            );
            if (dynamicFile) {
                const paramName = dynamicFile.slice(1, -('].js'.length));
                const paramValue = parts[parts.length - 1];
                return {
                    handlerPath: path.join(dir, dynamicFile),
                    params: { [paramName]: paramValue },
                };
            }
        }
    }

    if (parts.length >= 2) {
        const parentDir = path.join(API_ROOT, parts[0]);
        if (fs.existsSync(parentDir)) {
            const catchAll = fs.readdirSync(parentDir).find(
                (name) => name.startsWith('[...') && name.endsWith('].js'),
            );
            if (catchAll) {
                const paramName = catchAll.slice('[...'.length, -('].js'.length));
                return {
                    handlerPath: path.join(parentDir, catchAll),
                    params: { [paramName]: parts.slice(1) },
                };
            }
        }
    }

    return null;
}

async function readIncomingBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') {
        return null;
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (!chunks.length) return null;
    return Buffer.concat(chunks);
}

function createNodeResponse(res) {
    const state = { statusCode: 200, headers: {} };

    return {
        status(code) {
            state.statusCode = code;
            return this;
        },
        setHeader(key, value) {
            state.headers[key] = value;
        },
        json(payload) {
            state.headers['Content-Type'] = 'application/json';
            res.writeHead(state.statusCode, state.headers);
            res.end(JSON.stringify(payload));
        },
        end(body) {
            res.writeHead(state.statusCode, state.headers);
            res.end(body);
        },
    };
}

async function runNodeHandler(handler, req, res, parsedBody, routeParams) {
    const host = req.headers.host || 'localhost:5173';
    const fullUrl = new URL(req.url, `http://${host}`);
    const query = { ...routeParams };
    for (const [key, value] of fullUrl.searchParams) {
        query[key] = value;
    }

    const nodeReq = {
        method: req.method,
        headers: req.headers,
        url: req.url,
        query,
        body: parsedBody || undefined,
    };

    const nodeRes = createNodeResponse(res);
    await handler(nodeReq, nodeRes);
}

async function runEdgeHandler(handler, req, res, bodyBuffer) {
    const host = req.headers.host || 'localhost:5173';
    const url = `http://${host}${req.url}`;
    const init = {
        method: req.method,
        headers: req.headers,
    };

    if (bodyBuffer && req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = bodyBuffer;
    }

    const request = new Request(url, init);
    const response = await handler(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
}

const SUPABASE_PROXY_PREFIX = '/supabase-proxy';

function buildSupabaseProxyHeaders(req) {
    const headers = {};
    // 'prefer' carries count=exact / resolution=ignore-duplicates etc., and
    // 'range' + 'range-unit' carry pagination — supabase-js sends all of these on
    // every query. Dropping any of them doesn't error, it just silently breaks
    // PostgREST's response (e.g. count:'exact' comes back as an unparsable "*"
    // instead of a real number) — which is much harder to spot than a failed request.
    const pass = [
        'apikey',
        'authorization',
        'content-type',
        'x-client-info',
        'x-supabase-api-version',
        'prefer',
        'range',
        'range-unit',
    ];
    for (const name of pass) {
        const value = req.headers[name];
        if (value) headers[name] = value;
    }
    return headers;
}

async function proxySupabaseRequest(req, res, bodyBuffer) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'VITE_SUPABASE_URL is not configured' }));
        return;
    }

    const urlPath = req.url || '';
    const queryIndex = urlPath.indexOf('?');
    const pathOnly = queryIndex >= 0 ? urlPath.slice(0, queryIndex) : urlPath;
    const query = queryIndex >= 0 ? urlPath.slice(queryIndex) : '';
    const upstreamPath = pathOnly.slice(SUPABASE_PROXY_PREFIX.length) || '/';
    const targetUrl = `${supabaseUrl.replace(/\/$/, '')}${upstreamPath}${query}`;

    const init = {
        method: req.method,
        headers: buildSupabaseProxyHeaders(req),
    };

    if (bodyBuffer?.length && req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = bodyBuffer;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
        const upstream = await fetch(targetUrl, { ...init, signal: controller.signal });
        const buffer = Buffer.from(await upstream.arrayBuffer());

        res.statusCode = upstream.status;
        const skipHeaders = new Set(['transfer-encoding', 'content-encoding', 'content-length']);
        upstream.headers.forEach((value, key) => {
            if (skipHeaders.has(key.toLowerCase())) return;
            res.setHeader(key, value);
        });
        res.setHeader('Content-Length', buffer.length);
        res.end(buffer);
    } finally {
        clearTimeout(timeoutId);
    }
}

export function localApiPlugin() {
    return {
        name: 'theaterorstream-local-api',
        configureServer(server) {
            loadServerEnv(server.config.mode, server.config.root || process.cwd());

            const envStatus = getServerEnvStatus();
            if (!envStatus.ok) {
                console.warn(
                    '[local-api] Admin sync / cron routes need server env vars:\n'
                    + `  → ${formatServerEnvHelp(envStatus.missing)}`,
                );
            }

            server.middlewares.use(async (req, res, next) => {
                loadServerEnv(server.config.mode, server.config.root || process.cwd());

                const urlPath = req.url?.split('?')[0];

                if (urlPath?.startsWith(SUPABASE_PROXY_PREFIX)) {
                    try {
                        const bodyBuffer = await readIncomingBody(req);
                        await proxySupabaseRequest(req, res, bodyBuffer);
                    } catch (error) {
                        console.error('[supabase-proxy]', req.url, error);
                        if (!res.headersSent) {
                            res.statusCode = 502;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({
                                error: error.message || 'Supabase proxy failed',
                            }));
                        }
                    }
                    return;
                }

                if (!urlPath?.startsWith('/api/')) {
                    next();
                    return;
                }

                const resolved = resolveHandlerPath(urlPath);
                if (!resolved) {
                    next();
                    return;
                }
                const { handlerPath, params: routeParams } = resolved;

                try {
                    if (isNodeHandler(urlPath)) {
                        const envStatus = getServerEnvStatus();
                        if (!envStatus.ok) {
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({
                                error: formatServerEnvHelp(envStatus.missing),
                            }));
                            return;
                        }
                    }

                    const bodyBuffer = await readIncomingBody(req);
                    let parsedBody = null;
                    if (bodyBuffer?.length) {
                        try {
                            parsedBody = JSON.parse(bodyBuffer.toString('utf8'));
                        } catch {
                            parsedBody = bodyBuffer;
                        }
                    }

                    const mod = await server.ssrLoadModule(handlerPath);
                    const handler = mod.default;
                    if (typeof handler !== 'function') {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'API handler not found' }));
                        return;
                    }

                    if (isNodeHandler(urlPath)) {
                        await runNodeHandler(handler, req, res, parsedBody, routeParams);
                    } else {
                        await runEdgeHandler(handler, req, res, bodyBuffer);
                    }
                } catch (error) {
                    console.error('[local-api]', urlPath, error);
                    if (!res.headersSent) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            error: error.message || 'Local API handler failed',
                        }));
                    }
                }
            });
        },
    };
}
