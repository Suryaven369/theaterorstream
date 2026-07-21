import React from 'react';
import {
  HiOutlineHome,
  HiOutlineBookmark,
  HiOutlineRectangleStack,
  HiOutlineBookOpen,
} from 'react-icons/hi2';

/**
 * Explore left rail — Feed + Collections / Boards / Blogs (in-page panels).
 */
const NAV_ITEMS = [
  { id: 'feed', label: 'Feed', icon: HiOutlineHome },
  { id: 'collections', label: 'Collections', short: 'Lists', icon: HiOutlineBookmark },
  { id: 'boards', label: 'Boards', icon: HiOutlineRectangleStack },
  { id: 'blogs', label: 'Blogs', icon: HiOutlineBookOpen },
];

function itemClass(active) {
  return `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[15px] transition-colors w-full text-left ${
    active
      ? 'bg-[#2a2a2a] text-white font-medium'
      : 'text-white/90 hover:bg-white/[0.06] hover:text-white'
  }`;
}

/**
 * Explore left rail — outline icons + labels.
 * placement: "mobile" | "rail"
 * activePanel / onSelect switch main content without leaving Explore.
 */
export default function HomeExploreBrowseSidebar({
  placement = 'rail',
  activePanel = 'feed',
  onSelect,
}) {
  const handleSelect = (id) => {
    onSelect?.(id);
  };

  if (placement === 'mobile') {
    return (
      <div className="lg:hidden sticky top-[calc(4.25rem+env(safe-area-inset-top,0px))] z-30 -mx-3 sm:-mx-6 mb-4 px-3 sm:px-6 py-2 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div
          className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]"
          role="tablist"
          aria-label="Explore sections"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelect(item.id)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-h-[44px] px-1 sm:px-2 py-1.5 rounded-xl text-[11px] sm:text-sm transition-colors ${
                  active
                    ? 'bg-[#2a2a2a] text-white font-medium shadow-sm'
                    : 'text-white/55 active:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-[18px] h-[18px] stroke-[1.5] shrink-0" />
                <span className="truncate max-w-full leading-tight">
                  <span className="sm:hidden">{item.short || item.label}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <aside className="hidden lg:block self-stretch w-[8.5rem] xl:w-[9rem] shrink-0 -ml-1 xl:-ml-2">
      <div className="sticky top-24 h-[calc(100vh-8rem)] flex items-start pt-2 xl:items-center xl:pt-0">
        <nav className="w-full space-y-0.5 pr-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={itemClass(active)}
              >
                <Icon className="w-[20px] h-[20px] xl:w-[22px] xl:h-[22px] shrink-0 stroke-[1.5]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
