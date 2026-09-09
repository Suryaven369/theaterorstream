import React, { useEffect, useState } from 'react';
import { getSimilarTitlesFromEdge } from '../../lib/contentEdgeApi';
import { getPersonalizedSimilar } from '../../lib/recommendationApi';
import { useAuth } from '../../context/AuthContext';
import HorizontalScrollCard from '../HorizontalScrollCard';

/**
 * "More like this" — personalized for signed-in users; TMDB+library for guests.
 */
export default function SimilarMoviesSection({ tmdbId, mediaType = 'movie' }) {
    const { isAuthenticated } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tmdbId) return undefined;
        let alive = true;
        setLoading(true);

        const load = async () => {
            if (isAuthenticated) {
                const personalized = await getPersonalizedSimilar(tmdbId, {
                    limit: 14,
                    mediaType,
                    ottMode: false,
                });
                if (!alive) return;
                if (personalized.ok && personalized.data?.length) {
                    setItems(personalized.data.slice(0, 12));
                    setLoading(false);
                    return;
                }
            }

            try {
                const res = await getSimilarTitlesFromEdge(tmdbId, mediaType, 18);
                if (alive) {
                    setItems((res?.data || []).slice(0, 12));
                    setLoading(false);
                }
            } catch {
                if (alive) {
                    setItems([]);
                    setLoading(false);
                }
            }
        };

        load();
        return () => { alive = false; };
    }, [tmdbId, mediaType, isAuthenticated]);

    if (loading || !items.length) return null;

    return (
        <HorizontalScrollCard
            heading="More like this"
            data={items}
            media_type={mediaType}
        />
    );
}
