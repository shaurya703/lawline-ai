import { Bookmark, BookmarkCheck, Check, CircleAlert, Copy, Info, TriangleAlert, X } from "lucide-react";
import { Component, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pin, toasts, type FileKind } from "@/lib/store";
import { copy as copyText } from "@/lib/export";

/* ------------------------------------------------------------------ layout */

/** Every module page: one title, one sentence of description, optional actions, then content. */
export function Page({ title, desc, actions, children, narrow }: { title: string; desc?: ReactNode; actions?: ReactNode; children: ReactNode; narrow?: boolean }) {
  return (
    <div className={cn("mx-auto w-full", narrow && "max-w-[820px]")}>
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h1 className="font-serif text-[28px] font-medium leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {desc && <p className="mt-1.5 max-w-[68ch] text-[15px] text-ink-2">{desc}</p>}
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Card({ children, className, as: Tag = "section", flush }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "aside"; flush?: boolean }) {
  return <Tag className={cn("rounded-lg border border-line bg-surface", !flush && "p-5", className)}>{children}</Tag>;
}

/** A titled card. Use for each distinct block of a result. */
export function Section({ title, desc, actions, children, className, flush }: { title: ReactNode; desc?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <Card className={className} flush>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold text-ink">{title}</h2>{desc && <p className="mt-0.5 text-[13px] text-ink-3">{desc}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("pt-3", !flush && "px-5 pb-5")}>{children}</div>
    </Card>
  );
}

/** Input on the left (stays in view), result on the right. Used by every paste-and-run module. */
export function Workbench({ input, children, wide }: { input: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("grid grid-cols-1 items-start gap-6", wide ? "lg:grid-cols-[440px_minmax(0,1fr)]" : "lg:grid-cols-[380px_minmax(0,1fr)]")}>
      <div className="lg:sticky lg:top-[76px]">{input}</div>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}

/** Small heading inside a card. */
export function H3({ children, className }: { children: ReactNode; className?: string }) { return <h3 className={cn("text-[13px] font-semibold text-ink", className)}>{children}</h3>; }
export function Caption({ children, className }: { children: ReactNode; className?: string }) { return <p className={cn("text-[12.5px] text-ink-3", className)}>{children}</p>; }

/* ---------------------------------------------------------------- controls */

const control = "w-full rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-sunken disabled:text-ink-3";
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cn(control, "h-10", p.className)} />; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cn(control, "py-2.5 leading-relaxed", p.className)} />; }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cn(control, "h-10 cursor-pointer pr-8", p.className)} />; }
/** Field label above its control. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={cn("block", className)}><span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>{children}{hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>}</label>;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger"; size?: "sm" | "md" };
export function Button({ children, className, variant = "default", size = "md", type = "button", ...p }: ButtonProps) {
  return (
    <button type={type} {...p} className={cn(
      "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
      size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-4 text-[14px]",
      variant === "primary" ? "border-ink bg-ink text-white hover:bg-[#2b2f38]"
        : variant === "ghost" ? "border-transparent text-ink-2 hover:bg-ink/[.06] hover:text-ink"
        : variant === "danger" ? "border-bad/40 bg-surface text-bad hover:bg-bad-soft"
        : "border-line-strong bg-surface text-ink hover:border-ink-3 hover:bg-sunken", className)}>{children}</button>
  );
}
/** Icon-only button. `label` is both the accessible name and the tooltip. */
export function IconButton({ label, children, className, active, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return <button type="button" aria-label={label} title={label} {...p} className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/[.06] hover:text-ink disabled:pointer-events-none disabled:opacity-40", active && "bg-accent-soft text-accent", className)}>{children}</button>;
}
/** File picker styled as a secondary button. */
export function UploadButton({ accept, onFile, children }: { accept: string; onFile: (f: File) => void; children: ReactNode }) {
  return <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink transition-colors hover:border-ink-3 hover:bg-sunken focus-within:ring-2 focus-within:ring-accent/30">{children}<input type="file" accept={accept} className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} /></label>;
}
/** A suggested input: example question, preset, quick pick. */
export function Chip({ children, className, active, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" {...p} className={cn("rounded-md border px-2.5 py-1 text-left text-[13px] transition-colors", active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-sunken hover:text-ink", className)}>{children}</button>;
}
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span><span className="block text-[14px] text-ink">{label}</span>{hint && <span className="block text-[12.5px] text-ink-3">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-ink" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-5 overflow-x-auto border-b border-line", className)}>
      {items.map(i => <button key={i.id} role="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)} className={cn("-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] transition-colors", value === i.id ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>{i.label}{i.count !== undefined && <span className="num ml-1.5 text-[12px] text-ink-3">{i.count}</span>}</button>)}
    </div>
  );
}

