import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { FormDemoPage } from "./demos/form";
import { OverviewDemoPage } from "./demos/overview";
import { DemoSessionProvider } from "./demos/shared/session";
import { ThemeDemoPage } from "./demos/theme";
import { ChessDemoPage } from "./demos/chess";

export function App() {
  return (
    <BrowserRouter>
      <DemoSessionProvider>
        <Toaster position="bottom-right" />
        <Routes>
          <Route path="/" element={<OverviewDemoPage />} />
          <Route path="/demo/theme" element={<ThemeDemoPage />} />
          <Route path="/demo/form" element={<FormDemoPage />} />
          <Route path="/demo/chess" element={<ChessDemoPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DemoSessionProvider>
    </BrowserRouter>
  );
}
