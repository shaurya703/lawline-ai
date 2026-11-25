import { useEffect, useState } from "react";
import { Check, GraduationCap, RotateCcw, X } from "lucide-react";
import { api, measuredOn, type QuizCheck, type QuizQ, type Stats } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Callout, Caption, Card, Empty, ErrorBox, Page, Passages, Progress, Section, Select, Skeleton, Stat, StatStrip } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/store";

type Rec = { q: QuizQ; choice: number; res: QuizCheck; ms: number };
export default function Trainer() {
  const [n, setN] = useState(5); const [qs, setQs] = useState<QuizQ[] | null>(null); const [i, setI] = useState(0); const [choice, setChoice] = useState<number | null>(null); const [res, setRes] = useState<QuizCheck | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [hist, setHist] = useState<Rec[]>([]); const [t0, setT0] = useState(0); const [best, setBest] = useState(() => { try { return Number(localStorage.getItem("lawline.quiz.best") || 0); } catch { return 0; } });
  async function start() { setBusy(true); setErr(null); setHist([]); setI(0); setChoice(null); setRes(null); try { const r = await api.get<{ total: number; questions: QuizQ[] }>(`/quiz?n=${n}&seed=${Math.floor(Math.random() * 1e6)}`); setQs(r.questions); setT0(performance.now()); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  async function answer(c: number) { if (!qs || choice !== null) return; setChoice(c); setBusy(true); setErr(null); try { const r = await api.post<QuizCheck>("/quiz/check", { id: qs[i].id, choice: c, explain: true }); setRes(r); setHist(h => [...h, { q: qs[i], choice: c, res: r, ms: performance.now() - t0 }]); } catch (e) { setErr(String(e)); setChoice(null); } finally { setBusy(false); } }   // a failed check leaves the question answerable
  function next() { setI(x => x + 1); setChoice(null); setRes(null); setT0(performance.now()); }
  const st = useFetch(() => api.get<Stats>("/stats")); const aibe = st.data?.answer_eval?.aibe;
  const done = !!qs && i >= qs.length; const score = hist.filter(h => h.res.correct).length;
  useEffect(() => { if (done && score > best) { setBest(score); try { localStorage.setItem("lawline.quiz.best", String(score)); } catch { /* storage blocked */ } } if (done) logActivity("trainer", `Scored ${score}/${qs!.length} on AIBE set`, "/app/trainer"); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (qs && !done && choice === null && ["1", "2", "3", "4"].includes(e.key)) void answer(Number(e.key) - 1); if (res && e.key === "Enter") next(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
  const pct = qs && done ? score / qs.length : 0;
  return (
    <Page title="Bar Exam Trainer" desc="Real All India Bar Examination multiple-choice questions, 498 in the bank. After each answer LawLine retrieves the governing passages and explains why."
      actions={<><Select value={n} onChange={e => setN(Number(e.target.value))} className="w-36" aria-label="Number of questions">{[5, 10, 15, 20].map(x => <option key={x} value={x}>{x} questions</option>)}</Select><Button variant="primary" onClick={start} disabled={busy}><GraduationCap className="h-4 w-4" />{qs ? "New set" : "Start"}</Button></>}>
      {err && <ErrorBox error={err} />}
      {!qs && !busy && <Empty icon={<GraduationCap className="h-7 w-7" />} title="Choose a set size and press Start" desc={<>Answer with keys <kbd>1</kbd> to <kbd>4</kbd> and move on with <kbd>↵</kbd>. Your best score is kept in this browser{best > 0 ? <>; so far it is <span className="num font-medium text-ink">{best}</span></> : null}.</>} />}
      {busy && !qs && <Skeleton className="h-80" />}
      {qs && !done && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <Card>
            <div className="flex items-center justify-between text-[12.5px] text-ink-3"><span className="num">Question {i + 1} of {qs.length}</span><span className="font-mono">{qs[i].id}</span></div>
            <div className="mt-2 flex gap-1" aria-hidden>{qs.map((_, k) => <span key={k} className={cn("h-1 flex-1 rounded-full", k < i ? (hist[k]?.res.correct ? "bg-ok" : "bg-bad") : k === i ? "bg-ink" : "bg-line")} />)}</div>
            <h2 className="mt-5 font-serif text-[20px] font-medium leading-snug text-ink">{qs[i].question}</h2>
            <div className="mt-5 grid gap-2">{qs[i].options.map((o, k) => { const picked = choice === k; const isAns = !!res && res.answer === k; return (
              <button key={k} onClick={() => void answer(k)} disabled={choice !== null} className={cn("flex items-center gap-3 rounded-md border p-3 text-left text-[14.5px] transition-colors", choice === null ? "border-line-strong bg-surface hover:border-ink-3 hover:bg-sunken" : isAns ? "border-ok/40 bg-ok-soft" : picked ? "border-bad/40 bg-bad-soft" : "border-line text-ink-3")}>
                <kbd>{k + 1}</kbd><span className="flex-1">{o}</span>
                {isAns && <span className="flex items-center gap-1 text-[12.5px] font-medium text-ok"><Check className="h-4 w-4" aria-hidden />Correct answer</span>}
                {picked && res && !isAns && <span className="flex items-center gap-1 text-[12.5px] font-medium text-bad"><X className="h-4 w-4" aria-hidden />Your answer</span>}
              </button>); })}</div>
            {choice !== null && !res && <p className="mt-4 text-[13.5px] text-ink-3" role="status">Checking the answer and retrieving the governing law…</p>}
            {res && <div className="mt-5 space-y-4">
              <Callout tone={res.correct ? "ok" : "bad"} title={res.correct ? "Correct" : "Not quite"}>{res.explanation}</Callout>
              {res.passages && res.passages.length > 0 && <Passages items={res.passages} compact />}
              <Button variant="primary" onClick={next}>{i + 1 < qs.length ? "Next question" : "See results"} <kbd className="border-white/30 bg-transparent text-white">↵</kbd></Button>
            </div>}
          </Card>
          <Card as="aside">
            <div className="text-[12.5px] text-ink-3">Score so far</div>
            <div className="num mt-1 font-serif text-[30px] font-medium leading-none text-ink">{score}<span className="text-ink-3"> / {hist.length}</span></div>
            <Progress value={hist.length ? score / hist.length : 0} tone="ok" className="mt-3" />
            <Caption className="mt-3">Best score in this browser: <span className="num">{best}</span></Caption>
            <Caption className="mt-3 border-t border-line pt-3"><kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>↵</kbd> next</Caption>
          </Card>
        </div>)}
      {done && qs && (<>
        <StatStrip>
          <Stat label="Score" value={`${score} / ${qs.length}`} sub={pct >= 0.8 ? "Outstanding" : pct >= 0.6 ? "Comfortably above the pass mark" : pct >= 0.45 ? "Around the pass mark" : "Below the pass mark"} />
          <Stat label="Accuracy" value={`${Math.round(100 * pct)}%`} sub="AIBE pass mark is about 45%" />
          <Stat label="LawLine on this bank" value={aibe ? `${Math.round(aibe.rag_acc * 100)}%` : "…"} sub={aibe ? `retrieval-augmented, n = ${aibe.n}${measuredOn(st.data)}` : " "} />
          <Stat label="Best in this browser" value={best} sub="questions correct in one set" />
        </StatStrip>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Section title="Time per question" desc="Seconds taken. Blue bars were answered correctly, red incorrectly.">
            <Chart height={240} data={[{ type: "bar", x: hist.map((_, k) => `Q${k + 1}`), y: hist.map(h => h.ms / 1000), marker: { color: hist.map(h => h.res.correct ? C.primary : C.danger) }, text: hist.map(h => h.res.correct ? "✓" : "✗"), textposition: "outside", cliponaxis: false, hovertemplate: "%{x}: %{y:.1f} s<extra></extra>" }]} layout={{ yaxis: { title: { text: "seconds" } }, margin: { l: 44, r: 10, t: 20, b: 30 } }} />
          </Section>
          <Section title="Your answers" actions={<Button size="sm" onClick={start}><RotateCcw className="h-4 w-4" />Another set</Button>}>
            <ol className="-my-1 divide-y divide-line">{hist.map((h, k) => <li key={k} className="flex items-start gap-2.5 py-2 text-[13.5px]">{h.res.correct ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Correct" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="Incorrect" />}<span className="line-clamp-2 text-ink-2">{h.q.question}</span></li>)}</ol>
          </Section>
        </div>
      </>)}
    </Page>
  );
}
