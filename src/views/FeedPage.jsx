import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import SocialFeedPanel from '../components/social/SocialFeedPanel';

export default function FeedPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-24 pb-20 lg:pb-12 px-4 sm:px-8">
            <div className="max-w-6xl mx-auto">
                <Link
                    to="/"
                    className="text-sm text-white/50 hover:text-white inline-flex items-center gap-2 mb-6 transition-colors"
                >
                    <FaArrowLeft /> In Theaters
                </Link>
                <div className="mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">
                        Cinema <span className="text-gradient">Feed</span>
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Reviews, logs, and the people you follow
                    </p>
                </div>
                <SocialFeedPanel />
            </div>
        </div>
    );
}
