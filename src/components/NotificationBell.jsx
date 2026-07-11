import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { IoNotificationsOutline } from "react-icons/io5";
import { FaHeart, FaComment, FaUserPlus, FaAt } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import {
    getNotifications,
    getUnreadNotificationCount,
    markNotificationsRead,
    markAllNotificationsRead,
} from "../lib/notificationsApi";
import { stripMentionsToPlainText } from "../lib/movieMentions";

const POLL_INTERVAL_MS = 30000;

function timeAgo(dateString) {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const ActorAvatar = ({ actor }) => {
    const initial = (actor?.display_name || actor?.username || "?").charAt(0).toUpperCase();
    return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white shrink-0">
            {initial}
        </div>
    );
};

const NotificationItem = ({ notification, onClick }) => {
    const actorName = notification.actor?.display_name || notification.actor?.username || "Someone";
    const { type } = notification;
    const isLike = type === "like";
    const isFollow = type === "follow";
    const isMention = type === "mention";
    const verb = isFollow ? "started following you"
        : isMention ? "mentioned you in a post"
        : isLike ? "liked your post"
        : "commented on your post";
    const postPreview = !isFollow && notification.post ? stripMentionsToPlainText(notification.post.content).slice(0, 60) : "";

    return (
        <button
            type="button"
            onClick={() => onClick(notification)}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${
                notification.isRead ? "" : "bg-orange-500/[0.06]"
            }`}
        >
            <ActorAvatar actor={notification.actor} />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                    <span className="font-medium">{actorName}</span>{" "}
                    {verb}
                    {type === "comment" && notification.comment?.content && (
                        <span className="text-white/50"> &middot; "{notification.comment.content.slice(0, 60)}"</span>
                    )}
                </p>
                {postPreview && <p className="text-xs text-white/40 truncate mt-0.5">{postPreview}</p>}
                <p className="text-[11px] text-white/30 mt-1">{timeAgo(notification.createdAt)}</p>
            </div>
            <div className={`mt-1 shrink-0 ${isFollow ? "text-[var(--accent-green)]" : isMention ? "text-violet-400" : isLike ? "text-rose-400" : "text-blue-400"}`}>
                {isFollow ? <FaUserPlus className="text-xs" /> : isMention ? <FaAt className="text-xs" /> : isLike ? <FaHeart className="text-xs" /> : <FaComment className="text-xs" />}
            </div>
            {!notification.isRead && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0 mt-1.5" />}
        </button>
    );
};

const NotificationBell = () => {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef(null);

    const refreshCount = useCallback(async () => {
        if (!user?.id) return;
        setUnreadCount(await getUnreadNotificationCount(user.id));
    }, [user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;
        refreshCount();
        const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isAuthenticated, user?.id, refreshCount]);

    useEffect(() => {
        if (!open || !user?.id) return;
        setLoading(true);
        getNotifications(user.id, { limit: 20 }).then((rows) => {
            setNotifications(rows);
            setLoading(false);
        });
    }, [open, user?.id]);

    useEffect(() => {
        if (!open) return;
        const handleOutsideClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [open]);

    const handleToggle = () => setOpen((v) => !v);

    const handleMarkAllRead = async () => {
        await markAllNotificationsRead(user.id);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.isRead) {
            await markNotificationsRead(user.id, [notification.id]);
            setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        setOpen(false);
        if (notification.type === "follow" && notification.actor?.username) {
            navigate(`/${notification.actor.username}/profile`);
        } else if (notification.postId) {
            navigate("/");
        }
    };

    if (!isAuthenticated) return null;

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={handleToggle}
                aria-label="Notifications"
                className="relative w-10 h-10 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/[0.07] flex items-center justify-center transition-colors"
            >
                <IoNotificationsOutline className="text-xl" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                // Anchored to the viewport, not the bell's own position — the bell sits
                // left of the profile avatar (not flush against the screen edge), so an
                // absolute right-0 dropdown sized for the bell would overflow off the
                // left side of the screen on narrow phones. `fixed` + explicit left/right
                // insets sidesteps that entirely: full-width sheet on mobile, a fixed
                // 320px panel pinned to the right on larger screens.
                <div className="fixed left-4 right-4 top-20 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-h-[28rem] overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[#1a1a1a]">
                        <h3 className="text-sm font-semibold text-white">Notifications</h3>
                        {unreadCount > 0 && (
                            <button type="button" onClick={handleMarkAllRead} className="text-xs text-orange-400 hover:text-orange-300">
                                Mark all read
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="p-4 space-y-3">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />)}
                        </div>
                    ) : notifications.length === 0 ? (
                        <p className="text-sm text-white/40 py-10 text-center">No notifications yet.</p>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {notifications.map((n) => (
                                <NotificationItem key={n.id} notification={n} onClick={handleNotificationClick} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
