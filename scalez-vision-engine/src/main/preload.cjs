const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scalezApi', {
  versions: process.versions,
  toggleOutputFullscreen: () => ipcRenderer.invoke('output:toggle-fullscreen'),
  setOutputFullscreen: (value) => ipcRenderer.invoke('output:set-fullscreen', value),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  pickVideoFile: () => ipcRenderer.invoke('clips:pick-video'),
  pathExists: (targetPath) => ipcRenderer.invoke('clips:path-exists', targetPath),
})
