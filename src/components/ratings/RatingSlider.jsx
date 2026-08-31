/** TOS category slider (0–10, step 0.5). */
export default function RatingSlider({ label, value, onChange, color = '#22c55e', disabled = false }) {
    const getEmoji = (val) => {
        if (val >= 9) return '🤩';
        if (val >= 7) return '😊';
        if (val >= 5) return '😐';
        if (val >= 3) return '😕';
        return '😢';
    };

    return (
        <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2 gap-2">
                <span className="text-xs sm:text-sm font-medium text-white/80">{label}</span>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="text-base sm:text-lg">{getEmoji(value)}</span>
                    <span className="text-xs sm:text-sm font-bold tabular-nums" style={{ color }}>{value.toFixed(1)}</span>
                </div>
            </div>
            <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-3 sm:h-2 rounded-full appearance-none cursor-pointer touch-manipulation disabled:opacity-50"
                style={{
                    background: `linear-gradient(to right, ${color} 0%, ${color} ${value * 10}%, rgba(255,255,255,0.1) ${value * 10}%, rgba(255,255,255,0.1) 100%)`,
                }}
            />
        </div>
    );
}
