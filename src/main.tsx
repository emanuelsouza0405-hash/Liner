import "@/shared/platform"; // aplica data-mobile / data-lite no <html> antes de renderizar
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { RootErrorBoundary } from "@/shared/ui";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";
import { initTelemetry } from "@/shared/telemetry";
import { initBackgroundStorageAnalytics } from "@/shared/utils/cacheManager";
import { initApiEndpointProbe } from "@/shared/api";
import { initAndroidMedia } from "@/native/androidMedia";

// Initialize global uncaught error, telemetry listeners, background storage tracker, and edge health probe
initGlobalErrorHandlers();
initTelemetry();
initBackgroundStorageAnalytics();
initApiEndpointProbe();
initAndroidMedia();

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}

