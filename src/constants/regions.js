import { getUserRegionCode, setManualRegion } from '../lib/userRegion.js';

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

/** The viewer's region: manual pick, else the auto-detected country (see lib/userRegion). */
export function getSavedRegion() {
  const code = getUserRegionCode();
  return REGIONS.find((r) => r.code === code) || REGIONS[0];
}

/** A region chosen in a picker is remembered and beats auto-detection. */
export function persistRegion(region) {
  if (region?.code) setManualRegion(region.code);
}
