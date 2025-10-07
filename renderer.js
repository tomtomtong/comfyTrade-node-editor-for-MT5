// Main UI Controller
let isConnected = false;
let nodeEditor = null;
let symbolInput = null;
let logEntries = [];
let isStrategyRunning = false;
let strategyStopRequested = false;
let currentPositions = []; // Store current positions for dropdown selection

// Override console methods to capture logs
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

function addLogEntry(type, message, source = 'console') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = {
    timestamp,
    type,
    source,
    message: typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message)
  };
  logEntries.push(entry);
  
  // Keep only last 100 entries
  if (logEntries.length > 100) {
    logEntries = logEntries.slice(-100);
  }
  
  // Update log display if modal is open
  updateLogDisplay();
}

// Override console methods
console.log = (...args) => {
  originalConsole.log(...args);
  addLogEntry('info', args.join(' '));
};

console.error = (...args) => {
  originalConsole.error(...args);
  addLogEntry('error', args.join(' '));
};

console.warn = (...args) => {
  originalConsole.warn(...args);
  addLogEntry('warning', args.join(' '));
};

console.info = (...args) => {
  originalConsole.info(...args);
  addLogEntry('info', args.join(' '));
};

// MT5 API Response Logging
function logMT5Response(action, response, requestData = null) {
  const logMessage = {
    action: action,
    success: response.success,
    timestamp: new Date().toISOString()
  };
  
  if (requestData) {
    logMessage.request = requestData;
  }
  
  if (response.data) {
    logMessage.data = response.data;
  }
  
  if (response.error) {
    logMessage.error = response.error;
  }
  
  addLogEntry('info', logMessage, 'MT5-API');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeNodeEditor();
  setupEventListeners();
  updateStrategyButtons(); // Set initial button state
  window.historyImport.checkBacktestMode();
});

function initializeNodeEditor() {
  const canvas = document.getElementById('nodeCanvas');
  nodeEditor = new NodeEditor(canvas);
  
  // Canvas starts empty - users can add nodes from the palette
}

function setupEventListeners() {
  // Toolbar buttons
  document.getElementById('connectBtn').addEventListener('click', showConnectionModal);
  document.getElementById('tradeBtn').addEventListener('click', showTradeModal);
  document.getElementById('backtestBtn').addEventListener('click', () => window.historyImport.showBacktestModal());
  document.getElementById('showLogBtn').addEventListener('click', showLogModal);
  document.getElementById('runStrategyBtn').addEventListener('click', showRunStrategyModal);
  document.getElementById('stopStrategyBtn').addEventListener('click', stopNodeStrategy);
  
  // Run strategy modal
  document.getElementById('confirmRunBtn').addEventListener('click', handleRunStrategy);
  document.getElementById('cancelRunBtn').addEventListener('click', hideRunStrategyModal);
  
  // Show/hide periodic settings based on selection
  document.querySelectorAll('input[name="runOption"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const periodicSettings = document.getElementById('periodicSettings');
      periodicSettings.style.display = e.target.value === 'periodic' ? 'block' : 'none';
    });
  });
  document.getElementById('saveGraphBtn').addEventListener('click', saveGraph);
  document.getElementById('loadGraphBtn').addEventListener('click', loadGraph);
  document.getElementById('clearGraphBtn').addEventListener('click', clearGraph);
  
  // Modal buttons
  document.getElementById('confirmConnectBtn').addEventListener('click', handleConnect);
  document.getElementById('cancelConnectBtn').addEventListener('click', hideConnectionModal);
  document.getElementById('confirmTradeBtn').addEventListener('click', handleExecuteTrade);
  document.getElementById('cancelTradeBtn').addEventListener('click', hideTradeModal);
  document.getElementById('confirmImportBtn').addEventListener('click', () => window.historyImport.handleImportHistory());
  document.getElementById('cancelImportBtn').addEventListener('click', () => window.historyImport.hideBacktestModal());
  
  // Account refresh
  document.getElementById('refreshAccountBtn').addEventListener('click', handleRefreshAccount);
  
  // Volume loss calculation
  document.getElementById('tradeVolume').addEventListener('input', calculateVolumeLoss);
  document.getElementById('tradeType').addEventListener('change', calculateVolumeLoss);
  
  // Volume loss reminder modal
  document.getElementById('closeAlertBtn').addEventListener('click', hidePriceDropAlert);
  document.getElementById('modifyPositionBtn').addEventListener('click', handleModifyPositionFromAlert);
  
  // Log modal
  document.getElementById('closeLogBtn').addEventListener('click', hideLogModal);
  document.getElementById('clearLogBtn').addEventListener('click', clearLog);
  document.getElementById('copyLogBtn').addEventListener('click', copyLog);
  
  // Stop strategy modal
  document.getElementById('confirmStopBtn').addEventListener('click', handleStopStrategy);
  document.getElementById('cancelStopBtn').addEventListener('click', hideStopStrategyModal);
  
  // Node palette buttons
  document.querySelectorAll('.node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.dataset.type;
      const canvas = document.getElementById('nodeCanvas');
      const rect = canvas.getBoundingClientRect();
      const x = rect.width / 2 - 90 + Math.random() * 100;
      const y = rect.height / 2 - 40 + Math.random() * 100;
      nodeEditor.addNode(type, x, y);
    });
  });
  
  // Node selection handler - track changes to avoid unnecessary updates
  let lastSelectedNode = null;
  setInterval(() => {
    if (nodeEditor.selectedNode !== lastSelectedNode) {
      lastSelectedNode = nodeEditor.selectedNode;
      updatePropertiesPanel(nodeEditor.selectedNode);
    }
  }, 100);
}

// Connection Modal
function showConnectionModal() {
  document.getElementById('connectionModal').classList.add('show');
}

function hideConnectionModal() {
  document.getElementById('connectionModal').classList.remove('show');
}

// Trade Modal
function showTradeModal() {
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }
  
  // Initialize symbol input if not already done
  if (!symbolInput) {
    initializeSymbolInput();
  }
  
  document.getElementById('tradeModal').classList.add('show');
  
  // Update current price if symbol is already selected
  const currentSymbol = symbolInput.getValue();
  if (currentSymbol && currentSymbol.length >= 6) {
    updateCurrentPrice(currentSymbol);
  }
  
  // Note: Removed automatic volume loss calculation to prevent immediate popup
  // Users can still calculate volume loss by changing volume or symbol values
}

function hideTradeModal() {
  document.getElementById('tradeModal').classList.remove('show');
  stopPriceAutoRefresh();
}

function initializeSymbolInput() {
  const container = document.getElementById('symbolInputContainer');
  symbolInput = new SymbolInput(container, {
    placeholder: 'Enter symbol (e.g., EURUSD)',
    onSymbolSelect: (symbol, symbolData) => {
      console.log('Selected symbol:', symbol, symbolData);
      updateCurrentPrice(symbol);
    },
    onSymbolChange: (symbol) => {
      // Update market data display if needed
      if (symbol && symbol.length >= 6) {
        updateMarketDataPreview(symbol);
        updateCurrentPrice(symbol);
        // Note: Removed automatic volume loss calculation to prevent immediate popup
        // Users can still calculate volume loss by changing volume or symbol values
      } else {
        hideCurrentPrice();
      }
    }
  });
  
  // Quick symbol buttons
  document.querySelectorAll('.quick-symbol-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.symbol;
      symbolInput.setValue(symbol);
      updateCurrentPrice(symbol);
      // Note: Removed automatic volume loss calculation to prevent immediate popup
      // Users can still calculate volume loss by changing volume or symbol values
    });
  });
  
  // Refresh price button
  document.getElementById('refreshPriceBtn').addEventListener('click', () => {
    const symbol = symbolInput.getValue();
    if (symbol && symbol.length >= 6) {
      updateCurrentPrice(symbol);
    }
  });
}

