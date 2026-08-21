import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, BookMarked, ChevronsLeft, ChevronsRight, FolderKanban, Gavel, Keyboard, Menu, Scale, ScrollText, Search, Siren, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { applySettings, files, settings } from "@/lib/store";
import { NAV, ALL } from "./nav";
import { Drawer, Modal, Toasts } from "./ui";
import Aurora from "@/components/fx/Aurora";
import CaseFilesPanel from "@/pages/CaseFiles";
const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Parse free text into a smart action. */
function smart(q: string, nav: (to: string) => void) {
  const s = q.trim(); const sec = /(?:section|sec\.?|s\.?|article|art\.?)\s*(\d+[A-Za-z]?)\s*(?:of\s+)?(?:the\s+)?(ipc|bns|bnss|crpc|iea|bsa|constitution)?/i.exec(s);
  const acts: Record<string, string> = { ipc: "Indian Penal Code, 1860", bns: "Bharatiya Nyaya Sanhita, 2023", bnss: "Bharatiya Nagarik Suraksha Sanhita, 2023", crpc: "Code of Criminal Procedure Act, 1973", iea: "Indian Evidence Act, 1872", bsa: "Bharatiya Sakshya Adhiniyam, 2023", constitution: "Constitution of India, 1949" };
  const out: { label: string; to: string; icon: typeof Scale }[] = [];
  if (sec) {
    const a = (sec[2] || (/^art/i.test(sec[0]) ? "constitution" : "ipc")).toLowerCase();
    out.push({ label: `Open ${/^art/i.test(sec[0]) ? "Article" : "Section"} ${sec[1]} of ${acts[a]}`, to: `/app/provisions?act=${encodeURIComponent(acts[a])}&sec=${sec[1]}`, icon: ScrollText });
    if (["ipc", "crpc", "iea", "bns", "bnss", "bsa"].includes(a)) out.push({ label: `Bridge ${a.toUpperCase()} ${sec[1]} to the 2023 code`, to: `/app/transition?act=${a.toUpperCase()}&section=${sec[1]}`, icon: ArrowLeftRight });
  }
  if (/^(define|what is|meaning of)\s+/i.test(s)) out.push({ label: `Glossary: ${s.replace(/^(define|what is|meaning of)\s+/i, "")}`, to: `/app/glossary?q=${encodeURIComponent(s.replace(/^(define|what is|meaning of)\s+/i, ""))}`, icon: BookMarked });
  if (/punishment|offence|offense|jail|bailable/i.test(s)) out.push({ label: `Offence lookup: ${s}`, to: `/app/offence?q=${encodeURIComponent(s)}`, icon: Siren });
  out.push({ label: `Ask Counsel: “${s}”`, to: `/app/counsel?q=${encodeURIComponent(s)}`, icon: Gavel });
  return out.map(o => ({ ...o, run: () => nav(o.to) }));
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate(); const [q, setQ] = useState(""); const [i, setI] = useState(0);
  const pages = ALL.filter(p => p.label.toLowerCase().includes(q.toLowerCase()) || p.desc.toLowerCase().includes(q.toLowerCase()));
  const actions = q.trim() ? smart(q, nav) : [];
  const rows = useMemo(() => [...actions.map(a => ({ key: a.to + a.label, label: a.label, sub: "action", icon: a.icon, run: a.run })), ...pages.map(p => ({ key: p.to, label: p.label, sub: p.desc, icon: p.icon, run: () => nav(p.to) }))], [actions, pages, nav]);
  useEffect(() => { if (!open) { setQ(""); setI(0); } }, [open]);
  useEffect(() => setI(0), [q]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-label="Command palette">
          <motion.div className="glass w-full max-w-2xl overflow-hidden rounded-[16px]" initial={{ y: -8, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: .2, ease: EASE }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4">
              <Search className="h-4 w-4 text-primary" aria-hidden />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Jump anywhere, or type: “section 302 IPC”, “define bail”, “punishment for theft”…" aria-label="Command"
                className="h-13 w-full bg-transparent py-4 text-fg outline-none placeholder:text-muted"
                onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(rows.length - 1, x + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); } if (e.key === "Enter" && rows[i]) { rows[i].run(); onClose(); } if (e.key === "Escape") onClose(); }} />
              <button onClick={onClose} aria-label="Close" className="cursor-pointer p-2 text-muted hover:text-fg"><X className="h-4 w-4" /></button>
            </div>
            <ul className="max-h-[50vh] overflow-auto p-2">
              {rows.map((r, k) => (
                <li key={r.key}><button onMouseEnter={() => setI(k)} onClick={() => { r.run(); onClose(); }} className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm transition-colors", k === i ? "bg-primary/15 text-white" : "text-fg hover:bg-white/5")}>
                  <r.icon className={cn("h-4 w-4 shrink-0", r.sub === "action" ? "text-success" : "text-primary")} aria-hidden /><span className="flex-1 truncate">{r.label}</span><span className="truncate font-mono text-[10px] uppercase text-muted">{r.sub === "action" ? "action" : r.sub.slice(0, 42)}</span></button></li>
              ))}
              {!rows.length && <li className="p-4 text-sm text-muted">Nothing matches.</li>}
            </ul>
            <div className="flex flex-wrap gap-4 border-t border-white/10 px-4 py-2 font-mono text-[11px] text-muted"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span><span className="ml-auto">⌘K toggle · ? shortcuts</span></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Clock() { const [t, setT] = useState(new Date()); useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []); return <span className="font-mono text-[11px] tabular-nums text-muted">{t.toLocaleTimeString("en-IN", { hour12: false })} IST</span>; }
