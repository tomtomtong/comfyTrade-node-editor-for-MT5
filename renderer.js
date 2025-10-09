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
  document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
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
  
  // Confirmation modal
  document.getElementById('confirmYesBtn').addEventListener('click', handleConfirmationYes);
  document.getElementById('confirmNoBtn').addEventListener('click', handleConfirmationNo);
  
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
  
  // Store globally for settings updates
  window.tradeSymbolInput = symbolInput;
  
  // Quick symbol buttons - dynamically created from config
  const quickSymbolsContainer = document.getElementById('tradeQuickSymbolsContainer');
  if (quickSymbolsContainer) {
    QuickSymbols.create(quickSymbolsContainer, (symbol) => {
      symbolInput.setValue(symbol);
      updateCurrentPrice(symbol);
      // Note: Removed automatic volume loss calculation to prevent immediate popup
      // Users can still calculate volume loss by changing volume or symbol values
    });
  }
  
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
  showConfirmation(
    'Close Position',
    'Are you sure you want to close this position?',
    async () => {
      await executeClosePosition(ticket);
    }
  );
}

async function executeClosePosition(ticket) {

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
  
  // Find the position to get current price and entry price
  const position = currentPositions.find(pos => pos.ticket == ticket);
  
  document.getElementById('modifyTicket').value = ticket;
  document.getElementById('modifyStopLoss').value = currentSL > 0 ? currentSL : '';
  document.getElementById('modifyTakeProfit').value = currentTP > 0 ? currentTP : '';
  
  // Clear percentage inputs
  document.getElementById('modifyStopLossPercent').value = '';
  document.getElementById('modifyTakeProfitPercent').value = '';
  
  // Store position data for percentage calculations
  if (position) {
    document.getElementById('modifyModal').dataset.currentPrice = position.current_price;
    document.getElementById('modifyModal').dataset.entryPrice = position.open_price;
    document.getElementById('modifyModal').dataset.positionType = position.type;
  }
  
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
          <div class="input-group">
            <input type="number" id="modifyStopLoss" step="0.00001" placeholder="Absolute price (0 for none)" oninput="updatePercentFromPrice('sl')">
            <span class="input-separator">OR</span>
            <input type="number" id="modifyStopLossPercent" step="0.1" placeholder="% from current" oninput="updatePriceFromPercent('sl')">
            <span class="percent-symbol">%</span>
          </div>
        </div>
        
        <div class="form-group">
          <label>Take Profit:</label>
          <div class="input-group">
            <input type="number" id="modifyTakeProfit" step="0.00001" placeholder="Absolute price (0 for none)" oninput="updatePercentFromPrice('tp')">
            <span class="input-separator">OR</span>
            <input type="number" id="modifyTakeProfitPercent" step="0.1" placeholder="% from current" oninput="updatePriceFromPercent('tp')">
            <span class="percent-symbol">%</span>
          </div>
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

// Percentage calculation functions for modify position
function updatePriceFromPercent(type) {
  const modal = document.getElementById('modifyModal');
  const currentPrice = parseFloat(modal.dataset.currentPrice);
  const positionType = modal.dataset.positionType;
  
  if (!currentPrice || !positionType) return;
  
  const percentInput = document.getElementById(type === 'sl' ? 'modifyStopLossPercent' : 'modifyTakeProfitPercent');
  const priceInput = document.getElementById(type === 'sl' ? 'modifyStopLoss' : 'modifyTakeProfit');
  
  const percent = parseFloat(percentInput.value);
  if (isNaN(percent) || percent === 0) {
    priceInput.value = '';
    return;
  }
  
  let targetPrice;
  
  if (type === 'sl') {
    // Stop Loss: negative percentage means loss protection
    if (positionType === 'BUY') {
      // For BUY positions, SL should be below current price (negative %)
      targetPrice = currentPrice * (1 - Math.abs(percent) / 100);
    } else {
      // For SELL positions, SL should be above current price (positive %)
      targetPrice = currentPrice * (1 + Math.abs(percent) / 100);
    }
  } else {
    // Take Profit: positive percentage means profit target
    if (positionType === 'BUY') {
      // For BUY positions, TP should be above current price (positive %)
      targetPrice = currentPrice * (1 + Math.abs(percent) / 100);
    } else {
      // For SELL positions, TP should be below current price (negative %)
      targetPrice = currentPrice * (1 - Math.abs(percent) / 100);
    }
  }
  
  priceInput.value = targetPrice.toFixed(5);
}

function updatePercentFromPrice(type) {
  const modal = document.getElementById('modifyModal');
  const currentPrice = parseFloat(modal.dataset.currentPrice);
  const positionType = modal.dataset.positionType;
  
  if (!currentPrice || !positionType) return;
  
  const priceInput = document.getElementById(type === 'sl' ? 'modifyStopLoss' : 'modifyTakeProfit');
  const percentInput = document.getElementById(type === 'sl' ? 'modifyStopLossPercent' : 'modifyTakeProfitPercent');
  
  const price = parseFloat(priceInput.value);
  if (isNaN(price) || price === 0) {
    percentInput.value = '';
    return;
  }
  
  const percentChange = ((price - currentPrice) / currentPrice) * 100;
  percentInput.value = percentChange.toFixed(2);
}

// Make functions globally available
window.closePosition = closePosition;
window.showModifyModal = showModifyModal;
window.testVolumeLossFromNode = testVolumeLossFromNode;
window.showSignalPopup = showSignalPopup;
window.updatePriceFromPercent = updatePriceFromPercent;
window.updatePercentFromPrice = updatePercentFromPrice;

// Node editor percentage calculation functions
function updateNodePriceFromPercent(priceKey, nodeId) {
  const node = window.nodeEditor.nodes.find(n => n.id === nodeId);
  if (!node || !node.params.ticket) return;
  
  const position = currentPositions.find(pos => pos.ticket == node.params.ticket);
  if (!position) return;
  
  const percentKey = priceKey + 'Percent';
  const percent = node.params[percentKey];
  if (!percent) {
    node.params[priceKey] = 0;
    updatePropertiesPanel(node);
    return;
  }
  
  const currentPrice = position.current_price;
  const positionType = position.type;
  let targetPrice;
  
  if (priceKey === 'stopLoss') {
    if (positionType === 'BUY') {
      targetPrice = currentPrice * (1 - Math.abs(percent) / 100);
    } else {
      targetPrice = currentPrice * (1 + Math.abs(percent) / 100);
    }
  } else { // takeProfit
    if (positionType === 'BUY') {
      targetPrice = currentPrice * (1 + Math.abs(percent) / 100);
    } else {
      targetPrice = currentPrice * (1 - Math.abs(percent) / 100);
    }
  }
  
  node.params[priceKey] = parseFloat(targetPrice.toFixed(5));
  updatePropertiesPanel(node);
}

function updateNodePercentFromPrice(priceKey, nodeId) {
  const node = window.nodeEditor.nodes.find(n => n.id === nodeId);
  if (!node || !node.params.ticket) return;
  
  const position = currentPositions.find(pos => pos.ticket == node.params.ticket);
  if (!position) return;
  
  const price = node.params[priceKey];
  if (!price) {
    node.params[priceKey + 'Percent'] = 0;
    updatePropertiesPanel(node);
    return;
  }
  
  const currentPrice = position.current_price;
  const percentChange = ((price - currentPrice) / currentPrice) * 100;
  node.params[priceKey + 'Percent'] = parseFloat(percentChange.toFixed(2));
  updatePropertiesPanel(node);
}

window.updateNodePriceFromPercent = updateNodePriceFromPercent;
window.updateNodePercentFromPrice = updateNodePercentFromPrice;

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
      
      // Set node editor execution state
      if (nodeEditor) {
        nodeEditor.setStrategyExecuting(true);
      }
      
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
    
    // Clear node editor execution state on error
    if (nodeEditor) {
      nodeEditor.setStrategyExecuting(false);
    }
    
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
  
  // Clear node editor execution state
  if (nodeEditor) {
    nodeEditor.setStrategyExecuting(false);
  }
  
  updateStrategyButtons();
  
  showMessage('Strategy stopped successfully', 'success');
}

