import { useEffect } from 'react';

/**
 * Client-side document title + meta manager for React 18 (which, unlike React 19,
 * does NOT hoist <meta> rendered in the tree into <head>). Upserts the tags on
 * mount and restores the previous values on unmount.
 *
 * NOTE: this fixes the in-app tab title and JS-executing tools, but social-share
 * crawlers (Twitter/Facebook/Instagram/WhatsApp) don't run JS — real link
 * previews come from middleware.js bot HTML for movies, collections, blogs,
 * profiles, and posts.
 */
export default function SeoHead({ title, description, image, url, type = 'website' }) {
    useEffect(() => {
        const prevTitle = document.title;
        if (title) document.title = title;

        const touched = [];
        const upsert = (key, name, content) => {
            if (!content) return;
            let el = document.head.querySelector(`meta[${key}="${name}"]`);
            let created = false;
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(key, name);
                document.head.appendChild(el);
                created = true;
            }
            touched.push({ el, prev: el.getAttribute('content'), created });
            el.setAttribute('content', content);
        };

        upsert('name', 'description', description);
        upsert('property', 'og:title', title);
        upsert('property', 'og:description', description);
        upsert('property', 'og:type', type);
        upsert('property', 'og:url', url);
        upsert('property', 'og:image', image);
        upsert('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
        upsert('name', 'twitter:title', title);
        upsert('name', 'twitter:description', description);
        upsert('name', 'twitter:image', image);

        // Canonical link
        let canonical = null;
        let canonicalCreated = false;
        let canonicalPrev = null;
        if (url) {
            canonical = document.head.querySelector('link[rel="canonical"]');
            if (!canonical) {
                canonical = document.createElement('link');
                canonical.setAttribute('rel', 'canonical');
                document.head.appendChild(canonical);
                canonicalCreated = true;
            }
            canonicalPrev = canonical.getAttribute('href');
            canonical.setAttribute('href', url);
        }

        return () => {
            document.title = prevTitle;
            touched.forEach(({ el, prev, created }) => {
                if (created) el.remove();
                else if (prev != null) el.setAttribute('content', prev);
            });
            if (canonical) {
                if (canonicalCreated) canonical.remove();
                else if (canonicalPrev != null) canonical.setAttribute('href', canonicalPrev);
            }
        };
    }, [title, description, image, url, type]);

    return null;
}
