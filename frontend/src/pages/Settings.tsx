import { ACCENTS, settings, toast, type Settings as S } from "@/lib/store";
import { Button, Caption, Field, Input, Page, Section, Select, Toggle } from "@/components/ui";
import { api, resolveBase } from "@/lib/api";
import { cn } from "@/lib/utils";

const SWATCH: Record<S["accent"], [string, string]> = { oxblood: ["Oxblood", "#7b1e2b"], navy: ["Navy", "#1d3f6e"], forest: ["Forest", "#1f5a41"], plum: ["Plum", "#5b3a6e"], slate: ["Slate", "#3d4654"] };
export default function SettingsPage() {
  const s = settings.use();
  return (
    <Page title="Settings" desc="Appearance and defaults. Everything here is stored in this browser only.">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Appearance">
          <div className="space-y-5">
            <div><div className="mb-2 text-[13px] font-medium text-ink-2">Accent colour</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">{ACCENTS.map(a => <button key={a} role="radio" aria-checked={s.accent === a} onClick={() => settings.set({ accent: a })} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors", s.accent === a ? "border-ink font-medium text-ink" : "border-line text-ink-2 hover:border-line-strong")}><span className="h-3.5 w-3.5 rounded-full" style={{ background: SWATCH[a][1] }} aria-hidden />{SWATCH[a][0]}</button>)}</div>
              <Caption className="mt-2">Used for links, the active page and citation markers.</Caption></div>
            <Field label="Page width"><Select value={s.density} onChange={e => settings.set({ density: e.target.value as S["density"] })}><option value="comfortable">Comfortable</option><option value="compact">Wide (more room for tables and charts)</option></Select></Field>
            <Toggle checked={s.sidebar === "expanded"} onChange={v => settings.set({ sidebar: v ? "expanded" : "hidden" })} label="Show the sidebar" hint="You can also toggle it from the top bar." />
            <Toggle checked={s.motion === "full"} onChange={v => settings.set({ motion: v ? "full" : "reduced" })} label="Transitions" hint="Turn off to remove all movement, including the answer reveal." />
            <Toggle checked={s.typewriter} onChange={v => settings.set({ typewriter: v })} label="Reveal new answers progressively" />
          </div>
        </Section>
        <Section title="Counsel defaults">
          <div className="space-y-5">
            <Field label="Answer style"><Select value={s.style} onChange={e => settings.set({ style: e.target.value })}>{["Plain English", "Formal legal memo", "Law student", "One-line answer"].map(x => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="Also translate answers to"><Select value={s.lang} onChange={e => settings.set({ lang: e.target.value })}>{["—", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali", "Gujarati", "Malayalam", "Punjabi"].map(x => <option key={x} value={x}>{x === "—" ? "Off" : x}</option>)}</Select></Field>
            <Toggle checked={s.rerank} onChange={v => settings.set({ rerank: v })} label="Cross-encoder reranking" hint="Re-scores retrieved passages against the question. Slower, usually more precise." />
          </div>
        </Section>
        <Section title="Voice">
          <div className="space-y-5">
            <Toggle checked={s.voice} onChange={v => settings.set({ voice: v })} label="Show the microphone in Counsel" hint="Dictate a question instead of typing it." />
            <Toggle checked={s.autoSpeak} onChange={v => settings.set({ autoSpeak: v })} label="Read answers aloud automatically" />
            <Caption>Voice uses the browser's own speech features. Nothing is sent to a separate voice service.</Caption>
          </div>
        </Section>
        <Section title="Connection">
          <div className="space-y-4">
            <Field label="API address" hint="Leave empty to use the default. Point it at a local backend (http://localhost:8000) or a tunnel."><Input placeholder={(import.meta.env.VITE_API_BASE as string) || "/api"} value={s.apiBase} onChange={e => settings.set({ apiBase: e.target.value.trim() })} /></Field>
            <div className="flex gap-2"><Button size="sm" onClick={async () => { await resolveBase(true); const r = await api.health(); const want = s.apiBase.trim().replace(/\/+$/, ""); const fellBack = r.ok && !!want && r.base !== want; toast(!r.ok ? "API unreachable on every candidate address" : fellBack ? `${want} did not answer. Using ${r.base}` : `API reachable at ${r.base} · ${Math.round(r.ms)} ms`, !r.ok ? "err" : fellBack ? "warn" : "ok"); }}>Test connection</Button><Button size="sm" variant="ghost" onClick={() => settings.set({ apiBase: "" })}>Reset</Button></div>
          </div>
        </Section>
      </div>
    </Page>
  );
}
