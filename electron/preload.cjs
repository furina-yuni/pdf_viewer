const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  platform: process.platform,
  loadPreferences: () => ipcRenderer.sendSync("preferences:load"),
  savePreferences: (preferences) => ipcRenderer.sendSync("preferences:save", preferences),
  listRecentPdfs: () => ipcRenderer.invoke("pdf:list-recent"),
  openPdfDialog: () => ipcRenderer.invoke("pdf:open-dialog"),
  openRecentPdf: (filePath) => ipcRenderer.invoke("pdf:open-recent", filePath),
});
