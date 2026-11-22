import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import type { Layout, Config, Data } from "plotly.js";
const Plot = createPlotlyComponent(Plotly);

/** Chart colours. Categorical hues are used in this fixed order (validated for colour-vision separation on the
 *  light surface); `muted` is the baseline / comparison series. Brand accent is deliberately not a chart colour. */
export const C = { primary: "#2a78d6", secondary: "#6250d6", success: "#1baf7a", warning: "#eb6834", danger: "#e34948", muted: "#a9a59b", fg: "#16181d", sub: "#6b717c", grid: "#e5e2da", surface: "#ffffff" };
export const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** One-hue ramp for magnitude (heat maps, surfaces, ranked bars). */
export const SEQ: [number, string][] = [[0, "#e3eefc"], [0.5, "#3987e5"], [1, "#0d366b"]];
const FONT = "IBM Plex Sans, system-ui, sans-serif";
const axis = { gridcolor: C.grid, zerolinecolor: "#cdc9be", linecolor: "#cdc9be", color: C.sub, tickfont: { family: FONT, size: 11, color: C.sub }, title: { font: { family: FONT, size: 12, color: C.sub } }, automargin: true };
const axis3d = { ...axis, backgroundcolor: "rgba(0,0,0,0)", showbackground: false };
type Ax = Record<string, unknown>;
/** Defaults plus overrides. Axis, legend, polar and scene overrides are merged with the defaults rather than replacing them.
 *  Category x-axes carry no gridlines; a horizontal bar chart should pass `xaxis: { showgrid: true }, yaxis: { showgrid: false }`. */
export function layout(extra: Partial<Layout> = {}): Partial<Layout> {
  const { xaxis, yaxis, legend, scene, polar, margin, ...rest } = extra as Record<string, Ax | undefined>;
  const sc = (scene ?? {}) as Record<string, Ax | undefined>; const po = (polar ?? {}) as Record<string, Ax | undefined>;
  return {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: FONT, color: C.fg, size: 12 }, colorway: PALETTE,
    hoverlabel: { bgcolor: C.surface, bordercolor: "#cdc9be", font: { family: FONT, color: C.fg, size: 12 } }, bargap: 0.28, bargroupgap: 0.08, barcornerradius: 3,
    xaxis: { ...axis, showgrid: false, ...xaxis }, yaxis: { ...axis, ...yaxis },
    legend: { bgcolor: "rgba(0,0,0,0)", orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom", font: { size: 12, color: "#454a54" }, ...legend },
    margin: { l: 44, r: 16, t: 16, b: 40, ...margin },
    scene: { bgcolor: "rgba(0,0,0,0)", ...sc, xaxis: { ...axis3d, ...sc.xaxis }, yaxis: { ...axis3d, ...sc.yaxis }, zaxis: { ...axis3d, ...sc.zaxis } },
    polar: { bgcolor: "rgba(0,0,0,0)", ...po, radialaxis: { gridcolor: C.grid, linecolor: C.grid, tickfont: { size: 10, color: C.sub }, ...po.radialaxis }, angularaxis: { gridcolor: C.grid, linecolor: "#cdc9be", tickfont: { size: 11, color: C.sub }, ...po.angularaxis } },
    ...rest,
  } as Partial<Layout>;
}
export const config: Partial<Config> = { displayModeBar: "hover", displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"], toImageButtonOptions: { format: "png", scale: 3 } };
export function Chart({ data, layout: l, height = 340, style, onClick }: { data: Data[]; layout?: Partial<Layout>; height?: number; style?: React.CSSProperties; onClick?: (e: never) => void }) {
  return <Plot data={data} layout={layout({ height, ...l })} config={config} useResizeHandler style={{ width: "100%", height, ...style }} onClick={onClick as never} />;
}
