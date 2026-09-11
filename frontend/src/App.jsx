import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { RoleProvider, useRole } from "./context/RoleContext";
import { CaseDashboard } from "./pages/CaseDashboard";
import { CaseDetail } from "./pages/CaseDetail";
import { EvidencePage } from "./pages/EvidencePage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { VideoViewer } from "./pages/VideoViewer";
import { TimelinePage } from "./pages/TimelinePage";
import { ReportPage } from "./pages/ReportPage";
import { LoginPage } from "./pages/LoginPage";
import { Header } from "./components/Header";
import { ErrorBoundary } from "./components/ErrorBoundary";

function AppRoutes() {
  const { isAuthenticated } = useRole();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-phx-surface text-phx-primary flex flex-col font-sans">
      <Header />
      <main className="flex-1 overflow-x-hidden overflow-y-auto scroll-smooth">
        <Routes>
          <Route path="/" element={<Navigate to="/cases" replace />} />
          <Route path="/cases" element={<CaseDashboard />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/cases/:id/evidence" element={<EvidencePage />} />
          <Route path="/cases/:id/analysis" element={<AnalysisPage />} />
          <Route path="/cases/:id/video/:fragmentIdx" element={<VideoViewer />} />
          <Route path="/cases/:id/timeline" element={<TimelinePage />} />
          <Route path="/cases/:id/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/cases" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// HashRouter: the packaged app is loaded from file://, where path-based
// routing has no server to fall back to. Hash routes survive a reload there.
export default function App() {
  return (
    <ErrorBoundary>
      <RoleProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </RoleProvider>
    </ErrorBoundary>
  );
}
