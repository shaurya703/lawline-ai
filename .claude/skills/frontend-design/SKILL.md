---
name: frontend-design
description: LawLine AI design system for the React front-end in frontend/. Use whenever building or editing UI there. Defines tokens, type, the component kit, page patterns, chart rules and what to avoid.
---

# LawLine AI — Frontend Design Skill

LawLine is a legal research tool. The interface should read like a well-set law report: quiet, legible, evidentiary.
One light theme. When in doubt, remove something.

The Streamlit app (`lawline/ui/`) is separate and keeps its own theme in `lawline/ui/theme.py`.

## 1. Tokens (`frontend/src/styles/globals.css`)

Use the Tailwind classes generated from these; never write a hex value in a component.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f6f5f1` | page background |
| `surface` | `#ffffff` | cards, sidebar, inputs |
| `sunken` | `#faf9f6` | hover rows, inset areas |
| `line` / `line-strong` | `#e5e2da` / `#cdc9be` | hairlines / control borders |
| `ink` / `ink-2` / `ink-3` | `#16181d` / `#454a54` / `#6b717c` | text: primary / secondary / captions |
| `accent` (+ `-soft`, `-strong`) | oxblood `#7b1e2b` | brand mark, links, active nav item, citation markers. User-selectable in Settings. |
| `ok` `warn` `bad` `info` (+ `-soft`) | | status only, always with an icon or a word |

Primary buttons are ink, not accent. There are no gradients, glows, blurs or shadows at rest; `shadow-pop` is for overlays and the Counsel composer only.

## 2. Type

| Role | Face | Size |
|---|---|---|
| Page title | Newsreader 500 | 28px |
| Source text (statutes, judgments, quotations) | Newsreader | `.statute` 17px, `.statute-sm` 15px |
| Interface | IBM Plex Sans | 14px base; 13px dense; 15px reading |
| Identifiers, figures in tables | IBM Plex Mono | 11–12px, tabular |

The rule that carries the design: **interface text is sans, source text is serif.** Model-written prose (`.prose-ll`) is sans.
No uppercase tracked "eyebrow" labels. Sentence case everywhere.

## 3. Kit (`frontend/src/components/ui.tsx`)

- **Layout**: `Page` (one per route: title, one-sentence description, actions on the title line), `Card`, `Section` (titled card), `Workbench` (input left, result right), `H3`, `Caption`.
- **Controls**: `Field` (label above control), `Input`, `Textarea`, `Select`, `Button` (`primary` once per page), `IconButton` (label doubles as tooltip), `UploadButton`, `Chip` (examples and presets), `Toggle`, `Tabs` (underline).
- **Display**: `Tag` (toned), `Source` (retriever dot + name), `Stat` in a `StatStrip` (never a grid of metric cards), `Meter` (0–5), `Progress` (0–1), `Bullets`, `Callout`, `Skeleton`, `ErrorBox` (pass `retry`), `Empty`.
- **Overlays**: `Drawer`, `Modal`, `Toasts`.
- **Shared**: `PinButton`, `CopyButton`, `Passages`. Tables use `className="tbl"`.

## 4. Page patterns

- Paste-and-run modules (Analyzer, Summarizer, Timeline, Arena, Verifier, Drafting) all use `Workbench`: form on the left, `Empty` → `Skeleton` → result on the right.
- Lookup modules put the query in a `Card` at the top and results below.
- Every data view has loading, empty and error states. Errors offer a retry.
- A page shows one primary action. Options that are rarely changed sit quietly next to it, not in their own cards.
- Navigation lives in `components/shell/nav.ts`: four groups plus Overview, Case Files and Settings. Add a module there and it appears in the sidebar, the overview, the landing page and the command palette.

## 5. Charts (`frontend/src/lib/plotly.tsx`)

- Colours come from `C`, `PALETTE` (fixed order) and `SEQ` (one-hue ramp). The brand accent is not a chart colour.
- Identity is stable everywhere: dense/FAISS `C.primary`, BM25 `C.warning`, graph `C.secondary`, baseline `C.muted`, the LawLine system `C.fg`.
- `layout()` merges axis, legend, polar and scene overrides with the defaults. Category x-axes have no gridlines; horizontal bars pass `xaxis: { showgrid: true }, yaxis: { showgrid: false }`.
- A chart sits in a `Section` whose title says what is measured and whose description says what it shows. Offer a table view for anything a reader may want to quote.
- Text never wears a series colour.

## 6. Avoid

Dark neon dashboards, glassmorphism, animated backgrounds, 3D heroes, tilt and glow on hover, gradient text, counters that tick up,
gauges where a number will do, rainbow accents per item, "new" badges, emoji, marketing verbs, and more than one saturated colour in a component.

## 7. Accessibility

Visible focus ring on everything; `aria-label` on icon buttons; status never by colour alone; headings in order; `aria-live` on streamed answers;
reduced motion honoured through both the OS setting and Settings → Transitions. The legal disclaimer stays visible in the sidebar and the landing footer.
