const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scalezApi', {
  versions: process.versions,
  toggleOutputFullscreen: () => ipcRenderer.invoke('output:toggle-fullscreen'),
  setOutputFullscreen: (value) => ipcRenderer.invoke('output:set-fullscreen', value),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  pickVideoFile: () => ipcRenderer.invoke('clips:pick-video'),
  pathExists: (targetPath) => ipcRenderer.invoke('clips:path-exists', targetPath),
  ensureReverseCache: (targetPath) => ipcRenderer.invoke('clips:ensure-reverse-cache', targetPath),
  rebuildReverseCache: (targetPath) => ipcRenderer.invoke('clips:rebuild-reverse-cache', targetPath),
  toMediaUrl: (targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
      return ''
    }
    return `scalez-media://local/${encodeURIComponent(targetPath)}`
  },
  publishOutputState: (state) => ipcRenderer.send('output:state-publish', state),
  getOutputState: () => ipcRenderer.invoke('output:state-get'),
  getNativePlaybackStatus: () => ipcRenderer.invoke('native-playback:get-status'),
  setNativePlaybackEnabled: (enabled) => ipcRenderer.invoke('native-playback:set-enabled', enabled),
  onOutputStateUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const handler = (_event, state) => callback(state)
    ipcRenderer.on('output:state-update', handler)
    return () => ipcRenderer.removeListener('output:state-update', handler)
  },
})
