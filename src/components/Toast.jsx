import { useState, useEffect, createContext, useContext, useCallback } from 'react';

// Toast Context
const ToastContext = createContext(null);

// Toast types with their styles
const TOAST_TYPES = {
    success: {
        icon: '✅',
        bg: 'bg-gradient-to-r from-green-500/90 to-emerald-600/90',
        border: 'border-green-400/30',
        progress: 'bg-green-300'
    },
    error: {
        icon: '❌',
        bg: 'bg-gradient-to-r from-red-500/90 to-rose-600/90',
        border: 'border-red-400/30',
        progress: 'bg-red-300'
    },
    warning: {
        icon: '⚠️',
        bg: 'bg-gradient-to-r from-yellow-500/90 to-orange-500/90',
        border: 'border-yellow-400/30',
        progress: 'bg-yellow-300'
    },
    info: {
        icon: 'ℹ️',
        bg: 'bg-gradient-to-r from-blue-500/90 to-indigo-600/90',
        border: 'border-blue-400/30',
        progress: 'bg-blue-300'
    }
};

// Individual Toast Component
const Toast = ({ id, message, type = 'success', duration = 4000, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);
    const styles = TOAST_TYPES[type] || TOAST_TYPES.success;

    useEffect(() => {
        // Progress bar animation
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev <= 0) return 0;
                return prev - (100 / (duration / 50));
            });
        }, 50);

        // Auto close timer
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onClose(id), 300);
        }, duration);

        return () => {
            clearInterval(interval);
            clearTimeout(timer);
        };
    }, [id, duration, onClose]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => onClose(id), 300);
    };

    return (
        <div
            className={`relative overflow-hidden rounded-xl ${styles.bg} backdrop-blur-md border ${styles.border} shadow-2xl shadow-black/20 min-w-[300px] max-w-[400px] transform transition-all duration-300 ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
                }`}
        >
            <div className="flex items-start gap-3 p-4">
                <span className="text-xl flex-shrink-0">{styles.icon}</span>
                <p className="text-white text-sm font-medium flex-1 pt-0.5">{message}</p>
                <button
                    onClick={handleClose}
                    className="text-white/60 hover:text-white transition-colors text-lg leading-none"
                >
                    ×
                </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-black/20">
                <div
                    className={`h-full ${styles.progress} transition-all duration-50 ease-linear`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
};

// Toast Container Component
export const ToastContainer = ({ toasts, removeToast }) => {
    return (
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3">
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    id={toast.id}
                    message={toast.message}
                    type={toast.type}
                    duration={toast.duration}
                    onClose={removeToast}
                />
            ))}
        </div>
    );
};

// Toast Provider Component
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'success', duration = 4000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type, duration }]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const toast = {
        success: (message, duration) => addToast(message, 'success', duration),
        error: (message, duration) => addToast(message, 'error', duration),
        warning: (message, duration) => addToast(message, 'warning', duration),
        info: (message, duration) => addToast(message, 'info', duration),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};

// Hook to use toast
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export default Toast;
