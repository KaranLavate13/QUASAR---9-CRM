import React from 'react';
import type { ThemeId } from '../types/crm';

interface LiquidVectorBackgroundProps {
  theme: ThemeId;
}

/**
 * High-density technical optical engineering background canvas for QUASAR-9 CRM.
 * Houses 24+ distinct data, connectivity, compute, telemetry, and orbital motifs
 * across both mobile center-band and desktop flanks.
 * Optimized with strict CSS containment and minimal GPU compositor layers so
 * 92% transparent polychromatic liquid-glass cards run smoothly on every device.
 */
export const LiquidVectorBackground: React.FC<LiquidVectorBackgroundProps> = ({ theme }) => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      style={{ contain: 'strict' }}
    >
      {/* Ambient multi-chromatic light orbs (static pure radial gradients, zero blur filter overhead) */}
      <div
        className="absolute -top-36 -left-32 h-[640px] w-[640px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--vector-orb-1) 0%, color-mix(in srgb, var(--vector-orb-1) 34%, transparent) 42%, transparent 72%)',
        }}
      />
      <div
        className="absolute -right-32 -bottom-24 h-[680px] w-[680px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--vector-orb-2) 0%, color-mix(in srgb, var(--vector-orb-2) 34%, transparent) 42%, transparent 74%)',
        }}
      />

      {/* STATIC LAYER 0 — Dual-Scale Blueprint CAD Mesh, PCB Traces, Oscilloscope, Server Rack & Telemetry Labels */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <pattern id="periapsis-cad-grid" width="96" height="96" patternUnits="userSpaceOnUse">
            <path
              d="M 24 0 V 96 M 48 0 V 96 M 72 0 V 96 M 0 24 H 96 M 0 48 H 96 M 0 72 H 96"
              stroke="var(--vector-grid-fine)"
              strokeWidth="0.65"
            />
            <path d="M 96 0 L 0 0 0 96" stroke="var(--vector-stroke-2)" strokeWidth="0.95" />
            <path d="M 0 0 H 5 M 0 0 V 5" stroke="var(--vector-stroke-1)" strokeWidth="1.25" opacity="0.7" />
          </pattern>
        </defs>
        <rect width="1440" height="900" fill="url(#periapsis-cad-grid)" />

        {/* PCB Circuit Routing Traces with Solder Vias */}
        <path d="M 520 96 H 610 L 635 122 H 740" stroke="var(--vector-stroke-1)" strokeWidth="1.4" />
        <circle cx="520" cy="96" r="3.5" stroke="var(--accent)" strokeWidth="1.5" />
        <circle cx="740" cy="122" r="3.5" fill="var(--accent)" />

        <path d="M 580 570 H 670 L 696 544 H 815 L 840 568 H 910" stroke="var(--vector-stroke-1)" strokeWidth="1.4" />
        <circle cx="580" cy="570" r="3.2" fill="var(--accent)" />
        <circle cx="910" cy="568" r="3.8" stroke="var(--accent)" strokeWidth="1.5" />

        <path d="M 195 310 V 420 L 222 448 V 540" stroke="var(--vector-stroke-1)" strokeWidth="1.35" />
        <circle cx="195" cy="310" r="3.2" stroke="var(--accent)" strokeWidth="1.4" />
        <circle cx="222" cy="540" r="3.2" fill="var(--accent)" />

        {/* Live Telemetry Oscilloscope Waveform Bus */}
        <g transform="translate(720 635)">
          <rect x="-92" y="-28" width="184" height="56" rx="10" stroke="var(--vector-stroke-2)" strokeWidth="1.3" strokeDasharray="6 6" />
          <path
            d="M -80 0 H -48 L -36 -18 L -22 20 L -8 -22 L 8 18 L 22 -14 L 34 8 L 46 0 H 80"
            stroke="var(--vector-stroke-1)"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="-8" cy="-22" r="3.2" fill="var(--accent)" />
          <circle cx="22" cy="-14" r="3" fill="var(--accent)" />
        </g>

        {/* Server Rack / Compute Blade Stack */}
        <g transform="translate(275 710)">
          <rect x="-48" y="-42" width="96" height="24" rx="6" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <rect x="-48" y="-10" width="96" height="24" rx="6" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <rect x="-48" y="22" width="96" height="24" rx="6" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <circle cx="-32" cy="-30" r="3.2" fill="var(--accent)" />
          <circle cx="-32" cy="2" r="3.2" fill="var(--accent)" />
          <circle cx="-32" cy="34" r="3.2" fill="var(--accent)" />
          <line x1="-14" y1="-30" x2="32" y2="-30" stroke="var(--vector-stroke-2)" strokeWidth="2" />
          <line x1="-14" y1="2" x2="32" y2="2" stroke="var(--vector-stroke-2)" strokeWidth="2" />
          <line x1="-14" y1="34" x2="32" y2="34" stroke="var(--vector-stroke-2)" strokeWidth="2" />
        </g>

        {/* Fiber-Optic Signal Pulse Beacon */}
        <g transform="translate(745 275)">
          <circle cx="0" cy="0" r="4.5" fill="var(--accent)" />
          <circle cx="0" cy="0" r="16" stroke="var(--vector-stroke-1)" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="30" stroke="var(--vector-stroke-2)" strokeWidth="1.2" strokeDasharray="5 5" />
        </g>

        {/* Telemetry Data Buses */}
        <path
          d="M -100 485 C 280 390, 610 580, 980 450 C 1230 365, 1390 480, 1560 420"
          stroke="var(--vector-stroke-1)"
          strokeWidth="1.7"
          opacity="0.65"
        />
        <path
          d="M -100 725 C 310 595, 620 845, 1020 685 C 1240 595, 1390 695, 1560 625"
          stroke="var(--vector-stroke-1)"
          strokeWidth="1.8"
          opacity="0.68"
        />
        <circle cx="380" cy="458" r="3.8" fill="var(--accent)" />
        <circle cx="810" cy="498" r="4.2" fill="var(--accent)" />
        <circle cx="1220" cy="422" r="3.8" fill="var(--accent)" />
        <circle cx="320" cy="686" r="4" fill="var(--accent)" />
        <circle cx="770" cy="744" r="4.2" fill="var(--accent)" />
        <circle cx="1160" cy="648" r="3.8" fill="var(--accent)" />

        <g
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="10"
          letterSpacing="1.6"
          fill="var(--vector-stroke-1)"
          opacity="0.72"
        >
          <text x="580" y="138">QUASAR-9 // CORE_SYNC</text>
          <text x="770" y="256">MESH_04 99.98%</text>
          <text x="515" y="472">0x7F // BUS_10G</text>
          <text x="805" y="554">AI_TELEMETRY::ACTIVE</text>
          <text x="612" y="718">TLS_1.3 // NODE_A9</text>
          <text x="1030" y="295">ORBIT_SYNC</text>
          <text x="235" y="325">DB_SHARD_01</text>
        </g>

        {theme === 'google' && (
          <g opacity="0.68">
            <line x1="280" y1="862" x2="430" y2="862" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" />
            <line x1="444" y1="862" x2="544" y2="862" stroke="#EA4335" strokeWidth="3" strokeLinecap="round" />
            <line x1="558" y1="862" x2="640" y2="862" stroke="#FBBC05" strokeWidth="3" strokeLinecap="round" />
            <line x1="654" y1="862" x2="770" y2="862" stroke="#34A853" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
      </svg>

      {/* ANIMATED PARALLAX LAYER A — Core Data, AI Compute, Cloud, Connectivity, Funnel, DB & Security Vectors */}
      <svg
        className="animate-vector-a absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path
          d="M -120 180 C 260 60, 540 310, 940 165 C 1200 70, 1400 185, 1580 115"
          stroke="var(--vector-stroke-1)"
          strokeWidth="2"
          opacity="0.78"
        />
        <path
          d="M -80 225 C 290 105, 580 355, 980 210 C 1240 115, 1440 230, 1600 160"
          stroke="var(--vector-stroke-2)"
          strokeWidth="1.2"
          strokeDasharray="6 8"
        />
        <circle cx="290" cy="148" r="4" fill="var(--accent)" />
        <circle cx="690" cy="212" r="4.2" fill="var(--accent)" />
        <circle cx="1090" cy="138" r="3.8" fill="var(--accent)" />

        {/* 1. AI Neural CPU / Microchip Die */}
        <g transform="translate(650 185)">
          <rect x="-26" y="-26" width="52" height="52" rx="8" stroke="var(--vector-stroke-1)" strokeWidth="2" />
          <rect x="-14" y="-14" width="28" height="28" rx="4" stroke="var(--accent)" strokeWidth="1.8" />
          <circle cx="0" cy="0" r="4.5" fill="var(--accent)" />
          <path d="M -16 -26 V -38 M -5 -26 V -38 M 5 -26 V -38 M 16 -26 V -38" stroke="var(--vector-stroke-1)" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M -16 26 V 38 M -5 26 V 38 M 5 26 V 38 M 16 26 V 38" stroke="var(--vector-stroke-1)" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M -26 -16 H -38 M -26 -5 H -38 M -26 5 H -38 M -26 16 H -38" stroke="var(--vector-stroke-1)" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M 26 -16 H 38 M 26 -5 H 38 M 26 5 H 38 M 26 16 H 38" stroke="var(--vector-stroke-1)" strokeWidth="1.7" strokeLinecap="round" />
        </g>

        {/* 2. Data Analytics Bar Stack + Growth Vector */}
        <g transform="translate(715 470)">
          <rect x="-44" y="10" width="15" height="34" rx="3.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <rect x="-19" y="-10" width="15" height="54" rx="3.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <rect x="6" y="-26" width="15" height="70" rx="3.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <rect x="31" y="-42" width="15" height="86" rx="3.5" stroke="var(--accent)" strokeWidth="2.1" />
          <path d="M -50 -4 L -12 -26 L 14 -40 L 46 -60" stroke="var(--vector-stroke-1)" strokeWidth="1.8" strokeDasharray="4 4" />
          <circle cx="46" cy="-60" r="4.2" fill="var(--accent)" />
        </g>

        {/* 3. Encrypted Security Shield + Auth Key */}
        <g transform="translate(530 565)">
          <path d="M 0 -34 L 28 -22 V 2 C 28 20, 14 32, 0 38 C -14 32, -28 20, -28 2 V -22 Z" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <circle cx="0" cy="-4" r="6" stroke="var(--accent)" strokeWidth="1.8" />
          <path d="M 0 2 V 14 M 0 9 H 5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
        </g>

        {/* 4. Hexagonal Neural Data Cluster */}
        <g transform="translate(745 785)">
          <polygon points="0,-48 42,-24 42,24 0,48 -42,24 -42,-24" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <polygon points="0,-26 22,-13 22,13 0,26 -22,13 -22,-13" stroke="var(--vector-stroke-2)" strokeWidth="1.4" />
          <line x1="0" y1="-48" x2="0" y2="-26" stroke="var(--vector-stroke-1)" strokeWidth="1.3" />
          <line x1="42" y1="24" x2="22" y2="13" stroke="var(--vector-stroke-1)" strokeWidth="1.3" />
          <line x1="-42" y1="24" x2="-22" y2="13" stroke="var(--vector-stroke-1)" strokeWidth="1.3" />
          <circle cx="0" cy="0" r="4.5" fill="var(--accent)" />
        </g>

        {/* 5. Secondary Compact Database Stack */}
        <g transform="translate(985 280)">
          <ellipse cx="0" cy="-16" rx="22" ry="7" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <path d="M -22 -16 V 4 C -22 9, 22 9, 22 4 V -16" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <path d="M -22 4 V 22 C -22 27, 22 27, 22 22 V 4" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <circle cx="11" cy="14" r="2.2" fill="var(--accent)" />
        </g>

        {/* 6. 3D Wireframe Tensor Prism */}
        <g transform="translate(1155 340)">
          <polygon points="0,-36 32,18 -32,18" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <polygon points="0,-36 16,6 32,18" stroke="var(--vector-stroke-2)" strokeWidth="1.3" />
          <line x1="0" y1="-36" x2="0" y2="28" stroke="var(--accent)" strokeWidth="1.4" strokeDasharray="3 3" />
          <line x1="-32" y1="18" x2="0" y2="28" stroke="var(--vector-stroke-1)" strokeWidth="1.5" />
          <line x1="32" y1="18" x2="0" y2="28" stroke="var(--vector-stroke-1)" strokeWidth="1.5" />
        </g>

        {/* 7. Primary Database Cylinder Stack */}
        <g transform="translate(360 165)">
          <ellipse cx="0" cy="-26" rx="34" ry="11" stroke="var(--vector-stroke-1)" strokeWidth="2" />
          <path d="M -34 -26 V 2 C -34 10, 34 10, 34 2 V -26" stroke="var(--vector-stroke-1)" strokeWidth="2" />
          <path d="M -34 2 V 30 C -34 38, 34 38, 34 30 V 2" stroke="var(--vector-stroke-1)" strokeWidth="2" />
          <path d="M -34 -12 C -34 -5, 34 -5, 34 -12" stroke="var(--vector-stroke-2)" strokeWidth="1.4" strokeDasharray="4 4" />
          <circle cx="18" cy="-10" r="2.8" fill="var(--accent)" />
          <circle cx="18" cy="18" r="2.8" fill="var(--accent)" />
        </g>

        {/* 8. CRM Pipeline Funnel Diagram */}
        <g transform="translate(865 345)">
          <polygon points="-40,-28 40,-28 24,-6 -24,-6" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <polygon points="-24,-2 24,-2 13,18 -13,18" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <polygon points="-13,22 13,22 7,38 -7,38" stroke="var(--accent)" strokeWidth="2" />
          <circle cx="0" cy="46" r="3.5" fill="var(--accent)" />
        </g>

        {/* 9. API Schema Brackets { } + Link Chain */}
        <g transform="translate(340 430)">
          <path d="M -26 -30 C -36 -30, -36 -18, -36 -10 C -36 -4, -44 0, -44 0 C -44 0, -36 4, -36 10 C -36 18, -36 30, -26 30" stroke="var(--vector-stroke-1)" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M 26 -30 C 36 -30, 36 -18, 36 -10 C 36 -4, 44 0, 44 0 C 44 0, 36 4, 36 10 C 36 18, 36 30, 26 30" stroke="var(--vector-stroke-1)" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="-14" y="-8" width="16" height="16" rx="8" stroke="var(--accent)" strokeWidth="2" />
          <rect x="-2" y="-8" width="16" height="16" rx="8" stroke="var(--vector-stroke-1)" strokeWidth="2" />
        </g>

        {/* 10. Terminal CLI >_ Execution Module */}
        <g transform="translate(555 765)">
          <rect x="-40" y="-26" width="80" height="52" rx="8" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <line x1="-40" y1="-12" x2="40" y2="-12" stroke="var(--vector-stroke-2)" strokeWidth="1.2" />
          <circle cx="-28" cy="-19" r="2.2" fill="var(--accent)" />
          <circle cx="-20" cy="-19" r="2.2" fill="var(--vector-stroke-1)" />
          <path d="M -24 2 L -14 10 L -24 18" stroke="var(--accent)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="-6" y1="18" x2="18" y2="18" stroke="var(--vector-stroke-1)" strokeWidth="2.1" strokeLinecap="round" />
        </g>

        {/* 11. Connectivity Signal Waves & Relay Hub */}
        <g transform="translate(1205 725)">
          <circle cx="0" cy="0" r="6.5" fill="var(--accent)" />
          <path d="M -22 -18 A 28 28 0 0 1 22 -18" stroke="var(--vector-stroke-1)" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M -38 -32 A 50 50 0 0 1 38 -32" stroke="var(--vector-stroke-1)" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M -54 -46 A 72 72 0 0 1 54 -46" stroke="var(--vector-stroke-2)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="6 6" />
          <path d="M -22 18 A 28 28 0 0 0 22 18" stroke="var(--vector-stroke-1)" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M -38 32 A 50 50 0 0 0 38 32" stroke="var(--vector-stroke-2)" strokeWidth="1.6" strokeLinecap="round" />
        </g>

        {/* 12. Satellite Uplink Dish Vector */}
        <g transform="translate(150 205)">
          <path d="M -26 -14 A 32 32 0 0 0 18 24 Z" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <line x1="-4" y1="6" x2="14" y2="-12" stroke="var(--accent)" strokeWidth="1.8" />
          <circle cx="16" cy="-14" r="3.5" fill="var(--accent)" />
          <path d="M 22 -24 A 14 14 0 0 1 32 -14" stroke="var(--vector-stroke-1)" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 28 -32 A 24 24 0 0 1 42 -16" stroke="var(--vector-stroke-2)" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </svg>

      {/* ANIMATED PARALLAX LAYER B — Cloud Sync, Connectivity Meshes, Container Cube, Packet Sync, Switch Matrix */}
      <svg
        className="animate-vector-b absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* 13. Cloud Sync & Bidirectional Data Transfer */}
        <g transform="translate(860 170)">
          <path
            d="M -38 15 H 34 C 46 15, 54 7, 54 -4 C 54 -14, 46 -22, 36 -23 C 32 -38, 19 -48, 2 -48 C -15 -48, -30 -35, -33 -18 C -45 -16, -54 -7, -54 4 C -54 11, -47 15, -38 15 Z"
            stroke="var(--vector-stroke-1)"
            strokeWidth="2"
          />
          <path d="M -10 -4 V -24 M -18 -16 L -10 -24 L -2 -16" stroke="var(--accent)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 14 -24 V -4 M 6 -12 L 14 -4 L 22 -12" stroke="var(--vector-stroke-1)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* 14. Compact Network Connectivity Mesh */}
        <g transform="translate(565 340)">
          <line x1="-44" y1="-26" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <line x1="48" y1="-20" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <line x1="-30" y1="40" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <line x1="42" y1="36" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <line x1="-44" y1="-26" x2="48" y2="-20" stroke="var(--vector-stroke-2)" strokeWidth="1.2" strokeDasharray="4 4" />
          <circle cx="0" cy="0" r="11" stroke="var(--vector-stroke-1)" strokeWidth="2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--accent)" />
          <circle cx="-44" cy="-26" r="7" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <circle cx="48" cy="-20" r="7" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <circle cx="-30" cy="40" r="6.5" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
          <circle cx="42" cy="36" r="7.5" stroke="var(--vector-stroke-1)" strokeWidth="1.7" />
        </g>

        {/* 15. Full Network Connectivity Topology */}
        <g transform="translate(1110 470)">
          <line x1="-60" y1="-36" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <line x1="66" y1="-26" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <line x1="-40" y1="54" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <line x1="54" y1="50" x2="0" y2="0" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <line x1="-60" y1="-36" x2="66" y2="-26" stroke="var(--vector-stroke-2)" strokeWidth="1.3" strokeDasharray="5 5" />
          <line x1="-40" y1="54" x2="54" y2="50" stroke="var(--vector-stroke-2)" strokeWidth="1.3" strokeDasharray="5 5" />
          <circle cx="0" cy="0" r="15" stroke="var(--vector-stroke-1)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="5.5" fill="var(--accent)" />
          <circle cx="-60" cy="-36" r="9.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <circle cx="66" cy="-26" r="9.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <circle cx="-40" cy="54" r="8.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
          <circle cx="54" cy="50" r="10.5" stroke="var(--vector-stroke-1)" strokeWidth="1.9" />
        </g>

        {/* 16. Isometric Microservice Container Cube Stack */}
        <g transform="translate(915 620)">
          <polygon points="0,-34 30,-17 0,0 -30,-17" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <polygon points="-30,-17 0,0 0,34 -30,17" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <polygon points="30,-17 0,0 0,34 30,17" stroke="var(--accent)" strokeWidth="1.8" />
          <circle cx="0" cy="0" r="3.5" fill="var(--accent)" />
        </g>

        {/* 17. Bidirectional Data Packet Sync Relay */}
        <g transform="translate(465 265)">
          <rect x="-32" y="-20" width="64" height="40" rx="9" stroke="var(--vector-stroke-2)" strokeWidth="1.5" strokeDasharray="5 5" />
          <path d="M -18 -5 H 16 M 9 -12 L 16 -5 L 9 2" stroke="var(--vector-stroke-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 18 7 H -16 M -9 0 L -16 7 L -9 14" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* 18. Network Switch / Port Matrix Module */}
        <g transform="translate(420 620)">
          <rect x="-42" y="-16" width="84" height="32" rx="6" stroke="var(--vector-stroke-1)" strokeWidth="1.8" />
          <rect x="-32" y="-6" width="10" height="12" rx="2" stroke="var(--accent)" strokeWidth="1.5" />
          <rect x="-16" y="-6" width="10" height="12" rx="2" stroke="var(--vector-stroke-1)" strokeWidth="1.5" />
          <rect x="0" y="-6" width="10" height="12" rx="2" stroke="var(--vector-stroke-1)" strokeWidth="1.5" />
          <rect x="16" y="-6" width="10" height="12" rx="2" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="34" cy="0" r="2.5" fill="var(--accent)" />
        </g>
      </svg>

      {/* COMPACT GPU-COMPOSITED ORBITAL GYROSCOPES & QUANTUM LATTICE */}
      <svg
        className="animate-vector-orbit absolute top-[6%] right-[4%] h-[260px] w-[260px]"
        viewBox="-150 -150 300 300"
        fill="none"
      >
        <circle cx="0" cy="0" r="138" stroke="var(--vector-stroke-2)" strokeWidth="1.35" strokeDasharray="4 9" />
        <circle cx="0" cy="0" r="92" stroke="var(--vector-stroke-1)" strokeWidth="1.8" strokeDasharray="44 16 12 16" />
        <circle cx="0" cy="0" r="46" stroke="var(--vector-stroke-1)" strokeWidth="1.3" strokeDasharray="8 8" />
        <circle cx="92" cy="0" r="4.5" fill="var(--accent)" />
        <circle cx="-138" cy="0" r="3.5" fill="var(--accent)" opacity="0.78" />
        <line x1="-18" y1="0" x2="18" y2="0" stroke="var(--accent)" strokeWidth="1.4" />
        <line x1="0" y1="-18" x2="0" y2="18" stroke="var(--accent)" strokeWidth="1.4" />
      </svg>

      <svg
        className="animate-vector-orbit-rev absolute right-[28%] bottom-[5%] h-[112px] w-[112px]"
        viewBox="-58 -58 116 116"
        fill="none"
      >
        <ellipse cx="0" cy="0" rx="46" ry="18" stroke="var(--vector-stroke-1)" strokeWidth="1.6" />
        <ellipse cx="0" cy="0" rx="46" ry="18" transform="rotate(60)" stroke="var(--vector-stroke-1)" strokeWidth="1.6" />
        <ellipse cx="0" cy="0" rx="46" ry="18" transform="rotate(-60)" stroke="var(--vector-stroke-2)" strokeWidth="1.4" />
        <circle cx="0" cy="0" r="4.5" fill="var(--accent)" />
      </svg>
    </div>
  );
};
