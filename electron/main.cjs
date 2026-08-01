const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const isDev = !app.isPackaged;
let backendProcess = null;
let backendStopping = false;
const MAX_RECENT_PDFS = 8;

function userDataFile(name) {
  return path.join(app.getPath("userData"), name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(userDataFile(name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  const target = userDataFile(name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2), "utf8");
}

function isPdfFile(filePath) {
  try {
    return path.extname(filePath).toLowerCase() === ".pdf" && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readRecentPdfs() {
  const stored = readJson("recent-pdfs.json", []);
  if (!Array.isArray(stored)) return [];

  const valid = stored
    .filter(
      (item) =>
        item &&
        typeof item.path === "string" &&
        typeof item.name === "string" &&
        isPdfFile(item.path),
    )
    .slice(0, MAX_RECENT_PDFS);

  if (valid.length !== stored.length) writeJson("recent-pdfs.json", valid);
  return valid;
}

function rememberRecentPdf(filePath) {
  const resolvedPath = path.resolve(filePath);
  const recent = readRecentPdfs().filter(
    (item) => path.resolve(item.path).toLowerCase() !== resolvedPath.toLowerCase(),
  );
  const next = [
    {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      openedAt: new Date().toISOString(),
    },
    ...recent,
  ].slice(0, MAX_RECENT_PDFS);
  writeJson("recent-pdfs.json", next);
  return next;
}

function readPdf(filePath) {
  if (typeof filePath !== "string" || !isPdfFile(filePath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(filePath);
    rememberRecentPdf(filePath);
    return {
      name: path.basename(filePath),
      path: path.resolve(filePath),
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  } catch {
    return null;
  }
}

function registerIpcHandlers() {
  ipcMain.on("preferences:load", (event) => {
    event.returnValue = readJson("viewer-preferences.json", null);
  });
  ipcMain.on("preferences:save", (event, preferences) => {
    if (preferences && typeof preferences === "object") {
      writeJson("viewer-preferences.json", preferences);
    }
    event.returnValue = true;
  });
  ipcMain.handle("pdf:list-recent", () => readRecentPdfs());
  ipcMain.handle("pdf:open-dialog", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: "PDF 열기",
      properties: ["openFile"],
      filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
    });
    return result.canceled ? null : readPdf(result.filePaths[0]);
  });
  ipcMain.handle("pdf:open-recent", (_event, filePath) => readPdf(filePath));
}

function stopBackend() {
  if (isDev || !backendProcess || backendStopping) return;
  backendStopping = true;
  const pid = backendProcess.pid;

  if (process.platform === "win32" && pid) {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else if (!backendProcess.killed) {
    backendProcess.kill("SIGTERM");
  }

  backendProcess = null;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForBackend(port, attempts = 60) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());
    };
    const retry = () => {
      if (attempts-- <= 0) reject(new Error("백엔드 시작 시간이 초과되었습니다."));
      else setTimeout(check, 250);
    };
    check();
  });
}

async function startBackend() {
  if (isDev) return 8000;

  const port = await findFreePort();
  const executable = path.join(process.resourcesPath, "backend", "study-pdf-backend.exe");
  backendProcess = spawn(executable, [], {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      STUDY_PDF_PORT: String(port),
      STUDY_PDF_STATIC_DIR: path.join(process.resourcesPath, "web"),
      STUDY_PDF_CONFIG_PATH: path.join(app.getPath("userData"), ".env"),
    },
  });
  backendProcess.once("exit", () => {
    backendProcess = null;
    backendStopping = false;
  });
  await waitForBackend(port);
  return port;
}

function createWindow(port) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#343941",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadURL(isDev ? "http://localhost:5173" : `http://127.0.0.1:${port}`);
}

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();
    const port = await startBackend();
    createWindow(port);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  } catch (error) {
    dialog.showErrorBox("Study PDF AI 시작 오류", String(error));
    app.quit();
  }
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopBackend();
    app.quit();
  }
});