async function updateMarketDataPreview(symbol) {
  try {
    const result = await window.mt5API.getMarketData(symbol);
    
    if (result.success) {
      // Could add a small market data preview here
      console.log('Market data for', symbol, result.data);
    }
  } catch (error) {
    console.error('Error getting market data:', error);
  }
}

let priceUpdateInterval = null;

async function updateCurrentPrice(symbol) {
  if (!isConnected || !symbol || symbol.length < 6) {
    hideCurrentPrice();
    return;
  }

  try {
    // Show loading state
    showCurrentPriceLoading();
    
    const result = await window.mt5API.getMarketData(symbol);
    
    if (result.success && result.data) {
      const data = result.data;
      
      // Show the price display
      document.getElementById('currentPriceGroup').style.display = 'block';
      
      // Update price values with animation
      updatePriceValue('currentBid', data.bid);
      updatePriceValue('currentAsk', data.ask);
      updatePriceValue('currentSpread', (data.ask - data.bid).toFixed(5));
      
      // Update timestamp
      const now = new Date();
      document.getElementById('priceUpdateTime').textContent = now.toLocaleTimeString();
      
      // Start auto-refresh if not already running
      startPriceAutoRefresh(symbol);
      
    } else {
      showPriceError('Failed to get price data');
    }
  } catch (error) {
    console.error('Error getting current price:', error);
    showPriceError('Error: ' + error.message);
  }
}

function updatePriceValue(elementId, value) {
  const element = document.getElementById(elementId);
  const formattedValue = typeof value === 'number' ? value.toFixed(5) : value;
  
  // Add updating animation
  element.classList.add('updating');
  
  setTimeout(() => {
    element.textContent = formattedValue;
    element.classList.remove('updating');
    element.classList.add('updated');
    
    setTimeout(() => {
      element.classList.remove('updated');
    }, 500);
  }, 150);
}

function showCurrentPriceLoading() {
  document.getElementById('currentPriceGroup').style.display = 'block';
  document.getElementById('currentBid').textContent = 'Loading...';
  document.getElementById('currentAsk').textContent = 'Loading...';
  document.getElementById('currentSpread').textContent = 'Loading...';
  document.getElementById('priceUpdateTime').textContent = 'Updating...';
}

function showPriceError(message) {
  document.getElementById('currentBid').textContent = 'Error';
  document.getElementById('currentAsk').textContent = 'Error';
  document.getElementById('currentSpread').textContent = 'Error';
  document.getElementById('priceUpdateTime').textContent = message;
}

function hideCurrentPrice() {
  document.getElementById('currentPriceGroup').style.display = 'none';
  stopPriceAutoRefresh();
}

function startPriceAutoRefresh(symbol) {
  // Clear existing interval
  stopPriceAutoRefresh();
  
  // Update every 5 seconds
  priceUpdateInterval = setInterval(() => {
    if (isConnected && document.getElementById('tradeModal').classList.contains('show')) {
      updateCurrentPrice(symbol);
    } else {
      stopPriceAutoRefresh();
    }
  }, 5000);
}

function stopPriceAutoRefresh() {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
  }
}

async function handleExecuteTrade() {
  const symbol = symbolInput.getValue();
  const type = document.getElementById('tradeType').value;
  const volume = parseFloat(document.getElementById('tradeVolume').value);
  const stopLoss = parseFloat(document.getElementById('tradeStopLoss').value) || 0;
  const takeProfit = parseFloat(document.getElementById('tradeTakeProfit').value) || 0;
  
  if (!symbol) {
    showMessage('Please enter a symbol', 'error');
    return;
  }
  
  if (!volume || volume <= 0) {
    showMessage('Please enter a valid volume', 'error');
    return;
  }

  // Check overtrade control before proceeding
  const tradeData = { symbol, type, volume, stopLoss, takeProfit, action: 'executeOrder' };
  const shouldProceed = await window.overtradeControl.checkBeforeTrade('manual', tradeData);
  
  if (!shouldProceed) {
    showMessage('Trade cancelled', 'info');
    return;
  }
  
  hideTradeModal();
  showMessage('Executing trade...', 'info');
  
  try {
    const orderData = {
      symbol,
      type,
      volume,
      stopLoss,
      takeProfit
    };
    
    const result = await window.mt5API.executeOrder(orderData);
    
    // Log MT5 order execution response
    logMT5Response('executeOrder', result, orderData);
    
    if (result.success && result.data.success) {
      showMessage(`Trade executed successfully! Ticket: ${result.data.ticket}`, 'success');
      handleRefreshAccount();
      handleRefreshPositions();
    } else {
      showMessage('Trade failed: ' + (result.data?.error || result.error), 'error');
    }
  } catch (error) {
    showMessage('Trade execution error: ' + error.message, 'error');
  }
}

async function handleConnect() {
  // Use default connection settings - no need for user input
  const server = 'localhost';
  const port = '8765';

  showMessage('Connecting to MT5...', 'info');
  hideConnectionModal();

  const result = await window.mt5API.connect({ server, port });

  if (result.success) {
    isConnected = true;
    document.getElementById('connectionStatus').textContent = 'Connected';
    document.getElementById('connectionStatus').className = 'status connected';
    showMessage('Connected to MT5 successfully!', 'success');
    
    handleRefreshAccount();
    handleRefreshPositions();
    
    // Start auto-refresh
    startAutoRefresh();
  } else {
    showMessage('Connection failed: ' + result.error, 'error');
  }
}

// Account Info
async function handleRefreshAccount() {
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }

  const result = await window.mt5API.getAccountInfo();

  if (result.success) {
    const data = result.data;
    document.getElementById('balance').textContent = '$' + data.balance.toFixed(2);
    document.getElementById('equity').textContent = '$' + data.equity.toFixed(2);
    
    const profitEl = document.getElementById('profit');
    profitEl.textContent = '$' + data.profit.toFixed(2);
    profitEl.className = 'profit ' + (data.profit >= 0 ? 'positive' : 'negative');
  }
}

async function handleRefreshPositions() {
  if (!isConnected) return;

  const result = await window.mt5API.getPositions();

  if (result.success) {
    const positions = result.data;
    currentPositions = positions; // Store positions globally for dropdown access
    const container = document.getElementById('positionsList');

    if (positions.length === 0) {
      container.innerHTML = '<p class="no-data">No open positions</p>';
    } else {
      container.innerHTML = positions.map(pos => `
        <div class="position-item ${pos.type.toLowerCase()}">
          <div class="position-header">
            <span>${pos.symbol} ${pos.type}</span>
            <span class="${pos.profit >= 0 ? 'profit positive' : 'profit negative'}">
              $${pos.profit.toFixed(2)}
            </span>
          </div>
          <div class="position-details">
            Vol: ${pos.volume} | Entry: ${pos.open_price.toFixed(5)} | Current: ${pos.current_price.toFixed(5)}
          </div>
          <div class="position-details">
            SL: ${pos.stop_loss > 0 ? pos.stop_loss.toFixed(5) : 'None'} | TP: ${pos.take_profit > 0 ? pos.take_profit.toFixed(5) : 'None'}
          </div>
          <div class="position-actions">
            <button class="btn btn-small btn-primary" onclick="showModifyModal(${pos.ticket}, ${pos.stop_loss}, ${pos.take_profit})">Modify</button>
            <button class="btn btn-small btn-danger" onclick="closePosition(${pos.ticket})">Close</button>
          </div>
        </div>
      `).join('');
    }
  }
}

