import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
const EASE = [0.2, 0.8, 0.2, 1] as const;
export function Card({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: EASE, delay }} className={cn("rounded-[14px] border border-[var(--border)] bg-[var(--glass)] p-6 backdrop-blur-[10px]", className)}>{children}</motion.section>;
}
export function Kpi({ label, value, sub, delay = 0 }: { label: string; value: ReactNode; sub?: ReactNode; delay?: number }) {
  return (<Card delay={delay} className="p-5"><div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{label}</div><div className="mt-1 font-display text-2xl tabular-nums text-primary [text-shadow:0_0_18px_rgba(0,229,255,.35)]">{value}</div>{sub && <div className="mt-1 font-mono text-[11px] text-muted">{sub}</div>}</Card>);
}
export function Eyebrow({ children }: { children: ReactNode }) { return <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{children}</div>; }
export function H2({ children, className }: { children: ReactNode; className?: string }) { return <h2 className={cn("font-display text-xl tracking-[0.04em]", className)}>{children}</h2>; }
export function Badge({ kind, children }: { kind?: string; children: ReactNode }) {
  const c = kind === "faiss" ? "border-primary text-primary" : kind === "bm25" ? "border-warning text-warning" : kind === "kg" ? "border-secondary text-[#b39dff]" : kind === "kg-slot" || kind === "used" ? "border-success text-success" : "border-white/15 text-muted";
  return <span className={cn("mr-1 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", c)}>{children}</span>;
}
export function Button({ children, className, variant = "default", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  return <button {...p} className={cn("inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-45",
    variant === "primary" ? "border-primary/40 bg-gradient-to-br from-primary/20 to-secondary/20 text-fg hover:border-primary hover:shadow-[0_0_18px_rgba(0,229,255,.35)]" : variant === "ghost" ? "border-transparent text-muted hover:text-fg hover:bg-white/[.04]" : "border-[var(--border)] bg-white/[.03] text-fg hover:border-primary hover:shadow-[0_0_18px_rgba(0,229,255,.25)]", className)}>{children}</button>;
}
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cn("h-11 w-full rounded-[10px] border border-[var(--border)] bg-bg-elev px-3 text-fg outline-none transition-colors placeholder:text-muted focus:border-primary", p.className)} />; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cn("w-full rounded-[10px] border border-[var(--border)] bg-bg-elev p-3 text-fg outline-none transition-colors placeholder:text-muted focus:border-primary", p.className)} />; }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cn("h-11 w-full cursor-pointer rounded-[10px] border border-[var(--border)] bg-bg-elev px-3 text-fg outline-none focus:border-primary", p.className)} />; }
export function Skeleton({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded-[10px] bg-white/[.06]", className)} aria-hidden />; }
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) { return <div role="alert" className="rounded-[14px] border border-danger/50 bg-danger/10 p-4 text-sm">Request failed: <span className="font-mono">{error}</span> {retry && <Button className="ml-3 h-9" onClick={retry}>Retry</Button>}</div>; }
export function Passages({ items, usedSet }: { items: { rank: number; citation: string; text: string; sources: string[]; score: number; used?: boolean }[]; usedSet?: Set<number> }) {
  return (<motion.ul initial="h" animate="s" variants={{ s: { transition: { staggerChildren: .04 } } }} className="grid gap-2">
    {items.map(p => { const used = p.used ?? usedSet?.has(p.rank); return (
      <motion.li key={p.rank} variants={{ h: { opacity: 0, y: 6 }, s: { opacity: 1, y: 0 } }} className={cn("rounded-[10px] border border-[var(--border)] bg-white/[.02] p-3 text-[13px]", used ? "border-l-[3px] border-l-success" : "border-l-[3px] border-l-primary")}>
        <div className="flex flex-wrap items-center gap-1"><Badge kind={used ? "used" : undefined}>[{p.rank}]</Badge><strong>{p.citation}</strong><span className="ml-auto font-mono text-[11px] text-muted">{p.sources.map(s => <Badge key={s} kind={s}>{s}</Badge>)}{p.score.toFixed(2)}</span></div>
        <p className="mt-2 text-muted">{p.text.slice(0, 480)}{p.text.length > 480 ? "…" : ""}</p>
      </motion.li>); })}
  </motion.ul>);
}