// Update strategy button visibility and status
function updateStrategyButtons() {
  const runBtn = document.getElementById('runStrategyBtn');
  const stopBtn = document.getElementById('stopStrategyBtn');
  
  if (isStrategyRunning) {
    runBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    
    if (strategyStopRequested) {
      stopBtn.textContent = '⏹ Stopping...';
      stopBtn.disabled = true;
    } else {
      stopBtn.textContent = '⏹ Stop Strategy';
      stopBtn.disabled = false;
    }
  } else {
    runBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
  }
}

// Update strategy status (called by end-strategy node)
function updateStrategyStatus(status) {
  if (status === 'stopped') {
    isStrategyRunning = false;
    strategyStopRequested = false;
    
    // Clear node editor execution state
    if (nodeEditor) {
      nodeEditor.setStrategyExecuting(false);
    }
    
    updateStrategyButtons();
  }
}

// Properties Panel
function updatePropertiesPanel(node) {
  const panel = document.getElementById('nodeProperties');
  
  if (!node) {
    panel.innerHTML = '<p class="no-selection">Select a node to edit properties</p>';
    return;
  }

  // Check if strategy is executing and disable editing
  const isExecuting = nodeEditor && nodeEditor.isStrategyExecutingState();
  const disabledClass = isExecuting ? 'disabled' : '';
  const disabledAttr = isExecuting ? 'disabled' : '';
  
  if (isExecuting) {
    panel.innerHTML = `
      <div class="execution-warning">
        <h3>Strategy Executing</h3>
        <p>Node properties cannot be edited while strategy is running.</p>
        <p>Selected: <strong>${node.title}</strong></p>
      </div>
    `;
    return;
  }
  
  // Filter out percentage parameters as they're handled within their main parameter UI
  const paramEntries = Object.entries(node.params).filter(([key]) => 
    !key.endsWith('Percent')
  );
  
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
            <div id="nodeQuickSymbols-${node.id}"></div>
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
      } else if (key === 'stopAllTriggers' && node.type === 'end-strategy') {
        return `
          <div class="property-item">
            <label>Stop All Triggers:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value === 'true')">
              <option value="true" ${value ? 'selected' : ''}>Yes - Stop all triggers</option>
              <option value="false" ${!value ? 'selected' : ''}>No - Keep triggers running</option>
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
        const percentKey = key + 'Percent';
        const percentValue = node.params[percentKey] || '';
        return `
          <div class="property-item">
            <label>${key}:</label>
            <div class="node-input-group">
              <input type="number" 
                     value="${value}" 
                     step="0.00001"
                     placeholder="Absolute price"
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', parseFloat(this.value) || 0); updateNodePercentFromPrice('${key}', '${node.id}')">
              <span class="input-separator">OR</span>
              <input type="number" 
                     value="${percentValue}" 
                     step="0.1"
                     placeholder="% from current"
                     data-param="${percentKey}"
                     onchange="updateNodeParam('${percentKey}', parseFloat(this.value) || 0); updateNodePriceFromPercent('${key}', '${node.id}')">
              <span class="percent-symbol">%</span>
            </div>
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
      <button class="btn btn-success btn-small" onclick="testConditionalCheck('${node.id}')">
        🧪 Test Condition
      </button>
      <button class="btn btn-info btn-small" onclick="getCurrentPriceForNode('${node.id}')">
        Get Current Price
      </button>
    `;
  }
  
  // Add test buttons for trade nodes
  if (node.type === 'trade-signal') {
    actionButtons += `
      <button class="btn btn-secondary btn-small" onclick="testVolumeLossFromNode('${node.id}')">
        Calculate Loss
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
  
  // Add test buttons for logic gates
  if (node.type === 'logic-and' || node.type === 'logic-or') {
    actionButtons += `
      <button class="btn btn-info btn-small" onclick="testLogicGate('${node.id}')">
        🧪 Test Logic
      </button>
    `;
  }
  
  // Add test end strategy button for end-strategy nodes
  if (node.type === 'end-strategy') {
    actionButtons += `
      <button class="btn btn-warning btn-small" onclick="testEndStrategy('${node.id}')">
        Test End Strategy
      </button>
    `;
  }
  
  // Add test button for close-position node
  if (node.type === 'close-position') {
    actionButtons += `
      <button class="btn btn-warning btn-small" onclick="testClosePosition('${node.id}')">
        🧪 Test Close
      </button>
    `;
  }
  
  // Add load current values button for modify-position node
  if (node.type === 'modify-position' && node.params.ticket) {
    actionButtons += `
      <button class="btn btn-info btn-small" onclick="loadCurrentPositionValues('${node.id}')">
        Load Current Values
      </button>
      <button class="btn btn-warning btn-small" onclick="testModifyPosition('${node.id}')">
        🧪 Test Modify
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
      const quickSymbolsContainer = document.getElementById(`nodeQuickSymbols-${node.id}`);
      
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
        
        // Add quick symbols for node properties
        if (quickSymbolsContainer) {
          QuickSymbols.create(quickSymbolsContainer, (symbol) => {
            nodeSymbolInput.setValue(symbol);
            updateNodeParam('symbol', symbol);
          });
        }
      } else if (container) {
        // Fallback to regular input if not connected
        container.innerHTML = `
          <input type="text" 
                 value="${value}" 
                 data-param="symbol"
                 placeholder="Enter symbol (e.g., EURUSD)"
                 onchange="updateNodeParam('symbol', this.value)">
        `;
        
        // Add quick symbols even when not connected
        if (quickSymbolsContainer) {
          QuickSymbols.create(quickSymbolsContainer, (symbol) => {
            const input = container.querySelector('input');
            if (input) {
              input.value = symbol;
              updateNodeParam('symbol', symbol);
            }
          });
        }
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

// Handle strategy execution state changes
window.onStrategyExecutionStateChanged = function(isExecuting) {
  // Update properties panel for currently selected node
  if (nodeEditor && nodeEditor.selectedNode) {
    updatePropertiesPanel(nodeEditor.selectedNode);
  }
  
  // Update canvas cursor
  const canvas = document.getElementById('nodeCanvas');
  if (canvas) {
    if (isExecuting) {
      canvas.classList.add('locked');
    } else {
      canvas.classList.remove('locked');
    }
  }
  
  // Disable/enable node palette buttons during strategy execution
  const nodeButtons = document.querySelectorAll('.node-btn');
  nodeButtons.forEach(btn => {
    btn.disabled = isExecuting;
    if (isExecuting) {
      btn.classList.add('disabled');
    } else {
      btn.classList.remove('disabled');
    }
  });
  
  // Also disable graph management buttons during strategy execution
  const graphButtons = ['saveGraphBtn', 'loadGraphBtn', 'clearGraphBtn'];
  graphButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = isExecuting;
      if (isExecuting) {
        btn.classList.add('disabled');
      } else {
        btn.classList.remove('disabled');
      }
    }
  });
};

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

// Execute node strategy through MT5 API
async function executeNodeStrategy() {
  try {
    if (!isConnected) {
      showMessage('Not connected to MT5. Cannot execute node strategy.', 'error');
      return;
    }

    // Get the current node graph
    const nodeGraph = {
      nodes: nodeEditor.nodes,
      connections: nodeEditor.connections
    };

    if (nodeGraph.nodes.length === 0) {
      showMessage('No nodes to execute', 'warning');
      return;
    }

    showMessage('Executing node strategy...', 'info');

    // Send the node graph to MT5 for execution
    const result = await window.mt5API.executeNodeStrategy(nodeGraph);

    if (result.success) {
      showMessage(`Node strategy executed successfully: ${result.data?.message || 'Strategy completed'}`, 'success');
    } else {
      showMessage(`Node strategy execution failed: ${result.error || 'Unknown error'}`, 'error');
    }

  } catch (error) {
    console.error('Error executing node strategy:', error);
    showMessage(`Error executing node strategy: ${error.message}`, 'error');
  }
}

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
  showConfirmation(
    'Clear Graph',
    'Clear all nodes? This cannot be undone.',
    () => {
      nodeEditor.clear();
      document.getElementById('nodeProperties').innerHTML = 
        '<p class="no-selection">Select a node to edit properties</p>';
      showMessage('Canvas cleared', 'info');
    }
  );
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

// Confirmation Modal System
let confirmationCallback = null;

function showConfirmation(title, message, onConfirm, onCancel = null) {
  document.getElementById('confirmationTitle').textContent = title;
  document.getElementById('confirmationMessage').textContent = message;
  confirmationCallback = { onConfirm, onCancel };
  document.getElementById('confirmationModal').classList.add('show');
}

function hideConfirmation() {
  document.getElementById('confirmationModal').classList.remove('show');
  confirmationCallback = null;
}

function handleConfirmationYes() {
  if (confirmationCallback && confirmationCallback.onConfirm) {
    confirmationCallback.onConfirm();
  }
  hideConfirmation();
}

function handleConfirmationNo() {
  if (confirmationCallback && confirmationCallback.onCancel) {
    confirmationCallback.onCancel();
  }
  hideConfirmation();
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

// Test end strategy function
function testEndStrategy(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  if (!node || node.type !== 'end-strategy') {
    showMessage('Please select an end strategy node first', 'error');
    return;
  }
  
  // Simulate the end strategy execution
  console.log('Testing End Strategy node:', node.params.message);
  
  if (node.params.stopAllTriggers) {
    console.log('Would stop all strategy triggers...');
    showMessage('Test: All triggers would be stopped', 'info');
  }
  
  showMessage(`Test End Strategy: ${node.params.message}`, 'success');
}

// Make functions globally available
window.testSignalPopup = testSignalPopup;
window.testEndStrategy = testEndStrategy;

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


// Settings Modal Functions
function showSettingsModal() {
  document.getElementById('settingsModal').classList.add('show');
  renderQuickSymbolsList();
  loadOvertradeSettings();
  
  // Setup tab switching
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.onclick = (e) => switchSettingsTab(e.target.dataset.tab);
  });
  
  // Setup event listeners
  document.getElementById('closeSettingsBtn').onclick = closeSettingsModal;
  document.getElementById('saveSettingsBtn').onclick = saveAllSettings;
  document.getElementById('addSymbolBtn').onclick = addQuickSymbol;
  document.getElementById('settingsResetTradeCountBtn').onclick = resetTradeCountFromSettings;
  document.getElementById('settingsTestOvertradeBtn').onclick = testOvertradeFromSettings;
  
  // Allow Enter key to add symbol
  document.getElementById('newSymbolInput').onkeypress = (e) => {
    if (e.key === 'Enter') {
      addQuickSymbol();
    }
  };
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

function switchSettingsTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Make switchSettingsTab available globally
window.switchSettingsTab = switchSettingsTab;

function loadOvertradeSettings() {
  if (!window.overtradeControl) return;
  
  const settings = window.overtradeControl.settings;
  
  // Populate form with current settings
  document.getElementById('settingsOvertradeEnabled').value = settings.enabled.toString();
  document.getElementById('settingsMaxTrades').value = settings.maxTrades;
  document.getElementById('settingsTimePeriod').value = settings.timePeriod;
  document.getElementById('settingsReminderFrequency').value = settings.reminderFrequency;
  document.getElementById('settingsApplyToManual').checked = settings.applyToManual;
  document.getElementById('settingsApplyToStrategy').checked = settings.applyToStrategy;
  document.getElementById('settingsApplyToNodes').checked = settings.applyToNodes;
  
  updateOvertradeStatusInSettings();
}

async function updateOvertradeStatusInSettings() {
  if (!window.overtradeControl) return;
  
  const currentOpenPositions = await window.overtradeControl.getCurrentOpenPositions();
  const remaining = Math.max(0, window.overtradeControl.settings.maxTrades - currentOpenPositions);
  const lastWarning = window.overtradeControl.lastWarningTime ? 
    new Date(window.overtradeControl.lastWarningTime).toLocaleString() : 'Never';
  
  document.getElementById('settingsCurrentTradeCount').textContent = currentOpenPositions;
  document.getElementById('settingsRemainingTrades').textContent = remaining;
  document.getElementById('settingsNextReset').textContent = 'When positions close';
  document.getElementById('settingsLastWarning').textContent = lastWarning;
}

async function saveAllSettings() {
  // Save overtrade settings
  if (window.overtradeControl) {
    window.overtradeControl.settings.enabled = document.getElementById('settingsOvertradeEnabled').value === 'true';
    window.overtradeControl.settings.maxTrades = parseInt(document.getElementById('settingsMaxTrades').value);
    window.overtradeControl.settings.timePeriod = document.getElementById('settingsTimePeriod').value;
    window.overtradeControl.settings.reminderFrequency = document.getElementById('settingsReminderFrequency').value;
    window.overtradeControl.settings.applyToManual = document.getElementById('settingsApplyToManual').checked;
    window.overtradeControl.settings.applyToStrategy = document.getElementById('settingsApplyToStrategy').checked;
    window.overtradeControl.settings.applyToNodes = document.getElementById('settingsApplyToNodes').checked;
    
    window.overtradeControl.saveSettings();
    await window.overtradeControl.updateStatusDisplay();
  }
  
  showMessage('Settings saved successfully', 'success');
}

async function resetTradeCountFromSettings() {
  if (window.overtradeControl) {
    await window.overtradeControl.resetTradeCount();
    await updateOvertradeStatusInSettings();
  }
}

async function testOvertradeFromSettings() {
  if (window.overtradeControl) {
    await window.overtradeControl.simulateOpenPositionsForTesting();
    await updateOvertradeStatusInSettings();
  }
}

function renderQuickSymbolsList() {
  const container = document.getElementById('quickSymbolsList');
  container.innerHTML = '';
  
  const symbols = AppConfig.getQuickSymbols();
  
  if (symbols.length === 0) {
    container.innerHTML = '<p style="color: #888; margin: 10px;">No quick symbols configured. Add some below.</p>';
    return;
  }
  
  symbols.forEach(symbol => {
    const item = document.createElement('div');
    item.className = 'quick-symbol-item';
    
    const symbolText = document.createElement('span');
    symbolText.textContent = symbol;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => removeQuickSymbol(symbol);
    
    item.appendChild(symbolText);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

function addQuickSymbol() {
  const input = document.getElementById('newSymbolInput');
  const symbol = input.value.trim();
  
  if (!symbol) {
    showMessage('Please enter a symbol', 'error');
    return;
  }
  
  if (symbol.length < 3) {
    showMessage('Symbol must be at least 3 characters', 'error');
    return;
  }
  
  const symbols = AppConfig.getQuickSymbols();
  if (symbols.includes(symbol)) {
    showMessage('Symbol already exists', 'warning');
    return;
  }
  
  AppConfig.addQuickSymbol(symbol);
  input.value = '';
  renderQuickSymbolsList();
  updateAllQuickSymbols();
  showMessage(`Added ${symbol} to quick symbols`, 'success');
}

function removeQuickSymbol(symbol) {
  AppConfig.removeQuickSymbol(symbol);
  renderQuickSymbolsList();
  updateAllQuickSymbols();
  showMessage(`Removed ${symbol} from quick symbols`, 'success');
}



function updateAllQuickSymbols() {
  // Update trade dialog quick symbols
  const tradeContainer = document.getElementById('tradeQuickSymbolsContainer');
  if (tradeContainer) {
    // Use QuickSymbols.update instead of clearing and recreating
    const existingWrapper = tradeContainer.querySelector('.quick-symbols');
    if (existingWrapper) {
      // Update existing quick symbols
      QuickSymbols.update(tradeContainer);
    } else {
      // Create new quick symbols if none exist
      const symbolInput = window.tradeSymbolInput;
      if (symbolInput) {
        QuickSymbols.create(tradeContainer, (symbol) => {
          symbolInput.setValue(symbol);
          updateCurrentPrice(symbol);
        });
      }
    }
  }
  
  // Ensure symbol input is still functional after DOM updates
  if (window.tradeSymbolInput) {
    // Re-focus the input if it was focused before
    const symbolInputElement = window.tradeSymbolInput.input;
    if (symbolInputElement && document.activeElement === symbolInputElement) {
      // Small delay to ensure DOM updates are complete
      setTimeout(() => {
        symbolInputElement.focus();
      }, 10);
    }
  }
  
  // Update any other quick symbol instances
  // Add more updates here as needed for node properties, etc.
}

// Show test result modal with detailed information
function showTestResultModal(title, message, isSuccess) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('testResultModal');
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'testResultModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <h2 id="testResultTitle"></h2>
        <div id="testResultMessage" style="white-space: pre-wrap; font-family: monospace; background: #1e1e1e; padding: 15px; border-radius: 4px; margin: 15px 0; max-height: 400px; overflow-y: auto;"></div>
        <div class="modal-buttons">
          <button id="closeTestResultBtn" class="btn btn-primary">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('closeTestResultBtn').addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }
  
  // Update content
  const titleEl = document.getElementById('testResultTitle');
  const messageEl = document.getElementById('testResultMessage');
  
  titleEl.textContent = title;
  titleEl.style.color = isSuccess ? '#4CAF50' : '#FF5252';
  messageEl.textContent = message;
  messageEl.style.color = isSuccess ? '#4CAF50' : '#FF9800';
  
  // Show modal
  modal.classList.add('show');
}

// Test conditional check evaluation
window.testConditionalCheck = async function(nodeId) {
  console.log('=== TEST CONDITIONAL CHECK ===');
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  
  if (!node || node.type !== 'conditional-check') {
    showMessage('❌ Invalid node - not a Conditional Check node', 'error');
    return;
  }
  
  showMessage('🔄 Testing conditional check...', 'info');
  
  try {
    // Check MT5 connection
    if (!isConnected || !window.mt5API) {
      showMessage('MT5 not connected - Please connect first', 'error');
      showTestResultModal('MT5 Connection Error', '❌ MT5 Not Connected!\n\nConditional checks require MT5 connection to get current prices.\n\nPlease connect to MT5 first.', false);
      return;
    }
    
    // Validate parameters
    if (!node.params.symbol) {
      showMessage('No symbol specified', 'error');
      showTestResultModal('Configuration Error', '❌ No Symbol Specified!\n\nPlease enter a symbol (e.g., EURUSD) in the node properties.', false);
      return;
    }
    
    // Get current price first
    let currentPrice = null;
    let percentageChange = null;
    
    try {
      const marketData = await window.mt5API.getMarketData(node.params.symbol);
      if (marketData.success && marketData.data) {
        currentPrice = marketData.data.bid;
      }
    } catch (error) {
      console.error('Error getting market data:', error);
    }
    
    if (!currentPrice) {
      showMessage('Could not get current price', 'error');
      showTestResultModal('Price Error', `❌ Could Not Get Current Price!\n\nSymbol: ${node.params.symbol}\n\nPossible causes:\n- Symbol not found in Market Watch\n- Symbol name incorrect\n- Market closed`, false);
      return;
    }
    
    // Get percentage change if needed
    if (node.params.usePercentageChange) {
      try {
        const changeData = await window.mt5API.getPercentageChange(node.params.symbol, node.params.timeframe || 'M1');
        if (changeData.success && changeData.data) {
          percentageChange = changeData.data.percentage_change;
        }
      } catch (error) {
        console.error('Error getting percentage change:', error);
      }
      
      if (percentageChange === null) {
        showMessage('Could not get percentage change', 'error');
        showTestResultModal('Data Error', `❌ Could Not Get Percentage Change!\n\nSymbol: ${node.params.symbol}\nTimeframe: ${node.params.timeframe}\n\nPossible causes:\n- Insufficient historical data\n- Invalid timeframe`, false);
        return;
      }
    }
    
    // Evaluate the condition
    console.log('Evaluating condition...');
    const result = await nodeEditor.evaluateConditional(node);
    
    // Build detailed result message
    let message = '';
    
    if (node.params.usePercentageChange) {
      message = `📊 Percentage Change Check\n\n`;
      message += `Symbol: ${node.params.symbol}\n`;
      message += `Timeframe: ${node.params.timeframe}\n`;
      message += `Current Price: ${currentPrice.toFixed(5)}\n`;
      message += `Percentage Change: ${percentageChange.toFixed(4)}%\n\n`;
      message += `Condition: ${percentageChange.toFixed(4)}% ${node.params.operator} ${node.params.percentageChange}%\n\n`;
    } else {
      message = `💰 Price Check\n\n`;
      message += `Symbol: ${node.params.symbol}\n`;
      message += `Current Price: ${currentPrice.toFixed(5)}\n`;
      message += `Target Price: ${node.params.price}\n\n`;
      message += `Condition: ${currentPrice.toFixed(5)} ${node.params.operator} ${node.params.price}\n\n`;
    }
    
    if (result) {
      message += `✅ CONDITION PASSED!\n\n`;
      message += `The trigger will continue to the next node.\n`;
      message += `Connected nodes will be executed.`;
      
      showMessage('✅ Condition passed!', 'success');
      showTestResultModal('Condition Passed ✅', message, true);
    } else {
      message += `❌ CONDITION FAILED!\n\n`;
      message += `The trigger will STOP here.\n`;
      message += `Connected nodes will NOT be executed.`;
      
      showMessage('❌ Condition failed', 'error');
      showTestResultModal('Condition Failed ❌', message, false);
    }
    
  } catch (error) {
    console.error('Test conditional error:', error);
    showMessage(`Error: ${error.message}`, 'error');
    showTestResultModal('Execution Error', `❌ Unexpected Error!\n\n${error.message}\n\nStack trace:\n${error.stack}`, false);
  }
};

// Test logic gate evaluation
window.testLogicGate = async function(nodeId) {
  console.log('=== TEST LOGIC GATE ===');
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  
  if (!node || (node.type !== 'logic-and' && node.type !== 'logic-or')) {
    showMessage('❌ Invalid node - not a Logic Gate node', 'error');
    return;
  }
  
  const gateType = node.type === 'logic-and' ? 'AND' : 'OR';
  showMessage(`🔄 Testing ${gateType} gate...`, 'info');
  
  try {
    // Find incoming connections
    const incomingConnections = nodeEditor.connections.filter(c => c.to === node);
    
    if (incomingConnections.length === 0) {
      showMessage('No inputs connected', 'warning');
      showTestResultModal('No Inputs', `⚠️ ${gateType} Gate Has No Inputs!\n\nConnect trigger outputs from other nodes to the two inputs of this ${gateType} gate.\n\nThe ${gateType} gate needs at least 2 inputs to function.`, false);
      return;
    }
    
    if (incomingConnections.length < 2) {
      showMessage('Only one input connected', 'warning');
      showTestResultModal('Incomplete Setup', `⚠️ ${gateType} Gate Has Only 1 Input!\n\nCurrent connections: ${incomingConnections.length}\nRequired: 2\n\nConnect another trigger output to the second input of this ${gateType} gate.`, false);
      return;
    }
    
    // Show connection info
    let message = `🔌 ${gateType} Gate Configuration\n\n`;
    message += `Connected Inputs: ${incomingConnections.length}\n\n`;
    
    incomingConnections.forEach((conn, idx) => {
      message += `Input ${conn.toInput + 1}: ${conn.from.title} (${conn.from.type})\n`;
    });
    
    message += `\n📋 How ${gateType} Gate Works:\n\n`;
    
    if (node.type === 'logic-and') {
      message += `AND Gate: ALL inputs must be TRUE\n`;
      message += `• If Input1 = TRUE and Input2 = TRUE → Output = TRUE ✅\n`;
      message += `• If Input1 = TRUE and Input2 = FALSE → Output = FALSE ❌\n`;
      message += `• If Input1 = FALSE and Input2 = TRUE → Output = FALSE ❌\n`;
      message += `• If Input1 = FALSE and Input2 = FALSE → Output = FALSE ❌\n\n`;
      message += `Use Case: Execute trade only if BOTH conditions are met\n`;
      message += `Example: Price > 1.08 AND RSI < 30`;
    } else {
      message += `OR Gate: ANY input can be TRUE\n`;
      message += `• If Input1 = TRUE and Input2 = TRUE → Output = TRUE ✅\n`;
      message += `• If Input1 = TRUE and Input2 = FALSE → Output = TRUE ✅\n`;
      message += `• If Input1 = FALSE and Input2 = TRUE → Output = TRUE ✅\n`;
      message += `• If Input1 = FALSE and Input2 = FALSE → Output = FALSE ❌\n\n`;
      message += `Use Case: Execute trade if EITHER condition is met\n`;
      message += `Example: Price > 1.08 OR Price < 1.06`;
    }
    
    message += `\n\n💡 To test the actual logic:\n`;
    message += `1. Run your strategy with "Execute Once"\n`;
    message += `2. Watch the console for logic gate evaluation\n`;
    message += `3. Check if connected nodes execute based on the result`;
    
    showMessage(`${gateType} gate configured with ${incomingConnections.length} inputs`, 'info');
    showTestResultModal(`${gateType} Gate Info`, message, true);
    
  } catch (error) {
    console.error('Test logic gate error:', error);
    showMessage(`Error: ${error.message}`, 'error');
    showTestResultModal('Execution Error', `❌ Unexpected Error!\n\n${error.message}`, false);
  }
};

// Test close position execution
window.testClosePosition = async function(nodeId) {
  console.log('=== TEST CLOSE POSITION ===');
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  
  if (!node || node.type !== 'close-position') {
    showMessage('❌ Invalid node - not a Close Position node', 'error');
    return;
  }
  
  showMessage('🔄 Testing position closure...', 'info');
  
  try {
    // Check MT5 connection
    if (!isConnected || !window.mt5API) {
      showMessage('MT5 not connected - Please connect first', 'error');
      showTestResultModal('MT5 Connection Error', '❌ MT5 Not Connected!\n\nPlease connect to MT5 first.', false);
      return;
    }
    
    // Check close type
    if (node.params.closeType === 'all') {
      // Close all positions
      const positions = await window.mt5API.getPositions();
      
      if (!positions.success || !positions.data || positions.data.length === 0) {
        showMessage('No positions to close', 'info');
        showTestResultModal('No Positions', 'ℹ️ No open positions found to close.', false);
        return;
      }
      
      let successCount = 0;
      let failCount = 0;
      const results = [];
      
      for (const position of positions.data) {
        const result = await window.mt5API.closePosition(position.ticket);
        if (result.success && result.data.success) {
          successCount++;
          results.push(`✅ Closed ticket ${position.ticket}`);
        } else {
          failCount++;
          results.push(`❌ Failed ticket ${position.ticket}: ${result.data?.error || result.error}`);
        }
      }
      
      const message = `Close All Results:\n\n${results.join('\n')}\n\nSuccess: ${successCount}\nFailed: ${failCount}`;
      showMessage(`Closed ${successCount}/${positions.data.length} positions`, successCount > 0 ? 'success' : 'error');
      showTestResultModal('Close All Positions', message, successCount > 0);
      
      if (successCount > 0 && window.handleRefreshPositions) {
        setTimeout(() => window.handleRefreshPositions(), 500);
      }
      
    } else {
      // Close specific position
      if (!node.params.ticket) {
        showMessage('No ticket specified', 'error');
        showTestResultModal('Configuration Error', '❌ No Ticket Specified!\n\nPlease select a position ticket from the dropdown.', false);
        return;
      }
      
      const result = await window.mt5API.closePosition(node.params.ticket);
      
      if (result.success && result.data.success) {
        const message = `✅ Position Closed Successfully!\n\nTicket: ${node.params.ticket}`;
        showMessage(`Position ${node.params.ticket} closed`, 'success');
        showTestResultModal('Position Closed', message, true);
        
        if (window.handleRefreshPositions) {
          setTimeout(() => window.handleRefreshPositions(), 500);
        }
      } else {
        const message = `❌ Failed to Close Position!\n\nTicket: ${node.params.ticket}\nError: ${result.data?.error || result.error}\n\nPossible causes:\n- Position already closed\n- Invalid ticket number\n- Market closed`;
        showMessage(`Close failed: ${result.data?.error || result.error}`, 'error');
        showTestResultModal('Close Failed', message, false);
      }
    }
    
  } catch (error) {
    console.error('Test close error:', error);
    showMessage(`Error: ${error.message}`, 'error');
    showTestResultModal('Execution Error', `❌ Unexpected Error!\n\n${error.message}`, false);
  }
};

// Test modify position execution
window.testModifyPosition = async function(nodeId) {
  console.log('=== TEST MODIFY POSITION ===');
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  
  if (!node || node.type !== 'modify-position') {
    showMessage('❌ Invalid node - not a Modify Position node', 'error');
    return;
  }
  
  showMessage('🔄 Testing position modification...', 'info');
  
  try {
    // Check MT5 connection
    if (!isConnected || !window.mt5API) {
      showMessage('MT5 not connected - Please connect first', 'error');
      showTestResultModal('MT5 Connection Error', '❌ MT5 Not Connected!\n\nPlease connect to MT5 first.\n\n💡 Solution: Click "Connect to MT5" button first.', false);
      return;
    }
    
    // Validate ticket
    if (!node.params.ticket) {
      showMessage('No ticket specified', 'error');
      showTestResultModal('Configuration Error', '❌ No Ticket Specified!\n\nPlease select a position ticket from the dropdown.\n\n💡 Solution: Choose a position from the "Ticket" dropdown in the properties panel.', false);
      return;
    }
    
    // Get current position info for validation
    const positions = await window.mt5API.getPositions();
    if (!positions.success) {
      showMessage('Failed to get positions', 'error');
      showTestResultModal('Position Check Failed', '❌ Could not retrieve current positions!\n\nThis might indicate an MT5 connection issue.', false);
      return;
    }
    
    const currentPosition = positions.data.find(pos => pos.ticket == node.params.ticket);
    if (!currentPosition) {
      showMessage('Position not found', 'error');
      showTestResultModal('Position Not Found', `❌ Position with ticket ${node.params.ticket} not found!\n\nThe position may have been closed or the ticket is invalid.\n\n💡 Solution: Refresh positions and select a valid ticket.`, false);
      return;
    }
    
    // Validate SL/TP values
    const stopLoss = parseFloat(node.params.stopLoss) || 0;
    const takeProfit = parseFloat(node.params.takeProfit) || 0;
    const currentPrice = currentPosition.price_current;
    const symbol = currentPosition.symbol;
    const isBuy = currentPosition.type === 0; // 0 = BUY, 1 = SELL
    
    let validationErrors = [];
    
    // Validate Stop Loss
    if (stopLoss > 0) {
      if (isBuy && stopLoss >= currentPrice) {
        validationErrors.push(`Stop Loss (${stopLoss}) must be below current price (${currentPrice}) for BUY positions`);
      } else if (!isBuy && stopLoss <= currentPrice) {
        validationErrors.push(`Stop Loss (${stopLoss}) must be above current price (${currentPrice}) for SELL positions`);
      }
    }
    
    // Validate Take Profit
    if (takeProfit > 0) {
      if (isBuy && takeProfit <= currentPrice) {
        validationErrors.push(`Take Profit (${takeProfit}) must be above current price (${currentPrice}) for BUY positions`);
      } else if (!isBuy && takeProfit >= currentPrice) {
        validationErrors.push(`Take Profit (${takeProfit}) must be below current price (${currentPrice}) for SELL positions`);
      }
    }
    
    // Check if both values are zero
    if (stopLoss === 0 && takeProfit === 0) {
      validationErrors.push('At least one of Stop Loss or Take Profit must be specified');
    }
    
    if (validationErrors.length > 0) {
      const errorMessage = `❌ Validation Errors:\n\n${validationErrors.map(err => `• ${err}`).join('\n')}\n\n💡 Current Position Info:\nSymbol: ${symbol}\nType: ${isBuy ? 'BUY' : 'SELL'}\nCurrent Price: ${currentPrice}\nCurrent SL: ${currentPosition.sl || 'None'}\nCurrent TP: ${currentPosition.tp || 'None'}`;
      showMessage('Validation failed', 'error');
      showTestResultModal('Validation Failed', errorMessage, false);
      return;
    }
    
    // Show pre-modification info
    console.log('Position before modification:', {
      ticket: currentPosition.ticket,
      symbol: currentPosition.symbol,
      type: isBuy ? 'BUY' : 'SELL',
      volume: currentPosition.volume,
      currentPrice: currentPrice,
      currentSL: currentPosition.sl || 'None',
      currentTP: currentPosition.tp || 'None',
      newSL: stopLoss || 'None',
      newTP: takeProfit || 'None'
    });
    
    // Execute modification
    const result = await window.mt5API.modifyPosition(
      node.params.ticket,
      stopLoss,
      takeProfit
    );
    
    if (result.success && result.data.success) {
      const message = `✅ Position Modified Successfully!\n\nTicket: ${node.params.ticket}\nSymbol: ${symbol}\nType: ${isBuy ? 'BUY' : 'SELL'}\nVolume: ${currentPosition.volume}\n\nChanges:\nStop Loss: ${currentPosition.sl || 'None'} → ${stopLoss || 'None'}\nTake Profit: ${currentPosition.tp || 'None'} → ${takeProfit || 'None'}\n\n💡 The position has been successfully updated in MT5.`;
      showMessage(`Position ${node.params.ticket} modified`, 'success');
      showTestResultModal('Position Modified', message, true);
      
      if (window.handleRefreshPositions) {
        setTimeout(() => window.handleRefreshPositions(), 500);
      }
    } else {
      const errorMsg = result.data?.error || result.error || 'Unknown error';
      const message = `❌ Failed to Modify Position!\n\nTicket: ${node.params.ticket}\nError: ${errorMsg}\n\nPossible causes:\n• SL/TP values too close to current price\n• Invalid price levels for the symbol\n• Position was closed during modification\n• Insufficient margin for the modification\n• Market is closed\n\n💡 Solutions:\n• Check minimum distance requirements for ${symbol}\n• Verify SL/TP values are reasonable\n• Try again when market is open\n• Refresh positions and try again`;
      showMessage(`Modify failed: ${errorMsg}`, 'error');
      showTestResultModal('Modify Failed', message, false);
    }
    
  } catch (error) {
    console.error('Test modify error:', error);
    showMessage(`Error: ${error.message}`, 'error');
    showTestResultModal('Execution Error', `❌ Unexpected Error!\n\n${error.message}\n\n💡 This might be a connection issue or MT5 problem. Try reconnecting to MT5.`, false);
  }
};

// Debug function to test Modify Position node execution
window.testModifyPositionNode = async function(ticketId = null, stopLoss = null, takeProfit = null) {
  console.log('=== TESTING MODIFY POSITION NODE ===');
  
  try {
    // Check MT5 connection
    if (!isConnected || !window.mt5API) {
      console.error('❌ MT5 not connected');
      showMessage('MT5 not connected - Please connect first', 'error');
      return;
    }
    
    // Get current positions
    console.log('📋 Getting current positions...');
    const positions = await window.mt5API.getPositions();
    
    if (!positions.success || !positions.data || positions.data.length === 0) {
      console.error('❌ No positions available');
      showMessage('No positions available for testing', 'error');
      return;
    }
    
    console.log(`✅ Found ${positions.data.length} position(s)`);
    positions.data.forEach((pos, idx) => {
      console.log(`  ${idx + 1}. Ticket: ${pos.ticket}, Symbol: ${pos.symbol}, Type: ${pos.type === 0 ? 'BUY' : 'SELL'}, Volume: ${pos.volume}, Price: ${pos.price_current}, SL: ${pos.sl || 'None'}, TP: ${pos.tp || 'None'}`);
    });
    
    // Use provided ticket or first available position
    const targetPosition = ticketId 
      ? positions.data.find(pos => pos.ticket == ticketId)
      : positions.data[0];
    
    if (!targetPosition) {
      console.error(`❌ Position with ticket ${ticketId} not found`);
      showMessage(`Position ${ticketId} not found`, 'error');
      return;
    }
    
    console.log(`🎯 Testing with position: ${targetPosition.ticket} (${targetPosition.symbol})`);
    
    // Use provided values or calculate reasonable defaults
    const currentPrice = targetPosition.price_current;
    const isBuy = targetPosition.type === 0;
    const symbol = targetPosition.symbol;
    
    let testSL = stopLoss;
    let testTP = takeProfit;
    
    // Calculate reasonable test values if not provided
    if (testSL === null) {
      // Set SL 50 pips away from current price
      const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
      testSL = isBuy 
        ? Math.round((currentPrice - (50 * pipValue)) * 100000) / 100000
        : Math.round((currentPrice + (50 * pipValue)) * 100000) / 100000;
    }
    
    if (testTP === null) {
      // Set TP 100 pips away from current price
      const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
      testTP = isBuy 
        ? Math.round((currentPrice + (100 * pipValue)) * 100000) / 100000
        : Math.round((currentPrice - (100 * pipValue)) * 100000) / 100000;
    }
    
    console.log(`📊 Test parameters:`);
    console.log(`  Ticket: ${targetPosition.ticket}`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Type: ${isBuy ? 'BUY' : 'SELL'}`);
    console.log(`  Current Price: ${currentPrice}`);
    console.log(`  Current SL: ${targetPosition.sl || 'None'}`);
    console.log(`  Current TP: ${targetPosition.tp || 'None'}`);
    console.log(`  New SL: ${testSL}`);
    console.log(`  New TP: ${testTP}`);
    
    // Validate values
    let validationErrors = [];
    
    if (testSL > 0) {
      if (isBuy && testSL >= currentPrice) {
        validationErrors.push(`Stop Loss (${testSL}) must be below current price (${currentPrice}) for BUY positions`);
      } else if (!isBuy && testSL <= currentPrice) {
        validationErrors.push(`Stop Loss (${testSL}) must be above current price (${currentPrice}) for SELL positions`);
      }
    }
    
    if (testTP > 0) {
      if (isBuy && testTP <= currentPrice) {
        validationErrors.push(`Take Profit (${testTP}) must be above current price (${currentPrice}) for BUY positions`);
      } else if (!isBuy && testTP >= currentPrice) {
        validationErrors.push(`Take Profit (${testTP}) must be below current price (${currentPrice}) for SELL positions`);
      }
    }
    
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:');
      validationErrors.forEach(err => console.error(`  • ${err}`));
      showMessage('Validation failed - check console for details', 'error');
      return;
    }
    
    console.log('✅ Validation passed, executing modification...');
    showMessage('🔄 Testing position modification...', 'info');
    
    // Execute the modification
    const result = await window.mt5API.modifyPosition(
      targetPosition.ticket,
      testSL,
      testTP
    );
    
    if (result.success && result.data.success) {
      console.log('✅ Position modified successfully!');
      console.log('📊 Modification result:', result.data);
      showMessage(`Position ${targetPosition.ticket} modified successfully`, 'success');
      
      // Refresh positions to show updated values
      if (window.handleRefreshPositions) {
        setTimeout(() => window.handleRefreshPositions(), 500);
      }
      
      // Show updated position info
      setTimeout(async () => {
        const updatedPositions = await window.mt5API.getPositions();
        const updatedPosition = updatedPositions.data?.find(pos => pos.ticket == targetPosition.ticket);
        if (updatedPosition) {
          console.log('📊 Updated position info:');
          console.log(`  SL: ${targetPosition.sl || 'None'} → ${updatedPosition.sl || 'None'}`);
          console.log(`  TP: ${targetPosition.tp || 'None'} → ${updatedPosition.tp || 'None'}`);
        }
      }, 1000);
      
    } else {
      const errorMsg = result.data?.error || result.error || 'Unknown error';
      console.error('❌ Modification failed:', errorMsg);
      showMessage(`Modification failed: ${errorMsg}`, 'error');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
    showMessage(`Test error: ${error.message}`, 'error');
  }
};

