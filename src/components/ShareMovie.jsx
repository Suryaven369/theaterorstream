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

// Mini TOS Rating Circle for share card
const MiniTOSCircle = ({ value, label, color }) => (
    <div className="flex flex-col items-center">
        <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold border-2 bg-black/50 backdrop-blur-md"
            style={{
                borderColor: color,
                color: color
            }}
        >
            {value?.toFixed(1) || '-'}
        </div>
        <span className="text-[8px] text-white/90 mt-1 text-center leading-tight font-medium shadow-black drop-shadow-md">{label}</span>
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
    // Prefer backdrop for BG
    let bgImage = backdropBase64 || backdropUrl || posterBase64 || posterUrl;
    // Prefer poster for FG
    let posterImage = posterBase64 || posterUrl || backdropBase64 || backdropUrl;

    // Cache-bust URLs if they are not base64 to ensure fresh CORS headers for html2canvas
    // This fixes the "missing image" issue if browser cached the image previously without CORS
    const cacheBuster = `?t=${Date.now()}`;

    if (bgImage && !bgImage.startsWith('data:')) {
        bgImage = bgImage.includes('?') ? `${bgImage}&t=${Date.now()}` : `${bgImage}${cacheBuster}`;
    }

    if (posterImage && !posterImage.startsWith('data:')) {
        posterImage = posterImage.includes('?') ? `${posterImage}&t=${Date.now()}` : `${posterImage}${cacheBuster}`;
    }

    // Get verdict text
    const getVerdict = () => {
        if (percentage >= 70) return "🎬 Theater";
        if (percentage >= 50) return "📺 Stream";
        return "⏭️ Skip";
    };

    return (
        <div
            ref={ref}
            className="w-[360px] h-[640px] bg-black relative overflow-hidden flex flex-col"
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            {/* Background - Blurred */}
            <div className="absolute inset-0 z-0">
                {bgImage ? (
                    <img
                        src={bgImage}
                        alt="Background"
                        className="w-full h-full object-cover opacity-60 blur-xl scale-110"
                        crossOrigin="anonymous"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-900 via-purple-900 to-black" />
                )}
                {/* Dark overlay for readability */}
                <div className="absolute inset-0 bg-black/40" />
            </div>

            {/* Content Container */}
            <div className="relative z-10 h-full flex flex-col p-6 items-center justify-between">

                {/* Header */}
                <div className="w-full flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                        <span className="text-white/60 text-[10px] uppercase tracking-widest">Review</span>
                        <span className="text-white font-bold text-lg leading-tight drop-shadow-lg">{movieTitle}</span>
                        <span className="text-white/50 text-xs">{movieYear || '2024'}</span>
                    </div>
                    <div className="bg-white/10 p-1 rounded-lg backdrop-blur-sm">
                        <span className="text-orange-500 font-extrabold text-sm tracking-tighter">TOS</span>
                    </div>
                </div>

                {/* Main Card Content */}
                <div className="flex-1 flex flex-col items-center justify-center w-full gap-6">

                    {/* Poster Image - Shadowed and Clean */}
                    <div className="relative group perspective">
                        <div className="w-48 min-h-[280px] bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-white/10 relative z-10 transform transition-transform">
                            {posterImage ? (
                                <img
                                    src={posterImage}
                                    alt={movieTitle}
                                    className="w-full h-full object-cover"
                                    crossOrigin="anonymous"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-4xl">🎬</span>
                                </div>
                            )}
                        </div>
                        {/* Glow effect behind poster */}
                        <div
                            className="absolute inset-0 rounded-xl blur-2xl opacity-50 z-0 scale-95 translate-y-4"
                            style={{ backgroundColor: scoreColor }}
                        />
                    </div>

                    {/* Main Score & Verdict */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 shadow-xl">
                            <span className="text-3xl font-black" style={{ color: scoreColor }}>
                                {(overallScore || 0).toFixed(1)}
                            </span>
                            <div className="h-8 w-[1px] bg-white/20"></div>
                            <span className="text-white font-bold text-lg tracking-wide uppercase">
                                {getVerdict()}
                            </span>
                        </div>
                    </div>

                    {/* TOS Rating Grid */}
                    <div className="w-full bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/5 shadow-lg">
                        <div className="flex justify-between items-end">
                            {TOS_CATEGORIES.slice(0, 4).map((cat) => (
                                <MiniTOSCircle
                                    key={cat.key}
                                    value={ratings?.[cat.key]}
                                    label={cat.label}
                                    color={cat.color}
                                />
                            ))}
                        </div>
                        <div className="flex justify-around items-end mt-3 px-4">
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

                {/* Footer */}
                <div className="w-full text-center mt-4 pt-4 border-t border-white/10">
                    <p className="text-white/40 text-[10px] tracking-widest uppercase">
                        Read full review at <span className="text-orange-400 font-bold">theaterorstream.com</span>
                    </p>
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
    const [posterBase64, setPosterBase64] = useState(null);

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
            // Convert images first
            if (!backdropBase64 && fullBackdropUrl) {
                const b64 = await convertToBase64(fullBackdropUrl);
                if (b64) setBackdropBase64(b64);
            }
            if (!posterBase64 && fullPosterUrl) {
                const b64 = await convertToBase64(fullPosterUrl);
                if (b64) setPosterBase64(b64);
            }

            // Waiting longer for image rendering
            await new Promise(resolve => setTimeout(resolve, 800));

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
                // Determine if we can share the file directly
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
                    // Fallback to text share
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

    // Generate image when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setBackdropBase64(null);
            setPosterBase64(null);
            setShareImage(null);
            // Start generation immediately
            setTimeout(generateImage, 100);
        }
    }, [isOpen]);

    // Re-generate if base64s update
    React.useEffect(() => {
        if (isOpen && (backdropBase64 || posterBase64) && !generating) {
            // Only regenerate if we don't have a share image yet or we just got new quality bits
            // But to avoid loops, let generateImage logic handle distinct calls?
            // Actually, simplest is to just call generate again if we got new data
            // But debounce it
            const timer = setTimeout(() => {
                if (!cardRef.current) return;
                generateImage();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [backdropBase64, posterBase64]);

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
                        posterBase64={posterBase64}
                        ratings={ratings}
                        overallScore={overallScore}
                    />
                </div>

                {/* Generated Image Preview */}
                <div className="p-4">
                    {generating && !shareImage ? (
                        <div className="aspect-[9/16] max-h-[400px] mx-auto bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                            <div className="text-center">
                                <div className="animate-spin text-2xl mb-2">⏳</div>
                                <p className="text-white/40 text-sm">Designing Card...</p>
                            </div>
                        </div>
                    ) : shareImage ? (
                        <div className="flex justify-center">
                            <img
                                src={shareImage}
                                alt="Share preview"
                                className="max-h-[450px] rounded-xl shadow-2xl border border-white/10"
                            />
                        </div>
                    ) : (
                        <div className="aspect-[9/16] max-h-[400px] mx-auto bg-white/5 rounded-xl flex items-center justify-center">
                            <p className="text-white/40 text-sm">Preparing...</p>
                        </div>
                    )}
                </div>

                {/* Share Buttons */}
                <div className="p-4 border-t border-white/10">

                    {/* Native Share Button (Mobile/Supported) */}
                    {navigator.share && (
                        <button
                            onClick={handleNativeShare}
                            disabled={!shareImage}
                            className="w-full py-3 mb-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            <FaShare /> Share via... (Apps, Stories)
                        </button>
                    )}

                    <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Or share directly</p>

                    <div className="grid grid-cols-4 gap-2 mb-4">
                        {/* Twitter */}
                        <button onClick={shareToTwitter} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] transition-all">
                            <FaTwitter className="text-lg" />
                            <span className="text-[10px]">Twitter</span>
                        </button>

                        {/* Facebook */}
                        <button onClick={shareToFacebook} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] transition-all">
                            <FaFacebook className="text-lg" />
                            <span className="text-[10px]">Facebook</span>
                        </button>

                        {/* Reddit */}
                        <button onClick={shareToReddit} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-[#FF4500]/10 hover:bg-[#FF4500]/20 text-[#FF4500] transition-all">
                            <FaReddit className="text-lg" />
                            <span className="text-[10px]">Reddit</span>
                        </button>

                        {/* Copy Link */}
                        <button onClick={copyLink} className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 transition-all">
                            <FaLink className="text-lg" />
                            <span className="text-[10px]">{copied ? 'Copied!' : 'Link'}</span>
                        </button>
                    </div>

                    {/* Download Button */}
                    <button
                        onClick={downloadImage}
                        disabled={!shareImage}
                        className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-white/5"
                    >
                        <FaDownload /> Download Image
                    </button>
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
