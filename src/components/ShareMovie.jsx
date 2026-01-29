import React, { useState, useRef } from "react";
import html2canvas from "html2canvas";
import { FaShare, FaTwitter, FaInstagram, FaFacebook, FaDownload, FaTimes, FaLink } from "react-icons/fa";

// TOS Rating categories with colors
const TOS_CATEGORIES = [
    { key: "acting", label: "Acting", color: "#22c55e" },
    { key: "screenplay", label: "Story", color: "#3b82f6" },
    { key: "sound", label: "Sound", color: "#a855f7" },
    { key: "direction", label: "Direction", color: "#f97316" },
    { key: "entertainmentValue", label: "Fun", color: "#ec4899" },
    { key: "pacing", label: "Pacing", color: "#06b6d4" },
    { key: "cinematicQuality", label: "Visuals", color: "#f59e0b" },
];

// Mini TOS Rating Circle for share card
const MiniTOSCircle = ({ value, label, color }) => (
    <div className="flex flex-col items-center">
        <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
            style={{
                borderColor: color,
                color: color,
                backgroundColor: 'rgba(0,0,0,0.5)'
            }}
        >
            {value?.toFixed(1) || '-'}
        </div>
        <span className="text-[8px] text-white/70 mt-1 text-center leading-tight">{label}</span>
    </div>
);

