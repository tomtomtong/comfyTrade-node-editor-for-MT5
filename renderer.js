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
document.addEventListener('DOMContentLoaded', async () => {
  await initializeNodeEditor();
  setupEventListeners();
  updateStrategyButtons(); // Set initial button state
  window.historyImport.checkBacktestMode();
  
  // Auto-load all settings on startup with a small delay to ensure all systems are ready
  setTimeout(async () => {
    await loadAllSettingsOnStartup();
  }, 100);
});

// Auto-load all settings when application starts
async function loadAllSettingsOnStartup() {
  try {
    
    // Wait for settings manager to be ready
    if (window.settingsManager) {
      // Load all settings components
      loadGeneralSettings();
      loadOvertradeSettings();
      loadVolumeControlSettings();
      loadTwilioSettings();
      await loadAiAnalysisSettings();
      
      // Ensure control systems are properly initialized
      if (window.overtradeControl) {
        window.overtradeControl.loadSettings();
      }
      
      if (window.volumeControl) {
        window.volumeControl.loadSettings();
      }
      
      // Check simulator mode from settings and show UI if enabled
      checkAndShowSimulatorModeFromSettings();
      
      // Load chart image paths
      await loadChartImagePaths();
      
    } else {
      setTimeout(loadAllSettingsOnStartup, 500);
    }
  } catch (error) {
    console.error('❌ Error auto-loading settings on startup:', error);
  }
}

// Reload settings from JSON file (like manual load but automatic)
async function reloadSettingsFromFile() {
  try {
    
    if (window.settingsManager && window.electronAPI && window.electronAPI.loadSettings) {
      const fileSettings = await window.electronAPI.loadSettings('app_settings.json');
      if (fileSettings) {
        // Update settings manager with fresh data
        window.settingsManager.settings = window.settingsManager.mergeSettings(window.settingsManager.defaultSettings, fileSettings);
        
        // Reload all control systems with fresh settings
        if (window.overtradeControl) {
          window.overtradeControl.loadSettings();
        }
        
        if (window.volumeControl) {
          window.volumeControl.loadSettings();
        }
        
        return true;
      } else {
        return false;
      }
    } else {
      console.error('❌ Settings manager or Electron API not available');
      return false;
    }
  } catch (error) {
    console.error('❌ Error reloading settings from file:', error);
    return false;
  }
}

async function initializeNodeEditor() {
  const canvas = document.getElementById('nodeCanvas');
  nodeEditor = new NodeEditor(canvas);
  
  // Initialize plugin manager
  window.nodePluginManager = new NodePluginManager(nodeEditor);
  
  // Auto-load built-in example plugins
  try {
    // Load HTTP Request plugin
    const response = await fetch('./plugins/examples/http-request.js');
    const text = await response.text();
    
    // Parse the plugin definition (similar to handlePluginImport)
    const moduleExports = {};
    const module = { exports: moduleExports };
    eval(text);
    const httpRequestPlugin = module.exports;
    
    if (httpRequestPlugin && typeof httpRequestPlugin === 'object') {
      window.nodePluginManager.loadPlugin(httpRequestPlugin);
      console.log('✓ HTTP Request plugin loaded successfully');
    } else {
      console.error('Failed to parse HTTP Request plugin');
    }

    // Load Alpha Vantage Data plugin
    try {
      const avDataResponse = await fetch('./plugins/examples/alphavantage-data.js');
      const avDataText = await avDataResponse.text();
      const avDataModuleExports = {};
      const avDataModule = { exports: avDataModuleExports };
      eval(avDataText);
      const avDataPlugin = avDataModule.exports;
      
      if (avDataPlugin && typeof avDataPlugin === 'object') {
        window.nodePluginManager.loadPlugin(avDataPlugin);
        console.log('✓ Alpha Vantage Data plugin loaded successfully');
      }
    } catch (e) {
      console.error('Failed to load Alpha Vantage Data plugin:', e);
    }

    // Load Alpha Vantage Sentiment plugin
    try {
      const avSentimentResponse = await fetch('./plugins/examples/alphavantage-sentiment.js');
      const avSentimentText = await avSentimentResponse.text();
      const avSentimentModuleExports = {};
      const avSentimentModule = { exports: avSentimentModuleExports };
      eval(avSentimentText);
      const avSentimentPlugin = avSentimentModule.exports;
      
      if (avSentimentPlugin && typeof avSentimentPlugin === 'object') {
        window.nodePluginManager.loadPlugin(avSentimentPlugin);
        console.log('✓ Alpha Vantage Sentiment plugin loaded successfully');
      }
    } catch (e) {
      console.error('Failed to load Alpha Vantage Sentiment plugin:', e);
    }
  } catch (e) {
    console.error('Failed to auto-load built-in plugins:', e);
  }
  
  // Add default trigger node at center of canvas
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const canvasPos = nodeEditor.screenToCanvas(centerX, centerY);
  const defaultTrigger = nodeEditor.addNode('trigger', canvasPos.x, canvasPos.y);
  console.log('✓ Default trigger node added to canvas');
}

function setupEventListeners() {
  // Toolbar buttons
  document.getElementById('connectBtn').addEventListener('click', handleConnectionToggle);
  document.getElementById('tradeBtn').addEventListener('click', showTradeModal);
  document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
  document.getElementById('showLogBtn').addEventListener('click', showLogModal);
  document.getElementById('showAIMemoryBtn').addEventListener('click', showAIMemoryModal);
  document.getElementById('showTradeJournalBtn').addEventListener('click', showTradeJournalModal);
  document.getElementById('toggleBottomPanelBtn').addEventListener('click', toggleBottomPanel);
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
  
  // Plugin import
  document.getElementById('importPluginBtn').addEventListener('click', () => {
    document.getElementById('pluginFileInput').click();
  });
  document.getElementById('pluginFileInput').addEventListener('change', handlePluginImport);
  
  // Modal buttons
  document.getElementById('confirmConnectBtn').addEventListener('click', handleConnect);
  document.getElementById('cancelConnectBtn').addEventListener('click', hideConnectionModal);
  document.getElementById('confirmTradeBtn').addEventListener('click', handleExecuteTrade);
  document.getElementById('cancelTradeBtn').addEventListener('click', hideTradeModal);
  
  // Execution type change handler - show/hide limit price field
  document.getElementById('executionType').addEventListener('change', (e) => {
    const limitPriceGroup = document.getElementById('limitPriceGroup');
    if (e.target.value === 'LIMIT') {
      limitPriceGroup.style.display = 'block';
    } else {
      limitPriceGroup.style.display = 'none';
      document.getElementById('limitPrice').value = '';
    }
  });
  
  document.getElementById('confirmImportBtn').addEventListener('click', () => window.historyImport.handleImportHistory());
  document.getElementById('cancelImportBtn').addEventListener('click', () => window.historyImport.hideBacktestModal());
  
  // Account refresh
  document.getElementById('refreshAccountBtn').addEventListener('click', handleRefreshAccount);
  
  // Position tabs
  document.querySelectorAll('.positions-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      switchPositionsTab(tabName);
    });
  });
  
  // Closed positions controls
  document.getElementById('refreshClosedPositionsBtn').addEventListener('click', handleRefreshClosedPositions);
  document.getElementById('closedPositionsDays').addEventListener('change', handleRefreshClosedPositions);
  
  // Pending orders controls
  document.getElementById('refreshPendingOrdersBtn').addEventListener('click', handleRefreshPendingOrders);
  
  // Volume loss calculation
  document.getElementById('tradeVolume').addEventListener('input', calculateVolumeLoss);
  document.getElementById('tradeType').addEventListener('change', () => {
    calculateVolumeLoss();
    // Note: TP/SL are optional - no default values are set when trade type changes
  });
  
  // Volume loss reminder modal
  document.getElementById('closeAlertBtn').addEventListener('click', hidePriceDropAlert);
  document.getElementById('modifyPositionBtn').addEventListener('click', handleModifyPositionFromAlert);
  
  // Log modal
  document.getElementById('closeLogBtn').addEventListener('click', hideLogModal);
  document.getElementById('clearLogBtn').addEventListener('click', clearLog);
  document.getElementById('copyLogBtn').addEventListener('click', copyLog);
  
  // AI Memory Modal buttons
  document.getElementById('closeAIMemoryBtn').addEventListener('click', hideAIMemoryModal);
  document.getElementById('refreshAIMemoryBtn').addEventListener('click', updateAIMemoryDisplay);
  document.getElementById('clearAllAIMemoryBtn').addEventListener('click', clearAllAIMemory);
  
  // Trade Journal Modal buttons
  document.getElementById('closeTradeJournalBtn').addEventListener('click', hideTradeJournalModal);
  document.getElementById('refreshTradeJournalBtn').addEventListener('click', updateTradeJournalDisplay);
  
  // Stop strategy modal
  document.getElementById('confirmStopBtn').addEventListener('click', handleStopStrategy);
  document.getElementById('cancelStopBtn').addEventListener('click', hideStopStrategyModal);
  
  // Confirmation modal
  document.getElementById('confirmYesBtn').addEventListener('click', handleConfirmationYes);
  document.getElementById('confirmNoBtn').addEventListener('click', handleConfirmationNo);
  
  // Node palette buttons
  document.querySelectorAll('.node-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      // Ignore plugin buttons; they have their own handler
      if (target.dataset && target.dataset.plugin === 'true') return;
      const type = target.dataset.type;
      const canvas = document.getElementById('nodeCanvas');
      const rect = canvas.getBoundingClientRect();
      const screenX = rect.width / 2 - 90 + Math.random() * 100;
      const screenY = rect.height / 2 - 40 + Math.random() * 100;
      // Convert screen coordinates to canvas coordinates
      const canvasPos = nodeEditor.screenToCanvas(screenX, screenY);
      nodeEditor.addNode(type, canvasPos.x, canvasPos.y);
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
  
  // Trade confirmation modal event listeners
  if (document.getElementById('tradeConfirmationModal')) {
    // Modal close on overlay click
    document.getElementById('tradeConfirmationModal').onclick = (e) => {
      if (e.target === document.getElementById('tradeConfirmationModal')) {
        hideTradeConfirmationModal(true);
      }
    };
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('tradeConfirmationModal').classList.contains('show')) {
        hideTradeConfirmationModal(true);
      }
    });
  }

  // Modify Pending Order Modal - close on overlay click
  if (document.getElementById('modifyPendingOrderModal')) {
    document.getElementById('modifyPendingOrderModal').onclick = (e) => {
      if (e.target === document.getElementById('modifyPendingOrderModal')) {
        hideModifyPendingOrderModal();
      }
    };
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('modifyPendingOrderModal').classList.contains('show')) {
        hideModifyPendingOrderModal();
      }
    });
  }

  // Global hotkey for toggling simulator mode (Ctrl+Shift+S)
  // This is registered globally so it works at any time, not just when settings modal is open
  document.addEventListener('keydown', (e) => {
    // Check for Ctrl+Shift+S (or Cmd+Shift+S on Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      // Prevent default browser behavior
      e.preventDefault();
      // Don't trigger if user is typing in an input field
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );
      if (!isInputFocused) {
        toggleSimulatorModeHotkey();
      }
    }
  });
}

// Connection Toggle
function handleConnectionToggle() {
  if (isConnected) {
    handleDisconnect();
  } else {
    showConnectionModal();
  }
}

// Connection Modal
function showConnectionModal() {
  document.getElementById('connectionModal').classList.add('show');
}

function hideConnectionModal() {
  document.getElementById('connectionModal').classList.remove('show');
}

// Disconnect function
async function handleDisconnect() {
  // Show confirmation dialog
  showConfirmation(
    'Disconnect from MT5',
    'Are you sure you want to disconnect from MetaTrader 5? This will stop all auto-refresh and clear current data.',
    async () => {
      try {
        // Stop auto-refresh
        stopAutoRefresh();
        
        // Reset connection state
        isConnected = false;
        

        
        try {
          const connectBtn = document.getElementById('connectBtn');
          if (connectBtn) {
            connectBtn.textContent = 'Connect MT5';
            connectBtn.className = 'btn btn-primary';
          }
        } catch (e) {
          console.warn('Could not update connect button:', e);
        }
        
        // Clear account and position data with null checks
        try {
          const balance = document.getElementById('balance');
          if (balance) balance.textContent = '-';
          
          const equity = document.getElementById('equity');
          if (equity) equity.textContent = '-';
          
          const profit = document.getElementById('profit');
          if (profit) profit.textContent = '-';
        } catch (e) {
          console.warn('Could not clear account data:', e);
        }
        
        try {
          const positionsContainer = document.getElementById('positionsContainer');
          if (positionsContainer) {
            positionsContainer.innerHTML = '<p class="no-data">Disconnected from MT5</p>';
          }
        } catch (e) {
          console.warn('Could not clear positions container:', e);
        }
        
        showMessage('Disconnected from MT5', 'info');
        
        // Optionally call MT5 API disconnect if available
        try {
          if (window.mt5API && window.mt5API.disconnect) {
            await window.mt5API.disconnect();
          }
        } catch (e) {
          console.warn('MT5 API disconnect failed:', e);
        }
        
      } catch (error) {
        console.error('Error during disconnect:', error);
        showMessage('Error during disconnect: ' + error.message, 'error');
        
        // Ensure we still reset the basic connection state even if other things fail
        isConnected = false;
        try {
          const connectBtn = document.getElementById('connectBtn');
          if (connectBtn) {
            connectBtn.textContent = 'Connect MT5';
            connectBtn.className = 'btn btn-primary';
          }
        } catch (e) {
          console.error('Could not reset connect button after error:', e);
        }
      }
    }
  );
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
  const currentSymbol = symbolInput ? symbolInput.getValue() : '';
  if (currentSymbol && currentSymbol.length >= 6) {
    updateCurrentPrice(currentSymbol);
    // Also set default volume for already selected symbol
    setDefaultVolumeForSymbol(currentSymbol);
    // Note: TP/SL are optional - no default values will be set
  }
  
  // Note: Removed automatic volume loss calculation to prevent immediate popup
  // Users can still calculate volume loss by changing volume or symbol values
}

function hideTradeModal() {
  document.getElementById('tradeModal').classList.remove('show');
  stopPriceAutoRefresh();
}

// Helper function to set default volume for a symbol
function setDefaultVolumeForSymbol(symbol) {
  if (!symbol || symbol.length < 6) return;
  
  // Ensure volumeControl is loaded
  if (!window.volumeControl) {
    // Retry after a short delay if volumeControl isn't ready yet
    setTimeout(() => setDefaultVolumeForSymbol(symbol), 100);
    return;
  }
  
  // Load settings if not already loaded
  if (!window.volumeControl.settingsLoaded) {
    window.volumeControl.loadSettings();
    // Retry after settings load
    setTimeout(() => setDefaultVolumeForSymbol(symbol), 200);
    return;
  }
  
  // Get the volume input field
  const volumeInput = document.getElementById('tradeVolume');
  if (!volumeInput) {
    // Volume input doesn't exist yet, retry after a short delay
    setTimeout(() => setDefaultVolumeForSymbol(symbol), 100);
    return;
  }
  
  // Check if volume control is enabled
  if (window.volumeControl.settings.enabled) {
    const symbolUpper = symbol.toUpperCase();
    const defaultVolume = window.volumeControl.settings.symbolLimits[symbolUpper];
    if (defaultVolume) {
      volumeInput.value = defaultVolume;
      console.log(`Auto-populated volume for ${symbolUpper}: ${defaultVolume}`);
    }
  }
}

// Helper function to set default stop loss and take profit values (3% from current price)
// Can accept bid/ask prices directly, or read from DOM if not provided
// forceUpdate: if true, always update even if fields have values (used when symbol changes)
function setDefaultStopLossTakeProfit(bidPrice = null, askPrice = null, forceUpdate = false) {
  const stopLossInput = document.getElementById('tradeStopLoss');
  const takeProfitInput = document.getElementById('tradeTakeProfit');
  const tradeTypeSelect = document.getElementById('tradeType');
  
  if (!stopLossInput || !takeProfitInput || !tradeTypeSelect) {
    return;
  }
  
  let bid, ask;
  
  // If prices are provided directly, use them
  if (bidPrice !== null && askPrice !== null) {
    bid = parseFloat(bidPrice);
    ask = parseFloat(askPrice);
  } else {
    // Otherwise, try to read from DOM
    const bidElement = document.getElementById('currentBid');
    const askElement = document.getElementById('currentAsk');
    
    if (!bidElement || !askElement) {
      return;
    }
    
    // Get price values from the display elements
    const bidText = bidElement.textContent;
    const askText = askElement.textContent;
    
    // Check if prices are valid (not loading, error, or dash)
    if (!bidText || !askText || bidText === '-' || askText === 'Loading...' || bidText === 'Error' || 
        askText === 'Loading...' || askText === 'Error') {
      return;
    }
    
    bid = parseFloat(bidText);
    ask = parseFloat(askText);
  }
  
  if (isNaN(bid) || isNaN(ask)) {
    return;
  }
  
  const tradeType = tradeTypeSelect.value;
  const PERCENTAGE = 0.03; // 3%
  
  let stopLoss, takeProfit;
  
  if (tradeType === 'BUY') {
    // For BUY: use ask price
    // Stop Loss: 3% below ask price
    stopLoss = ask * (1 - PERCENTAGE);
    // Take Profit: 3% above ask price
    takeProfit = ask * (1 + PERCENTAGE);
  } else {
    // For SELL: use bid price
    // Stop Loss: 3% above bid price
    stopLoss = bid * (1 + PERCENTAGE);
    // Take Profit: 3% below bid price
    takeProfit = bid * (1 - PERCENTAGE);
  }
  
  // Round to 5 decimal places
  stopLoss = Math.round(stopLoss * 100000) / 100000;
  takeProfit = Math.round(takeProfit * 100000) / 100000;
  
  // Check if fields are empty or zero (don't overwrite user input unless forceUpdate is true)
  const stopLossValue = stopLossInput.value.trim();
  const takeProfitValue = takeProfitInput.value.trim();
  
  // Set stop loss if field is empty, zero, or forceUpdate is true
  if (forceUpdate || !stopLossValue || stopLossValue === '0' || stopLossValue === '') {
    stopLossInput.value = stopLoss.toFixed(5);
    console.log(`Set default Stop Loss: ${stopLoss.toFixed(5)} (${tradeType}, ${tradeType === 'BUY' ? 'Ask' : 'Bid'}: ${tradeType === 'BUY' ? ask : bid})`);
  }
  
  // Set take profit if field is empty, zero, or forceUpdate is true
  if (forceUpdate || !takeProfitValue || takeProfitValue === '0' || takeProfitValue === '') {
    takeProfitInput.value = takeProfit.toFixed(5);
    console.log(`Set default Take Profit: ${takeProfit.toFixed(5)} (${tradeType}, ${tradeType === 'BUY' ? 'Ask' : 'Bid'}: ${tradeType === 'BUY' ? ask : bid})`);
  }
  
  // Show reminder after setting defaults
  showSlTpReminder();
}

// Show/hide the SL/TP reminder
function showSlTpReminder() {
  const reminder = document.getElementById('slTpReminder');
  if (!reminder) return;
  
  // Show the reminder
  reminder.style.display = 'block';
}

function hideSlTpReminder() {
  const reminder = document.getElementById('slTpReminder');
  if (!reminder) return;
  
  // Hide the reminder
  reminder.style.display = 'none';
}

