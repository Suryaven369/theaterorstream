import React, { useEffect, useState } from 'react';
import { getSimilarTitlesFromEdge } from '../../lib/contentEdgeApi';
import HorizontalScrollCard from '../HorizontalScrollCard';

/**
 * "More like this" — similar titles for the movie/show being viewed.
 * Biased to the seed title's language, region, and genres (not the viewer's taste).
 * Hides if empty.
 */
export default function SimilarMoviesSection({ tmdbId, mediaType = 'movie' }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tmdbId) return undefined;
        let alive = true;
        setLoading(true);
        // Request a larger pool; server re-ranks by language/genre before returning
        getSimilarTitlesFromEdge(tmdbId, mediaType, 18)
            .then((res) => { if (alive) { setItems((res?.data || []).slice(0, 12)); setLoading(false); } })
            .catch(() => { if (alive) { setItems([]); setLoading(false); } });
        return () => { alive = false; };
    }, [tmdbId, mediaType]);

    if (loading || !items.length) return null;

    return (
        <HorizontalScrollCard
            heading="More like this"
            data={items}
            media_type={mediaType}
        />
    );
}
