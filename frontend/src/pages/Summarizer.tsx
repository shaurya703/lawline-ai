import { useState } from "react";
import { Link } from "react-router-dom";
import { Gavel, Printer, Upload } from "lucide-react";
import { api, type Summary } from "@/lib/api";
import { Bullets, Button, Caption, Card, CopyButton, Empty, ErrorBox, Field, H3, Page, Passages, PinButton, Section, Skeleton, Tag, Textarea, UploadButton, Workbench } from "@/components/ui";
import { logActivity } from "@/lib/store";
import { printSection } from "@/lib/export";
import { toHtml } from "@/components/Md";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info";
const OUTCOME: Record<string, Tone> = { allowed: "ok", "partly allowed": "warn", dismissed: "bad", remanded: "info", acquitted: "ok", convicted: "bad", other: "neutral" };
// The summary is model output: JSON mode guarantees the syntax, not that every list is present.
const list = <T,>(x: T[] | undefined): T[] => Array.isArray(x) ? x : [];
const SAMPLE = `IN THE SUPREME COURT OF INDIA — Criminal Appeal No. 1234 of 2019. Appellant: Ramesh Kumar. Respondent: State of Rajasthan. The appellant was convicted by the Sessions Judge under Section 302 IPC for the murder of his neighbour on 12 March 2015 and sentenced to life imprisonment; the High Court affirmed. The prosecution relied on the dying declaration recorded by the Executive Magistrate and on the testimony of PW-3, an eyewitness who turned hostile in part. The defence argued that the dying declaration was not voluntary as the deceased was under sedation, and that the medical evidence (post-mortem showing a single stab wound) was consistent with a sudden quarrel, attracting Exception 4 to Section 300. Held: the dying declaration, corroborated by the certificate of fitness, was reliable; however, the occurrence arose from a sudden fight without premeditation, and the single blow did not show an intention to cause death. The conviction is altered to Section 304 Part I IPC and the sentence reduced to ten years' rigorous imprisonment. Appeal partly allowed.`;

export default function Summarizer() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<Summary | null>(null);
  async function run(t = text) { if (t.trim().length < 40) return; setBusy(true); setErr(null); try { const r = await api.post<Summary>("/summarize", { text: t }); const s = r.summary; setOut({ ...r, passages: list(r.passages), summary: { ...s, facts: list(s.facts), issues: list(s.issues), provisions: list(s.provisions), precedents: list(s.precedents), key_quotes: list(s.key_quotes) } }); logActivity("summarize", r.summary.title || "Judgment summarised", "/app/summarize"); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  async function onFile(f: File) { const t = f.name.toLowerCase().endsWith(".pdf") ? null : await f.text(); if (t) { setText(t); void run(t); } else { setBusy(true); setErr(null); try { const r = await api.upload<{ text?: string }>("/analyze/upload", f); if (r.text) { setText(r.text); await run(r.text); } else setErr("Could not extract text from the PDF. Paste the text instead."); } catch (e) { setErr(String(e)); } finally { setBusy(false); } } }
  const s = out?.summary; const md = s ? `# ${s.title}\n\n**${s.court ?? ""} ${s.year ?? ""}** · ${s.parties}\n\n> ${s.one_liner}\n\n## Facts\n${s.facts.map(f => "- " + f).join("\n")}\n\n## Issues\n${s.issues.map(f => "- " + f).join("\n")}\n\n## Holding\n${s.holding}\n\n## Ratio\n${s.ratio}\n\n**Outcome:** ${s.outcome}\n\n**Provisions:** ${s.provisions.join(", ")}` : "";
  const words = text.split(/\s+/).filter(Boolean).length;
  return (
    <Page title="Judgment Summarizer" desc="Paste a judgment, an order or any long legal document. LawLine sets out the parties, facts, issues, holding, ratio, provisions and outcome, and shows the statutory passages it checked against.">
      <Workbench wide input={
        <Card className="space-y-4">
          <Field label="Judgment text" hint={`${words.toLocaleString()} words. The first 14,000 characters or so are read.`}>
            <Textarea rows={14} value={text} onChange={e => setText(e.target.value)} placeholder="Paste the judgment here…" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void run()} disabled={busy || text.trim().length < 40}><Gavel className="h-4 w-4" aria-hidden />{busy ? "Reading…" : "Summarise"}</Button>
            <UploadButton accept=".txt,.md,.pdf" onFile={f => void onFile(f)}><Upload className="h-4 w-4" aria-hidden />Upload text or PDF</UploadButton>
            <Button variant="ghost" disabled={busy} onClick={() => { setText(SAMPLE); void run(SAMPLE); }}>Try a sample</Button>
          </div>
        </Card>}>
        {err && <ErrorBox error={err} retry={() => void run()} />}
        {busy && <><Skeleton className="h-44" /><div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div></>}
        {!busy && !out && !err && <Empty icon={<Gavel className="h-7 w-7" />} title="The summary will appear here" desc="Set out as facts, issues, holding and ratio, with key quotations and the provisions the judgment turns on." />}
        {!busy && s && (<>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Caption>{s.court ?? "Court not stated"}{s.year ? ` · ${s.year}` : ""}</Caption>
                <h2 className="mt-1 font-serif text-[22px] font-medium leading-snug text-ink">{s.title}</h2>
                <p className="mt-0.5 text-[14px] text-ink-2">{s.parties}</p>
              </div>
              <Tag tone={OUTCOME[s.outcome] ?? "neutral"} className="capitalize">{s.outcome}</Tag>
            </div>
            <blockquote className="mt-4 border-l-2 border-accent pl-4 font-serif text-[18px] leading-snug text-ink">{s.one_liner}</blockquote>
            {s.provisions.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[13px] text-ink-3">Ask Counsel about:</span>{s.provisions.map(p => <Link key={p} to={`/app/counsel?q=${encodeURIComponent("Explain " + p)}`}><Tag tone="accent" className="hover:border-accent">{p}</Tag></Link>)}</div>}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4"><PinButton labelled kind="brief" title={s.title} body={md} meta={{ to: "/app/summarize" }} /><CopyButton labelled text={md} /><Button size="sm" onClick={() => printSection(s.title, toHtml(md).replace(/\n/g, "<br/>"))}><Printer className="h-4 w-4" aria-hidden />Print</Button></div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Facts"><Bullets items={s.facts} /></Section>
            <Section title="Issues"><Bullets ordered items={s.issues} /></Section>
            <Section title="Holding"><p className="text-[14px] leading-relaxed text-ink">{s.holding}</p></Section>
            <Section title="Ratio decidendi"><p className="text-[14px] leading-relaxed text-ink">{s.ratio}</p></Section>
          </div>
          {s.key_quotes?.length > 0 && <Section title="Key quotations" desc="Taken verbatim from the text you supplied."><div className="space-y-3">{s.key_quotes.map((q, i) => <blockquote key={i} className="statute-sm border-l-2 border-line-strong pl-4">{q}</blockquote>)}</div></Section>}
          {s.precedents?.length > 0 && <Section title="Precedents cited"><div className="flex flex-wrap gap-1.5">{s.precedents.map(p => <Tag key={p}>{p}</Tag>)}</div></Section>}
          <div><H3 className="mb-2">Statutory passages consulted</H3><Passages items={out!.passages} compact /></div>
        </>)}
      </Workbench>
    </Page>
  );
}