function initializeSymbolInput() {
  const container = document.getElementById('symbolInputContainer');
  symbolInput = new SymbolInput(container, {
    placeholder: 'Enter symbol (e.g., EURUSD)',
    onSymbolSelect: (symbol, symbolData) => {
      updateCurrentPrice(symbol);
      
      // Set default volume from volume limit configuration
      setDefaultVolumeForSymbol(symbol);
      // Note: TP/SL are optional - no default values are set when price updates
    },
    onSymbolChange: (symbol) => {
      // Update market data display if needed
      if (symbol && symbol.length >= 6) {
        updateMarketDataPreview(symbol);
        updateCurrentPrice(symbol);
        
        // Set default volume from volume limit configuration
        setDefaultVolumeForSymbol(symbol);
        // setDefaultStopLossTakeProfit will be called automatically when price updates
        
        // Note: Removed automatic volume loss calculation to prevent immediate popup
        // Users can still calculate volume loss by changing volume or symbol values
      } else {
        hideCurrentPrice();
      }
    }
  });
  
  // Store globally for settings updates
  window.tradeSymbolInput = symbolInput;
  

  
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
      
      // Note: TP/SL are optional fields - no default values are set
      // Users can enter Stop Loss and Take Profit if desired, or leave them empty
      
      // Start auto-refresh if not already running
      startPriceAutoRefresh(symbol);
      
    } else {
      const errorMsg = result.data?.error || result.error || 'Failed to get price data';
      console.error(`❌ Price fetch failed for ${symbol}:`, {
        error: errorMsg,
        fullResponse: result,
        timestamp: new Date().toISOString()
      });
      
      showPriceError(`Failed: ${errorMsg}`);
      
      // Show user-friendly message
      showMessage(`Could not get price for ${symbol}: ${errorMsg}`, 'error');
    }
  } catch (error) {
    console.error(`❌ Exception getting current price for ${symbol}:`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    showPriceError('Error: ' + error.message);
    showMessage(`Price fetch error for ${symbol}: ${error.message}`, 'error');
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

// Position Tabs Management
function switchPositionsTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.positions-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.positions-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Map tab names to element IDs
  const tabIdMap = {
    'open': 'openPositionsTab',
    'pending': 'pendingOrdersTab',
    'closed': 'closedPositionsTab'
  };
  
  const tabId = tabIdMap[tabName] || `${tabName}PositionsTab`;
  document.getElementById(tabId).classList.add('active');
  
  // Refresh pending orders when switching to pending tab
  if (tabName === 'pending') {
    handleRefreshPendingOrders();
  }
  
  // Load closed positions if switching to closed tab
  if (tabName === 'closed') {
    handleRefreshClosedPositions();
  }
}

// Helper function to format time labels
function getTimeLabel(daysBack) {
  if (daysBack < 1) {
    const hours = Math.round(daysBack * 24);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return `${daysBack} day${daysBack > 1 ? 's' : ''}`;
  }
}

// Closed Positions Management
async function handleRefreshClosedPositions() {
  if (!isConnected) {
    document.getElementById('closedPositionsList').innerHTML = '<p class="no-data">Please connect to MT5 first</p>';
    return;
  }

  const daysBack = parseFloat(document.getElementById('closedPositionsDays').value);
  const container = document.getElementById('closedPositionsList');
  
  try {
    container.innerHTML = '<p class="no-data">Loading closed positions...</p>';
    
    const result = await window.mt5API.getClosedPositions(daysBack);
    
    if (result.success) {
      const closedPositions = result.data;
      
      if (!closedPositions || closedPositions.length === 0) {
        const timeLabel = getTimeLabel(daysBack);
        container.innerHTML = `<p class="no-data">No closed positions found in the last ${timeLabel}</p>`;
        return;
      }
      
      // Calculate summary statistics
      const totalProfit = closedPositions.reduce((sum, pos) => sum + pos.profit, 0);
      const profitableCount = closedPositions.filter(pos => pos.profit > 0).length;
      const winRate = ((profitableCount / closedPositions.length) * 100).toFixed(1);
      
      // Create summary header
      const summaryHtml = `
        <div class="closed-positions-summary">
          <div class="summary-item">
            <span class="summary-label">Total P&L:</span>
            <span class="summary-value ${totalProfit >= 0 ? 'positive' : 'negative'}">$${totalProfit.toFixed(2)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Trades:</span>
            <span class="summary-value">${closedPositions.length}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Win Rate:</span>
            <span class="summary-value">${winRate}%</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Winners:</span>
            <span class="summary-value positive">${profitableCount}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Losers:</span>
            <span class="summary-value negative">${closedPositions.length - profitableCount}</span>
          </div>
        </div>
      `;
      
      // Create position items
      const positionsHtml = closedPositions.map(pos => {
        const profitClass = pos.profit >= 0 ? 'profit' : 'loss';
        const profitSign = pos.profit >= 0 ? '+' : '';
        const openTime = new Date(pos.open_time).toLocaleString();
        const closeTime = new Date(pos.close_time).toLocaleString();
        
        return `
          <div class="closed-position-item ${profitClass}">
            <div class="closed-position-header">
              <div class="closed-position-symbol">${pos.symbol} ${pos.type}</div>
              <div class="closed-position-profit ${pos.profit >= 0 ? 'positive' : 'negative'}">
                ${profitSign}$${pos.profit.toFixed(2)}
              </div>
            </div>
            <div class="closed-position-details">
              <div>Ticket: ${pos.ticket}</div>
              <div>Volume: ${pos.volume}</div>
              <div>Duration: ${pos.duration_minutes}m</div>
              <div>Open: ${pos.open_price.toFixed(5)}</div>
              <div>Close: ${pos.close_price.toFixed(5)}</div>
              <div>Swap: $${pos.swap.toFixed(2)}</div>
              <div>Commission: $${pos.commission.toFixed(2)}</div>
            </div>
            <div class="closed-position-timing">
              <div>Opened: ${openTime}</div>
              <div>Closed: ${closeTime}</div>
              ${pos.comment ? `<div>Comment: ${pos.comment}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = summaryHtml + '<div class="positions-list">' + positionsHtml + '</div>';
      
      // Record balance snapshots for closed positions with profit
      // Only record if we don't already have recent entries for these tickets
      const accountResult = await window.mt5API.getAccountInfo();
      if (accountResult.success && accountResult.data) {
        // Record balance for each closed position (will skip duplicates)
        for (const pos of closedPositions) {
          await recordBalanceSnapshot(accountResult.data.balance, pos.ticket, pos.profit);
        }
      }
      
    } else {
      container.innerHTML = `<p class="no-data">Error loading closed positions: ${result.error}</p>`;
    }
    
  } catch (error) {
    console.error('Error loading closed positions:', error);
    container.innerHTML = `<p class="no-data">Error loading closed positions: ${error.message}</p>`;
  }
}

// Load general settings
async function loadGeneralSettings() {
  // Load simulator mode settings
  await loadSimulatorSettings();
}

// Simulator Mode Functions
async function loadSimulatorSettings() {
  try {
    if (!isConnected) {
      return;
    }
    
    const result = await window.mt5API.getSimulatorStatus();
    if (result.success) {
      const status = result.data;
      const simulatorMode = status.simulator_mode;
      
      // Update dropdown
      document.getElementById('settingsSimulatorMode').value = simulatorMode ? 'true' : 'false';
      
      // Show/hide status section
      const statusSection = document.getElementById('simulatorStatus');
      if (simulatorMode) {
        statusSection.style.display = 'block';
        
        // Update status display
        document.getElementById('simPositionsCount').textContent = status.positions_count || 0;
        document.getElementById('simClosedCount').textContent = status.closed_positions_count || 0;
        
        if (status.account_summary) {
          document.getElementById('simBalance').textContent = `$${status.account_summary.balance.toFixed(2)}`;
          document.getElementById('simEquity').textContent = `$${status.account_summary.equity.toFixed(2)}`;
          document.getElementById('simProfit').textContent = `$${status.account_summary.profit.toFixed(2)}`;
        }
        
        // Show simulator indicator
        showSimulatorIndicator();
        
        // Update canvas indicator
        if (nodeEditor) {
          nodeEditor.setSimulatorMode(true);
        }
      } else {
        statusSection.style.display = 'none';
        hideSimulatorIndicator();
        
        // Update canvas indicator
        if (nodeEditor) {
          nodeEditor.setSimulatorMode(false);
        }
      }
    }
  } catch (error) {
    console.error('Error loading simulator settings:', error);
  }
}

function showSimulatorIndicator() {
  // No-op: simulator mode badge removed per request
}

// Check simulator mode from settings file and show UI if enabled
async function checkAndShowSimulatorModeFromSettings() {
  try {
    // Check settings file directly
    if (window.electronAPI && window.electronAPI.loadSettings) {
      const settings = await window.electronAPI.loadSettings('app_settings.json');
      if (settings && settings.simulatorMode === true) {
        // Simulator mode is enabled in settings, show UI elements
        const statusSection = document.getElementById('simulatorStatus');
        if (statusSection) {
          statusSection.style.display = 'block';
        }
        
        // Update dropdown
        const dropdown = document.getElementById('settingsSimulatorMode');
        if (dropdown) {
          dropdown.value = 'true';
        }
        
        // Update canvas indicator
        if (nodeEditor) {
          nodeEditor.setSimulatorMode(true);
        }
        
        // If connected, load full simulator status
        if (isConnected) {
          await loadSimulatorSettings();
        }
      }
    }
  } catch (error) {
    console.error('Error checking simulator mode from settings:', error);
  }
}

function hideSimulatorIndicator() {
  const indicator = document.getElementById('simulatorModeIndicator');
  if (indicator) {
    indicator.remove();
  }
}

async function toggleSimulatorMode(enabled) {
  try {
    const result = await window.mt5API.toggleSimulatorMode(enabled);
    if (result.success) {
      showMessage(result.data.message, 'success');
      await loadSimulatorSettings();
      
      // Refresh account and positions to show simulator data
      if (isConnected) {
        await handleRefreshAccount();
        await handleRefreshPositions();
      }
    } else {
      showMessage('Failed to toggle simulator mode: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error toggling simulator mode:', error);
    showMessage('Error toggling simulator mode: ' + error.message, 'error');
  }
}

// Toggle simulator mode via hotkey (Ctrl+Shift+S)
async function toggleSimulatorModeHotkey() {
  try {
    let currentMode = false;
    let gotStatusFromAPI = false;
    
    // Try to get current simulator mode status from API (if connected)
    if (isConnected) {
      try {
        const result = await window.mt5API.getSimulatorStatus();
        if (result.success) {
          currentMode = result.data.simulator_mode;
          gotStatusFromAPI = true;
        }
      } catch (apiError) {
        // API call failed, fall through to settings file check
        console.log('Could not get simulator status from API, checking settings file');
      }
    }
    
    // If not connected or API failed, check settings file
    if (!gotStatusFromAPI) {
      if (window.electronAPI && window.electronAPI.loadSettings) {
        try {
          const settings = await window.electronAPI.loadSettings('app_settings.json');
          currentMode = settings && settings.simulatorMode === true;
        } catch (settingsError) {
          console.error('Error reading settings file:', settingsError);
        }
      }
    }
    
    // Toggle to opposite mode
    if (isConnected) {
      await toggleSimulatorMode(!currentMode);
    } else {
      // If not connected, we can still update the settings file
      // but show a message that connection is needed for full functionality
      if (window.electronAPI && window.electronAPI.loadSettings && window.electronAPI.saveSettings) {
        const settings = await window.electronAPI.loadSettings('app_settings.json') || {};
        settings.simulatorMode = !currentMode;
        await window.electronAPI.saveSettings('app_settings.json', settings);
        showMessage(
          `Simulator mode ${!currentMode ? 'ENABLED' : 'DISABLED'} in settings. Connect to MT5 to activate.`,
          'info'
        );
      } else {
        showMessage('Please connect to MT5 to toggle simulator mode', 'warning');
      }
    }
  } catch (error) {
    console.error('Error toggling simulator mode via hotkey:', error);
    showMessage('Error toggling simulator mode: ' + error.message, 'error');
  }
}

// Toggle light mode theme
function toggleLightMode(enabled, showNotification = false) {
  if (enabled) {
    document.body.classList.add('light-mode');
    if (showNotification) {
      showMessage('🌞 Light mode activated for simulator', 'info');
    }
  } else {
    document.body.classList.remove('light-mode');
    if (showNotification) {
      showMessage('🌙 Dark mode restored', 'info');
    }
  }
}

async function resetSimulator() {
  const balance = parseFloat(document.getElementById('resetSimulatorBalance').value) || 10000;
  
  showConfirmation(
    'Reset Simulator',
    `Are you sure you want to reset the simulator? This will:\n\n• Close all simulated positions\n• Reset balance to $${balance.toFixed(2)}\n• Clear all trade history\n\nThis action cannot be undone.`,
    async () => {
      try {
        const result = await window.mt5API.resetSimulator(balance);
        if (result.success) {
          showMessage(result.data.message, 'success');
          await loadSimulatorSettings();
          
          // Refresh displays
          if (isConnected) {
            await handleRefreshAccount();
            await handleRefreshPositions();
          }
        } else {
          showMessage('Failed to reset simulator: ' + result.error, 'error');
        }
      } catch (error) {
        console.error('Error resetting simulator:', error);
        showMessage('Error resetting simulator: ' + error.message, 'error');
      }
    }
  );
}

async function handleExecuteTrade() {
  const symbol = symbolInput.getValue();
  const type = document.getElementById('tradeType').value;
  const executionType = document.getElementById('executionType').value;
  const volume = parseFloat(document.getElementById('tradeVolume').value);
  const limitPrice = executionType === 'LIMIT' ? parseFloat(document.getElementById('limitPrice').value) : null;
  // Stop Loss and Take Profit are now set in the confirmation modal, not here
  const stopLoss = 0;
  const takeProfit = 0;
  
  
  if (!symbol) {
    showMessage('Please enter a symbol', 'error');
    return;
  }
  
  if (!volume || volume <= 0) {
    showMessage('Please enter a valid volume', 'error');
    return;
  }
  
  // Validate limit price if limit order
  if (executionType === 'LIMIT') {
    if (!limitPrice || limitPrice <= 0) {
      showMessage('Please enter a valid limit price', 'error');
      return;
    }
    
    // Get current prices for validation
    try {
      const result = await window.mt5API.getMarketData(symbol);
      if (result.success && result.data && result.data.bid && result.data.ask) {
        if (type === 'BUY' && limitPrice >= result.data.ask) {
          showMessage('For BUY limit orders, the limit price must be below the current ask price', 'error');
          return;
        }
        if (type === 'SELL' && limitPrice <= result.data.bid) {
          showMessage('For SELL limit orders, the limit price must be above the current bid price', 'error');
          return;
        }
      }
    } catch (error) {
      console.error('Error validating limit price:', error);
      // Continue anyway - backend will validate
    }
  }
  
  // Note: TP/SL are set in the confirmation modal, not in the initial trade modal

  // Check volume control before proceeding
  if (window.volumeControl && window.volumeControl.settings.enabled) {
    const volumeResult = await window.volumeControl.validateTradeVolume(symbol, volume);
    
    if (!volumeResult.allowed) {
      if (volumeResult.cancelled) {
        showMessage('Trade cancelled', 'info');
        return;
      }
    } else if (volumeResult.adjustedVolume) {
      // User chose to use the maximum allowed volume
      document.getElementById('tradeVolume').value = volumeResult.adjustedVolume;
      showMessage(`Volume adjusted to maximum allowed: ${volumeResult.adjustedVolume}`, 'info');
      // Update the volume variable for the trade
      const adjustedVolume = volumeResult.adjustedVolume;
      // Continue with adjusted volume
      return handleExecuteTradeWithVolume(symbol, type, executionType, limitPrice, adjustedVolume, stopLoss, takeProfit);
    }
  }

  // Check overtrade control before proceeding
  const tradeData = { symbol, type, volume, stopLoss, takeProfit, action: 'executeOrder' };
  const shouldProceed = await window.overtradeControl.checkBeforeTrade('manual', tradeData);
  
  if (!shouldProceed) {
    showMessage('Trade cancelled', 'info');
    return;
  }
  
  // Show confirmation dialog
  showTradeConfirmationModal(symbol, type, executionType, limitPrice, volume, stopLoss, takeProfit);
}

// Helper function to execute trade with specific volume (used for volume adjustments)
async function handleExecuteTradeWithVolume(symbol, type, executionType, limitPrice, volume, stopLoss, takeProfit) {
  // Check overtrade control before proceeding
  const tradeData = { symbol, type, volume, stopLoss, takeProfit, action: 'executeOrder' };
  const shouldProceed = await window.overtradeControl.checkBeforeTrade('manual', tradeData);
  
  if (!shouldProceed) {
    showMessage('Trade cancelled', 'info');
    return;
  }
  
  // Show confirmation dialog
  showTradeConfirmationModal(symbol, type, executionType, limitPrice, volume, stopLoss, takeProfit);
}

// Store trade data for confirmation
let pendingTradeData = null;
let tradeChartInstance = null;
let modifyChartInstance = null;
// Store chart image paths and trade details mapped by ticket
let chartImagePaths = {};
let tradeJournal = {}; // Stores full trade details: { ticket: { imagePath, symbol, type, volume, stopLoss, takeProfit, timestamp, ticket } }
let balanceHistory = []; // Stores balance over time: [{ timestamp, balance, ticket?, profit? }]

// Load chart image paths and trade journal from storage
async function loadChartImagePaths() {
  try {
    if (window.electronAPI && window.electronAPI.loadSettings) {
      // Load legacy chart_images.json for backward compatibility
      const legacyData = await window.electronAPI.loadSettings('chart_images.json');
      if (legacyData) {
        chartImagePaths = legacyData;
        // Migrate legacy data to new format
        for (const [ticket, imagePath] of Object.entries(legacyData)) {
          if (!tradeJournal[ticket]) {
            tradeJournal[ticket] = { imagePath, ticket: parseInt(ticket) };
          }
        }
      }
      
      // Load trade journal
      const journalData = await window.electronAPI.loadSettings('trade_journal.json');
      if (journalData) {
        tradeJournal = journalData;
        // Update chartImagePaths from journal
        for (const [ticket, trade] of Object.entries(tradeJournal)) {
          if (trade.imagePath) {
            chartImagePaths[ticket] = trade.imagePath;
          }
        }
      }
      
      // Load balance history
      const balanceData = await window.electronAPI.loadSettings('balance_history.json');
      if (balanceData && Array.isArray(balanceData)) {
        balanceHistory = balanceData;
      }
    }
  } catch (error) {
    console.error('Error loading chart image paths:', error);
    chartImagePaths = {};
    tradeJournal = {};
    balanceHistory = [];
  }
}

// Save trade journal to storage
async function saveTradeJournal() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      await window.electronAPI.saveSettings('trade_journal.json', tradeJournal);
      // Also save legacy format for backward compatibility
      await window.electronAPI.saveSettings('chart_images.json', chartImagePaths);
    }
  } catch (error) {
    console.error('Error saving trade journal:', error);
  }
}

// Save balance history to storage
async function saveBalanceHistory() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      await window.electronAPI.saveSettings('balance_history.json', balanceHistory);
    }
  } catch (error) {
    console.error('Error saving balance history:', error);
  }
}

// Record balance snapshot
async function recordBalanceSnapshot(balance, ticket = null, profit = null) {
  // Prevent duplicates: if we have a recent entry with the same ticket and similar timestamp, skip
  if (ticket !== null) {
    const recentEntry = balanceHistory.find(h => 
      h.ticket === ticket && 
      Math.abs(new Date(h.timestamp).getTime() - Date.now()) < 60000 // Within 1 minute
    );
    if (recentEntry) {
      // Update existing entry with profit if we have it
      if (profit !== null && recentEntry.profit === null) {
        recentEntry.profit = profit;
        recentEntry.balance = balance; // Update balance too
        await saveBalanceHistory();
      }
      return; // Skip duplicate
    }
  }
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    balance: balance,
    ticket: ticket,
    profit: profit
  };
  balanceHistory.push(snapshot);
  // Keep only last 1000 entries to prevent excessive storage
  if (balanceHistory.length > 1000) {
    balanceHistory = balanceHistory.slice(-1000);
  }
  await saveBalanceHistory();
}

// Open chart image for a position
async function openChartImage(ticket) {
  const imagePath = chartImagePaths[ticket];
  if (!imagePath) {
    showMessage('No chart image found for this position', 'warning');
    return;
  }
  
  try {
    if (window.electronAPI && window.electronAPI.openPath) {
      const result = await window.electronAPI.openPath(imagePath);
      if (!result.success) {
        showMessage('Failed to open chart image: ' + result.error, 'error');
      }
    } else {
      showMessage('Unable to open chart image - API not available', 'error');
    }
  } catch (error) {
    console.error('Error opening chart image:', error);
    showMessage('Error opening chart image: ' + error.message, 'error');
  }
}

// Make openChartImage globally accessible
window.openChartImage = openChartImage;

// Function to fetch 6 months of daily data from MT5
async function fetchThreeMonthDailyData(symbol) {
  try {
    if (!window.mt5API || !isConnected) {
      throw new Error('Not connected to MT5');
    }

    // Calculate date range: 6 months ago to today
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    
    // Set time to start/end of day for proper date range
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Format dates as ISO strings for MT5 API
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    console.log(`Fetching 6 months of daily data for ${symbol} from ${startDateStr} to ${endDateStr}`);

    // Fetch historical data with D1 (daily) timeframe
    const params = {
      symbol,
      timeframe: 'D1', // Daily timeframe
      startDate: startDateStr,
      endDate: endDateStr,
      bars: null // No specific bar count, use date range
    };
    
    const result = await window.mt5API.getHistoricalData(params);

    if (result.success && result.data && !result.data.error && result.data.data) {
      return result.data.data;
    } else {
      throw new Error(result.data?.error || 'Failed to fetch historical data');
    }
  } catch (error) {
    console.error('Error fetching 6-month daily data:', error);
    throw error;
  }
}

// Function to plot the 6-month daily chart
function plotThreeMonthChart(symbol, data) {
  try {
    // Check if Chart.js and financial chart plugin are available
    if (typeof Chart === 'undefined') {
      throw new Error('Chart.js library is not loaded');
    }
    if (typeof Chart.controllers.candlestick === 'undefined') {
      console.warn('Financial chart plugin not loaded, falling back to basic chart');
    }

    // Destroy existing chart if it exists
    if (tradeChartInstance) {
      try {
        tradeChartInstance.destroy();
      } catch (e) {
        console.warn('Error destroying existing chart:', e);
      }
      tradeChartInstance = null;
    }

    // Get chart elements
    const chartLoading = document.getElementById('chartLoading');
    const chartError = document.getElementById('chartError');
    const chartCanvas = document.getElementById('tradeChart');
    
    if (!chartCanvas) {
      throw new Error('Chart canvas element not found');
    }

    // Hide loading and error, show chart
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartError) chartError.style.display = 'none';
    chartCanvas.style.display = 'block';

    // Ensure canvas has proper dimensions
    const canvasContainer = chartCanvas.parentElement;
    if (canvasContainer) {
      const containerWidth = canvasContainer.clientWidth || 800;
      const containerHeight = canvasContainer.clientHeight || 500;
      chartCanvas.width = containerWidth;
      chartCanvas.height = containerHeight;
    } else {
      chartCanvas.width = 800;
      chartCanvas.height = 500;
    }

    // Validate data
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No chart data available');
    }

    // Prepare OHLC data for candlestick chart
    const candlestickData = data.map(item => {
      const time = new Date(item.time).getTime();
      return {
        x: time,
        o: parseFloat(item.open),
        h: parseFloat(item.high),
        l: parseFloat(item.low),
        c: parseFloat(item.close)
      };
    }).filter(item => !isNaN(item.o) && !isNaN(item.h) && !isNaN(item.l) && !isNaN(item.c));

    // Prepare volume data
    const volumeData = data.map(item => {
      const time = new Date(item.time).getTime();
      const volume = parseFloat(item.tick_volume || 0);
      return {
        x: time,
        y: volume
      };
    }).filter(item => !isNaN(item.y));

    // Calculate max volume for scaling
    const maxVolume = Math.max(...volumeData.map(v => v.y));

    // Get current price for reference
    const currentPrice = candlestickData.length > 0 ? candlestickData[candlestickData.length - 1].c : 0;

    // Create chart
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Determine price decimals
    const avgPrice = candlestickData.reduce((sum, d) => sum + d.c, 0) / candlestickData.length;
    const priceDecimals = avgPrice >= 1000 ? 2 : avgPrice >= 10 ? 3 : 5;

    tradeChartInstance = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: symbol,
            data: candlestickData,
            borderColor: 'rgba(255, 255, 255, 0.8)',
            color: {
              up: 'rgba(38, 166, 154, 0.9)',    // Teal/green for bullish
              down: 'rgba(239, 83, 80, 0.9)',   // Red for bearish
              unchanged: 'rgba(158, 158, 158, 0.9)'
            },
            borderWidth: 1.5,
            barThickness: 'flex',
            maxBarThickness: 8,
            yAxisID: 'y-price'
          },
          {
            label: 'Volume',
            data: volumeData,
            type: 'bar',
            backgroundColor: volumeData.map((v, i) => {
              if (i === 0) return 'rgba(158, 158, 158, 0.3)';
              const prevClose = candlestickData[i - 1]?.c;
              const currClose = candlestickData[i]?.c;
              if (currClose > prevClose) {
                return 'rgba(38, 166, 154, 0.3)'; // Green volume
              } else {
                return 'rgba(239, 83, 80, 0.3)';  // Red volume
              }
            }),
            borderWidth: 0,
            yAxisID: 'y-volume',
            barPercentage: 0.8,
            categoryPercentage: 1.0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 10,
            right: 25,
            top: 10,
            bottom: 10
          }
        },
        plugins: {
          title: {
            display: true,
            text: `${symbol} - 6 Month Daily Chart (Candlestick)`,
            color: '#e0e0e0',
            font: {
              size: 16,
              weight: 'bold',
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            padding: {
              top: 5,
              bottom: 15
            }
          },
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: '#b0b0b0',
              usePointStyle: true,
              padding: 15,
              font: {
                size: 11,
                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              },
              filter: function(item) {
                return item.text !== 'Volume'; // Hide volume from legend
              }
            }
          },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(17, 17, 17, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e0e0e0',
            borderColor: '#444',
            borderWidth: 1,
            padding: 12,
            titleFont: {
              size: 13,
              weight: 'bold',
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            bodyFont: {
              size: 12,
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            displayColors: false,
            callbacks: {
              title: function(context) {
                if (context[0] && context[0].raw && context[0].raw.x) {
                  const date = new Date(context[0].raw.x);
                  return date.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  });
                }
                return '';
              },
              label: function(context) {
                const dataPoint = context.raw;
                if (context.datasetIndex === 0 && dataPoint.o !== undefined) {
                  // Candlestick data
                  const change = dataPoint.c - dataPoint.o;
                  const changePercent = ((change / dataPoint.o) * 100).toFixed(2);
                  const changeSymbol = change >= 0 ? '▲' : '▼';
                  const changeColor = change >= 0 ? '🟢' : '🔴';
                  
                  return [
                    `${changeColor} ${changeSymbol} ${Math.abs(changePercent)}%`,
                    `Open:  ${dataPoint.o.toFixed(priceDecimals)}`,
                    `High:  ${dataPoint.h.toFixed(priceDecimals)}`,
                    `Low:   ${dataPoint.l.toFixed(priceDecimals)}`,
                    `Close: ${dataPoint.c.toFixed(priceDecimals)}`
                  ];
                } else if (context.datasetIndex === 1) {
                  // Volume data
                  return `Volume: ${Math.round(dataPoint.y).toLocaleString()}`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM d',
                week: 'MMM d',
                month: 'MMM yyyy'
              },
              tooltipFormat: 'MMM d, yyyy'
            },
            ticks: {
              color: '#888',
              maxRotation: 0,
              autoSkipPadding: 15,
              font: {
                size: 10,
                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              }
            },
            grid: {
              display: false,
              drawBorder: true,
              borderColor: '#333'
            }
          },
          'y-price': {
            type: 'linear',
            position: 'right',
            ticks: {
              color: '#888',
              font: {
                size: 10,
                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              },
              callback: function(value) {
                return value.toFixed(priceDecimals);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.06)',
              drawBorder: true,
              borderColor: '#333'
            }
          },
          'y-volume': {
            type: 'linear',
            position: 'right',
            display: false,
            max: maxVolume * 4, // Scale volume to 25% of chart height
            min: 0,
            grid: {
              display: false
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        animation: {
          duration: 400
        }
      }
    });

    console.log(`Candlestick chart plotted successfully with ${candlestickData.length} candles for ${symbol}`);
  } catch (error) {
    console.error('Error plotting chart:', error);
    const chartLoading = document.getElementById('chartLoading');
    const chartError = document.getElementById('chartError');
    const chartCanvas = document.getElementById('tradeChart');
    
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartError) {
      chartError.style.display = 'block';
      chartError.textContent = `Failed to plot chart: ${error.message}`;
    }
    if (chartCanvas) chartCanvas.style.display = 'none';
  }
}

