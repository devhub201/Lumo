import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.devhub201.lumo",
  appName: "LUMO",
  webDir: "dist/public",
  server: process.env.LUMO_CAPACITOR_SERVER_URL
    ? { url: process.env.LUMO_CAPACITOR_SERVER_URL, cleartext: false }
    : undefined,
  android: { allowMixedContent: false },
};

export default config;
