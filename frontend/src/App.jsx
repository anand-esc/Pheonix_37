import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RoleProvider } from "./context/RoleContext";
import { Header } from "./components/Header";
import { LandingPage } from "./pages/LandingPage";
import { CaseDashboard } from "./pages/CaseDashboard";
import { EvidencePage } from "./pages/EvidencePage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { TimelinePage } from "./pages/TimelinePage";
import { ReportPage } from "./pages/ReportPage";

export default function App() {
  return (
    <RoleProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex flex-col font-sans selection:bg-[var(--accent-cyan)] selection:text-[var(--bg-deep)]">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/home" element={<LandingPage />} />
              <Route path="/cases" element={<CaseDashboard />} />
              <Route path="/cases/:id/evidence" element={<EvidencePage />} />
              <Route path="/cases/:id/analysis" element={<AnalysisPage />} />
              <Route path="/cases/:id/timeline" element={<TimelinePage />} />
              <Route path="/cases/:id/report" element={<ReportPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <footer className="border-t border-[var(--border)] bg-[var(--bg-panel)] py-3.5 px-4 text-center text-xs text-[var(--text-muted)]">
            Phoenix Forensic Pipeline • NTRO SIH 2026 • Vendor-Agnostic Surveillance Footage Recovery
          </footer>
        </div>
      </BrowserRouter>
    </RoleProvider>
  );
}