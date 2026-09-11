'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  arch: process.arch,
  isElectron: true,
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getConnectionStatus: async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/docs', {
        method: 'HEAD',
        signal: AbortSignal.timeout(2_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
  printPage: () => ipcRenderer.invoke('print-page'),
  exportPDF: (filename) => ipcRenderer.invoke('export-pdf', filename),
});
