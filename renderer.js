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
  } catch (e) {
    console.error('Failed to auto-load built-in plugins:', e);
  }
  
  // Canvas starts empty - users can add nodes from the palette
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
  
  // Volume loss calculation
  document.getElementById('tradeVolume').addEventListener('input', calculateVolumeLoss);
  document.getElementById('tradeType').addEventListener('change', () => {
    calculateVolumeLoss();
    // Note: TP/SL are now required - no default values are set when trade type changes
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
        hideTradeConfirmationModal();
      }
    };
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('tradeConfirmationModal').classList.contains('show')) {
        hideTradeConfirmationModal();
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
    // Note: TP/SL are now required - no default values will be set
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
      // Note: TP/SL are now required - no default values are set when price updates
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
      
      // Note: TP/SL are now required fields - no default values are set
      // Users must manually enter both Stop Loss and Take Profit before executing trade
      
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
  document.getElementById(`${tabName}PositionsTab`).classList.add('active');
  
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
  const volume = parseFloat(document.getElementById('tradeVolume').value);
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
      return handleExecuteTradeWithVolume(symbol, type, adjustedVolume, stopLoss, takeProfit);
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
  showTradeConfirmationModal(symbol, type, volume, stopLoss, takeProfit);
}

// Helper function to execute trade with specific volume (used for volume adjustments)
async function handleExecuteTradeWithVolume(symbol, type, volume, stopLoss, takeProfit) {
  // Check overtrade control before proceeding
  const tradeData = { symbol, type, volume, stopLoss, takeProfit, action: 'executeOrder' };
  const shouldProceed = await window.overtradeControl.checkBeforeTrade('manual', tradeData);
  
  if (!shouldProceed) {
    showMessage('Trade cancelled', 'info');
    return;
  }
  
  // Show confirmation dialog
  showTradeConfirmationModal(symbol, type, volume, stopLoss, takeProfit);
}