async function closePosition(ticket) {
  if (!confirm('Are you sure you want to close this position?')) {
    return;
  }

  // Record position management action (doesn't count for overtrade)
  window.overtradeControl.recordPositionManagement('closePosition', { ticket });

  showMessage('Closing position...', 'info');

  const result = await window.mt5API.closePosition(ticket);

  if (result.success && result.data.success) {
    showMessage('Position closed successfully!', 'success');
    handleRefreshAccount();
    handleRefreshPositions();
  } else {
    showMessage('Failed to close position: ' + (result.data?.error || result.error), 'error');
  }
}

function showModifyModal(ticket, currentSL, currentTP) {
  const modal = document.getElementById('modifyModal');
  if (!modal) {
    createModifyModal();
  }
  
  document.getElementById('modifyTicket').value = ticket;
  document.getElementById('modifyStopLoss').value = currentSL > 0 ? currentSL : '';
  document.getElementById('modifyTakeProfit').value = currentTP > 0 ? currentTP : '';
  document.getElementById('modifyModal').classList.add('show');
}

function hideModifyModal() {
  document.getElementById('modifyModal').classList.remove('show');
}

async function handleModifyPosition() {
  const ticket = parseInt(document.getElementById('modifyTicket').value);
  const slValue = document.getElementById('modifyStopLoss').value;
  const tpValue = document.getElementById('modifyTakeProfit').value;
  
  const stopLoss = slValue ? parseFloat(slValue) : 0;
  const takeProfit = tpValue ? parseFloat(tpValue) : 0;

  hideModifyModal();
  // Record position management action (doesn't count for overtrade)
  window.overtradeControl.recordPositionManagement('modifyPosition', { ticket, stopLoss, takeProfit });

  showMessage('Modifying position...', 'info');

  const result = await window.mt5API.modifyPosition(ticket, stopLoss, takeProfit);

  if (result.success && result.data.success) {
    showMessage('Position modified successfully!', 'success');
    handleRefreshPositions();
  } else {
    showMessage('Failed to modify position: ' + (result.data?.error || result.error), 'error');
  }
}

