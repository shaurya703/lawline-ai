import "./styles/globals.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Shell from "@/components/shell/Shell";
import Landing from "@/pages/Landing";
import CommandCenter from "@/pages/CommandCenter";
import Counsel from "@/pages/Counsel";
import Lab from "@/pages/Lab";
import GraphPage from "@/pages/Graph";
import Provisions from "@/pages/Provisions";
import Analyzer from "@/pages/Analyzer";
import Drafting from "@/pages/Drafting";
import AnalyticsPage from "@/pages/Analytics";
import Methodology from "@/pages/Methodology";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Shell />}>
          <Route index element={<CommandCenter />} />
          <Route path="counsel" element={<Counsel />} />
          <Route path="lab" element={<Lab />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="provisions" element={<Provisions />} />
          <Route path="analyze" element={<Analyzer />} />
          <Route path="draft" element={<Drafting />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="methodology" element={<Methodology />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
