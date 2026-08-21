# LawLine AI — Design System (Master, Source of Truth)

Generated with ui-ux-pro-max (`legal research AI assistant dashboard dark professional data-dense trust`) and reconciled
with the repo skill `.claude/skills/frontend-design/SKILL.md`, which holds the canonical tokens. Where the generator's
generic SaaS defaults (light background, testimonial landing pattern, Fira fonts) conflict with the established product,
the product wins — this app is a dark, data-dense research tool, not a marketing site.

## Product pattern
Dashboard application with a landing hero. Navigation: persistent left sidebar (grouped: LawLine / Investigate / Work /
Evidence), sticky top bar with page title + status pill; content max-width 1280px; 32px gutters (16px < 640px).
Landing: hero (canvas) → proof strip (3 real metrics) → primary CTA "Start a consultation" → Counsel. No testimonials,
no pricing, no feature-card triptych.

## Style
Dark mode (OLED-leaning): deep navy `#070b14`, glass panels over a faint 42px grid, one cyan accent per component,
minimal glow (`0 0 10–18px` cyan at ≤ 35% alpha) on active/hover only. WCAG AA minimum (body 4.5:1, large text 3:1).

## Tokens (from SKILL.md — do not redefine)
bg `#070b14` · elevated `#0e1628` · border `rgba(0,229,255,.18)` · text `#dfe7f5` · muted `#8b9bb4` · primary `#00e5ff` ·
secondary `#7c4dff` · success `#2ee6a6` · warning `#ffd166` · danger `#ff4d6d`. Spacing 8px grid; radius 10/14/18; type
scale 39/31/25/20/16/13/12 with Orbitron (display) / Inter (body) / JetBrains Mono (ids, citations, status).

## Charts (ui-ux-pro-max chart domain)
| Data | Chart | Notes |
|---|---|---|
| Config comparison (ablation) | grouped horizontal bar, sorted desc | series: base = muted, fine-tuned = primary |
| Per-task profile | radar (≤ 5 axes) + data table | single fill primary 20% |
| Training curves, chunk sweep | line, markers | one line per series, legend toggles |
| Latency | horizontal bar (p50) with p95 whisker; log axis when spread > 10× | gauges only for live values |
| Knowledge graph | network (SVG, server-side layout) **plus adjacency list** (a11y) | node colour by kind, edges muted 60% |
| Answer quality | grouped bar closed-book vs RAG | success for RAG |
Every chart: transparent background, muted gridlines, tooltip on elevated bg with primary border, a "View as table" toggle.

## Interaction rules (ux domain, CRITICAL)
44px minimum touch targets; `cursor-pointer` on all interactive cards/rows; loading buttons disable + show progress;
errors inline next to the cause with a retry; skeletons (not spinners) for > 300ms loads; reserve space for async content;
sticky nav never overlaps content (pad main by nav height); keyboard order = visual order; visible focus rings; icon-only
buttons carry `aria-label`; `prefers-reduced-motion` disables transforms and the canvas.

## Motion
120/200/280ms, ease `[0.2,0.8,0.2,1]`, opacity/transform only, stagger 40ms, one motion per interaction, max one loop on screen.

## Anti-patterns
Light-mode default; emoji as icons; purple→pink gradients; hover scale that shifts layout; marketing verbs; hidden
disclaimer; charts without table alternative; more than one saturated accent per component.
