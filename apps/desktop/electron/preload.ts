import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
})

contextBridge.exposeInMainWorld('remotelink', {
  getEngineState: () => ipcRenderer.invoke('remotelink:get-engine-state'),
  startEngine: () => ipcRenderer.invoke('remotelink:start-engine'),
  stopEngine: () => ipcRenderer.invoke('remotelink:stop-engine'),
  regeneratePairingCode: () => ipcRenderer.invoke('remotelink:regenerate-pairing-code'),
  approvePairing: () => ipcRenderer.invoke('remotelink:approve-pairing'),
  denyPairing: () => ipcRenderer.invoke('remotelink:deny-pairing'),
  disconnectDevice: () => ipcRenderer.invoke('remotelink:disconnect-device'),
  clearActivityLog: () => ipcRenderer.invoke('remotelink:clear-activity-log'),
  releaseAllKeys: () => ipcRenderer.invoke('remotelink:release-all-keys'),
  stopPhoneScreenShare: () => ipcRenderer.invoke('remotelink:stop-phone-screen-share'),
  copyText: (text: string) => ipcRenderer.invoke('remotelink:copy-text', text),
  getFirewallStatus: (force?: boolean) => ipcRenderer.invoke('remotelink:get-firewall-status', force === true),
  repairLocalFirewall: () => ipcRenderer.invoke('remotelink:repair-local-firewall'),
  onEngineStateChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('remotelink:state-changed', listener)
    return () => ipcRenderer.removeListener('remotelink:state-changed', listener)
  },
  onMobileScreenFrame: (callback: (frame: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, frame: unknown) => callback(frame)
    ipcRenderer.on('remotelink:mobile-frame', listener)
    return () => ipcRenderer.removeListener('remotelink:mobile-frame', listener)
  },
})

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type as keyof NodeJS.ProcessVersions] as string)
  }
})

