import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Check, Copy, X } from "lucide-react";
import { useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pin, toasts, type FileKind } from "@/lib/store";
import { copy as copyText } from "@/lib/export";
import Tilt from "@/components/fx/Tilt";
import Counter from "@/components/fx/Counter";
const EASE = [0.2, 0.8, 0.2, 1] as const;

function track(e: PointerEvent<HTMLElement>) { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--cx", `${((e.clientX - r.left) / r.width) * 100}%`); e.currentTarget.style.setProperty("--cy", `${((e.clientY - r.top) / r.height) * 100}%`); }

export function Card({ children, className, delay = 0, glow = true, as: Tag = "section" }: { children: ReactNode; className?: string; delay?: number; glow?: boolean; as?: "section" | "div" | "article" }) {
  const M = Tag === "div" ? motion.div : Tag === "article" ? motion.article : motion.section;
  return <M onPointerMove={track} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .32, ease: EASE, delay }} className={cn("glass relative rounded-[16px] p-6", glow && "glow-border spot-card", className)}>{children}</M>;
}
export function Kpi({ label, value, sub, delay = 0, decimals = 0, suffix = "", prefix = "", color, icon }: { label: string; value: number | string; sub?: ReactNode; delay?: number; decimals?: number; suffix?: string; prefix?: string; color?: string; icon?: ReactNode }) {
  return (
    <Tilt className="group" max={6}>
      <Card delay={delay} className="h-full p-5">
        <div className="flex items-start justify-between"><div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{label}</div>{icon && <span className="text-primary/70">{icon}</span>}</div>
        <div className="mt-2 font-display text-[26px] tabular-nums" style={{ color: color ?? "var(--primary)", textShadow: `0 0 22px ${color ?? "rgb(var(--accent-rgb) / .45)"}` }}>{typeof value === "number" ? <Counter value={value} decimals={decimals} suffix={suffix} prefix={prefix} /> : value}</div>
        {sub && <div className="mt-1 font-mono text-[11px] text-muted">{sub}</div>}
      </Card>
    </Tilt>
  );
}
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("font-mono text-[11px] uppercase tracking-[0.14em] text-primary/80", className)}>{children}</div>; }
export function H2({ children, className }: { children: ReactNode; className?: string }) { return <h2 className={cn("font-display text-xl tracking-[0.04em] text-white", className)}>{children}</h2>; }
export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
      <div><Eyebrow>{eyebrow}</Eyebrow><h2 className="mt-1 font-display text-[26px] tracking-[0.04em] text-white md:text-3xl">{title}</h2>{desc && <p className="mt-1 max-w-2xl text-sm text-muted">{desc}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.div>
  );
}
export function Badge({ kind, children, className }: { kind?: string; children: ReactNode; className?: string }) {
  const c = kind === "faiss" ? "border-primary text-primary" : kind === "bm25" ? "border-warning text-warning" : kind === "kg" ? "border-secondary text-[#b39dff]" : kind === "kg-slot" || kind === "used" || kind === "ok" ? "border-success text-success" : kind === "warn" ? "border-warning text-warning" : kind === "err" ? "border-danger text-danger" : "border-white/15 text-muted";
  return <span className={cn("mr-1 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", c, className)}>{children}</span>;
}
export function Button({ children, className, variant = "default", size = "md", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  return <button {...p} className={cn("shine inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition-[border-color,box-shadow,background-color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[.98] disabled:pointer-events-none disabled:opacity-45",
    size === "sm" ? "h-9 px-3 text-xs" : size === "lg" ? "h-12 px-6" : "h-11",
    variant === "primary" ? "border-primary/50 bg-[linear-gradient(135deg,rgb(var(--accent-rgb)/.28),rgba(124,77,255,.28))] text-white hover:border-primary hover:shadow-[0_0_24px_rgb(var(--accent-rgb)/.45)]"
      : variant === "ghost" ? "border-transparent text-muted hover:bg-white/[.05] hover:text-fg"
      : variant === "danger" ? "border-danger/40 bg-danger/10 text-fg hover:border-danger"
      : "border-white/10 bg-white/[.03] text-fg hover:border-primary/60 hover:shadow-[0_0_18px_rgb(var(--accent-rgb)/.25)]", className)}>{children}</button>;
}
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cn("h-11 w-full rounded-[10px] border border-white/10 bg-black/30 px-3 text-fg outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/.15)]", p.className)} />; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cn("w-full rounded-[10px] border border-white/10 bg-black/30 p-3 text-fg outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/.15)]", p.className)} />; }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cn("h-11 w-full cursor-pointer rounded-[10px] border border-white/10 bg-bg-elev px-3 text-fg outline-none focus:border-primary", p.className)} />; }
export function Label({ children, className }: { children: ReactNode; className?: string }) { return <label className={cn("block text-xs text-muted [&>*]:mt-1", className)}>{children}</label>; }
export function Skeleton({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded-[10px] bg-white/[.06]", className)} aria-hidden />; }
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) { return <div role="alert" className="rounded-[14px] border border-danger/50 bg-danger/10 p-4 text-sm">Request failed: <span className="font-mono">{error}</span> {retry && <Button size="sm" className="ml-3" onClick={retry}>Retry</Button>}</div>; }
export function Empty({ icon, title, desc, children }: { icon?: ReactNode; title: string; desc?: string; children?: ReactNode }) {
  return <div className="grid-dots flex flex-col items-center justify-center rounded-[16px] border border-dashed border-white/10 p-10 text-center">{icon && <div className="mb-3 text-primary/70">{icon}</div>}<div className="font-display text-sm tracking-wider text-white">{title}</div>{desc && <p className="mt-1 max-w-md text-sm text-muted">{desc}</p>}{children && <div className="mt-4">{children}</div>}</div>;
}
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-[12px] border border-white/10 bg-black/25 p-1", className)}>
      {items.map(i => <button key={i.id} role="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)} className={cn("relative flex h-9 cursor-pointer items-center gap-2 rounded-[9px] px-3 text-xs font-semibold transition-colors", value === i.id ? "text-white" : "text-muted hover:text-fg")}>
        {value === i.id && <motion.span layoutId={`tab-${items.map(x => x.id).join("")}`} className="absolute inset-0 rounded-[9px] border border-primary/40 bg-primary/15" transition={{ duration: .2, ease: EASE }} />}
        <span className="relative flex items-center gap-2">{i.icon}{i.label}</span></button>)}
    </div>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-sm"><span>{label}</span>
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors", checked ? "border-primary/60 bg-primary/30" : "border-white/15 bg-white/10")}><motion.span layout className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow" style={{ left: checked ? 22 : 2 }} transition={{ duration: .18 }} /></button></label>;
}
export function Drawer({ open, onClose, title, children, side = "right", width = 420 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; side?: "right" | "left"; width?: number }) {
  return (
    <AnimatePresence>{open && (<>
      <motion.div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside role="dialog" aria-modal className={cn("glass fixed inset-y-0 z-50 flex flex-col overflow-hidden", side === "right" ? "right-0 rounded-l-[18px]" : "left-0 rounded-r-[18px]")} style={{ width: `min(${width}px, 100vw)` }} initial={{ x: side === "right" ? 40 : -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: side === "right" ? 40 : -40, opacity: 0 }} transition={{ duration: .26, ease: EASE }}>
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5"><div className="font-display text-sm tracking-wider text-white">{title}</div><button onClick={onClose} aria-label="Close" className="cursor-pointer rounded-[8px] p-2 text-muted hover:bg-white/5 hover:text-fg"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </motion.aside></>)}
    </AnimatePresence>
  );
}
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>{open && (
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div role="dialog" aria-modal className={cn("glass max-h-[85vh] w-full overflow-auto rounded-[18px] p-6", wide ? "max-w-4xl" : "max-w-xl")} initial={{ scale: .96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .96, opacity: 0 }} transition={{ duration: .22, ease: EASE }} onClick={e => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between"><div className="font-display text-sm tracking-wider text-white">{title}</div><button onClick={onClose} aria-label="Close" className="cursor-pointer rounded-[8px] p-2 text-muted hover:bg-white/5 hover:text-fg"><X className="h-4 w-4" /></button></div>
          {children}
        </motion.div>
      </motion.div>)}
    </AnimatePresence>
  );
}
export function Toasts() {
  const list = toasts.use(s => s.list);
  return <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2"><AnimatePresence>{list.map(t => <motion.div key={t.id} initial={{ opacity: 0, y: 10, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} className={cn("glass flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-sm", t.kind === "err" ? "border-danger/50" : t.kind === "warn" ? "border-warning/50" : "border-success/40")}><Check className={cn("h-4 w-4", t.kind === "err" ? "text-danger" : t.kind === "warn" ? "text-warning" : "text-success")} />{t.text}</motion.div>)}</AnimatePresence></div>;
}
export function PinButton({ kind, title, body, meta, size = "sm" }: { kind: FileKind; title: string; body: string; meta?: Record<string, unknown>; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  return <Button size={size} variant="ghost" onClick={() => { pin({ kind, title, body, meta }); setDone(true); setTimeout(() => setDone(false), 1500); }} aria-label="Pin to case files"><Bookmark className={cn("h-4 w-4", done && "fill-primary text-primary")} />{size === "md" && (done ? "Pinned" : "Pin")}</Button>;
}
export function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) { return <Button size={size} variant="ghost" onClick={() => copyText(text)} aria-label="Copy"><Copy className="h-4 w-4" />{size === "md" && "Copy"}</Button>; }
export function Passages({ items, usedSet, compact }: { items: { rank: number; citation: string; text: string; sources: string[]; score: number; used?: boolean; doc_id?: string }[]; usedSet?: Set<number>; compact?: boolean }) {
  return (<motion.ul initial="h" animate="s" variants={{ s: { transition: { staggerChildren: .04 } } }} className="grid gap-2">
    {items.map(p => { const used = p.used ?? usedSet?.has(p.rank); return (
      <motion.li key={p.rank} variants={{ h: { opacity: 0, y: 6 }, s: { opacity: 1, y: 0 } }} className={cn("rounded-[10px] border border-white/10 bg-white/[.02] p-3 text-[13px] transition-colors hover:border-white/20", used ? "border-l-[3px] border-l-success" : "border-l-[3px] border-l-primary")}>
        <div className="flex flex-wrap items-center gap-1"><Badge kind={used ? "used" : undefined}>[{p.rank}]</Badge><strong className="text-white">{p.citation}</strong><span className="ml-auto font-mono text-[11px] text-muted">{p.sources.map(s => <Badge key={s} kind={s}>{s}</Badge>)}{p.score.toFixed(2)}</span></div>
        <p className="mt-2 text-muted">{p.text.slice(0, compact ? 220 : 480)}{p.text.length > (compact ? 220 : 480) ? "…" : ""}</p>
      </motion.li>); })}
  </motion.ul>);
}
export function Stagger({ children, className }: { children: ReactNode; className?: string }) { return <motion.div initial="h" animate="s" variants={{ s: { transition: { staggerChildren: .06 } } }} className={className}>{children}</motion.div>; }
export const item = { h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0, transition: { duration: .3, ease: EASE } } };
