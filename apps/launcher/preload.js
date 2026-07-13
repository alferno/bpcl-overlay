const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadAndInstall: (opts) => ipcRenderer.invoke('download-and-install', opts),
  launchApp: () => ipcRenderer.invoke('launch-app'),
  getInstallDir: () => ipcRenderer.invoke('get-install-dir'),
  onDownloadProgress: (callback) => {
    const unsub = ipcRenderer.on('download-progress', (_, percent) => callback(percent))
    return unsub
  }
})
