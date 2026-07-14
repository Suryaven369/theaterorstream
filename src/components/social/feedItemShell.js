/** Flat feed row styling (X / Reddit dividers — no card highlight). */
export function feedArticleClass(isThread, extra = '') {
  if (isThread) {
    return `bg-transparent rounded-none border-0 overflow-hidden ${extra}`.trim();
  }
  return `bg-transparent border-0 overflow-hidden hover:bg-[var(--color-surface)]/20 transition-colors ${extra}`.trim();
}