/* ----------------------------------------------------------------- display */

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";
const TONE: Record<Tone, string> = { neutral: "border-line bg-sunken text-ink-2", ok: "border-ok/25 bg-ok-soft text-ok", warn: "border-warn/25 bg-warn-soft text-warn", bad: "border-bad/25 bg-bad-soft text-bad", info: "border-info/25 bg-info-soft text-info", accent: "border-accent/20 bg-accent-soft text-accent" };
export function Tag({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-px text-[12px] font-medium leading-5", TONE[tone], className)}>{children}</span>;
}
const SRC: Record<string, [string, string]> = { faiss: ["Dense", "var(--src-faiss)"], bm25: ["BM25", "var(--src-bm25)"], kg: ["Graph", "var(--src-kg)"], "kg-slot": ["Graph match", "var(--src-kg)"], rerank: ["Reranked", "var(--ink-3)"] };
/** Which retriever surfaced a passage: a coloured dot plus a neutral text label. */
export function Source({ name }: { name: string }) {
  const [label, color] = SRC[name] ?? [name, "var(--ink-3)"];
  return <span className="inline-flex items-center gap-1 text-[12px] text-ink-3"><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />{label}</span>;
}
/** One figure with its label. Put several in a StatStrip. */
export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return <div className="min-w-0 px-5 py-4"><div className="text-[12.5px] text-ink-3">{label}</div><div className="num mt-1 truncate font-serif text-[26px] font-medium leading-none text-ink">{value}</div>{sub && <div className="mt-1.5 truncate text-[12.5px] text-ink-3">{sub}</div>}</div>;
}
/** A row of figures in a single card, separated by hairlines. Replaces a grid of metric cards. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <Card flush className={cn("grid grid-cols-2 overflow-hidden [&>*]:border-line [&>*]:border-b [&>*]:border-r sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none sm:[&>*]:border-b-0 sm:[&>*:last-child]:border-r-0", className)}>{children}</Card>;
}
/** Discrete 0..max meter (argument strength, offence severity). */
export function Meter({ value, max = 5, tone = "ink", label }: { value: number; max?: number; tone?: "ink" | "ok" | "warn" | "bad"; label?: string }) {
  const c = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-ink";
  return <span className="inline-flex items-center gap-0.5" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label ?? "level"}>{Array.from({ length: max }).map((_, i) => <span key={i} className={cn("h-2.5 w-1.5 rounded-[1px]", i < value ? c : "bg-line")} />)}</span>;
}
/** Continuous 0..1 bar with an optional label on the right. */
export function Progress({ value, tone = "ink", className }: { value: number; tone?: "ink" | "ok" | "warn" | "bad" | "accent"; className?: string }) {
  const c = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : tone === "accent" ? "bg-accent" : "bg-ink";
  const v = Math.max(0, Math.min(1, value));
  return <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}><div className={cn("h-full rounded-full transition-[width] duration-300", c)} style={{ width: `${v * 100}%` }} /></div>;
}
export function Bullets({ items, className, ordered }: { items: ReactNode[]; className?: string; ordered?: boolean }) {
  const L = ordered ? "ol" : "ul";
  return <L className={cn("space-y-2 text-[14px] text-ink", ordered ? "list-decimal pl-5 marker:text-ink-3" : "list-disc pl-5 marker:text-line-strong", className)}>{items.map((x, i) => <li key={i} className="pl-1">{x}</li>)}</L>;
}
export function Callout({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "bad" | "ok"; title?: ReactNode; children: ReactNode; className?: string }) {
  const I = tone === "warn" ? TriangleAlert : tone === "bad" ? CircleAlert : tone === "ok" ? Check : Info;
  const c = tone === "warn" ? "border-warn/25 bg-warn-soft" : tone === "bad" ? "border-bad/25 bg-bad-soft" : tone === "ok" ? "border-ok/25 bg-ok-soft" : "border-info/20 bg-info-soft";
  const ic = tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-info";
  return <div className={cn("flex gap-3 rounded-lg border p-4 text-[14px]", c, className)}><I className={cn("mt-0.5 h-4 w-4 shrink-0", ic)} aria-hidden /><div className="min-w-0 flex-1">{title && <div className="mb-1 font-semibold text-ink">{title}</div>}<div className="text-ink">{children}</div></div></div>;
}
export function Skeleton({ className }: { className?: string }) { return <div className={cn("skeleton", className)} aria-hidden />; }
export function ErrorBox({ error, retry, title = "Request failed.", retryLabel = "Retry" }: { error: string; retry?: () => void; title?: string; retryLabel?: string }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/25 bg-bad-soft p-4 text-[14px]"><CircleAlert className="h-4 w-4 shrink-0 text-bad" aria-hidden /><div className="min-w-0 flex-1"><span className="font-semibold">{title}</span> <span className="break-words font-mono text-[12.5px] text-ink-2">{error}</span></div>{retry && <Button size="sm" onClick={retry}>{retryLabel}</Button>}</div>;
}
/** A page that throws while rendering, or whose code fails to load, is reported in place instead of blanking the app.
 *  The error is cleared when `resetKey` changes; the shell passes the route. */