function createModifyModal() {
  const modalHTML = `
    <div id="modifyModal" class="modal">
      <div class="modal-content">
        <h2>Modify Position</h2>
        <input type="hidden" id="modifyTicket">
        <div class="form-group">
          <label>Stop Loss:</label>
          <input type="number" id="modifyStopLoss" step="0.00001" placeholder="0 for none">
        </div>
        <div class="form-group">
          <label>Take Profit:</label>
          <input type="number" id="modifyTakeProfit" step="0.00001" placeholder="0 for none">
        </div>
        <div class="modal-actions">
          <button id="confirmModifyBtn" class="btn btn-primary">Modify</button>
          <button id="cancelModifyBtn" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  document.getElementById('confirmModifyBtn').addEventListener('click', handleModifyPosition);
  document.getElementById('cancelModifyBtn').addEventListener('click', hideModifyModal);
}

// Make functions globally available
window.closePosition = closePosition;
window.showModifyModal = showModifyModal;
window.testVolumeLossFromNode = testVolumeLossFromNode;
window.showSignalPopup = showSignalPopup;

// Show Run Strategy Modal
function showRunStrategyModal() {
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }

  const graph = nodeEditor.exportGraph();
  
  if (graph.nodes.length === 0) {
    showMessage('Please add nodes to the canvas first', 'error');
    return;
  }

  // Check if there are any trigger nodes
  const hasTriggers = graph.nodes.some(node => node.type === 'trigger');
  if (!hasTriggers) {
    showMessage('Please add at least one Trigger node', 'error');
    return;
  }

  // Reset modal to default state
  document.getElementById('runOnce').checked = true;
  document.getElementById('periodicSettings').style.display = 'none';
  document.getElementById('periodicInterval').value = 60;
  document.getElementById('periodicUnit').value = 'seconds';
  
  document.getElementById('runStrategyModal').classList.add('show');
}

// Hide Run Strategy Modal
function hideRunStrategyModal() {
  document.getElementById('runStrategyModal').classList.remove('show');
}

// Handle Run Strategy Confirmation
async function handleRunStrategy() {
  const runMode = document.querySelector('input[name="runOption"]:checked').value;
  const interval = parseInt(document.getElementById('periodicInterval').value);
  const unit = document.getElementById('periodicUnit').value;
  
  hideRunStrategyModal();

  // Check overtrade control for node-based strategies
  const shouldProceed = await window.overtradeControl.checkBeforeTrade('node', { nodeCount: nodeEditor.nodes.length, action: 'executeNodeStrategy' });
  
  if (!shouldProceed) {
    showMessage('Node strategy execution cancelled', 'info');
    return;
  }

  try {
    // Get all trigger nodes
    const triggers = nodeEditor.nodes.filter(node => node.type === 'trigger');
    
    if (triggers.length === 0) {
      showMessage('No trigger nodes found.', 'error');
      return;
    }

    if (runMode === 'once') {
      // Execute all triggers once
      showMessage('Executing strategy once...', 'info');
      
      triggers.forEach(node => {
        nodeEditor.executeTrigger(node);
      });
      
      showMessage(`Strategy executed: ${triggers.length} trigger(s) fired`, 'success');
      
    } else {
      // Start periodic execution
      isStrategyRunning = true;
      strategyStopRequested = false;
      updateStrategyButtons();
      
      showMessage('Starting periodic strategy execution...', 'info');
      
      // Set interval parameters for all triggers and start them
      triggers.forEach(node => {
        node.params.interval = interval;
        node.params.unit = unit;
        nodeEditor.startPeriodTrigger(node);
      });
      
      showMessage(`Strategy running: ${triggers.length} trigger(s) executing every ${interval} ${unit}`, 'success');
    }

  } catch (error) {
    showMessage('Strategy execution error: ' + error.message, 'error');
    isStrategyRunning = false;
    strategyStopRequested = false;
    updateStrategyButtons();
  }
}

// Stop Node Strategy
function stopNodeStrategy() {
  if (!isStrategyRunning) {
    showMessage('No strategy is currently running', 'info');
    return;
  }

  // Show stop strategy modal
  showStopStrategyModal();
}



// Show stop strategy modal
function showStopStrategyModal() {
  document.getElementById('stopStrategyModal').classList.add('show');
}

// Hide stop strategy modal
function hideStopStrategyModal() {
  document.getElementById('stopStrategyModal').classList.remove('show');
}

// Handle stop strategy confirmation
async function handleStopStrategy() {
  hideStopStrategyModal();
  strategyStopRequested = true;
  
  showMessage('Stopping strategy execution...', 'info');

  // Stop any running period triggers
  if (nodeEditor) {
    nodeEditor.stopAllTriggers();
  }

  // Reset strategy state
  isStrategyRunning = false;
  strategyStopRequested = false;
  updateStrategyButtons();
  
  showMessage('Strategy stopped successfully', 'success');
}

// Update strategy button visibility and status
function updateStrategyButtons() {
  const runBtn = document.getElementById('runStrategyBtn');
  const stopBtn = document.getElementById('stopStrategyBtn');
  const statusEl = document.getElementById('strategyStatus');
  
  if (isStrategyRunning) {
    runBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    
    if (strategyStopRequested) {
      stopBtn.textContent = '⏹ Stopping...';
      stopBtn.disabled = true;
      statusEl.textContent = 'Stopping';
      statusEl.className = 'status strategy-stopping';
    } else {
      stopBtn.textContent = '⏹ Stop Strategy';
      stopBtn.disabled = false;
      statusEl.textContent = 'Running';
      statusEl.className = 'status strategy-running';
    }
  } else {
    runBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    statusEl.textContent = 'Idle';
    statusEl.className = 'status strategy-idle';
  }
}

// Properties Panel
function updatePropertiesPanel(node) {
  const panel = document.getElementById('nodeProperties');
  
  if (!node) {
    panel.innerHTML = '<p class="no-selection">Select a node to edit properties</p>';
    return;
  }
  
  const paramEntries = Object.entries(node.params);
  
  if (paramEntries.length === 0) {
    panel.innerHTML = `
      <div class="property-item">
        <label>Node Type:</label>
        <input type="text" value="${node.title}" disabled>
      </div>
      <p class="no-selection">This node has no parameters</p>
      <div class="property-actions">
        <button class="btn btn-danger btn-small" onclick="deleteSelectedNode()">
          Delete Node
        </button>
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="property-item">
      <label>Node Type:</label>
      <input type="text" value="${node.title}" disabled>
    </div>
    ${paramEntries.map(([key, value]) => {
      if (key === 'symbol') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <div id="nodeSymbolInput-${node.id}" class="node-symbol-input"></div>
          </div>
        `;
      } else if (key === 'action' && node.type === 'trade-signal') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="BUY" ${value === 'BUY' ? 'selected' : ''}>BUY</option>
              <option value="SELL" ${value === 'SELL' ? 'selected' : ''}>SELL</option>
            </select>
          </div>
        `;
      } else if (key === 'volume' && node.type === 'trade-signal') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <input type="number" 
                   value="${value}" 
                   min="0.01"
                   step="0.01"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseFloat(this.value))">
          </div>
        `;
      } else if (key === 'operator' && node.type === 'conditional-check') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value=">" ${value === '>' ? 'selected' : ''}>> (Greater Than)</option>
              <option value="<" ${value === '<' ? 'selected' : ''}>< (Less Than)</option>
              <option value=">=" ${value === '>=' ? 'selected' : ''}>>= (Greater or Equal)</option>
              <option value="<=" ${value === '<=' ? 'selected' : ''}><= (Less or Equal)</option>
              <option value="==" ${value === '==' ? 'selected' : ''}>= (Equal)</option>
              <option value="!=" ${value === '!=' ? 'selected' : ''}>!= (Not Equal)</option>
            </select>
          </div>
        `;
      } else if (key === 'price' && node.type === 'conditional-check') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <input type="number" 
                   value="${value}" 
                   step="0.00001"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseFloat(this.value))">
          </div>
        `;
      } else if (key === 'usePercentageChange' && node.type === 'conditional-check') {
        return `
          <div class="property-item">
            <label>Use Percentage Change:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value === 'true')">
              <option value="false" ${!value ? 'selected' : ''}>Use Price</option>
              <option value="true" ${value ? 'selected' : ''}>Use Percentage Change</option>
            </select>
          </div>
        `;
      } else if (key === 'percentageChange' && node.type === 'conditional-check') {
        return `
          <div class="property-item">
            <label>Target % Change:</label>
            <input type="number" 
                   value="${value}" 
                   step="0.01"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseFloat(this.value))">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Percentage change threshold to trigger condition (e.g., 2.5 for 2.5%)
            </small>
          </div>
        `;
      } else if (key === 'timeframe' && node.type === 'conditional-check') {
        return `
          <div class="property-item">
            <label>Timeframe (for % change):</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="M1" ${value === 'M1' ? 'selected' : ''}>M1 - Compare last 2 minutes</option>
              <option value="M5" ${value === 'M5' ? 'selected' : ''}>M5 - Compare last 2 x 5min bars</option>
              <option value="M15" ${value === 'M15' ? 'selected' : ''}>M15 - Compare last 2 x 15min bars</option>
              <option value="M30" ${value === 'M30' ? 'selected' : ''}>M30 - Compare last 2 x 30min bars</option>
              <option value="H1" ${value === 'H1' ? 'selected' : ''}>H1 - Compare last 2 hours</option>
              <option value="H4" ${value === 'H4' ? 'selected' : ''}>H4 - Compare last 2 x 4hour bars</option>
              <option value="D1" ${value === 'D1' ? 'selected' : ''}>D1 - Compare last 2 days</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Timeframe determines the period size for calculating percentage change
            </small>
          </div>
        `;
      } else if (key === 'type' && node.type === 'signal-popup') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="info" ${value === 'info' ? 'selected' : ''}>Info</option>
              <option value="success" ${value === 'success' ? 'selected' : ''}>Success</option>
              <option value="warning" ${value === 'warning' ? 'selected' : ''}>Warning</option>
              <option value="error" ${value === 'error' ? 'selected' : ''}>Error</option>
            </select>
          </div>
        `;
      } else if (key === 'autoClose' && node.type === 'signal-popup') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value === 'true')">
              <option value="true" ${value ? 'selected' : ''}>Auto Close</option>
              <option value="false" ${!value ? 'selected' : ''}>Manual Close</option>
            </select>
          </div>
        `;
      } else if (key === 'duration' && node.type === 'signal-popup') {
        return `
          <div class="property-item">
            <label>${key} (ms):</label>
            <input type="number" 
                   value="${value}" 
                   min="1000"
                   step="1000"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseInt(this.value))">
          </div>
        `;
      } else if (key === 'ticket' && (node.type === 'close-position' || node.type === 'modify-position')) {
        const positionOptions = currentPositions.map(pos => 
          `<option value="${pos.ticket}" ${value == pos.ticket ? 'selected' : ''}>
            ${pos.ticket} - ${pos.symbol} ${pos.type} (${pos.volume})
          </option>`
        ).join('');
        
        const onChangeHandler = node.type === 'modify-position' 
          ? `onchange="window.updateNodeParamAndLoadPosition('${key}', this.value, '${node.id}')"` 
          : `onchange="window.updateNodeParam('${key}', this.value)"`;
        
        const noPositionsMsg = currentPositions.length === 0 
          ? '<small style="color: #ff9800;">No positions loaded. Click "Refresh Positions" button below.</small>' 
          : '';
        
        return `
          <div class="property-item">
            <label>Select Position:</label>
            <select data-param="${key}" ${onChangeHandler}>
              <option value="">Select a position...</option>
              ${positionOptions}
            </select>
            ${noPositionsMsg}
          </div>
        `;
      } else if (key === 'closeType' && node.type === 'close-position') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="all" ${value === 'all' ? 'selected' : ''}>Close All</option>
              <option value="partial" ${value === 'partial' ? 'selected' : ''}>Partial Close</option>
              <option value="specific" ${value === 'specific' ? 'selected' : ''}>Specific Ticket</option>
            </select>
          </div>
        `;
      } else if ((key === 'stopLoss' || key === 'takeProfit') && node.type === 'modify-position') {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <input type="number" 
                   value="${value}" 
                   step="0.00001"
                   placeholder="0 for none"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseFloat(this.value) || 0)">
          </div>
        `;
      } else if (key === 'confirmAction' && node.type === 'close-all-positions') {
        return `
          <div class="property-item">
            <label>Require Confirmation:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value === 'true')">
              <option value="true" ${value ? 'selected' : ''}>Yes</option>
              <option value="false" ${!value ? 'selected' : ''}>No</option>
            </select>
          </div>
        `;
      } else if (key === 'filterBySymbol' && node.type === 'close-all-positions') {
        return `
          <div class="property-item">
            <label>Filter by Symbol:</label>
            <input type="text" 
                   value="${value}" 
                   placeholder="Leave empty for all symbols"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value)">
          </div>
        `;
      } else if (key === 'filterByType' && node.type === 'close-all-positions') {
        return `
          <div class="property-item">
            <label>Filter by Type:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="all" ${value === 'all' ? 'selected' : ''}>All Positions</option>
              <option value="BUY" ${value === 'BUY' ? 'selected' : ''}>Buy Only</option>
              <option value="SELL" ${value === 'SELL' ? 'selected' : ''}>Sell Only</option>
            </select>
          </div>
        `;
      } else {
        return `
          <div class="property-item">
            <label>${key}:</label>
            <input type="text" 
                   value="${value}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value)">
          </div>
        `;
      }
    }).join('')}

  `;
  
  // Add action buttons
  let actionButtons = '';
  
  // Add get current price button for conditional check nodes
  if (node.type === 'conditional-check') {
    actionButtons += `
      <button class="btn btn-info btn-small" onclick="getCurrentPriceForNode('${node.id}')">
        Get Current Price
      </button>
    `;
  }
  
  // Add test loss button for trade nodes
  if (node.type === 'trade-signal') {
    actionButtons += `
      <button class="btn btn-secondary btn-small" onclick="testVolumeLossFromNode('${node.id}')">
        Test Loss
      </button>
    `;
  }
  
  // Add test popup button for signal nodes
  if (node.type === 'signal-popup') {
    actionButtons += `
      <button class="btn btn-info btn-small" onclick="testSignalPopup('${node.id}')">
        Test Popup
      </button>
    `;
  }
  
  // Add load current values button for modify-position node
  if (node.type === 'modify-position' && node.params.ticket) {
    actionButtons += `
      <button class="btn btn-secondary btn-small" onclick="loadCurrentPositionValues('${node.id}')">
        Load Current Values
      </button>
    `;
  }
  
  // Add test button for close-all-positions node
  if (node.type === 'close-all-positions') {
    actionButtons += `
      <button class="btn btn-warning btn-small" onclick="testCloseAllPositions('${node.id}')">
        Test Close All
      </button>
    `;
  }
  
  // Add delete button for all nodes
  actionButtons += `
    <button class="btn btn-danger btn-small" onclick="deleteSelectedNode()">
      Delete Node
    </button>
  `;
  
  if (actionButtons) {
    panel.innerHTML += `
      <div class="property-actions">
        ${actionButtons}
      </div>
    `;
  }
  
  // Initialize symbol input for symbol parameters
  paramEntries.forEach(([key, value]) => {
    if (key === 'symbol') {
      const container = document.getElementById(`nodeSymbolInput-${node.id}`);
      if (container && isConnected) {
        const nodeSymbolInput = new SymbolInput(container, {
          placeholder: 'Enter symbol (e.g., EURUSD)',
          onSymbolSelect: (symbol, symbolData) => {
            updateNodeParam('symbol', symbol);
          },
          onSymbolChange: (symbol) => {
            updateNodeParam('symbol', symbol);
          }
        });
        nodeSymbolInput.setValue(value);
      } else if (container) {
        // Fallback to regular input if not connected
        container.innerHTML = `
          <input type="text" 
                 value="${value}" 
                 data-param="symbol"
                 placeholder="Enter symbol (e.g., EURUSD)"
                 onchange="updateNodeParam('symbol', this.value)">
        `;
      }
    }
  });
  
  // Start period trigger if it's enabled
  if (node.type === 'trigger-period' && node.params.enabled) {
    nodeEditor.startPeriodTrigger(node);
  }
}

