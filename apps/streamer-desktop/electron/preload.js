import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('ipcRenderer', {
    on: (channel, listener) => {
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});
