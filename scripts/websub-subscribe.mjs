// Activate real-time PUSH now: subscribe every YouTube trailer source to the
// WebSub hub. Run once after deploying (the daily websub-renew cron keeps it
// alive afterwards).
//
//   PUBLIC_BASE_URL=https://your-app.vercel.app node scripts/websub-subscribe.mjs
//   # or pass it as an arg:
//   node scripts/websub-subscribe.mjs https://your-app.vercel.app
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;

const base = process.argv[2] || process.env.PUBLIC_BASE_URL;
if (!base) {
    console.error('Provide your public site URL: node scripts/websub-subscribe.mjs https://your-app.vercel.app');
    process.exit(1);
}

const { subscribeYouTubeSources } = await import('../api/_lib/rss-server.js');
const result = await subscribeYouTubeSources({ callbackUrl: `${base.replace(/\/$/, '')}/api/websub` });
console.log(JSON.stringify(result, null, 2));
console.log(`\nSubscribed ${result.results.filter((r) => r.ok).length}/${result.count} channels to push.`);
