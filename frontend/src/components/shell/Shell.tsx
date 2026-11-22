import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftRight, BookMarked, ChevronRight, FolderOpen, Gavel, Menu, PanelLeft, ScrollText, Search, Siren, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { apiState, applySettings, files, navState, settings } from "@/lib/store";
import { ALL, HOME, NAV, WORKSPACE, groupOf, itemOf } from "./nav";
import { Drawer, IconButton, Modal, Toasts } from "@/components/ui";
import CaseFilesPanel from "@/pages/CaseFiles";

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-baseline gap-1.5 font-serif text-[20px] font-semibold tracking-[-0.01em] text-ink", className)}><span className="text-accent" aria-hidden>§</span>LawLine</span>;
}

/** Turn free text typed in the palette into direct actions ("section 302 IPC", "define bail", "punishment for theft"). */
function smart(q: string, nav: (to: string) => void) {
  const s = q.trim(); const sec = /(?:section|sec\.?|s\.?|article|art\.?)\s*(\d+[A-Za-z]?)\s*(?:of\s+)?(?:the\s+)?(ipc|bns|bnss|crpc|iea|bsa|constitution)?/i.exec(s);
  const acts: Record<string, string> = { ipc: "Indian Penal Code, 1860", bns: "Bharatiya Nyaya Sanhita, 2023", bnss: "Bharatiya Nagarik Suraksha Sanhita, 2023", crpc: "Code of Criminal Procedure Act, 1973", iea: "Indian Evidence Act, 1872", bsa: "Bharatiya Sakshya Adhiniyam, 2023", constitution: "Constitution of India, 1949" };
  const out: { label: string; to: string; icon: LucideIcon }[] = [];
  if (sec) {
    const a = (sec[2] || (/^art/i.test(sec[0]) ? "constitution" : "ipc")).toLowerCase();
    out.push({ label: `Open ${/^art/i.test(sec[0]) ? "Article" : "Section"} ${sec[1]} of ${acts[a]}`, to: `/app/provisions?act=${encodeURIComponent(acts[a])}&sec=${sec[1]}`, icon: ScrollText });
    if (["ipc", "crpc", "iea", "bns", "bnss", "bsa"].includes(a)) out.push({ label: `Bridge ${a.toUpperCase()} ${sec[1]} to its counterpart`, to: `/app/transition?act=${a.toUpperCase()}&section=${sec[1]}`, icon: ArrowLeftRight });
  }
  const def = /^(define|what is|meaning of)\s+/i;
  if (def.test(s)) out.push({ label: `Look up “${s.replace(def, "")}” in the glossary`, to: `/app/glossary?q=${encodeURIComponent(s.replace(def, ""))}`, icon: BookMarked });
  if (/punishment|offence|offense|jail|bailable/i.test(s)) out.push({ label: `Offence lookup: ${s}`, to: `/app/offence?q=${encodeURIComponent(s)}`, icon: Siren });
  out.push({ label: `Ask Counsel: “${s}”`, to: `/app/counsel?q=${encodeURIComponent(s)}`, icon: Gavel });
  return out.map(o => ({ ...o, run: () => nav(o.to) }));
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate(); const [q, setQ] = useState(""); const [i, setI] = useState(0);
  const rows = useMemo(() => {
    const pages = ALL.filter(p => (p.label + " " + p.desc).toLowerCase().includes(q.toLowerCase()));
    const actions = q.trim() ? smart(q, nav) : [];
    return [...actions.map(a => ({ key: "a:" + a.to, label: a.label, sub: "", icon: a.icon, run: a.run })), ...pages.map(p => ({ key: p.to, label: p.label, sub: p.desc, icon: p.icon, run: () => nav(p.to) }))];
  }, [q, nav]);
  useEffect(() => { if (!open) { setQ(""); setI(0); } }, [open]);
  useEffect(() => setI(0), [q]);
  if (!open) return null;
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-ink/25 p-4 pt-[12vh]" onClick={onClose} role="dialog" aria-label="Search and jump">
      <div className="anim-rise w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a module, or type “section 302 IPC”, “define bail”…" aria-label="Search and jump"
            className="h-12 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(rows.length - 1, x + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); } if (e.key === "Enter" && rows[i]) { rows[i].run(); onClose(); } if (e.key === "Escape") onClose(); }} />
          <kbd>esc</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-auto p-1.5">
          {rows.map((r, k) => (
            <li key={r.key}><button onMouseEnter={() => setI(k)} onClick={() => { r.run(); onClose(); }} className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", k === i ? "bg-sunken" : "")}>
              <r.icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /><span className="shrink-0 text-[14px] text-ink">{r.label}</span><span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{r.sub}</span></button></li>
          ))}
          {!rows.length && <li className="p-4 text-[14px] text-ink-3">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}

/** Backend reachability. Quiet when things work, explicit when they do not. */
function Status() {
  const [s, setS] = useState<{ ok: boolean; ms: number; base: string } | null>(null);
  useEffect(() => { let live = true; const tick = async () => { const r = await api.health(); if (live) setS(r); }; void tick(); const id = setInterval(tick, 20000); return () => { live = false; clearInterval(id); }; }, []);
  const where = s?.base.includes("localhost") || s?.base.includes("127.0.0.1") ? "Local API" : "API";
  return (
    <div className="hidden items-center gap-2 text-[12.5px] text-ink-3 sm:flex" title={s ? `${s.base} · ${s.ok ? `${Math.round(s.ms)} ms` : "unreachable"}` : "Checking the API"}>
      <span className={cn("h-2 w-2 rounded-full", !s ? "bg-line-strong" : s.ok ? "bg-ok" : "bg-bad")} aria-hidden />
      <span className="num">{!s ? "Connecting…" : s.ok ? `${where} · ${Math.round(s.ms)} ms` : "API offline"}</span>
    </div>
  );
}

function OfflineBanner() {
  const a = apiState.use();
  if (!a.checked || a.ok) return null;
  return (
    <div role="alert" className="border-b border-warn/25 bg-warn-soft px-4 py-2.5 text-[13px] text-ink md:px-8">
      <span className="font-semibold">The backend is not reachable.</span> Start it with <code className="font-mono text-[12px]">scripts/run_api.sh</code>, or <Link to="/app/settings" className="link">set an API address in Settings</Link>. <button onClick={() => { void api.health(); }} className="link">Retry</button>
    </div>
  );
}

const SHORTCUTS = [["⌘ K", "Search and jump"], ["?", "This list"], ["g h", "Overview"], ["g c", "Counsel"], ["g p", "Provision Explorer"], ["g t", "IPC → BNS Bridge"], ["g a", "Argument Arena"], ["g l", "Retrieval Lab"], ["g f", "Case Files"], ["g s", "Settings"], ["m", "Microphone (Counsel)"], ["1 – 4", "Answer (Bar Exam Trainer)"], ["esc", "Close a panel"]];
const GOTO: Record<string, string> = { c: "/app/counsel", h: "/app", f: "/app/files", t: "/app/transition", a: "/app/arena", p: "/app/provisions", l: "/app/lab", s: "/app/settings" };

function Sidebar({ path, onShortcuts }: { path: string; onShortcuts: () => void }) {
  const open = navState.use(s => s.open); const current = groupOf(path)?.id;
  const row = "flex h-8 items-center rounded-md px-2.5 text-[13.5px] transition-colors";
  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-5"><Link to="/" aria-label="LawLine home"><Wordmark /></Link></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Modules">
        <NavLink to={HOME.to} end className={({ isActive }) => cn(row, "gap-2.5", isActive ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-ink/[.05] hover:text-ink")}><HOME.icon className="h-4 w-4" aria-hidden />{HOME.label}</NavLink>
        <div className="mt-3 space-y-0.5">
          {NAV.map(g => { const isOpen = open[g.id] ?? g.id === current; return (
            <div key={g.id}>
              <button onClick={() => navState.set(s => ({ open: { ...s.open, [g.id]: !isOpen } }))} aria-expanded={isOpen} className={cn(row, "w-full gap-2.5 text-left", g.id === current ? "font-medium text-ink" : "text-ink-2 hover:bg-ink/[.05] hover:text-ink")}>
                <g.icon className="h-4 w-4 shrink-0" aria-hidden /><span className="flex-1">{g.group}</span>
                <ChevronRight className={cn("h-3.5 w-3.5 text-ink-3 transition-transform", isOpen && "rotate-90")} aria-hidden />
              </button>
              {isOpen && <div className="mb-2 ml-[17px] mt-0.5 border-l border-line pl-2.5">
                {g.items.map(i => <NavLink key={i.to} to={i.to} title={i.desc} className={({ isActive }) => cn(row, isActive ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-ink/[.05] hover:text-ink")}>{i.label}</NavLink>)}
              </div>}
            </div>); })}
        </div>
      </nav>
      <div className="shrink-0 border-t border-line px-3 py-3">
        {WORKSPACE.map(i => <NavLink key={i.to} to={i.to} className={({ isActive }) => cn(row, "gap-2.5", isActive ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-ink/[.05] hover:text-ink")}><i.icon className="h-4 w-4" aria-hidden />{i.label}</NavLink>)}
        <div className="mt-3 flex items-center justify-between px-2.5 text-[12px] text-ink-3"><span>Information, not legal advice.</span><button onClick={onShortcuts} className="hover:text-ink" aria-label="Keyboard shortcuts" title="Keyboard shortcuts"><kbd>?</kbd></button></div>
      </div>
    </>
  );
}

export default function Shell() {
  const loc = useLocation(); const nav = useNavigate();
  const [palette, setPalette] = useState(false); const [drawer, setDrawer] = useState(false); const [filesOpen, setFilesOpen] = useState(false); const [help, setHelp] = useState(false);
  const st = settings.use(); const count = files.use(s => s.items.length); const hidden = st.sidebar === "hidden";
  useEffect(() => { applySettings(st); }, [st]);
  useEffect(() => {
    let g = false;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null; const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || el?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") { setHelp(v => !v); return; }
      if (e.key === "g") { g = true; setTimeout(() => { g = false; }, 900); return; }
      if (g) { if (GOTO[e.key]) nav(GOTO[e.key]); g = false; }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [nav]);
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const cur = itemOf(loc.pathname); const grp = groupOf(loc.pathname);
  return (
    <div className="flex min-h-screen">
      <aside className={cn("sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface", !hidden && "md:flex")}><Sidebar path={loc.pathname} onShortcuts={() => setHelp(true)} /></aside>
      {drawer && <><div className="anim-fade fixed inset-0 z-40 bg-ink/25" onClick={() => setDrawer(false)} /><aside className="anim-fade fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-line bg-surface shadow-pop"><Sidebar path={loc.pathname} onShortcuts={() => { setDrawer(false); setHelp(true); }} /></aside></>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-line bg-canvas/90 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton label="Open navigation" className="md:hidden" onClick={() => setDrawer(true)}><Menu className="h-4 w-4" /></IconButton>
            <IconButton label={hidden ? "Show sidebar" : "Hide sidebar"} className="-ml-1.5 hidden md:inline-flex" onClick={() => settings.set({ sidebar: hidden ? "expanded" : "hidden" })}><PanelLeft className="h-4 w-4" /></IconButton>
            {hidden && <Link to="/app" className="mr-2 hidden md:block"><Wordmark className="text-[17px]" /></Link>}
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
              {grp && <><span className="hidden sm:inline">{grp.group}</span><ChevronRight className="hidden h-3.5 w-3.5 sm:inline" aria-hidden /></>}
              <span className="truncate font-medium text-ink">{cur?.label ?? "LawLine"}</span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Status />
            <button onClick={() => setPalette(true)} className="flex h-8 items-center gap-2 rounded-md border border-line-strong bg-surface pl-2.5 pr-1.5 text-[13px] text-ink-3 transition-colors hover:border-ink-3 hover:text-ink sm:w-56" aria-label="Search and jump">
              <Search className="h-3.5 w-3.5" aria-hidden /><span className="hidden flex-1 text-left sm:inline">Search or jump to…</span><kbd className="hidden sm:inline">⌘K</kbd>
            </button>
            <button onClick={() => setFilesOpen(true)} className="flex h-8 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink" aria-label={`Case files, ${count} saved`}>
              <FolderOpen className="h-3.5 w-3.5" aria-hidden /><span className="hidden lg:inline">Case file</span>{count > 0 && <span className="num rounded bg-accent-soft px-1.5 text-[12px] font-medium text-accent">{count}</span>}
            </button>
          </div>
        </header>
        <OfflineBanner />
        <main className={cn("mx-auto w-full flex-1 px-4 py-8 md:px-8", st.density === "compact" ? "max-w-[1480px]" : "max-w-[1184px]")}><Outlet /></main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} />
      <Drawer open={filesOpen} onClose={() => setFilesOpen(false)} title={`Case file · ${count} saved`}><CaseFilesPanel compact onNavigate={() => setFilesOpen(false)} /></Drawer>
      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <ul className="grid gap-x-8 sm:grid-cols-2">{SHORTCUTS.map(([k, v]) => <li key={k} className="flex items-center justify-between border-b border-line py-2 text-[14px]"><span className="text-ink-2">{v}</span><kbd>{k}</kbd></li>)}</ul>
      </Modal>
      <Toasts />
    </div>
  );
}