// Make updatePropertiesPanel available globally for node-editor.js
window.updatePropertiesPanel = updatePropertiesPanel;

window.updateNodeParam = function(key, value) {
  if (nodeEditor.selectedNode) {
    const node = nodeEditor.selectedNode;
    node.params[key] = value;
    
    // Handle period trigger updates
    if (node.type === 'trigger-period') {
      if (key === 'enabled' || key === 'interval' || key === 'unit') {
        nodeEditor.updatePeriodTrigger(node);
      }
    }
  }
};

window.updateNodeParamAndLoadPosition = function(key, ticketValue, nodeId) {
  console.log('updateNodeParamAndLoadPosition called:', { key, ticketValue, nodeId });
  
  // Find the node - try both string and number comparison
  const node = nodeEditor.nodes.find(n => n.id == nodeId || String(n.id) === String(nodeId));
  
  if (!node) {
    console.error('Node not found:', nodeId, 'Available nodes:', nodeEditor.nodes.map(n => n.id));
    showMessage('Error: Node not found', 'error');
    return;
  }
  
  console.log('Found node:', node);
  
  // Update the ticket parameter
  node.params[key] = ticketValue;
  
  // If a position is selected, load its current SL/TP values
  if (ticketValue && ticketValue !== '' && node.type === 'modify-position') {
    console.log('Looking for position with ticket:', ticketValue, 'Type:', typeof ticketValue);
    console.log('Available positions:', currentPositions.length, currentPositions);
    
    if (currentPositions.length === 0) {
      showMessage('No positions loaded. Please click "Refresh Positions" first.', 'warning');
      return;
    }
    
    // Try to find position with flexible comparison
    const selectedPosition = currentPositions.find(pos => {
      const match = String(pos.ticket) === String(ticketValue) || pos.ticket == ticketValue;
      console.log(`Comparing pos.ticket ${pos.ticket} with ${ticketValue}: ${match}`);
      return match;
    });
    
    if (selectedPosition) {
      console.log('Found position:', selectedPosition);
      
      // Update the node parameters with current position values
      node.params.stopLoss = selectedPosition.stop_loss || 0;
      node.params.takeProfit = selectedPosition.take_profit || 0;
      
      // Refresh the properties panel to show the updated values
      updatePropertiesPanel(node);
      
      const slDisplay = selectedPosition.stop_loss ? selectedPosition.stop_loss.toFixed(5) : 'None';
      const tpDisplay = selectedPosition.take_profit ? selectedPosition.take_profit.toFixed(5) : 'None';
      showMessage(`Loaded: SL=${slDisplay}, TP=${tpDisplay}`, 'success');
    } else {
      console.error('Position not found in currentPositions array');
      console.error('Searched for ticket:', ticketValue, 'in', currentPositions.map(p => p.ticket));
      showMessage('Position not found. Try refreshing positions first.', 'warning');
    }
  } else {
    console.log('Skipping position load:', { ticketValue, nodeType: node.type });
  }
};

// Handle trigger execution
window.onTriggerExecute = function(triggerNode, connectedNodes) {
  showMessage(`Trigger "${triggerNode.title}" executed! Connected to ${connectedNodes.length} nodes`, 'success');
  
  // If connected to MT5, execute the strategy flow
  if (isConnected && connectedNodes.length > 0) {
    executeNodeStrategy();
  }
};

window.deleteSelectedNode = function() {
  if (nodeEditor && nodeEditor.selectedNode) {
    nodeEditor.deleteSelectedNode();
    showMessage('Node deleted', 'info');
  }
};

window.getCurrentPriceForNode = async function(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id === nodeId);
  if (!node || !node.params.symbol) {
    showMessage('Please set a symbol for this node first', 'error');
    return;
  }
  
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }
  
  try {
    const result = await window.mt5API.getMarketData(node.params.symbol);
    
    if (result.success && result.data) {
      const price = result.data.bid || result.data.ask;
      node.params.price = price;
      
      // Update the properties panel
      updatePropertiesPanel(node);
      
      showMessage(`Current price for ${node.params.symbol}: ${price.toFixed(5)}`, 'success');
    } else {
      showMessage('Failed to get current price: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showMessage('Error getting current price: ' + error.message, 'error');
  }
};

window.refreshPositionsForNode = async function(nodeId) {
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }
  
  try {
    await handleRefreshPositions();
    
    // Update the properties panel to refresh the dropdown
    const node = nodeEditor.nodes.find(n => n.id === nodeId);
    if (node) {
      updatePropertiesPanel(node);
    }
    
    showMessage(`Positions refreshed! Found ${currentPositions.length} open positions`, 'success');
  } catch (error) {
    showMessage('Error refreshing positions: ' + error.message, 'error');
  }
};

