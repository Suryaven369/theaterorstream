// WebSub (PubSubHubbub) callback for YouTube trailer channels.
//  GET  -> subscription verification handshake (echo hub.challenge)
//  POST -> a channel uploaded: verify HMAC, parse the Atom entry, ingest it
//          (TMDB verify + persist clean trailer_posts). This is the PUSH path —
//          it fires the instant a studio uploads, no polling.
import crypto from 'node:crypto';
import { ingestYouTubeVideo } from './_lib/rss-server.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function readRawBody(req) {
    // Vercel passes a Node stream; the local dev plugin passes an already-read body.
    if (typeof req.on !== 'function') {
        const b = req.body;
        if (b == null) return Promise.resolve(Buffer.from(''));
        if (Buffer.isBuffer(b)) return Promise.resolve(b);
        return Promise.resolve(Buffer.from(typeof b === 'string' ? b : JSON.stringify(b)));
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function decodeXml(s) {
    if (!s) return s;
    return s
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .trim();
}

export default async function handler(req, res) {
    // --- Subscription verification handshake ---
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const challenge = url.searchParams.get('hub.challenge');
        if (challenge) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            return res.end(challenge);
        }
        res.statusCode = 400;
        return res.end('missing hub.challenge');
    }

    // --- Push notification: a channel published something ---
    if (req.method === 'POST') {
        const raw = await readRawBody(req);

        // Verify the hub signature when a shared secret is configured.
        const secret = process.env.WEBSUB_SECRET;
        if (secret) {
            const sig = String(req.headers['x-hub-signature'] || '');
            const expected = 'sha1=' + crypto.createHmac('sha1', secret).update(raw).digest('hex');
            const ok = sig.length === expected.length
                && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
            if (!ok) { res.statusCode = 202; return res.end(); } // ack, ignore
        }

        const xml = raw.toString('utf8');
        // Deletions / non-entry pings: just acknowledge.
        if (/<at:deleted-entry/.test(xml) || !/<entry>/.test(xml)) {
            res.statusCode = 204;
            return res.end();
        }

        const grab = (re) => (xml.match(re) || [])[1];
        const entry = grab(/<entry>([\s\S]*?)<\/entry>/) || xml;
        const inEntry = (re) => (entry.match(re) || [])[1];

        const videoId = inEntry(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const channelId = inEntry(/<yt:channelId>([^<]+)<\/yt:channelId>/);
        const published = inEntry(/<published>([^<]+)<\/published>/);
        const authorName = decodeXml(inEntry(/<author>\s*<name>([^<]+)<\/name>/));
        const title = decodeXml(inEntry(/<title>([\s\S]*?)<\/title>/));

        try {
            const result = await ingestYouTubeVideo({ videoId, title, publishedAt: published, channelId, authorName });
            console.log('[websub] push ingested:', JSON.stringify(result));
        } catch (err) {
            console.error('[websub] ingest failed:', err?.message);
        }
        // Always 2xx so the hub doesn't enter a retry storm.
        res.statusCode = 204;
        return res.end();
    }

    res.statusCode = 405;
    return res.end('method not allowed');
}
