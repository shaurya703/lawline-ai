import { useState } from "react";
import { Download, PenLine } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { download } from "@/lib/export";
import { Button, Card, CopyButton, Empty, ErrorBox, Field, H3, Input, Page, Passages, PinButton, Section, Select, Skeleton, Textarea, Workbench } from "@/components/ui";
import Md from "@/components/Md";

type Tpl = { id: string; name: string; fields: string[] };
type Out = { draft: string; passages: { rank: number; citation: string; sources: string[]; text: string }[] };

export default function Drafting() {
  const t = useFetch(() => api.get<Tpl[]>("/draft/templates"));
  const [id, setId] = useState("legal_notice"); const [fields, setFields] = useState<Record<string, string>>({}); const [tone, setTone] = useState("Standard"); const [lang, setLang] = useState("English");
  const [out, setOut] = useState<(Out & { tpl: string }) | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const tpl = t.data?.find(x => x.id === id); const draft = out?.tpl === id ? out : null;
  // Tagged with its template: a draft that arrives after the document type was changed is not shown under the new one.
  async function run() { const at = id; setBusy(true); setErr(null); try { setOut({ ...await api.post<Out>("/draft", { template: at, fields, tone, language: lang }), tpl: at }); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  return (
    <Page title="Drafting Studio" desc="First drafts of notices, complaints, applications and memos, grounded in the provisions LawLine retrieves for your facts. Have a lawyer review any draft before it is used.">
      <Workbench input={
        <Card className="space-y-4">
          {t.error ? <ErrorBox error={t.error} /> : t.loading ? <Skeleton className="h-64" /> : (<>
            <Field label="Document type"><Select value={id} onChange={e => { setId(e.target.value); setFields({}); setOut(null); }}>{t.data?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            {tpl?.fields.map(f => <Field key={f} label={f}>{/facts|grounds|information|sought/i.test(f) ? <Textarea rows={3} value={fields[f] ?? ""} onChange={e => setFields({ ...fields, [f]: e.target.value })} /> : <Input value={fields[f] ?? ""} onChange={e => setFields({ ...fields, [f]: e.target.value })} />}</Field>)}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tone"><Select value={tone} onChange={e => setTone(e.target.value)}>{["Plain", "Standard", "Formal / legalese"].map(x => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Language"><Select value={lang} onChange={e => setLang(e.target.value)}>{["English", "Hindi", "English + Hindi"].map(x => <option key={x}>{x}</option>)}</Select></Field>
            </div>
            <Button variant="primary" className="w-full" disabled={busy} onClick={run}><PenLine className="h-4 w-4" aria-hidden />{busy ? "Drafting…" : "Write the draft"}</Button>
          </>)}
        </Card>}>
        {err && <ErrorBox error={err} retry={run} />}
        {busy && <Skeleton className="h-96" />}
        {!draft && !busy && !err && <Empty icon={<PenLine className="h-7 w-7" />} title="The draft will appear here" desc="Fill in the fields and write the draft. It cites only retrieved statutory passages, and any fact you leave out is marked as a [PLACEHOLDER]." />}
        {draft && !busy && (<>
          <Section title={tpl?.name ?? "Draft"} desc="A first draft. Check every fact and citation before use." actions={<><CopyButton labelled text={draft.draft} /><Button size="sm" onClick={() => download(`${id}.md`, draft.draft)}><Download className="h-4 w-4" aria-hidden />Download</Button><PinButton labelled kind="draft" title={tpl?.name ?? "Draft"} body={draft.draft} meta={{ to: "/app/draft" }} /></>}>
            <Md text={draft.draft} />
          </Section>
          <div><H3 className="mb-2">Provisions used</H3><Passages items={draft.passages} /></div>
        </>)}
      </Workbench>
    </Page>
  );
}
