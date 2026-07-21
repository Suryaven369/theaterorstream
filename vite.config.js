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
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return undefined;
                        if (id.includes('@supabase')) return 'supabase';
                        if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
                            return 'react-vendor';
                        }
                        if (id.includes('moment')) return 'moment';
                        if (id.includes('html2canvas') || id.includes('dompurify')) return 'heavy-ui';
                        if (id.includes('react-icons')) return 'icons';
                        return undefined;
                    },
                },
            },
        },
    };
});
