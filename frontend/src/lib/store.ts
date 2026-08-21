import { useSyncExternalStore } from "react";
/** Tiny persistent store (localStorage) with React subscription — used for Case Files, settings and toasts. */
function makeStore<T>(key: string | null, initial: T) {
  let state: T = initial;
  if (key) { try { const raw = localStorage.getItem(key); if (raw) state = { ...initial, ...JSON.parse(raw) }; } catch { /* ignore */ } }
  const subs = new Set<() => void>();
  const set = (patch: Partial<T> | ((s: T) => Partial<T>)) => { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; if (key) localStorage.setItem(key, JSON.stringify(state)); subs.forEach(f => f()); };
  function use(): T;
  function use<R>(sel: (s: T) => R): R;
  function use<R>(sel?: (s: T) => R) { const pick = sel ?? ((s: T) => s as unknown as R); return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => pick(state), () => pick(state)); }
  return { get: () => state, set, use };
}

export type FileKind = "answer" | "provision" | "draft" | "brief" | "timeline" | "argument" | "note" | "comparison" | "quiz";
export type CaseItem = { id: string; kind: FileKind; title: string; body: string; meta?: Record<string, unknown>; note?: string; at: number; tags?: string[] };
type Files = { items: CaseItem[]; matter: string };
export const files = makeStore<Files>("lawline.files", { items: [], matter: "Untitled matter" });
export const pin = (i: Omit<CaseItem, "id" | "at">) => { const item: CaseItem = { ...i, id: Math.random().toString(36).slice(2, 10), at: Date.now() }; files.set(s => ({ items: [item, ...s.items].slice(0, 200) })); toast(`Pinned to Case Files · ${i.title.slice(0, 40)}`); return item.id; };
export const unpin = (id: string) => files.set(s => ({ items: s.items.filter(i => i.id !== id) }));
export const annotate = (id: string, note: string) => files.set(s => ({ items: s.items.map(i => i.id === id ? { ...i, note } : i) }));

export type Settings = { accent: "cyan" | "violet" | "amber" | "emerald" | "rose"; motion: "full" | "reduced"; typewriter: boolean; voice: boolean; autoSpeak: boolean; style: string; lang: string; density: "comfortable" | "compact"; apiBase: string; rerank: boolean; sidebar: "expanded" | "rail" };
export const settings = makeStore<Settings>("lawline.settings", { accent: "cyan", motion: "full", typewriter: true, voice: true, autoSpeak: false, style: "Plain English", lang: "—", density: "comfortable", apiBase: "", rerank: true, sidebar: "expanded" });
export function applySettings(s: Settings) { const r = document.documentElement; r.dataset.accent = s.accent; r.dataset.density = s.density; r.style.setProperty("--motion", s.motion === "reduced" ? "0" : "1"); }

export type Toast = { id: number; text: string; kind?: "ok" | "warn" | "err" };
export const toasts = makeStore<{ list: Toast[] }>(null, { list: [] });
let tid = 0;
export function toast(text: string, kind: Toast["kind"] = "ok") { const id = ++tid; toasts.set(s => ({ list: [...s.list, { id, text, kind }] })); setTimeout(() => toasts.set(s => ({ list: s.list.filter(t => t.id !== id) })), 3200); }

type Activity = { list: { at: number; kind: string; text: string; to?: string }[] };
export const activity = makeStore<Activity>("lawline.activity", { list: [] });
export const logActivity = (kind: string, text: string, to?: string) => activity.set(s => ({ list: [{ at: Date.now(), kind, text, to }, ...s.list].slice(0, 50) }));
