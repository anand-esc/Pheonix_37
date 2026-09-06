import { app, BrowserWindow, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function createWindow() {
  // Hide top menu bar (File/Edit/View) for clean native desktop shell
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Phoenix — DVR/NVR Forensic Analysis Toolkit",
    autoHideMenuBar: true,
    backgroundColor: "#020617",
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  if (isDev) {
    // Load Vite dev server during development
    mainWindow.loadURL("http://localhost:5173");
  } else {
    // Load compiled static bundle in production
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Disable visual pinch zoom in production
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });

  // Prevent default browser inspect element context menu in production
  mainWindow.webContents.on("context-menu", (e) => {
    if (!isDev) {
      e.preventDefault();
    }
  });

  // Block keyboard shortcuts for browser-style zoom in production
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!isDev && input.control && ["+", "-", "=", "0"].includes(input.key)) {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
