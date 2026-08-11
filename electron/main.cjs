const { app, BrowserWindow, dialog, ipcMain, protocol } = require("electron");
const { spawn, spawnSync } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const http = require("http");
const tcpNet = require("net");
const path = require("path");
const { Readable } = require("stream");

const isDev = !app.isPackaged;
const MAX_RECENT_PDFS = 8;
const BACKEND_IDLE_MS = 60_000;
const PDF_SCHEME = "study-pdf";

let backendProcess = null;
let backendPort = null;
let backendStartPromise = null;
let backendStopping = false;
let backendIdleTimer = null;
const backendLeases = new Map();
const watchedWebContents = new Set();
const documentSources = new Map();

protocol.registerSchemesAsPrivileged([
  {
    scheme: PDF_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

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
    { path: resolvedPath, name: path.basename(resolvedPath), openedAt: new Date().toISOString() },
    ...recent,
  ].slice(0, MAX_RECENT_PDFS);
  writeJson("recent-pdfs.json", next);
}

function registerPdf(filePath) {
  if (typeof filePath !== "string" || !isPdfFile(filePath)) return null;
  const resolvedPath = path.resolve(filePath);
  const documentId = randomUUID();
  documentSources.set(documentId, resolvedPath);
  rememberRecentPdf(resolvedPath);
  return {
    name: path.basename(resolvedPath),
    path: resolvedPath,
    documentId,
    sourceUrl: `${PDF_SCHEME}://document/${documentId}`,
  };
}

function registerPdfProtocol() {
  protocol.handle(PDF_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "document") return new Response("Not found", { status: 404 });
      const documentId = decodeURIComponent(url.pathname.slice(1));
      const filePath = documentSources.get(documentId);
      if (!filePath || !isPdfFile(filePath)) return new Response("Not found", { status: 404 });

      const size = fs.statSync(filePath).size;
      const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/i);
      let start = 0;
      let end = Math.max(0, size - 1);
      let status = 200;
      if (range) {
        start = Math.min(Number(range[1]), end);
        end = range[2] ? Math.min(Number(range[2]), end) : end;
        status = 206;
      }
      const length = Math.max(0, end - start + 1);
      const headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Content-Length": String(length),
        "Content-Type": "application/pdf",
      };
      if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      const body = request.method === "HEAD"
        ? null
        : Readable.toWeb(fs.createReadStream(filePath, { start, end }));
      return new Response(body, { status, headers });
    } catch {
      return new Response("PDF read error", { status: 500 });
    }
  });
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
    return result.canceled ? null : registerPdf(result.filePaths[0]);
  });
  ipcMain.handle("pdf:open-recent", (_event, filePath) => registerPdf(filePath));
  ipcMain.handle("pdf:release", (_event, documentId) => {
    if (typeof documentId === "string") documentSources.delete(documentId);
  });
  ipcMain.handle("backend:acquire", async (event) => acquireBackend(event.sender));
  ipcMain.handle("backend:release", (event, leaseId) => releaseBackendLease(leaseId, event.sender.id));
}

function clearBackendIdleTimer() {
  if (backendIdleTimer !== null) {
    clearTimeout(backendIdleTimer);
    backendIdleTimer = null;
  }
}

function scheduleBackendStop() {
  clearBackendIdleTimer();
  if (isDev || backendLeases.size > 0 || !backendProcess) return;
  backendIdleTimer = setTimeout(() => {
    backendIdleTimer = null;
    if (backendLeases.size === 0) stopBackend();
  }, BACKEND_IDLE_MS);
  backendIdleTimer.unref?.();
}

function stopBackend() {
  clearBackendIdleTimer();
  backendLeases.clear();
  backendPort = null;
  backendStartPromise = null;
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
  backendStopping = false;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = tcpNet.createServer();
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
  if (backendProcess && backendPort !== null) return backendPort;
  if (backendStartPromise) return backendStartPromise;

  backendStartPromise = (async () => {
    const port = await findFreePort();
    const executable = path.join(
      process.resourcesPath,
      "backend",
      "study-pdf-backend",
      "study-pdf-backend.exe",
    );
    backendProcess = spawn(executable, [], {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        STUDY_PDF_PORT: String(port),
        STUDY_PDF_CONFIG_PATH: path.join(app.getPath("userData"), ".env"),
        STUDY_PDF_DATA_DIR: path.join(app.getPath("userData"), "rag"),
      },
    });
    backendProcess.once("exit", () => {
      backendProcess = null;
      backendPort = null;
      backendStopping = false;
    });
    await waitForBackend(port);
    backendPort = port;
    return port;
  })();

  try {
    return await backendStartPromise;
  } catch (error) {
    stopBackend();
    throw error;
  } finally {
    backendStartPromise = null;
  }
}

async function acquireBackend(webContents) {
  clearBackendIdleTimer();
  const port = await startBackend();
  const leaseId = randomUUID();
  backendLeases.set(leaseId, webContents.id);
  if (!watchedWebContents.has(webContents.id)) {
    watchedWebContents.add(webContents.id);
    webContents.once("destroyed", () => {
      watchedWebContents.delete(webContents.id);
      releaseLeasesForSender(webContents.id);
    });
  }
  return { baseUrl: `http://127.0.0.1:${port}`, leaseId };
}

function releaseBackendLease(leaseId, senderId) {
  if (typeof leaseId !== "string") return;
  if (backendLeases.get(leaseId) !== senderId) return;
  backendLeases.delete(leaseId);
  scheduleBackendStop();
}

function releaseLeasesForSender(senderId) {
  for (const [leaseId, ownerId] of backendLeases) {
    if (ownerId === senderId) backendLeases.delete(leaseId);
  }
  scheduleBackendStop();
}

function createWindow() {
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
      spellcheck: false,
    },
  });
  if (isDev) window.loadURL("http://localhost:5173");
  else window.loadFile(path.join(process.resourcesPath, "web", "index.html"));
}

app.whenReady().then(() => {
  try {
    registerPdfProtocol();
    registerIpcHandlers();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    dialog.showErrorBox("Study PDF AI 시작 오류", String(error));
    app.quit();
  }
});

app.on("before-quit", () => {
  documentSources.clear();
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    documentSources.clear();
    stopBackend();
    app.quit();
  }
});
