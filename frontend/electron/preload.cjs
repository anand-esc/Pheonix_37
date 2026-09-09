/**
 * Preload script — context isolation bridge for the Phoenix desktop app.
 *
 * Exposes a safe `electronAPI` namespace to the renderer via
 * contextBridge.  No Node.js APIs leak into the sandboxed page.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Host operating system: 'win32' | 'linux' | 'darwin' */
  platform: process.platform,

  /** CPU architecture: 'x64' | 'arm64' | 'ia32' */
  arch: process.arch,

  /** True when running inside Electron (vs. a plain browser). */
  isElectron: true,

  /**
   * Returns the application version from package.json.
   * Resolved via IPC to the main process (app.getVersion()).
   * @returns {Promise<string>}
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * Pings the local backend to check connectivity.
   * Returns true if the backend responds with HTTP 2xx.
   * @returns {Promise<boolean>}
   */
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
});
