import { contextBridge } from "electron";

// Expose safe desktop environment info to renderer
contextBridge.exposeInMainWorld("phoenixNative", {
  platform: process.platform,
  isElectron: true,
  appVersion: "0.2.0",
});
