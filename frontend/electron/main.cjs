/**
 * Electron main process for the Phoenix NTRO Forensic Desktop Application.
 *
 * Responsibilities:
 *   1. Resolve and spawn the PyInstaller-compiled FastAPI backend binary.
 *   2. Poll until the backend is ready (HTTP 200 on /docs).
 *   3. Create the secure BrowserWindow with context-isolated preload.
 *   4. Guarantee backend process tree cleanup on quit (Windows + Linux).
 */

'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HOST = '127.0.0.1';
const PORT = 8000;
const READY_URL_PATH = '/docs';
const STARTUP_TIMEOUT_MS = 15_000;
const RETRY_INTERVAL_MS = 250;
const SIGKILL_GRACE_MS = 3_000;

/** @type {import('child_process').ChildProcess | null} */
let backendProcess = null;

/** @type {BrowserWindow | null} */
let mainWindow = null;

let shuttingDown = false;

// ---------------------------------------------------------------------------
// IPC: expose app version to renderer via preload bridge
// ---------------------------------------------------------------------------
ipcMain.handle('get-app-version', () => app.getVersion());

// ---------------------------------------------------------------------------
// Binary path resolution
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the forensic-backend binary.
 *
 * Production:  process.resourcesPath/bin/forensic-backend[.exe]
 * Development: ../../backend/dist/forensic-backend[.exe]
 */
function backendExecutablePath() {
  const isWin = process.platform === 'win32';
  const executable = `forensic-backend${isWin ? '.exe' : ''}`;

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', executable);
  }
  return path.resolve(__dirname, '..', '..', 'backend', 'dist', executable);
}

// ---------------------------------------------------------------------------
// Readiness polling
// ---------------------------------------------------------------------------

/**
 * Single HTTP probe — resolves `true` if the backend returns 2xx.
 * @returns {Promise<boolean>}
 */
function backendReady() {
  return new Promise((resolve) => {
    const request = http.get(
      { host: HOST, port: PORT, path: READY_URL_PATH, timeout: 1_000 },
      (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 300);
      },
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

/**
 * Polls the backend every RETRY_INTERVAL_MS until it responds or
 * STARTUP_TIMEOUT_MS is exceeded.
 */
async function waitForBackend() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await backendReady()) return;
    if (!backendProcess || backendProcess.exitCode !== null) {
      throw new Error('The forensic backend exited before becoming ready.');
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  throw new Error(
    `The forensic backend did not respond on ${HOST}:${PORT} within ${STARTUP_TIMEOUT_MS / 1000}s.`,
  );
}

// ---------------------------------------------------------------------------
// Child process lifecycle
// ---------------------------------------------------------------------------

/** Spawn the backend binary as a managed child process. */
function startBackend() {
  const executable = backendExecutablePath();
  if (!fs.existsSync(executable)) {
    throw new Error(`Backend binary missing: ${executable}`);
  }

  /** @type {import('child_process').SpawnOptions} */
  const options = {
    cwd: app.isPackaged
      ? process.resourcesPath
      : path.resolve(__dirname, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };

  // Platform-specific spawn strategy:
  //   Windows — non-detached so the child is killed if the parent dies.
  //   Linux   — detached to create a process group for tree-killing.
  if (process.platform === 'win32') {
    options.detached = false;
    options.shell = false;
  } else if (process.platform === 'linux') {
    options.detached = true;
  }

  backendProcess = spawn(executable, [], options);

  backendProcess.on('error', (error) => {
    console.error('[backend] spawn error:', error.message);
  });
  backendProcess.stdout?.on('data', (data) =>
    console.log(`[backend] ${data}`),
  );
  backendProcess.stderr?.on('data', (data) =>
    console.error(`[backend] ${data}`),
  );
}

/**
 * Terminate the backend process tree.
 *
 * Windows: `taskkill /pid <PID> /T /F` kills the entire tree.
 * Linux:   `process.kill(-pid, SIGTERM)` signals the process group,
 *          with a SIGKILL fallback after SIGKILL_GRACE_MS.
 */
function stopBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) return;
  const pid = backendProcess.pid;
  if (!pid) return;

  try {
    if (process.platform === 'win32') {
      // taskkill /T kills the full process tree; /F forces termination.
      try {
        execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {
        // Process may already be gone — non-fatal.
      }
    } else if (process.platform === 'linux') {
      // Send SIGTERM to the entire process group (negative PID).
      process.kill(-pid, 'SIGTERM');

      // Schedule a SIGKILL fallback in case SIGTERM is not honoured.
      setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // ESRCH — already exited; safe to ignore.
        }
      }, SIGKILL_GRACE_MS);
    } else {
      backendProcess.kill('SIGTERM');
    }
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error('[backend] cleanup error:', error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

async function createMainWindow() {
  startBackend();
  await waitForBackend();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'NTRO DVR/NVR Forensic Analysis Tool',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    const devUrl =
      process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(createMainWindow).catch((error) => {
  console.error('[startup]', error);
  dialog.showErrorBox(
    'Phoenix startup failed',
    error.message || String(error),
  );
  stopBackend();
  app.quit();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !shuttingDown) {
    createMainWindow().catch((error) => {
      dialog.showErrorBox('Phoenix startup failed', error.message);
    });
  }
});

app.on('will-quit', () => {
  shuttingDown = true;
  stopBackend();
});