window.previewCloseAllPositions = async function(nodeId) {
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }
  
  const node = nodeEditor.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  try {
    await handleRefreshPositions();
    
    // Filter positions based on node parameters
    let filteredPositions = currentPositions;
    
    if (node.params.filterBySymbol && node.params.filterBySymbol.trim()) {
      filteredPositions = filteredPositions.filter(pos => 
        pos.symbol.toUpperCase() === node.params.filterBySymbol.toUpperCase()
      );
    }
    
    if (node.params.filterByType && node.params.filterByType !== 'all') {
      filteredPositions = filteredPositions.filter(pos => 
        pos.type === node.params.filterByType
      );
    }
    
    if (filteredPositions.length === 0) {
      showMessage('No positions match the current filters', 'info');
    } else {
      const positionList = filteredPositions.map(pos => 
        `${pos.ticket} - ${pos.symbol} ${pos.type} (${pos.volume})`
      ).join('\n');
      
      showMessage(`Found ${filteredPositions.length} positions to close:\n${positionList}`, 'info');
    }
  } catch (error) {
    showMessage('Error previewing positions: ' + error.message, 'error');
  }
};

window.testCloseAllPositions = async function(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  if (node.params.confirmAction) {
    if (!confirm('This will close ALL matching positions. Are you sure you want to continue?')) {
      showMessage('Close all positions cancelled', 'info');
      return;
    }
  }
  
  showMessage('Test: Close All Positions would execute here', 'warning');
  console.log('Close All Positions Test:', {
    filterBySymbol: node.params.filterBySymbol,
    filterByType: node.params.filterByType,
    confirmAction: node.params.confirmAction
  });
};

window.loadCurrentPositionValues = async function(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id === nodeId);
  if (!node || !node.params.ticket) {
    showMessage('Please select a position first', 'error');
    return;
  }
  
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }
  
  try {
    // Refresh positions to get latest data
    await handleRefreshPositions();
    
    const selectedPosition = currentPositions.find(pos => pos.ticket == node.params.ticket);
    if (selectedPosition) {
      // Update the node parameters with current position values
      node.params.stopLoss = selectedPosition.stop_loss || 0;
      node.params.takeProfit = selectedPosition.take_profit || 0;
      
      // Refresh the properties panel to show the updated values
      updatePropertiesPanel(node);
      
      showMessage(`Current values loaded - SL: ${selectedPosition.stop_loss || 'None'}, TP: ${selectedPosition.take_profit || 'None'}`, 'success');
    } else {
      showMessage('Position not found. It may have been closed.', 'warning');
    }
  } catch (error) {
    showMessage('Error loading position values: ' + error.message, 'error');
  }
};

// Delete key functionality disabled - nodes cannot be deleted with Delete key

