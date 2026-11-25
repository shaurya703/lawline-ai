import "./styles/globals.css";
import { lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Shell from "@/components/shell/Shell";
import Landing from "@/pages/Landing";
import { applySettings, settings } from "@/lib/store";
import { PageBoundary } from "@/components/ui";
const L = (f: () => Promise<{ default: React.ComponentType }>) => lazy(f);
const Overview = L(() => import("@/pages/Overview")), Counsel = L(() => import("@/pages/Counsel"));
const Lab = L(() => import("@/pages/Lab")), GraphPage = L(() => import("@/pages/Graph")), Provisions = L(() => import("@/pages/Provisions")), Analyzer = L(() => import("@/pages/Analyzer")), Drafting = L(() => import("@/pages/Drafting")), AnalyticsPage = L(() => import("@/pages/Analytics")), Methodology = L(() => import("@/pages/Methodology"));
const Rights = L(() => import("@/pages/Rights")), Offence = L(() => import("@/pages/Offence")), Glossary = L(() => import("@/pages/Glossary")), Transition = L(() => import("@/pages/Transition")), Summarizer = L(() => import("@/pages/Summarizer")), Timeline = L(() => import("@/pages/Timeline")), Arena = L(() => import("@/pages/Arena")), Verify = L(() => import("@/pages/Verify")), Compare = L(() => import("@/pages/Compare")), Limitation = L(() => import("@/pages/Limitation")), Trainer = L(() => import("@/pages/Trainer")), CaseFiles = L(() => import("@/pages/CaseFiles")), SettingsPage = L(() => import("@/pages/Settings"));

export default function App() {
  useEffect(() => { applySettings(settings.get()); }, []);
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <PageBoundary>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Shell />}>
            <Route index element={<Overview />} />
            <Route path="counsel" element={<Counsel />} />
            <Route path="rights" element={<Rights />} />
            <Route path="offence" element={<Offence />} />
            <Route path="glossary" element={<Glossary />} />
            <Route path="analyze" element={<Analyzer />} />
            <Route path="summarize" element={<Summarizer />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="arena" element={<Arena />} />
            <Route path="verify" element={<Verify />} />
            <Route path="provisions" element={<Provisions />} />
            <Route path="transition" element={<Transition />} />
            <Route path="compare" element={<Compare />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="limitation" element={<Limitation />} />
            <Route path="draft" element={<Drafting />} />
            <Route path="trainer" element={<Trainer />} />
            <Route path="lab" element={<Lab />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="methodology" element={<Methodology />} />
            <Route path="files" element={<CaseFiles />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageBoundary>
    </BrowserRouter>
  );
}
