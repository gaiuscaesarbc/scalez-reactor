const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scalezApi', {
  versions: process.versions,
  toggleOutputFullscreen: () => ipcRenderer.invoke('output:toggle-fullscreen'),
  setOutputFullscreen: (value) => ipcRenderer.invoke('output:set-fullscreen', value),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  pickVideoFile: () => ipcRenderer.invoke('clips:pick-video'),
  pathExists: (targetPath) => ipcRenderer.invoke('clips:path-exists', targetPath),
  publishOutputState: (state) => ipcRenderer.send('output:state-publish', state),
  getOutputState: () => ipcRenderer.invoke('output:state-get'),
  onOutputStateUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const handler = (_event, state) => callback(state)
    ipcRenderer.on('output:state-update', handler)
    return () => ipcRenderer.removeListener('output:state-update', handler)
  },
})
