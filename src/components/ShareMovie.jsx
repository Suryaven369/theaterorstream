import React, { useState, useRef, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";
import {
    FaShare,
    FaTwitter,
    FaInstagram,
    FaFacebook,
    FaDownload,
    FaTimes,
    FaReddit,
    FaWhatsapp,
    FaTelegramPlane,
} from "react-icons/fa";
import {
    calculateShareOverallScore,
    copyImageToClipboard,
    dataUrlToBlob,
    downloadBlob,
    isMobileDevice,
    shareImageFile,
    shareToFacebook,
    shareToInstagramStories,
    shareToReddit,
    shareToTelegram,
    shareToTwitter,
    shareToWhatsApp,
} from "../lib/shareUtils";

import {
    CARD_W,
    CARD_H,
    CARD_EXPORT_SCALE,
    CARD_FONT,
} from "./share/CinematicShareCardLayers";
import LuxuryShareCard from "./share/LuxuryShareCard";

const TOS_LOGO_URL =
    "https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg";

const toW500PosterUrl = (posterUrl, imageURL) => {
    if (!posterUrl) return null;
    if (posterUrl.startsWith("data:")) return posterUrl;
    if (posterUrl.startsWith("http")) {
        return posterUrl
            .replace("/original/", "/w500/")
            .replace("/w780/", "/w500/");
    }
    return `https://image.tmdb.org/t/p/w500${posterUrl.startsWith("/") ? posterUrl : `/${posterUrl}`}`;
};

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
                    window.setTimeout(resolve, 2000);
                }),
        ),
    );
};

