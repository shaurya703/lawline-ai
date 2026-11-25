import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Banknote, Briefcase, Car, ChevronRight, FileWarning, Home, MessageSquareText, Search, Shield, ShoppingBag, Siren, Wifi, type LucideIcon } from "lucide-react";
import { api, type RightsDetail, type RightsItem } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Card, ErrorBox, H3, Page, PinButton, Progress, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
const ICONS: Record<string, LucideIcon> = { handcuffs: Siren, "file-warning": FileWarning, banknote: Banknote, home: Home, "shopping-bag": ShoppingBag, shield: Shield, car: Car, search: Search, briefcase: Briefcase, wifi: Wifi };

export default function Rights() {
  const [params, setParams] = useSearchParams(); const id = params.get("s");
  const list = useFetch(() => api.get<RightsItem[]>("/rights"));
  const det = useFetch(() => id ? api.get<RightsDetail>(`/rights?scenario=${id}`) : Promise.resolve(null), [id]);
  const [step, setStep] = useState(0);
  const d = det.data;
  return (
    <Page title="Rights Guides" desc="What to do in a common situation, in what order, and which provision gives you the right. Each step links to the statute text."
      actions={id && <Button onClick={() => { setParams({}); setStep(0); }}><ArrowLeft className="h-4 w-4" />All guides</Button>}>
      {list.error ? <ErrorBox error={list.error} /> : !id ? (
        !list.data ? <Skeleton className="h-96" /> : (
          <Card flush className="grid overflow-hidden sm:grid-cols-2">
            {list.data.map(r => { const I = ICONS[r.icon] ?? Shield; return (
              <button key={r.id} onClick={() => { setParams({ s: r.id }); setStep(0); }} className="group flex items-start gap-3.5 border-b border-line p-5 text-left transition-colors hover:bg-sunken sm:odd:border-r">
                <I className="mt-0.5 h-5 w-5 shrink-0 text-ink-3 group-hover:text-accent" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-ink group-hover:text-accent">{r.title}</span><span className="mt-0.5 block text-[13.5px] text-ink-3">{r.summary}</span></span>
                <span className="num flex shrink-0 items-center gap-1 text-[12.5px] text-ink-3">{r.steps} steps<ChevronRight className="h-3.5 w-3.5" aria-hidden /></span>
              </button>); })}
          </Card>)
      ) : det.error ? <ErrorBox error={det.error} /> : !d ? <Skeleton className="h-96" /> : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card flush>
            <div className="border-b border-line p-5">
              <h2 className="font-serif text-[22px] font-medium text-ink">{d.title}</h2><p className="mt-1 text-[14px] text-ink-2">{d.summary}</p>
              <div className="mt-4 flex items-center gap-3"><Progress value={(step + 1) / d.steps.length} className="flex-1" /><span className="num shrink-0 text-[12.5px] text-ink-3">Step {step + 1} of {d.steps.length}</span></div>
            </div>
            <ol className="p-5">
              {d.steps.map((s, i) => (
                <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < d.steps.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-28px)] w-px bg-line" aria-hidden />}
                  <button onClick={() => setStep(i)} aria-label={`Go to step ${i + 1}`} aria-current={i === step ? "step" : undefined} className={cn("num relative flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border text-[12px] font-medium transition-colors", i <= step ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-3 hover:border-ink-3")}>{i + 1}</button>
                  <p onClick={() => setStep(i)} className={cn("cursor-pointer pt-0.5 text-[15px] leading-relaxed", i > step ? "text-ink-3" : "text-ink")}>{s}</p>
                </li>))}
            </ol>
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
              <Button variant="primary" onClick={() => setStep(s => Math.min(d.steps.length - 1, s + 1))} disabled={step >= d.steps.length - 1}>Next step</Button>
              <Link to={`/app/counsel?q=${encodeURIComponent(d.title + " — what are my options and rights in detail?")}`}><Button><MessageSquareText className="h-4 w-4" />Ask Counsel about this</Button></Link>
              <span className="ml-auto"><PinButton labelled kind="note" title={d.title} body={d.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")} meta={{ to: `/app/rights?s=${id}` }} /></span>
            </div>
          </Card>
          <aside>
            <H3 className="mb-3">Provisions behind the steps</H3>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {d.provisions.map((p, i) => (
                <li key={i} className="p-4">
                  <div className="text-[14px] font-semibold text-ink">{p.act.startsWith("Constitution") ? "Article" : "Section"} {p.section}</div>
                  <div className="text-[12.5px] text-ink-3">{p.act}{p.title ? ` · ${p.title.split(" — ")[0]}` : ""}</div>
                  {p.text && <p className="statute-sm mt-2 line-clamp-3">{p.text.replace(/^.*?—\s*Section \S+\.\s*/, "")}</p>}
                  {p.doc_id && <Link to={`/app/provisions?doc=${encodeURIComponent(p.doc_id)}`} className="link mt-2 inline-block text-[13px]">Read the full text</Link>}
                </li>))}
            </ul>
          </aside>
        </div>
      )}
    </Page>
  );
}
