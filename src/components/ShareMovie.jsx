import React, { useState, useRef } from "react";
import html2canvas from "html2canvas";
import { FaShare, FaTwitter, FaInstagram, FaFacebook, FaDownload, FaTimes, FaLink, FaReddit } from "react-icons/fa";

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

// Mini TOS Rating Circle for share card - Clean and Readable
const MiniTOSCircle = ({ value, label, color }) => (
    <div className="flex flex-col items-center justify-center p-1 min-w-[64px]">
        <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-base font-black border-2 bg-black/40 backdrop-blur-sm"
            style={{
                borderColor: color,
                color: '#ffffff',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)'
            }}
        >
            {value?.toFixed(1) || '-'}
        </div>
        <span
            className="text-[9px] uppercase tracking-[0.15em] mt-2 text-center font-extrabold text-white/90 drop-shadow-md"
        >
            {label}
        </span>
    </div>
);

// Shareable Card Component (for generating image) - TOS Style
const ShareableCard = React.forwardRef(({ movieTitle, movieYear, posterUrl, backdropUrl, backdropBase64, posterBase64, ratings, overallScore }, ref) => {

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

    // Explicitly check for data URIs to ensure no CORS issues
    const bgImage = backdropBase64 || posterBase64 || backdropUrl || posterUrl;
    const posterDisplay = posterBase64 || posterUrl || backdropBase64 || backdropUrl;

    return (
        <div
            ref={ref}
            className="w-[360px] h-[640px] bg-[#0a0a0a] relative overflow-hidden flex flex-col"
            style={{ fontFamily: "'Inter', sans-serif" }}
        >
            {/* Background - Blurred Art with improved visibility */}
            <div className="absolute inset-0 z-0">
                {bgImage ? (
                    <img
                        src={bgImage}
                        alt=""
                        className="w-full h-full object-cover opacity-50 blur-[50px] scale-150"
                        crossOrigin="anonymous"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-900 via-black to-gray-800" />
                )}
                {/* Dark Vignette */}
                <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/80" />
                <div className="absolute inset-0 bg-black/40" />
            </div>

            {/* Content Container */}
            <div className="relative z-10 h-full flex flex-col p-7 items-center">

                {/* Header Section - More Compact */}
                <div className="w-full flex items-start justify-between mb-4">
                    <div className="flex flex-col flex-1 pr-2">
                        <span className="text-orange-500 font-extrabold text-[8px] uppercase tracking-[0.5em] mb-1 opacity-70">Rating Card</span>
                        <h2 className="text-white font-black text-2xl leading-[1.1] drop-shadow-2xl mb-1">
                            {movieTitle}
                        </h2>
                        <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{movieYear || '2024'}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <div className="bg-white/10 px-2 py-1.5 rounded-lg backdrop-blur-md border border-white/10">
                            <span className="text-orange-500 font-black text-xs tracking-tighter">TOS</span>
                        </div>
                    </div>
                </div>

                {/* Visual Content Area */}
                <div className="flex-1 w-full flex flex-col items-center justify-center gap-2">

                    {/* Poster - Centerpiece */}
                    <div className="relative mb-4">
                        {/* Dramatic Glow */}
                        <div
                            className="absolute -inset-6 rounded-3xl blur-[50px] opacity-30 z-0"
                            style={{ backgroundColor: scoreColor }}
                        />

                        <div className="w-40 h-[240px] bg-black/60 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 relative z-10 transition-transform hover:scale-105 duration-500">
                            {posterDisplay ? (
                                <img
                                    src={posterDisplay}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    crossOrigin="anonymous"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                    <span className="text-4xl text-white/20 font-black">?</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Score Highlight - Improved Spacing */}
                    <div className="flex flex-col items-center mb-4">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-6xl font-black tracking-tighter text-white" style={{
                                textShadow: `0 0 20px ${scoreColor}80`
                            }}>
                                {(overallScore || 0).toFixed(1)}
                            </span>
                            <span className="text-white/20 text-lg font-bold">/10</span>
                        </div>
                        {/* Better Underline */}
                        <div className="h-[2px] w-14 rounded-full mt-1.5" style={{ backgroundColor: scoreColor }} />
                    </div>

                    {/* Metrics Dashboard - More Compact Grid */}
                    <div className="w-full bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl">
                        <div className="grid grid-cols-4 gap-y-4">
                            {TOS_CATEGORIES.slice(0, 4).map((cat) => (
                                <MiniTOSCircle
                                    key={cat.key}
                                    value={ratings?.[cat.key]}
                                    label={cat.label}
                                    color={cat.color}
                                />
                            ))}
                        </div>
                        <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-white/5">
                            {TOS_CATEGORIES.slice(4).map((cat) => (
                                <MiniTOSCircle
                                    key={cat.key}
                                    value={ratings?.[cat.key]}
                                    label={cat.label}
                                    color={cat.color}
                                />
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer Branding */}
                <div className="w-full flex items-center justify-center pt-4">
                    <p className="text-white/10 text-[7px] font-bold tracking-[0.6em] uppercase">
                        theaterorstream.com
                    </p>
                </div>
            </div>
        </div>
    );
});


// Main Share Modal Component
const ShareMovieModal = ({ isOpen, onClose, movieTitle, movieYear, posterUrl, backdropUrl, ratings, imageURL, posterBase64: initialPosterBase64, backdropBase64: initialBackdropBase64 }) => {
    const cardRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [shareImage, setShareImage] = useState(null);
    const [copied, setCopied] = useState(false);
    const [backdropBase64, setBackdropBase64] = useState(initialBackdropBase64);
    const [posterBase64, setPosterBase64] = useState(initialPosterBase64);

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
            if (!url) return null;
            if (url.startsWith('data:')) return url;

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

        // If we don't have base64 yet, get it
        if (!backdropBase64 && fullBackdropUrl) {
            setGenerating(true);
            const b64 = await convertToBase64(fullBackdropUrl);
            if (b64) setBackdropBase64(b64);
        }
        if (!posterBase64 && fullPosterUrl) {
            setGenerating(true);
            const b64 = await convertToBase64(fullPosterUrl);
            if (b64) setPosterBase64(b64);
        }

        setGenerating(true);

        try {
            // Give extra time for images to settle in the DOM
            await new Promise(resolve => setTimeout(resolve, 1500));

            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#0a0a0a',
                scale: 3, // Even higher quality
                useCORS: true,
                allowTaint: true,
                logging: false,
                imageTimeout: 0,
            });

            const imageUrl = canvas.toDataURL('image/png', 1.0);
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
        const text = `🎬 ${movieTitle} - TOS Rating: ${overallScore.toFixed(1)}/10\n\n#TheaterOrStream #MovieReview`;
        const url = window.location.href;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    };

    // Share to Facebook
    const shareToFacebook = () => {
        const url = window.location.href;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    };

    // Share to Reddit
    const shareToReddit = () => {
        const title = `Review: ${movieTitle} - ${overallScore.toFixed(1)}/10`;
        const url = window.location.href;
        window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
    };

    // Native Share (Mobile)
    const handleNativeShare = async () => {
        if (navigator.share && shareImage) {
            try {
                const blob = await (await fetch(shareImage)).blob();
                const file = new File([blob], `${movieTitle}.png`, { type: 'image/png' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Review: ${movieTitle}`,
                        text: `Check out my rating for ${movieTitle}!`,
                        files: [file],
                        url: window.location.href
                    });
                } else {
                    await navigator.share({
                        title: `Review: ${movieTitle}`,
                        text: `Check out my rating for ${movieTitle}!`,
                        url: window.location.href
                    });
                }
            } catch (err) {
                console.error("Native share failed:", err);
            }
        }
    };

    // Initial effect to handle base64 update if they change
    React.useEffect(() => {
        if (isOpen) {
            if (initialBackdropBase64) setBackdropBase64(initialBackdropBase64);
            if (initialPosterBase64) setPosterBase64(initialPosterBase64);
            setShareImage(null);
            generateImage();
        }
    }, [isOpen, initialBackdropBase64, initialPosterBase64]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="bg-[#111111] rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden border border-white/10 shadow-2xl flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                            <FaShare className="text-green-500 text-sm" />
                        </div>
                        <h3 className="text-white font-bold tracking-tight">Generate Share Card</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* Content Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {/* Preview Card (hidden, used for generation) */}
                    <div className="absolute left-[-9999px]">
                        <ShareableCard
                            ref={cardRef}
                            movieTitle={movieTitle}
                            movieYear={movieYear}
                            posterUrl={fullPosterUrl}
                            backdropUrl={fullBackdropUrl}
                            backdropBase64={backdropBase64}
                            posterBase64={posterBase64}
                            ratings={ratings}
                            overallScore={overallScore}
                        />
                    </div>

                    {/* Image Preview Area */}
                    <div className="flex flex-col items-center">
                        <div className="w-full relative group">
                            {generating || !shareImage ? (
                                <div className="aspect-[9/16] w-full max-w-[280px] mx-auto bg-white/5 rounded-3xl flex flex-col items-center justify-center border border-dashed border-white/20">
                                    <div className="w-12 h-12 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin mb-4" />
                                    <p className="text-white/40 text-sm font-medium">Drafting your card...</p>
                                </div>
                            ) : (
                                <div className="flex justify-center animate-in fade-in zoom-in duration-500">
                                    <img
                                        src={shareImage}
                                        alt="Share preview"
                                        className="w-full max-w-[300px] rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-[#161616] border-t border-white/5">
                    {/* Primary Share Action */}
                    {navigator.share && (
                        <button
                            onClick={handleNativeShare}
                            disabled={!shareImage}
                            className="w-full py-4 mb-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                        >
                            <FaShare className="text-lg" /> Send to Instagram Stories, WhatsApp...
                        </button>
                    )}

                    <div className="grid grid-cols-4 gap-3 mb-5">
                        <button onClick={shareToTwitter} disabled={!shareImage} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-[#1DA1F2]/5 hover:bg-[#1DA1F2]/10 text-[#1DA1F2] transition-all border border-[#1DA1F2]/10 disabled:opacity-30">
                            <FaTwitter className="text-xl" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Twitter</span>
                        </button>

                        <button onClick={shareToFacebook} disabled={!shareImage} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-[#1877F2]/5 hover:bg-[#1877F2]/10 text-[#1877F2] transition-all border border-[#1877F2]/10 disabled:opacity-30">
                            <FaFacebook className="text-xl" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">FB</span>
                        </button>

                        <button onClick={shareToReddit} disabled={!shareImage} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-[#FF4500]/5 hover:bg-[#FF4500]/10 text-[#FF4500] transition-all border border-[#FF4500]/10 disabled:opacity-30">
                            <FaReddit className="text-xl" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Reddit</span>
                        </button>

                        <button onClick={copyLink} disabled={!shareImage} className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 transition-all border border-white/10 disabled:opacity-30">
                            <FaLink className="text-xl" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{copied ? 'Done!' : 'Link'}</span>
                        </button>
                    </div>

                    <button
                        onClick={downloadImage}
                        disabled={!shareImage}
                        className="w-full py-3.5 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-white/10"
                    >
                        <FaDownload className="text-white/60" /> Download for later
                    </button>
                </div>
            </div>
        </div>
    );
};

// Share Button Component (to use on Details page)
export const ShareButton = ({ movieTitle, movieYear, posterUrl, backdropUrl, ratings, imageURL, posterBase64, backdropBase64 }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/50 hover:bg-green-500/10 text-white font-bold transition-all group scale-100 hover:scale-[1.02] active:scale-[0.98]"
            >
                <FaShare className="text-green-500 group-hover:rotate-12 transition-transform" />
                <span className="text-sm">Share Review Card</span>
            </button>

            <ShareMovieModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                movieTitle={movieTitle}
                movieYear={movieYear}
                posterUrl={posterUrl}
                backdropUrl={backdropUrl}
                posterBase64={posterBase64}
                backdropBase64={backdropBase64}
                ratings={ratings}
                imageURL={imageURL}
            />
        </>
    );
};

export default ShareMovieModal;