// Debug function to test Open Position node execution
window.testOpenPositionNode = async function() {
  console.log('=== TESTING OPEN POSITION NODE ===');
  
  // Check prerequisites
  console.log('1. Checking MT5 connection...');
  console.log('   - isConnected:', isConnected);
  console.log('   - window.mt5API:', !!window.mt5API);
  
  if (!isConnected || !window.mt5API) {
    console.error('❌ MT5 is not connected! Please connect to MT5 first.');
    showMessage('Please connect to MT5 first', 'error');
    return;
  }
  
  console.log('✓ MT5 is connected');
  
  // Check for trade-signal nodes
  console.log('2. Checking for Open Position nodes...');
  const tradeNodes = nodeEditor.nodes.filter(n => n.type === 'trade-signal');
  console.log('   - Found', tradeNodes.length, 'Open Position node(s)');
  
  if (tradeNodes.length === 0) {
    console.error('❌ No Open Position nodes found! Please add one to the canvas.');
    showMessage('No Open Position nodes found', 'error');
    return;
  }
  
  const testNode = tradeNodes[0];
  console.log('✓ Using first Open Position node:', testNode);
  console.log('   - Symbol:', testNode.params.symbol);
  console.log('   - Action:', testNode.params.action);
  console.log('   - Volume:', testNode.params.volume);
  
  // Test overtrade control
  console.log('3. Testing overtrade control...');
  const orderData = {
    symbol: testNode.params.symbol,
    type: testNode.params.action,
    volume: testNode.params.volume,
    stopLoss: testNode.params.stopLoss || 0,
    takeProfit: testNode.params.takeProfit || 0
  };
  
  try {
    const shouldProceed = await window.overtradeControl.checkBeforeTrade('test', orderData);
    console.log('   - Overtrade control result:', shouldProceed);
    
    if (!shouldProceed) {
      console.warn('⚠️ Trade blocked by overtrade control');
      showMessage('Trade blocked by overtrade control', 'warning');
      return;
    }
    
    console.log('✓ Overtrade control passed');
    
    // Test actual trade execution
    console.log('4. Executing test trade...');
    const result = await window.mt5API.executeOrder(orderData);
    console.log('   - Trade result:', result);
    
    if (result.success && result.data.success) {
      console.log('✅ TEST PASSED! Trade executed successfully');
      console.log('   - Ticket:', result.data.ticket);
      console.log('   - Price:', result.data.price);
      showMessage(`Test trade executed! Ticket: ${result.data.ticket}`, 'success');
      
      // Refresh positions
      if (window.handleRefreshPositions) {
        await window.handleRefreshPositions();
      }
    } else {
      console.error('❌ TEST FAILED! Trade execution failed');
      console.error('   - Error:', result.data?.error || result.error);
      showMessage(`Test trade failed: ${result.data?.error || result.error}`, 'error');
    }
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    showMessage(`Test error: ${error.message}`, 'error');
  }
  
  console.log('=== TEST COMPLETE ===');
};

