import { Mic, Palette as PaletteIcon, Sparkles, Wifi } from "lucide-react";
import { settings, toast, type Settings as S } from "@/lib/store";
import { Button, Card, Input, Label, PageHeader, Select, Toggle, H2 } from "@/components/shell/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
const ACCENTS: { id: S["accent"]; c: string }[] = [{ id: "cyan", c: "#00e5ff" }, { id: "violet", c: "#a78bfa" }, { id: "amber", c: "#ffb84d" }, { id: "emerald", c: "#2ee6a6" }, { id: "rose", c: "#ff6b9d" }];
export default function SettingsPage() {
  const s = settings.use();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Workspace" title="Settings" desc="Tune the look, motion and defaults. Everything is stored locally in your browser." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4"><H2 className="flex items-center gap-2 text-base"><PaletteIcon className="h-4 w-4 text-primary" />Appearance</H2>
          <div><div className="mb-2 text-xs text-muted">Accent</div><div className="flex gap-3">{ACCENTS.map(a => <button key={a.id} onClick={() => settings.set({ accent: a.id })} aria-label={a.id} className={cn("h-9 w-9 cursor-pointer rounded-full border-2 transition-transform hover:scale-110", s.accent === a.id ? "border-white" : "border-transparent")} style={{ background: a.c, boxShadow: `0 0 16px ${a.c}88` }} />)}</div></div>
          <Label>Density<Select value={s.density} onChange={e => settings.set({ density: e.target.value as S["density"] })}><option value="comfortable">Comfortable</option><option value="compact">Compact (wider canvas)</option></Select></Label>
          <Toggle checked={s.motion === "full"} onChange={v => settings.set({ motion: v ? "full" : "reduced" })} label="Ambient motion & effects" />
          <Toggle checked={s.typewriter} onChange={v => settings.set({ typewriter: v })} label="Typewriter reveal for new answers" />
        </Card>
        <Card className="space-y-4"><H2 className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Counsel defaults</H2>
          <Label>Answer style<Select value={s.style} onChange={e => settings.set({ style: e.target.value })}>{["Plain English", "Formal legal memo", "Law student", "One-line answer"].map(x => <option key={x}>{x}</option>)}</Select></Label>
          <Label>Also translate to<Select value={s.lang} onChange={e => settings.set({ lang: e.target.value })}>{["—", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali", "Gujarati", "Malayalam", "Punjabi"].map(x => <option key={x}>{x}</option>)}</Select></Label>
          <Toggle checked={s.rerank} onChange={v => settings.set({ rerank: v })} label="Cross-encoder reranker" />
        </Card>
        <Card className="space-y-4"><H2 className="flex items-center gap-2 text-base"><Mic className="h-4 w-4 text-primary" />Voice</H2>
          <Toggle checked={s.voice} onChange={v => settings.set({ voice: v })} label="Show microphone (dictate questions)" />
          <Toggle checked={s.autoSpeak} onChange={v => settings.set({ autoSpeak: v })} label="Read answers aloud automatically" />
          <p className="text-xs text-muted">Uses the browser's Web Speech API; nothing is sent to a third-party voice service.</p>
        </Card>
        <Card className="space-y-4"><H2 className="flex items-center gap-2 text-base"><Wifi className="h-4 w-4 text-primary" />Connection</H2>
          <Label>API base URL override<Input placeholder={(import.meta.env.VITE_API_BASE as string) || "/api"} value={s.apiBase} onChange={e => settings.set({ apiBase: e.target.value.trim() })} /></Label>
          <div className="flex gap-2"><Button size="sm" onClick={async () => { const r = await api.health(); toast(r.ok ? `API reachable · ${Math.round(r.ms)} ms` : "API unreachable", r.ok ? "ok" : "err"); }}>Test connection</Button><Button size="sm" variant="ghost" onClick={() => settings.set({ apiBase: "" })}>Reset</Button></div>
          <p className="text-xs text-muted">Point the app at a local backend (<code className="font-mono">http://localhost:8000</code>) or a tunnel.</p>
        </Card>
      </div>
    </div>
  );
}