const SharePlatformButton = ({ icon: Icon, label, onClick, disabled, className }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-35 ${className}`}
    >
        <Icon className="text-base" />
        <span>{label}</span>
    </button>
);

const ShareMovieModal = ({
    isOpen,
    onClose,
    movieTitle,
    movieYear,
    posterUrl,
    ratings,
    imageURL,
    posterBase64: initialPosterBase64,
    genres,
    mediaType,
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

    const fullPosterUrl = toW500PosterUrl(posterUrl, imageURL);

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

            const [poster, logo] = await Promise.all([
                initialPosterBase64 || (fullPosterUrl ? convertToBase64(fullPosterUrl) : null),
                convertToBase64(TOS_LOGO_URL),
            ]);

            if (!cancelled) {
                setCardImages({ poster, logo });
            }
        };

        prepareImages();
        return () => {
            cancelled = true;
        };
    }, [isOpen, initialPosterBase64, fullPosterUrl]);

    useEffect(() => {
        if (!isOpen || !cardImages || !cardRef.current) return;

        let cancelled = false;

        const captureCard = async () => {
            setGenerating(true);
            await waitForImages(cardRef.current);

            if (cancelled || !cardRef.current) return;

            try {
                const canvas = await html2canvas(cardRef.current, {
                    backgroundColor: null,
                    scale: CARD_EXPORT_SCALE,
                    width: CARD_W,
                    height: CARD_H,
                    useCORS: true,
                    allowTaint: false,
                    logging: false,
                    imageTimeout: 0,
                    onclone: (clonedDoc) => {
                        const card = clonedDoc.querySelector("[data-share-card]");
                        if (!card) return;
                        card.style.overflow = "hidden";
                        card.style.fontFamily = CARD_FONT;
                        card.style.width = `${CARD_W}px`;
                        card.style.height = `${CARD_H}px`;
                    },
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
        if (result.ok) showStatus("Choose Instagram Stories, WhatsApp, or Messages.");
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
            if (result.ok) return;
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
        showStatus("Link copied.");
        window.setTimeout(() => setCopied(false), 2000);
    };

    const copyImage = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        const ok = await copyImageToClipboard(blob);
        showStatus(ok ? "Image copied!" : "Use Download instead.");
    };

    const downloadImage = async () => {
        const blob = await ensureBlob();
        if (!blob) return;
        downloadBlob(blob, `${movieTitle?.replace(/[^a-zA-Z0-9]/g, "_") || "movie"}_TOS_Rating.png`);
    };

    if (!isOpen) return null;

    const shareDisabled = generating || !shareImage;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-4">
            <div className="flex h-auto max-h-[min(620px,94dvh)] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101010] shadow-2xl sm:max-h-[620px]">
                <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
                            <FaShare className="text-sm text-amber-400/90" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Share Your Rating</h3>
                            <p className="text-[11px] text-white/40">Premium story card · 1080×1920</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-white/5 hover:text-white">
                        <FaTimes className="text-sm" />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
                    <div className="flex shrink-0 items-center justify-center bg-[#030303] px-5 py-4 sm:w-[260px] sm:border-r sm:border-white/5">
                        <div className="absolute left-0 top-0 -z-10 opacity-0 pointer-events-none" aria-hidden="true">
                            {cardImages && (
                                <LuxuryShareCard
                                    ref={cardRef}
                                    movieTitle={movieTitle}
                                    movieYear={movieYear}
                                    posterSrc={cardImages.poster}
                                    logoSrc={cardImages.logo}
                                    ratings={ratings}
                                    overallScore={overallScore}
                                    genres={genres}
                                    mediaType={mediaType}
                                />
                            )}
                        </div>

                        {generating || !shareImage ? (
                            <div
                                className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02]"
                                style={{ width: 214, height: 380 }}
                            >
                                <div className="mb-3 h-9 w-9 animate-spin rounded-full border-[3px] border-amber-500/15 border-t-amber-500/70" />
                                <p className="text-xs text-white/40">Rendering collectible…</p>
                            </div>
                        ) : (
                            <img
                                src={shareImage}
                                alt="Share preview"
                                className="rounded-lg border border-white/10 object-cover shadow-2xl shadow-black/70"
                                style={{ width: 214, height: 380 }}
                            />
                        )}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:overflow-hidden sm:py-3">
                            {navigator.share && (
                                <button
                                    type="button"
                                    onClick={handleNativeShare}
                                    disabled={shareDisabled}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600/90 to-orange-700/90 py-2.5 text-sm font-bold text-white disabled:opacity-45"
                                >
                                    <FaShare /> Quick Share
                                </button>
                            )}

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <SharePlatformButton icon={FaInstagram} label="Instagram" onClick={handleInstagramShare} disabled={shareDisabled} className="border-[#E1306C]/20 bg-[#E1306C]/10 text-[#ff6cab]" />
                                <SharePlatformButton icon={FaWhatsapp} label="WhatsApp" onClick={handleWhatsAppShare} disabled={shareDisabled} className="border-[#25D366]/20 bg-[#25D366]/10 text-[#6dffb0]" />
                                <SharePlatformButton icon={FaTwitter} label="X" onClick={handleTwitterShare} disabled={shareDisabled} className="border-[#1DA1F2]/20 bg-[#1DA1F2]/10 text-[#7cc9ff]" />
                                <SharePlatformButton icon={FaFacebook} label="Facebook" onClick={handleFacebookShare} disabled={shareDisabled} className="border-[#1877F2]/20 bg-[#1877F2]/10 text-[#8cb6ff]" />
                                <SharePlatformButton icon={FaTelegramPlane} label="Telegram" onClick={handleTelegramShare} disabled={shareDisabled} className="border-[#229ED9]/20 bg-[#229ED9]/10 text-[#7fd3ff]" />
                                <SharePlatformButton icon={FaReddit} label="Reddit" onClick={handleRedditShare} disabled={shareDisabled} className="border-[#FF4500]/20 bg-[#FF4500]/10 text-[#ff9b72]" />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={copyImage} disabled={shareDisabled} className="rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/75 disabled:opacity-45">Copy Image</button>
                                <button type="button" onClick={copyLink} disabled={shareDisabled} className="rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/75 disabled:opacity-45">{copied ? "Copied" : "Copy Link"}</button>
                            </div>
                        </div>

                        <div className="shrink-0 border-t border-white/5 px-4 py-3">
                            {statusMessage && (
                                <p className="mb-2 rounded-lg border border-green-500/20 bg-green-500/10 px-2.5 py-1.5 text-[11px] text-green-300">
                                    {statusMessage}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={downloadImage}
                                disabled={shareDisabled}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white disabled:opacity-45"
                            >
                                <FaDownload className="text-sm text-white/55" /> Download
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ShareButton = ({ movieTitle, movieYear, posterUrl, backdropUrl, ratings, imageURL, posterBase64, backdropBase64, genres, mediaType }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 font-bold text-white transition hover:border-amber-500/40 hover:bg-amber-500/10"
            >
                <FaShare className="text-amber-500/90" />
                <span className="text-sm">Share Review Card</span>
            </button>

            <ShareMovieModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                movieTitle={movieTitle}
                movieYear={movieYear}
                posterUrl={posterUrl}
                ratings={ratings}
                imageURL={imageURL}
                posterBase64={posterBase64}
                genres={genres}
                mediaType={mediaType}
            />
        </>
    );
};

export default ShareMovieModal;
