import React from 'react';

/**
 * Two-option poll display + voting for feed posts.
 */
export default function FeedPoll({
  pollData,
  userVote = null,
  onVote,
  voting = false,
  disabled = false,
}) {
  const options = pollData?.options || [];
  if (options.length < 2) return null;

  const totalVotes = options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const hasVoted = userVote !== null && userVote !== undefined;

  return (
    <div className="px-3 pb-3 space-y-2" data-no-thread>
      {options.map((opt, i) => {
        const votes = opt.votes || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isSelected = userVote === i;
        const showResults = hasVoted || disabled;

        return (
          <button
            key={i}
            type="button"
            disabled={disabled || voting || hasVoted}
            onClick={(e) => {
              e.stopPropagation();
              if (!hasVoted && !disabled) onVote?.(i);
            }}
            className={`relative w-full text-left rounded-xl border overflow-hidden transition-colors ${
              isSelected
                ? 'border-[var(--color-theater)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
            } ${hasVoted || disabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {showResults && (
              <span
                className="absolute inset-y-0 left-0 bg-[var(--color-theater)]/15 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative z-[1] flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] text-[var(--color-text)]">
              <span>{opt.text}</span>
              {showResults && (
                <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">
                  {pct}% · {votes}
                </span>
              )}
            </span>
          </button>
        );
      })}
      <p className="text-[11px] text-[var(--color-text-muted)]">
        {totalVotes} vote{totalVotes === 1 ? '' : 's'}
      </p>
    </div>
  );
}
