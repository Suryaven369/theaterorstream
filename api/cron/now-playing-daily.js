import { createCronHandler } from '../_lib/tmdb-sync-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

export default createCronHandler('now-playing-daily');
