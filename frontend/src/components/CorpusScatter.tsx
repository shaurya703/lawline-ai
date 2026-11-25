import { useMemo } from "react";
import { Chart, SEQ } from "@/lib/plotly";
type Act = { act: string; sections: number; year: number | null };
/** Every Act in the corpus as a point: x = year enacted, y = number of sections (log), size = sections. Drag to orbit, click to open. */
export default function CorpusScatter({ acts, height = 460, onPick }: { acts: Act[]; height?: number; onPick?: (act: string) => void }) {
  const pts = useMemo(() => acts.filter(a => a.year).map(a => { let h = 0; for (const ch of a.act) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return { ...a, z: (h % 1000) / 1000 - 0.5, y: Math.log10(a.sections + 1) }; }), [acts]);
  return (
    <Chart height={height} data={[{ type: "scatter3d", mode: "markers", x: pts.map(p => p.year), y: pts.map(p => p.y), z: pts.map(p => p.z), text: pts.map(p => `${p.act}<br>${p.sections} sections · ${p.year}`), hovertemplate: "%{text}<extra></extra>",
      marker: { size: pts.map(p => Math.max(3, Math.min(22, Math.sqrt(p.sections) * 0.9))), color: pts.map(p => p.year!), colorscale: SEQ, opacity: 0.85, line: { width: 0 } } } as never]}
      layout={{ margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, scene: { camera: { eye: { x: 1.5, y: -1.5, z: 0.7 } }, xaxis: { title: { text: "year enacted" } }, yaxis: { title: { text: "sections (log)" } }, zaxis: { visible: false }, dragmode: "orbit" } as never, uirevision: "keep" }}
      onClick={onPick ? (e: { points?: { pointNumber: number }[] }) => { const i = e.points?.[0]?.pointNumber; if (i !== undefined && pts[i]) onPick(pts[i].act); } : undefined} />
  );
}
