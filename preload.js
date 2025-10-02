const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mt5API', {
  connect: (config) => ipcRenderer.invoke('mt5:connect', config),
  getAccountInfo: () => ipcRenderer.invoke('mt5:getAccountInfo'),
  executeStrategy: (strategy) => ipcRenderer.invoke('mt5:executeStrategy', strategy),
  getPositions: () => ipcRenderer.invoke('mt5:getPositions'),
  closePosition: (ticket) => ipcRenderer.invoke('mt5:closePosition', ticket),
  executeNodeStrategy: (nodeGraph) => ipcRenderer.invoke('mt5:executeNodeStrategy', nodeGraph),
  getMarketData: (symbol) => ipcRenderer.invoke('mt5:getMarketData', symbol)
});
