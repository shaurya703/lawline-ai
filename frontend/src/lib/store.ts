import { useSyncExternalStore } from "react";
/** Tiny persistent store (localStorage) with React subscription — used for Case Files, settings and toasts. */
function makeStore<T>(key: string | null, initial: T) {
  let state: T = initial;
  const load = (raw: string | null) => { if (!raw) return; try { const v: unknown = JSON.parse(raw); if (v && typeof v === "object" && !Array.isArray(v)) state = { ...initial, ...(v as Partial<T>) }; } catch { /* corrupt entry: keep the current state */ } };
  if (key) { try { load(localStorage.getItem(key)); } catch { /* storage blocked */ } }
  const subs = new Set<() => void>();
  const emit = () => subs.forEach(f => f());
  let warned = false;
  const set = (patch: Partial<T> | ((s: T) => Partial<T>)) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    if (key) { try { localStorage.setItem(key, JSON.stringify(state)); } catch { if (!warned) { warned = true; queueMicrotask(() => toast("Browser storage is full or blocked. Changes will be lost when this tab closes.", "warn")); } } }
    emit();
  };
  // Another tab wrote this store: adopt its value so the next write from this tab does not overwrite it.
  if (key && typeof window !== "undefined") window.addEventListener("storage", e => { if (e.key === key) { load(e.newValue); emit(); } });
  const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
  function use(): T;
  function use<R>(sel: (s: T) => R): R;
  function use<R>(sel?: (s: T) => R) { const pick = sel ?? ((s: T) => s as unknown as R); return useSyncExternalStore(subscribe, () => pick(state), () => pick(state)); }
  return { get: () => state, set, use };
}

export type FileKind = "answer" | "provision" | "draft" | "brief" | "timeline" | "argument" | "note" | "comparison";
export type CaseItem = { id: string; kind: FileKind; title: string; body: string; meta?: Record<string, unknown>; note?: string; at: number; tags?: string[] };
type Files = { items: CaseItem[]; matter: string };
export const files = makeStore<Files>("lawline.files", { items: [], matter: "Untitled matter" });
export const pin = (i: Omit<CaseItem, "id" | "at">) => { const item: CaseItem = { ...i, id: Math.random().toString(36).slice(2, 10), at: Date.now() }; files.set(s => ({ items: [item, ...s.items].slice(0, 200) })); toast(`Pinned to Case Files · ${i.title.slice(0, 40)}`); return item.id; };
export const unpin = (id: string) => files.set(s => ({ items: s.items.filter(i => i.id !== id) }));
export const annotate = (id: string, note: string) => files.set(s => ({ items: s.items.map(i => i.id === id ? { ...i, note } : i) }));

export const ACCENTS = ["oxblood", "navy", "forest", "plum", "slate"] as const;
export type Settings = { accent: (typeof ACCENTS)[number]; motion: "full" | "reduced"; typewriter: boolean; voice: boolean; autoSpeak: boolean; style: string; lang: string; density: "comfortable" | "compact"; apiBase: string; rerank: boolean; sidebar: "expanded" | "hidden" };
export const settings = makeStore<Settings>("lawline.settings", { accent: "oxblood", motion: "full", typewriter: true, voice: true, autoSpeak: false, style: "Plain English", lang: "—", density: "comfortable", apiBase: "", rerank: true, sidebar: "expanded" });
// Values saved by the previous interface (neon accents, icon rail) fall back to the defaults.
if (!ACCENTS.includes(settings.get().accent)) settings.set({ accent: "oxblood" });
if (settings.get().sidebar !== "expanded" && settings.get().sidebar !== "hidden") settings.set({ sidebar: "expanded" });
export function applySettings(s: Settings) { const r = document.documentElement; r.dataset.accent = s.accent; r.dataset.motion = s.motion; }

/** Which sidebar groups are expanded. The group holding the current page is always shown open. */
export const navState = makeStore<{ open: Record<string, boolean> }>("lawline.nav", { open: {} });

export type Toast = { id: number; text: string; kind?: "ok" | "warn" | "err" };
export const toasts = makeStore<{ list: Toast[] }>(null, { list: [] });
let tid = 0;
export function toast(text: string, kind: Toast["kind"] = "ok") { const id = ++tid; toasts.set(s => ({ list: [...s.list, { id, text, kind }] })); setTimeout(() => toasts.set(s => ({ list: s.list.filter(t => t.id !== id) })), 3200); }

type Activity = { list: { at: number; kind: string; text: string; to?: string }[] };
export const activity = makeStore<Activity>("lawline.activity", { list: [] });
export const logActivity = (kind: string, text: string, to?: string) => activity.set(s => ({ list: [{ at: Date.now(), kind, text, to }, ...s.list].slice(0, 50) }));

export type ApiState = { base: string; ok: boolean; ms: number; checked: number };
export const apiState = makeStore<ApiState>(null, { base: "", ok: false, ms: 0, checked: 0 });
