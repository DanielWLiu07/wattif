import { useRef, useState, useEffect, useCallback } from "react";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { ApproachSection } from "@/components/landing/ApproachSection";
import { ScopeSection } from "@/components/landing/ScopeSection";

const SECTIONS = 4;

// Waypoint labels for the road progress indicator
const WAYPOINTS = ["Home", "Problem", "Approach", "Scope"];

export function Landing() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [heroVisible, setHeroVisible] = useState(false);

  // Derive the current section index (0-based) from continuous progress
  const currentSection = Math.round(scrollProgress * (SECTIONS - 1));

  // Animate hero in on mount
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 120);
    return () => clearTimeout(t);
  }, []);

  // Scroll handler — maps vertical scroll → [0,1] horizontal progress
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      setScrollProgress(maxScroll > 0 ? el.scrollTop / maxScroll : 0);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Jump to a specific section by scrolling the container
  const goToSection = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: (index / (SECTIONS - 1)) * maxScroll, behavior: "smooth" });
    },
    []
  );

  // Advance to the scope section when CTA is clicked
  const handleEnter = useCallback(() => goToSection(SECTIONS - 1), [goToSection]);

  // Horizontal translate: as progress goes 0→1, track moves -(SECTIONS-1) * 100vw
  const translateVw = -scrollProgress * (SECTIONS - 1) * 100;

  return (
    /*
     * Fixed full-screen container with its own overflow-y scroll — body has
     * overflow:hidden so we can't use the window scroll directly.
     *
     * Structure: a (SECTIONS * 100)vh tall parent → sticky child pinned to
     * top:0 → horizontal track that translates based on scroll progress.
     */
    <div
      ref={scrollRef}
      className="fixed inset-0 z-[80] overflow-y-scroll bg-background"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={{ scrollbarWidth: "none" } as any}
    >
      {/* Tall parent provides the scrollable height */}
      <div style={{ height: `${SECTIONS * 100}vh` }}>

      {/* Sticky viewport — always fills the screen while parent is being scrolled */}
      <div
        className="sticky top-0 h-screen overflow-hidden"
      >
        {/* Horizontal track */}
        <div
          className="flex h-full"
          style={{
            width: `${SECTIONS * 100}vw`,
            transform: `translateX(${translateVw}vw)`,
            transition: "transform 80ms ease-out",
            willChange: "transform",
          }}
        >
          <HeroSection onEnter={handleEnter} visible={heroVisible} />
          <ProblemSection />
          <ApproachSection />
          <ScopeSection onScopeSelected={() => {}} />
        </div>
      </div>
      </div>

      {/* Road progress — fixed to viewport bottom */}
      <RoadProgress
        progress={scrollProgress}
        current={currentSection}
        total={SECTIONS}
        waypoints={WAYPOINTS}
        onDotClick={goToSection}
      />
    </div>
  );
}

// ─── Road progress indicator ────────────────────────────────────────────────

interface RoadProgressProps {
  progress: number;
  current: number;
  total: number;
  waypoints: string[];
  onDotClick: (i: number) => void;
}

function RoadProgress({ progress, current, total, waypoints, onDotClick }: RoadProgressProps) {
  return (
    <div
      className="fixed bottom-8 left-1/2 z-[90] -translate-x-1/2 flex flex-col items-center gap-3"
      style={{ pointerEvents: "none" }}
    >
      {/* Active waypoint label */}
      <span
        key={current}
        className="label animate-in fade-in duration-200 text-foreground/60"
      >
        {waypoints[current]}
      </span>

      {/* Road line with dots */}
      <div
        className="flex items-center gap-0"
        style={{ pointerEvents: "auto" }}
      >
        {/* Progress fill track */}
        <div className="relative flex h-px items-center" style={{ width: 160 }}>
          {/* Background rail */}
          <div className="absolute inset-0 bg-foreground/15 rounded-full" />
          {/* Fill */}
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-brand transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
          {/* Waypoint dots */}
          {Array.from({ length: total }).map((_, i) => {
            const pct = i / (total - 1);
            const isPast = progress >= pct - 0.01;
            const isCurrent = current === i;
            return (
              <button
                key={i}
                onClick={() => onDotClick(i)}
                aria-label={`Go to ${waypoints[i]}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2 flex items-center justify-center transition-all duration-200"
                style={{ left: `${pct * 100}%` }}
              >
                <span
                  className={`block rounded-full transition-all duration-200 ${
                    isCurrent
                      ? "bg-brand"
                      : isPast
                      ? "bg-brand/60"
                      : "bg-foreground/20"
                  }`}
                  style={{
                    width: isCurrent ? 10 : 6,
                    height: isCurrent ? 10 : 6,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