function Status() {
  const [s, setS] = useState<{ ok: boolean; ms: number } | null>(null); const [hist, setHist] = useState<number[]>([]);
  useEffect(() => { let live = true; const tick = async () => { const r = await api.health(); if (!live) return; setS(r); setHist(h => [...h.slice(-19), r.ok ? r.ms : 0]); }; void tick(); const id = setInterval(tick, 20000); return () => { live = false; clearInterval(id); }; }, []);
  const max = Math.max(100, ...hist);
  return (
    <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 sm:flex" title={s ? `API ${s.ok ? "online" : "unreachable"} · ${Math.round(s.ms)} ms` : "checking"}>
      <span className={cn("orb", s && !s.ok && "down", s?.ok && "ring-pulse")} />
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{s ? (s.ok ? `cores online · ${Math.round(s.ms)}ms` : "api offline") : "linking…"}</span>
      <svg width="48" height="14" aria-hidden className="ml-1">{hist.map((v, i) => <rect key={i} x={i * 2.4} y={14 - (v / max) * 14} width="1.6" height={(v / max) * 14} fill={v ? "var(--primary)" : "var(--danger)"} opacity=".8" />)}</svg>
    </div>
  );
}

const SHORTCUTS = [["⌘ K", "Command palette"], ["?", "This help"], ["g c", "Counsel"], ["g h", "Command Center"], ["g f", "Case Files"], ["g t", "IPC → BNS Bridge"], ["g a", "Argument Arena"], ["esc", "Close panels"], ["⌘ ↵", "Send / run"], ["m", "Toggle microphone (Counsel)"]];

