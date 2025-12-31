// Main Application - Web Version
let isConnected = false;
let nodeEditor = null;
let logEntries = [];
let priceUpdateInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initializeNodeEditor();
  setupEventListeners();
  await loadSettings();
});

function initializeNodeEditor() {
  const canvas = document.getElementById('nodeCanvas');
  nodeEditor = new NodeEditor(canvas);
  
  // Add default trigger node
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const canvasPos = nodeEditor.screenToCanvas(centerX, centerY);
  nodeEditor.addNode('trigger', canvasPos.x, canvasPos.y);
}

function setupEventListeners() {
  // Toolbar
  document.getElementById('connectBtn').addEventListener('click', handleConnect);
  document.getElementById('tradeBtn').addEventListener('click', showTradeModal);
  document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
  document.getElementById('showLogBtn').addEventListener('click', showLogModal);
  document.getElementById('toggleBottomPanelBtn').addEventListener('click', toggleBottomPanel);
  document.getElementById('runStrategyBtn').addEventListener('click', runStrategy);
  document.getElementById('saveGraphBtn').addEventListener('click', saveGraph);
  document.getElementById('loadGraphBtn').addEventListener('click', loadGraph);
  document.getElementById('clearGraphBtn').addEventListener('click', clearGraph);
  document.getElementById('helpBtn').addEventListener('click', showHelp);
  
  // Account
  document.getElementById('refreshAccountBtn').addEventListener('click', refreshAccount);
  document.getElementById('refreshPositionsBtn').addEventListener('click', refreshPositions);
  document.getElementById('refreshClosedBtn')?.addEventListener('click', refreshClosedPositions);
  
  // Trade modal
  document.getElementById('confirmTradeBtn').addEventListener('click', executeTrade);
  document.getElementById('cancelTradeBtn').addEventListener('click', hideTradeModal);
  document.getElementById('tradeSymbol').addEventListener('change', updateTradePrice);
  
  // Settings modal
  document.getElementById('closeSettingsBtn').addEventListener('click', hideSettingsModal);
  document.getElementById('resetSimulatorBtn').addEventListener('click', resetSimulator);
  
  // Log modal
  document.getElementById('closeLogBtn').addEventListener('click', hideLogModal);
  document.getElementById('clearLogBtn').addEventListener('click', clearLog);
  
  // Position tabs
  document.querySelectorAll('.positions-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchPositionsTab(e.target.dataset.tab));
  });
  
  // Node palette
  document.querySelectorAll('.node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.type;
      const canvas = document.getElementById('nodeCanvas');
      const rect = canvas.getBoundingClientRect();
      const screenX = rect.width / 2 + Math.random() * 100 - 50;
      const screenY = rect.height / 2 + Math.random() * 100 - 50;
      const canvasPos = nodeEditor.screenToCanvas(screenX, screenY);
      nodeEditor.addNode(type, canvasPos.x, canvasPos.y);
    });
  });
  
  // Track node selection
  setInterval(() => {
    updatePropertiesPanel(nodeEditor.selectedNode);
  }, 100);
}

// Connection
async function handleConnect() {
  if (isConnected) {
    isConnected = false;
    document.getElementById('connectBtn').textContent = 'Connect Demo';
    document.getElementById('connectBtn').className = 'btn btn-primary';
    showMessage('Disconnected', 'info');
    stopAutoRefresh();
    return;
  }
  
  try {
    const result = await window.mt5API.connect({});
    if (result.success) {
      isConnected = true;
      document.getElementById('connectBtn').textContent = 'Disconnect';
      document.getElementById('connectBtn').className = 'btn btn-danger';
      showMessage('Connected to Demo Mode!', 'success');
      refreshAccount();
      refreshPositions();
      startAutoRefresh();
    }
  } catch (err) {
    showMessage('Connection failed: ' + err.message, 'error');
  }
}