console.log('Debug functions loaded:');
console.log('• window.testOpenPositionNode() - Test Open Position node execution');
console.log('• window.testModifyPositionNode(ticketId, stopLoss, takeProfit) - Test Modify Position node execution');
console.log('• window.testClosePosition(nodeId) - Test Close Position node execution');
console.log('• window.testModifyPosition(nodeId) - Test Modify Position node execution');


// Debug function to check strategy setup
window.debugStrategy = function() {
  console.log('=== STRATEGY DEBUG INFO ===');
  
  // Check nodes
  console.log('\n1. NODES:');
  console.log('Total nodes:', nodeEditor.nodes.length);
  
  const triggers = nodeEditor.nodes.filter(n => n.type === 'trigger');
  const tradeNodes = nodeEditor.nodes.filter(n => n.type === 'trade-signal');
  
  console.log('Trigger nodes:', triggers.length);
  triggers.forEach((t, idx) => {
    console.log(`  ${idx + 1}. ${t.title} - Enabled: ${t.params.enabled !== false}`);
  });
  
  console.log('Open Position nodes:', tradeNodes.length);
  tradeNodes.forEach((t, idx) => {
    console.log(`  ${idx + 1}. ${t.title} - Symbol: ${t.params.symbol}, Action: ${t.params.action}, Volume: ${t.params.volume}`);
  });
  
  // Check connections
  console.log('\n2. CONNECTIONS:');
  console.log('Total connections:', nodeEditor.connections.length);
  
  nodeEditor.connections.forEach((conn, idx) => {
    console.log(`  ${idx + 1}. ${conn.from.title} → ${conn.to.title}`);
  });
  
  // Check if triggers are connected to trade nodes
  console.log('\n3. TRIGGER → TRADE CONNECTIONS:');
  let foundConnection = false;
  
  triggers.forEach(trigger => {
    const connectedTrades = nodeEditor.connections
      .filter(c => c.from === trigger && c.to.type === 'trade-signal')
      .map(c => c.to);
    
    if (connectedTrades.length > 0) {
      console.log(`✓ ${trigger.title} → ${connectedTrades.map(t => t.title).join(', ')}`);
      foundConnection = true;
    } else {
      console.warn(`⚠️ ${trigger.title} is NOT connected to any Open Position nodes!`);
    }
  });
  
  if (!foundConnection && triggers.length > 0 && tradeNodes.length > 0) {
    console.error('❌ NO CONNECTIONS between Trigger and Open Position nodes!');
    console.log('\n💡 FIX: Drag from the Trigger output (green circle on right) to the Open Position input (blue circle on left)');
  }
  
  // Check MT5 connection
  console.log('\n4. MT5 CONNECTION:');
  console.log('Connected:', isConnected);
  console.log('MT5 API available:', !!window.mt5API);
  
  // Summary
  console.log('\n5. SUMMARY:');
  if (triggers.length === 0) {
    console.error('❌ No Trigger nodes found - Add a Trigger node');
  } else {
    console.log('✓ Trigger nodes present');
  }
  
  if (tradeNodes.length === 0) {
    console.error('❌ No Open Position nodes found - Add an Open Position node');
  } else {
    console.log('✓ Open Position nodes present');
  }
  
  if (!foundConnection && triggers.length > 0 && tradeNodes.length > 0) {
    console.error('❌ Nodes not connected - Connect Trigger to Open Position');
  } else if (foundConnection) {
    console.log('✓ Nodes are connected');
  }
  
  if (!isConnected) {
    console.error('❌ MT5 not connected - Click "Connect to MT5"');
  } else {
    console.log('✓ MT5 connected');
  }
  
  console.log('\n=== END DEBUG INFO ===');
  
  // Return summary object
  return {
    nodes: {
      total: nodeEditor.nodes.length,
      triggers: triggers.length,
      trades: tradeNodes.length
    },
    connections: {
      total: nodeEditor.connections.length,
      triggerToTrade: foundConnection
    },
    mt5Connected: isConnected,
    ready: triggers.length > 0 && tradeNodes.length > 0 && foundConnection && isConnected
  };
};

console.log('Debug helper loaded. Run window.debugStrategy() to check your strategy setup.');
