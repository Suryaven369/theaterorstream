import { fetchMovieDetail, jsonResponse, errorResponse } from '../../_lib/movie-detail-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 30,
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const tmdbId = req.query?.tmdbId;
        if (!tmdbId) {
            return res.status(400).json({ error: 'Missing movie id' });
        }

        const data = await fetchMovieDetail(tmdbId);

        if (!data) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('movie detail error:', error);
        return res.status(500).json({ error: error.message || 'Failed to load movie details' });
    }
}
