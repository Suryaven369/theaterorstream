import React, { useState } from 'react';
import { FaGlobe, FaChevronDown } from 'react-icons/fa';
import { REGIONS } from '../../constants/regions';

/**
 * Region dropdown for My Feed content filtering.
 */
export default function HomeRegionPicker({ selectedRegion, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (region) => {
    onSelect?.(region);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-yellow-500/30 transition-all min-h-[40px]"
      >
        <FaGlobe className="text-yellow-400 text-sm shrink-0" />
        <span className="text-lg sm:text-xl">{selectedRegion.flag}</span>
        <span className="text-white text-xs sm:text-sm font-medium">{selectedRegion.name}</span>
        <FaChevronDown
          className={`text-white/50 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 w-[min(13rem,calc(100vw-1.5rem))] py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl z-50 max-h-[60vh] overflow-y-auto">
          {REGIONS.map((region) => (
            <button
              key={region.code}
              type="button"
              onClick={() => handleSelect(region)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm min-h-[44px] ${
                selectedRegion.code === region.code
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'text-white'
              }`}
            >
              <span className="text-lg">{region.flag}</span>
              <span className="font-medium">{region.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
