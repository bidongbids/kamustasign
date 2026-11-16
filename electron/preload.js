// window.lcsignDesktop: the few things the page needs from the desktop app
// (src/lib/desktopBridge.ts). Runs sandboxed with context isolation, so the
// page gets these functions only - no Node, no ipcRenderer. main.js answers
// only the app's own pages (fromApp), never a site that ends up in a window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lcsignDesktop", {
  /** { state: "off" | "checking" | "current" | "downloading" | "ready" | "error", version?, percent?, message? } */
  getUpdateStatus: () => ipcRenderer.invoke("lcsign:update-status"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("lcsign:update-status", listener);
    return () => ipcRenderer.removeListener("lcsign:update-status", listener);
  },
  /** Close LCSign, install the downloaded update and open it again. */
  installUpdate: () => ipcRenderer.invoke("lcsign:install-update").catch(() => false),
  /** Show %APPDATA%\LCSign\logs (lcsign.log) in File Explorer. */
  openLogFolder: () => ipcRenderer.invoke("lcsign:open-logs").catch(() => false),
});
