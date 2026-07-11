import React from "react";

const SIZE_CLASSES = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-[3px]",
};

/**
 * Reusable loading spinner. Use `fullScreen` for a page-level loading state,
 * or drop it inline (optionally with a `label`) anywhere content is being fetched.
 */
const Loader = ({ size = "md", label, fullScreen = false, className = "", colorClass = "border-orange-500" }) => {
    const spinner = (
        <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
            <div
                className={`${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${colorClass} border-t-transparent rounded-full animate-spin`}
            />
            {label && <p className="text-sm text-white/50">{label}</p>}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                {spinner}
            </div>
        );
    }

    return spinner;
};

export default Loader;
