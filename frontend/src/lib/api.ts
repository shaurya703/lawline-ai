const BASE = "/api";
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, { headers: { "content-type": "application/json" }, ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}
export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) }),
  upload: async <T,>(p: string, file: File, params = "") => {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`${BASE}${p}${params}`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<T>;
  },
};
export type Passage = { rank: number; citation: string; text: string; sources: string[]; score: number; doc_id?: string; used?: boolean };
export type ChatOut = { answer: string; translated?: string | null; search_query: string; followups: string[]; passages: Passage[]; timings_ms: Record<string, number>; model?: string };
export type Stats = { corpus: Record<string, number>; gold: Record<string, { queries: number; train_pairs: number }>; kg: { nodes: Record<string, number>; edges: Record<string, number> }; answer_eval: Record<string, Record<string, number>> | null; chunks: number };
export type Row = Record<string, string | number | null>;
export type Analytics = { ablation_base: Row[]; ablation_ft: Row[]; ablation_ft_legalce: Row[]; chunk_sweep: Row[]; latency: Record<string, { mean_ms: number; p50_ms: number; p95_ms: number }> | null; answer_eval: Record<string, Record<string, number>> | null; grounded: Row[]; train_biencoder: { loss_history: { step: number; loss: number }[] } | null; train_reranker: { loss_history: { step: number; loss: number }[] } | null };