// Function to load and display the 6-month chart
async function loadThreeMonthChart(symbol) {
  const chartLoading = document.getElementById('chartLoading');
  const chartError = document.getElementById('chartError');
  const chartCanvas = document.getElementById('tradeChart');

  // Validate elements exist
  if (!chartLoading || !chartError || !chartCanvas) {
    console.error('Chart elements not found in DOM');
    return;
  }

  // Show loading state
  chartLoading.style.display = 'block';
  chartError.style.display = 'none';
  chartCanvas.style.display = 'none';

  // Check if Chart.js is available
  if (typeof Chart === 'undefined') {
    chartLoading.style.display = 'none';
    chartError.style.display = 'block';
    chartError.textContent = 'Chart.js library is not loaded. Please refresh the page.';
    return;
  }

  try {
    // Validate symbol
    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      throw new Error('Invalid symbol');
    }

    // Fetch chart data
    const data = await fetchThreeMonthDailyData(symbol);
    
    if (data && Array.isArray(data) && data.length > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        plotThreeMonthChart(symbol, data);
      }, 100);
    } else {
      throw new Error('No chart data received from MT5');
    }
  } catch (error) {
    console.error('Error loading chart:', error);
    chartLoading.style.display = 'none';
    chartError.style.display = 'block';
    chartError.textContent = `Failed to load chart: ${error.message}`;
    chartCanvas.style.display = 'none';
  }
}

// Function to load chart for modify pending order modal
async function loadModifyPendingOrderChart(symbol) {
  const chartLoading = document.getElementById('modifyPendingOrderChartLoading');
  const chartError = document.getElementById('modifyPendingOrderChartError');
  const chartCanvas = document.getElementById('modifyPendingOrderChart');

  // Validate elements exist
  if (!chartLoading || !chartError || !chartCanvas) {
    console.error('Chart elements not found in DOM for modify pending order modal');
    return;
  }

  // Show loading state
  chartLoading.style.display = 'block';
  chartError.style.display = 'none';
  chartCanvas.style.display = 'none';

  // Check if Chart.js is available
  if (typeof Chart === 'undefined') {
    chartLoading.style.display = 'none';
    chartError.style.display = 'block';
    chartError.textContent = 'Chart.js library is not loaded. Please refresh the page.';
    return;
  }

  try {
    // Validate symbol
    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      throw new Error('Invalid symbol');
    }

    // Fetch chart data
    const data = await fetchThreeMonthDailyData(symbol);
    
    if (data && Array.isArray(data) && data.length > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        plotModifyPendingOrderChart(symbol, data);
      }, 100);
    } else {
      throw new Error('No chart data received from MT5');
    }
  } catch (error) {
    console.error('Error loading chart for modify pending order:', error);
    chartLoading.style.display = 'none';
    chartError.style.display = 'block';
    chartError.textContent = `Failed to load chart: ${error.message}`;
    chartCanvas.style.display = 'none';
  }
}

// Function to plot the chart for modify pending order modal
function plotModifyPendingOrderChart(symbol, data) {
  try {
    // Check if Chart.js and financial chart plugin are available
    if (typeof Chart === 'undefined') {
      throw new Error('Chart.js library is not loaded');
    }
    if (typeof Chart.controllers.candlestick === 'undefined') {
      console.warn('Financial chart plugin not loaded, falling back to basic chart');
    }

    // Destroy existing chart if it exists
    if (modifyChartInstance) {
      try {
        modifyChartInstance.destroy();
      } catch (e) {
        console.warn('Error destroying existing modify chart:', e);
      }
      modifyChartInstance = null;
    }

    // Get chart elements
    const chartLoading = document.getElementById('modifyPendingOrderChartLoading');
    const chartError = document.getElementById('modifyPendingOrderChartError');
    const chartCanvas = document.getElementById('modifyPendingOrderChart');
    
    if (!chartCanvas) {
      throw new Error('Chart canvas element not found');
    }

    // Hide loading and error, show chart
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartError) chartError.style.display = 'none';
    chartCanvas.style.display = 'block';

    // Ensure canvas has proper dimensions
    const canvasContainer = chartCanvas.parentElement;
    if (canvasContainer) {
      const containerWidth = canvasContainer.clientWidth || 800;
      const containerHeight = canvasContainer.clientHeight || 500;
      chartCanvas.width = containerWidth;
      chartCanvas.height = containerHeight;
    } else {
      chartCanvas.width = 800;
      chartCanvas.height = 500;
    }

    // Validate data
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No chart data available');
    }

    // Prepare OHLC data for candlestick chart
    const candlestickData = data.map(item => {
      const time = new Date(item.time).getTime();
      return {
        x: time,
        o: parseFloat(item.open),
        h: parseFloat(item.high),
        l: parseFloat(item.low),
        c: parseFloat(item.close)
      };
    }).filter(item => !isNaN(item.o) && !isNaN(item.h) && !isNaN(item.l) && !isNaN(item.c));

    // Prepare volume data
    const volumeData = data.map(item => {
      const time = new Date(item.time).getTime();
      const volume = parseFloat(item.tick_volume || 0);
      return {
        x: time,
        y: volume
      };
    }).filter(item => !isNaN(item.y));

    // Calculate max volume for scaling
    const maxVolume = Math.max(...volumeData.map(v => v.y));

    // Get current price for reference
    const currentPrice = candlestickData.length > 0 ? candlestickData[candlestickData.length - 1].c : 0;

    // Create chart
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Determine price decimals
    const avgPrice = candlestickData.reduce((sum, d) => sum + d.c, 0) / candlestickData.length;
    const priceDecimals = avgPrice >= 1000 ? 2 : avgPrice >= 10 ? 3 : 5;

    modifyChartInstance = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: symbol,
            data: candlestickData,
            borderColor: 'rgba(255, 255, 255, 0.8)',
            color: {
              up: 'rgba(38, 166, 154, 0.9)',    // Teal/green for bullish
              down: 'rgba(239, 83, 80, 0.9)',   // Red for bearish
              unchanged: 'rgba(158, 158, 158, 0.9)'
            },
            borderWidth: 1.5,
            barThickness: 'flex',
            maxBarThickness: 8,
            yAxisID: 'y-price'
          },
          {
            label: 'Volume',
            data: volumeData,
            type: 'bar',
            backgroundColor: volumeData.map((v, i) => {
              if (i === 0) return 'rgba(158, 158, 158, 0.3)';
              const prevClose = candlestickData[i - 1]?.c;
              const currClose = candlestickData[i]?.c;
              if (currClose > prevClose) {
                return 'rgba(38, 166, 154, 0.3)'; // Green volume
              } else if (currClose < prevClose) {
                return 'rgba(239, 83, 80, 0.3)'; // Red volume
              } else {
                return 'rgba(158, 158, 158, 0.3)'; // Gray volume
              }
            }),
            borderColor: 'rgba(158, 158, 158, 0.5)',
            borderWidth: 0.5,
            yAxisID: 'y-volume'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#e0e0e0',
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            titleColor: '#e0e0e0',
            bodyColor: '#e0e0e0',
            borderColor: '#555',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 0) {
                  // Candlestick data
                  const point = context.raw;
                  return [
                    `Open: ${point.o.toFixed(priceDecimals)}`,
                    `High: ${point.h.toFixed(priceDecimals)}`,
                    `Low: ${point.l.toFixed(priceDecimals)}`,
                    `Close: ${point.c.toFixed(priceDecimals)}`
                  ];
                } else {
                  // Volume data
                  return `Volume: ${context.parsed.y.toLocaleString()}`;
                }
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM dd'
              }
            },
            ticks: {
              color: '#999',
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
              drawBorder: false
            }
          },
          'y-price': {
            type: 'linear',
            position: 'left',
            ticks: {
              color: '#e0e0e0',
              callback: function(value) {
                return value.toFixed(priceDecimals);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
              drawBorder: false
            },
            title: {
              display: true,
              text: 'Price',
              color: '#e0e0e0'
            }
          },
          'y-volume': {
            type: 'linear',
            position: 'right',
            ticks: {
              color: '#999',
              callback: function(value) {
                if (value >= 1000000) {
                  return (value / 1000000).toFixed(1) + 'M';
                } else if (value >= 1000) {
                  return (value / 1000).toFixed(1) + 'K';
                }
                return value.toLocaleString();
              },
              max: maxVolume * 3 // Scale volume axis
            },
            grid: {
              display: false,
              drawBorder: false
            },
            title: {
              display: true,
              text: 'Volume',
              color: '#999'
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        }
      }
    });

    console.log('Modify pending order chart created successfully');
  } catch (error) {
    console.error('Error plotting modify pending order chart:', error);
    const chartLoading = document.getElementById('modifyPendingOrderChartLoading');
    const chartError = document.getElementById('modifyPendingOrderChartError');
    const chartCanvas = document.getElementById('modifyPendingOrderChart');
    
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartError) {
      chartError.style.display = 'block';
      chartError.textContent = `Chart error: ${error.message}`;
    }
    if (chartCanvas) chartCanvas.style.display = 'none';
  }
}

async function updateConfirmationModalPrice(symbol, type) {
  const priceElement = document.getElementById('confirmTradeCurrentPrice');
  if (!priceElement) return;
  
  // Show loading state
  priceElement.textContent = 'Loading...';
  
  try {
    if (!window.mt5API || !window.mt5API.getMarketData) {
      priceElement.textContent = 'N/A';
      return;
    }
    
    const result = await window.mt5API.getMarketData(symbol);
    
    if (result.success && result.data) {
      const data = result.data;
      const isBuy = type.toUpperCase() === 'BUY';
      
      // For BUY orders, show ASK price (what you pay to buy)
      // For SELL orders, show BID price (what you get when selling)
      const relevantPrice = isBuy ? data.ask : data.bid;
      const priceLabel = isBuy ? 'ASK' : 'BID';
      
      // Format price with appropriate decimal places
      const formattedPrice = relevantPrice.toFixed(5);
      
      // Display: "ASK: 2,345.67" or "BID: 2,345.67"
      priceElement.textContent = `${priceLabel}: ${formattedPrice}`;
      priceElement.style.color = isBuy ? '#4CAF50' : '#f44336';
    } else {
      const errorMsg = result.data?.error || result.error || 'Failed to get price';
      priceElement.textContent = `Error: ${errorMsg}`;
      priceElement.style.color = '#f44336';
    }
  } catch (error) {
    console.error('Error fetching current price for confirmation modal:', error);
    priceElement.textContent = 'Error loading price';
    priceElement.style.color = '#f44336';
  }
}

function showTradeConfirmationModal(symbol, type, executionType, limitPrice, volume, stopLoss, takeProfit) {
  // Store the trade data
  pendingTradeData = { symbol, type, executionType, limitPrice, volume, stopLoss, takeProfit };
  
  // Update confirmation modal content
  document.getElementById('confirmTradeSymbol').textContent = symbol;
  
  const tradeTypeElement = document.getElementById('confirmTradeType');
  let tradeTypeText = type.toUpperCase();
  if (executionType === 'LIMIT') {
    tradeTypeText += ' LIMIT';
  }
  tradeTypeElement.textContent = tradeTypeText;
  
  // Add dynamic styling for BUY/SELL
  tradeTypeElement.className = 'value trade-type';
  if (type.toUpperCase() === 'BUY') {
    tradeTypeElement.style.backgroundColor = '#4CAF50';
    tradeTypeElement.style.color = 'white';
  } else {
    tradeTypeElement.style.backgroundColor = '#f44336';
    tradeTypeElement.style.color = 'white';
  }
  
  document.getElementById('confirmTradeVolume').textContent = volume;
  
  // Show limit price if it's a limit order
  const confirmTradeCurrentPrice = document.getElementById('confirmTradeCurrentPrice');
  const priceItem = confirmTradeCurrentPrice ? confirmTradeCurrentPrice.closest('.confirmation-item') : null;
  const priceLabel = priceItem ? priceItem.querySelector('.label') : null;
  
  if (executionType === 'LIMIT' && limitPrice && confirmTradeCurrentPrice && priceLabel) {
    priceLabel.textContent = 'Limit Price:';
    confirmTradeCurrentPrice.textContent = limitPrice.toFixed(5);
    confirmTradeCurrentPrice.style.color = '#FFA500';
  } else if (confirmTradeCurrentPrice && priceLabel) {
    priceLabel.textContent = 'Current Price:';
    if (executionType === 'MARKET') {
      confirmTradeCurrentPrice.textContent = 'Loading...';
    }
    confirmTradeCurrentPrice.style.color = '';
  }
  
  // Set input values for Stop Loss and Take Profit (editable in confirmation modal)
  // Use values from initial modal if provided, otherwise leave empty for user to enter
  const confirmStopLossInput = document.getElementById('confirmTradeStopLoss');
  const confirmTakeProfitInput = document.getElementById('confirmTradeTakeProfit');
  if (confirmStopLossInput) confirmStopLossInput.value = (stopLoss && stopLoss > 0) ? stopLoss : '';
  if (confirmTakeProfitInput) confirmTakeProfitInput.value = (takeProfit && takeProfit > 0) ? takeProfit : '';
  
  // Hide trade modal and show confirmation
  hideTradeModal();
  document.getElementById('tradeConfirmationModal').classList.add('show');
  
  // Fetch and display current price (only for market orders)
  if (executionType === 'MARKET') {
    updateConfirmationModalPrice(symbol, type);
  }
  
  // Load and display the 6-month daily chart
  loadThreeMonthChart(symbol);
}

function hideTradeConfirmationModal(showTradeModalOnCancel = false) {
  document.getElementById('tradeConfirmationModal').classList.remove('show');
  pendingTradeData = null;
  
  // Destroy chart instance when modal is closed
  if (tradeChartInstance) {
    tradeChartInstance.destroy();
    tradeChartInstance = null;
  }
  
  // Reset chart UI elements
  document.getElementById('chartLoading').style.display = 'block';
  document.getElementById('chartError').style.display = 'none';
  document.getElementById('tradeChart').style.display = 'none';
  
  // Show the trade modal (first page) when canceling
  if (showTradeModalOnCancel) {
    showTradeModal();
  }
}

async function confirmTradeExecution() {
  
  if (!pendingTradeData) {
    console.error('No pending trade data found!');
    showMessage('No pending trade to execute - please try again', 'error');
    hideTradeConfirmationModal();
    return;
  }
  
  // Read Stop Loss and Take Profit from confirmation modal input fields
  // Allow empty values - they will be treated as 0 (no SL/TP)
  const confirmStopLossInput = document.getElementById('confirmTradeStopLoss').value.trim();
  const confirmTakeProfitInput = document.getElementById('confirmTradeTakeProfit').value.trim();
  const stopLoss = confirmStopLossInput === '' ? 0 : (parseFloat(confirmStopLossInput) || 0);
  const takeProfit = confirmTakeProfitInput === '' ? 0 : (parseFloat(confirmTakeProfitInput) || 0);
  
  // Update pendingTradeData with the values from confirmation modal
  const { symbol, type, executionType, limitPrice, volume } = pendingTradeData;
  const tradeDataToExecute = { symbol, type, executionType, limitPrice, volume, stopLoss, takeProfit };
  
  hideTradeConfirmationModal();
  
  // Check overtrade control again before executing (conditions may have changed)
  const tradeData = { symbol, type, volume, stopLoss, takeProfit, action: 'executeOrder' };
  const shouldProceed = await window.overtradeControl.checkBeforeTrade('manual', tradeData);
  
  if (!shouldProceed) {
    showMessage('Trade cancelled - overtrade limit reached', 'warning');
    return;
  }
  
  showMessage('Executing trade...', 'info');
  
  try {
    const orderData = {
      symbol,
      type,
      executionType: executionType || 'MARKET',
      limitPrice: limitPrice || null,
      volume,
      stopLoss,
      takeProfit
    };
    
    const result = await window.mt5API.executeOrder(orderData);
    
    // Log MT5 order execution response
    logMT5Response('executeOrder', result, orderData);
    
    if (result.success && result.data.success) {
      showMessage(`Trade executed successfully! Ticket: ${result.data.ticket}`, 'success');
      
      // Record the trade in overtrade control after successful execution
      const tradeDataToRecord = { symbol, type, volume, stopLoss, takeProfit, action: 'executeOrder' };
      await window.overtradeControl.recordTrade('manual', tradeDataToRecord);
      
      // Record balance after trade execution
      const accountResult = await window.mt5API.getAccountInfo();
      if (accountResult.success && accountResult.data) {
        await recordBalanceSnapshot(accountResult.data.balance, result.data.ticket, null);
      }
      
      handleRefreshAccount();
      handleRefreshPositions();
    } else {
      showMessage('Trade failed: ' + (result.data?.error || result.error), 'error');
    }
  } catch (error) {
    showMessage('Trade execution error: ' + error.message, 'error');
  }
  
  // Clear pending trade data
  pendingTradeData = null;
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
    document.getElementById('connectBtn').textContent = 'Disconnect MT5';
    document.getElementById('connectBtn').className = 'btn btn-danger';
    showMessage('Connected to MT5 successfully!', 'success');
    
    // Record initial balance snapshot
    const accountResult = await window.mt5API.getAccountInfo();
    if (accountResult.success && accountResult.data) {
      await recordBalanceSnapshot(accountResult.data.balance);
    }
    
    handleRefreshAccount();
    handleRefreshPositions();
    
    // Load simulator settings to show simulator mode if enabled
    await loadSimulatorSettings();
    
    // Reinitialize settings symbol input if settings modal is open
    if (document.getElementById('settingsModal').classList.contains('show')) {

    }
    
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
    
    // Record balance snapshot periodically
    await recordBalanceSnapshot(data.balance);
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
            SL: ${(pos.stop_loss && pos.stop_loss > 0) ? pos.stop_loss.toFixed(5) : 'None'} | TP: ${(pos.take_profit && pos.take_profit > 0) ? pos.take_profit.toFixed(5) : 'None'}
          </div>
          <div class="position-actions">
            <button class="btn btn-small btn-primary" onclick="showModifyModal(${pos.ticket}, ${pos.stop_loss}, ${pos.take_profit})">Modify</button>
            <button class="btn btn-small btn-danger" onclick="closePosition(${pos.ticket})">Close</button>
          </div>
        </div>
      `).join('');
    }
    
    // Update trade journal with current position data
    updateTradeJournalWithPositions(positions);
  }
}

async function handleRefreshPendingOrders() {
  if (!isConnected) return;

  try {
    const result = await window.mt5API.getPendingOrders();
    const container = document.getElementById('pendingOrdersList');

    // Handle the response structure from IPC (wrapped in {success, data})
    let orders = [];
    if (result && result.success && Array.isArray(result.data)) {
      orders = result.data;
    } else if (Array.isArray(result)) {
      // Fallback: if result is directly an array
      orders = result;
    } else if (result && result.data && Array.isArray(result.data)) {
      orders = result.data;
    }

    if (orders.length === 0) {
      container.innerHTML = '<p class="no-data">No pending orders</p>';
    } else {
      container.innerHTML = orders.map(order => {
        const setupTime = new Date(order.time_setup * 1000).toLocaleString();
        const expirationTime = order.time_expiration > 0 
          ? new Date(order.time_expiration * 1000).toLocaleString() 
          : 'GTC (Good Till Cancel)';
        
        // Determine border color based on order type
        let borderColor = '#FFA500'; // Orange for limit orders
        if (order.type.includes('STOP')) {
          borderColor = '#FF6B6B';
        }
        
        return `
          <div class="position-item" style="border-left-color: ${borderColor};">
            <div class="position-header">
              <span>${order.symbol} ${order.type}</span>
              <span style="color: #FFA500; font-weight: bold;">PENDING</span>
            </div>
            <div class="position-details">
              Volume: ${order.volume} | Limit Price: ${order.price.toFixed(5)}
            </div>
            <div class="position-details">
              SL: ${(order.stop_loss && order.stop_loss > 0) ? order.stop_loss.toFixed(5) : 'None'} | TP: ${(order.take_profit && order.take_profit > 0) ? order.take_profit.toFixed(5) : 'None'}
            </div>
            <div class="position-details" style="font-size: 10px; color: #666;">
              Placed: ${setupTime}<br>
              Expires: ${expirationTime}
            </div>
            <div class="position-actions">
              <button class="btn btn-small btn-primary" onclick="modifyPendingOrder(${order.ticket}, '${order.symbol}', '${order.type}', ${order.price}, ${order.stop_loss || 0}, ${order.take_profit || 0})">Modify</button>
              <button class="btn btn-small btn-danger" onclick="cancelPendingOrder(${order.ticket})">Cancel</button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Error refreshing pending orders:', error);
    const container = document.getElementById('pendingOrdersList');
    container.innerHTML = '<p class="no-data">Error loading pending orders</p>';
  }
}

