import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApiPlugin } from './scripts/vite-local-api-plugin.js';
import { loadServerEnv } from './scripts/load-server-env.js';

export default defineConfig(({ mode }) => {
    loadServerEnv(mode, process.cwd());

    const proxy = process.env.VITE_VERCEL_DEV_URL
        ? {
            '/api': {
                target: process.env.VITE_VERCEL_DEV_URL,
                changeOrigin: true,
            },
        }
        : undefined;

    return {
        plugins: [
            react(),
            localApiPlugin(),
        ],
        server: {
            proxy,
        },
    };
});
