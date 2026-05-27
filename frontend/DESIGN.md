# WattIf — Design System (`ui-redesign`)

A **black-and-white, minimal** system with **intentional color used only as data/brand highlights**.
Inspired by ElevenLabs, Vercel, Linear, Igloo. The opposite of the dark-glass shadcn default —
clean reads as premium, and color *means something* (it's never decoration).

**Primarily WHITE / light — the whole app, dashboard included.** Light is the default theme
(`<html>` has no `.dark`). White panels float over the dark 3D map. Dark theme is kept only as an
optional fallback, not the default.

Hard rules (these are what keep it from looking AI-generated):
1. **Primarily white.** Light theme everywhere; color is earned, never ambient.
2. **No glassmorphism.** No `backdrop-blur`, no translucent frosted panels. Surfaces are solid.
3. **No soft drop shadows for depth.** Structure comes from **1px hairline borders** and whitespace.
   (Shadows allowed only for the landing-page 3D contact shadow.)
4. **No lucide icons.** Use **Phosphor** (`@phosphor-icons/react`), `weight="regular"` default, sparingly.
5. **Numbers are monospace.** Every metric, %, id, kWh figure uses the mono face.
6. **One accent at a time.** A surface is monochrome + at most one semantic color.
7. **No emoji** in UI chrome.
8. **Use Radix primitives directly, NOT shadcn.** Build components on `@radix-ui/react-*` with our
   own Tailwind classes per this file. Strip shadcn's default class strings — they're a fingerprint.
   The existing `components/ui/*` get rewritten as thin, custom-styled Radix wrappers.
9. **Interesting, clear, intuitive.** Minimal ≠ boring — earn visual interest through type scale,
   motion, and the 3D, not clutter.

## Typography
Loaded via Google Fonts (see `index.html`).
- **Display** — `Space Grotesk` (600/700). Huge headlines, hero title, section heads.
- **Sans / UI** — `Manrope` (400/500/600). Body, labels, controls, descriptions.
- **Mono** — `JetBrains Mono` (400/500). All numerics, ids, units, data tables, code-like text.

Tailwind: `font-display`, `font-sans` (default), `font-mono`.

Type scale (rem): display 4.5 / 3 / 2.25 · heading 1.5 / 1.25 · body 1 / 0.875 · label 0.75 (uppercase, `tracking-wide`).
Hierarchy comes from **size + weight**, not color.

## Color tokens
HSL CSS vars in `index.css`. Light is `:root`; dark is `.dark`.

### Light (landing + light dashboard option)
| token | value | use |
|---|---|---|
| `--background` | `0 0% 100%` | page |
| `--foreground` | `0 0% 4%` | text (near-black) |
| `--card` | `0 0% 100%` | panels |
| `--muted` | `0 0% 96%` | subtle fills |
| `--muted-foreground` | `0 0% 42%` | secondary text, labels |
| `--border` | `0 0% 90%` | hairline rules |
| `--primary` | `0 0% 7%` | black buttons / fills |
| `--primary-foreground` | `0 0% 100%` | text on black |

### Dark (default dashboard — best map legibility)
| token | value |
|---|---|
| `--background` | `0 0% 4%` |
| `--foreground` | `0 0% 96%` |
| `--card` | `0 0% 7%` |
| `--muted` | `0 0% 12%` |
| `--muted-foreground` | `0 0% 60%` |
| `--border` | `0 0% 16%` |
| `--primary` | `0 0% 96%` (white) |
| `--primary-foreground` | `0 0% 6%` |

### Semantic / data highlights (the only color, used sparingly, same in both themes)
| token | value | meaning |
|---|---|---|
| `--data-good` | `152 58% 42%` | coverage, served, positive Δ |
| `--data-warn` | `38 92% 50%` | priority, caution |
| `--data-alert` | `0 72% 51%` | energy burden, outage, negative Δ |
| `--data-info` | `212 90% 55%` | neutral selection / focus accent |

Map overlays (priority heat, burden) keep their own ramps — those ARE the data, so color is earned.

## Shape & spacing
- `--radius: 0.4rem` (6.4px) for cards/inputs. Buttons that are pills use `rounded-full`.
- Spacing rhythm on a 4px grid; panels pad `16px` (`p-4`); dense rows `8px`.
- Dividers: `border-t border-border` hairlines, never shadows.

## Components
- **Button**: primary = solid `--primary` (black on light / white on dark), pill or `rounded-md`;
  secondary = transparent + `border-border`; ghost = no border. No gradient fills.
- **Panel/Card**: `bg-card border border-border rounded-[--radius]`. Flat. Section label in
  uppercase mono/label style with a hairline under it.
- **Metric**: label (uppercase, muted, sans) above a `font-mono` value; Δ in a data-semantic color.
- **Data rows / lists**: table-like, hairline separators, mono values right-aligned. (See siting-priority.)

## Motion
Purposeful, quick. `150–250ms ease-out` for UI; landing-page animations longer/eased.
No infinite glow pulses on chrome.

## Landing page (`/` route — light theme)
- Left: huge `font-display` title + short sub + black pill CTA (ElevenLabs/Vercel pattern).
- Right: animated **3D model** (reuse `wind_turbine.glb`) on white with a **soft contact shadow** (Igloo).
- Everything animates in (title, sub, CTA stagger; model idle-rotates). Enters the dashboard on CTA.

## Migration
Reskin surface-by-surface against this file. Replace `.glass` usages with flat `bg-card border`.
Keep the app running each step. Don't restyle away your teammate's RegionSelector logic — only its look.