async function cancelPendingOrder(ticket) {
  if (!isConnected) {
    showMessage('Not connected to MT5', 'error');
    return;
  }

  showConfirmation(
    'Cancel Pending Order',
    `Are you sure you want to cancel pending order #${ticket}?`,
    async () => {
      showMessage('Cancelling pending order...', 'info');

      try {
        const result = await window.mt5API.cancelPendingOrder(ticket);
        
        if (result.success) {
          showMessage(`Pending order #${ticket} cancelled successfully`, 'success');
          // Refresh pending orders list
          await handleRefreshPendingOrders();
          // Also refresh positions in case the order was executed
          handleRefreshPositions();
        } else {
          showMessage('Failed to cancel order: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        showMessage('Error cancelling order: ' + error.message, 'error');
      }
    }
  );
}

// Make cancelPendingOrder globally accessible
window.cancelPendingOrder = cancelPendingOrder;

// Modify pending order modal state
let modifyPendingOrderData = null;

function modifyPendingOrder(ticket, symbol, orderType, currentPrice, currentSL, currentTP) {
  modifyPendingOrderData = { ticket, symbol, orderType, currentPrice, currentSL, currentTP };
  showModifyPendingOrderModal();
}

async function showModifyPendingOrderModal() {
  if (!modifyPendingOrderData) return;
  
  const { ticket, symbol, orderType, currentPrice, currentSL, currentTP } = modifyPendingOrderData;
  
  // Set modal content
  document.getElementById('modifyPendingOrderSymbol').textContent = symbol;
  document.getElementById('modifyPendingOrderTicket').textContent = ticket;
  document.getElementById('modifyPendingOrderCurrentPrice').textContent = currentPrice.toFixed(5);
  
  // Fetch and display current market price
  const marketPriceElement = document.getElementById('modifyPendingOrderMarketPrice');
  try {
    const result = await window.mt5API.getMarketData(symbol);
    if (result.success && result.data && result.data.bid && result.data.ask) {
      const isBuyOrder = orderType.includes('BUY');
      const relevantPrice = isBuyOrder ? result.data.ask : result.data.bid;
      const priceLabel = isBuyOrder ? 'Ask' : 'Bid';
      marketPriceElement.textContent = `${relevantPrice.toFixed(5)} (${priceLabel})`;
      marketPriceElement.style.color = '#4CAF50'; // Green color for market price
    } else {
      const errorMsg = result.data?.error || result.error || 'Unable to fetch';
      marketPriceElement.textContent = errorMsg;
      marketPriceElement.style.color = '#999';
    }
  } catch (error) {
    console.error('Error fetching market price:', error);
    marketPriceElement.textContent = 'Error loading';
    marketPriceElement.style.color = '#999';
  }
  
  // Set current values in inputs (leave empty to show placeholder)
  const priceInput = document.getElementById('modifyPendingOrderLimitPrice');
  const slInput = document.getElementById('modifyPendingOrderStopLoss');
  const tpInput = document.getElementById('modifyPendingOrderTakeProfit');
  if (priceInput) priceInput.value = '';
  if (slInput) slInput.value = (currentSL && currentSL > 0) ? currentSL.toFixed(5) : '';
  if (tpInput) tpInput.value = (currentTP && currentTP > 0) ? currentTP.toFixed(5) : '';
  
  // Show modal
  document.getElementById('modifyPendingOrderModal').classList.add('show');
  
  // Load and display the 6-month daily chart
  loadModifyPendingOrderChart(symbol);
}

function hideModifyPendingOrderModal() {
  document.getElementById('modifyPendingOrderModal').classList.remove('show');
  modifyPendingOrderData = null;
  
  // Destroy chart instance when modal is closed
  if (modifyChartInstance) {
    modifyChartInstance.destroy();
    modifyChartInstance = null;
  }
  
  // Reset chart UI elements
  const chartLoading = document.getElementById('modifyPendingOrderChartLoading');
  const chartError = document.getElementById('modifyPendingOrderChartError');
  const chartCanvas = document.getElementById('modifyPendingOrderChart');
  if (chartLoading) chartLoading.style.display = 'block';
  if (chartError) chartError.style.display = 'none';
  if (chartCanvas) chartCanvas.style.display = 'none';
}

async function confirmModifyPendingOrder() {
  if (!modifyPendingOrderData) {
    showMessage('No pending order data found', 'error');
    return;
  }
  
  const { ticket, symbol, orderType, currentPrice } = modifyPendingOrderData;
  const priceInput = document.getElementById('modifyPendingOrderLimitPrice').value.trim();
  const slInput = document.getElementById('modifyPendingOrderStopLoss').value.trim();
  const tpInput = document.getElementById('modifyPendingOrderTakeProfit').value.trim();
  
  // Parse values - empty means keep existing, 0 means remove (for SL/TP only)
  const limitPrice = priceInput === '' ? null : parseFloat(priceInput);
  const stopLoss = slInput === '' ? null : (slInput === '0' ? 0 : parseFloat(slInput));
  const takeProfit = tpInput === '' ? null : (tpInput === '0' ? 0 : parseFloat(tpInput));
  
  // Validate that at least one value is being modified
  if (limitPrice === null && stopLoss === null && takeProfit === null) {
    showMessage('Please enter at least one value to modify (Limit Price, SL, or TP)', 'error');
    return;
  }
  
  // Validate limit price if provided
  if (limitPrice !== null) {
    if (isNaN(limitPrice) || limitPrice <= 0) {
      showMessage('Invalid limit price value', 'error');
      return;
    }
    
    // Validate limit price against current market prices
    try {
      const result = await window.mt5API.getMarketData(symbol);
      if (result.success && result.data && result.data.bid && result.data.ask) {
        const isBuyOrder = orderType.includes('BUY');
        if (isBuyOrder && limitPrice >= result.data.ask) {
          showMessage('For BUY limit orders, the limit price must be below the current ask price', 'error');
          return;
        }
        if (!isBuyOrder && limitPrice <= result.data.bid) {
          showMessage('For SELL limit orders, the limit price must be above the current bid price', 'error');
          return;
        }
      }
    } catch (error) {
      console.error('Error validating limit price:', error);
      // Continue anyway - backend will validate
    }
  }
  
  // Validate SL/TP values
  if (stopLoss !== null && (isNaN(stopLoss) || stopLoss < 0)) {
    showMessage('Invalid stop loss value', 'error');
    return;
  }
  
  if (takeProfit !== null && (isNaN(takeProfit) || takeProfit < 0)) {
    showMessage('Invalid take profit value', 'error');
    return;
  }
  
  hideModifyPendingOrderModal();
  showMessage('Modifying pending order...', 'info');
  
  try {
    const result = await window.mt5API.modifyPendingOrder(ticket, stopLoss, takeProfit, limitPrice);
    
    if (result.success && result.data.success) {
      showMessage('Pending order modified successfully!', 'success');
      await handleRefreshPendingOrders();
    } else {
      showMessage('Failed to modify pending order: ' + (result.data?.error || result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showMessage('Error modifying pending order: ' + error.message, 'error');
  }
}

// Make functions globally accessible
window.modifyPendingOrder = modifyPendingOrder;
window.hideModifyPendingOrderModal = hideModifyPendingOrderModal;
window.confirmModifyPendingOrder = confirmModifyPendingOrder;

// Update trade journal with position data
function updateTradeJournalWithPositions(positions = []) {
  let updated = false;
  
  // Create a map of positions by ticket for quick lookup
  const positionMap = {};
  positions.forEach(pos => {
    positionMap[pos.ticket] = pos;
  });
  
  // Update journal entries with position data
  for (const ticket in tradeJournal) {
    const trade = tradeJournal[ticket];
    const position = positionMap[ticket];
    
    if (position) {
      // Update with current position data
      if (trade.openPrice !== position.open_price) {
        trade.openPrice = position.open_price;
        updated = true;
      }
      if (trade.currentPrice !== position.current_price) {
        trade.currentPrice = position.current_price;
        updated = true;
      }
      if (trade.profit !== position.profit) {
        trade.profit = position.profit;
        updated = true;
      }
    }
  }
  
  // Save if any updates were made
  if (updated) {
    saveTradeJournal();
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
    
    // Record balance after closing position
    const accountResult = await window.mt5API.getAccountInfo();
    if (accountResult.success && accountResult.data) {
      // Record balance immediately (profit will be updated later if available)
      await recordBalanceSnapshot(accountResult.data.balance, ticket, null);
      
      // Try to get profit from the closed position after a short delay
      // (closed positions might not be immediately available)
      setTimeout(async () => {
        try {
          const positionsResult = await window.mt5API.getClosedPositions(1);
          if (positionsResult.success && positionsResult.data) {
            const closedPos = positionsResult.data.find(p => p.ticket === ticket);
            if (closedPos && closedPos.profit !== undefined) {
              // Update the balance snapshot with profit information
              await recordBalanceSnapshot(accountResult.data.balance, ticket, closedPos.profit);
            }
          }
        } catch (error) {
          console.error('Error fetching closed position profit:', error);
        }
      }, 1000); // Wait 1 second for closed position to appear
    }
    
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
  document.getElementById('modifyStopLoss').value = (currentSL && currentSL > 0) ? currentSL : '';
  document.getElementById('modifyTakeProfit').value = (currentTP && currentTP > 0) ? currentTP : '';
  
  // Clear percentage inputs
  document.getElementById('modifyStopLossPercent').value = '';
  document.getElementById('modifyTakeProfitPercent').value = '';
  
  // Reset schedule options
  const scheduleEnabled = document.getElementById('modifyScheduleEnabled');
  if (scheduleEnabled) {
    scheduleEnabled.checked = false;
    toggleScheduleOptions();
  }
  const scheduleDelay = document.getElementById('modifyScheduleDelay');
  if (scheduleDelay) scheduleDelay.value = '';
  const scheduleDateTime = document.getElementById('modifyScheduleDateTime');
  if (scheduleDateTime) {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    scheduleDateTime.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  
  // Store position data for percentage calculations
  if (position) {
    document.getElementById('modifyModal').dataset.currentPrice = position.current_price;
    document.getElementById('modifyModal').dataset.entryPrice = position.open_price;
    document.getElementById('modifyModal').dataset.positionType = position.type;
    document.getElementById('modifyModal').dataset.symbol = position.symbol;
    
    // Display current price
    const currentPriceElement = document.getElementById('modifyCurrentPriceValue');
    if (currentPriceElement && position.current_price) {
      currentPriceElement.textContent = parseFloat(position.current_price).toFixed(5);
    }
  }
  
  document.getElementById('modifyModal').classList.add('show');
  
  // Load and display the 6-month daily chart for the position's symbol
  // Use setTimeout to ensure modal is fully rendered before loading chart
  if (position && position.symbol) {
    setTimeout(() => {
      loadModifyChart(position.symbol);
    }, 100);
  }
}

function hideModifyModal() {
  document.getElementById('modifyModal').classList.remove('show');
  
  // Destroy chart instance when modal is closed
  if (modifyChartInstance) {
    modifyChartInstance.destroy();
    modifyChartInstance = null;
  }
  
  // Reset chart UI elements
  const chartLoading = document.getElementById('modifyChartLoading');
  const chartError = document.getElementById('modifyChartError');
  const chartCanvas = document.getElementById('modifyChart');
  
  if (chartLoading) chartLoading.style.display = 'block';
  if (chartError) chartError.style.display = 'none';
  if (chartCanvas) chartCanvas.style.display = 'none';
}

// Function to load and display the 6-month chart for modify modal
async function loadModifyChart(symbol) {
  // Show loading state
  const chartLoading = document.getElementById('modifyChartLoading');
  const chartError = document.getElementById('modifyChartError');
  const chartCanvas = document.getElementById('modifyChart');
  
  if (!chartLoading || !chartError || !chartCanvas) {
    console.error('Modify chart elements not found');
    return;
  }
  
  chartLoading.style.display = 'block';
  chartError.style.display = 'none';
  chartCanvas.style.display = 'none';

  try {
    console.log(`Loading modify chart for symbol: ${symbol}`);
    const data = await fetchThreeMonthDailyData(symbol);
    
    if (data && data.length > 0) {
      console.log(`Received ${data.length} data points for modify chart`);
      plotModifyChart(symbol, data);
    } else {
      throw new Error('No data received');
    }
  } catch (error) {
    console.error('Error loading modify chart:', error);
    chartLoading.style.display = 'none';
    chartError.style.display = 'block';
    chartError.textContent = `Failed to load chart: ${error.message}`;
    chartCanvas.style.display = 'none';
  }
}

// Function to plot the 6-month daily chart for modify modal
function plotModifyChart(symbol, data) {
  try {
    // Destroy existing chart if it exists
    if (modifyChartInstance) {
      modifyChartInstance.destroy();
      modifyChartInstance = null;
    }

    // Hide loading and error, show chart
    const chartLoading = document.getElementById('modifyChartLoading');
    const chartError = document.getElementById('modifyChartError');
    const chartCanvas = document.getElementById('modifyChart');
    
    if (!chartCanvas) {
      console.error('Modify chart canvas not found');
      return;
    }
    
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartError) chartError.style.display = 'none';
    chartCanvas.style.display = 'block';
    
    // Ensure canvas has proper dimensions
    const container = chartCanvas.parentElement;
    if (container) {
      const containerWidth = container.clientWidth || 800;
      const containerHeight = container.clientHeight || 500;
      chartCanvas.width = containerWidth;
      chartCanvas.height = containerHeight;
    } else {
      chartCanvas.width = 800;
      chartCanvas.height = 500;
    }

    // Validate data
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No chart data available');
    }

    // Prepare OHLC data for candlestick chart
    const candlestickData = data.map(item => {
      const time = new Date(item.time).getTime();
      return {
        x: time,
        o: parseFloat(item.open),
        h: parseFloat(item.high),
        l: parseFloat(item.low),
        c: parseFloat(item.close)
      };
    }).filter(item => !isNaN(item.o) && !isNaN(item.h) && !isNaN(item.l) && !isNaN(item.c));

    // Prepare volume data
    const volumeData = data.map(item => {
      const time = new Date(item.time).getTime();
      const volume = parseFloat(item.tick_volume || 0);
      return {
        x: time,
        y: volume
      };
    }).filter(item => !isNaN(item.y));

    // Calculate max volume for scaling
    const maxVolume = Math.max(...volumeData.map(v => v.y));

    // Determine price decimals
    const avgPrice = candlestickData.reduce((sum, d) => sum + d.c, 0) / candlestickData.length;
    const priceDecimals = avgPrice >= 1000 ? 2 : avgPrice >= 10 ? 3 : 5;

    // Create chart
    const ctx = chartCanvas.getContext('2d');
    modifyChartInstance = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: symbol,
            data: candlestickData,
            borderColor: 'rgba(255, 255, 255, 0.8)',
            color: {
              up: 'rgba(38, 166, 154, 0.9)',
              down: 'rgba(239, 83, 80, 0.9)',
              unchanged: 'rgba(158, 158, 158, 0.9)'
            },
            borderWidth: 1.5,
            barThickness: 'flex',
            maxBarThickness: 8,
            yAxisID: 'y-price'
          },
          {
            label: 'Volume',
            data: volumeData,
            type: 'bar',
            backgroundColor: volumeData.map((v, i) => {
              if (i === 0) return 'rgba(158, 158, 158, 0.3)';
              const prevClose = candlestickData[i - 1]?.c;
              const currClose = candlestickData[i]?.c;
              if (currClose > prevClose) {
                return 'rgba(38, 166, 154, 0.3)';
              } else {
                return 'rgba(239, 83, 80, 0.3)';
              }
            }),
            borderWidth: 0,
            yAxisID: 'y-volume',
            barPercentage: 0.8,
            categoryPercentage: 1.0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 10,
            right: 25,
            top: 10,
            bottom: 10
          }
        },
        plugins: {
          title: {
            display: true,
            text: `${symbol} - 6 Month Daily Chart (Candlestick)`,
            color: '#e0e0e0',
            font: {
              size: 16,
              weight: 'bold',
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            padding: {
              top: 5,
              bottom: 15
            }
          },
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: '#b0b0b0',
              usePointStyle: true,
              padding: 15,
              font: {
                size: 11,
                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              },
              filter: function(item) {
                return item.text !== 'Volume';
              }
            }
          },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(17, 17, 17, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e0e0e0',
            borderColor: '#444',
            borderWidth: 1,
            padding: 12,
            titleFont: {
              size: 13,
              weight: 'bold',
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            bodyFont: {
              size: 12,
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            displayColors: false,
            callbacks: {
              title: function(context) {
                if (context[0] && context[0].raw && context[0].raw.x) {
                  const date = new Date(context[0].raw.x);
                  return date.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  });
                }
                return '';
              },
              label: function(context) {
                const dataPoint = context.raw;
                if (context.datasetIndex === 0 && dataPoint.o !== undefined) {
                  const change = dataPoint.c - dataPoint.o;
                  const changePercent = ((change / dataPoint.o) * 100).toFixed(2);
                  const changeSymbol = change >= 0 ? '▲' : '▼';
                  const changeColor = change >= 0 ? '🟢' : '🔴';
                  
                  return [
                    `${changeColor} ${changeSymbol} ${Math.abs(changePercent)}%`,
                    `Open:  ${dataPoint.o.toFixed(priceDecimals)}`,
                    `High:  ${dataPoint.h.toFixed(priceDecimals)}`,
                    `Low:   ${dataPoint.l.toFixed(priceDecimals)}`,
                    `Close: ${dataPoint.c.toFixed(priceDecimals)}`
                  ];
                } else if (context.datasetIndex === 1) {
                  return `Volume: ${Math.round(dataPoint.y).toLocaleString()}`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM d',
                week: 'MMM d',
                month: 'MMM yyyy'
              },
              tooltipFormat: 'MMM d, yyyy'
            },
            ticks: {
              color: '#888',
              maxRotation: 0,
              autoSkipPadding: 15,
              font: {
                size: 10,
                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              }
            },
            grid: {
              display: false,
              drawBorder: true,
              borderColor: '#333'
            }
          },
          'y-price': {
            type: 'linear',
            position: 'right',
            ticks: {
              color: '#888',
              font: {
                size: 10,
                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              },
              callback: function(value) {
                return value.toFixed(priceDecimals);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.06)',
              drawBorder: true,
              borderColor: '#333'
            }
          },
          'y-volume': {
            type: 'linear',
            position: 'right',
            display: false,
            max: maxVolume * 4,
            min: 0,
            grid: {
              display: false
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        animation: {
          duration: 400
        }
      }
    });

    console.log(`Modify candlestick chart plotted successfully with ${candlestickData.length} candles`);
  } catch (error) {
    console.error('Error plotting modify chart:', error);
    const chartLoading = document.getElementById('modifyChartLoading');
    const chartError = document.getElementById('modifyChartError');
    const chartCanvas = document.getElementById('modifyChart');
    
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartError) {
      chartError.style.display = 'block';
      chartError.textContent = `Failed to plot chart: ${error.message}`;
    }
    if (chartCanvas) chartCanvas.style.display = 'none';
  }
}

async function handleModifyPosition() {
  const ticket = parseInt(document.getElementById('modifyTicket').value);
  const slValue = document.getElementById('modifyStopLoss').value.trim();
  const tpValue = document.getElementById('modifyTakeProfit').value.trim();
  
  // Send null for empty values (preserve existing), 0 for explicit 0 (remove SL/TP)
  const stopLoss = slValue === '' ? null : (slValue === '0' ? 0 : parseFloat(slValue));
  const takeProfit = tpValue === '' ? null : (tpValue === '0' ? 0 : parseFloat(tpValue));

  // Validate that at least one value is being modified
  if (stopLoss === null && takeProfit === null) {
    showMessage('Please enter at least one value to modify (SL or TP)', 'error');
    return;
  }

  // Check if scheduling is enabled
  const scheduleEnabled = document.getElementById('modifyScheduleEnabled')?.checked || false;
  
  if (scheduleEnabled) {
    // Schedule for later
    const scheduleDateTime = document.getElementById('modifyScheduleDateTime')?.value;
    const scheduleDelay = document.getElementById('modifyScheduleDelay')?.value;
    
    let scheduledTime;
    
    if (scheduleDelay && scheduleDelay > 0) {
      // Use delay in minutes
      scheduledTime = new Date(Date.now() + parseInt(scheduleDelay) * 60 * 1000);
    } else if (scheduleDateTime) {
      // Use specific date/time
      scheduledTime = new Date(scheduleDateTime);
    } else {
      showMessage('Please specify either a date/time or delay for scheduling', 'error');
      return;
    }
    
    // Validate scheduled time is in the future
    if (scheduledTime <= new Date()) {
      showMessage('Scheduled time must be in the future', 'error');
      return;
    }
    
    // Save scheduled modification
    const scheduledId = saveScheduledModification({
      ticket,
      stopLoss,
      takeProfit,
      scheduledTime: scheduledTime.toISOString(),
      createdAt: new Date().toISOString()
    });
    
    hideModifyModal();
    showMessage(`Position modification scheduled for ${scheduledTime.toLocaleString()}`, 'success');
    
    // Update scheduled modifications display if it exists
    if (window.updateScheduledModificationsDisplay) {
      window.updateScheduledModificationsDisplay();
    }
  } else {
    // Execute immediately
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
}

function createModifyModal() {
  const modalHTML = `
    <div id="modifyModal" class="modal">
      <div class="modal-content trade-confirmation-modal">
        <h2>Modify Position</h2>
        <input type="hidden" id="modifyTicket">
        
        <div class="trade-confirmation-modal-content">
          <div id="modifyCurrentPrice" style="margin-bottom: 15px; padding: 10px; background-color: rgba(76, 175, 80, 0.1); border-left: 3px solid #4CAF50; border-radius: 4px;">
            <strong style="color: #4CAF50;">Current Price:</strong> <span id="modifyCurrentPriceValue" style="color: #e0e0e0; font-size: 16px; font-weight: bold;">-</span>
          </div>
          
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
          
          <!-- Timer/Schedule Option -->
          <div class="form-group" style="margin-top: 20px; padding: 15px; background-color: rgba(33, 150, 243, 0.1); border-left: 3px solid #2196F3; border-radius: 4px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="modifyScheduleEnabled" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="toggleScheduleOptions()">
              <strong style="color: #2196F3;">⏰ Schedule for Later</strong>
            </label>
            <div id="scheduleOptions" style="display: none; margin-top: 15px;">
              <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                <div style="flex: 1; min-width: 200px;">
                  <label style="display: block; margin-bottom: 5px; color: #b0b0b0; font-size: 12px;">Date & Time:</label>
                  <input type="datetime-local" id="modifyScheduleDateTime" style="width: 100%; padding: 8px; background-color: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 14px;">
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; margin-bottom: 5px; color: #b0b0b0; font-size: 12px;">OR Delay (minutes):</label>
                  <input type="number" id="modifyScheduleDelay" min="1" step="1" placeholder="Minutes" style="width: 100%; padding: 8px; background-color: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 14px;" oninput="updateScheduleFromDelay()">
                </div>
              </div>
              <div id="schedulePreview" style="margin-top: 10px; padding: 8px; background-color: rgba(33, 150, 243, 0.15); border-radius: 4px; color: #90CAF9; font-size: 12px; display: none;">
                <strong>Scheduled for:</strong> <span id="schedulePreviewText"></span>
              </div>
            </div>
          </div>
          
          <!-- 6 Month Daily Chart -->
          <div class="chart-container-wrapper">
            <h3 style="margin-top: 20px; margin-bottom: 10px;">📊 6-Month Daily Chart</h3>
            <div id="modifyChartLoading" class="chart-loading" style="text-align: center; padding: 20px; color: #888;">
              Loading chart data...
            </div>
            <div id="modifyChartError" class="chart-error" style="display: none; text-align: center; padding: 20px; color: #f44336;">
              Failed to load chart data
            </div>
            <canvas id="modifyChart" style="display: none; max-height: 400px; width: 100%; height: 400px;"></canvas>
          </div>
        </div>
        
        <div class="modal-actions" style="flex-shrink: 0; margin-top: auto; padding-top: 15px; border-top: 1px solid #444;">
          <button id="confirmModifyBtn" class="btn btn-primary">Modify</button>
          <button id="cancelModifyBtn" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  document.getElementById('confirmModifyBtn').addEventListener('click', handleModifyPosition);
  document.getElementById('cancelModifyBtn').addEventListener('click', hideModifyModal);
  
  // Initialize schedule datetime to current time + 1 hour
  const scheduleDateTime = document.getElementById('modifyScheduleDateTime');
  if (scheduleDateTime) {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    scheduleDateTime.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    scheduleDateTime.addEventListener('change', updateSchedulePreview);
  }
  
  const scheduleDelay = document.getElementById('modifyScheduleDelay');
  if (scheduleDelay) {
    scheduleDelay.addEventListener('input', updateScheduleFromDelay);
  }
}

// Schedule modification helper functions
function toggleScheduleOptions() {
  const scheduleEnabled = document.getElementById('modifyScheduleEnabled')?.checked || false;
  const scheduleOptions = document.getElementById('scheduleOptions');
  if (scheduleOptions) {
    scheduleOptions.style.display = scheduleEnabled ? 'block' : 'none';
    if (scheduleEnabled) {
      updateSchedulePreview();
    } else {
      const preview = document.getElementById('schedulePreview');
      if (preview) preview.style.display = 'none';
    }
  }
}

function updateScheduleFromDelay() {
  const delayInput = document.getElementById('modifyScheduleDelay');
  const dateTimeInput = document.getElementById('modifyScheduleDateTime');
  
  if (!delayInput || !dateTimeInput) return;
  
  const delayMinutes = parseInt(delayInput.value);
  if (delayMinutes && delayMinutes > 0) {
    const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000);
    const year = scheduledTime.getFullYear();
    const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
    const day = String(scheduledTime.getDate()).padStart(2, '0');
    const hours = String(scheduledTime.getHours()).padStart(2, '0');
    const minutes = String(scheduledTime.getMinutes()).padStart(2, '0');
    dateTimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    updateSchedulePreview();
  }
}

function updateSchedulePreview() {
  const scheduleEnabled = document.getElementById('modifyScheduleEnabled')?.checked || false;
  if (!scheduleEnabled) return;
  
  const scheduleDateTime = document.getElementById('modifyScheduleDateTime')?.value;
  const scheduleDelay = document.getElementById('modifyScheduleDelay')?.value;
  const preview = document.getElementById('schedulePreview');
  const previewText = document.getElementById('schedulePreviewText');
  
  if (!preview || !previewText) return;
  
  let scheduledTime;
  
  if (scheduleDelay && scheduleDelay > 0) {
    scheduledTime = new Date(Date.now() + parseInt(scheduleDelay) * 60 * 1000);
  } else if (scheduleDateTime) {
    scheduledTime = new Date(scheduleDateTime);
  } else {
    preview.style.display = 'none';
    return;
  }
  
  if (scheduledTime <= new Date()) {
    previewText.textContent = '⚠️ Scheduled time must be in the future';
    preview.style.display = 'block';
    preview.style.backgroundColor = 'rgba(244, 67, 54, 0.15)';
    preview.style.color = '#EF5350';
  } else {
    previewText.textContent = scheduledTime.toLocaleString();
    preview.style.display = 'block';
    preview.style.backgroundColor = 'rgba(33, 150, 243, 0.15)';
    preview.style.color = '#90CAF9';
  }
}

// Scheduled modifications storage and management
const SCHEDULED_MODIFICATIONS_KEY = 'scheduledPositionModifications';

function saveScheduledModification(modification) {
  const scheduled = loadScheduledModifications();
  const id = `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  scheduled[id] = {
    ...modification,
    id
  };
  localStorage.setItem(SCHEDULED_MODIFICATIONS_KEY, JSON.stringify(scheduled));
  return id;
}

function loadScheduledModifications() {
  try {
    const stored = localStorage.getItem(SCHEDULED_MODIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error loading scheduled modifications:', error);
    return {};
  }
}

function removeScheduledModification(id) {
  const scheduled = loadScheduledModifications();
  delete scheduled[id];
  localStorage.setItem(SCHEDULED_MODIFICATIONS_KEY, JSON.stringify(scheduled));
}

function clearScheduledModifications() {
  localStorage.removeItem(SCHEDULED_MODIFICATIONS_KEY);
}

async function executeScheduledModifications() {
  const scheduled = loadScheduledModifications();
  const now = new Date();
  const toExecute = [];
  
  // Find modifications that are due
  for (const [id, modification] of Object.entries(scheduled)) {
    const scheduledTime = new Date(modification.scheduledTime);
    if (scheduledTime <= now) {
      toExecute.push({ id, ...modification });
    }
  }
  
  // Execute due modifications
  for (const modification of toExecute) {
    try {
      console.log(`Executing scheduled modification for ticket ${modification.ticket}`);
      showMessage(`Executing scheduled modification for ticket ${modification.ticket}...`, 'info');
      
      const result = await window.mt5API.modifyPosition(
        modification.ticket,
        modification.stopLoss,
        modification.takeProfit
      );
      
      if (result.success && result.data.success) {
        showMessage(`Scheduled modification executed successfully for ticket ${modification.ticket}`, 'success');
        removeScheduledModification(modification.id);
      } else {
        showMessage(`Failed to execute scheduled modification for ticket ${modification.ticket}: ${result.data?.error || result.error}`, 'error');
        // Remove failed modifications to prevent retry loops
        removeScheduledModification(modification.id);
      }
      
      // Refresh positions after modification
      if (window.handleRefreshPositions) {
        setTimeout(() => handleRefreshPositions(), 1000);
      }
    } catch (error) {
      console.error(`Error executing scheduled modification ${modification.id}:`, error);
      showMessage(`Error executing scheduled modification: ${error.message}`, 'error');
      // Remove failed modifications
      removeScheduledModification(modification.id);
    }
  }
}

// Initialize scheduled modifications checker
let scheduledModificationsInterval = null;

function startScheduledModificationsChecker() {
  // Check every 30 seconds for scheduled modifications
  if (scheduledModificationsInterval) {
    clearInterval(scheduledModificationsInterval);
  }
  
  scheduledModificationsInterval = setInterval(() => {
    executeScheduledModifications();
  }, 30000); // Check every 30 seconds
  
  // Also check immediately on startup
  executeScheduledModifications();
}

// Start the checker when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startScheduledModificationsChecker);
} else {
  startScheduledModificationsChecker();
}

// Make functions available globally for debugging
window.scheduledModifications = {
  load: loadScheduledModifications,
  remove: removeScheduledModification,
  clear: clearScheduledModifications,
  execute: executeScheduledModifications
};

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
  // Also filter out apiKey for alphavantage-data nodes as it comes from settings
  // Filter out time series params for mt5-data when dataType is 'market'
  const paramEntries = Object.entries(node.params).filter(([key]) => {
    if (key.endsWith('Percent')) return false;
    if (key === 'apiKey' && node.type === 'alphavantage-data') return false;
    if (node.type === 'mt5-data' && node.params.dataType === 'market') {
      if (['timeframe', 'bars', 'startDate', 'endDate'].includes(key)) return false;
    }
    return true;
  });
  
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
    ${node.type === 'llm-node' ? `
      <div class="property-item">
        <label>Node Name:</label>
        <input 
          type="text" 
          value="${node.title || 'LLM Node'}" 
          placeholder="Enter node name"
          onchange="updateNodeName('${node.id}', this.value)"
          onblur="updateNodeName('${node.id}', this.value)"
          style="width: 100%; padding: 6px; margin-top: 4px;"
        />
        <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
          Customize the display name for this LLM node
        </small>
      </div>
    ` : ''}
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

      } else if (key === 'method' && node.type === 'twilio-alert') {
        return `
          <div class="property-item">
            <label>Notification Method:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="sms" ${value === 'sms' ? 'selected' : ''}>SMS</option>
              <option value="whatsapp" ${value === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            </select>
          </div>
        `;
      } else if (key === 'includeAccountInfo' && node.type === 'twilio-alert') {
        return `
          <div class="property-item">
            <label>Include Account Info:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value === 'true')">
              <option value="false" ${!value ? 'selected' : ''}>No</option>
              <option value="true" ${value ? 'selected' : ''}>Yes</option>
            </select>
          </div>
        `;
      } else if (key === 'includePositions' && node.type === 'twilio-alert') {
        return `
          <div class="property-item">
            <label>Include Position Info:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value === 'true')">
              <option value="false" ${!value ? 'selected' : ''}>No</option>
              <option value="true" ${value ? 'selected' : ''}>Yes</option>
            </select>
          </div>
        `;
      } else if (key === 'message' && node.type === 'twilio-alert') {
        return `
          <div class="property-item">
            <label>Alert Message:</label>
            <textarea data-param="${key}" 
                      rows="3" 
                      placeholder="Enter your alert message..."
                      onchange="updateNodeParam('${key}', this.value)"
                      style="width: 100%; background: #333; color: #e0e0e0; border: 1px solid #555; border-radius: 4px; padding: 8px; font-size: 13px; resize: both;">${value}</textarea>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              This message will be sent via Twilio when the node is triggered
            </small>
          </div>
        `;
      } else if (key === 'recipient' && node.type === 'twilio-alert') {
        return `
          <div class="property-item">
            <label>Recipient Number:</label>
            <input type="text" 
                   value="${value}" 
                   placeholder="+1234567890 (leave empty for default)"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value)"
                   style="font-family: monospace;">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Leave empty to use default recipient from settings. Include country code.
            </small>
          </div>
        `;
      } else if (key === 'value' && node.type === 'string-input') {
        return `
          <div class="property-item">
            <label>Message Text:</label>
            <textarea data-param="${key}"
                     onchange="updateNodeParam('${key}', this.value)"
                     rows="4"
                     style="width: 100%; resize: both; font-family: monospace;"
                     placeholder="Enter your custom message here...">${value}</textarea>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              This text will be sent as the Twilio message when connected to a Twilio Alert node.
            </small>
          </div>
        `;
      } else if (key === 'useStringInput' && node.type === 'twilio-alert') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Use String Input for Message
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled, the message will come from a connected String Input node instead of the default message parameter.
            </small>
          </div>
        `;
      } else if (key === 'dataType' && node.type === 'yfinance-data') {
        return `
          <div class="property-item">
            <label>Data Type:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="price" ${value === 'price' ? 'selected' : ''}>Current Price</option>
              <option value="info" ${value === 'info' ? 'selected' : ''}>Company Info</option>
              <option value="volume" ${value === 'volume' ? 'selected' : ''}>Current Volume</option>
              <option value="change" ${value === 'change' ? 'selected' : ''}>Daily Change %</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Select what type of data to fetch from yFinance
            </small>
          </div>
        `;
      } else if (key === 'period' && node.type === 'yfinance-data') {
        return `
          <div class="property-item">
            <label>Period:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="1d" ${value === '1d' ? 'selected' : ''}>1 Day</option>
              <option value="5d" ${value === '5d' ? 'selected' : ''}>5 Days</option>
              <option value="1mo" ${value === '1mo' ? 'selected' : ''}>1 Month</option>
              <option value="3mo" ${value === '3mo' ? 'selected' : ''}>3 Months</option>
              <option value="6mo" ${value === '6mo' ? 'selected' : ''}>6 Months</option>
              <option value="1y" ${value === '1y' ? 'selected' : ''}>1 Year</option>
              <option value="2y" ${value === '2y' ? 'selected' : ''}>2 Years</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Time period for historical data (used for some data types)
            </small>
          </div>
        `;
      } else if (key === 'interval' && node.type === 'yfinance-data') {
        return `
          <div class="property-item">
            <label>Interval:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="1m" ${value === '1m' ? 'selected' : ''}>1 Minute</option>
              <option value="2m" ${value === '2m' ? 'selected' : ''}>2 Minutes</option>
              <option value="5m" ${value === '5m' ? 'selected' : ''}>5 Minutes</option>
              <option value="15m" ${value === '15m' ? 'selected' : ''}>15 Minutes</option>
              <option value="30m" ${value === '30m' ? 'selected' : ''}>30 Minutes</option>
              <option value="60m" ${value === '60m' ? 'selected' : ''}>1 Hour</option>
              <option value="90m" ${value === '90m' ? 'selected' : ''}>90 Minutes</option>
              <option value="1h" ${value === '1h' ? 'selected' : ''}>1 Hour</option>
              <option value="1d" ${value === '1d' ? 'selected' : ''}>1 Day</option>
              <option value="5d" ${value === '5d' ? 'selected' : ''}>5 Days</option>
              <option value="1wk" ${value === '1wk' ? 'selected' : ''}>1 Week</option>
              <option value="1mo" ${value === '1mo' ? 'selected' : ''}>1 Month</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Data interval for historical data
            </small>
          </div>
        `;
      } else if (key === 'function' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Function:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="GLOBAL_QUOTE" ${value === 'GLOBAL_QUOTE' ? 'selected' : ''}>Global Quote</option>
              <option value="TIME_SERIES_INTRADAY" ${value === 'TIME_SERIES_INTRADAY' ? 'selected' : ''}>Time Series Intraday</option>
              <option value="TIME_SERIES_DAILY" ${value === 'TIME_SERIES_DAILY' ? 'selected' : ''}>Time Series Daily</option>
              <option value="TIME_SERIES_WEEKLY" ${value === 'TIME_SERIES_WEEKLY' ? 'selected' : ''}>Time Series Weekly</option>
              <option value="TIME_SERIES_MONTHLY" ${value === 'TIME_SERIES_MONTHLY' ? 'selected' : ''}>Time Series Monthly</option>
              <option value="OVERVIEW" ${value === 'OVERVIEW' ? 'selected' : ''}>Company Overview</option>
              <option value="MACD" ${value === 'MACD' ? 'selected' : ''}>MACD (Technical Indicator)</option>
              <option value="RSI" ${value === 'RSI' ? 'selected' : ''}>RSI (Technical Indicator)</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Select Alpha Vantage API function
            </small>
          </div>
        `;
      } else if (key === 'apiKey' && node.type === 'alphavantage-data') {
        // API key comes from settings, don't show input field
        return '';
      } else if (key === 'dataType' && node.type === 'mt5-data') {
        return `
          <div class="property-item">
            <label>Data Type:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value); updatePropertiesPanel(nodeEditor.selectedNode)">
              <option value="market" ${value === 'market' ? 'selected' : ''}>Market Data (Current)</option>
              <option value="historical" ${value === 'historical' ? 'selected' : ''}>Historical/Time Series</option>
              <option value="timeseries" ${value === 'timeseries' ? 'selected' : ''}>Time Series (alias)</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Select market data (current prices) or historical time series data
            </small>
          </div>
        `;
      } else if (key === 'timeframe' && node.type === 'mt5-data' && (node.params.dataType === 'historical' || node.params.dataType === 'timeseries')) {
        return `
          <div class="property-item">
            <label>Timeframe:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="M1" ${value === 'M1' ? 'selected' : ''}>M1 - 1 Minute</option>
              <option value="M5" ${value === 'M5' ? 'selected' : ''}>M5 - 5 Minutes</option>
              <option value="M15" ${value === 'M15' ? 'selected' : ''}>M15 - 15 Minutes</option>
              <option value="M30" ${value === 'M30' ? 'selected' : ''}>M30 - 30 Minutes</option>
              <option value="H1" ${value === 'H1' ? 'selected' : ''}>H1 - 1 Hour</option>
              <option value="H4" ${value === 'H4' ? 'selected' : ''}>H4 - 4 Hours</option>
              <option value="D1" ${value === 'D1' ? 'selected' : ''}>D1 - Daily</option>
              <option value="W1" ${value === 'W1' ? 'selected' : ''}>W1 - Weekly</option>
              <option value="MN1" ${value === 'MN1' ? 'selected' : ''}>MN1 - Monthly</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Timeframe for historical data bars
            </small>
          </div>
        `;
      } else if (key === 'bars' && node.type === 'mt5-data' && (node.params.dataType === 'historical' || node.params.dataType === 'timeseries')) {
        return `
          <div class="property-item">
            <label>Number of Bars:</label>
            <input type="number" 
                   value="${value}" 
                   min="1"
                   max="10000"
                   step="1"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseInt(this.value) || 100)">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Number of historical bars to fetch (1-10000)
            </small>
          </div>
        `;
      } else if (key === 'startDate' && node.type === 'mt5-data' && (node.params.dataType === 'historical' || node.params.dataType === 'timeseries')) {
        let dateValue = '';
        if (value) {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              // Convert to local datetime-local format (YYYY-MM-DDTHH:mm)
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              dateValue = `${year}-${month}-${day}T${hours}:${minutes}`;
            }
          } catch (e) {
            console.warn('Error parsing startDate:', e);
          }
        }
        return `
          <div class="property-item">
            <label>Start Date (Optional):</label>
            <input type="datetime-local" 
                   value="${dateValue}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value ? new Date(this.value + ':00').toISOString() : '')">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Optional: Start date for historical data. Leave empty to use number of bars from current time.
            </small>
          </div>
        `;
      } else if (key === 'endDate' && node.type === 'mt5-data' && (node.params.dataType === 'historical' || node.params.dataType === 'timeseries')) {
        let dateValue = '';
        if (value) {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              // Convert to local datetime-local format (YYYY-MM-DDTHH:mm)
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              dateValue = `${year}-${month}-${day}T${hours}:${minutes}`;
            }
          } catch (e) {
            console.warn('Error parsing endDate:', e);
          }
        }
        return `
          <div class="property-item">
            <label>End Date (Optional):</label>
            <input type="datetime-local" 
                   value="${dateValue}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value ? new Date(this.value + ':00').toISOString() : '')">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Optional: End date for historical data. Leave empty to use current time.
            </small>
          </div>
        `;
      } else if (key === 'interval' && node.type === 'alphavantage-data') {
        const isTechnicalIndicator = node.params.function === 'MACD' || node.params.function === 'RSI';
        return `
          <div class="property-item">
            <label>Interval:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              ${isTechnicalIndicator ? `
              <option value="daily" ${value === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${value === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${value === 'monthly' ? 'selected' : ''}>Monthly</option>
              ` : `
              <option value="1min" ${value === '1min' ? 'selected' : ''}>1 Minute</option>
              <option value="5min" ${value === '5min' ? 'selected' : ''}>5 Minutes</option>
              <option value="15min" ${value === '15min' ? 'selected' : ''}>15 Minutes</option>
              <option value="30min" ${value === '30min' ? 'selected' : ''}>30 Minutes</option>
              <option value="60min" ${value === '60min' ? 'selected' : ''}>1 Hour</option>
              `}
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              ${isTechnicalIndicator ? 'Time interval for technical indicators (MACD, RSI)' : 'Data interval (for intraday functions only)'}
            </small>
          </div>
        `;
      } else if (key === 'outputsize' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Output Size:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="compact" ${value === 'compact' ? 'selected' : ''}>Compact (100 data points)</option>
              <option value="full" ${value === 'full' ? 'selected' : ''}>Full (up to 20 years)</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Number of data points to return (for time series functions)
            </small>
          </div>
        `;
      } else if (key === 'seriesType' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Series Type:</label>
            <select data-param="${key}" onchange="updateNodeParam('${key}', this.value)">
              <option value="close" ${value === 'close' ? 'selected' : ''}>Close</option>
              <option value="open" ${value === 'open' ? 'selected' : ''}>Open</option>
              <option value="high" ${value === 'high' ? 'selected' : ''}>High</option>
              <option value="low" ${value === 'low' ? 'selected' : ''}>Low</option>
            </select>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Price type for technical indicators (MACD, RSI)
            </small>
          </div>
        `;
      } else if (key === 'timePeriod' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Time Period:</label>
            <input type="number" data-param="${key}" value="${value || 14}" 
                   onchange="updateNodeParam('${key}', parseInt(this.value))" 
                   min="1" max="200"
                   style="width: 100%; padding: 6px; border: 1px solid #444; background: #2d2d2d; color: #e0e0e0; border-radius: 4px;">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Number of periods for RSI calculation (default: 14)
            </small>
          </div>
        `;
      } else if (key === 'fastPeriod' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Fast Period:</label>
            <input type="number" data-param="${key}" value="${value || 12}" 
                   onchange="updateNodeParam('${key}', parseInt(this.value))" 
                   min="1" max="200"
                   style="width: 100%; padding: 6px; border: 1px solid #444; background: #2d2d2d; color: #e0e0e0; border-radius: 4px;">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Fast period for MACD (default: 12)
            </small>
          </div>
        `;
      } else if (key === 'slowPeriod' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Slow Period:</label>
            <input type="number" data-param="${key}" value="${value || 26}" 
                   onchange="updateNodeParam('${key}', parseInt(this.value))" 
                   min="1" max="200"
                   style="width: 100%; padding: 6px; border: 1px solid #444; background: #2d2d2d; color: #e0e0e0; border-radius: 4px;">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Slow period for MACD (default: 26)
            </small>
          </div>
        `;
      } else if (key === 'signalPeriod' && node.type === 'alphavantage-data') {
        return `
          <div class="property-item">
            <label>Signal Period:</label>
            <input type="number" data-param="${key}" value="${value || 9}" 
                   onchange="updateNodeParam('${key}', parseInt(this.value))" 
                   min="1" max="200"
                   style="width: 100%; padding: 6px; border: 1px solid #444; background: #2d2d2d; color: #e0e0e0; border-radius: 4px;">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Signal period for MACD (default: 9)
            </small>
          </div>
        `;

      } else if (key === 'model' && node.type === 'llm-node') {
        const openRouterSettings = window.settingsManager ? window.settingsManager.get('ai.openRouter') : null;
        const defaultModel = openRouterSettings ? openRouterSettings.model : 'openai/gpt-4o-mini';
        
        return `
          <div class="property-item">
            <label>LLM Model:</label>
            <input 
              type="text" 
              data-param="${key}" 
              value="${value || ''}" 
              placeholder="Enter model name (e.g., openai/gpt-4o-mini)"
              onchange="updateNodeParam('${key}', this.value)"
              onblur="updateNodeParam('${key}', this.value)"
              list="llm-model-suggestions-${node.id}"
              style="width: 100%; padding: 6px; margin-top: 4px;"
            />
            <datalist id="llm-model-suggestions-${node.id}">
              <option value="">Use Settings Default (${defaultModel})</option>
              <option value="openai/gpt-3.5-turbo">OpenAI GPT-3.5 Turbo</option>
              <option value="openai/gpt-4">OpenAI GPT-4</option>
              <option value="openai/gpt-4-turbo">OpenAI GPT-4 Turbo</option>
              <option value="openai/gpt-4o">OpenAI GPT-4o</option>
              <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini</option>
              <option value="openai/gpt-4o-2024-08-06">OpenAI GPT-4o (2024-08-06)</option>
              <option value="openai/o1-preview">OpenAI O1 Preview</option>
              <option value="openai/o1-mini">OpenAI O1 Mini</option>
              <option value="anthropic/claude-3-haiku">Anthropic Claude 3 Haiku</option>
              <option value="anthropic/claude-3-sonnet">Anthropic Claude 3 Sonnet</option>
              <option value="anthropic/claude-3.5-sonnet">Anthropic Claude 3.5 Sonnet</option>
              <option value="anthropic/claude-3-opus">Anthropic Claude 3 Opus</option>
              <option value="google/gemini-pro">Google Gemini Pro</option>
              <option value="google/gemini-pro-1.5">Google Gemini Pro 1.5</option>
              <option value="meta-llama/llama-3.1-8b-instruct">Meta Llama 3.1 8B</option>
              <option value="meta-llama/llama-3.1-70b-instruct">Meta Llama 3.1 70B</option>
              <option value="mistralai/mistral-large">Mistral Large</option>
              <option value="mistralai/mixtral-8x7b-instruct">Mistral Mixtral 8x7B</option>
              <option value="perplexity/llama-3.1-sonar-large-128k-online">Perplexity Llama 3.1 Sonar Large</option>
            </datalist>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Enter any OpenRouter model name (e.g., openai/gpt-4o-mini) or leave empty to use the default from OpenRouter settings (${defaultModel}).
              <br>You can type to see suggestions or enter a custom model name.
            </small>
          </div>
        `;
      } else if (key === 'prompt' && node.type === 'llm-node') {
        // Get saved prompts
        const savedPrompts = window.settingsManager ? window.settingsManager.get('ai.savedPrompts') || {} : {};
        const savedPromptOptions = Object.keys(savedPrompts).map(name => 
          `<option value="${name}">${name}</option>`
        ).join('');
        
        return `
          <div class="property-item">
            <label>Prompt Template:</label>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <select id="savedPromptSelect-${node.id}" 
                      style="flex: 1; padding: 6px; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 12px;"
                      onchange="loadSavedPrompt('${node.id}', this.value)">
                <option value="">-- Select Saved Prompt --</option>
                ${savedPromptOptions}
              </select>
              <button class="btn btn-success btn-small" 
                      onclick="savePromptTemplate('${node.id}')"
                      style="white-space: nowrap;">
                💾 Save Prompt
              </button>
              <button class="btn btn-danger btn-small" 
                      id="deletePromptBtn-${node.id}"
                      onclick="deleteSavedPrompt('${node.id}')"
                      style="white-space: nowrap; display: none;">
                🗑️ Delete
              </button>
            </div>
            <textarea id="promptTextarea-${node.id}" 
                     data-param="${key}"
                     data-node-id="${node.id}"
                     oninput="updateNodeParamWithId('${key}', this.value, '${node.id}')"
                     onchange="updateNodeParamWithId('${key}', this.value, '${node.id}')"
                     onblur="updateNodeParamWithId('${key}', this.value, '${node.id}')"
                     rows="4"
                     style="width: 100%; resize: both; font-family: monospace;"
                     placeholder="Enter your prompt template here...">${value}</textarea>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Use {input} as placeholder for the input text. Multiple string inputs will be concatenated with newlines. Example: "Analyze this data: {input}"
            </small>
          </div>
        `;
      } else if (key === 'maxTokens' && node.type === 'llm-node') {
        return `
          <div class="property-item">
            <label>Max Tokens:</label>
            <input type="number" 
                   value="${value}" 
                   min="1"
                   max="4000"
                   step="1"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseInt(this.value))">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Maximum number of tokens in the response (1-4000)
            </small>
          </div>
        `;
      } else if (key === 'temperature' && node.type === 'llm-node') {
        return `
          <div class="property-item">
            <label>Temperature:</label>
            <input type="number" 
                   value="${value}" 
                   min="0"
                   max="2"
                   step="0.1"
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseFloat(this.value))">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Controls randomness: 0 = deterministic, 2 = very creative
            </small>
          </div>
        `;
      } else if (key === 'apiKey' && node.type === 'firecrawl-node') {
        const firecrawlSettings = window.settingsManager ? window.settingsManager.get('ai.firecrawl') : null;
        const isConfigured = firecrawlSettings && firecrawlSettings.enabled && firecrawlSettings.apiKey;
        
        return `
          <div class="property-item">
            <label>API Configuration:</label>
            <div style="padding: 8px; background: ${isConfigured ? '#1a4d1a' : '#4d1a1a'}; border-radius: 4px; margin-bottom: 8px;">
              <div style="color: ${isConfigured ? '#4ade80' : '#f87171'}; font-size: 12px; font-weight: bold;">
                ${isConfigured ? '✓ Firecrawl Configured' : '✗ Firecrawl Not Configured'}
              </div>
              <div style="color: #aaa; font-size: 11px; margin-top: 4px;">
                ${isConfigured ? 'Using API key from settings' : 'API key required in Settings → AI → Firecrawl'}
              </div>
            </div>
          </div>
        `;
      } else if (key === 'apiKey' && node.type === 'llm-node') {
        const openRouterSettings = window.settingsManager ? window.settingsManager.get('ai.openRouter') : null;
        const isConfigured = openRouterSettings && openRouterSettings.enabled && openRouterSettings.apiKey;
        
        return `
          <div class="property-item">
            <label>API Configuration:</label>
            <div style="padding: 8px; background: ${isConfigured ? '#1a4d1a' : '#4d1a1a'}; border-radius: 4px; margin-bottom: 8px;">
              <div style="color: ${isConfigured ? '#4ade80' : '#f87171'}; font-size: 12px; font-weight: bold;">
                ${isConfigured ? '✓ OpenRouter Configured' : '✗ OpenRouter Not Configured'}
              </div>
              <div style="color: #888; font-size: 10px; margin-top: 4px;">
                ${isConfigured 
                  ? `Model: ${openRouterSettings.model || 'Default'} | API Key: ${openRouterSettings.apiKey.substring(0, 8)}...`
                  : 'Configure OpenRouter in Settings to use LLM nodes'
                }
              </div>
            </div>
            <small style="color: #888; font-size: 10px;">
              This node uses the global OpenRouter configuration from Settings.
              ${!isConfigured ? 'Please enable and configure OpenRouter in the Settings panel.' : ''}
            </small>
          </div>
        `;
      } else if (key === 'useStringInput' && node.type === 'llm-node') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Use String Input
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled, the prompt input will come from a connected String Input node
            </small>
          </div>
        `;
      } else if (key === 'displayValue' && node.type === 'string-output') {
        return `
          <div class="property-item">
            <label>Current Value:</label>
            <textarea readonly
                     rows="4"
                     style="width: 100%; resize: both; font-family: monospace; background: #f5f5f5;"
                     placeholder="No value received yet...">${value}</textarea>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              This shows the current string value received from connected nodes (read-only)
            </small>
          </div>
        `;
      } else if (key === 'showPopup' && node.type === 'string-output') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Show Popup Message
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled, displays the string value in a popup message
            </small>
          </div>
        `;
      } else if (key === 'logToConsole' && node.type === 'string-output') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Log to Console
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled, logs the string value to the browser console
            </small>
          </div>
        `;
      } else if (key === 'keyword' && node.type === 'string-contains') {
        return `
          <div class="property-item">
            <label>Keyword to Search:</label>
            <input type="text" 
                   value="${value}" 
                   data-param="${key}"
                   placeholder="Enter word or phrase"
                   onchange="updateNodeParam('${key}', this.value)">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              The word or phrase to search for in the input string
            </small>
          </div>
        `;
      } else if (key === 'caseSensitive' && node.type === 'string-contains') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Case Sensitive
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled, search will be case-sensitive (e.g., "Word" ≠ "word")
            </small>
          </div>
        `;
      } else if (key === 'passOnMatch' && node.type === 'string-contains') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Pass Trigger on Match
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled: pass trigger if keyword IS found<br>
              When disabled: pass trigger if keyword is NOT found
            </small>
          </div>
        `;
      } else if (key === 'script' && node.type === 'python-script') {
        return `
          <div class="property-item">
            <label>Python Script:</label>
            <textarea data-param="${key}"
                     onchange="updateNodeParam('${key}', this.value)"
                     rows="8"
                     style="width: 100%; resize: both; font-family: 'Courier New', monospace; font-size: 12px;"
                     placeholder="# Write your Python script here\n# Set 'result' variable for output\nresult = 'Hello from Python'">${value}</textarea>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Write Python code. Set 'result' variable for string output.<br>
              Available: datetime, json, math, re modules<br>
              Input data available as variable (see Input Variable Name below)
            </small>
          </div>
        `;
      } else if (key === 'useStringInput' && node.type === 'python-script') {
        return `
          <div class="property-item">
            <label>
              <input type="checkbox" 
                     ${value ? 'checked' : ''} 
                     data-param="${key}"
                     onchange="updateNodeParam('${key}', this.checked)">
              Use String Input
            </label>
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              When enabled, accepts string input from connected nodes
            </small>
          </div>
        `;
      } else if (key === 'inputVarName' && node.type === 'python-script') {
        return `
          <div class="property-item">
            <label>Input Variable Name:</label>
            <input type="text" 
                   value="${value}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value)"
                   placeholder="input_data">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Name of the variable containing input string data in your script
            </small>
          </div>
        `;
      } else if (key === 'keywords' && node.type === 'sentiment-node') {
        return `
          <div class="property-item">
            <label>Keywords:</label>
            <input type="text" 
                   value="${value}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value)"
                   placeholder="BTC, Bitcoin, cryptocurrency">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Enter keywords to analyze (comma-separated or single keyword). Examples: "BTC", "Bitcoin, cryptocurrency", "Apple, stock"
            </small>
          </div>
        `;
      } else if (key === 'symbol' && node.type === 'sentiment-node') {
        return `
          <div class="property-item">
            <label>Symbol/Keyword (Legacy):</label>
            <input type="text" 
                   value="${value}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', this.value)"
                   placeholder="BTC">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Legacy field - use "keywords" parameter instead for better results
            </small>
          </div>
        `;
      } else if (key === 'daysBack' && node.type === 'sentiment-node') {
        return `
          <div class="property-item">
            <label>Days Back:</label>
            <input type="number" 
                   value="${value}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseInt(this.value))"
                   min="1"
                   max="30"
                   placeholder="7">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Number of days to look back for news articles (1-30)
            </small>
          </div>
        `;
      } else if (key === 'maxResults' && node.type === 'sentiment-node') {
        return `
          <div class="property-item">
            <label>Max Results:</label>
            <input type="number" 
                   value="${value}" 
                   data-param="${key}"
                   onchange="updateNodeParam('${key}', parseInt(this.value))"
                   min="1"
                   max="100"
                   placeholder="30">
            <small style="color: #888; font-size: 10px; display: block; margin-top: 4px;">
              Maximum number of articles to analyze (1-100)
            </small>
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
  
  // Add load current values button for modify-position node
  if (node.type === 'modify-position' && node.params.ticket) {
    actionButtons += `
      <button class="btn btn-info btn-small" onclick="loadCurrentPositionValues('${node.id}')">
        Load Current Values
      </button>
    `;
  }
  

  
  // Add memory section for LLM nodes
  if (node.type === 'llm-node') {
    const memory = node.memory || [];
    let memoryHtml = '';
    
    if (memory.length > 0) {
      let memoryText = '';
      const nodeName = node.title || 'LLM Node';
      
      // Display memory entries in reverse order (newest first)
      memory.slice().reverse().forEach((entry) => {
        const date = new Date(entry.timestamp);
        const formattedDate = date.toLocaleString();
        const relativeTime = getRelativeTime(entry.timestamp);
        const outputText = entry.output || '';
        
        memoryText += `[${nodeName}] [${formattedDate}] [${relativeTime}]\n`;
        memoryText += `${outputText}\n`;
        memoryText += `\n${'='.repeat(60)}\n\n`;
      });
      
      memoryHtml = `
        <div class="property-item" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 15px;">
          <label style="color: #4CAF50; font-weight: bold; margin-bottom: 10px; display: block;">🧠 Memory (${memory.length} ${memory.length === 1 ? 'entry' : 'entries'}):</label>
          <div style="max-height: 300px; overflow-y: auto; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; padding: 10px;">
            <pre style="color: #e0e0e0; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; margin: 0;">${escapeHtml(memoryText.trim())}</pre>
          </div>
          <button class="btn btn-secondary btn-small" onclick="clearNodeMemory('${node.id}')" style="margin-top: 8px;">
            Clear Memory
          </button>
        </div>
      `;
    } else {
      memoryHtml = `
        <div class="property-item" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 15px;">
          <label style="color: #888; font-weight: bold; margin-bottom: 10px; display: block;">🧠 Memory:</label>
          <p style="color: #888; font-size: 12px; margin: 0;">No memory entries yet. Execute this LLM node to see outputs.</p>
        </div>
      `;
    }
    
    panel.innerHTML += memoryHtml;
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

// Update node name/title
window.updateNodeName = function(nodeId, newName) {
  if (!nodeEditor || !nodeEditor.nodes) {
    return;
  }
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId || String(n.id) === String(nodeId));
  if (!node) {
    return;
  }
  
  // Update the node title
  node.title = newName || node.title || 'LLM Node';
  
  // Refresh the properties panel if this node is selected
  if (nodeEditor.selectedNode && (nodeEditor.selectedNode.id == nodeId || String(nodeEditor.selectedNode.id) === String(nodeId))) {
    updatePropertiesPanel(nodeEditor.selectedNode);
  }
  
  // Redraw the canvas to show the updated name
  if (nodeEditor.draw) {
    nodeEditor.draw();
  }
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

// Update node parameter with explicit node ID (for textareas and other elements)
window.updateNodeParamWithId = function(key, value, nodeId) {
  const node = nodeEditor.nodes.find(n => String(n.id) === String(nodeId));
  if (node) {
    node.params[key] = value;
    
    // Handle period trigger updates
    if (node.type === 'trigger-period') {
      if (key === 'enabled' || key === 'interval' || key === 'unit') {
        nodeEditor.updatePeriodTrigger(node);
      }
    }
  } else {
    console.warn('Could not find node to update parameter:', key, 'nodeId:', nodeId);
  }
};

// Custom prompt dialog function
function showPromptDialog(title, message, defaultValue = '', callback) {
  // Remove existing prompt modal if any
  const existingModal = document.getElementById('promptDialogModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal HTML
  const modalHTML = `
    <div id="promptDialogModal" class="modal show">
      <div class="modal-content" style="max-width: 500px;">
        <h2>${title}</h2>
        <div class="form-group">
          <label>${message}</label>
          <input type="text" 
                 id="promptDialogInput" 
                 value="${defaultValue}"
                 placeholder="Enter name..."
                 style="width: 100%; padding: 8px; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 13px;"
                 autofocus>
        </div>
        <div class="modal-buttons">
          <button id="promptDialogOk" class="btn btn-primary">OK</button>
          <button id="promptDialogCancel" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Get elements
  const modal = document.getElementById('promptDialogModal');
  const input = document.getElementById('promptDialogInput');
  const okBtn = document.getElementById('promptDialogOk');
  const cancelBtn = document.getElementById('promptDialogCancel');
  
  // Focus input
  input.focus();
  input.select();
  
  // Handle OK button
  okBtn.addEventListener('click', () => {
    const value = input.value.trim();
    modal.remove();
    if (callback) {
      callback(value);
    }
  });
  
  // Handle Cancel button
  cancelBtn.addEventListener('click', () => {
    modal.remove();
    if (callback) {
      callback(null);
    }
  });
  
  // Handle Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      okBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelBtn.click();
    }
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      cancelBtn.click();
    }
  });
}

