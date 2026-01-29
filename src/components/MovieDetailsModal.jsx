import React from 'react';

const MovieDetailsModal = ({ selectedMovie, movieDetails, loadingDetails, onClose }) => {
    if (!selectedMovie) return null;

    // Helper to find director and key crew
    const getDirector = () => movieDetails?.credits?.crew?.find(c => c.job === 'Director');
    const getWriter = () => movieDetails?.credits?.crew?.find(c => c.job === 'Screenplay' || c.job === 'Writer');
    const getTrailer = () => movieDetails?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    const getCertification = () => {
        const usRelease = movieDetails?.release_dates?.results?.find(r => r.iso_3166_1 === 'US');
        return usRelease?.release_dates?.[0]?.certification;
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div
                className="bg-gradient-to-br from-gray-900 via-gray-900 to-black border border-white/10 rounded-xl max-w-6xl w-full my-8"
                onClick={(e) => e.stopPropagation()}
            >
                {loadingDetails ? (
                    <div className="p-12 text-center text-white">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-500 mx-auto mb-4"></div>
                        <p className="text-lg">Loading full details...</p>
                    </div>
                ) : movieDetails ? (
                    <div className="max-h-[90vh] overflow-y-auto">
                        {/* Header with backdrop */}
                        <div className="relative h-80 overflow-hidden rounded-t-xl">
                            {movieDetails.backdrop_path ? (
                                <img
                                    src={`https://image.tmdb.org/t/p/original${movieDetails.backdrop_path}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>

                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white rounded-full p-3 transition-all hover:scale-110 shadow-lg"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {/* Title overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-8">
                                <h2 className="text-4xl md:text-5xl font-bold text-white mb-2 drop-shadow-lg">
                                    {movieDetails.title || movieDetails.name}
                                </h2>
                                {movieDetails.tagline && (
                                    <p className="text-orange-400 italic text-lg drop-shadow-lg">"{movieDetails.tagline}"</p>
                                )}
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* Left Column - Poster */}
                                <div className="lg:col-span-1">
                                    <img
                                        src={movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : '/placeholder.png'}
                                        alt={movieDetails.title || movieDetails.name}
                                        className="w-full rounded-xl shadow-2xl mb-4"
                                    />

                                    {/* Quick Stats */}
                                    <div className="bg-white/5 rounded-xl p-4 space-y-3">
                                        <h3 className="text-white font-semibold text-lg mb-3">Details</h3>

                                        {movieDetails.vote_average > 0 && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Rating</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-yellow-400 text-xl">⭐</span>
                                                    <span className="text-white font-bold">{movieDetails.vote_average.toFixed(1)}/10</span>
                                                </div>
                                            </div>
                                        )}

                                        {movieDetails.release_date && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Release Date</span>
                                                <span className="text-white">{new Date(movieDetails.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                            </div>
                                        )}

                                        {movieDetails.runtime && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Runtime</span>
                                                <span className="text-white">{Math.floor(movieDetails.runtime / 60)}h {movieDetails.runtime % 60}m</span>
                                            </div>
                                        )}

                                        {getCertification() && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Certification</span>
                                                <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-sm font-semibold">{getCertification()}</span>
                                            </div>
                                        )}

                                        {movieDetails.status && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Status</span>
                                                <span className="text-white">{movieDetails.status}</span>
                                            </div>
                                        )}

                                        {movieDetails.original_language && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Language</span>
                                                <span className="text-white uppercase">{movieDetails.original_language}</span>
                                            </div>
                                        )}

                                        {movieDetails.budget > 0 && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Budget</span>
                                                <span className="text-green-400 font-semibold">${(movieDetails.budget / 1000000).toFixed(1)}M</span>
                                            </div>
                                        )}

                                        {movieDetails.revenue > 0 && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-white/60 text-sm">Revenue</span>
                                                <span className="text-green-400 font-semibold">${(movieDetails.revenue / 1000000).toFixed(1)}M</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Keywords */}
                                    {movieDetails.keywords?.keywords?.length > 0 && (
                                        <div className="mt-4 bg-white/5 rounded-xl p-4">
                                            <h3 className="text-white font-semibold mb-3">Keywords</h3>
                                            <div className="flex flex-wrap gap-2">
                                                {movieDetails.keywords.keywords.slice(0, 12).map(keyword => (
                                                    <span key={keyword.id} className="px-2 py-1 bg-white/10 text-white/80 rounded text-xs">
                                                        {keyword.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column - Details */}
                                <div className="lg:col-span-2 space-y-6">
                                    {/* Genres */}
                                    {movieDetails.genres?.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {movieDetails.genres.map(g => (
                                                <span key={g.id} className="px-4 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-full text-sm text-white font-medium">
                                                    {g.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Trailer */}
                                    {getTrailer() && (
                                        <div className="bg-black/30 rounded-xl overflow-hidden">
                                            <div className="aspect-video">
                                                <iframe
                                                    className="w-full h-full"
                                                    src={`https://www.youtube.com/embed/${getTrailer().key}`}
                                                    title="YouTube video player"
                                                    frameBorder="0"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                    allowFullScreen
                                                ></iframe>
                                            </div>
                                        </div>
                                    )}

                                    {/* Overview */}
                                    {movieDetails.overview && (
                                        <div>
                                            <h3 className="text-2xl font-bold text-white mb-3">Overview</h3>
                                            <p className="text-white/80 text-base leading-relaxed">
                                                {movieDetails.overview}
                                            </p>
                                        </div>
                                    )}

                                    {/* Director & Writer */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {getDirector() && (
                                            <div className="bg-white/5 rounded-xl p-4">
                                                <p className="text-white/60 text-sm mb-1">Director</p>
                                                <p className="text-white font-semibold text-lg">{getDirector().name}</p>
                                            </div>
                                        )}
                                        {getWriter() && (
                                            <div className="bg-white/5 rounded-xl p-4">
                                                <p className="text-white/60 text-sm mb-1">Writer</p>
                                                <p className="text-white font-semibold text-lg">{getWriter().name}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Cast */}
                                    {movieDetails.credits?.cast?.length > 0 && (
                                        <div>
                                            <h3 className="text-2xl font-bold text-white mb-4">Top Cast</h3>
                                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {movieDetails.credits.cast.slice(0, 15).map(actor => (
                                                    <div key={actor.id} className="group">
                                                        <div className="relative overflow-hidden rounded-lg mb-2">
                                                            <img
                                                                src={actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : 'https://via.placeholder.com/185x278?text=No+Image'}
                                                                alt={actor.name}
                                                                className="w-full h-32 object-cover group-hover:scale-110 transition-transform"
                                                            />
                                                        </div>
                                                        <p className="text-white font-medium text-sm truncate">{actor.name}</p>
                                                        <p className="text-white/50 text-xs truncate">{actor.character}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Production Companies */}
                                    {movieDetails.production_companies?.length > 0 && (
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-4">Production Companies</h3>
                                            <div className="flex flex-wrap gap-6">
                                                {movieDetails.production_companies.map(company => (
                                                    <div key={company.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                                                        {company.logo_path && (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w92${company.logo_path}`}
                                                                alt={company.name}
                                                                className="h-8 object-contain"
                                                            />
                                                        )}
                                                        <span className="text-white/80 text-sm">{company.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Backdrops Gallery */}
                                    {movieDetails.images?.backdrops?.length > 0 && (
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-4">Images</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                {movieDetails.images.backdrops.slice(0, 6).map((image, idx) => (
                                                    <img
                                                        key={idx}
                                                        src={`https://image.tmdb.org/t/p/w500${image.file_path}`}
                                                        alt=""
                                                        className="w-full rounded-lg hover:scale-105 transition-transform cursor-pointer"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-12 text-center text-white">
                        <p className="text-lg">Failed to load movie details</p>
                        <button
                            onClick={onClose}
                            className="mt-4 px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MovieDetailsModal;
