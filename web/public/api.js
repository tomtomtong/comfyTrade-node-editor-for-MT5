// Web API Layer - Replaces Electron IPC
const API_BASE = '';

window.mt5API = {
  async connect(config) {
    const res = await fetch(`${API_BASE}/api/mt5/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return res.json();
  },

  async getAccountInfo() {
    const res = await fetch(`${API_BASE}/api/mt5/account`);
    return res.json();
  },

  async getPositions() {
    const res = await fetch(`${API_BASE}/api/mt5/positions`);
    return res.json();
  },

  async getMarketData(symbol) {
    const res = await fetch(`${API_BASE}/api/mt5/market/${symbol}`);
    return res.json();
  },

  async getSymbols(group) {
    const res = await fetch(`${API_BASE}/api/mt5/symbols`);
    return res.json();
  },

  async searchSymbols(query) {
    const res = await fetch(`${API_BASE}/api/mt5/symbols/search?q=${encodeURIComponent(query)}`);
    return res.json();
  },

  async getSymbolInfo(symbol) {
    const res = await fetch(`${API_BASE}/api/mt5/symbol/${symbol}`);
    return res.json();
  },

  async executeOrder(orderData) {
    const res = await fetch(`${API_BASE}/api/mt5/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    return res.json();
  },

  async closePosition(ticket) {
    const res = await fetch(`${API_BASE}/api/mt5/close/${ticket}`, {
      method: 'POST'
    });
    return res.json();
  },

  async modifyPosition(ticket, stopLoss, takeProfit) {
    const res = await fetch(`${API_BASE}/api/mt5/modify/${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopLoss, takeProfit })
    });
    return res.json();
  },

  async getClosedPositions(daysBack = 7) {
    const res = await fetch(`${API_BASE}/api/mt5/closed?days=${daysBack}`);
    return res.json();
  },

  async toggleSimulatorMode(enabled) {
    const res = await fetch(`${API_BASE}/api/simulator/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    return res.json();
  },

  async getSimulatorStatus() {
    const res = await fetch(`${API_BASE}/api/simulator/status`);
    return res.json();
  },

  async resetSimulator(initialBalance) {
    const res = await fetch(`${API_BASE}/api/simulator/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialBalance })
    });
    return res.json();
  },

  async sendTwilioAlert(alertData) {
    const res = await fetch(`${API_BASE}/api/twilio/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertData)
    });
    return res.json();
  }
};

window.electronAPI = {
  async loadSettings(filename) {
    const res = await fetch(`${API_BASE}/api/settings/${filename}`);
    if (!res.ok) return null;
    return res.json();
  },

  async saveSettings(filename, settings) {
    const res = await fetch(`${API_BASE}/api/settings/${filename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return res.json();
  },

  openExternal(url) {
    window.open(url, '_blank');
    return Promise.resolve({ success: true });
  }
};