// Save prompt template
window.savePromptTemplate = async function(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id == nodeId || String(n.id) === String(nodeId));
  if (!node || node.type !== 'llm-node') {
    showMessage('Error: LLM node not found', 'error');
    return;
  }
  
  const promptText = node.params.prompt || '';
  if (!promptText.trim()) {
    showMessage('Please enter a prompt template before saving', 'warning');
    return;
  }
  
  // Show custom prompt dialog
  showPromptDialog('Save Prompt Template', 'Enter a name for this prompt template:', '', async (promptName) => {
    if (!promptName || !promptName.trim()) {
      return; // User cancelled or entered empty name
    }
    
    try {
      // Get current saved prompts
      const savedPrompts = window.settingsManager.get('ai.savedPrompts') || {};
      
      // Save the prompt
      savedPrompts[promptName.trim()] = promptText;
      
      // Update settings
      await window.settingsManager.set('ai.savedPrompts', savedPrompts);
      
      showMessage(`Prompt "${promptName}" saved successfully!`, 'success');
      
      // Refresh the properties panel to update the dropdown
      if (nodeEditor.selectedNode && nodeEditor.selectedNode.id === node.id) {
        updatePropertiesPanel(nodeEditor.selectedNode);
      }
    } catch (error) {
      console.error('Error saving prompt:', error);
      showMessage('Error saving prompt: ' + error.message, 'error');
    }
  });
};

