const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mt5API', {
  connect: (config) => ipcRenderer.invoke('mt5:connect', config),
  getAccountInfo: () => ipcRenderer.invoke('mt5:getAccountInfo'),
  executeStrategy: (strategy) => ipcRenderer.invoke('mt5:executeStrategy', strategy),
  getPositions: () => ipcRenderer.invoke('mt5:getPositions'),
  getPendingOrders: () => ipcRenderer.invoke('mt5:getPendingOrders'),
  cancelPendingOrder: (ticket) => ipcRenderer.invoke('mt5:cancelPendingOrder', ticket),
  closePosition: (ticket) => ipcRenderer.invoke('mt5:closePosition', ticket),
  modifyPosition: (ticket, stopLoss, takeProfit) => ipcRenderer.invoke('mt5:modifyPosition', { ticket, stopLoss, takeProfit }),
  executeNodeStrategy: (nodeGraph) => ipcRenderer.invoke('mt5:executeNodeStrategy', nodeGraph),
  getMarketData: (symbol) => ipcRenderer.invoke('mt5:getMarketData', symbol),
  getSymbolInfo: (symbol) => ipcRenderer.invoke('mt5:getSymbolInfo', symbol),
  getSymbols: (group) => ipcRenderer.invoke('mt5:getSymbols', group),
  searchSymbols: (query) => ipcRenderer.invoke('mt5:searchSymbols', query),
  executeOrder: (orderData) => ipcRenderer.invoke('mt5:executeOrder', orderData),
  getHistoricalData: (params) => ipcRenderer.invoke('mt5:getHistoricalData', params),
  getPercentageChange: (symbol, timeframe) => ipcRenderer.invoke('mt5:getPercentageChange', { symbol, timeframe }),
  sendTwilioAlert: (alertData) => ipcRenderer.invoke('mt5:sendTwilioAlert', alertData),
  getTwilioConfig: () => ipcRenderer.invoke('mt5:getTwilioConfig'),
  updateTwilioConfig: (configData) => ipcRenderer.invoke('mt5:updateTwilioConfig', configData),
  getClosedPositions: (daysBack) => ipcRenderer.invoke('mt5:getClosedPositions', daysBack),
  toggleSimulatorMode: (enabled) => ipcRenderer.invoke('mt5:toggleSimulatorMode', enabled),
  getSimulatorStatus: () => ipcRenderer.invoke('mt5:getSimulatorStatus'),
  resetSimulator: (initialBalance) => ipcRenderer.invoke('mt5:resetSimulator', initialBalance),
  getYFinanceData: (params) => ipcRenderer.invoke('mt5:getYFinanceData', params),
  getAlphaVantageData: (params) => ipcRenderer.invoke('mt5:getAlphaVantageData', params),
  callLLM: (params) => ipcRenderer.invoke('mt5:callLLM', params),
  firecrawlScrape: (params) => ipcRenderer.invoke('mt5:firecrawlScrape', params),
  executePythonScript: (params) => ipcRenderer.invoke('mt5:executePythonScript', params)
});

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('electron:openExternal', url),
  openPath: (filePath) => ipcRenderer.invoke('electron:openPath', filePath),
  loadSettings: (filename) => ipcRenderer.invoke('settings:load', filename),
  saveSettings: (filename, settings) => ipcRenderer.invoke('settings:save', filename, settings),
  saveChartImage: (imageData, ticket, symbol) => ipcRenderer.invoke('chart:saveImage', { imageData, ticket, symbol }),
  readChartImage: (filePath) => ipcRenderer.invoke('chart:readImage', filePath)
});
