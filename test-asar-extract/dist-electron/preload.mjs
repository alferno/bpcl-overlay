import { contextBridge as n, ipcRenderer as o } from "electron";
n.exposeInMainWorld("ipcRenderer", {
  on: (e, r) => (o.on(e, r), () => o.removeListener(e, r)),
  invoke: (e, ...r) => o.invoke(e, ...r)
});