// Load saved prompt
window.loadSavedPrompt = function(nodeId, promptName) {
  if (!promptName || !promptName.trim()) {
    // Clear selection
    const deleteBtn = document.getElementById(`deletePromptBtn-${nodeId}`);
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }
    return;
  }
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId || String(n.id) === String(nodeId));
  if (!node || node.type !== 'llm-node') {
    showMessage('Error: LLM node not found', 'error');
    return;
  }
  
  try {
    const savedPrompts = window.settingsManager.get('ai.savedPrompts') || {};
    const savedPrompt = savedPrompts[promptName];
    
    if (!savedPrompt) {
      showMessage('Prompt not found', 'error');
      return;
    }
  
    // Update the node's prompt parameter
    node.params.prompt = savedPrompt;
    
    // Update the textarea
    const textarea = document.getElementById(`promptTextarea-${nodeId}`);
    if (textarea) {
      textarea.value = savedPrompt;
    }
    
    // If this node is selected, also update via updateNodeParam for consistency
    if (nodeEditor.selectedNode && nodeEditor.selectedNode.id === node.id) {
      updateNodeParam('prompt', savedPrompt);
    }
    
    // Show delete button
    const deleteBtn = document.getElementById(`deletePromptBtn-${nodeId}`);
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-block';
    }
    
    showMessage(`Prompt "${promptName}" loaded`, 'success');
  } catch (error) {
    console.error('Error loading prompt:', error);
    showMessage('Error loading prompt: ' + error.message, 'error');
  }
};

