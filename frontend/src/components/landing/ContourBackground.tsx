// Energy contour-line motif: subtle topographic lines connecting the map theme to the landing.
export function ContourBackground({ className = "" }: { className?: string }) {
  const lines = [
    "M-40,80 Q180,40 420,90 T860,70 T1300,95 T1480,80",
    "M-40,160 Q200,120 460,170 T900,150 T1340,175 T1480,160",
    "M-40,250 Q160,200 400,260 T840,240 T1280,265 T1480,248",
    "M-40,340 Q220,290 480,350 T920,330 T1360,355 T1480,338",
    "M-40,430 Q140,380 380,440 T820,420 T1260,445 T1480,428",
    "M-40,520 Q240,465 500,530 T940,510 T1380,535 T1480,518",
    "M-40,610 Q180,555 420,620 T860,600 T1300,625 T1480,608",
    "M-40,700 Q200,645 440,710 T880,690 T1320,715 T1480,698",
    "M-40,790 Q160,735 400,800 T840,780 T1280,805 T1480,788",
    "M-40,880 Q220,825 480,890 T920,870 T1360,895 T1480,878",
    "M-40,10  Q240,−30 500,20  T940,0   T1380,25  T1480,8",
  ];

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <style>{`
          @keyframes contour-drift {
            from { transform: translateY(0px); }
            to   { transform: translateY(-90px); }
          }
          .contour-track {
            animation: contour-drift 18s linear infinite;
          }
        `}</style>
      </defs>
      <g className="contour-track" fill="none" stroke="currentColor" strokeWidth="1">
        {/* Duplicate the lines set so the drift loops seamlessly */}
        {[0, 90].map((offset) =>
          lines.map((d, i) => (
            <path
              key={`${offset}-${i}`}
              d={d.replace(/(\d+),/g, (_, n) => `${n},`)}
              style={{ transform: `translateY(${offset}px)` }}
              opacity={0.35 - i * 0.02}
            />
          ))
        )}
      </g>
    </svg>
  );
}
