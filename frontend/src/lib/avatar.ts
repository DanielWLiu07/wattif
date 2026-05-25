// Deterministic procedural avatars from a seed string (no network, no deps).
// Produces a small inline SVG data-URI — a "boring-avatars"-style geometric blob.

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTES: string[][] = [
  ["#0ea5e9", "#22c55e", "#a78bfa", "#fde047"],
  ["#f97316", "#ef4444", "#facc15", "#fb7185"],
  ["#34d399", "#2dd4bf", "#38bdf8", "#a3e635"],
  ["#818cf8", "#c084fc", "#f472b6", "#60a5fa"],
];

export function avatarDataUri(seed: string): string {
  const h = hashStr(seed);
  const pal = PALETTES[h % PALETTES.length];
  const bg = pal[0];
  const c1 = pal[1];
  const c2 = pal[2];
  const c3 = pal[3];
  const r = (n: number) => ((h >> n) & 0xff) / 255;
  const cx1 = 8 + r(2) * 24;
  const cy1 = 8 + r(5) * 24;
  const cx2 = 8 + r(8) * 24;
  const cy2 = 8 + r(11) * 24;
  const rot = Math.floor(r(14) * 360);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<rect width="40" height="40" fill="${bg}"/>
<g transform="rotate(${rot} 20 20)">
<circle cx="${cx1.toFixed(1)}" cy="${cy1.toFixed(1)}" r="14" fill="${c1}" opacity="0.85"/>
<rect x="${cx2.toFixed(1)}" y="${cy2.toFixed(1)}" width="18" height="18" rx="4" fill="${c2}" opacity="0.8"/>
<circle cx="${(20 + r(17) * 8).toFixed(1)}" cy="${(24 + r(20) * 6).toFixed(1)}" r="6" fill="${c3}" opacity="0.9"/>
</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