type BoundaryProps = { resetKey?: string; children: ReactNode };
type BoundaryState = { error: unknown; key?: string };
export class PageBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, key: this.props.resetKey };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) { return props.resetKey === state.key ? null : { error: null, key: props.resetKey }; }
  render() {
    if (this.state.error === null) return this.props.children;
    return <ErrorBox title="This page could not be displayed." error={String(this.state.error)} retry={() => location.reload()} retryLabel="Reload" />;
  }
}
export function Empty({ icon, title, desc }: { icon?: ReactNode; title: string; desc?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">{icon && <div className="mb-3 text-ink-3">{icon}</div>}<div className="text-[15px] font-semibold text-ink">{title}</div>{desc && <p className="mt-1 max-w-md text-[14px] text-ink-3">{desc}</p>}</div>;
}

/* ---------------------------------------------------------------- overlays */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Modal dialog behaviour: Escape closes, focus moves in, Tab stays in, focus returns to the opener on close. */
function useDialog<E extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<E>(null); const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null; const box = ref.current; box?.focus();
    const h = (e: KeyboardEvent) => {
      // A key pressed inside a dialog opened over this one (the command palette) is that dialog's own. The event's target
      // is used, not the focused element: by the time the key reaches the window the other dialog may have closed itself.
      const held = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null;
      if (held && held !== box && !box?.contains(held)) return;
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab" || !box) return;
      const f = box.querySelectorAll<HTMLElement>(FOCUSABLE); const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!first) { e.preventDefault(); return; }
      if (!box.contains(a) || (e.shiftKey ? a === first || a === box : a === last)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); opener?.focus(); };
  }, [open]);
  return ref;
}
export function Drawer({ open, onClose, title, children, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  const ref = useDialog<HTMLElement>(open, onClose); const id = useId();
  if (!open) return null;
  return (<>
    <div className="anim-fade fixed inset-0 z-50 bg-ink/25" onClick={onClose} />
    <aside ref={ref} tabIndex={-1} role="dialog" aria-modal aria-labelledby={id} className="anim-slide fixed inset-y-0 right-0 z-50 flex flex-col border-l border-line bg-surface shadow-pop" style={{ width: `min(${width}px, 100vw)` }}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5"><div id={id} className="text-[15px] font-semibold">{title}</div><IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton></div>
      <div className="flex-1 overflow-auto p-5">{children}</div>
    </aside>
  </>);
}
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useDialog<HTMLDivElement>(open, onClose); const id = useId();
  if (!open) return null;
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal aria-labelledby={id} className="anim-rise max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border border-line bg-surface p-5 shadow-pop" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><div id={id} className="text-[15px] font-semibold">{title}</div><IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton></div>
        {children}
      </div>
    </div>
  );
}
export function Toasts() {
  const list = toasts.use(s => s.list);
  return <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">{list.map(t => <div key={t.id} className="anim-rise flex items-center gap-2 rounded-md bg-ink px-3.5 py-2.5 text-[13px] text-white shadow-pop">{t.kind === "err" ? <CircleAlert className="h-4 w-4 text-[#ff9c94]" /> : t.kind === "warn" ? <TriangleAlert className="h-4 w-4 text-[#f5cf6b]" /> : <Check className="h-4 w-4 text-[#7fd9a8]" />}{t.text}</div>)}</div>;
}

/* --------------------------------------------------------- shared patterns */

export function PinButton({ kind, title, body, meta, labelled }: { kind: FileKind; title: string; body: string; meta?: Record<string, unknown>; labelled?: boolean }) {
  const [done, setDone] = useState(false);
  const run = () => { pin({ kind, title, body, meta }); setDone(true); setTimeout(() => setDone(false), 1600); };
  const I = done ? BookmarkCheck : Bookmark;
  return labelled ? <Button size="sm" onClick={run}><I className="h-4 w-4" />{done ? "Saved" : "Save to case file"}</Button> : <IconButton label="Save to case file" onClick={run} active={done}><I className="h-4 w-4" /></IconButton>;
}
export function CopyButton({ text, labelled }: { text: string; labelled?: boolean }) {
  return labelled ? <Button size="sm" onClick={() => copyText(text)}><Copy className="h-4 w-4" />Copy</Button> : <IconButton label="Copy" onClick={() => copyText(text)}><Copy className="h-4 w-4" /></IconButton>;
}
type PassageLike = { rank: number; citation: string; text: string; sources: string[]; score?: number; used?: boolean; doc_id?: string };
/** Retrieved passages. A passage the answer cites is marked; the excerpt is serif because it is source text. */
export function Passages({ items, compact }: { items: PassageLike[]; compact?: boolean }) {
  const max = compact ? 220 : 480;
  return (
    <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map(p => { const used = p.used; return (
        <li key={p.rank} className="p-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("num rounded px-1.5 font-mono text-[11px] font-medium leading-5", used ? "bg-accent-soft text-accent" : "bg-sunken text-ink-3")}>[{p.rank}]</span>
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{p.citation}</span>
            {used && <Tag tone="accent">Cited</Tag>}
            <span className="flex items-center gap-2.5">{p.sources.map(s => <Source key={s} name={s} />)}{p.score !== undefined && <span className="num font-mono text-[11px] text-ink-3">{p.score.toFixed(2)}</span>}</span>
          </div>
          <p className="statute-sm mt-1.5">{p.text.slice(0, max)}{p.text.length > max ? "…" : ""}</p>
        </li>); })}
    </ol>
  );
}
