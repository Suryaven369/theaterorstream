import React from 'react';
import { Link } from 'react-router-dom';
import { resolveActivityDisplay } from '../../lib/activityFeed';

const rowClass = 'inline-flex items-start gap-2.5 py-1.5 rounded-md max-w-full hover:bg-white/[0.04] transition-colors';

export default function ActivityFeedRow({
    activity,
    profileUsername,
    timeLabel,
    showUser = false,
    authorUsername,
}) {
    const { verb, title, href, posterSrc, subline } = resolveActivityDisplay(activity, { profileUsername });

    const showPoster = posterSrc || activity?.target_tmdb_id;

    const titleEl = title ? (
        href ? (
            <Link to={href} className="text-white font-medium hover:text-[var(--accent-green)]">
                {title}
            </Link>
        ) : (
            <span className="text-white font-medium">{title}</span>
        )
    ) : null;

    const posterBlock = showPoster ? (
        posterSrc ? (
            href ? (
                <Link to={href} className="shrink-0">
                    <img src={posterSrc} alt="" className="w-9 h-[52px] rounded object-cover border border-white/10" />
                </Link>
            ) : (
                <img src={posterSrc} alt="" className="w-9 h-[52px] rounded object-cover shrink-0 border border-white/10" />
            )
        ) : (
            <div className="w-9 h-[52px] rounded bg-white/5 flex items-center justify-center text-white/20 shrink-0 border border-white/5 text-sm">
                🎬
            </div>
        )
    ) : (
        <div className="w-2 shrink-0" aria-hidden />
    );

    const inner = (
        <>
            {posterBlock}
            <div className="min-w-0 pr-1 max-w-xl">
                <p className="text-sm text-white/85 leading-snug">
                    {showUser && authorUsername && (
                        <>
                            <Link
                                to={`/${authorUsername}/profile`}
                                className="font-semibold text-[var(--primary)] hover:underline mr-1"
                            >
                                @{authorUsername}
                            </Link>
                        </>
                    )}
                    <span className="text-white/45">{verb}</span>
                    {titleEl ? <> {titleEl}</> : null}
                </p>
                {subline ? (
                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{subline}</p>
                ) : null}
                {timeLabel ? (
                    <p className="text-[11px] text-white/35 mt-0.5">{timeLabel}</p>
                ) : null}
            </div>
        </>
    );

    if (href && !title) {
        return (
            <Link to={href} className={rowClass}>
                {inner}
            </Link>
        );
    }

    return (
        <div className={rowClass}>
            {inner}
        </div>
    );
}
