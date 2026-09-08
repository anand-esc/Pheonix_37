import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RoleProvider } from "./context/RoleContext";
import { CaseDashboard } from "./pages/CaseDashboard";
import { CaseDetail } from "./pages/CaseDetail";
import { VideoViewer } from "./pages/VideoViewer";
import { TimelinePage } from "./pages/TimelinePage";
import { ReportPage } from "./pages/ReportPage";

export default function App() {
  return (
    <RoleProvider>
      <BrowserRouter>
        <div style={{ minHeight: "100vh", background: "var(--phx-cream)" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/cases" replace />} />
            <Route path="/cases" element={<CaseDashboard />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/cases/:id/video/:fragmentIdx" element={<VideoViewer />} />
            <Route path="/cases/:id/timeline" element={<TimelinePage />} />
            <Route path="/cases/:id/report" element={<ReportPage />} />
            <Route path="*" element={<Navigate to="/cases" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </RoleProvider>
  );
}