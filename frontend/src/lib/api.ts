import { apiState, settings } from "./store";
const ENV_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
/** Candidate API bases in priority order: user override → build-time URL (tunnel) → local backend. */
const candidates = () => Array.from(new Set([settings.get().apiBase, ENV_BASE, "http://localhost:8000", "http://127.0.0.1:8000"].filter(Boolean)));
async function ping(b: string, ms = 4000) { const t = performance.now(); const c = new AbortController(); const id = setTimeout(() => c.abort(), ms); try { const r = await fetch(b + "/health", { cache: "no-store", signal: c.signal }); return r.ok ? performance.now() - t : null; } catch { return null; } finally { clearTimeout(id); } }
let resolving: Promise<string> | null = null;
/** Pick the first reachable base; remembered until a request fails. */
export function resolveBase(force = false): Promise<string> {
  if (!force && apiState.get().base && apiState.get().ok) return Promise.resolve(apiState.get().base);
  if (resolving) return resolving;
  resolving = (async () => {
    for (const b of candidates()) { const ms = await ping(b, 8000); if (ms !== null) { apiState.set({ base: b, ok: true, ms, checked: Date.now() }); return b; } }
    // nothing answered quickly — the hosted backend may be cold-starting (scale-to-zero); give it one long try
    const primary = candidates()[0];
    const ms = await ping(primary, 60000);
    apiState.set({ base: primary, ok: ms !== null, ms: ms ?? 0, checked: Date.now() });
    return primary;
  })().finally(() => { resolving = null; });
  return resolving;
}
export const base = () => apiState.get().base || settings.get().apiBase || ENV_BASE;
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const b = await resolveBase();
  let r: Response;
  try { r = await fetch(b + path, { headers: { "content-type": "application/json" }, ...init }); }
  catch (e) { apiState.set({ ok: false }); throw new Error(`API unreachable at ${b} (${String(e)})`); }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}
export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) }),
  upload: async <T,>(p: string, file: File, params = "") => { const fd = new FormData(); fd.append("file", file); const r = await fetch(`${base()}${p}${params}`, { method: "POST", body: fd }); if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<T>; },
  health: async () => { const b = await resolveBase(!apiState.get().ok); const ms = await ping(b); if (ms === null) { await resolveBase(true); } else apiState.set({ base: b, ok: true, ms, checked: Date.now() }); const st = apiState.get(); return { ok: st.ok, ms: st.ms, base: st.base }; },
};
export type Passage = { rank: number; citation: string; text: string; sources: string[]; score: number; doc_id?: string; used?: boolean };
export type ChatOut = { answer: string; translated?: string | null; search_query: string; followups: string[]; passages: Passage[]; timings_ms: Record<string, number>; model?: string };
export type Stats = { corpus: Record<string, number>; gold: Record<string, { queries: number; train_pairs: number }>; kg: { nodes: Record<string, number>; edges: Record<string, number> }; answer_eval: Record<string, Record<string, number>> | null; chunks: number };
export type Row = Record<string, string | number | null>;
export type Analytics = { ablation_base: Row[]; ablation_ft: Row[]; ablation_ft_legalce: Row[]; chunk_sweep: Row[]; latency: Record<string, { mean_ms: number; p50_ms: number; p95_ms: number }> | null; answer_eval: Record<string, Record<string, number>> | null; grounded: Row[]; train_biencoder: { loss_history: { step: number; loss: number }[] } | null; train_reranker: { loss_history: { step: number; loss: number }[] } | null };
export type Prov = { act: string; section: string; title: string; doc_id: string; text: string };
export type Transition = { old: Prov | null; new: Prov[]; concepts: string[]; diff: { summary: string; changes: string[]; unchanged: string[]; severity_old: string; severity_new: string } | null };
export type MapRow = { old_act: string; old_section: string; new_act: string; new_sections: string[]; concepts: string[] };
export type Summary = { summary: { title: string; court: string | null; year: number | null; parties: string; facts: string[]; issues: string[]; holding: string; ratio: string; provisions: string[]; precedents: string[]; outcome: string; one_liner: string; key_quotes: string[] }; passages: Passage[]; words: number };
export type TimelineOut = { events: { date: string | null; label: string; detail: string; actors: string[]; kind: string; legal_significance: string }[]; gaps: string[]; limitation_flags: string[] };
export type Argument = { point: string; basis: string; citations: number[]; strength: number };
export type ArgueOut = { issues: string[]; side_a: { name: string; arguments: Argument[] }; side_b: { name: string; arguments: Argument[] }; pivotal_facts: string[]; likely_outcome: string; confidence: number; questions_bench_may_ask: string[]; passages: Passage[] };
export type Offence = Prov & { concept: string | null; punishment: { mentions: string[]; max_years: number | null; life: boolean; death: boolean; fine: boolean; severity: number }; classification: { cognizable: boolean | null; bailable: boolean | null; compoundable: boolean | null; triable_by: string; ingredients: string[] } | null };
export type CompareOut = { docs: { doc_id: string; citation: string; act: string; section: string; title: string; text: string }[]; analysis: { overview: string; matrix: { dimension: string; values: string[] }[]; when_to_use: string[]; interplay: string } };
export type Simplified = { plain: string; example: string; key_terms: { term: string; meaning: string }[]; do_dont: string[] };
export type Gloss = { term: string; meaning: string; provisions: { act: string; section: string }[] };
export type RightsItem = { id: string; title: string; icon: string; summary: string; steps: number };
export type RightsDetail = { id: string; title: string; icon: string; summary: string; steps: string[]; provisions: { act: string; section: string; title: string | null; doc_id: string | null; text: string | null }[] };
export type LimRow = { id: string; matter: string; days: number; from: string; basis: string; deadline?: string; days_left?: number };
export type QuizQ = { id: string; question: string; options: string[] };
export type QuizCheck = { correct: boolean; answer: number; explanation?: string; passages?: Passage[] };
export type VerifyOut = { citations: { span: string; section: string; act_guess: string | null; found: boolean; doc_id: string | null; title: string | null }[]; verified: number; total: number };
