import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Banknote, Briefcase, Car, FileWarning, Home, MessageSquare, Search, Shield, ShoppingBag, Siren, Wifi, type LucideIcon } from "lucide-react";
import { api, type RightsDetail, type RightsItem } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Card, ErrorBox, PageHeader, PinButton, Skeleton, Stagger, item } from "@/components/shell/ui";
import Tilt from "@/components/fx/Tilt";
import { cn } from "@/lib/utils";
const ICONS: Record<string, LucideIcon> = { handcuffs: Siren, "file-warning": FileWarning, banknote: Banknote, home: Home, "shopping-bag": ShoppingBag, shield: Shield, car: Car, search: Search, briefcase: Briefcase, wifi: Wifi };
const HUES = ["#ff4d6d", "#ffd166", "#2ee6a6", "#00e5ff", "#7c4dff", "#ff9f43", "#48dbfb", "#b39dff", "#2ee6a6", "#ff6b9d"];

export default function Rights() {
  const [params, setParams] = useSearchParams(); const id = params.get("s");
  const list = useFetch(() => api.get<RightsItem[]>("/rights"));
  const det = useFetch(() => id ? api.get<RightsDetail>(`/rights?scenario=${id}`) : Promise.resolve(null), [id]);
  const [step, setStep] = useState(0);
  if (list.error) return <ErrorBox error={list.error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Know your rights" title="Rights Guides" desc="Situational playbooks — what to do, in what order, and which provision gives you the right. Each step links to the statute text." actions={id && <Button onClick={() => { setParams({}); setStep(0); }}><ArrowLeft className="h-4 w-4" />All guides</Button>} />
      <AnimatePresence mode="wait">
        {!id ? (
          <Stagger key="grid" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.data ? list.data.map((r, i) => { const I = ICONS[r.icon] ?? Shield; const hue = HUES[i % HUES.length]; return (
              <motion.div key={r.id} variants={item}><Tilt className="group h-full"><button onClick={() => { setParams({ s: r.id }); setStep(0); }} className="glass glow-border spot-card relative h-full w-full cursor-pointer rounded-[16px] p-5 text-left transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,.8)]" style={{ ["--cx" as string]: "50%" }}>
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] border" style={{ borderColor: hue + "55", background: hue + "14", boxShadow: `0 0 18px ${hue}33` }}><I className="h-5 w-5" style={{ color: hue }} /></div>
                <h3 className="mt-4 font-display text-[15px] tracking-wide text-white">{r.title}</h3><p className="mt-1 text-sm text-muted">{r.summary}</p>
                <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted"><span>{r.steps} steps</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: hue }} /></div>
              </button></Tilt></motion.div>); }) : Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
          </Stagger>
        ) : det.error ? <ErrorBox error={det.error} /> : !det.data ? <Skeleton className="h-96" /> : (
          <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Card className="p-0">
              <div className="border-b border-white/10 p-6"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Playbook</div><h3 className="mt-1 font-display text-2xl text-white">{det.data.title}</h3><p className="mt-1 text-sm text-muted">{det.data.summary}</p>
                <div className="mt-4 flex gap-1">{det.data.steps.map((_, i) => <button key={i} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`} className={cn("h-1.5 flex-1 cursor-pointer rounded-full transition-all", i <= step ? "bg-primary shadow-[0_0_8px_var(--primary)]" : "bg-white/10")} />)}</div></div>
              <ol className="p-6">
                {det.data.steps.map((s, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .06 }} className={cn("relative flex gap-4 border-l border-white/10 pb-6 pl-6 last:pb-0", i > step && "opacity-50")} onClick={() => setStep(i)}>
                    <span className={cn("absolute -left-[13px] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border font-mono text-[11px] transition-all", i <= step ? "border-primary bg-primary text-bg shadow-[0_0_12px_var(--primary)]" : "border-white/20 bg-bg text-muted")}>{i + 1}</span>
                    <p className="cursor-pointer text-[15px] leading-relaxed">{s}</p>
                  </motion.li>))}
              </ol>
              <div className="flex flex-wrap gap-2 border-t border-white/10 p-4"><Button size="sm" onClick={() => setStep(s => Math.min(det.data!.steps.length - 1, s + 1))} disabled={step >= det.data.steps.length - 1} variant="primary">Next step</Button><Link to={`/app/counsel?q=${encodeURIComponent(det.data.title + " — what are my options and rights in detail?")}`}><Button size="sm"><MessageSquare className="h-4 w-4" />Ask Counsel about this</Button></Link><PinButton size="md" kind="note" title={det.data.title} body={det.data.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")} meta={{ to: `/app/rights?s=${id}` }} /></div>
            </Card>
            <div className="space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Provisions behind the steps</div>
              {det.data.provisions.map((p, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 + i * .05 }} className="glass rounded-[12px] p-4 text-sm">
                  <div className="flex items-center justify-between gap-2"><strong className="text-white">{p.act.startsWith("Constitution") ? "Art." : "s."} {p.section}</strong><span className="truncate font-mono text-[10px] text-muted">{p.act}</span></div>
                  {p.title && <div className="mt-1 text-xs text-muted">{p.title.split(" — ")[0]}</div>}
                  {p.text && <p className="mt-2 line-clamp-3 text-xs text-muted">{p.text.replace(/^.*?—\s*Section \S+\.\s*/, "")}</p>}
                  {p.doc_id && <Link to={`/app/provisions?doc=${encodeURIComponent(p.doc_id)}`} className="mt-2 inline-block font-mono text-[11px] text-primary hover:underline">Read full text →</Link>}
                </motion.div>))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
