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

const NODE_API_PREFIXES = ['/api/admin/', '/api/cron/', '/api/taste/', '/api/recommendations/', '/api/social/', '/api/content/movie/'];

function isNodeHandler(urlPath) {
    return NODE_API_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

function resolveHandlerPath(urlPath) {
    const relative = urlPath.replace(/^\/api\/?/, '').replace(/\/$/, '');
    if (!relative) return null;

    const direct = path.join(API_ROOT, `${relative}.js`);
    if (fs.existsSync(direct)) return direct;

    const parts = relative.split('/');
    if (parts.length >= 1) {
        const dir = path.join(API_ROOT, ...parts.slice(0, -1));
        if (fs.existsSync(dir)) {
            const dynamicFile = fs.readdirSync(dir).find(
                (name) => name.startsWith('[') && name.endsWith('].js'),
            );
            if (dynamicFile) return path.join(dir, dynamicFile);
        }
    }

    if (parts.length >= 2) {
        const parentDir = path.join(API_ROOT, parts[0]);
        if (fs.existsSync(parentDir)) {
            const catchAll = fs.readdirSync(parentDir).find(
                (name) => name.startsWith('[...') && name.endsWith('].js'),
            );
            if (catchAll) return path.join(parentDir, catchAll);
        }
    }

    return null;
}

async function readIncomingBody(req) {
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

async function runNodeHandler(handler, req, res, parsedBody) {
    const nodeReq = {
        method: req.method,
        headers: req.headers,
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
                if (!urlPath?.startsWith('/api/')) {
                    next();
                    return;
                }

                const handlerPath = resolveHandlerPath(urlPath);
                if (!handlerPath) {
                    next();
                    return;
                }

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
                        await runNodeHandler(handler, req, res, parsedBody);
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