// Delete saved prompt
window.deleteSavedPrompt = async function(nodeId) {
  const select = document.getElementById(`savedPromptSelect-${nodeId}`);
  if (!select || !select.value) {
    showMessage('No prompt selected to delete', 'warning');
    return;
  }
  
  const promptName = select.value;
  
  if (!confirm(`Are you sure you want to delete the prompt "${promptName}"?`)) {
    return;
  }
  
  try {
    const savedPrompts = window.settingsManager.get('ai.savedPrompts') || {};
    delete savedPrompts[promptName];
    
    // Update settings
    await window.settingsManager.set('ai.savedPrompts', savedPrompts);
    
    showMessage(`Prompt "${promptName}" deleted`, 'success');
    
    // Refresh the properties panel to update the dropdown
    const node = nodeEditor.nodes.find(n => n.id == nodeId || String(n.id) === String(nodeId));
    if (node && nodeEditor.selectedNode && nodeEditor.selectedNode.id === node.id) {
      updatePropertiesPanel(nodeEditor.selectedNode);
    }
  } catch (error) {
    console.error('Error deleting prompt:', error);
    showMessage('Error deleting prompt: ' + error.message, 'error');
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
        // Attempt to parse JSON with detailed error logging
        let graph;
        try {
          graph = JSON.parse(event.target.result);
        } catch (parseError) {
          console.error(`❌ JSON Parse Error in strategy file:`);
          console.error(`   Parse error: ${parseError.message}`);
          console.error(`   File content preview (first 200 chars):`);
          const content = event.target.result;
          console.error(`   "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"`);
          
          // Try to identify common JSON issues
          if (content.trim() === '') {
            console.error(`   Issue: Strategy file is empty`);
            showMessage('Strategy file is empty', 'error');
          } else if (!content.trim().startsWith('{') && !content.trim().startsWith('[')) {
            console.error(`   Issue: Strategy file doesn't start with { or [ (not valid JSON)`);
            showMessage('Strategy file is not valid JSON - must start with { or [', 'error');
          } else if (!content.trim().endsWith('}') && !content.trim().endsWith(']')) {
            console.error(`   Issue: Strategy file doesn't end with } or ] (incomplete JSON)`);
            showMessage('Strategy file is incomplete - missing closing bracket', 'error');
          } else {
            showMessage(`Invalid JSON in strategy file: ${parseError.message}`, 'error');
          }
          return;
        }
        
        nodeEditor.importGraph(graph);
        console.log('✅ Strategy loaded successfully');
        showMessage('Strategy loaded!', 'success');
      } catch (error) {
        console.error('❌ Error loading strategy:', error.message);
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
      
      // Add default trigger node at center of canvas after clearing
      const canvas = document.getElementById('nodeCanvas');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const canvasPos = nodeEditor.screenToCanvas(centerX, centerY);
      nodeEditor.addNode('trigger', canvasPos.x, canvasPos.y);
      
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

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
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





// Plugin Import Handler
async function handlePluginImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  console.log('Importing plugin file:', file.name);
  
  try {
    showMessage('Loading plugin...', 'info');
    
    const text = await file.text();
    console.log('Plugin file content loaded, length:', text.length);
    
    // Parse the plugin definition
    let pluginDefinition;
    try {
      console.log('Attempting to parse as module.exports...');
      // Try to evaluate as module.exports
      const moduleExports = {};
      const module = { exports: moduleExports };
      eval(text);
      pluginDefinition = module.exports;
      console.log('Parsed as module.exports:', pluginDefinition);
    } catch (e) {
      console.log('module.exports parsing failed, trying direct eval:', e.message);
      // Try direct evaluation
      pluginDefinition = eval(`(${text})`);
      console.log('Parsed via direct eval:', pluginDefinition);
    }
    
    if (!pluginDefinition || typeof pluginDefinition !== 'object') {
      throw new Error('Plugin file did not export a valid plugin definition');
    }
    
    console.log('Plugin definition:', pluginDefinition);
    
    // Load the plugin
    if (window.nodePluginManager) {
      console.log('Loading plugin via plugin manager...');
      const success = window.nodePluginManager.loadPlugin(pluginDefinition);
      if (success) {
        showMessage(`✓ Plugin "${pluginDefinition.title}" loaded! Check the "${pluginDefinition.category || 'custom'}" category.`, 'success');
      } else {
        showMessage('Plugin loading failed - check console for details', 'error');
      }
    } else {
      console.error('Plugin manager not initialized!');
      showMessage('Plugin manager not initialized', 'error');
    }
    
  } catch (error) {
    console.error('Error importing plugin:', error);
    console.error('Stack trace:', error.stack);
    showMessage(`Failed to import plugin: ${error.message}`, 'error');
  }
  
  // Reset file input
  event.target.value = '';
}

window.handlePluginImport = handlePluginImport;

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

// AI Memory Modal functionality
function showAIMemoryModal() {
  document.getElementById('aiMemoryModal').classList.add('show');
  updateAIMemoryDisplay();
}

function hideAIMemoryModal() {
  document.getElementById('aiMemoryModal').classList.remove('show');
}

// Trade Journal Functions
function showTradeJournalModal() {
  document.getElementById('tradeJournalModal').classList.add('show');
  updateTradeJournalDisplay();
}

function hideTradeJournalModal() {
  document.getElementById('tradeJournalModal').classList.remove('show');
}

function filterTradeJournal() {
  updateTradeJournalDisplay();
}

// Draw balance graph
function drawBalanceGraph(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  // Make canvas responsive
  const container = canvas.parentElement;
  const containerWidth = container ? container.clientWidth - 40 : 800;
  canvas.width = Math.max(containerWidth, 400);
  canvas.height = 300;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  if (balanceHistory.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No balance history available', width / 2, height / 2);
    return;
  }
  
  // Sort by timestamp
  const sortedHistory = [...balanceHistory].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // Find min and max balance
  const balances = sortedHistory.map(h => h.balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const balanceRange = maxBalance - minBalance || 1; // Avoid division by zero
  
  // Find significant losses (more than 2% of current balance or $100)
  const currentBalance = balances[balances.length - 1] || 10000;
  const lossThreshold = Math.max(currentBalance * 0.02, 100);
  const losingTrades = sortedHistory.filter(h => 
    h.profit !== null && h.profit !== undefined && h.profit < -lossThreshold
  );
  
  // Draw grid lines
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (graphHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  
  // Draw balance line
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  sortedHistory.forEach((point, index) => {
    const divisor = sortedHistory.length > 1 ? sortedHistory.length - 1 : 1;
    const x = padding + (graphWidth / divisor) * index;
    const normalizedBalance = (point.balance - minBalance) / balanceRange;
    const y = padding + graphHeight - (normalizedBalance * graphHeight);
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Draw losing trade markers
  losingTrades.forEach(loss => {
    const index = sortedHistory.findIndex(h => 
      h.timestamp === loss.timestamp && h.ticket === loss.ticket
    );
    if (index >= 0) {
      const divisor = sortedHistory.length > 1 ? sortedHistory.length - 1 : 1;
      const x = padding + (graphWidth / divisor) * index;
      const normalizedBalance = (loss.balance - minBalance) / balanceRange;
      const y = padding + graphHeight - (normalizedBalance * graphHeight);
      
      // Draw red marker
      ctx.fillStyle = '#f44336';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw marker outline
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw loss amount label
      ctx.fillStyle = '#f44336';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`-$${Math.abs(loss.profit).toFixed(0)}`, x, y - 10);
    }
  });
  
  // Draw Y-axis labels (balance values)
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = minBalance + (balanceRange / 5) * (5 - i);
    const y = padding + (graphHeight / 5) * i;
    ctx.fillText('$' + value.toFixed(0), padding - 10, y + 4);
  }
  
  // Draw X-axis labels (time)
  ctx.textAlign = 'center';
  const timeLabels = [];
  const labelCount = Math.min(5, sortedHistory.length);
  for (let i = 0; i < labelCount; i++) {
    const index = Math.floor((sortedHistory.length - 1) * (i / (labelCount - 1 || 1)));
    const point = sortedHistory[index];
    if (point) {
      const date = new Date(point.timestamp);
      const label = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeLabels.push({ index, label });
    }
  }
  
  timeLabels.forEach(({ index, label }) => {
    const divisor = sortedHistory.length > 1 ? sortedHistory.length - 1 : 1;
    const x = padding + (graphWidth / divisor) * index;
    ctx.fillText(label, x, height - padding + 20);
  });
  
  // Draw title
  ctx.fillStyle = '#e0e0e0';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Balance Over Time', width / 2, 20);
  
  // Draw legend
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Red markers indicate significant losses', padding, height - 5);
}

async function updateTradeJournalDisplay() {
  const journalContent = document.getElementById('tradeJournalContent');
  const filterInput = document.getElementById('tradeJournalFilter');
  const filterValue = filterInput ? filterInput.value.toLowerCase().trim() : '';
  
  if (!journalContent) {
    console.error('Trade journal content element not found');
    return;
  }
  
  // Create balance graph HTML
  const graphHtml = `
    <div style="margin-bottom: 30px; padding: 20px; background: #1e1e1e; border: 1px solid #444; border-radius: 8px;">
      <canvas id="balanceGraph" width="800" height="300" style="width: 100%; max-width: 100%; height: auto; background: #0f0f0f; border-radius: 4px;"></canvas>
    </div>
  `;
  
  // Get all trades from journal
  const trades = Object.values(tradeJournal).filter(trade => trade && trade.imagePath);
  
  // Build content with graph
  let contentHtml = graphHtml;
  
  if (trades.length === 0) {
    contentHtml += '<p class="no-log">No trades with charts found yet. Charts will appear here after executing trades.</p>';
    journalContent.innerHTML = contentHtml;
    // Draw graph even if no trades
    setTimeout(() => drawBalanceGraph('balanceGraph'), 100);
    return;
  }
  
  // Filter trades if filter is provided
  let filteredTrades = trades;
  if (filterValue) {
    filteredTrades = trades.filter(trade => {
      const symbol = (trade.symbol || '').toLowerCase();
      const type = (trade.type || '').toLowerCase();
      const ticket = String(trade.ticket || '').toLowerCase();
      return symbol.includes(filterValue) || type.includes(filterValue) || ticket.includes(filterValue);
    });
  }
  
  if (filteredTrades.length === 0) {
    journalContent.innerHTML = '<p class="no-log">No trades match the filter criteria.</p>';
    return;
  }
  
  // Sort by timestamp (newest first)
  filteredTrades.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    return timeB - timeA;
  });
  
  // Build HTML for each trade (async image loading)
  const tradeEntries = await Promise.all(filteredTrades.map(async (trade) => {
    const date = trade.timestamp ? new Date(trade.timestamp).toLocaleString() : 'Unknown date';
    const typeClass = trade.type && trade.type.toLowerCase() === 'buy' ? 'buy' : 'sell';
    const typeColor = trade.type && trade.type.toLowerCase() === 'buy' ? '#4CAF50' : '#f44336';
    
    // Load image as base64
    let imageSrc = '';
    if (trade.imagePath && window.electronAPI && window.electronAPI.readChartImage) {
      try {
        const imageResult = await window.electronAPI.readChartImage(trade.imagePath);
        if (imageResult.success) {
          imageSrc = imageResult.data;
        }
      } catch (error) {
        console.error('Error loading chart image:', error);
      }
    }
    
    const escapedImagePath = (trade.imagePath || '').replace(/'/g, "\\'");
    
    return `
      <div class="trade-journal-entry" style="margin-bottom: 20px; padding: 15px; border: 1px solid #444; border-radius: 8px; background: #1e1e1e;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div>
            <h3 style="margin: 0; color: #e0e0e0;">
              ${trade.symbol || 'Unknown'} 
              <span style="background-color: ${typeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">
                ${(trade.type || 'N/A').toUpperCase()}
              </span>
            </h3>
            <p style="margin: 5px 0; color: #888; font-size: 12px;">Ticket: ${trade.ticket || 'N/A'} | ${date}</p>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 10px;">
          <div>
            <div style="color: #888; font-size: 12px; margin-bottom: 5px;">Trade Details</div>
            <div style="color: #e0e0e0; font-size: 13px;">
              <div>Volume: <strong>${trade.volume || 'N/A'}</strong></div>
              <div>Stop Loss: <strong>${trade.stopLoss ? trade.stopLoss.toFixed(5) : 'None'}</strong></div>
              <div>Take Profit: <strong>${trade.takeProfit ? trade.takeProfit.toFixed(5) : 'None'}</strong></div>
              ${trade.openPrice ? `<div>Open Price: <strong>${trade.openPrice.toFixed(5)}</strong></div>` : ''}
              ${trade.currentPrice ? `<div>Current Price: <strong>${trade.currentPrice.toFixed(5)}</strong></div>` : ''}
              ${trade.profit !== null && trade.profit !== undefined ? `<div>Profit: <strong style="color: ${trade.profit >= 0 ? '#4CAF50' : '#f44336'}">$${trade.profit.toFixed(2)}</strong></div>` : ''}
            </div>
          </div>
          <div>
            <div style="color: #888; font-size: 12px; margin-bottom: 5px;">Chart</div>
            ${imageSrc ? `
              <img 
                src="${imageSrc}" 
                alt="Trade Chart" 
                style="max-width: 100%; max-height: 300px; border: 1px solid #444; border-radius: 4px; cursor: pointer;"
                onclick="openChartImageFromJournal('${escapedImagePath}')"
                title="Click to open full size"
              />
            ` : `
              <div style="padding: 20px; text-align: center; color: #888; border: 1px solid #444; border-radius: 4px;">
                Chart image not available
              </div>
            `}
          </div>
        </div>
        <div style="margin-top: 10px;">
          <button class="btn btn-small btn-info" onclick="openChartImageFromJournal('${escapedImagePath}')" style="margin-right: 8px;">
            📊 Open Chart
          </button>
        </div>
      </div>
    `;
  }));
  
  contentHtml += tradeEntries.join('');
  journalContent.innerHTML = contentHtml;
  
  // Draw balance graph after content is rendered
  setTimeout(() => drawBalanceGraph('balanceGraph'), 100);
}

// Open chart image from journal
async function openChartImageFromJournal(imagePath) {
  try {
    if (window.electronAPI && window.electronAPI.openPath) {
      const result = await window.electronAPI.openPath(imagePath);
      if (!result.success) {
        showMessage('Failed to open chart image: ' + result.error, 'error');
      }
    } else {
      showMessage('Unable to open chart image - API not available', 'error');
    }
  } catch (error) {
    console.error('Error opening chart image:', error);
    showMessage('Error opening chart image: ' + error.message, 'error');
  }
}

// Make functions globally accessible
window.openChartImageFromJournal = openChartImageFromJournal;
window.filterTradeJournal = filterTradeJournal;

// Bottom Panel Toggle functionality
function toggleBottomPanel() {
  const bottomPanel = document.querySelector('.bottom-panel');
  if (bottomPanel) {
    bottomPanel.classList.toggle('visible');
    // Update button text based on visibility
    const btn = document.getElementById('toggleBottomPanelBtn');
    if (btn) {
      if (bottomPanel.classList.contains('visible')) {
        btn.textContent = '📊 Hide Positions';
      } else {
        btn.textContent = '📊 Positions';
      }
    }
  }
}

function updateAIMemoryDisplay() {
  const memoryContent = document.getElementById('aiMemoryContent');
  const filterInput = document.getElementById('aiMemoryFilter');
  const filterValue = filterInput ? filterInput.value.toLowerCase().trim() : '';
  
  if (!memoryContent) {
    console.error('AI memory content element not found');
    return;
  }
  
  if (!nodeEditor || !nodeEditor.nodes) {
    memoryContent.innerHTML = '<p class="no-log">Node editor not initialized.</p>';
    return;
  }
  
  // Get all LLM nodes
  let llmNodes = nodeEditor.nodes.filter(node => node.type === 'llm-node');
  
  // Filter by node name if filter is provided
  if (filterValue) {
    llmNodes = llmNodes.filter(node => {
      const nodeName = (node.title || 'LLM Node').toLowerCase();
      return nodeName.includes(filterValue);
    });
  }
  
  if (llmNodes.length === 0) {
    memoryContent.innerHTML = filterValue 
      ? `<p class="no-log">No LLM nodes found matching "${filterInput.value}".</p>`
      : '<p class="no-log">No LLM nodes found in the canvas.</p>';
    return;
  }
  
  // Check if any node has memory
  const nodesWithMemory = llmNodes.filter(node => node.memory && node.memory.length > 0);
  
  if (nodesWithMemory.length === 0) {
    memoryContent.innerHTML = '<p class="no-log">No LLM nodes have memory entries yet. Execute LLM nodes to see their outputs.</p>';
    return;
  }
  
  // Build memory display as plain text
  let textContent = '';
  let totalEntries = 0;
  
  nodesWithMemory.forEach((node, nodeIndex) => {
    const nodeName = node.title || `LLM Node ${nodeIndex + 1}`;
    const memory = node.memory || [];
    totalEntries += memory.length;
    
    // Display memory entries in reverse order (newest first)
    memory.slice().reverse().forEach((entry, entryIndex) => {
      const date = new Date(entry.timestamp);
      const formattedDate = date.toLocaleString();
      const relativeTime = getRelativeTime(entry.timestamp);
      const outputText = entry.output || '';
      
      // Format: [Node Name] [Timestamp] [Relative Time]
      // Output text (plain)
      textContent += `[${nodeName}] [${formattedDate}] [${relativeTime}]\n`;
      textContent += `${outputText}\n`;
      textContent += `\n${'='.repeat(80)}\n\n`;
    });
  });
  
  // Add summary at the top
  const summary = `Total: ${totalEntries} memory ${totalEntries === 1 ? 'entry' : 'entries'} from ${nodesWithMemory.length} ${nodesWithMemory.length === 1 ? 'node' : 'nodes'}\n${'='.repeat(80)}\n\n`;
  textContent = summary + textContent;
  
  // Display as plain text with proper formatting
  memoryContent.innerHTML = `<pre style="color: #e0e0e0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; padding: 10px;">${escapeHtml(textContent.trim())}</pre>`;
  
  // Scroll to top
  memoryContent.scrollTop = 0;
}

function filterAIMemory() {
  updateAIMemoryDisplay();
}

function clearAllAIMemory() {
  if (!nodeEditor || !nodeEditor.nodes) {
    showMessage('Node editor not initialized', 'error');
    return;
  }
  
  if (!confirm('Are you sure you want to clear all memory from all LLM nodes? This action cannot be undone.')) {
    return;
  }
  
  const llmNodes = nodeEditor.nodes.filter(node => node.type === 'llm-node');
  let clearedCount = 0;
  
  llmNodes.forEach(node => {
    if (node.memory && node.memory.length > 0) {
      node.memory = [];
      clearedCount++;
    }
  });
  
  updateAIMemoryDisplay();
  showMessage(`Cleared memory from ${clearedCount} LLM node${clearedCount === 1 ? '' : 's'}`, 'success');
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

// Helper functions for LLM memory display
function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Clear memory for a specific node
window.clearNodeMemory = function(nodeId) {
  if (!nodeEditor || !nodeEditor.nodes) {
    showMessage('Node editor not initialized', 'error');
    return;
  }
  
  const node = nodeEditor.nodes.find(n => n.id == nodeId || String(n.id) === String(nodeId));
  
  if (!node || node.type !== 'llm-node') {
    showMessage('Node not found or not an LLM node', 'error');
    return;
  }
  
  if (!node.memory || node.memory.length === 0) {
    showMessage('This node has no memory to clear', 'info');
    return;
  }
  
  if (!confirm(`Are you sure you want to clear memory from "${node.title || 'LLM Node'}"? This action cannot be undone.`)) {
    return;
  }
  
  node.memory = [];
  
  // Refresh properties panel if this node is selected
  if (nodeEditor.selectedNode && (nodeEditor.selectedNode.id == nodeId || String(nodeEditor.selectedNode.id) === String(nodeId))) {
    updatePropertiesPanel(nodeEditor.selectedNode);
  }
  
  showMessage('Memory cleared', 'success');
};

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
let settingsHasUnsavedChanges = false;
let originalSettingsState = {};

async function showSettingsModal() {
  document.getElementById('settingsModal').classList.add('show');
  
  // Show loading indicator
  const modalTitle = document.querySelector('#settingsModal h2');
  const originalTitle = modalTitle.textContent;
  modalTitle.textContent = 'Settings (Reloading...)';
  
  // Automatically reload settings from JSON file when modal opens
  console.log('🔄 Settings modal opened - reloading from JSON file...');
  const reloadSuccess = await reloadSettingsFromFile();
  
  if (reloadSuccess) {
    console.log('✅ Settings reloaded successfully');
    modalTitle.textContent = 'Settings (Reloaded)';
    setTimeout(() => {
      modalTitle.textContent = originalTitle;
    }, 1000);
  } else {
    console.log('⚠️ Settings reload failed, using current settings');
    modalTitle.textContent = originalTitle;
  }
  
  // Load all settings components with fresh data
  loadGeneralSettings();
  loadOvertradeSettings();
  loadVolumeControlSettings();
  loadTwilioSettings();
  await loadAiAnalysisSettings();
  
  // Store original settings state for comparison
  storeOriginalSettingsState();
  
  // Reset unsaved changes flag
  settingsHasUnsavedChanges = false;
  updateSettingsVisualIndicator();
  
  // Setup tab switching
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.onclick = (e) => switchSettingsTab(e.target.dataset.tab);
  });
  
  // Setup event listeners
  document.getElementById('closeSettingsBtn').onclick = handleCloseSettings;
  document.getElementById('saveSettingsBtn').onclick = handleSaveSettings;
  
  // Setup load settings functionality
  const loadSettingsBtn = document.getElementById('loadSettingsBtn');
  const loadSettingsFileInput = document.getElementById('loadSettingsFileInput');
  
  if (loadSettingsBtn && loadSettingsFileInput) {
    loadSettingsBtn.onclick = () => {
      loadSettingsFileInput.click();
    };
    
    loadSettingsFileInput.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        loadSettingsFromFile(file);
      }
    };
  }

  document.getElementById('settingsResetTradeCountBtn').onclick = resetTradeCountFromSettings;
  document.getElementById('addVolumeLimitBtn').onclick = addVolumeLimit;
  
  // Simulator mode event listeners
  document.getElementById('settingsSimulatorMode').onchange = async (e) => {
    const enabled = e.target.value === 'true';
    await toggleSimulatorMode(enabled);
    // Reload overtrade settings to show the correct mode's settings
    if (window.overtradeControl) {
      loadOvertradeSettings();
    }
  };
  document.getElementById('resetSimulatorBtn').onclick = resetSimulator;
  
  // Setup show/hide key buttons
  document.querySelectorAll('.show-key-btn').forEach(btn => {
    btn.onclick = (e) => {
      const targetId = e.target.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          e.target.textContent = '🙈';
          e.target.title = 'Hide Key';
        } else {
          input.type = 'password';
          e.target.textContent = '👁️';
          e.target.title = 'Show Key';
        }
      }
    };
  });
  
  // Note: Hotkey for simulator mode (Ctrl+Shift+S) is registered globally in setupEventListeners()
  // so it works at any time, not just when settings modal is open
  
  // Track changes in settings form
  setupSettingsChangeTracking();
  
  // Handle modal close events (clicking outside or pressing Escape)
  setupModalCloseHandlers();
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

function handleCloseSettings() {
  if (settingsHasUnsavedChanges) {
    showUnsavedSettingsDialog();
  } else {
    closeSettingsModal();
  }
}

