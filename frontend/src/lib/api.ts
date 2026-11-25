import { apiState, settings } from "./store";
const ENV_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
// "https://host/" is the usual pasted form; "https://host//health" would not answer.
const clean = (b: string) => b.trim().replace(/\/+$/, "");
/** Candidate API bases in priority order: user override → build-time URL → a backend on this machine (the public site's demo mode). */
const candidates = () => Array.from(new Set([clean(settings.get().apiBase), clean(ENV_BASE), "http://localhost:8000", "http://127.0.0.1:8000"].filter(Boolean)));
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
const REQ_TIMEOUT_MS = 180_000;   // must stay above the slowest LLM endpoint
/** String(e) is the message alone, so pages that do setErr(String(e)) show no "Error: " prefix. */
class ApiError extends Error { toString() { return this.message; } }
type Detail = { loc?: unknown[]; msg?: string };
async function fail(r: Response): Promise<never> {
  const raw = await r.text().catch(() => "");
  let detail = /^\s*</.test(raw) ? "" : raw.slice(0, 200);   // never show a proxy's HTML error page
  try {
    const d = (JSON.parse(raw) as { detail?: unknown }).detail;
    if (typeof d === "string") detail = d;
    else if (Array.isArray(d)) detail = (d as Detail[]).map(x => [(x.loc ?? []).slice(1).join("."), x.msg].filter(Boolean).join(": ")).join("; ");
  } catch { /* not JSON */ }
  throw new ApiError(detail ? `${detail} (HTTP ${r.status})` : `HTTP ${r.status} ${r.statusText}`.trim());
}
async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const b = await resolveBase();
  let r: Response;
  // Only a JSON body gets a content type: on a body-less GET it would force a CORS preflight, and FormData sets its own boundary.
  try { r = await fetch(b + path, { ...init, headers: typeof init.body === "string" ? { "content-type": "application/json" } : undefined, signal: AbortSignal.timeout(REQ_TIMEOUT_MS) }); }
  catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new ApiError(`No answer from the API within ${REQ_TIMEOUT_MS / 1000} seconds`);
    apiState.set({ ok: false }); throw new ApiError(`API unreachable at ${b}`);
  }
  if (!r.ok) return fail(r);
  try { return await r.json() as T; } catch { throw new ApiError("The API returned a response that is not JSON"); }
}
export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) }),
  upload: <T,>(p: string, file: File, params = "") => { const fd = new FormData(); fd.append("file", file); return req<T>(p + params, { method: "POST", body: fd }); },
  health: async () => {
    const cur = apiState.get();
    if (!cur.ok) await resolveBase(true);   // one full probe; it records ok, ms and checked itself
    else { const ms = await ping(cur.base); if (ms === null) await resolveBase(true); else apiState.set({ ok: true, ms, checked: Date.now() }); }
    const st = apiState.get(); return { ok: st.ok, ms: st.ms, base: st.base };
  },
};
export type Passage = { rank: number; citation: string; text: string; sources: string[]; score: number; doc_id?: string; used?: boolean };
export type ChatOut = { answer: string; translated?: string | null; search_query: string; followups: string[]; passages: Passage[]; timings_ms: Record<string, number>; model?: string };
export type Stats = { corpus: Record<string, number>; gold: Record<string, { queries: number; train_pairs: number }>; kg: { nodes: Record<string, number>; edges: Record<string, number> }; answer_eval: (Record<string, Record<string, number>> & { corpus?: string }) | null; chunks: number; corpus_version?: string };
export type Row = Record<string, string | number | null>;
/** ", v1 corpus" when the answer-quality figures were measured on an older corpus than the one being served. */
export const measuredOn = (s: Stats | null | undefined) => s?.answer_eval?.corpus && s.corpus_version && s.answer_eval.corpus !== s.corpus_version ? `, ${s.answer_eval.corpus} corpus` : "";
export type CorpusVersion = { ablation_ft: Row[]; landmark: Record<string, number | string> | null; corpus: Record<string, number> | null };
export type Analytics = { corpus_version: string; measured_on: Record<string, string>; corpus_versions: { v1: CorpusVersion; v2: CorpusVersion; v2_right_type: Row[] } | null; ablation_base: Row[]; ablation_ft: Row[]; ablation_ft_legalce: Row[]; chunk_sweep: Row[]; latency: Record<string, { mean_ms: number; p50_ms: number; p95_ms: number }> | null; answer_eval: Record<string, Record<string, number>> | null; grounded: Row[]; train_biencoder: { loss_history: { step: number; loss: number }[] } | null; train_reranker: { loss_history: { step: number; loss: number }[] } | null };
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