// Store trade data for confirmation
let pendingTradeData = null;
let tradeChartInstance = null;
let modifyChartInstance = null;
// Store chart image paths and trade details mapped by ticket
let chartImagePaths = {};
let tradeJournal = {}; // Stores full trade details: { ticket: { imagePath, symbol, type, volume, stopLoss, takeProfit, timestamp, ticket } }

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
    }
  } catch (error) {
    console.error('Error loading chart image paths:', error);
    chartImagePaths = {};
    tradeJournal = {};
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

// Function to fetch 3 months of daily data from MT5
async function fetchThreeMonthDailyData(symbol) {
  try {
    if (!window.mt5API || !isConnected) {
      throw new Error('Not connected to MT5');
    }

    // Calculate date range: 3 months ago to today
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    
    // Set time to start/end of day for proper date range
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Format dates as ISO strings for MT5 API
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    console.log(`Fetching 3 months of daily data for ${symbol} from ${startDateStr} to ${endDateStr}`);

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
    console.error('Error fetching 3-month daily data:', error);
    throw error;
  }
}

// Function to plot the 3-month daily chart
function plotThreeMonthChart(symbol, data) {
  try {
    // Destroy existing chart if it exists
    if (tradeChartInstance) {
      tradeChartInstance.destroy();
      tradeChartInstance = null;
    }

    // Hide loading and error, show chart
    document.getElementById('chartLoading').style.display = 'none';
    document.getElementById('chartError').style.display = 'none';
    const chartCanvas = document.getElementById('tradeChart');
    chartCanvas.style.display = 'block';

    // Prepare data for Chart.js
    const labels = data.map(item => {
      const date = new Date(item.time);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const closePrices = data.map(item => parseFloat(item.close));
    const highPrices = data.map(item => parseFloat(item.high));
    const lowPrices = data.map(item => parseFloat(item.low));

    // Get current price for reference line
    const currentPrice = closePrices[closePrices.length - 1];

    // Create chart
    const ctx = chartCanvas.getContext('2d');
    tradeChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Close Price',
            data: closePrices,
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: 'High',
            data: highPrices,
            borderColor: 'rgba(76, 175, 80, 0.3)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderDash: [5, 5]
          },
          {
            label: 'Low',
            data: lowPrices,
            borderColor: 'rgba(244, 67, 54, 0.3)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        plugins: {
          title: {
            display: true,
            text: `${symbol} - 3 Month Daily Chart`,
            color: '#e0e0e0',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#e0e0e0',
              usePointStyle: true
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#e0e0e0',
            bodyColor: '#e0e0e0',
            borderColor: '#444',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(5)}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#888',
              maxRotation: 45,
              minRotation: 45,
              maxTicksLimit: 15
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            ticks: {
              color: '#888',
              callback: function(value) {
                return value.toFixed(5);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        }
      }
    });

    console.log(`Chart plotted successfully with ${data.length} data points`);
  } catch (error) {
    console.error('Error plotting chart:', error);
    document.getElementById('chartLoading').style.display = 'none';
    document.getElementById('chartError').style.display = 'block';
    document.getElementById('chartError').textContent = `Failed to plot chart: ${error.message}`;
    document.getElementById('tradeChart').style.display = 'none';
  }
}

// Function to load and display the 3-month chart
async function loadThreeMonthChart(symbol) {
  // Show loading state
  document.getElementById('chartLoading').style.display = 'block';
  document.getElementById('chartError').style.display = 'none';
  document.getElementById('tradeChart').style.display = 'none';

  try {
    const data = await fetchThreeMonthDailyData(symbol);
    
    if (data && data.length > 0) {
      plotThreeMonthChart(symbol, data);
    } else {
      throw new Error('No data received');
    }
  } catch (error) {
    console.error('Error loading chart:', error);
    document.getElementById('chartLoading').style.display = 'none';
    document.getElementById('chartError').style.display = 'block';
    document.getElementById('chartError').textContent = `Failed to load chart: ${error.message}`;
    document.getElementById('tradeChart').style.display = 'none';
  }
}

function showTradeConfirmationModal(symbol, type, volume, stopLoss, takeProfit) {
  // Store the trade data
  pendingTradeData = { symbol, type, volume, stopLoss, takeProfit };
  
  // Update confirmation modal content
  document.getElementById('confirmTradeSymbol').textContent = symbol;
  
  const tradeTypeElement = document.getElementById('confirmTradeType');
  const tradeTypeText = type.toUpperCase(); // Use the type as-is since it's already uppercase from the select
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
  // Set input values for Stop Loss and Take Profit (editable in confirmation modal)
  // Use values from initial modal if provided, otherwise leave empty for user to enter
  const confirmStopLossInput = document.getElementById('confirmTradeStopLoss');
  const confirmTakeProfitInput = document.getElementById('confirmTradeTakeProfit');
  if (confirmStopLossInput) confirmStopLossInput.value = (stopLoss && stopLoss > 0) ? stopLoss : '';
  if (confirmTakeProfitInput) confirmTakeProfitInput.value = (takeProfit && takeProfit > 0) ? takeProfit : '';
  
  // Hide trade modal and show confirmation
  hideTradeModal();
  document.getElementById('tradeConfirmationModal').classList.add('show');
  
  // Load and display the 3-month daily chart
  loadThreeMonthChart(symbol);
}

function hideTradeConfirmationModal() {
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
}

async function confirmTradeExecution() {
  
  if (!pendingTradeData) {
    console.error('No pending trade data found!');
    showMessage('No pending trade to execute - please try again', 'error');
    hideTradeConfirmationModal();
    return;
  }
  
  // Read Stop Loss and Take Profit from confirmation modal input fields
  const confirmStopLossInput = document.getElementById('confirmTradeStopLoss').value.trim();
  const confirmTakeProfitInput = document.getElementById('confirmTradeTakeProfit').value.trim();
  const stopLoss = parseFloat(confirmStopLossInput);
  const takeProfit = parseFloat(confirmTakeProfitInput);
  
  // Validate that both Stop Loss and Take Profit are entered
  if (!confirmStopLossInput || confirmStopLossInput === '' || isNaN(stopLoss) || stopLoss <= 0) {
    showMessage('Please enter a valid Stop Loss before executing the trade', 'error');
    document.getElementById('confirmTradeStopLoss').focus();
    return;
  }
  
  if (!confirmTakeProfitInput || confirmTakeProfitInput === '' || isNaN(takeProfit) || takeProfit <= 0) {
    showMessage('Please enter a valid Take Profit before executing the trade', 'error');
    document.getElementById('confirmTradeTakeProfit').focus();
    return;
  }
  
  // Update pendingTradeData with the values from confirmation modal
  const { symbol, type, volume } = pendingTradeData;
  const tradeDataToExecute = { symbol, type, volume, stopLoss, takeProfit };
  
  // Save chart image BEFORE hiding modal (which destroys the chart)
  let savedChartImageData = null;
  if (tradeChartInstance && window.electronAPI && window.electronAPI.saveChartImage) {
    try {
      savedChartImageData = tradeChartInstance.toBase64Image();
    } catch (error) {
      console.error('Error capturing chart image:', error);
    }
  }
  
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
      volume,
      stopLoss,
      takeProfit
    };
    
    const result = await window.mt5API.executeOrder(orderData);
    
    // Log MT5 order execution response
    logMT5Response('executeOrder', result, orderData);
    
    if (result.success && result.data.success) {
      showMessage(`Trade executed successfully! Ticket: ${result.data.ticket}`, 'success');
      
      // Save chart image if we captured it earlier
      if (savedChartImageData && window.electronAPI && window.electronAPI.saveChartImage) {
        try {
          const saveResult = await window.electronAPI.saveChartImage(
            savedChartImageData,
            result.data.ticket,
            symbol
          );
          
          if (saveResult.success) {
            const ticket = result.data.ticket;
            // Store the image path mapped to the ticket
            chartImagePaths[ticket] = saveResult.filePath;
            
            // Store full trade details in journal
            tradeJournal[ticket] = {
              imagePath: saveResult.filePath,
              ticket: ticket,
              symbol: symbol,
              type: type,
              volume: volume,
              stopLoss: stopLoss || 0,
              takeProfit: takeProfit || 0,
              timestamp: new Date().toISOString(),
              openPrice: null, // Will be updated when position is fetched
              currentPrice: null,
              profit: null
            };
            
            // Save the journal to persistent storage
            await saveTradeJournal();
            console.log(`Chart image and trade details saved for ticket ${ticket}: ${saveResult.filePath}`);
          } else {
            console.error('Failed to save chart image:', saveResult.error);
          }
        } catch (error) {
          console.error('Error saving chart image:', error);
        }
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
  
  // Store position data for percentage calculations
  if (position) {
    document.getElementById('modifyModal').dataset.currentPrice = position.current_price;
    document.getElementById('modifyModal').dataset.entryPrice = position.open_price;
    document.getElementById('modifyModal').dataset.positionType = position.type;
    document.getElementById('modifyModal').dataset.symbol = position.symbol;
  }
  
  document.getElementById('modifyModal').classList.add('show');
  
  // Load and display the 3-month daily chart for the position's symbol
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

// Function to load and display the 3-month chart for modify modal
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

// Function to plot the 3-month daily chart for modify modal
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
    
    // Ensure canvas has proper dimensions - Chart.js needs explicit width/height
    const container = chartCanvas.parentElement;
    if (container) {
      const containerWidth = container.clientWidth || 800;
      chartCanvas.width = containerWidth;
      chartCanvas.height = 400;
      // Also set CSS to maintain aspect ratio
      chartCanvas.style.width = containerWidth + 'px';
      chartCanvas.style.height = '400px';
    }

    // Prepare data for Chart.js
    const labels = data.map(item => {
      const date = new Date(item.time);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const closePrices = data.map(item => parseFloat(item.close));
    const highPrices = data.map(item => parseFloat(item.high));
    const lowPrices = data.map(item => parseFloat(item.low));

    // Get current price for reference line
    const currentPrice = closePrices[closePrices.length - 1];

    // Create chart
    const ctx = chartCanvas.getContext('2d');
    modifyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Close Price',
            data: closePrices,
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: 'High',
            data: highPrices,
            borderColor: 'rgba(76, 175, 80, 0.3)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderDash: [5, 5]
          },
          {
            label: 'Low',
            data: lowPrices,
            borderColor: 'rgba(244, 67, 54, 0.3)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2.5,
        plugins: {
          title: {
            display: true,
            text: `${symbol} - 3 Month Daily Chart`,
            color: '#e0e0e0',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#e0e0e0',
              usePointStyle: true
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#e0e0e0',
            bodyColor: '#e0e0e0',
            borderColor: '#444',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(5)}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#888',
              maxRotation: 45,
              minRotation: 45,
              maxTicksLimit: 15
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            ticks: {
              color: '#888',
              callback: function(value) {
                return value.toFixed(5);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        }
      }
    });

    console.log(`Modify chart plotted successfully with ${data.length} data points`);
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
      <div class="modal-content trade-confirmation-modal">
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
        
        <!-- 3 Month Daily Chart -->
        <div class="chart-container-wrapper">
          <h3 style="margin-top: 20px; margin-bottom: 10px;">📊 3-Month Daily Chart</h3>
          <div id="modifyChartLoading" class="chart-loading" style="text-align: center; padding: 20px; color: #888;">
            Loading chart data...
          </div>
          <div id="modifyChartError" class="chart-error" style="display: none; text-align: center; padding: 20px; color: #f44336;">
            Failed to load chart data
          </div>
          <canvas id="modifyChart" style="display: none; max-height: 400px; width: 100%; height: 400px;"></canvas>
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

// Price testing function for console debugging


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
  
  // Add test button for Twilio alert nodes
  if (node.type === 'twilio-alert') {
    actionButtons += `
      <button class="btn btn-info btn-small" onclick="testTwilioAlert('${node.id}')">
        📱 Test Alert
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
  
  // Add test button for python-script node
  if (node.type === 'python-script') {
    actionButtons += `
      <button class="btn btn-success btn-small" onclick="testPythonScript('${node.id}')">
        🐍 Run Script
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

// Test Twilio alert function
async function testTwilioAlert(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  if (!node || node.type !== 'twilio-alert') {
    showMessage('Please select a Twilio alert node first', 'error');
    return;
  }
  
  if (!isConnected) {
    showMessage('Please connect to MT5 first to test Twilio alerts', 'error');
    return;
  }
  
  try {
    showMessage('Testing Twilio alert...', 'info');
    
    // Prepare test message
    let testMessage = node.params.message || 'Test alert from MT5 Trader node';
    
    // Add account info if requested
    if (node.params.includeAccountInfo) {
      try {
        const accountInfo = await window.mt5API.getAccountInfo();
        if (accountInfo.success && accountInfo.data) {
          const acc = accountInfo.data;
          testMessage += `\n\nAccount Info:\nBalance: $${acc.balance}\nEquity: $${acc.equity}\nProfit: $${acc.profit}`;
        }
      } catch (error) {
        console.warn('Could not fetch account info for test alert:', error);
      }
    }
    
    // Add position info if requested
    if (node.params.includePositions) {
      try {
        const positions = await window.mt5API.getPositions();
        if (positions.success && positions.data && positions.data.length > 0) {
          testMessage += `\n\nOpen Positions: ${positions.data.length}`;
          positions.data.forEach((pos, index) => {
            if (index < 3) { // Limit to first 3 positions
              testMessage += `\n${pos.symbol} ${pos.type} ${pos.volume} P/L: $${pos.profit.toFixed(2)}`;
            }
          });
          if (positions.data.length > 3) {
            testMessage += `\n... and ${positions.data.length - 3} more`;
          }
        } else {
          testMessage += '\n\nNo open positions';
        }
      } catch (error) {
        console.warn('Could not fetch positions for test alert:', error);
      }
    }
    
    // Send test alert
    const result = await window.mt5API.sendTwilioAlert({
      message: testMessage,
      toNumber: node.params.recipient || '', // Use node-specific recipient or default
      method: node.params.method || 'sms'
    });
    
    if (result.success && result.data && result.data.success) {
      showMessage('✓ Test Twilio alert sent successfully! Check your phone.', 'success');
    } else {
      showMessage(`✗ Test Twilio alert failed: ${result.data?.error || result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error testing Twilio alert:', error);
    showMessage(`Test Twilio alert error: ${error.message}`, 'error');
  }
}

// Test Python Script function
async function testPythonScript(nodeId) {
  const node = nodeEditor.nodes.find(n => n.id == nodeId);
  if (!node || node.type !== 'python-script') {
    showMessage('Please select a Python Script node first', 'error');
    return;
  }
  
  if (!isConnected) {
    showMessage('Please connect to MT5 first to execute Python scripts', 'error');
    return;
  }
  
  if (!node.params.script || !node.params.script.trim()) {
    showMessage('Please enter a Python script first', 'error');
    return;
  }
  
  try {
    showMessage('Executing Python script...', 'info');
    
    // Get input data if useStringInput is enabled
    let inputData = '';
    if (node.params.useStringInput) {
      // Check if there's a string input connected
      const stringConnection = nodeEditor.connections.find(c => c.to === node && c.toInput === 1);
      if (stringConnection) {
        if (stringConnection.from.type === 'string-input') {
          inputData = stringConnection.from.params.value || '';
        } else if (stringConnection.from.type === 'string-output') {
          inputData = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
        } else if (stringConnection.from.type === 'llm-node') {
          inputData = stringConnection.from.llmResponse || '';
        } else if (stringConnection.from.type === 'yfinance-data') {
          inputData = stringConnection.from.fetchedData || '';
        } else if (stringConnection.from.type === 'firecrawl-node') {
          inputData = stringConnection.from.firecrawlData || '';
        } else if (stringConnection.from.type === 'python-script') {
          inputData = stringConnection.from.pythonOutput || '';
        }
      }
    }
    
    // Execute the script
    const result = await window.mt5API.executePythonScript({
      script: node.params.script,
      inputData: inputData,
      inputVarName: node.params.inputVarName || 'input_data'
    });
    
    if (result.success && result.data) {
      node.pythonOutput = result.data.output || '';
      showMessage(`✓ Python script executed successfully!\nOutput: ${node.pythonOutput}`, 'success');
      
      // Update properties panel to show the output
      updatePropertiesPanel(node);
    } else {
      showMessage(`✗ Python script failed: ${result.data?.error || result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error testing Python script:', error);
    showMessage(`Python script error: ${error.message}`, 'error');
  }
}

// Make functions globally available

window.testEndStrategy = testEndStrategy;
window.testTwilioAlert = testTwilioAlert;
window.testPythonScript = testPythonScript;

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

async function updateTradeJournalDisplay() {
  const journalContent = document.getElementById('tradeJournalContent');
  const filterInput = document.getElementById('tradeJournalFilter');
  const filterValue = filterInput ? filterInput.value.toLowerCase().trim() : '';
  
  if (!journalContent) {
    console.error('Trade journal content element not found');
    return;
  }
  
  // Get all trades from journal
  const trades = Object.values(tradeJournal).filter(trade => trade && trade.imagePath);
  
  if (trades.length === 0) {
    journalContent.innerHTML = '<p class="no-log">No trades with charts found yet. Charts will appear here after executing trades.</p>';
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
  
  journalContent.innerHTML = tradeEntries.join('');
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
  document.getElementById('settingsTestOvertradeBtn').onclick = testOvertradeFromSettings;
  document.getElementById('addVolumeLimitBtn').onclick = addVolumeLimit;
  document.getElementById('testTwilioBtn').onclick = testTwilioConnection;
  document.getElementById('testTelegramBtn').onclick = testTelegramConnection;
  document.getElementById('testFirecrawlBtn').onclick = testFirecrawlConnection;
  document.getElementById('testOpenRouterBtn').onclick = testOpenRouterConnection;
  document.getElementById('testAlphaVantageBtn').onclick = testAlphaVantageConnection;
  
  // Simulator mode event listeners
  document.getElementById('settingsSimulatorMode').onchange = async (e) => {
    const enabled = e.target.value === 'true';
    await toggleSimulatorMode(enabled);
  };
  document.getElementById('resetSimulatorBtn').onclick = resetSimulator;
  
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
  document.getElementById('settingsApplyToOpenPositions').checked = settings.applyToOpenPositions;
  document.getElementById('settingsApplyToClosePositions').checked = settings.applyToClosePositions;
  
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
    window.overtradeControl.settings.applyToOpenPositions = document.getElementById('settingsApplyToOpenPositions').checked;
    window.overtradeControl.settings.applyToClosePositions = document.getElementById('settingsApplyToClosePositions').checked;
    
    window.overtradeControl.saveSettings();
    await window.overtradeControl.updateStatusDisplay();
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

async function testOvertradeFromSettings() {
  if (window.overtradeControl) {
    await window.overtradeControl.simulateOpenPositionsForTesting();
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

// Debug function to test connection toggle
window.testConnectionToggle = function() {
  console.log('=== CONNECTION TOGGLE TEST ===');
  console.log('Current connection state:', isConnected);
  console.log('Button text:', document.getElementById('connectBtn').textContent);
  console.log('Button class:', document.getElementById('connectBtn').className);
  console.log('=== END TEST ===');
  
  return {
    isConnected,
    buttonText: document.getElementById('connectBtn').textContent,
    buttonClass: document.getElementById('connectBtn').className
  };
};

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

async function testTwilioConnection() {
  const testBtn = document.getElementById('testTwilioBtn');
  const resultDiv = document.getElementById('twilioTestResult');
  
  // Disable button and show loading
  testBtn.disabled = true;
  testBtn.textContent = 'Sending...';
  resultDiv.style.display = 'none';
  
  try {
    const settings = getCurrentTwilioSettings();
    
    if (!settings.recipientNumber) {
      showTwilioTestResult('error', 'Please enter a recipient number first');
      return;
    }
    
    // Save settings first to ensure they're applied
    await saveTwilioSettings();
    
    // Send test message
    const response = await window.mt5API.sendTwilioAlert({
      message: 'Test message from MT5 Trader',
      toNumber: settings.recipientNumber,
      method: settings.method
    });
    
    if (response && response.data) {
      if (response.data.success) {
        showTwilioTestResult('success', `Test message sent successfully! Check your ${settings.method.toUpperCase()}.`);
      } else {
        showTwilioTestResult('error', `Failed to send test message: ${response.data.error}`);
      }
    } else {
      showTwilioTestResult('error', 'No response from server');
    }
  } catch (error) {
    console.error('Error testing Twilio connection:', error);
    showTwilioTestResult('error', `Error: ${error.message}`);
  } finally {
    // Re-enable button
    testBtn.disabled = false;
    testBtn.textContent = 'Send Test Twilio';
  }
}

function showTwilioTestResult(type, message) {
  const resultDiv = document.getElementById('twilioTestResult');
  resultDiv.className = `test-result ${type}`;
  resultDiv.textContent = message;
  resultDiv.style.display = 'block';
  
  // Hide after 5 seconds
  setTimeout(() => {
    resultDiv.style.display = 'none';
  }, 5000);
}

async function testTelegramConnection() {
  const testBtn = document.getElementById('testTelegramBtn');
  const resultDiv = document.getElementById('telegramTestResult');
  
  // Disable button and show loading
  testBtn.disabled = true;
  testBtn.textContent = 'Sending...';
  resultDiv.style.display = 'none';
  
  try {
    const settings = getCurrentTelegramSettings();
    
    if (!settings.botToken || !settings.chatId) {
      showTelegramTestResult('error', 'Please enter bot token and chat ID first');
      return;
    }
    
    // Save settings first to ensure they're applied
    await saveTwilioSettings();
    
    // Send test message
    if (window.mt5API && window.mt5API.sendTelegramAlert) {
      const response = await window.mt5API.sendTelegramAlert({
        message: 'Test message from MT5 Trader',
        chatId: settings.chatId
      });
      
      if (response && response.data) {
        if (response.data.success) {
          showTelegramTestResult('success', 'Test message sent successfully! Check your Telegram.');
        } else {
          showTelegramTestResult('error', `Failed to send test message: ${response.data.error}`);
        }
      } else {
        showTelegramTestResult('error', 'No response from server');
      }
    } else {
      showTelegramTestResult('info', 'Telegram test: Settings saved. Backend API integration pending.');
    }
  } catch (error) {
    console.error('Error testing Telegram connection:', error);
    showTelegramTestResult('error', `Error: ${error.message}`);
  } finally {
    // Re-enable button
    testBtn.disabled = false;
    testBtn.textContent = 'Send Test Telegram';
  }
}

function showTelegramTestResult(type, message) {
  const resultDiv = document.getElementById('telegramTestResult');
  resultDiv.className = `test-result ${type}`;
  resultDiv.textContent = message;
  resultDiv.style.display = 'block';
  
  // Hide after 5 seconds
  setTimeout(() => {
    resultDiv.style.display = 'none';
  }, 5000);
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

async function testFirecrawlConnection() {
  const testBtn = document.getElementById('testFirecrawlBtn');
  const resultDiv = document.getElementById('aiTestResult');
  
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  
  try {
    const apiKey = document.getElementById('settingsFirecrawlApiKey').value;
    const baseUrl = document.getElementById('settingsFirecrawlBaseUrl').value;
    
    if (!apiKey) {
      showAiTestResult('error', 'Please enter a Firecrawl API key');
      return;
    }
    
    // Test with a simple scrape request
    const response = await fetch(`${baseUrl}/v0/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://example.com',
        formats: ['markdown']
      })
    });
    
    if (response.ok) {
      showAiTestResult('success', 'Firecrawl connection successful!');
    } else {
      const error = await response.text();
      showAiTestResult('error', `Firecrawl test failed: ${response.status} - ${error}`);
    }
    
  } catch (error) {
    showAiTestResult('error', `Firecrawl connection error: ${error.message}`);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Firecrawl';
  }
}

async function testOpenRouterConnection() {
  const testBtn = document.getElementById('testOpenRouterBtn');
  const resultDiv = document.getElementById('aiTestResult');
  
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  
  try {
    const apiKey = document.getElementById('settingsOpenRouterApiKey').value;
    const baseUrl = document.getElementById('settingsOpenRouterBaseUrl').value;
    const model = document.getElementById('settingsOpenRouterModel').value;
    
    if (!apiKey) {
      showAiTestResult('error', 'Please enter an OpenRouter API key');
      return;
    }
    
    // Test with a simple completion request
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: 'Hello, this is a test message.' }
        ],
        max_tokens: 10
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      showAiTestResult('success', `OpenRouter connection successful! Model: ${model}`);
    } else {
      const error = await response.text();
      showAiTestResult('error', `OpenRouter test failed: ${response.status} - ${error}`);
    }
    
  } catch (error) {
    showAiTestResult('error', `OpenRouter connection error: ${error.message}`);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test OpenRouter';
  }
}

async function testAlphaVantageConnection() {
  const testBtn = document.getElementById('testAlphaVantageBtn');
  const resultDiv = document.getElementById('aiTestResult');
  
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  
  try {
    const apiKey = document.getElementById('settingsAlphaVantageApiKey').value;
    const baseUrl = document.getElementById('settingsAlphaVantageBaseUrl').value;
    
    if (!apiKey) {
      showAiTestResult('error', 'Please enter an Alpha Vantage API key');
      return;
    }
    
    // Test with a simple API call (TIME_SERIES_INTRADAY)
    const testUrl = `${baseUrl}?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey=${apiKey}`;
    const response = await fetch(testUrl);
    
    if (response.ok) {
      const data = await response.json();
      if (data['Error Message']) {
        showAiTestResult('error', `Alpha Vantage error: ${data['Error Message']}`);
      } else if (data['Note']) {
        showAiTestResult('warning', `Alpha Vantage note: ${data['Note']}`);
      } else if (data['Meta Data']) {
        showAiTestResult('success', 'Alpha Vantage connection successful!');
      } else {
        showAiTestResult('success', 'Alpha Vantage connection successful!');
      }
    } else {
      const error = await response.text();
      showAiTestResult('error', `Alpha Vantage test failed: ${response.status} - ${error}`);
    }
    
  } catch (error) {
    showAiTestResult('error', `Alpha Vantage connection error: ${error.message}`);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Alpha Vantage';
  }
}

function showAiTestResult(type, message) {
  const resultDiv = document.getElementById('aiTestResult');
  resultDiv.className = `test-result ${type}`;
  resultDiv.textContent = message;
  resultDiv.style.display = 'block';
  
  // Hide after 5 seconds
  setTimeout(() => {
    resultDiv.style.display = 'none';
  }, 5000);
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