// Shareable Card Component (for generating image) - TOS Style
const ShareableCard = React.forwardRef(({ movieTitle, movieYear, posterUrl, backdropUrl, backdropBase64, ratings, overallScore }, ref) => {

    // Calculate percentage from 10-point scale
    const percentage = Math.round((overallScore || 0) * 10);

    // Get color for the main score ring
    const getScoreColor = () => {
        if (percentage >= 70) return "#22c55e"; // Green
        if (percentage >= 50) return "#eab308"; // Yellow
        if (percentage >= 30) return "#f97316"; // Orange
        return "#ef4444"; // Red
    };

    const scoreColor = getScoreColor();

    // Get verdict text
    const getVerdict = () => {
        if (percentage >= 70) return "🎬 Theater";
        if (percentage >= 50) return "📺 Stream";
        return "⏭️ Skip";
    };

    return (
        <div
            ref={ref}
            className="w-[360px] h-[640px] bg-black relative overflow-hidden"
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            {/* Background - Movie Backdrop/Poster */}
            <div className="absolute inset-0">
                {(backdropBase64 || backdropUrl || posterUrl) ? (
                    <img
                        src={backdropBase64 || backdropUrl || posterUrl}
                        alt={movieTitle}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-b from-gray-800 to-black" />
                )}
                {/* Dark overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black" />
            </div>

            {/* Content */}
            <div className="relative z-10 h-full flex flex-col p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-white font-semibold text-base">{movieTitle}</h3>
                        <p className="text-white/50 text-xs">Movie • {movieYear || '2024'}</p>
                    </div>
                    <img
                        src="https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg"
                        alt="TOS Logo"
                        className="w-8 h-8 rounded-lg object-cover"
                        crossOrigin="anonymous"
                    />
                </div>

                {/* Movie Title Overlay (large) */}
                <div className="flex-1 flex items-center justify-center">
                    <h1
                        className="text-white font-black text-4xl text-center leading-tight px-4"
                        style={{ textShadow: '2px 2px 20px rgba(0,0,0,0.8)' }}
                    >
                        {movieTitle}
                    </h1>
                </div>

                {/* Score Circle */}
                <div className="flex justify-center mb-4">
                    <div className="relative">
                        {/* Score Ring */}
                        <svg width="120" height="120" viewBox="0 0 120 120">
                            {/* Background arc */}
                            <circle
                                cx="60"
                                cy="60"
                                r="50"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="8"
                            />
                            {/* Colored arc */}
                            <circle
                                cx="60"
                                cy="60"
                                r="50"
                                fill="none"
                                stroke={scoreColor}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={`${percentage * 3.14} 314`}
                                transform="rotate(-90 60 60)"
                                style={{ filter: `drop-shadow(0 0 8px ${scoreColor})` }}
                            />
                        </svg>
                        {/* Center content */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span
                                className="text-3xl font-bold"
                                style={{ color: scoreColor }}
                            >
                                {(overallScore || 0).toFixed(1)}
                            </span>
                            <span className="text-white/50 text-[10px]">/10</span>
                        </div>
                    </div>
                </div>

                {/* Verdict */}
                <div className="text-center mb-4">
                    <span
                        className="text-lg font-bold"
                        style={{ color: scoreColor }}
                    >
                        {getVerdict()}
                    </span>
                </div>

                {/* TOS Rating Categories - Small Circles */}
                <div className="bg-black/40 backdrop-blur-sm rounded-xl p-3">
                    <p className="text-white/40 text-[9px] uppercase tracking-wider mb-2 text-center">TOS Ratings</p>
                    <div className="flex justify-between">
                        {TOS_CATEGORIES.map((cat) => (
                            <MiniTOSCircle
                                key={cat.key}
                                value={ratings?.[cat.key]}
                                label={cat.label}
                                color={cat.color}
                            />
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-3 flex items-center justify-center">
                    <span className="text-white/40 text-[10px]">theaterorstream.com • #TheaterOrStream</span>
                </div>
            </div>
        </div>
    );
});


// Main Share Modal Component
const ShareMovieModal = ({ isOpen, onClose, movieTitle, movieYear, posterUrl, backdropUrl, ratings, imageURL }) => {
    const cardRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [shareImage, setShareImage] = useState(null);
    const [copied, setCopied] = useState(false);
    const [backdropBase64, setBackdropBase64] = useState(null);

    // Calculate overall score
    const calculateOverall = () => {
        if (!ratings) return 0;
        const values = Object.values(ratings).filter(v => typeof v === 'number');
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    };

    const overallScore = calculateOverall();
    const fullBackdropUrl = backdropUrl ? (backdropUrl.startsWith('http') ? backdropUrl : imageURL + backdropUrl) : null;
    const fullPosterUrl = posterUrl ? (posterUrl.startsWith('http') ? posterUrl : imageURL + posterUrl) : null;

    // Convert image URL to base64 to bypass CORS
    const convertToBase64 = async (url) => {
        try {
            // Use a CORS proxy for TMDB images
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Error converting to base64:', error);
            return null;
        }
    };

    // Generate shareable image
    const generateImage = async () => {
        if (!cardRef.current) return;
        setGenerating(true);

        try {
            // First convert backdrop/poster to base64
            const imageToConvert = fullBackdropUrl || fullPosterUrl;
            if (imageToConvert && !backdropBase64) {
                const base64 = await convertToBase64(imageToConvert);
                if (base64) {
                    setBackdropBase64(base64);
                    // Wait a bit for the image to render
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#000000',
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
            });

            const imageUrl = canvas.toDataURL('image/png');
            setShareImage(imageUrl);
        } catch (error) {
            console.error('Error generating image:', error);
        }

        setGenerating(false);
    };

    // Download image
    const downloadImage = () => {
        if (!shareImage) return;

        const link = document.createElement('a');
        link.download = `${movieTitle?.replace(/[^a-zA-Z0-9]/g, '_')}_TOS_Rating.png`;
        link.href = shareImage;
        link.click();
    };

    // Copy link to clipboard
    const copyLink = async () => {
        const url = window.location.href;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Share to Twitter
    const shareToTwitter = () => {
        const text = `🎬 ${movieTitle} - TOS Rating: ${overallScore.toFixed(1)}/10\n\n${overallScore >= 7 ? "Worth watching in theaters! 🎬" : "Good for streaming 📺"
            }\n\n#TheaterOrStream #MovieReview`;
        const url = window.location.href;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    };

    // Share to Facebook
    const shareToFacebook = () => {
        const url = window.location.href;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    };

    // Generate image when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setBackdropBase64(null); // Reset backdrop
            setShareImage(null); // Reset share image
            setTimeout(generateImage, 100);
        }
    }, [isOpen]);

    // Regenerate image after backdrop is loaded
    React.useEffect(() => {
        if (isOpen && backdropBase64 && !shareImage) {
            setTimeout(async () => {
                if (!cardRef.current) return;
                try {
                    const canvas = await html2canvas(cardRef.current, {
                        backgroundColor: '#000000',
                        scale: 2,
                        useCORS: true,
                        allowTaint: true,
                        logging: false,
                    });
                    const imageUrl = canvas.toDataURL('image/png');
                    setShareImage(imageUrl);
                    setGenerating(false);
                } catch (error) {
                    console.error('Error regenerating image:', error);
                    setGenerating(false);
                }
            }, 300);
        }
    }, [backdropBase64]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/10">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <FaShare className="text-green-400" />
                        <h3 className="text-white font-semibold">Share Rating</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* Preview Card (hidden, used for generation) */}
                <div className="absolute left-[-9999px]">
                    <ShareableCard
                        ref={cardRef}
                        movieTitle={movieTitle}
                        movieYear={movieYear}
                        posterUrl={fullPosterUrl}
                        backdropUrl={fullBackdropUrl}
                        backdropBase64={backdropBase64}
                        ratings={ratings}
                        overallScore={overallScore}
                    />
                </div>

                {/* Generated Image Preview */}
                <div className="p-4">
                    {generating ? (
                        <div className="aspect-square bg-white/5 rounded-xl flex items-center justify-center">
                            <div className="text-center">
                                <div className="animate-spin text-2xl mb-2">⏳</div>
                                <p className="text-white/40 text-sm">Generating shareable image...</p>
                            </div>
                        </div>
                    ) : shareImage ? (
                        <div className="rounded-xl overflow-hidden shadow-2xl">
                            <img src={shareImage} alt="Share preview" className="w-full" />
                        </div>
                    ) : (
                        <div className="aspect-square bg-white/5 rounded-xl flex items-center justify-center">
                            <p className="text-white/40 text-sm">Failed to generate image</p>
                        </div>
                    )}
                </div>

                {/* Share Buttons */}
                <div className="p-4 border-t border-white/10">
                    <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Share to</p>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Twitter */}
                        <button
                            onClick={shareToTwitter}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] font-medium transition-all"
                        >
                            <FaTwitter /> Twitter
                        </button>

                        {/* Facebook */}
                        <button
                            onClick={shareToFacebook}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] font-medium transition-all"
                        >
                            <FaFacebook /> Facebook
                        </button>

                        {/* Instagram (Download for Stories) */}
                        <button
                            onClick={downloadImage}
                            disabled={!shareImage}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#833AB4]/10 via-[#FD1D1D]/10 to-[#F77737]/10 hover:from-[#833AB4]/20 hover:via-[#FD1D1D]/20 hover:to-[#F77737]/20 text-pink-400 font-medium transition-all disabled:opacity-50"
                        >
                            <FaInstagram /> Save for Instagram
                        </button>

                        {/* Copy Link */}
                        <button
                            onClick={copyLink}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-medium transition-all"
                        >
                            <FaLink /> {copied ? 'Copied!' : 'Copy Link'}
                        </button>
                    </div>

                    {/* Download Button */}
                    <button
                        onClick={downloadImage}
                        disabled={!shareImage}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-black font-semibold hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <FaDownload /> Download Image
                    </button>
                </div>

                {/* Tip */}
                <div className="p-4 pt-0">
                    <p className="text-white/30 text-xs text-center">
                        💡 Tip: Download the image and share it on Instagram Stories!
                    </p>
                </div>
            </div>
        </div>
    );
};

// Share Button Component (to use on Details page)
export const ShareButton = ({ movieTitle, movieYear, posterUrl, backdropUrl, ratings, imageURL }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/30 hover:bg-green-500/10 text-white/70 hover:text-green-400 transition-all"
            >
                <FaShare className="text-sm" />
                <span className="text-sm font-medium">Share</span>
            </button>

            <ShareMovieModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                movieTitle={movieTitle}
                movieYear={movieYear}
                posterUrl={posterUrl}
                backdropUrl={backdropUrl}
                ratings={ratings}
                imageURL={imageURL}
            />
        </>
    );
};

export default ShareMovieModal;
