import React, { useState, useRef, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";
import {
    FaShare,
    FaTwitter,
    FaInstagram,
    FaFacebook,
    FaDownload,
    FaTimes,
    FaLink,
    FaReddit,
    FaWhatsapp,
    FaTelegramPlane,
} from "react-icons/fa";
import {
    TOS_SHARE_CATEGORIES,
    calculateShareOverallScore,
    copyImageToClipboard,
    dataUrlToBlob,
    downloadBlob,
    getScoreAccentColor,
    isMobileDevice,
    normalizeShareRatings,
    shareImageFile,
    shareToFacebook,
    shareToInstagramStories,
    shareToReddit,
    shareToTelegram,
    shareToTwitter,
    shareToWhatsApp,
} from "../lib/shareUtils";

const waitForImages = (container) => {
    const images = container ? Array.from(container.querySelectorAll("img")) : [];
    if (!images.length) return Promise.resolve();

    return Promise.all(
        images.map(
            (img) =>
                new Promise((resolve) => {
                    if (img.complete && img.naturalWidth > 0) {
                        resolve();
                        return;
                    }
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                    window.setTimeout(resolve, 2500);
                }),
        ),
    );
};

const ShareableCard = React.forwardRef(({
    movieTitle,
    movieYear,
    posterSrc,
    backdropSrc,
    ratings,
    overallScore,
}, ref) => {
    const accent = getScoreAccentColor(overallScore);
    const normalizedRatings = normalizeShareRatings(ratings);

    return (
        <div
            ref={ref}
            className="w-[360px] h-[640px] bg-[#0a0a0a] relative overflow-hidden"
            style={{ fontFamily: "Inter, Arial, sans-serif" }}
        >
            {backdropSrc && (
                <img
                    src={backdropSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-40 scale-110"
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black" />

            <div className="relative z-10 flex h-full flex-col px-5 py-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400">TheaterOrStream</p>
                        <p className="text-[10px] text-white/50 mt-1">My Rating Card</p>
                    </div>
                    <span className="rounded-lg bg-orange-500/20 px-2.5 py-1 text-xs font-bold text-orange-300">TOS</span>
                </div>

                <div className="flex flex-col items-center text-center">
                    <div className="h-[210px] w-[140px] overflow-hidden rounded-xl border border-white/20 bg-black/40 shadow-lg">
                        {posterSrc ? (
                            <img src={posterSrc} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-4xl text-white/20">🎬</div>
                        )}
                    </div>

                    <h2 className="mt-4 text-2xl font-bold leading-tight text-white px-2">{movieTitle}</h2>
                    <p className="mt-1 text-sm text-white/50">{movieYear || "2024"}</p>

                    <div className="mt-4 flex items-end justify-center gap-1">
                        <span className="text-5xl font-black leading-none" style={{ color: accent }}>
                            {overallScore.toFixed(1)}
                        </span>
                        <span className="pb-1 text-base text-white/30">/10</span>
                    </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/50 p-3">
                    <div className="grid grid-cols-4 gap-2">
                        {TOS_SHARE_CATEGORIES.map((cat) => (
                            <div key={cat.key} className="rounded-lg bg-white/5 px-1 py-2 text-center">
                                <p className="text-[8px] uppercase tracking-wide text-white/50">{cat.label}</p>
                                <p className="text-sm font-bold" style={{ color: cat.color }}>
                                    {normalizedRatings[cat.key]?.toFixed(1) || "—"}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="mt-auto pt-4 text-center text-[9px] uppercase tracking-[0.35em] text-white/25">
                    theaterorstream.com
                </p>
            </div>
        </div>
    );
});

ShareableCard.displayName = "ShareableCard";

const SharePlatformButton = ({ icon: Icon, label, sublabel, onClick, disabled, className }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 transition-all active:scale-[0.98] disabled:opacity-35 ${className}`}
    >
        <Icon className="text-2xl" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
        {sublabel && <span className="text-[9px] text-white/35">{sublabel}</span>}
    </button>
);

const ShareMovieModal = ({
    isOpen,
    onClose,
    movieTitle,
    movieYear,
    posterUrl,
    backdropUrl,
    ratings,
    imageURL,
    posterBase64: initialPosterBase64,
    backdropBase64: initialBackdropBase64,
}) => {
    const cardRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [shareImage, setShareImage] = useState(null);
    const [shareBlob, setShareBlob] = useState(null);
    const [copied, setCopied] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [cardImages, setCardImages] = useState(null);

    const overallScore = useMemo(() => calculateShareOverallScore(ratings), [ratings]);
    const shareUrl = window.location.href;
    const shareText = `🎬 ${movieTitle} — TOS Rating: ${overallScore.toFixed(1)}/10`;

    const fullBackdropUrl = backdropUrl
        ? (backdropUrl.startsWith("http") ? backdropUrl : `${imageURL}${backdropUrl}`)
        : null;
    const fullPosterUrl = posterUrl
        ? (posterUrl.startsWith("http") ? posterUrl : `${imageURL}${posterUrl}`)
        : null;

    const showStatus = (message) => {
        setStatusMessage(message);
        window.setTimeout(() => setStatusMessage(""), 4000);
    };

    const convertToBase64 = async (url) => {
        if (!url) return null;
        if (url.startsWith("data:")) return url;

        const blobToDataURL = (blob) =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

        try {
            const response = await fetch(url, { mode: "cors", credentials: "omit" });
            if (response.ok) {
                return await blobToDataURL(await response.blob());
            }
        } catch {
            // try proxy
        }

        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            return await blobToDataURL(await response.blob());
        } catch (error) {
            console.error("Error converting to base64:", error);
            return null;
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        const prepareImages = async () => {
            setGenerating(true);
            setShareImage(null);
            setShareBlob(null);
            setStatusMessage("");
            setCardImages(null);

            let poster = initialPosterBase64 || null;
            let backdrop = initialBackdropBase64 || null;

            if (!poster && fullPosterUrl) poster = await convertToBase64(fullPosterUrl);
            if (!backdrop && fullBackdropUrl) backdrop = await convertToBase64(fullBackdropUrl);

            if (!poster) poster = backdrop;
            if (!backdrop) backdrop = poster;

            if (!cancelled) {
                setCardImages({ poster, backdrop });
            }
        };

        prepareImages();
        return () => {
            cancelled = true;
        };
    }, [isOpen, initialPosterBase64, initialBackdropBase64, fullPosterUrl, fullBackdropUrl]);

    useEffect(() => {
        if (!isOpen || !cardImages || !cardRef.current) return;

        let cancelled = false;

        const captureCard = async () => {
            setGenerating(true);
            await waitForImages(cardRef.current);
            await new Promise((resolve) => window.setTimeout(resolve, 200));

            if (cancelled || !cardRef.current) return;

            try {
                const canvas = await html2canvas(cardRef.current, {
                    backgroundColor: "#0a0a0a",
                    scale: 3,
                    useCORS: true,
                    allowTaint: false,
                    logging: false,
                    imageTimeout: 0,
                });

                const imageUrl = canvas.toDataURL("image/png", 1.0);
                const blob = await dataUrlToBlob(imageUrl);
                if (!cancelled) {
                    setShareImage(imageUrl);
                    setShareBlob(blob);
                }
            } catch (error) {
                console.error("Error generating image:", error);
                if (!cancelled) showStatus("Could not generate the share card. Please try again.");
            } finally {
                if (!cancelled) setGenerating(false);
            }
        };

        captureCard();
        return () => {
            cancelled = true;
        };
    }, [isOpen, cardImages]);

    const ensureBlob = async () => {
        if (shareBlob) return shareBlob;
        if (!shareImage) return null;
        return dataUrlToBlob(shareImage);
    };

    const handleNativeShare = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        const result = await shareImageFile(blob, { title: `Review: ${movieTitle}`, text: shareText, url: shareUrl });
        if (result.ok) showStatus("Choose Instagram Stories, WhatsApp, Messages, or another app.");
    };

    const handleInstagramShare = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        const result = await shareToInstagramStories(blob);
        showStatus(result.message);
    };

    const handleWhatsAppShare = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        const result = await shareToWhatsApp({ text: shareText, url: shareUrl, blob });
        showStatus(result.message);
    };

    const handleTwitterShare = async () => {
        const blob = await ensureBlob();
        if (blob && isMobileDevice()) {
            const result = await shareImageFile(blob, { title: movieTitle, text: shareText, url: shareUrl });
            if (result.ok) {
                showStatus("Choose X/Twitter in the share menu.");
                return;
            }
        }
        shareToTwitter({ text: shareText, url: shareUrl });
    };

    const handleFacebookShare = () => shareToFacebook({ url: shareUrl });
    const handleTelegramShare = async () => {
        const blob = await ensureBlob();
        if (blob && isMobileDevice()) {
            const result = await shareImageFile(blob, { title: movieTitle, text: shareText, url: shareUrl });
            if (result.ok) return;
        }
        shareToTelegram({ text: shareText, url: shareUrl });
    };
    const handleRedditShare = () => shareToReddit({ title: `Review: ${movieTitle} — ${overallScore.toFixed(1)}/10`, url: shareUrl });

    const copyLink = async () => {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        showStatus("Movie link copied.");
        window.setTimeout(() => setCopied(false), 2000);
    };

    const copyImage = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        const ok = await copyImageToClipboard(blob);
        showStatus(ok ? "Share card copied!" : "Copy not supported — use Download.");
    };

    const downloadImage = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        downloadBlob(blob, `${movieTitle?.replace(/[^a-zA-Z0-9]/g, "_") || "movie"}_TOS_Rating.png`);
    };

    if (!isOpen) return null;

    const shareDisabled = generating || !shareImage;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-0 sm:p-4">
            <div className="flex h-[100dvh] sm:h-auto sm:max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-3xl border border-white/10 bg-[#101010] shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/15">
                            <FaShare className="text-green-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold">Share Your Rating</h3>
                            <p className="text-xs text-white/40">Stories, WhatsApp, and social posts</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-white/40 hover:bg-white/5 hover:text-white">
                        <FaTimes />
                    </button>
                </div>

                <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
                    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-[#0a0a0a] px-5 py-6">
                        <div className="absolute left-[-9999px] top-0">
                            {cardImages && (
                                <ShareableCard
                                    ref={cardRef}
                                    movieTitle={movieTitle}
                                    movieYear={movieYear}
                                    posterSrc={cardImages.poster}
                                    backdropSrc={cardImages.backdrop}
                                    ratings={ratings}
                                    overallScore={overallScore}
                                />
                            )}
                        </div>

                        {generating || !shareImage ? (
                            <div className="flex aspect-[9/16] w-full max-w-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03]">
                                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-green-500/20 border-t-green-500" />
                                <p className="text-sm text-white/45">Building share card...</p>
                            </div>
                        ) : (
                            <img src={shareImage} alt="Share preview" className="w-full max-w-[260px] rounded-2xl border border-white/10 shadow-2xl" />
                        )}
                    </div>

                    <div className="flex w-full flex-col border-t border-white/5 bg-[#141414] lg:w-[340px] lg:border-t-0 lg:border-l">
                        <div className="flex-1 overflow-y-auto px-5 py-5">
                            {navigator.share && (
                                <button type="button" onClick={handleNativeShare} disabled={shareDisabled} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 py-3.5 text-sm font-bold text-white disabled:opacity-45">
                                    <FaShare /> Quick Share
                                </button>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <SharePlatformButton icon={FaInstagram} label="Instagram" sublabel="Stories" onClick={handleInstagramShare} disabled={shareDisabled} className="border-[#E1306C]/20 bg-[#E1306C]/10 text-[#ff6cab]" />
                                <SharePlatformButton icon={FaWhatsapp} label="WhatsApp" sublabel="Chat" onClick={handleWhatsAppShare} disabled={shareDisabled} className="border-[#25D366]/20 bg-[#25D366]/10 text-[#6dffb0]" />
                                <SharePlatformButton icon={FaTwitter} label="X" sublabel="Post" onClick={handleTwitterShare} disabled={shareDisabled} className="border-[#1DA1F2]/20 bg-[#1DA1F2]/10 text-[#7cc9ff]" />
                                <SharePlatformButton icon={FaFacebook} label="Facebook" sublabel="Feed" onClick={handleFacebookShare} disabled={shareDisabled} className="border-[#1877F2]/20 bg-[#1877F2]/10 text-[#8cb6ff]" />
                                <SharePlatformButton icon={FaTelegramPlane} label="Telegram" sublabel="Send" onClick={handleTelegramShare} disabled={shareDisabled} className="border-[#229ED9]/20 bg-[#229ED9]/10 text-[#7fd3ff]" />
                                <SharePlatformButton icon={FaReddit} label="Reddit" sublabel="Post" onClick={handleRedditShare} disabled={shareDisabled} className="border-[#FF4500]/20 bg-[#FF4500]/10 text-[#ff9b72]" />
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <button type="button" onClick={copyImage} disabled={shareDisabled} className="rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/75 disabled:opacity-45">Copy Image</button>
                                <button type="button" onClick={copyLink} disabled={shareDisabled} className="rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/75 disabled:opacity-45">{copied ? "Copied" : "Copy Link"}</button>
                            </div>
                        </div>

                        <div className="border-t border-white/5 px-5 py-4">
                            {statusMessage && <p className="mb-3 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">{statusMessage}</p>}
                            <button type="button" onClick={downloadImage} disabled={shareDisabled} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-white disabled:opacity-45">
                                <FaDownload /> Download Card
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ShareButton = ({ movieTitle, movieYear, posterUrl, backdropUrl, ratings, imageURL, posterBase64, backdropBase64 }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setIsModalOpen(true)} className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 font-bold text-white transition hover:border-green-500/50 hover:bg-green-500/10">
                <FaShare className="text-green-500" />
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
