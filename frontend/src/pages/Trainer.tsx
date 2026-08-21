import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, GraduationCap, RotateCcw, X } from "lucide-react";
import { api, type QuizCheck, type QuizQ } from "@/lib/api";
import { Button, Card, ErrorBox, PageHeader, Passages, Select, Skeleton } from "@/components/shell/ui";
import { Ring } from "@/components/fx/Gauge";
import { Chart, C } from "@/lib/plotly";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/store";
type Rec = { q: QuizQ; choice: number; res: QuizCheck; ms: number };
export default function Trainer() {
  const [n, setN] = useState(5); const [qs, setQs] = useState<QuizQ[] | null>(null); const [i, setI] = useState(0); const [choice, setChoice] = useState<number | null>(null); const [res, setRes] = useState<QuizCheck | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [hist, setHist] = useState<Rec[]>([]); const [t0, setT0] = useState(0); const [best, setBest] = useState(() => Number(localStorage.getItem("lawline.quiz.best") || 0));
  async function start() { setBusy(true); setErr(null); setHist([]); setI(0); setChoice(null); setRes(null); try { const r = await api.get<{ total: number; questions: QuizQ[] }>(`/quiz?n=${n}&seed=${Math.floor(Math.random() * 1e6)}`); setQs(r.questions); setT0(performance.now()); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  async function answer(c: number) { if (!qs || choice !== null) return; setChoice(c); setBusy(true); try { const r = await api.post<QuizCheck>("/quiz/check", { id: qs[i].id, choice: c, explain: true }); setRes(r); setHist(h => [...h, { q: qs[i], choice: c, res: r, ms: performance.now() - t0 }]); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  function next() { setI(x => x + 1); setChoice(null); setRes(null); setT0(performance.now()); }
  const done = qs && i >= qs.length; const score = hist.filter(h => h.res.correct).length;
  useEffect(() => { if (done && score > best) { setBest(score); localStorage.setItem("lawline.quiz.best", String(score)); } if (done) logActivity("trainer", `Scored ${score}/${qs!.length} on AIBE set`, "/app/trainer"); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (qs && !done && choice === null && ["1", "2", "3", "4"].includes(e.key)) void answer(Number(e.key) - 1); if (res && e.key === "Enter") next(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="All India Bar Examination" title="Bar Exam Trainer" desc="Real AIBE multiple-choice questions (498 in the bank). Answer with keys 1–4; after each answer LawLine retrieves the governing passages and explains why." actions={<div className="flex items-center gap-2"><Select value={n} onChange={e => setN(Number(e.target.value))} className="w-28" aria-label="Questions">{[5, 10, 15, 20].map(x => <option key={x} value={x}>{x} Qs</option>)}</Select><Button variant="primary" onClick={start} disabled={busy}><GraduationCap className="h-4 w-4" />{qs ? "New set" : "Start"}</Button></div>} />
      {err && <ErrorBox error={err} />}
      {!qs && !busy && <Card className="scan relative overflow-hidden p-10 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-warning/40 bg-warning/10"><GraduationCap className="h-7 w-7 text-warning" /></div><h3 className="mt-4 font-display text-xl text-white">Ready when you are</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted">Pick the number of questions and press Start. Your best score is stored locally.{best > 0 && <> Best so far: <span className="text-warning">{best}</span>.</>}</p></Card>}
      {busy && !qs && <Skeleton className="h-80" />}
      {qs && !done && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: .25 }}>
              <Card className="p-6">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted"><span>Question {i + 1} of {qs.length}</span><span>{qs[i].id}</span></div>
                <div className="mt-2 flex gap-1">{qs.map((_, k) => <span key={k} className={cn("h-1 flex-1 rounded-full", k < i ? (hist[k]?.res.correct ? "bg-success" : "bg-danger") : k === i ? "bg-primary" : "bg-white/10")} />)}</div>
                <h3 className="mt-5 text-lg leading-relaxed text-white">{qs[i].question}</h3>
                <div className="mt-5 grid gap-2">{qs[i].options.map((o, k) => { const picked = choice === k; const isAns = res && res.answer === k; return (
                  <motion.button key={k} whileHover={choice === null ? { x: 4 } : undefined} onClick={() => void answer(k)} disabled={choice !== null} className={cn("flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 text-left text-sm transition-all disabled:cursor-default", choice === null ? "border-white/10 bg-white/[.02] hover:border-primary hover:bg-primary/5" : isAns ? "border-success bg-success/10" : picked ? "border-danger bg-danger/10" : "border-white/5 opacity-60")}>
                    <kbd className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border font-mono text-[11px]", isAns ? "border-success text-success" : picked ? "border-danger text-danger" : "border-white/15 text-muted")}>{k + 1}</kbd><span className="flex-1">{o}</span>{isAns && <Check className="h-4 w-4 text-success" />}{picked && !isAns && <X className="h-4 w-4 text-danger" />}</motion.button>); })}</div>
                {choice !== null && !res && <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-muted"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />checking · retrieving the law · explaining…</div>}
                <AnimatePresence>{res && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                  <div className={cn("mt-4 rounded-[12px] border p-4 text-sm", res.correct ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5")}><div className={cn("font-display text-sm tracking-wider", res.correct ? "text-success" : "text-danger")}>{res.correct ? "Correct" : "Not quite"}</div><p className="mt-1">{res.explanation}</p></div>
                  {res.passages && res.passages.length > 0 && <div className="mt-3"><Passages items={res.passages} compact /></div>}
                  <Button className="mt-4" variant="primary" onClick={next}>{i + 1 < qs.length ? "Next question ↵" : "See results ↵"}</Button>
                </motion.div>}</AnimatePresence>
              </Card>
            </motion.div>
          </AnimatePresence>
          <div className="space-y-4"><Card className="flex flex-col items-center p-5"><Ring value={hist.length ? score / hist.length : 0} size={110} color={C.warning} label={`${score}/${hist.length}`} sub="so far" /><div className="mt-2 font-mono text-[10px] text-muted">best {best}</div></Card>
            <Card className="p-4 text-xs text-muted">Keys <kbd className="rounded border border-white/15 px-1">1</kbd>–<kbd className="rounded border border-white/15 px-1">4</kbd> answer · <kbd className="rounded border border-white/15 px-1">↵</kbd> next</Card></div>
        </div>)}
      {done && (
        <motion.div initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="flex flex-col items-center p-8 text-center"><Ring value={score / qs!.length} size={150} stroke={10} color={score / qs!.length >= .6 ? C.success : C.warning} label={`${Math.round(100 * score / qs!.length)}%`} sub={`${score}/${qs!.length}`} /><div className="mt-4 font-display text-lg text-white">{score / qs!.length >= .8 ? "Outstanding" : score / qs!.length >= .6 ? "Pass mark territory" : "Keep training"}</div><p className="mt-1 text-xs text-muted">AIBE pass mark is ~45%. LawLine's own RAG scores 68% on this bank.</p><Button className="mt-4" onClick={start}><RotateCcw className="h-4 w-4" />Another set</Button></Card>
          <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Time per question</div><Chart height={240} data={[{ type: "bar", x: hist.map((_, k) => `Q${k + 1}`), y: hist.map(h => h.ms / 1000), marker: { color: hist.map(h => h.res.correct ? C.success : C.danger) }, hovertemplate: "%{x}: %{y:.1f}s<extra></extra>" }]} layout={{ yaxis: { title: { text: "seconds" } }, margin: { l: 40, r: 10, t: 10, b: 30 } }} />
            <ul className="mt-2 space-y-1 text-sm">{hist.map((h, k) => <li key={k} className="flex gap-2"><span className={h.res.correct ? "text-success" : "text-danger"}>{h.res.correct ? "✓" : "✗"}</span><span className="truncate text-muted">{h.q.question}</span></li>)}</ul></Card>
        </motion.div>)}
    </div>
  );
}