function showUnsavedSettingsDialog() {
  // Create a custom dialog for better UX
  const dialog = document.createElement('div');
  dialog.className = 'unsaved-changes-dialog';
  dialog.innerHTML = `
    <div class="dialog-overlay">
      <div class="dialog-content">
        <h3>Unsaved Changes</h3>
        <p>You have unsaved changes in your settings. What would you like to do?</p>
        <div class="dialog-buttons">
          <button id="saveAndCloseBtn" class="btn btn-primary">Save & Close</button>
          <button id="discardChangesBtn" class="btn btn-secondary">Discard Changes</button>
          <button id="continueEditingBtn" class="btn btn-tertiary">Continue Editing</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Handle button clicks
  document.getElementById('saveAndCloseBtn').onclick = () => {
    document.body.removeChild(dialog);
    handleSaveSettings().then(() => {
      closeSettingsModal();
    });
  };
  
  document.getElementById('discardChangesBtn').onclick = () => {
    document.body.removeChild(dialog);
    closeSettingsModal();
  };
  
  document.getElementById('continueEditingBtn').onclick = () => {
    document.body.removeChild(dialog);
  };
  
  // Close on overlay click
  dialog.querySelector('.dialog-overlay').onclick = (e) => {
    if (e.target === e.currentTarget) {
      document.body.removeChild(dialog);
    }
  };
}

async function handleSaveSettings() {
  await saveAllSettings();
  settingsHasUnsavedChanges = false;
  updateSettingsVisualIndicator();
}

function storeOriginalSettingsState() {
  originalSettingsState = {
    overtradeSettings: window.overtradeControl ? { ...window.overtradeControl.settings } : null,
    twilioSettings: getCurrentTwilioSettings()
  };
}

function setupSettingsChangeTracking() {
  // Track changes in overtrade settings
  const overtradeInputs = [
    'settingsOvertradeEnabled',
    'settingsMaxTrades', 
    'settingsTimePeriod',
    'settingsReminderFrequency',
    'settingsApplyToManual',
    'settingsApplyToStrategy',
    'settingsApplyToNodes',
    'settingsApplyToOpenPositions',
    'settingsApplyToClosePositions'
  ];
  
  overtradeInputs.forEach(inputId => {
    const element = document.getElementById(inputId);
    if (element) {
      element.addEventListener('change', markSettingsAsChanged);
      element.addEventListener('input', markSettingsAsChanged);
    }
  });

  // Track changes in volume control settings
  const volumeControlInputs = [
    'settingsVolumeControlEnabled',
    'newVolumeLimit'
  ];
  
  volumeControlInputs.forEach(inputId => {
    const element = document.getElementById(inputId);
    if (element) {
      element.addEventListener('change', markSettingsAsChanged);
      element.addEventListener('input', markSettingsAsChanged);
    }
  });
  
  // Track changes in volume symbol input (will be set up when symbol input is initialized)
  // The symbol input component handles its own change events
  
  // Track changes in Twilio settings
  setupTwilioChangeTracking();
  
  // Track changes in AI Analysis settings
  setupAiAnalysisChangeTracking();
}

function markSettingsAsChanged() {
  settingsHasUnsavedChanges = true;
  updateSettingsVisualIndicator();
}

function updateSettingsVisualIndicator() {
  const modal = document.getElementById('settingsModal');
  if (settingsHasUnsavedChanges) {
    modal.classList.add('has-unsaved-changes');
  } else {
    modal.classList.remove('has-unsaved-changes');
  }
}

function setupModalCloseHandlers() {
  const modal = document.getElementById('settingsModal');
  
  // Handle clicking outside the modal
  modal.onclick = (e) => {
    if (e.target === modal) {
      handleCloseSettings();
    }
  };
  
  // Handle Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
      handleCloseSettings();
    }
  };
  
  // Remove any existing escape handler to avoid duplicates
  document.removeEventListener('keydown', handleEscape);
  document.addEventListener('keydown', handleEscape);
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
  
  // Reload overtrade settings when overtrade control tab is opened
  if (tabName === 'overtradeControl' && window.overtradeControl) {
    loadOvertradeSettings();
  }
}

// Make switchSettingsTab available globally
window.switchSettingsTab = switchSettingsTab;

function loadOvertradeSettings() {
  if (!window.overtradeControl) return;
  
  const settings = window.overtradeControl.getCurrentSettings();
  const isSimulator = window.overtradeControl.isSimulatorModeSync();
  
  // Populate form with current settings (based on current mode)
  document.getElementById('settingsOvertradeEnabled').value = settings.enabled.toString();
  document.getElementById('settingsMaxTrades').value = settings.maxTrades;
  document.getElementById('settingsTimePeriod').value = settings.timePeriod;
  document.getElementById('settingsReminderFrequency').value = settings.reminderFrequency;
  document.getElementById('settingsApplyToManual').checked = settings.applyToManual;
  document.getElementById('settingsApplyToStrategy').checked = settings.applyToStrategy;
  document.getElementById('settingsApplyToNodes').checked = settings.applyToNodes;
  document.getElementById('settingsApplyToOpenPositions').checked = settings.applyToOpenPositions;
  document.getElementById('settingsApplyToClosePositions').checked = settings.applyToClosePositions;
  
  // Update UI to show which mode is active
  const modeIndicator = document.getElementById('overtradeModeIndicator');
  if (modeIndicator) {
    modeIndicator.textContent = `Current Mode: ${isSimulator ? 'Simulator' : 'Real Trading'}`;
    modeIndicator.style.color = isSimulator ? '#ffa500' : '#4CAF50';
  }
  
  updateOvertradeStatusInSettings();
}

async function updateOvertradeStatusInSettings() {
  if (!window.overtradeControl) return;
  
  const currentPeriodTrades = window.overtradeControl.getCurrentPeriodTrades();
  const settings = window.overtradeControl.getCurrentSettings();
  const remaining = Math.max(0, settings.maxTrades - currentPeriodTrades);
  const lastWarning = window.overtradeControl.getCurrentLastWarningTime();
  const lastWarningStr = lastWarning ? new Date(lastWarning).toLocaleString() : 'Never';
  const nextReset = window.overtradeControl.getNextResetTime();
  
  document.getElementById('settingsCurrentTradeCount').textContent = currentPeriodTrades;
  document.getElementById('settingsRemainingTrades').textContent = remaining;
  document.getElementById('settingsNextReset').textContent = nextReset;
  document.getElementById('settingsLastWarning').textContent = lastWarningStr;
}

async function saveAllSettings() {
  // Save overtrade settings (saves to current mode)
  if (window.overtradeControl) {
    const settings = window.overtradeControl.getCurrentSettings();
    settings.enabled = document.getElementById('settingsOvertradeEnabled').value === 'true';
    settings.maxTrades = parseInt(document.getElementById('settingsMaxTrades').value);
    settings.timePeriod = document.getElementById('settingsTimePeriod').value;
    settings.reminderFrequency = document.getElementById('settingsReminderFrequency').value;
    settings.applyToManual = document.getElementById('settingsApplyToManual').checked;
    settings.applyToStrategy = document.getElementById('settingsApplyToStrategy').checked;
    settings.applyToNodes = document.getElementById('settingsApplyToNodes').checked;
    settings.applyToOpenPositions = document.getElementById('settingsApplyToOpenPositions').checked;
    settings.applyToClosePositions = document.getElementById('settingsApplyToClosePositions').checked;
    
    window.overtradeControl.saveSettings();
    await window.overtradeControl.updateStatusDisplay();
    
    const mode = window.overtradeControl.isSimulatorModeSync() ? 'simulator' : 'real trading';
    console.log(`Overtrade settings saved for ${mode} mode`);
  }
  
  // Save volume control settings
  if (window.volumeControl) {
    const enabled = document.getElementById('settingsVolumeControlEnabled').value === 'true';
    window.volumeControl.setEnabled(enabled);
  }
  
  // Save Twilio settings
  await saveTwilioSettings();
  
  // Save AI Analysis settings
  saveAiAnalysisSettings();
  
  // Reset unsaved changes flag
  settingsHasUnsavedChanges = false;
  updateSettingsVisualIndicator();
  
  showMessage('Settings saved successfully', 'success');
}

async function resetTradeCountFromSettings() {
  if (window.overtradeControl) {
    await window.overtradeControl.resetTradeCount();
    await updateOvertradeStatusInSettings();
  }
}


// Volume Control Settings Functions
let volumeSymbolInput = null;

function initializeVolumeSymbolInput() {
  const container = document.getElementById('volumeSymbolInputContainer');
  if (!container) return;
  
  // Create symbol input for volume control
  volumeSymbolInput = new SymbolInput(container, {
    placeholder: 'Enter symbol (e.g., EURUSD)',
    onSymbolSelect: (symbol, symbolData) => {
      console.log('Volume control - Selected symbol:', symbol, symbolData);
      markSettingsAsChanged();
    },
    onSymbolChange: (symbol) => {
      // Track changes for settings
      markSettingsAsChanged();
      
      // Optional: Could show symbol info or validation here
      if (symbol && symbol.length >= 6) {
        console.log('Volume control - Symbol changed:', symbol);
      }
    }
  });
  
  // Store globally for easy access
  window.volumeSymbolInput = volumeSymbolInput;
}

function loadVolumeControlSettings() {
  if (!window.volumeControl) return;
  
  // Load enabled state
  const enabledSelect = document.getElementById('settingsVolumeControlEnabled');
  const statusDiv = document.querySelector('.volume-status');
  const actionsDiv = document.querySelector('.volume-actions');
  
  if (enabledSelect) {
    enabledSelect.value = window.volumeControl.settings.enabled.toString();
    
    // Setup enabled toggle handler
    enabledSelect.onchange = (e) => {
      const enabled = e.target.value === 'true';
      if (statusDiv) {
        statusDiv.style.display = enabled ? 'block' : 'none';
      }
      if (actionsDiv) {
        actionsDiv.style.display = enabled ? 'block' : 'none';
      }
      markSettingsAsChanged();
    };
  }
  
  // Show/hide settings based on enabled state
  const isEnabled = window.volumeControl.settings.enabled;
  if (statusDiv) {
    statusDiv.style.display = isEnabled ? 'block' : 'none';
  }
  if (actionsDiv) {
    actionsDiv.style.display = isEnabled ? 'block' : 'none';
  }
  
  // Initialize symbol input for volume control
  initializeVolumeSymbolInput();
  
  // Load existing volume limits
  updateVolumeLimitsList();
}

function updateVolumeLimitsList() {
  if (!window.volumeControl) return;
  
  const container = document.getElementById('volumeLimitsList');
  if (!container) return;
  
  const limits = window.volumeControl.getSymbolLimits();
  
  if (Object.keys(limits).length === 0) {
    container.innerHTML = '<div class="status-grid"><div class="status-item" style="grid-column: 1 / -1; text-align: center; color: #aaa; font-style: italic;">No volume limits configured</div></div>';
    return;
  }
  
  const html = `
    <div class="status-grid">
      ${Object.entries(limits).map(([symbol, limit]) => `
        <div class="status-item volume-limit-item">
          <span class="label">${symbol}:</span>
          <span class="value">${limit} (default & max)</span>
          <div class="volume-limit-actions">
            <button class="btn btn-warning btn-small" onclick="editVolumeLimit('${symbol}', ${limit})" title="Edit volume">✏️</button>
            <button class="btn btn-danger btn-small" onclick="removeVolumeLimit('${symbol}')" title="Remove volume">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function addVolumeLimit() {
  const limitInput = document.getElementById('newVolumeLimit');
  
  // Get symbol from the symbol input component
  const symbol = volumeSymbolInput ? volumeSymbolInput.getValue().trim().toUpperCase() : '';
  const limit = parseFloat(limitInput.value);
  
  if (!symbol) {
    showMessage('Please enter a symbol', 'error');
    return;
  }
  
  if (!limit || limit <= 0) {
    showMessage('Please enter a valid volume', 'error');
    return;
  }
  
  try {
    window.volumeControl.setSymbolLimit(symbol, limit);
    updateVolumeLimitsList();
    
    // Clear inputs
    if (volumeSymbolInput) {
      volumeSymbolInput.setValue('');
    }
    limitInput.value = '';
    
    showMessage(`Default volume set for ${symbol}: ${limit} (also used as max limit)`, 'success');
    markSettingsAsChanged();
  } catch (error) {
    showMessage('Error setting volume: ' + error.message, 'error');
  }
}

function editVolumeLimit(symbol, currentLimit) {
  const newLimit = prompt(`Enter new default volume (and max limit) for ${symbol}:`, currentLimit);
  
  if (newLimit === null) return; // User cancelled
  
  const limit = parseFloat(newLimit);
  if (!limit || limit <= 0) {
    showMessage('Invalid volume', 'error');
    return;
  }
  
  try {
    window.volumeControl.setSymbolLimit(symbol, limit);
    updateVolumeLimitsList();
    showMessage(`Default volume updated for ${symbol}: ${limit} (also used as max limit)`, 'success');
    markSettingsAsChanged();
  } catch (error) {
    showMessage('Error updating volume: ' + error.message, 'error');
  }
}

function removeVolumeLimit(symbol) {
  if (typeof showConfirmation === 'function') {
    showConfirmation(
      'Remove Volume Configuration',
      `Are you sure you want to remove the default volume configuration for ${symbol}?`,
      () => {
        window.volumeControl.removeSymbolLimit(symbol);
        updateVolumeLimitsList();
        showMessage(`Volume configuration removed for ${symbol}`, 'info');
        markSettingsAsChanged();
      }
    );
  } else {
    if (confirm(`Remove volume configuration for ${symbol}?`)) {
      window.volumeControl.removeSymbolLimit(symbol);
      updateVolumeLimitsList();
      showMessage(`Volume configuration removed for ${symbol}`, 'info');
      markSettingsAsChanged();
    }
  }
}

async function loadSettingsFromFile(file) {
  try {
    const text = await file.text();
    
    // Attempt to parse JSON with detailed error logging
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error(`❌ JSON Parse Error in uploaded settings file:`);
      console.error(`   File name: ${file.name}`);
      console.error(`   Parse error: ${parseError.message}`);
      console.error(`   File content preview (first 200 chars):`);
      console.error(`   "${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"`);
      
      // Try to identify common JSON issues
      if (text.trim() === '') {
        console.error(`   Issue: File is empty`);
        showMessage('Settings file is empty', 'error');
      } else if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        console.error(`   Issue: File doesn't start with { or [ (not valid JSON)`);
        showMessage('Settings file is not valid JSON - must start with { or [', 'error');
      } else if (!text.trim().endsWith('}') && !text.trim().endsWith(']')) {
        console.error(`   Issue: File doesn't end with } or ] (incomplete JSON)`);
        showMessage('Settings file is incomplete - missing closing bracket', 'error');
      } else {
        showMessage(`Invalid JSON in settings file: ${parseError.message}`, 'error');
      }
      
      // Clear the file input
      const fileInput = document.getElementById('loadSettingsFileInput');
      if (fileInput) {
        fileInput.value = '';
      }
      return;
    }
    
    // Validate that this is a raw settings format (like app_settings.json)
    if (!data.volumeControl && !data.overtradeControl && !data.twilio && !data.ai) {
      console.error('❌ Invalid settings file format - not recognized as settings file');
      showMessage('Invalid settings file format', 'error');
      
      // Clear the file input
      const fileInput = document.getElementById('loadSettingsFileInput');
      if (fileInput) {
        fileInput.value = '';
      }
      return;
    }
    
    // Load volume control settings if present
    if (window.volumeControl) {
      const success = window.volumeControl.importSettings(JSON.stringify(data));
      
      if (success) {
        // Refresh the volume control UI
        if (typeof updateVolumeLimitsList === 'function') {
          updateVolumeLimitsList();
        }
        
        // Reload all settings to reflect changes
        loadGeneralSettings();
        loadOvertradeSettings();
        loadVolumeControlSettings();
        loadTwilioSettings();
        await loadAiAnalysisSettings();
        
        console.log('✅ Settings loaded successfully from file:', file.name);
        showMessage('Settings loaded successfully', 'success');
      }
    } else {
      console.error('❌ Failed to import settings');
      showMessage('Failed to import settings', 'error');
    }
    
    // Clear the file input
    const fileInput = document.getElementById('loadSettingsFileInput');
    if (fileInput) {
      fileInput.value = '';
    }
    
  } catch (error) {
    console.error('❌ Error loading settings file:', error.message);
    showMessage('Failed to load settings file', 'error');
    
    // Clear the file input
    const fileInput = document.getElementById('loadSettingsFileInput');
    if (fileInput) {
      fileInput.value = '';
    }
  }
}







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


// Twilio Settings Functions
async function loadTwilioSettings() {
  try {
    if (!window.settingsManager) return;
    
    // Load Twilio settings
    const twilioSettings = window.settingsManager.get('twilio') || {};
    // Notifications are always enabled - ensure setting is set to true
    await window.settingsManager.set('twilio.enabled', true);
    
    document.getElementById('settingsTwilioAccountSid').value = twilioSettings.accountSid || '';
    document.getElementById('settingsTwilioAuthToken').value = twilioSettings.authToken || '';
    document.getElementById('settingsTwilioFromNumber').value = twilioSettings.fromNumber || '';
    document.getElementById('settingsRecipientNumber').value = twilioSettings.recipientNumber || '';
    document.getElementById('settingsNotificationMethod').value = twilioSettings.method || 'sms';
    
    const twilioAlerts = twilioSettings.alerts || {};
    document.getElementById('settingsAlertTakeProfit').checked = twilioAlerts.take_profit !== false;
    document.getElementById('settingsAlertStopLoss').checked = twilioAlerts.stop_loss !== false;
    document.getElementById('settingsAlertPositionOpened').checked = twilioAlerts.position_opened === true;
    document.getElementById('settingsAlertPositionClosed').checked = twilioAlerts.position_closed === true;
    
    // Load Telegram settings
    const telegramSettings = window.settingsManager.get('telegram') || {};
    // Telegram is always enabled - ensure setting is set to true
    await window.settingsManager.set('telegram.enabled', true);
    
    document.getElementById('settingsTelegramBotToken').value = telegramSettings.botToken || '';
    document.getElementById('settingsTelegramChatId').value = telegramSettings.chatId || '';
    
    console.log('Twilio and Telegram settings loaded');
  } catch (error) {
    console.error('Error loading Twilio/Telegram settings:', error);
  }
}

function getCurrentTwilioSettings() {
  return {
    enabled: true, // Notifications are always enabled
    accountSid: document.getElementById('settingsTwilioAccountSid').value,
    authToken: document.getElementById('settingsTwilioAuthToken').value,
    fromNumber: document.getElementById('settingsTwilioFromNumber').value,
    recipientNumber: document.getElementById('settingsRecipientNumber').value,
    method: document.getElementById('settingsNotificationMethod').value,
    alerts: {
      take_profit: document.getElementById('settingsAlertTakeProfit').checked,
      stop_loss: document.getElementById('settingsAlertStopLoss').checked,
      position_opened: document.getElementById('settingsAlertPositionOpened').checked,
      position_closed: document.getElementById('settingsAlertPositionClosed').checked
    }
  };
}

function getCurrentTelegramSettings() {
  return {
    enabled: true, // Telegram is always enabled
    botToken: document.getElementById('settingsTelegramBotToken').value,
    chatId: document.getElementById('settingsTelegramChatId').value,
    alerts: {
      take_profit: document.getElementById('settingsAlertTakeProfit').checked,
      stop_loss: document.getElementById('settingsAlertStopLoss').checked,
      position_opened: document.getElementById('settingsAlertPositionOpened').checked,
      position_closed: document.getElementById('settingsAlertPositionClosed').checked
    }
  };
}

async function saveTwilioSettings() {
  try {
    if (!window.settingsManager) return;
    
    const twilioSettings = getCurrentTwilioSettings();
    const telegramSettings = getCurrentTelegramSettings();
    
    console.log('Saving Twilio and Telegram settings:', {
      twilio: {
        accountSid: twilioSettings.accountSid ? '***' + twilioSettings.accountSid.slice(-4) : 'empty',
        enabled: twilioSettings.enabled
      },
      telegram: {
        botToken: telegramSettings.botToken ? '***' : 'empty',
        chatId: telegramSettings.chatId || 'empty',
        enabled: telegramSettings.enabled
      }
    });
    
    // Save to settings manager
    await window.settingsManager.update({
      'twilio': twilioSettings,
      'telegram': telegramSettings
    });
    
    console.log('✓ Twilio and Telegram settings saved');
    
    // Also send to backend for runtime use (if connected)
    if (isConnected && window.mt5API) {
      try {
        const configData = {
          twilio: {
            account_sid: twilioSettings.accountSid,
            auth_token: twilioSettings.authToken,
            from_number: twilioSettings.fromNumber,
            enabled: twilioSettings.enabled
          },
          telegram: {
            bot_token: telegramSettings.botToken,
            chat_id: telegramSettings.chatId,
            enabled: telegramSettings.enabled
          },
          notifications: {
            recipient_number: twilioSettings.recipientNumber,
            method: twilioSettings.method,
            alerts: twilioSettings.alerts
          }
        };
        
        console.log('Sending config to backend...');
        if (window.mt5API.updateTwilioConfig) {
          const response = await window.mt5API.updateTwilioConfig(configData);
          console.log('Backend response:', response);
          
          if (response && response.data && response.data.success) {
            console.log('✓ Backend updated successfully');
          } else {
            console.warn('⚠ Backend update failed, but settings saved locally:', response?.data?.error || 'Unknown error');
          }
        }
      } catch (error) {
        console.warn('⚠ Could not update backend, but settings saved locally:', error.message);
      }
    }
    
    return true;
  } catch (error) {
    console.error('✗ Error saving Twilio/Telegram settings:', error);
    return false;
  }
}


// Add Twilio settings to the change tracking
function setupTwilioChangeTracking() {
  const twilioInputs = [
    'settingsTwilioAccountSid',
    'settingsTwilioAuthToken',
    'settingsTwilioFromNumber',
    'settingsTelegramBotToken',
    'settingsTelegramChatId',
    'settingsRecipientNumber',
    'settingsNotificationMethod',
    'settingsAlertTakeProfit',
    'settingsAlertStopLoss',
    'settingsAlertPositionOpened',
    'settingsAlertPositionClosed'
  ];
  
  twilioInputs.forEach(inputId => {
    const element = document.getElementById(inputId);
    if (element) {
      element.addEventListener('change', markSettingsAsChanged);
      element.addEventListener('input', markSettingsAsChanged);
    }
  });
}

// AI Analysis Settings Functions
async function loadAiAnalysisSettings() {
  try {
    if (!window.settingsManager) return;
    
    // AI Analysis is always enabled - ensure setting is set to true
    await window.settingsManager.set('ai.enabled', true);
    
    // Load Firecrawl settings
    const firecrawlEnabled = window.settingsManager.get('ai.firecrawl.enabled') || false;
    const firecrawlApiKey = window.settingsManager.get('ai.firecrawl.apiKey') || '';
    const firecrawlBaseUrl = window.settingsManager.get('ai.firecrawl.baseUrl') || 'https://api.firecrawl.dev';
    
    document.getElementById('settingsFirecrawlEnabled').value = firecrawlEnabled ? 'true' : 'false';
    document.getElementById('settingsFirecrawlApiKey').value = firecrawlApiKey;
    document.getElementById('settingsFirecrawlBaseUrl').value = firecrawlBaseUrl;
    
    // Load OpenRouter settings
    const openRouterEnabled = window.settingsManager.get('ai.openRouter.enabled') || false;
    const openRouterApiKey = window.settingsManager.get('ai.openRouter.apiKey') || '';
    const openRouterModel = window.settingsManager.get('ai.openRouter.model') || 'anthropic/claude-3.5-sonnet';
    const openRouterBaseUrl = window.settingsManager.get('ai.openRouter.baseUrl') || 'https://openrouter.ai/api/v1';
    
    document.getElementById('settingsOpenRouterEnabled').value = openRouterEnabled ? 'true' : 'false';
    document.getElementById('settingsOpenRouterApiKey').value = openRouterApiKey;
    document.getElementById('settingsOpenRouterModel').value = openRouterModel;
    document.getElementById('settingsOpenRouterBaseUrl').value = openRouterBaseUrl;
    
    // Load Alpha Vantage settings
    const alphaVantageEnabled = window.settingsManager.get('ai.alphavantage.enabled') || false;
    const alphaVantageApiKey = window.settingsManager.get('ai.alphavantage.apiKey') || '';
    const alphaVantageBaseUrl = window.settingsManager.get('ai.alphavantage.baseUrl') || 'https://www.alphavantage.co/query';
    
    document.getElementById('settingsAlphaVantageEnabled').value = alphaVantageEnabled ? 'true' : 'false';
    document.getElementById('settingsAlphaVantageApiKey').value = alphaVantageApiKey;
    document.getElementById('settingsAlphaVantageBaseUrl').value = alphaVantageBaseUrl;
    
    // Load AI feature settings
    const marketAnalysis = window.settingsManager.get('ai.features.marketAnalysis') !== false;
    const newsAnalysis = window.settingsManager.get('ai.features.newsAnalysis') !== false;
    const strategyOptimization = window.settingsManager.get('ai.features.strategyOptimization') || false;
    const riskAssessment = window.settingsManager.get('ai.features.riskAssessment') !== false;
    
    document.getElementById('settingsAiMarketAnalysis').checked = marketAnalysis;
    document.getElementById('settingsAiNewsAnalysis').checked = newsAnalysis;
    document.getElementById('settingsAiStrategyOptimization').checked = strategyOptimization;
    document.getElementById('settingsAiRiskAssessment').checked = riskAssessment;
    
  } catch (error) {
    console.error('Error loading AI analysis settings:', error);
  }
}

async function saveAiAnalysisSettings() {
  try {
    if (!window.settingsManager) return;
    
    // AI Analysis is always enabled
    const aiEnabled = true;
    
    // Save Firecrawl settings
    const firecrawlEnabled = document.getElementById('settingsFirecrawlEnabled').value === 'true';
    const firecrawlApiKey = document.getElementById('settingsFirecrawlApiKey').value;
    const firecrawlBaseUrl = document.getElementById('settingsFirecrawlBaseUrl').value;
    
    // Save OpenRouter settings
    const openRouterEnabled = document.getElementById('settingsOpenRouterEnabled').value === 'true';
    const openRouterApiKey = document.getElementById('settingsOpenRouterApiKey').value;
    const openRouterModel = document.getElementById('settingsOpenRouterModel').value;
    const openRouterBaseUrl = document.getElementById('settingsOpenRouterBaseUrl').value;
    
    // Save Alpha Vantage settings
    const alphaVantageEnabled = document.getElementById('settingsAlphaVantageEnabled').value === 'true';
    const alphaVantageApiKey = document.getElementById('settingsAlphaVantageApiKey').value;
    const alphaVantageBaseUrl = document.getElementById('settingsAlphaVantageBaseUrl').value;
    
    // Save AI feature settings
    const marketAnalysis = document.getElementById('settingsAiMarketAnalysis').checked;
    const newsAnalysis = document.getElementById('settingsAiNewsAnalysis').checked;
    const strategyOptimization = document.getElementById('settingsAiStrategyOptimization').checked;
    const riskAssessment = document.getElementById('settingsAiRiskAssessment').checked;
    
    // Update all AI settings at once
    await window.settingsManager.update({
      'ai.enabled': aiEnabled,
      'ai.firecrawl.enabled': firecrawlEnabled,
      'ai.firecrawl.apiKey': firecrawlApiKey,
      'ai.firecrawl.baseUrl': firecrawlBaseUrl,
      'ai.openRouter.enabled': openRouterEnabled,
      'ai.openRouter.apiKey': openRouterApiKey,
      'ai.openRouter.model': openRouterModel,
      'ai.openRouter.baseUrl': openRouterBaseUrl,
      'ai.alphavantage.enabled': alphaVantageEnabled,
      'ai.alphavantage.apiKey': alphaVantageApiKey,
      'ai.alphavantage.baseUrl': alphaVantageBaseUrl,
      'ai.features.marketAnalysis': marketAnalysis,
      'ai.features.newsAnalysis': newsAnalysis,
      'ai.features.strategyOptimization': strategyOptimization,
      'ai.features.riskAssessment': riskAssessment
    });
    
    console.log('AI Analysis settings saved successfully');
  } catch (error) {
    console.error('Error saving AI analysis settings:', error);
  }
}


// Add AI settings to the change tracking
function setupAiAnalysisChangeTracking() {
  const aiInputs = [
    'settingsFirecrawlEnabled',
    'settingsFirecrawlApiKey',
    'settingsFirecrawlBaseUrl',
    'settingsOpenRouterEnabled',
    'settingsOpenRouterApiKey',
    'settingsOpenRouterModel',
    'settingsOpenRouterBaseUrl',
    'settingsAlphaVantageEnabled',
    'settingsAlphaVantageApiKey',
    'settingsAlphaVantageBaseUrl',
    'settingsAiMarketAnalysis',
    'settingsAiNewsAnalysis',
    'settingsAiStrategyOptimization',
    'settingsAiRiskAssessment'
  ];
  
  aiInputs.forEach(inputId => {
    const element = document.getElementById(inputId);
    if (element) {
      element.addEventListener('change', markSettingsAsChanged);
      element.addEventListener('input', markSettingsAsChanged);
    }
  });
}

