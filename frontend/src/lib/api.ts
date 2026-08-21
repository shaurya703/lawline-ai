import { settings } from "./store";
const ENV_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
export const base = () => settings.get().apiBase || ENV_BASE;
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base() + path, { headers: { "content-type": "application/json" }, ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}
export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) }),
  upload: async <T,>(p: string, file: File, params = "") => { const fd = new FormData(); fd.append("file", file); const r = await fetch(`${base()}${p}${params}`, { method: "POST", body: fd }); if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<T>; },
  health: async () => { const t = performance.now(); try { const r = await fetch(base() + "/health", { cache: "no-store" }); return { ok: r.ok, ms: performance.now() - t }; } catch { return { ok: false, ms: performance.now() - t }; } },
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
