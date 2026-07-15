/** Parent-guide category keys and display metadata. */

export const PARENT_GUIDE_LEVELS = ['none', 'mild', 'moderate', 'severe'];

export const PARENT_GUIDE_CATEGORIES = {
  violence: {
    key: 'violence',
    label: 'Violence',
    slug: 'violence',
    description: 'Titles with violence content advisories',
  },
  nudity: {
    key: 'nudity',
    label: 'Sex/Nudity',
    slug: 'sex-nudity',
    description: 'Titles with sex or nudity content advisories',
  },
  profanity: {
    key: 'profanity',
    label: 'Profanity',
    slug: 'profanity',
    description: 'Titles with language / profanity advisories',
  },
  frightening: {
    key: 'frightening',
    label: 'Frightening',
    slug: 'frightening',
    description: 'Titles with scary or intense content advisories',
  },
};

const SLUG_TO_KEY = Object.fromEntries(
  Object.values(PARENT_GUIDE_CATEGORIES).map((c) => [c.slug, c.key]),
);

export function parentGuideCategoryFromSlug(slug) {
  if (!slug) return null;
  const key = SLUG_TO_KEY[String(slug).toLowerCase()] || String(slug).toLowerCase();
  return PARENT_GUIDE_CATEGORIES[key] || null;
}

export function parentGuideBrowsePath(categoryKey, level = null) {
  const cat = PARENT_GUIDE_CATEGORIES[categoryKey];
  if (!cat) return '/parent-guide';
  const base = `/parent-guide/${cat.slug}`;
  if (level && level !== 'none' && PARENT_GUIDE_LEVELS.includes(level)) {
    return `${base}?level=${level}`;
  }
  return base;
}

/** Normalize a stored level to none|mild|moderate|severe, or null if empty/invalid. */
export function normalizeParentGuideLevel(value) {
  if (value == null || value === '') return null;
  const s = String(value).toLowerCase().trim();
  if (PARENT_GUIDE_LEVELS.includes(s)) return s;
  return null;
}

const LEVEL_RANK = { none: 0, mild: 1, moderate: 2, severe: 3 };
const RANK_LEVEL = ['none', 'mild', 'moderate', 'severe'];

/**
 * Merge multiple guide sources, taking the *lowest* severity per category.
 * Avoids false positives (e.g. DB says Sex/Nudity moderate, live analysis says none).
 */
export function mergeParentGuides(...guides) {
  const keys = Object.keys(PARENT_GUIDE_CATEGORIES);
  const present = guides.filter((g) => g && typeof g === 'object');
  if (!present.length) return null;

  const out = {};
  for (const k of keys) {
    let min = Infinity;
    let saw = false;
    for (const g of present) {
      const n = normalizeParentGuideLevel(g[k]);
      if (n == null) continue;
      saw = true;
      min = Math.min(min, LEVEL_RANK[n]);
    }
    out[k] = saw ? RANK_LEVEL[min] : 'none';
  }
  return out;
}

/**
 * Resolve the guide used on a detail page.
 * Prefer real DB/analysis values. Heuristic auto-guide is only a last resort,
 * and never invents sex/nudity (that category stays none unless stored/analysed).
 */
export function resolveParentGuide(customParentGuide, autoGuide) {
  const keys = Object.keys(PARENT_GUIDE_CATEGORIES);
  const custom = customParentGuide && typeof customParentGuide === 'object' ? customParentGuide : null;
  const hasCustom = custom && keys.some((k) => normalizeParentGuideLevel(custom[k]));

  if (hasCustom) {
    const out = {};
    for (const k of keys) {
      out[k] = normalizeParentGuideLevel(custom[k]) || 'none';
    }
    return out;
  }

  const auto = autoGuide && typeof autoGuide === 'object' ? autoGuide : {};
  const out = {};
  for (const k of keys) {
    // Never invent sex/nudity from genre/cert heuristics
    if (k === 'nudity') {
      out[k] = 'none';
      continue;
    }
    out[k] = normalizeParentGuideLevel(auto[k]) || 'none';
  }
  return out;
}

/** Categories with a non-none level, for display as tags. */
export function visibleParentGuideTags(guide) {
  return Object.keys(PARENT_GUIDE_CATEGORIES)
    .map((key) => {
      const level = normalizeParentGuideLevel(guide?.[key]);
      if (!level || level === 'none') return null;
      return { key, level, ...PARENT_GUIDE_CATEGORIES[key] };
    })
    .filter(Boolean);
}
