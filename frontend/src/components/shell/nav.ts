import { Activity, ArrowLeftRight, BookMarked, BookOpen, Brain, CalendarClock, Columns3, FileSearch, FolderKanban, Gavel, GraduationCap, LayoutDashboard, ListTree, Microscope, Network, PenLine, Scale, ScrollText, Settings, ShieldCheck, Siren, Swords, type LucideIcon } from "lucide-react";
export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; desc: string; hue: string; hot?: boolean };
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Home", items: [
    { to: "/app", label: "Command Center", icon: LayoutDashboard, end: true, desc: "Live system view, corpus constellation and launchers", hue: "#00e5ff" }] },
  { group: "Ask", items: [
    { to: "/app/counsel", label: "Counsel", icon: Scale, desc: "Conversational, cited legal research with voice", hue: "#00e5ff", hot: true },
    { to: "/app/rights", label: "Rights Guides", icon: ShieldCheck, desc: "Step-by-step playbooks: arrest, FIR, cheque bounce…", hue: "#2ee6a6" },
    { to: "/app/offence", label: "Offence Lookup", icon: Siren, desc: "Punishment, bailability and ingredients for any offence", hue: "#ff4d6d" },
    { to: "/app/glossary", label: "Glossary", icon: BookMarked, desc: "Legal terms decoded, linked to provisions", hue: "#ffd166" }] },
  { group: "Analyze", items: [
    { to: "/app/analyze", label: "Document Analyzer", icon: FileSearch, desc: "Upload a notice, FIR or contract and map its law", hue: "#7c4dff" },
    { to: "/app/summarize", label: "Judgment Summarizer", icon: Gavel, desc: "Facts, issues, holding and ratio in seconds", hue: "#7c4dff" },
    { to: "/app/timeline", label: "Case Timeline", icon: ListTree, desc: "Turn facts into an interactive chronology", hue: "#48dbfb" },
    { to: "/app/arena", label: "Argument Arena", icon: Swords, desc: "Both sides argued, strengths scored", hue: "#ff9f43", hot: true },
    { to: "/app/verify", label: "Citation Verifier", icon: ShieldCheck, desc: "Check every section reference against the corpus", hue: "#2ee6a6" }] },
  { group: "Law", items: [
    { to: "/app/provisions", label: "Provision Explorer", icon: ScrollText, desc: "1,000+ Acts, section by section", hue: "#00e5ff" },
    { to: "/app/transition", label: "IPC → BNS Bridge", icon: ArrowLeftRight, desc: "Old code to new code, with what changed", hue: "#ffd166", hot: true },
    { to: "/app/compare", label: "Compare Provisions", icon: Columns3, desc: "Side-by-side matrix for two or three sections", hue: "#b39dff" },
    { to: "/app/graph", label: "Knowledge Graph", icon: Network, desc: "46,000 nodes of law in 3D", hue: "#7c4dff" },
    { to: "/app/limitation", label: "Limitation Clock", icon: CalendarClock, desc: "Deadlines computed from your dates", hue: "#ff4d6d" }] },
  { group: "Create & Learn", items: [
    { to: "/app/draft", label: "Drafting Studio", icon: PenLine, desc: "Notices, complaints and memos with citations", hue: "#2ee6a6" },
    { to: "/app/trainer", label: "Bar Exam Trainer", icon: GraduationCap, desc: "Real AIBE questions with grounded explanations", hue: "#ffd166" }] },
  { group: "Evidence", items: [
    { to: "/app/lab", label: "Retrieval Lab", icon: Microscope, desc: "Watch the retrievers converge on a provision", hue: "#48dbfb" },
    { to: "/app/analytics", label: "Analytics", icon: Activity, desc: "Benchmarks, ablations and training curves", hue: "#00e5ff" },
    { to: "/app/methodology", label: "Methodology", icon: BookOpen, desc: "How the system is built and evaluated", hue: "#8b9bb4" }] },
  { group: "Workspace", items: [
    { to: "/app/files", label: "Case Files", icon: FolderKanban, desc: "Everything you pinned, with notes and export", hue: "#ffd166" },
    { to: "/app/settings", label: "Settings", icon: Settings, desc: "Accent, motion, voice, defaults", hue: "#8b9bb4" }] },
];
export const ALL = NAV.flatMap(g => g.items);
export const BrainIcon = Brain;