// Graph Management
function saveGraph() {
  const graph = nodeEditor.exportGraph();
  const json = JSON.stringify(graph, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'strategy-' + Date.now() + '.json';
  a.click();
  
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
        nodeEditor.importGraph(graph);
        showMessage('Strategy loaded!', 'success');
      } catch (error) {
        showMessage('Failed to load strategy: ' + error.message, 'error');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

function clearGraph() {
  if (confirm('Clear all nodes? This cannot be undone.')) {
    nodeEditor.clear();
    document.getElementById('nodeProperties').innerHTML = 
      '<p class="no-selection">Select a node to edit properties</p>';
    showMessage('Canvas cleared', 'info');
  }
}

// Auto-refresh
let refreshInterval = null;

function startAutoRefresh() {
  if (refreshInterval) return;
  
  refreshInterval = setInterval(() => {
    if (isConnected) {
      handleRefreshAccount();
      handleRefreshPositions();
    }
  }, 5000);
}

// Message System
function showMessage(text, type) {
  const messageBox = document.getElementById('messageBox');
  messageBox.textContent = text;
  messageBox.className = `message-box show ${type}`;

  setTimeout(() => {
    messageBox.className = 'message-box';
  }, 3000);
}

// Volume Loss Calculation
async function calculateVolumeLoss() {
  const volume = parseFloat(document.getElementById('tradeVolume').value);
  const tradeType = document.getElementById('tradeType').value;
  const symbol = symbolInput ? symbolInput.getValue() : '';
  
  if (!volume || volume <= 0 || !symbol || symbol.length < 6) {
    document.getElementById('volumeLossInfo').style.display = 'none';
    return;
  }
  
  try {
    let currentPrice;
    
    // Check if MT5 is connected, otherwise use mock data for testing
    if (isConnected && window.mt5API) {
      try {
        // Get symbol info for accurate calculation
        const symbolInfoResult = await window.mt5API.getSymbolInfo(symbol);
        
        if (symbolInfoResult.success && symbolInfoResult.data) {
          const symbolInfo = symbolInfoResult.data;
          currentPrice = symbolInfo.bid || symbolInfo.ask;
        } else {
          // Fallback to market data only
          const marketResult = await window.mt5API.getMarketData(symbol);
          
          if (marketResult.success && marketResult.data) {
            currentPrice = marketResult.data.bid || marketResult.data.ask || marketResult.data.price;
          }
        }
      } catch (err) {
        console.error('Error getting symbol info:', err);
      }
    } else {
      // Mock data for testing without MT5 connection
      currentPrice = 1.0850; // Mock EURUSD price
    }
    
    if (!currentPrice || currentPrice <= 0) {
      document.getElementById('volumeLossInfo').style.display = 'none';
      return;
    }
    
    // Calculate accurate loss using real contract information from MetaTrader
    let pipValue, pipSize, contractSize;
    let tickSize, tickValue;
    
    // Step 1: Retrieve real contract specifications from MT5
    if (isConnected && window.mt5API) {
      try {
        const symbolInfoResult = await window.mt5API.getSymbolInfo(symbol);
        
        if (symbolInfoResult.success && symbolInfoResult.data) {
          const symbolInfo = symbolInfoResult.data;
          
          // Get tick size and tick value from MT5
          tickSize = symbolInfo.trade_tick_size || symbolInfo.point || 0.00001;
          tickValue = symbolInfo.trade_tick_value || 1;
          contractSize = symbolInfo.trade_contract_size || 100000;
          
          // Determine pip size based on symbol type
          const isYenPair = symbol.includes('JPY');
          pipSize = isYenPair ? 0.01 : 0.0001;
          
          // Calculate pip value from tick value
          // If tick size is 0.00001 (point) and pip is 0.0001, then 1 pip = 10 ticks
          const ticksPerPip = pipSize / tickSize;
          pipValue = tickValue * ticksPerPip;
          
          console.log('Using real MT5 contract data:');
          console.log('Tick size:', tickSize);
          console.log('Tick value per lot:', tickValue);
          console.log('Pip size:', pipSize);
          console.log('Ticks per pip:', ticksPerPip);
          console.log('Pip value per lot:', pipValue);
          console.log('Contract size:', contractSize);
        }
      } catch (err) {
        console.warn('Failed to get symbol info from MT5, using fallback calculation:', err);
      }
    }
    
    // Step 2: Fallback calculation if MT5 data is not available
    if (!pipValue || !pipSize) {
      const isYenPair = symbol.includes('JPY');
      
      if (isYenPair) {
        pipSize = 0.01;
        pipValue = (0.01 * 100000) / currentPrice;
      } else {
        pipSize = 0.0001;
        pipValue = (0.0001 * 100000) / currentPrice;
      }
      
      if (symbol.endsWith('USD')) {
        pipValue = 10;
      }
      
      contractSize = 100000;
      console.log('Using fallback calculation (MT5 not connected)');
    }
    
    // Step 3: Calculate 1% price decrease in pips
    const priceChangeInPips = (currentPrice * 0.01) / pipSize;
    
    // Step 4: Calculate loss using proper formula
    // Loss = Number of pips × Pip value × Lot size
    const totalLoss = priceChangeInPips * pipValue * volume;
    
    document.getElementById('potentialLoss').textContent = `$${totalLoss.toFixed(2)}`;
    document.getElementById('volumeLossInfo').style.display = 'block';
    
    // Note: Removed automatic popup reminder to prevent immediate display
    // Users can still access detailed loss information via the "Test Loss" button in trade nodes
    
  } catch (error) {
    console.error('Error calculating volume loss:', error);
    document.getElementById('volumeLossInfo').style.display = 'none';
  }
}

// Volume Loss Reminder Popup
function showVolumeLossReminder(symbol, volume, currentPrice, potentialLoss, contractInfo = {}) {
  const alertModal = document.getElementById('priceDropAlert');
  
  // Calculate price after 1% drop
  const priceAfter1PercentDrop = currentPrice * 0.99;
  
  // Update alert content for volume loss reminder
  document.getElementById('alertSymbol').textContent = symbol;
  document.getElementById('alertVolume').textContent = volume;
  document.getElementById('alertEntryPrice').textContent = currentPrice.toFixed(5);
  document.getElementById('alertCurrentPrice').textContent = priceAfter1PercentDrop.toFixed(5);
  document.getElementById('alertPriceChange').textContent = '-1.00%';
  document.getElementById('alertCurrentLoss').textContent = `$${potentialLoss.toFixed(2)}`;
  
  // Update MT5 contract information
  document.getElementById('alertTickSize').textContent = contractInfo.tickSize ? contractInfo.tickSize.toFixed(5) : '-';
  document.getElementById('alertPipSize').textContent = contractInfo.pipSize ? contractInfo.pipSize.toFixed(5) : '-';
  document.getElementById('alertTickValue').textContent = contractInfo.tickValue ? `$${contractInfo.tickValue.toFixed(2)}` : '-';
  document.getElementById('alertPipValue').textContent = contractInfo.pipValue ? `$${contractInfo.pipValue.toFixed(2)}` : '-';
  document.getElementById('alertContractSize').textContent = contractInfo.contractSize ? contractInfo.contractSize.toLocaleString() : '-';
  document.getElementById('alertTicksPerPip').textContent = contractInfo.ticksPerPip ? contractInfo.ticksPerPip.toFixed(0) : '-';
  document.getElementById('alertPriceChangePips').textContent = contractInfo.priceChangeInPips ? contractInfo.priceChangeInPips.toFixed(2) : '-';
  
  // Show alert
  alertModal.style.display = 'block';
  
  // Play reminder sound if available
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU5k9n1unEiBS13yO/eizEIHWq+8+OWT');
    audio.play().catch(() => {}); // Ignore errors if audio fails
  } catch (e) {}
}

function hidePriceDropAlert() {
  document.getElementById('priceDropAlert').style.display = 'none';
}

function handleModifyPositionFromAlert() {
  hidePriceDropAlert();
  // You could implement position modification logic here
  showMessage('Position modification feature coming soon', 'info');
}

// Test function for volume loss feature using trade node data
function testVolumeLossFromNode(nodeId) {
  // Find the trade node by ID
  const tradeNode = nodeEditor.nodes.find(node => node.id == nodeId);
  
  if (!tradeNode || tradeNode.type !== 'trade-signal') {
    showMessage('Please select a trade node first', 'error');
    return;
  }
  
  // Get data from the trade node
  const symbol = tradeNode.params.symbol || '';
  const volume = parseFloat(tradeNode.params.volume) || 0;
  const action = tradeNode.params.action || 'BUY';
  
  // Validate required data
  if (!symbol || symbol.length < 6) {
    showMessage('Please enter a valid symbol in the trade node properties', 'error');
    return;
  }
  
  if (!volume || volume <= 0) {
    showMessage('Please enter a valid volume in the trade node properties', 'error');
    return;
  }
  
  // Get current market data and symbol info for accurate calculation
  async function calculateAndShowLoss() {
    try {
      let currentPrice;
      
      // Check if MT5 is connected
      if (isConnected && window.mt5API) {
        // Get symbol info for accurate calculation
        console.log('Attempting to get symbol info for:', symbol);
        console.log('MT5 connected:', isConnected);
        console.log('MT5 API available:', !!window.mt5API);
        
        try {
          const symbolInfoResult = await window.mt5API.getSymbolInfo(symbol);
          
          console.log('Symbol info result:', symbolInfoResult);
          
          if (symbolInfoResult.success && symbolInfoResult.data) {
            const symbolInfo = symbolInfoResult.data;
            currentPrice = symbolInfo.bid || symbolInfo.ask;
            
            console.log('Symbol info retrieved:', symbolInfo);
          } else {
            console.log('Symbol info failed, trying market data...');
            // Fallback to market data only
            const marketResult = await window.mt5API.getMarketData(symbol);
            
            console.log('Market data result:', marketResult);
            
            if (marketResult.success && marketResult.data) {
              currentPrice = marketResult.data.bid || marketResult.data.ask;
              console.log('Using market data price:', currentPrice);
            } else {
              currentPrice = 1.0850; // Mock data
              console.log('Using mock data price:', currentPrice);
            }
          }
        } catch (err) {
          console.error('Error getting symbol info:', err);
          currentPrice = 1.0850; // Mock data
          console.log('Using mock data due to error:', currentPrice);
        }
      } else {
        currentPrice = 1.0850; // Mock EURUSD price
      }
      
      if (!currentPrice || currentPrice <= 0) {
        showMessage('Unable to get current price data', 'error');
        return;
      }
      
      // Calculate accurate loss using real contract information from MetaTrader
      let pipValue, pipSize, contractSize;
      let tickSize, tickValue;
      
      // Step 1: Retrieve real contract specifications from MT5
      if (isConnected && window.mt5API) {
        try {
          const symbolInfoResult = await window.mt5API.getSymbolInfo(symbol);
          
          console.log('Symbol info result:', symbolInfoResult);
          
          if (symbolInfoResult.success && symbolInfoResult.data) {
            const symbolInfo = symbolInfoResult.data;
            
            // Get tick size and tick value from MT5
            tickSize = symbolInfo.trade_tick_size || symbolInfo.point || 0.00001;
            tickValue = symbolInfo.trade_tick_value || 1;
            contractSize = symbolInfo.trade_contract_size || 100000;
            
            // Determine pip size based on symbol type
            const isYenPair = symbol.includes('JPY');
            pipSize = isYenPair ? 0.01 : 0.0001;
            
            // Calculate pip value from tick value
            // If tick size is 0.00001 (point) and pip is 0.0001, then 1 pip = 10 ticks
            const ticksPerPip = pipSize / tickSize;
            pipValue = tickValue * ticksPerPip;
            
            console.log('Using real MT5 contract data:');
            console.log('Tick size:', tickSize);
            console.log('Tick value per lot:', tickValue);
            console.log('Pip size:', pipSize);
            console.log('Ticks per pip:', ticksPerPip);
            console.log('Pip value per lot:', pipValue);
            console.log('Contract size:', contractSize);
          }
        } catch (err) {
          console.warn('Failed to get symbol info from MT5, using fallback calculation:', err);
        }
      }
      
      // Step 2: Fallback calculation if MT5 data is not available
      if (!pipValue || !pipSize) {
        const isYenPair = symbol.includes('JPY');
        
        if (isYenPair) {
          pipSize = 0.01;
          pipValue = (0.01 * 100000) / currentPrice;
        } else {
          pipSize = 0.0001;
          pipValue = (0.0001 * 100000) / currentPrice;
        }
        
        if (symbol.endsWith('USD')) {
          pipValue = 10;
        }
        
        contractSize = 100000;
        console.log('Using fallback calculation (MT5 not connected)');
      }
      
      // Step 3: Calculate 1% price decrease in pips
      const priceChangeInPips = (currentPrice * 0.01) / pipSize;
      
      // Step 4: Calculate loss using proper formula
      // Loss = Number of pips × Pip value × Lot size
      const totalLoss = priceChangeInPips * pipValue * volume;
      
      console.log('Calculation details:');
      console.log('Current price:', currentPrice);
      console.log('Pip size:', pipSize);
      console.log('Pip value for 1 lot:', pipValue);
      console.log('Contract size:', contractSize);
      console.log('1% price change in pips:', priceChangeInPips);
      console.log('Volume (lots):', volume);
      console.log('Final loss for 1% move:', totalLoss);
      
      // Show the popup reminder with trade node data and contract info
      const contractInfo = {
        tickSize: tickSize,
        pipSize: pipSize,
        tickValue: tickValue,
        pipValue: pipValue,
        contractSize: contractSize,
        ticksPerPip: pipSize / tickSize,
        priceChangeInPips: priceChangeInPips
      };
      showVolumeLossReminder(symbol, volume, currentPrice, totalLoss, contractInfo);
      
      showMessage(`Testing volume loss for ${symbol} (${action}) with volume ${volume}`, 'info');
    } catch (error) {
      console.error('Error testing volume loss:', error);
      showMessage('Error testing volume loss: ' + error.message, 'error');
    }
  }
  
  // Execute the calculation
  calculateAndShowLoss();
}

// Get current price for conditional check node
async function getCurrentPriceForNode(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  if (!node) {
    showMessage('Node not found', 'error');
    return;
  }
  
  if (node.type !== 'conditional-check') {
    showMessage('This function only works with conditional check nodes', 'error');
    return;
  }
  
  const symbol = node.params.symbol;
  if (!symbol) {
    showMessage('Please set a symbol first', 'error');
    return;
  }
  
  try {
    showMessage(`Fetching current price for ${symbol}...`, 'info');
    
    // Fetch current market data from MT5 via exposed API
    if (!window.mt5API || !window.mt5API.getMarketData) {
      showMessage('MT5 API not available. Please connect to MT5 first.', 'error');
      return;
    }
    
    const result = await window.mt5API.getMarketData(symbol);
    
    if (!result || result.success === false) {
      const errMsg = result && result.error ? result.error : 'Unknown error';
      showMessage(`Error fetching price: ${errMsg}`, 'error');
      return;
    }
    
    const data = result.data || result; // support both wrapped and direct responses
    if (data && data.bid) {
      // Update the node's price parameter with current bid price
      node.params.price = parseFloat(Number(data.bid).toFixed(5));
      
      // Update the properties panel to show the new price
      updatePropertiesPanel(node);
      
      showMessage(`Current price for ${symbol}: ${node.params.price} (Bid: ${data.bid}, Ask: ${data.ask})`, 'success');
    } else {
      showMessage('Failed to get current price. No data returned.', 'error');
    }
    
  } catch (error) {
    console.error('Error fetching current price:', error);
    showMessage('Error fetching current price: ' + error.message, 'error');
  }
}

// Make functions globally available
window.getCurrentPriceForNode = getCurrentPriceForNode;

// Test signal popup function
function testSignalPopup(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  if (!node || node.type !== 'signal-popup') {
    showMessage('Please select a signal popup node first', 'error');
    return;
  }
  
  // Show the popup with the node's parameters
  showSignalPopup(node.params);
  showMessage('Testing signal popup with current parameters', 'info');
}

// Make function globally available
window.testSignalPopup = testSignalPopup;

// Log Modal Functions
function showLogModal() {
  document.getElementById('logModal').classList.add('show');
  
  // Add a test log entry to verify logging is working
  addLogEntry('info', 'Log modal opened - MT5 response logging is now active', 'system');
  
  updateLogDisplay();
}

function hideLogModal() {
  document.getElementById('logModal').classList.remove('show');
}

function updateLogDisplay() {
  const logContent = document.getElementById('logContent');
  
  if (!logContent) {
    console.error('Log content element not found');
    return;
  }
  
  if (logEntries.length === 0) {
    logContent.innerHTML = '<p class="no-log">No log entries yet. Try testing volume loss to see symbol info.</p>';
    return;
  }
  
  logContent.innerHTML = logEntries.map(entry => `
    <div class="log-entry">
      <span class="log-timestamp">[${entry.timestamp}]</span>
      <span class="log-source">[${entry.source || 'console'}]</span>
      <span class="log-${entry.type}">${entry.message}</span>
    </div>
  `).join('');
  
  // Scroll to bottom
  logContent.scrollTop = logContent.scrollHeight;
}

function clearLog() {
  logEntries = [];
  updateLogDisplay();
  showMessage('Log cleared', 'info');
}

function copyLog() {
  const logText = logEntries.map(entry => 
    `[${entry.timestamp}] ${entry.type.toUpperCase()}: ${entry.message}`
  ).join('\n');
  
  navigator.clipboard.writeText(logText).then(() => {
    showMessage('Log copied to clipboard', 'success');
  }).catch(() => {
    showMessage('Failed to copy log', 'error');
  });
}

// Signal Popup functionality
function showSignalPopup(params) {
  const { title, message, type, autoClose, duration } = params;
  
  // Create popup if it doesn't exist
  let popup = document.getElementById('signalPopup');
  if (!popup) {
    createSignalPopup();
    popup = document.getElementById('signalPopup');
  }
  
  // Update popup content
  document.getElementById('signalPopupTitle').textContent = title || 'Signal Alert';
  document.getElementById('signalPopupMessage').textContent = message || 'Trading signal triggered!';
  
  // Set popup type styling
  const popupContent = document.getElementById('signalPopupContent');
  popupContent.className = `signal-popup-content ${type || 'info'}`;
  
  // Show popup
  popup.style.display = 'block';
  popup.classList.add('show');
  
  // Auto-close if enabled
  if (autoClose !== false) {
    const closeDelay = duration || 5000;
    setTimeout(() => {
      hideSignalPopup();
    }, closeDelay);
  }
  
  // Add to console log
  console.log(`Signal Popup: ${title} - ${message}`);
}

function hideSignalPopup() {
  const popup = document.getElementById('signalPopup');
  if (popup) {
    popup.classList.remove('show');
    setTimeout(() => {
      popup.style.display = 'none';
    }, 300);
  }
}

function createSignalPopup() {
  const popupHTML = `
    <div id="signalPopup" class="signal-popup" style="display: none;">
      <div id="signalPopupContent" class="signal-popup-content info">
        <div class="signal-popup-header">
          <div class="signal-popup-icon">🔔</div>
          <div class="signal-popup-title" id="signalPopupTitle">Signal Alert</div>
          <button class="signal-popup-close" id="signalPopupClose">×</button>
        </div>
        <div class="signal-popup-body">
          <div class="signal-popup-message" id="signalPopupMessage">Trading signal triggered!</div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', popupHTML);
  
  // Add event listener for close button
  document.getElementById('signalPopupClose').addEventListener('click', hideSignalPopup);
}
