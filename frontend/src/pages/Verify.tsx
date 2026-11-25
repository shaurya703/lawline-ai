import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldX } from "lucide-react";
import { api, type VerifyOut } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Field, Page, Progress, Section, Skeleton, Stat, Textarea, Workbench } from "@/components/ui";
import { cn } from "@/lib/utils";

const SAMPLE = `The accused is charged under Section 420 IPC and Section 120B of the Indian Penal Code, read with Section 66D of the Information Technology Act, 2000. The complainant also invokes Article 21 of the Constitution and Section 138 of the Negotiable Instruments Act, 1881. Counsel cited Section 999 BNS and Section 482 CrPC for quashing.`;

export default function Verify() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<VerifyOut | null>(null);
  async function run(t = text) { if (t.trim().length < 3) return; setBusy(true); setErr(null); try { setOut(await api.post<VerifyOut>("/verify", { text: t })); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const marked = useMemo(() => { if (!out) return null; let i = 0; const parts: { t: string; c?: VerifyOut["citations"][number] }[] = []; const src = text; out.citations.forEach(c => { const at = src.indexOf(c.span, i); if (at < 0) return; parts.push({ t: src.slice(i, at) }); parts.push({ t: c.span, c }); i = at + c.span.length; }); parts.push({ t: src.slice(i) }); return parts; }, [out, text]);
  const share = out?.total ? out.verified / out.total : 0;
  return (
    <Page title="Citation Verifier" desc="Paste a draft, a memo or a machine-written answer. Every “Section X of Y” is checked against the provisions in the corpus, so a section that does not exist is caught before it reaches a filing.">
      <Workbench input={
        <Card className="space-y-4">
          <Field label="Text to check"><Textarea rows={12} value={text} onChange={e => setText(e.target.value)} placeholder="Paste text with statutory citations…" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void run()} disabled={busy || text.trim().length < 3}><ShieldCheck className="h-4 w-4" aria-hidden />{busy ? "Checking…" : "Verify citations"}</Button>
            <Button variant="ghost" onClick={() => { setText(SAMPLE); void run(SAMPLE); }}>Try a sample</Button>
          </div>
        </Card>}>
        {err && <ErrorBox error={err} retry={() => void run()} />}
        {busy && <><Skeleton className="h-[112px]" /><Skeleton className="h-56" /></>}
        {!busy && !out && !err && <Empty icon={<ShieldCheck className="h-7 w-7" />} title="The verification report will appear here" desc="A count of the citations that resolve to a real provision, your text with each citation marked, and a line for every citation." />}
        {!busy && out && (<>
          <Card flush>
            <Stat label="Citations verified" value={`${out.verified} of ${out.total}`} sub="resolved to a real provision in the corpus" />
            <div className="px-5 pb-5"><Progress value={share} tone={out.verified === out.total ? "ok" : share > 0.6 ? "warn" : "bad"} /></div>
          </Card>
          {marked && (
            <Section title="Your text, marked" desc="Citations found in the corpus are shaded green; those not found are shaded red and underlined.">
              <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-ink">{marked.map((p, i) => p.c ? <mark key={i} title={p.c.found ? `Found: ${p.c.title ?? ""}` : "Not found in the corpus"} className={cn("rounded px-1 py-0.5 text-ink", p.c.found ? "bg-ok-soft" : "bg-bad-soft underline decoration-bad decoration-wavy underline-offset-4")}>{p.t}</mark> : <span key={i}>{p.t}</span>)}</p>
            </Section>)}
          <Section title="Each citation" flush>
            <ul className="divide-y divide-line border-t border-line">
              {out.citations.map((c, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  {c.found ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-[14px] font-medium text-ink">{c.span}</span><span className="text-[12.5px] text-ink-3">{c.found ? "Found" : "Not found"} · {c.act_guess ?? "Act not recognised"}</span></div>
                    {c.found && c.doc_id && <Link to={`/app/provisions?doc=${encodeURIComponent(c.doc_id)}`} className="link text-[13px]">{c.title?.split(" — ")[0].slice(0, 70) || "Open the provision"}</Link>}
                    {!c.found && <p className="text-[13px] text-ink-2">No such provision in the corpus. Check the section number or the Act.</p>}
                  </div>
                </li>))}
              {!out.citations.length && <li className="px-5 py-4 text-[14px] text-ink-3">No statutory citations were found in this text.</li>}
            </ul>
          </Section>
        </>)}
      </Workbench>
    </Page>
  );
}
