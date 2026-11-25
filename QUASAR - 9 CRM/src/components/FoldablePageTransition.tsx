import React, { useEffect, useRef, useState } from 'react';
import type { NavTab } from '../types/crm';

interface FoldablePageTransitionProps {
  activeTab: NavTab;
  tabLabel: string;
  TabIcon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

/**
 * Frosted Liquid-Glass Blur-to-Crisp Page Transition.
 * Inspired by native foldable-glass unblur transitions: when switching CRM views,
 * the workspace softly diffuses into a translucent frosted glass wash and seamlessly
 * resolves into crystal clarity (no literal phone graphic).
 */
export const FoldablePageTransition: React.FC<FoldablePageTransitionProps> = ({
  activeTab,
  children,
}) => {
  const prevTabRef = useRef<NavTab>(activeTab);
  const [transitionKey, setTransitionKey] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (prevTabRef.current === activeTab) return;
    prevTabRef.current = activeTab;
    setTransitionKey((k) => k + 1);
    setIsTransitioning(true);

    const timer = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 460);

    return () => window.clearTimeout(timer);
  }, [activeTab]);

  return (
    <div className="relative">
      {/* Full-viewport frosted glass blur veil that dissolves smoothly from frosted → crisp */}
      {isTransitioning && (
        <div
          key={`frost-veil-${transitionKey}`}
          aria-hidden="true"
          className="frost-transition-veil pointer-events-none fixed inset-0 z-40"
        />
      )}

      {/* Incoming page content resolving smoothly from soft frosted blur to crisp focus */}
      <div
        key={`frost-page-${activeTab}-${transitionKey}`}
        className={isTransitioning ? 'frost-page-resolve' : undefined}
      >
        {children}
      </div>
    </div>
  );
};
