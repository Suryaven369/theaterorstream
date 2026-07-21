import React, { lazy, Suspense } from 'react';

const pageFallback = (
  <div className="min-h-[50vh] flex items-center justify-center bg-[#0a0a0a]">
    <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green,#22c55e)] border-t-transparent rounded-full" />
  </div>
);

/** Wrap a dynamic import so the route chunk is not in the initial Home bundle. */
export function lazyPage(importer) {
  const Comp = lazy(importer);
  return function LazyRoute(props) {
    return (
      <Suspense fallback={pageFallback}>
        <Comp {...props} />
      </Suspense>
    );
  };
}
