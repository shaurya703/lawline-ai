import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, BookOpen, Command, FileSearch, Gavel, LayoutDashboard, Microscope, Network, PenLine, Scale, ScrollText, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { group: "LawLine", items: [{ to: "/app", label: "Command Center", icon: LayoutDashboard, end: true }, { to: "/app/counsel", label: "Counsel", icon: Scale }] },
  { group: "Investigate", items: [{ to: "/app/lab", label: "Retrieval Lab", icon: Microscope }, { to: "/app/graph", label: "Knowledge Graph", icon: Network }, { to: "/app/provisions", label: "Provision Explorer", icon: ScrollText }] },
  { group: "Work", items: [{ to: "/app/analyze", label: "Document Analyzer", icon: FileSearch }, { to: "/app/draft", label: "Drafting Studio", icon: PenLine }] },
  { group: "Evidence", items: [{ to: "/app/analytics", label: "Analytics", icon: Activity }, { to: "/app/methodology", label: "Methodology", icon: BookOpen }] },
];
const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate(); const [q, setQ] = useState("");
  const items = NAV.flatMap(g => g.items).filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (!open) setQ(""); }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 p-6 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-label="Command palette">
          <motion.div className="w-full max-w-xl rounded-[14px] border border-[var(--border)] bg-bg-elev shadow-[0_20px_60px_rgba(0,0,0,.5)]" initial={{ y: -8, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: .2, ease: EASE }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
              <Search className="h-4 w-4 text-muted" aria-hidden />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Jump to a page or ask Counsel…" aria-label="Command"
                className="h-12 w-full bg-transparent text-fg outline-none placeholder:text-muted"
                onKeyDown={e => { if (e.key === "Enter") { if (items[0] && q && items.length < NAV.flatMap(g => g.items).length) nav(items[0].to); else if (q) nav(`/app/counsel?q=${encodeURIComponent(q)}`); onClose(); } if (e.key === "Escape") onClose(); }} />
              <button onClick={onClose} aria-label="Close" className="cursor-pointer p-2 text-muted hover:text-fg"><X className="h-4 w-4" /></button>
            </div>
            <ul className="max-h-80 overflow-auto p-2">
              {items.map(i => (
                <li key={i.to}><button onClick={() => { nav(i.to); onClose(); }} className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-fg hover:bg-primary/10"><i.icon className="h-4 w-4 text-primary" aria-hidden />{i.label}</button></li>
              ))}
              {q && <li><button onClick={() => { nav(`/app/counsel?q=${encodeURIComponent(q)}`); onClose(); }} className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-fg hover:bg-primary/10"><Gavel className="h-4 w-4 text-success" aria-hidden />Ask Counsel: “{q}”</button></li>}
            </ul>
            <div className="border-t border-[var(--border)] px-4 py-2 font-mono text-[11px] text-muted">↵ open · esc close · ⌘K toggle</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Shell() {
  const loc = useLocation(); const [palette, setPalette] = useState(false); const [open, setOpen] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const title = NAV.flatMap(g => g.items).find(i => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to)))?.label ?? "LawLine";
  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r border-[var(--border)] bg-[rgba(8,13,26,.92)] backdrop-blur-xl transition-transform duration-200 md:static md:translate-x-0", open && "translate-x-0")} aria-label="Primary">
        <div className="flex h-16 items-center gap-2 px-5"><Scale className="h-5 w-5 text-primary" aria-hidden /><span className="font-display text-sm tracking-[0.14em] text-primary [text-shadow:0_0_14px_rgba(0,229,255,.5)]">LAWLINE AI</span></div>
        <nav className="space-y-5 px-3 pb-6">
          {NAV.map(g => (
            <div key={g.group}>
              <div className="px-2 pb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{g.group}</div>
              {g.items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cn("relative flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-200", isActive ? "text-fg" : "text-muted hover:bg-white/[.04] hover:text-fg")}>
                  {({ isActive }) => (<>{isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] border border-primary/30 bg-primary/10" transition={{ duration: .2, ease: EASE }} />}<i.icon className={cn("relative h-4 w-4", isActive && "text-primary")} aria-hidden /><span className="relative">{i.label}</span></>)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-[var(--border)] p-4 font-mono text-[11px] text-muted">Legal information, not legal advice.</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border)] bg-bg/80 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <button className="cursor-pointer rounded-[10px] border border-[var(--border)] p-2 md:hidden" aria-label="Open navigation" onClick={() => setOpen(o => !o)}><Command className="h-4 w-4" /></button>
            <h1 className="font-display text-base tracking-[0.08em]">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 font-mono text-[11px] text-muted sm:flex"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />RETRIEVAL CORES ONLINE</span>
            <button onClick={() => setPalette(true)} className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--border)] px-3 font-mono text-[11px] text-muted transition-colors hover:border-primary hover:text-fg" aria-label="Open command palette"><Search className="h-3.5 w-3.5" />⌘K</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .22, ease: EASE }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} />
      {open && <button className="fixed inset-0 z-30 bg-bg/60 md:hidden" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    </div>
  );
}
