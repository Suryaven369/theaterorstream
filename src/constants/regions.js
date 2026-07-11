/** Content-region options for My Feed / upcoming filtering. */
export const REGIONS = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
];

export function getSavedRegion() {
  const saved = localStorage.getItem('selectedRegion');
  if (saved) {
    const found = REGIONS.find((r) => r.code === saved);
    if (found) return found;
  }
  return REGIONS[0];
}

export function persistRegion(region) {
  if (region?.code) localStorage.setItem('selectedRegion', region.code);
}
