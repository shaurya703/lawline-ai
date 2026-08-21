---
name: frontend-design
description: LawLine AI design system — use whenever building or editing UI (React/Vite front-end in frontend/, Streamlit pages in lawline/ui/). Defines type scale, 8px spacing grid, color tokens, component patterns, motion rules, and explicit anti-"generic AI" guidance.
---

# LawLine AI — Frontend Design Skill

LawLine is a legal-research "command center": dense information, high trust, dark interface with restrained neon accents.
Every UI decision should read as **precise, evidentiary, calm** — not flashy. When in doubt, remove an effect.

## 1. Tokens (never use raw hex in components — import from `frontend/src/styles/tokens.css` / `lawline/ui/theme.py`)

### Color
| Token | Value | Use |
|---|---|---|
| `--bg` | `#070b14` | page background |
| `--bg-elev` | `#0e1628` | panels, cards (72% alpha glass allowed: `rgba(14,22,40,.72)`) |
| `--border` | `rgba(0,229,255,.18)` | 1px borders only |
| `--text` | `#dfe7f5` | body text |
| `--text-muted` | `#8b9bb4` | labels, captions, metadata |
| `--primary` | `#00e5ff` | one accent per view: active state, key metric, primary CTA |
| `--secondary` | `#7c4dff` | secondary data series, KG/entity badges |
| `--success` | `#2ee6a6` | cited / verified / online |
| `--warning` | `#ffd166` | lexical/BM25 series, caution |
| `--danger` | `#ff4d6d` | errors, destructive |
Rules: max **one** saturated accent per component; accents on text only for numbers/labels ≤ 2 words; long text is always `--text`/`--text-muted`. Contrast ≥ 4.5:1 for body, ≥ 3:1 for large display text.

### Typography (modular scale 1.25, base 16px)
| Role | Size / line | Weight | Family |
|---|---|---|---|
| display | 39px / 1.1 | 700 | Orbitron (page titles only, uppercase, letter-spacing .04em) |
| h1 | 31px / 1.2 | 700 | Orbitron |
| h2 | 25px / 1.25 | 600 | Inter |
| h3 | 20px / 1.3 | 600 | Inter |
| body | 16px / 1.6 | 400 | Inter |
| small | 13px / 1.5 | 400 | Inter |
| caption / mono | 12px / 1.4 | 400 | JetBrains Mono (ids, latency, citations `[3]`, status lines) |
Never introduce sizes outside this scale. Max line length for prose: 72ch. Numbers in KPIs use `font-variant-numeric: tabular-nums`.

### Spacing — 8px grid
`--s1 4px` (icon gaps only) · `--s2 8px` · `--s3 16px` · `--s4 24px` · `--s5 32px` · `--s6 48px` · `--s7 64px`.
Card padding 24px; gaps between cards 16px; section spacing 48px; page gutter 32px (16px < 640px).

### Radius & elevation
Radius: controls 10px, cards 14px, hero panels 18px, pills 999px. Shadow only on hover/focus: `0 12px 40px rgba(0,229,255,.12)`. No drop shadows at rest.

## 2. Component patterns
**Button**: height 40px, padding 0 16px, radius 10px, 1px `--border`, label 14px/600. States: default (glass bg) → hover (border `--primary`, glow) → active (translateY(1px)) → focus-visible (2px outline `--primary`, offset 2px) → disabled (opacity .45, no hover) → loading (spinner replaces label, width fixed). Primary = filled gradient `primary→secondary` at 16% alpha; destructive = `--danger` border. One primary per view.
**Card**: 24px padding, eyebrow label (caption, muted, uppercase, tracking .12em) → value/title → supporting mono line. Hover lifts 2px. Cards never nest more than one level.
**Citation chip**: `[n]` mono, pill, `--success` border when the answer cites it, neutral otherwise. Clicking scrolls to / expands the passage.
**Source badge**: pill with retriever name (FAISS = primary, BM25 = warning, KG = secondary, KG-slot = success).
**Forms**: label above control (small, 600), 8px gap, control height 40px, help text caption muted, error text `--danger` with icon, never placeholder-as-label. Group related fields in 2-column grid ≥ 768px.
**Chat message**: assistant and user both glass cards; assistant gets the scale avatar; passages live in a collapsed expander under the message, never inline.
**Charts (Plotly/Recharts)**: transparent background, gridlines `rgba(139,155,180,.12)`, series order primary → secondary → warning → success, axis titles small muted, tooltips elevated bg with primary border.
**Empty / loading / error states are mandatory** for every data view: skeleton (not spinner) for content > 300ms; error shows what failed and a retry.

## 3. Motion (framer-motion)
Durations: micro 120ms, standard 200ms, panels 280ms; easing `[0.2, 0.8, 0.2, 1]`. Animate opacity/transform only. Page enter: fade + 8px rise, stagger children 40ms. Respect `prefers-reduced-motion` (disable transforms). No looping animations except the status pulse (1.6s) and hero conic sweep — and never more than one loop visible.

## 4. Avoid the generic-AI aesthetic
- No purple-to-pink gradients, no centered hero with three equal feature cards, no emoji bullet lists in UI copy, no "✨ Powered by AI" labels.
- No stock glassmorphism everywhere: glass only on hero and cards over the grid background; inputs and tables are flat.
- No default Inter-on-white layouts; no Tailwind default palette colors (`blue-500` etc.).
- Text: specific, legal, concrete ("5 passages · 2 cited · 1.2 s") — never "Unlock insights", "Seamless", "Elevate".
- Density over whitespace: this is a research tool; target ≥ 3 meaningful data points above the fold.
- Don't animate everything; one motion per interaction.
- Accessibility is not optional: keyboard focus rings, `aria-label` on icon buttons, semantic headings in order, live region for streaming answers.

## 5. Implementation notes
- React: tokens via CSS variables in `frontend/src/styles/tokens.css`; components in `frontend/src/components/`; no inline hex.
- Streamlit: tokens in `lawline/ui/theme.py` (`ACCENT`, `ACCENT2`, …) and `CSS` — extend, don't fork.
- Legal disclaimer line ("This is information, not legal advice.") appears once per answer, caption size, never hidden.
