import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Chart, C } from "@/lib/plotly";
type Act = { act: string; sections: number; year: number | null };
/** Auto-rotating 3D scatter of every Act in the corpus: x = year, y = log(sections), z = hashed cluster; size = sections. */
export default function Constellation({ acts, height = 420, onPick }: { acts: Act[]; height?: number; onPick?: (act: string) => void }) {
  const reduce = useReducedMotion(); const [angle, setAngle] = useState(0.6); const paused = useRef(false); const host = useRef<HTMLDivElement>(null); const visible = useRef(true);
  useEffect(() => { const el = host.current; if (!el) return; const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; }); io.observe(el); return () => io.disconnect(); }, []);
  useEffect(() => { if (reduce) return; const id = setInterval(() => { if (!paused.current && visible.current && !document.hidden) setAngle(a => a + 0.02); }, 80); return () => clearInterval(id); }, [reduce]);
  const pts = useMemo(() => acts.filter(a => a.year).map(a => { let h = 0; for (const ch of a.act) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return { ...a, z: (h % 1000) / 1000 - 0.5, y: Math.log10(a.sections + 1) }; }), [acts]);
  const eye = { x: 1.9 * Math.cos(angle), y: 1.9 * Math.sin(angle), z: 0.9 };
  return (
    <div ref={host} onPointerEnter={() => { paused.current = true; }} onPointerLeave={() => { paused.current = false; }}>
      <Chart height={height} data={[{ type: "scatter3d", mode: "markers", x: pts.map(p => p.year), y: pts.map(p => p.y), z: pts.map(p => p.z), text: pts.map(p => `${p.act}<br>${p.sections} sections · ${p.year}`), hovertemplate: "%{text}<extra></extra>",
        marker: { size: pts.map(p => Math.max(3, Math.min(22, Math.sqrt(p.sections) * 0.9))), color: pts.map(p => p.year!), colorscale: [[0, C.secondary], [0.5, C.primary], [1, C.success]], opacity: .85, line: { width: 0 } } } as never]}
        layout={{ margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, scene: { camera: { eye }, xaxis: { title: { text: "year" }, gridcolor: "rgba(139,155,180,.12)", color: C.muted, showbackground: false }, yaxis: { title: { text: "log sections" }, gridcolor: "rgba(139,155,180,.12)", color: C.muted, showbackground: false }, zaxis: { visible: false }, bgcolor: "rgba(0,0,0,0)", dragmode: "orbit" }, uirevision: "keep" }}
        onClick={onPick ? (e: { points?: { pointNumber: number }[] }) => { const i = e.points?.[0]?.pointNumber; if (i !== undefined && pts[i]) onPick(pts[i].act); } : undefined} />
    </div>
  );
}
