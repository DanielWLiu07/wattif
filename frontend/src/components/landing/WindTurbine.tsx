// SVG wind turbine with CSS-animated blades and soft contact shadow.
export function WindTurbine({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-end justify-center select-none ${className}`}>
      {/* Soft contact shadow — design spec allows this for the landing model */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: 140,
          height: 18,
          background: "radial-gradient(ellipse, rgba(0,0,0,0.18) 0%, transparent 70%)",
          filter: "blur(6px)",
        }}
      />

      <svg
        viewBox="0 0 240 420"
        width={240}
        height={420}
        xmlns="http://www.w3.org/2000/svg"
        overflow="visible"
        aria-hidden
      >
        <defs>
          <style>{`
            @keyframes turbine-spin {
              from { transform: rotate(0deg); }
              to   { transform: rotate(360deg); }
            }
            .blades {
              transform-box: fill-box;
              transform-origin: center;
              animation: turbine-spin 5s linear infinite;
            }
          `}</style>

          {/* Blade gradient — gives a subtle 3-D taper feel */}
          <linearGradient id="blade-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#111111" />
            <stop offset="100%" stopColor="#555555" />
          </linearGradient>

          {/* Tower gradient — darker at top, lighter at base */}
          <linearGradient id="tower-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#181818" />
            <stop offset="100%" stopColor="#3a3a3a" />
          </linearGradient>
        </defs>

        {/* Tower — trapezoidal (wider at base for perspective) */}
        <polygon
          points="112,205 128,205 135,415 105,415"
          fill="url(#tower-grad)"
        />

        {/* Rotating assembly: hub + 3 blades, all centered at (120, 198) */}
        <g className="blades" style={{ transformOrigin: "120px 198px" }}>
          {/* Blade 1 — pointing straight up */}
          <path
            d="M120,198 C117,175 113,130 116,78 C118,70 122,70 124,78 C127,130 123,175 120,198Z"
            fill="url(#blade-grad)"
          />
          {/* Blade 2 — 120° clockwise */}
          <path
            d="M120,198 C141,187 183,163 226,147 C233,144 235,148 229,153 C191,168 149,186 120,198Z"
            fill="#2a2a2a"
          />
          {/* Blade 3 — 240° clockwise */}
          <path
            d="M120,198 C99,187 57,163 14,147 C7,144 5,148 11,153 C49,168 91,186 120,198Z"
            fill="url(#blade-grad)"
          />
        </g>

        {/* Nacelle housing — sits on top of tower */}
        <rect x="105" y="197" width="30" height="14" rx="3" fill="#111111" />

        {/* Hub — centered on rotation point */}
        <circle cx="120" cy="198" r="7" fill="#0a0a0a" />
        <circle cx="120" cy="198" r="3" fill="#444444" />
      </svg>
    </div>
  );
}
