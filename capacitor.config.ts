import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hkamori.liner.mobile",
  appName: "Liner",
  webDir: "dist",
  backgroundColor: "#000000",
  android: {
    // áudio/stream http de fallback (edge.tryliner.fun:10518) precisa de http
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
