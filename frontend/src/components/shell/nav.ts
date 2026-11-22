import { Activity, ArrowLeftRight, BookMarked, BookOpen, CalendarClock, Columns3, FileSearch, FileText, FolderOpen, Gavel, GraduationCap, LayoutGrid, LineChart, ListTree, MessageSquareText, Microscope, Network, PenLine, Scale, ScrollText, Settings, ShieldCheck, Siren, Swords, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; desc: string };
export type NavGroup = { id: string; group: string; icon: LucideIcon; blurb: string; items: NavItem[] };

export const HOME: NavItem = { to: "/app", label: "Overview", icon: LayoutGrid, end: true, desc: "Ask a question, see the corpus and benchmark at a glance, open any module" };

/** Every module, grouped by the job it does. The sidebar, the overview directory, the landing page and the command palette all read this list. */
export const NAV: NavGroup[] = [
  { id: "ask", group: "Ask & learn", icon: MessageSquareText, blurb: "Questions answered from retrieved law", items: [
    { to: "/app/counsel", label: "Counsel", icon: Scale, desc: "Cited answers to legal questions, with follow-ups and voice" },
    { to: "/app/rights", label: "Rights Guides", icon: ShieldCheck, desc: "Step-by-step guides for arrest, FIR, cheque bounce and more" },
    { to: "/app/offence", label: "Offence Lookup", icon: Siren, desc: "Punishment, bailability and ingredients of an offence" },
    { to: "/app/glossary", label: "Glossary", icon: BookMarked, desc: "Legal terms explained and linked to provisions" },
    { to: "/app/trainer", label: "Bar Exam Trainer", icon: GraduationCap, desc: "AIBE questions with grounded explanations" }] },
  { id: "statutes", group: "Statutes", icon: ScrollText, blurb: "Read, bridge and compare provisions", items: [
    { to: "/app/provisions", label: "Provision Explorer", icon: ScrollText, desc: "Browse 1,000+ Acts section by section" },
    { to: "/app/transition", label: "IPC → BNS Bridge", icon: ArrowLeftRight, desc: "Old code to 2023 code, with what changed" },
    { to: "/app/compare", label: "Compare Provisions", icon: Columns3, desc: "Two or three sections side by side" },
    { to: "/app/graph", label: "Knowledge Graph", icon: Network, desc: "Acts, sections, cases and concepts as a network" },
    { to: "/app/limitation", label: "Limitation Clock", icon: CalendarClock, desc: "Filing deadlines computed from a date" }] },
  { id: "documents", group: "Documents", icon: FileText, blurb: "Work on a document or a set of facts", items: [
    { to: "/app/analyze", label: "Document Analyzer", icon: FileSearch, desc: "Find the law a notice, FIR or contract relies on" },
    { to: "/app/summarize", label: "Judgment Summarizer", icon: Gavel, desc: "Facts, issues, holding and ratio of a judgment" },
    { to: "/app/timeline", label: "Case Timeline", icon: ListTree, desc: "Turn a narrative into a dated chronology" },
    { to: "/app/arena", label: "Argument Arena", icon: Swords, desc: "Both sides argued and scored for strength" },
    { to: "/app/verify", label: "Citation Verifier", icon: ShieldCheck, desc: "Check every section reference against the corpus" },
    { to: "/app/draft", label: "Drafting Studio", icon: PenLine, desc: "First drafts of notices, complaints and memos" }] },
  { id: "evaluation", group: "Evaluation", icon: LineChart, blurb: "How the system is built and how it scores", items: [
    { to: "/app/lab", label: "Retrieval Lab", icon: Microscope, desc: "Trace one query through every retriever" },
    { to: "/app/analytics", label: "Analytics", icon: Activity, desc: "Benchmarks, ablations and training curves" },
    { to: "/app/methodology", label: "Methodology", icon: BookOpen, desc: "Architecture, training and evaluation" }] },
];

export const WORKSPACE: NavItem[] = [
  { to: "/app/files", label: "Case Files", icon: FolderOpen, desc: "Everything you pinned, with notes and export" },
  { to: "/app/settings", label: "Settings", icon: Settings, desc: "Appearance, Counsel defaults, voice and connection" },
];

export const MODULES = NAV.flatMap(g => g.items);
export const ALL: NavItem[] = [HOME, ...MODULES, ...WORKSPACE];
export const groupOf = (path: string) => NAV.find(g => g.items.some(i => path === i.to || path.startsWith(i.to + "/")));
export const itemOf = (path: string) => ALL.find(i => (i.end ? path === i.to : path === i.to || path.startsWith(i.to + "/")));