export default function Shell() {
  const loc = useLocation(); const nav = useNavigate(); const [palette, setPalette] = useState(false); const [open, setOpen] = useState(false); const [filesOpen, setFilesOpen] = useState(false); const [help, setHelp] = useState(false);
  const st = settings.use(); const count = files.use(s => s.items.length); const rail = st.sidebar === "rail";
  useEffect(() => { applySettings(st); }, [st]);
  useEffect(() => {
    let g = false;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); return; }
      if (typing) return;
      if (e.key === "?") { setHelp(h => !h); return; }
      if (e.key === "Escape") { setFilesOpen(false); setHelp(false); return; }
      if (e.key === "g") { g = true; setTimeout(() => { g = false; }, 900); return; }
      if (g) { const m: Record<string, string> = { c: "/app/counsel", h: "/app", f: "/app/files", t: "/app/transition", a: "/app/arena", p: "/app/provisions", l: "/app/lab", s: "/app/settings" }; if (m[e.key]) nav(m[e.key]); g = false; }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [nav]);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const cur = ALL.find(i => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to)));
  return (
    <div className="relative flex min-h-screen text-fg">
      <Aurora />
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex -translate-x-full flex-col border-r border-white/[.06] bg-[rgba(7,11,20,.85)] backdrop-blur-2xl transition-[transform,width] duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0", rail ? "w-[72px]" : "w-[248px]", open && "translate-x-0")} aria-label="Primary">
        <div className={cn("flex h-16 items-center gap-2 px-4", rail && "justify-center px-0")}>
          <div className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-primary/40 bg-primary/10"><Scale className="h-5 w-5 text-primary" aria-hidden /><span className="absolute -inset-1 -z-10 rounded-[12px] bg-primary/20 blur-md" /></div>
          {!rail && <span className="holo font-display text-[13px] tracking-[0.16em]">LAWLINE AI</span>}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 [scrollbar-width:none]">
          {NAV.map(g => (
            <div key={g.group}>
              {!rail && <div className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted/80">{g.group}</div>}
              {g.items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.end} title={rail ? i.label : undefined} className={({ isActive }) => cn("group relative flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[13px] transition-colors duration-200", rail && "justify-center px-0", isActive ? "text-white" : "text-muted hover:bg-white/[.04] hover:text-fg")}>
                  {({ isActive }) => (<>
                    {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] border border-primary/30 bg-[linear-gradient(90deg,rgb(var(--accent-rgb)/.16),transparent)]" transition={{ duration: .25, ease: EASE }} />}
                    {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary shadow-[0_0_10px_var(--primary)]" />}
                    <i.icon className={cn("relative h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive && "text-primary")} style={!isActive ? undefined : { color: i.hue }} aria-hidden />
                    {!rail && <span className="relative flex-1 truncate">{i.label}</span>}
                    {!rail && i.hot && <span className="relative rounded-full border border-warning/40 px-1.5 font-mono text-[9px] uppercase text-warning">new</span>}
                  </>)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/[.06] p-3">
          <button onClick={() => settings.set({ sidebar: rail ? "expanded" : "rail" })} className="hidden w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] py-2 font-mono text-[10px] uppercase tracking-wider text-muted hover:bg-white/5 hover:text-fg md:flex" aria-label="Toggle sidebar width">{rail ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />collapse</>}</button>
          {!rail && <div className="mt-1 px-1 font-mono text-[10px] text-muted/70">Legal information, not legal advice.</div>}
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[.06] bg-[rgba(7,11,20,.6)] px-4 backdrop-blur-xl md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button className="cursor-pointer rounded-[10px] border border-white/10 p-2 md:hidden" aria-label="Open navigation" onClick={() => setOpen(o => !o)}><Menu className="h-4 w-4" /></button>
            <div className="min-w-0"><h1 className="truncate font-display text-[15px] tracking-[0.08em] text-white">{cur?.label ?? "LawLine"}</h1>{cur && <div className="hidden truncate font-mono text-[10px] text-muted md:block">{cur.desc}</div>}</div>
          </div>
          <div className="flex items-center gap-2">
            <Status /><span className="hidden lg:inline"><Clock /></span>
            <button onClick={() => setHelp(true)} className="hidden h-9 cursor-pointer items-center rounded-[10px] border border-white/10 px-2.5 text-muted transition-colors hover:border-primary hover:text-fg sm:flex" aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></button>
            <button onClick={() => setFilesOpen(true)} className="relative flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-white/10 px-3 font-mono text-[11px] text-muted transition-colors hover:border-primary hover:text-fg" aria-label="Open case files"><FolderKanban className="h-4 w-4" /><span className="hidden sm:inline">files</span>{count > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-bold text-bg">{count}</span>}</button>
            <button onClick={() => setPalette(true)} className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-primary/30 bg-primary/10 px-3 font-mono text-[11px] text-fg transition-colors hover:border-primary" aria-label="Open command palette"><Search className="h-3.5 w-3.5 text-primary" />⌘K</button>
          </div>
        </header>
        <main className={cn("mx-auto w-full flex-1 px-4 py-6 md:px-8", st.density === "compact" ? "max-w-[1600px]" : "max-w-[1360px]")}>
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .24, ease: EASE }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} />
      <Drawer open={filesOpen} onClose={() => setFilesOpen(false)} title={<span className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-primary" />Case Files · {count}</span>}><CaseFilesPanel compact onNavigate={() => setFilesOpen(false)} /></Drawer>
      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <ul className="grid gap-2 sm:grid-cols-2">{SHORTCUTS.map(([k, v]) => <li key={k} className="flex items-center justify-between rounded-[10px] border border-white/10 px-3 py-2 text-sm"><span className="text-muted">{v}</span><kbd className="rounded border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-[11px] text-primary">{k}</kbd></li>)}</ul>
      </Modal>
      <Toasts />
    </div>
  );
}
