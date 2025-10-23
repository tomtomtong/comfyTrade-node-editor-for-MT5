// Historical Data Import Module
let historySymbolInput = null;
let importedHistoryData = null;

function initializeHistoryImport() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchImportTab(tab);
    });
  });

  // Set default dates (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  document.getElementById('historyStartDate').valueAsDate = startDate;
  document.getElementById('historyEndDate').valueAsDate = endDate;

  // Initialize symbol input
  const container = document.getElementById('historySymbolInput');
  if (container && isConnected) {
    historySymbolInput = new SymbolInput(container, {
      placeholder: 'Enter symbol (e.g., EURUSD)',
      onSymbolSelect: (symbol, symbolData) => {
        console.log('Selected symbol for history:', symbol);
      }
    });
  }
}

function switchImportTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.import-tab').forEach(tabContent => {
    tabContent.classList.remove('active');
  });

  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`${tab}ImportTab`).classList.add('active');
}

function showBacktestModal() {
  if (!isConnected) {
    showMessage('Please connect to MT5 first to import from MT5', 'warning');
    // Still allow CSV import without connection
  }

  // Initialize if not already done
  if (!historySymbolInput && isConnected) {
    initializeHistoryImport();
  }

  document.getElementById('backtestModal').classList.add('show');
}

function hideBacktestModal() {
  document.getElementById('backtestModal').classList.remove('show');
  document.getElementById('historyStatus').innerHTML = '';
}

async function handleImportHistory() {
  const activeTab = document.querySelector('.import-tab.active').id;

  if (activeTab === 'mt5ImportTab') {
    await importFromMT5();
  } else {
    await importFromCSV();
  }
}

async function importFromMT5() {
  if (!isConnected) {
    showMessage('Please connect to MT5 first', 'error');
    return;
  }

  const symbol = historySymbolInput ? historySymbolInput.getValue() : '';
  const timeframe = document.getElementById('historyTimeframe').value;
  const startDate = document.getElementById('historyStartDate').value;
  const endDate = document.getElementById('historyEndDate').value;
  const bars = document.getElementById('historyBars').value;

  if (!symbol) {
    showMessage('Please enter a symbol', 'error');
    return;
  }

  const statusDiv = document.getElementById('historyStatus');
  statusDiv.innerHTML = '<p class="loading">Importing data from MT5...</p>';

  try {
    const params = {
      symbol,
      timeframe,
      startDate: startDate ? new Date(startDate).toISOString() : null,
      endDate: endDate ? new Date(endDate).toISOString() : null,
      bars: bars ? parseInt(bars) : null
    };

    const result = await window.mt5API.getHistoricalData(params);

    if (result.success && result.data) {
      importedHistoryData = result.data;
      
      statusDiv.innerHTML = `
        <div class="success-message">
          <p>✓ Backtest mode activated with ${result.data.bars} bars</p>
          <p>Symbol: ${result.data.symbol}</p>
          <p>Timeframe: ${result.data.timeframe}</p>
          <p>Date range: ${new Date(result.data.data[0].time).toLocaleDateString()} - ${new Date(result.data.data[result.data.data.length - 1].time).toLocaleDateString()}</p>
        </div>
      `;

      // Store in settings for backtesting
      if (window.settingsManager) {
        window.settingsManager.set('historicalData', importedHistoryData);
      }
      
      showMessage(`Backtest mode activated with ${result.data.bars} bars!`, 'success');
      
      // Enable backtest mode
      enableBacktestMode();
      
      setTimeout(() => {
        hideBacktestModal();
      }, 2000);
    } else {
      statusDiv.innerHTML = `<p class="error-message">Error: ${result.data?.error || result.error}</p>`;
      showMessage('Failed to import data', 'error');
    }
  } catch (error) {
    statusDiv.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
    showMessage('Import error: ' + error.message, 'error');
  }
}

