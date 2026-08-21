import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import type { Layout, Config, Data } from "plotly.js";
const Plot = createPlotlyComponent(Plotly);
export const C = { primary: "#00e5ff", secondary: "#7c4dff", success: "#2ee6a6", warning: "#ffd166", danger: "#ff4d6d", muted: "#8b9bb4", fg: "#dfe7f5", elev: "#0e1628" };
export const PALETTE = [C.primary, C.secondary, C.warning, C.success, C.danger, "#ff9f43", "#48dbfb", "#c8d6e5"];
const axis = { gridcolor: "rgba(139,155,180,.12)", zerolinecolor: "rgba(139,155,180,.2)", color: C.muted, tickfont: { family: "JetBrains Mono", size: 11 } };
export function layout(extra: Partial<Layout> = {}): Partial<Layout> {
  return { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: "Inter, sans-serif", color: C.fg, size: 12 }, colorway: PALETTE,
    xaxis: axis, yaxis: axis, legend: { bgcolor: "rgba(0,0,0,0)", orientation: "h", y: -0.18 }, margin: { l: 40, r: 16, t: 40, b: 40 },
    hoverlabel: { bgcolor: C.elev, bordercolor: C.primary, font: { color: C.fg } },
    scene: { xaxis: { ...axis, backgroundcolor: "rgba(0,0,0,0)", showbackground: false }, yaxis: { ...axis, backgroundcolor: "rgba(0,0,0,0)", showbackground: false }, zaxis: { ...axis, backgroundcolor: "rgba(0,0,0,0)", showbackground: false }, bgcolor: "rgba(0,0,0,0)" },
    ...extra };
}
export const config: Partial<Config> = { displayModeBar: true, displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d"], toImageButtonOptions: { format: "png", scale: 2 } };
export function Chart({ data, layout: l, height = 360, style }: { data: Data[]; layout?: Partial<Layout>; height?: number; style?: React.CSSProperties }) {
  return <Plot data={data} layout={layout({ height, ...l })} config={config} useResizeHandler style={{ width: "100%", height, ...style }} />;
}
