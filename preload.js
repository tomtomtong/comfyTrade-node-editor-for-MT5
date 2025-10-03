const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mt5API', {
  connect: (config) => ipcRenderer.invoke('mt5:connect', config),
  getAccountInfo: () => ipcRenderer.invoke('mt5:getAccountInfo'),
  executeStrategy: (strategy) => ipcRenderer.invoke('mt5:executeStrategy', strategy),
  getPositions: () => ipcRenderer.invoke('mt5:getPositions'),
  closePosition: (ticket) => ipcRenderer.invoke('mt5:closePosition', ticket),
  modifyPosition: (ticket, stopLoss, takeProfit) => ipcRenderer.invoke('mt5:modifyPosition', { ticket, stopLoss, takeProfit }),
  executeNodeStrategy: (nodeGraph) => ipcRenderer.invoke('mt5:executeNodeStrategy', nodeGraph),
  getMarketData: (symbol) => ipcRenderer.invoke('mt5:getMarketData', symbol),
  getSymbols: (group) => ipcRenderer.invoke('mt5:getSymbols', group),
  searchSymbols: (query) => ipcRenderer.invoke('mt5:searchSymbols', query),
  executeOrder: (orderData) => ipcRenderer.invoke('mt5:executeOrder', orderData)
});