async function importFromCSV() {
  const fileInput = document.getElementById('csvFileInput');
  const symbol = document.getElementById('csvSymbol').value;

  if (!fileInput.files || fileInput.files.length === 0) {
    showMessage('Please select a CSV file', 'error');
    return;
  }

  if (!symbol) {
    showMessage('Please enter a symbol name', 'error');
    return;
  }

  const file = fileInput.files[0];
  const statusDiv = document.getElementById('historyStatus');
  statusDiv.innerHTML = '<p class="loading">Reading CSV file...</p>';

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    // Skip header if present
    const startIndex = lines[0].toLowerCase().includes('date') ? 1 : 0;
    
    const data = [];
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 6) {
        // Expected format: Date,Time,Open,High,Low,Close,Volume
        const dateStr = parts[0].trim();
        const timeStr = parts[1] ? parts[1].trim() : '00:00:00';
        const datetime = new Date(`${dateStr} ${timeStr}`);
        
        if (!isNaN(datetime.getTime())) {
          data.push({
            time: datetime.toISOString(),
            open: parseFloat(parts[2]),
            high: parseFloat(parts[3]),
            low: parseFloat(parts[4]),
            close: parseFloat(parts[5]),
            volume: parts[6] ? parseInt(parts[6]) : 0
          });
        }
      }
    }

    if (data.length === 0) {
      throw new Error('No valid data found in CSV file');
    }

    importedHistoryData = {
      symbol: symbol,
      timeframe: 'CSV',
      bars: data.length,
      data: data
    };

    statusDiv.innerHTML = `
      <div class="success-message">
        <p>✓ Backtest mode activated with ${data.length} bars from CSV</p>
        <p>Symbol: ${symbol}</p>
        <p>Date range: ${new Date(data[0].time).toLocaleDateString()} - ${new Date(data[data.length - 1].time).toLocaleDateString()}</p>
      </div>
    `;

    // Store in settings for backtesting
    if (window.settingsManager) {
      window.settingsManager.set('historicalData', importedHistoryData);
    }
    
    showMessage(`Backtest mode activated with ${data.length} bars from CSV!`, 'success');
    
    // Enable backtest mode
    enableBacktestMode();
    
    setTimeout(() => {
      hideBacktestModal();
    }, 2000);
  } catch (error) {
    statusDiv.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
    showMessage('CSV import error: ' + error.message, 'error');
  }
}

function enableBacktestMode() {
  // Add visual indicator that backtest mode is active
  const toolbar = document.querySelector('.toolbar-left');
  let backtestIndicator = document.getElementById('backtestIndicator');
  
  if (!backtestIndicator) {
    backtestIndicator = document.createElement('div');
    backtestIndicator.id = 'backtestIndicator';
    backtestIndicator.className = 'status backtest';
    backtestIndicator.innerHTML = '📊 Backtest Mode';
    toolbar.appendChild(backtestIndicator);
  }

  // Add exit backtest button if not exists
  let clearHistoryBtn = document.getElementById('clearHistoryBtn');
  if (!clearHistoryBtn) {
    clearHistoryBtn = document.createElement('button');
    clearHistoryBtn.id = 'clearHistoryBtn';
    clearHistoryBtn.className = 'btn btn-warning btn-small';
    clearHistoryBtn.textContent = 'Exit Backtest';
    clearHistoryBtn.addEventListener('click', clearHistoricalData);
    document.querySelector('.toolbar-right').insertBefore(
      clearHistoryBtn,
      document.getElementById('executeGraphBtn')
    );
  }
}

function clearHistoricalData() {
  // Use global confirmation function if available, otherwise fallback to confirm
  if (typeof showConfirmation === 'function') {
    showConfirmation(
      'Exit Backtest Mode',
      'Exit backtest mode and clear historical data?',
      () => {
        executeClearHistoricalData();
      }
    );
  } else {
    if (confirm('Exit backtest mode and clear historical data?')) {
      executeClearHistoricalData();
    }
  }
}

function executeClearHistoricalData() {
  if (window.settingsManager) {
    window.settingsManager.set('historicalData', null);
  }
  importedHistoryData = null;
  
  const indicator = document.getElementById('backtestIndicator');
  if (indicator) indicator.remove();
  
  const clearBtn = document.getElementById('clearHistoryBtn');
  if (clearBtn) clearBtn.remove();
  
  showMessage('Backtest mode exited', 'info');
}

function getHistoricalData() {
  if (!importedHistoryData && window.settingsManager) {
    const stored = window.settingsManager.get('historicalData');
    if (stored) {
      importedHistoryData = stored;
    }
  }
  return importedHistoryData;
}

// Check if backtest mode should be enabled on load
function checkBacktestMode() {
  if (window.settingsManager) {
    const stored = window.settingsManager.get('historicalData');
    if (stored) {
      importedHistoryData = stored;
    enableBacktestMode();
  }
}

// Export functions for use in renderer.js
window.historyImport = {
  showBacktestModal,
  hideBacktestModal,
  handleImportHistory,
  getHistoricalData,
  checkBacktestMode,
  clearHistoricalData
};
