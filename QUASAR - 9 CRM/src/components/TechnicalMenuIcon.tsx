import React from 'react';

interface TechnicalMenuIconProps {
  open?: boolean;
  className?: string;
}

/**
 * Bespoke aerospace/sci-fi technical vector symbol for the workspace menu trigger.
 * Intentionally avoids traditional hamburger lines, dot grids, or standard bars:
 * renders a chamfered HUD octagonal aperture with an asymmetric orbital node-routing circuit
 * that morphs smoothly when the navigation drawer opens.
 */
export const TechnicalMenuIcon: React.FC<TechnicalMenuIconProps> = ({
  open = false,
  className = 'h-5 w-5',
}) => {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={`${className} transition-transform duration-300 ease-out`}
      style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
    >
      {/* Chamfered octagonal HUD corner brackets */}
      <path
        d="M8.5 2.5H5.5L2.5 5.5V8.5M19.5 2.5H22.5L25.5 5.5V8.5M25.5 19.5V22.5L22.5 25.5H19.5M8.5 25.5H5.5L2.5 22.5V19.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      />

      {/* Split orbital telemetry arc */}
      <path
        d="M14 5.5A8.5 8.5 0 0 1 22.5 14M14 22.5A8.5 8.5 0 0 1 5.5 14"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={open ? '0.95' : '0.85'}
      />

      {/* Asymmetric 45-degree PCB routing traces */}
      <path
        d="M14 14L8.2 8.2M14 14L20 10.5M14 14L10.8 20.2"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        opacity={open ? '0.95' : '0.88'}
      />

      {/* Secondary precision cross-vector when open */}
      {open && (
        <path
          d="M14 14L19.8 19.8"
          stroke="var(--accent)"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
      )}

      {/* Terminal micro-diamond telemetry pads */}
      <polygon points="8.2,6.4 10,8.2 8.2,10 6.4,8.2" fill="var(--accent)" />
      <polygon points="20,8.8 21.7,10.5 20,12.2 18.3,10.5" fill="currentColor" opacity="0.9" />
      <polygon points="10.8,18.5 12.5,20.2 10.8,21.9 9.1,20.2" fill="var(--accent)" />

      {/* Central nexus core */}
      <circle cx="14" cy="14" r="2.7" stroke="var(--accent)" strokeWidth="1.6" fill="var(--bg-header)" />
      <circle cx="14" cy="14" r="1.15" fill="var(--accent)" />
    </svg>
  );
};
