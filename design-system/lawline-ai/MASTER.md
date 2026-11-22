# LawLine AI — Design System (Master)

The canonical tokens, kit and rules are in `.claude/skills/frontend-design/SKILL.md`; this file records the decisions behind them.

## Direction
A legal research tool should look like the material it handles. The interface borrows from law reports: a paper-coloured page,
ink text, hairline rules, a serif for source text and an oxblood accent taken from law-book bindings. It replaced a dark
"command centre" theme (navy, cyan glow, glass panels, Orbitron) that was hard to scan and read as generic.

## Information architecture
Nineteen modules in four groups by the job they do, plus Overview, Case Files and Settings.

| Group | Modules |
|---|---|
| Ask & learn | Counsel, Rights Guides, Offence Lookup, Glossary, Bar Exam Trainer |
| Statutes | Provision Explorer, IPC → BNS Bridge, Compare Provisions, Knowledge Graph, Limitation Clock |
| Documents | Document Analyzer, Judgment Summarizer, Case Timeline, Argument Arena, Citation Verifier, Drafting Studio |
| Evaluation | Retrieval Lab, Analytics, Methodology |

The sidebar shows the four groups and opens the one that holds the current page, so at most six module links are visible at a time.
`⌘K` searches every module and accepts direct commands ("section 302 IPC", "define bail").

## Decisions
- **One light theme.** It projects well and prints well; a second theme would double the chart and graph work.
- **Ink primary buttons, accent for meaning.** The accent marks where you are and what is cited, so it stays scarce.
- **Sans for interface, serif for source text.** A reader can tell at a glance what the law says from what the system says.
- **Figures in strips, not cards.** A row of numbers separated by hairlines reads as one statement; six cards read as six.
- **Numbers before gauges.** Rings and dials became a figure, a five-step meter or a bar.
- **One page shape per kind of task.** Paste-and-run tools share the Workbench layout; lookups share query-then-results.
- **Charts keep their own palette.** Categorical colours are validated for colour-vision separation and each retriever keeps one colour throughout.
- **Self-hosted fonts** (Newsreader, IBM Plex Sans, IBM Plex Mono) so the app renders the same offline.