// Auto refresh
let autoRefreshInterval = null;
function startAutoRefresh() {
  autoRefreshInterval = setInterval(() => {
    if (isConnected) {
      refreshAccount();
      refreshPositions();
    }
  }, 3000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// Account
async function refreshAccount() {
  if (!isConnected) return;
  try {
    const result = await window.mt5API.getAccountInfo();
    if (result.success) {
      document.getElementById('balance').textContent = '$' + result.data.balance.toFixed(2);
      document.getElementById('equity').textContent = '$' + result.data.equity.toFixed(2);
      const profit = result.data.profit;
      const profitEl = document.getElementById('profit');
      profitEl.textContent = (profit >= 0 ? '+' : '') + '$' + profit.toFixed(2);
      profitEl.className = profit >= 0 ? 'profit positive' : 'profit negative';
    }
  } catch (err) {
    console.error('Error refreshing account:', err);
  }
}

// Positions
async function refreshPositions() {
  if (!isConnected) return;
  try {
    const result = await window.mt5API.getPositions();
    const container = document.getElementById('positionsList');
    
    if (result.success && result.data.length > 0) {
      container.innerHTML = result.data.map(pos => `
        <div class="position-item">
          <div class="position-header">
            <span class="position-symbol">${pos.symbol}</span>
            <span class="position-type ${pos.type.toLowerCase()}">${pos.type}</span>
            <span class="position-volume">${pos.volume} lots</span>
          </div>
          <div class="position-details">
            <span>Open: ${pos.openPrice.toFixed(5)}</span>
            <span>Current: ${pos.currentPrice?.toFixed(5) || '-'}</span>
            <span class="position-profit ${pos.profit >= 0 ? 'positive' : 'negative'}">
              ${pos.profit >= 0 ? '+' : ''}$${pos.profit.toFixed(2)}
            </span>
          </div>
          <div class="position-actions">
            <button class="btn btn-small btn-danger" onclick="closePosition(${pos.ticket})">Close</button>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="no-data">No open positions</p>';
    }
  } catch (err) {
    console.error('Error refreshing positions:', err);
  }
}

async function refreshClosedPositions() {
  if (!isConnected) return;
  try {
    const result = await window.mt5API.getClosedPositions(7);
    const container = document.getElementById('closedPositionsList');
    
    if (result.success && result.data.length > 0) {
      container.innerHTML = result.data.map(pos => `
        <div class="position-item closed">
          <div class="position-header">
            <span class="position-symbol">${pos.symbol}</span>
            <span class="position-type ${pos.type.toLowerCase()}">${pos.type}</span>
          </div>
          <div class="position-details">
            <span>Open: ${pos.openPrice.toFixed(5)}</span>
            <span>Close: ${pos.closePrice.toFixed(5)}</span>
            <span class="position-profit ${pos.profit >= 0 ? 'positive' : 'negative'}">
              ${pos.profit >= 0 ? '+' : ''}$${pos.profit.toFixed(2)}
            </span>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="no-data">No closed positions</p>';
    }
  } catch (err) {
    console.error('Error refreshing closed positions:', err);
  }
}

async function closePosition(ticket) {
  if (!confirm('Close this position?')) return;
  try {
    const result = await window.mt5API.closePosition(ticket);
    if (result.success) {
      showMessage('Position closed!', 'success');
      refreshPositions();
      refreshAccount();
    } else {
      showMessage('Failed to close: ' + result.error, 'error');
    }
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
  }
}

// Trade Modal
function showTradeModal() {
  if (!isConnected) {
    showMessage('Please connect first', 'error');
    return;
  }
  document.getElementById('tradeModal').classList.add('show');
  updateTradePrice();
  startPriceRefresh();
}

function hideTradeModal() {
  document.getElementById('tradeModal').classList.remove('show');
  stopPriceRefresh();
}

function startPriceRefresh() {
  priceUpdateInterval = setInterval(updateTradePrice, 1000);
}

function stopPriceRefresh() {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
  }
}

async function updateTradePrice() {
  const symbol = document.getElementById('tradeSymbol').value;
  try {
    const result = await window.mt5API.getMarketData(symbol);
    if (result.success) {
      document.getElementById('currentBid').textContent = result.data.bid.toFixed(5);
      document.getElementById('currentAsk').textContent = result.data.ask.toFixed(5);
    }
  } catch (err) {
    console.error('Error updating price:', err);
  }
}

async function executeTrade() {
  const orderData = {
    symbol: document.getElementById('tradeSymbol').value,
    type: document.getElementById('tradeType').value,
    volume: parseFloat(document.getElementById('tradeVolume').value),
    stopLoss: parseFloat(document.getElementById('tradeStopLoss').value) || 0,
    takeProfit: parseFloat(document.getElementById('tradeTakeProfit').value) || 0
  };
  
  try {
    const result = await window.mt5API.executeOrder(orderData);
    if (result.success) {
      showMessage(`Trade executed! Ticket: ${result.data.ticket}`, 'success');
      hideTradeModal();
      refreshPositions();
      refreshAccount();
    } else {
      showMessage('Trade failed: ' + result.error, 'error');
    }
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
  }
}

// Settings
function showSettingsModal() {
  document.getElementById('settingsModal').classList.add('show');
}

function hideSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

async function resetSimulator() {
  const balance = parseFloat(document.getElementById('initialBalance').value) || 10000;
  try {
    const result = await window.mt5API.resetSimulator(balance);
    if (result.success) {
      showMessage('Simulator reset!', 'success');
      refreshAccount();
      refreshPositions();
    }
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
  }
}

// Log
function showLogModal() {
  document.getElementById('logModal').classList.add('show');
  updateLogDisplay();
}

function hideLogModal() {
  document.getElementById('logModal').classList.remove('show');
}

function addLog(type, message) {
  logEntries.push({
    timestamp: new Date().toLocaleTimeString(),
    type,
    message: typeof message === 'object' ? JSON.stringify(message) : message
  });
  if (logEntries.length > 100) logEntries.shift();
  updateLogDisplay();
}

function updateLogDisplay() {
  const container = document.getElementById('logContent');
  if (logEntries.length === 0) {
    container.innerHTML = '<p class="no-log">No log entries yet.</p>';
    return;
  }
  container.innerHTML = logEntries.map(entry => `
    <div class="log-entry ${entry.type}">
      <span class="log-time">${entry.timestamp}</span>
      <span class="log-type">[${entry.type.toUpperCase()}]</span>
      <span class="log-message">${entry.message}</span>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  logEntries = [];
  updateLogDisplay();
}

// Strategy
function runStrategy() {
  const triggers = nodeEditor.nodes.filter(n => n.type === 'trigger');
  if (triggers.length === 0) {
    showMessage('No trigger nodes found', 'error');
    return;
  }
  showMessage('Strategy executed!', 'success');
  addLog('info', 'Strategy executed with ' + triggers.length + ' trigger(s)');
}

// Graph save/load
function saveGraph() {
  const graph = nodeEditor.getGraph();
  const json = JSON.stringify(graph, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'strategy.json';
  a.click();
  URL.revokeObjectURL(url);
  showMessage('Strategy saved!', 'success');
}

function loadGraph() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const graph = JSON.parse(event.target.result);
        nodeEditor.loadGraph(graph);
        showMessage('Strategy loaded!', 'success');
      } catch (err) {
        showMessage('Invalid file', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearGraph() {
  if (confirm('Clear all nodes?')) {
    nodeEditor.clear();
    showMessage('Canvas cleared', 'info');
  }
}

// Properties panel
let lastSelectedNodeId = null;
function updatePropertiesPanel(node) {
  if (node?.id === lastSelectedNodeId) return;
  lastSelectedNodeId = node?.id || null;
  
  const container = document.getElementById('nodeProperties');
  if (!node) {
    container.innerHTML = '<p class="no-selection">Select a node to edit properties</p>';
    return;
  }
  
  let html = `<h4>${node.title}</h4>`;
  for (let key in node.params) {
    const value = node.params[key];
    const inputId = `param-${key}`;
    
    if (typeof value === 'boolean') {
      html += `
        <div class="form-group">
          <label>${key}:</label>
          <input type="checkbox" id="${inputId}" ${value ? 'checked' : ''} 
                 onchange="updateNodeParam('${key}', this.checked)">
        </div>`;
    } else if (typeof value === 'number') {
      html += `
        <div class="form-group">
          <label>${key}:</label>
          <input type="number" id="${inputId}" value="${value}" step="any"
                 onchange="updateNodeParam('${key}', parseFloat(this.value))">
        </div>`;
    } else {
      html += `
        <div class="form-group">
          <label>${key}:</label>
          <input type="text" id="${inputId}" value="${value}"
                 onchange="updateNodeParam('${key}', this.value)">
        </div>`;
    }
  }
  container.innerHTML = html;
}

window.updateNodeParam = function(key, value) {
  if (nodeEditor.selectedNode) {
    nodeEditor.selectedNode.params[key] = value;
  }
};

window.updatePropertiesPanel = updatePropertiesPanel;

// UI helpers
function switchPositionsTab(tab) {
  document.querySelectorAll('.positions-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.positions-tab').forEach(t => {
    t.classList.toggle('active', t.id === tab + 'PositionsTab');
  });
  if (tab === 'closed') refreshClosedPositions();
}

function toggleBottomPanel() {
  document.querySelector('.bottom-panel').classList.toggle('collapsed');
}

function showHelp() {
  alert('MT5 Strategy Builder - Web Demo\n\n' +
        '1. Click "Connect Demo" to start\n' +
        '2. Add nodes from the left panel\n' +
        '3. Connect nodes by dragging from outputs to inputs\n' +
        '4. Use "New Trade" to execute trades\n' +
        '5. Save/Load your strategies\n\n' +
        'This is a demo version with simulated trading.');
}

function showMessage(text, type = 'info') {
  const box = document.getElementById('messageBox');
  box.textContent = text;
  box.className = 'message-box show ' + type;
  setTimeout(() => box.classList.remove('show'), 3000);
}

async function loadSettings() {
  try {
    const settings = await window.electronAPI.loadSettings('app_settings.json');
    if (settings?.simulator?.balance) {
      document.getElementById('initialBalance').value = settings.simulator.balance;
    }
  } catch (err) {
    console.log('Using default settings');
  }
}
