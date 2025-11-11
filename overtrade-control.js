// Overtrade Control System - Reminder-based (non-blocking)
class OvertradeControl {
  constructor() {
    this.settings = {
      enabled: true,
      maxTrades: 5,
      timePeriod: 'hour', // minute, hour, day, week
      reminderFrequency: 'first', // every, first, periodic
      applyToManual: true,
      applyToStrategy: true,
      applyToNodes: true,
      applyToOpenPositions: true,
      applyToClosePositions: false
    };
    
    this.tradeHistory = [];
    this.lastWarningTime = null;
    this.warningCount = 0;
    this.cachedOpenPositionsCount = 0;
    
    // Don't load settings here - wait for settings manager to be ready
    this.settingsLoaded = false;
    this.setupEventListeners();
    this.startPeriodicCleanup();
  }

  loadSettings() {
    try {
      if (window.settingsManager && window.settingsManager.settings) {
        const saved = window.settingsManager.get('overtradeControl');
        if (saved) {
          this.settings = { ...this.settings, ...saved };
        }
        
        const history = window.settingsManager.get('overtradeHistory');
        if (history) {
          this.tradeHistory = history;
          this.cleanupOldTrades();
        }
        
        const lastWarning = window.settingsManager.get('overtradeLastWarning');
        if (lastWarning) {
          this.lastWarningTime = lastWarning;
        }
        
        const warningCount = window.settingsManager.get('overtradeWarningCount');
        if (warningCount) {
          this.warningCount = warningCount;
        }
        
        this.settingsLoaded = true;
      } else {
        // Settings manager not ready yet, retry in 100ms
        setTimeout(() => this.loadSettings(), 100);
        return;
      }
      
      console.log('Overtrade control loaded:', {
        settings: this.settings,
        tradeCount: this.tradeHistory.length,
        lastWarning: this.lastWarningTime ? new Date(this.lastWarningTime).toLocaleString() : 'Never'
      });
    } catch (error) {
      console.error('Error loading overtrade settings:', error);
    }
  }

  async saveSettings() {
    try {
      if (window.settingsManager) {
        await window.settingsManager.update({
          'overtradeControl': this.settings,
          'overtradeHistory': this.tradeHistory,
          'overtradeLastWarning': this.lastWarningTime || 0,
          'overtradeWarningCount': this.warningCount
        });
        
        console.log('Overtrade data saved:', {
          tradeCount: this.tradeHistory.length,
          settings: this.settings
        });
      }
    } catch (error) {
      console.error('Error saving overtrade settings:', error);
    }
  }

  setupEventListeners() {
    // Warning modal controls
    document.getElementById('proceedTradeBtn').addEventListener('click', () => this.proceedWithTrade());
    document.getElementById('cancelTradeFromWarningBtn').addEventListener('click', () => this.cancelTradeFromWarning());
    document.getElementById('disableRemindersBtn').addEventListener('click', () => this.disableReminders());
  }

  getTimePeriodMs() {
    const periods = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    };
    return periods[this.settings.timePeriod] || periods.hour;
  }

  cleanupOldTrades() {
    const cutoffTime = Date.now() - this.getTimePeriodMs();
    this.tradeHistory = this.tradeHistory.filter(trade => trade.timestamp > cutoffTime);
  }

  getCurrentPeriodTrades() {
    // Count trades within the current time period
    this.cleanupOldTrades();
    return this.tradeHistory.length;
  }

  async getCurrentOpenPositions() {
    // Get current open positions from MT5
    try {
      if (window.mt5Bridge && window.mt5Bridge.isConnected()) {
        const positions = await window.mt5Bridge.getPositions();
        this.cachedOpenPositionsCount = positions ? positions.length : 0;
        return this.cachedOpenPositionsCount;
      } else {
        // If not connected to MT5, fall back to 0
        this.cachedOpenPositionsCount = 0;
        return 0;
      }
    } catch (error) {
      console.error('Error getting open positions:', error);
      this.cachedOpenPositionsCount = 0;
      return 0;
    }
  }

  async isSimulatorMode() {
    // Check if simulator mode is enabled
    try {
      // First try to get simulator status from MT5 API
      if (window.mt5API && window.mt5API.getSimulatorStatus) {
        const result = await window.mt5API.getSimulatorStatus();
        if (result && result.simulator_mode) {
          return true;
        }
      }
      // Fallback: check settings file directly
      if (window.electronAPI && window.electronAPI.loadSettings) {
        const settings = await window.electronAPI.loadSettings('app_settings.json');
        if (settings && settings.simulatorMode === true) {
          return true;
        }
      }
    } catch (error) {
      // If API call fails, try fallback to settings file
      try {
        if (window.electronAPI && window.electronAPI.loadSettings) {
          const settings = await window.electronAPI.loadSettings('app_settings.json');
          if (settings && settings.simulatorMode === true) {
            return true;
          }
        }
      } catch (fallbackError) {
        console.error('Error checking simulator mode:', fallbackError);
      }
    }
    return false;
  }

  async shouldShowReminder(tradeType, tradeData = {}) {
    if (!this.settings.enabled) return false;
    
    // Don't show reminders in simulator mode
    if (await this.isSimulatorMode()) {
      return false;
    }
    
    // Check if this trade type should trigger reminders
    const typeMap = {
      manual: this.settings.applyToManual,
      strategy: this.settings.applyToStrategy,
      node: this.settings.applyToNodes
    };
    
    if (!typeMap[tradeType]) return false;
    
    // Check if this position action type should trigger reminders
    const isOpenPosition = this.isNewPositionTrade(tradeData);
    const isClosePosition = this.isClosePositionTrade(tradeData);
    
    if (isOpenPosition && !this.settings.applyToOpenPositions) return false;
    if (isClosePosition && !this.settings.applyToClosePositions) return false;
    
    // Get current period trade count
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    
    // Check if we've reached the threshold
    if (currentPeriodTrades < this.settings.maxTrades) return false;
    
    // Check reminder frequency
    switch (this.settings.reminderFrequency) {
      case 'every':
        return true;
      case 'first':
        return !this.lastWarningTime || (Date.now() - this.lastWarningTime) > this.getTimePeriodMs();
      case 'periodic':
        return (currentPeriodTrades - this.settings.maxTrades) % 3 === 0;
      default:
        return true;
    }
  }

  async recordTrade(tradeType, tradeData = {}) {
    // Don't record trades in simulator mode
    if (await this.isSimulatorMode()) {
      console.log('Trade not recorded - simulator mode is enabled');
      return;
    }
    
    // Record trades based on settings - can include both open and close positions
    const isOpenPosition = this.isNewPositionTrade(tradeData);
    const isClosePosition = this.isClosePositionTrade(tradeData);
    
    // Check if we should record this type of trade
    const shouldRecord = (isOpenPosition && this.settings.applyToOpenPositions) || 
                        (isClosePosition && this.settings.applyToClosePositions);
    
    if (!shouldRecord) {
      console.log('Trade not recorded - type not tracked:', {
        type: tradeType,
        action: tradeData.action || 'unknown',
        isOpen: isOpenPosition,
        isClose: isClosePosition,
        trackOpen: this.settings.applyToOpenPositions,
        trackClose: this.settings.applyToClosePositions
      });
      return;
    }
    
    const trade = {
      timestamp: Date.now(),
      type: tradeType,
      data: tradeData,
      action: tradeData.action || (isOpenPosition ? 'open_position' : 'close_position'),
      positionType: isOpenPosition ? 'open' : 'close'
    };
    
    this.tradeHistory.push(trade);
    
    // Save immediately after recording trade
    this.saveSettings();
    
    // Update display
    this.updateStatusDisplay();
    
    console.log('Trade recorded:', {
      type: tradeType,
      action: trade.action,
      positionType: trade.positionType,
      totalTrades: this.tradeHistory.length,
      currentPeriodTrades: this.getCurrentPeriodTrades()
    });
  }

  isNewPositionTrade(tradeData) {
    // Check if this is a new position trade vs position management
    const action = tradeData.action;
    
    // Explicitly exclude position management actions
    if (action === 'closePosition' || action === 'modifyPosition') {
      return false;
    }
    
    // Include new position actions
    if (action === 'executeOrder' || action === 'executeStrategy' || action === 'executeNodeStrategy') {
      return true;
    }
    
    // For manual trades and other cases, assume it's a new position unless specified otherwise
    // This maintains backward compatibility
    return true;
  }

  isClosePositionTrade(tradeData) {
    // Check if this is a close position trade
    const action = tradeData.action;
    
    // Explicitly include close position actions
    if (action === 'closePosition') {
      return true;
    }
    
    // Check for other close indicators
    if (tradeData.orderType === 'close' || tradeData.type === 'close') {
      return true;
    }
    
    return false;
  }

  async checkAndShowReminder(tradeType, tradeData = {}) {
    return new Promise(async (resolve) => {
      // Skip overtrade control in simulator mode
      if (await this.isSimulatorMode()) {
        console.log('Overtrade control skipped - simulator mode is enabled');
        resolve(true);
        return;
      }
      
      const shouldShow = await this.shouldShowReminder(tradeType);
      if (shouldShow) {
        this.pendingTradeResolve = resolve;
        this.pendingTradeData = { type: tradeType, data: tradeData };
        this.showWarningModal();
      } else {
        // Record the trade and proceed
        await this.recordTrade(tradeType, tradeData);
        resolve(true);
      }
    });
  }

  showConfigModal() {
    // Redirect to settings modal with overtrade control tab
    if (typeof showSettingsModal === 'function') {
      showSettingsModal();
      // Switch to overtrade control tab after a short delay
      setTimeout(() => {
        if (typeof switchSettingsTab === 'function') {
          switchSettingsTab('overtradeControl');
        }
      }, 100);
    }
  }

  hideConfigModal() {
    // This method is kept for compatibility but no longer needed
    console.log('hideConfigModal called - now handled by settings modal');
  }

  async showWarningModal() {
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    const periodName = this.settings.timePeriod;
    const nextReset = this.getNextResetTime();
    
    // Show immediate popup notification
    this.showOvertradePopup(currentPeriodTrades);
    
    document.getElementById('warningTradeCount').textContent = currentPeriodTrades;
    document.getElementById('warningTimePeriod').textContent = `trades this ${periodName}`;
    document.getElementById('warningFrequency').textContent = `${currentPeriodTrades} trades this ${periodName}`;
    document.getElementById('warningPeriodStart').textContent = this.getPeriodStartTime();
    document.getElementById('warningNextReset').textContent = nextReset;
    
    document.getElementById('overtradeWarningModal').classList.add('show');
  }

  showOvertradePopup(currentPeriodTrades) {
    // Update the persistent panel instead of showing popup
    this.updatePersistentPanel(currentPeriodTrades);
    
    // Show message notification for immediate feedback
    const periodName = this.settings.timePeriod;
    const alertMessage = `⚠️ Overtrade Alert: ${currentPeriodTrades} trades this ${periodName}!`;
    
    if (typeof showMessage === 'function') {
      showMessage(alertMessage, 'error');
      
      // Show additional popup after a short delay for emphasis
      setTimeout(() => {
        showMessage(`Trades: ${currentPeriodTrades}/${this.settings.maxTrades} limit this ${periodName}`, 'warning');
      }, 3500);
    }
    
    // Also log to console for debugging
    console.warn('Trade limit exceeded:', {
      currentPeriodTrades: currentPeriodTrades,
      threshold: this.settings.maxTrades,
      period: periodName,
      message: `${currentPeriodTrades} trades exceed limit of ${this.settings.maxTrades} for this ${periodName}`
    });
  }



  hideWarningModal() {
    document.getElementById('overtradeWarningModal').classList.remove('show');
  }

  async proceedWithTrade() {
    this.lastWarningTime = Date.now();
    this.warningCount++;
    
    // Record the trade
    if (this.pendingTradeData) {
      await this.recordTrade(this.pendingTradeData.type, this.pendingTradeData.data);
    }
    
    // Save warning data immediately
    this.saveSettings();
    
    this.hideWarningModal();
    
    if (this.pendingTradeResolve) {
      this.pendingTradeResolve(true);
      this.pendingTradeResolve = null;
      this.pendingTradeData = null;
    }
  }

  cancelTradeFromWarning() {
    this.hideWarningModal();
    
    if (this.pendingTradeResolve) {
      this.pendingTradeResolve(false);
      this.pendingTradeResolve = null;
      this.pendingTradeData = null;
    }
  }

  async disableReminders() {
    this.settings.enabled = false;
    this.saveSettings();
    await this.proceedWithTrade();
    showMessage('Overtrade reminders disabled', 'info');
  }

  saveConfig() {
    // This method is now handled by the settings modal
    console.log('saveConfig called - now handled by settings modal');
  }

  getNextResetTime() {
    if (this.tradeHistory.length === 0) return 'No trades recorded';
    
    const oldestTrade = Math.min(...this.tradeHistory.map(t => t.timestamp));
    const resetTime = oldestTrade + this.getTimePeriodMs();
    const now = Date.now();
    
    if (resetTime <= now) return 'Next trade will start new period';
    
    const timeLeft = resetTime - now;
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  getPeriodStartTime() {
    if (this.tradeHistory.length === 0) return 'No trades';
    
    const oldestTrade = Math.min(...this.tradeHistory.map(t => t.timestamp));
    return new Date(oldestTrade).toLocaleString();
  }

  async resetTradeCount() {
    this.tradeHistory = [];
    this.lastWarningTime = null;
    this.warningCount = 0;
    this.cachedOpenPositionsCount = 0;
    this.saveSettings();
    await this.updateStatusDisplay();
    showMessage('Trade count reset', 'info');
  }

  async updateStatusDisplay() {
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    const remaining = Math.max(0, this.settings.maxTrades - currentPeriodTrades);
    const lastWarning = this.lastWarningTime ? new Date(this.lastWarningTime).toLocaleString() : 'Never';
    const nextReset = this.getNextResetTime();
    
    // Update settings modal display if elements exist
    const settingsCurrentTradeCountEl = document.getElementById('settingsCurrentTradeCount');
    const settingsRemainingTradesEl = document.getElementById('settingsRemainingTrades');
    const settingsNextResetEl = document.getElementById('settingsNextReset');
    const settingsLastWarningEl = document.getElementById('settingsLastWarning');
    
    if (settingsCurrentTradeCountEl) settingsCurrentTradeCountEl.textContent = currentPeriodTrades;
    if (settingsRemainingTradesEl) settingsRemainingTradesEl.textContent = remaining;
    if (settingsNextResetEl) settingsNextResetEl.textContent = nextReset;
    if (settingsLastWarningEl) settingsLastWarningEl.textContent = lastWarning;
    
    // Update persistent panel
    this.updatePersistentPanel(currentPeriodTrades);
    
    // Update toolbar status
    this.updateToolbarStatus(currentPeriodTrades);
  }

  updatePersistentPanel(currentPeriodTrades) {
    if (!this.settings.enabled) {
      // Hide the panel if overtrade control is disabled
      const panel = document.getElementById('overtradeReminderPanel');
      if (panel) panel.style.display = 'none';
      return;
    }

    const panel = document.getElementById('overtradeReminderPanel');
    const indicator = document.getElementById('overtradeIndicator');
    const icon = document.getElementById('indicatorIcon');
    const text = document.getElementById('indicatorText');
    const countEl = document.getElementById('currentTradeCount');
    const limitEl = document.getElementById('tradeLimit');
    const periodEl = document.getElementById('timePeriodDisplay');
    const resetEl = document.getElementById('nextResetTime');
    const messageEl = document.getElementById('overtradeMessage');

    if (!panel) return;

    // Show the panel
    panel.style.display = 'block';

    // Update basic info
    if (countEl) countEl.textContent = currentPeriodTrades;
    if (limitEl) limitEl.textContent = this.settings.maxTrades;
    if (periodEl) periodEl.textContent = `this ${this.settings.timePeriod}`;
    if (resetEl) {
      resetEl.textContent = this.getNextResetTime();
    }

    // Determine status level
    const isOverLimit = currentPeriodTrades >= this.settings.maxTrades;
    const isNearLimit = currentPeriodTrades >= this.settings.maxTrades * 0.8;

    // Reset all classes
    panel.classList.remove('warning', 'danger');
    indicator.classList.remove('warning', 'danger');
    icon.classList.remove('warning', 'danger');
    text.classList.remove('warning', 'danger');
    if (countEl) countEl.classList.remove('warning', 'danger');

    if (isOverLimit) {
      // Danger state - over limit
      panel.classList.add('danger');
      indicator.classList.add('danger');
      icon.classList.add('danger');
      text.classList.add('danger');
      if (countEl) countEl.classList.add('danger');
      
      if (icon) icon.textContent = '🚨';
      if (text) text.textContent = `TRADE LIMIT EXCEEDED THIS ${this.settings.timePeriod.toUpperCase()}!`;
      if (messageEl) messageEl.style.display = 'flex';
    } else if (isNearLimit) {
      // Warning state - near limit
      panel.classList.add('warning');
      indicator.classList.add('warning');
      icon.classList.add('warning');
      text.classList.add('warning');
      if (countEl) countEl.classList.add('warning');
      
      if (icon) icon.textContent = '⚠️';
      if (text) text.textContent = `Approaching Trade Limit This ${this.settings.timePeriod}`;
      if (messageEl) messageEl.style.display = 'none';
    } else {
      // Safe state
      if (icon) icon.textContent = '✅';
      if (text) text.textContent = `Safe - Trades This ${this.settings.timePeriod}`;
      if (messageEl) messageEl.style.display = 'none';
    }
  }

  updateToolbarStatus(currentPeriodTrades) {
    const statusEl = document.getElementById('overtradeStatus');
    const displayEl = document.getElementById('tradeCountDisplay');
    
    if (!statusEl || !displayEl) return;
    
    if (!this.settings.enabled) {
      statusEl.style.display = 'none';
      return;
    }
    
    statusEl.style.display = 'block';
    displayEl.textContent = `${currentPeriodTrades}/${this.settings.maxTrades} ${this.settings.timePeriod}`;
    
    // Update status color based on trade count
    statusEl.classList.remove('warning', 'danger');
    
    if (currentPeriodTrades >= this.settings.maxTrades) {
      statusEl.classList.add('danger');
    } else if (currentPeriodTrades >= this.settings.maxTrades * 0.8) {
      statusEl.classList.add('warning');
    }
  }

  startPeriodicCleanup() {
    // Update open positions count every 30 seconds
    setInterval(async () => {
      await this.getCurrentOpenPositions();
      await this.updateStatusDisplay();
    }, 30000);
    
    // Clean up old trades every minute (still needed for historical data)
    setInterval(() => {
      const beforeCount = this.tradeHistory.length;
      this.cleanupOldTrades();
      const afterCount = this.tradeHistory.length;
      
      if (beforeCount !== afterCount) {
        console.log(`Cleaned up ${beforeCount - afterCount} old trades`);
        this.saveSettings();
      }
    }, 60000);
    
    // Save data every 5 minutes as backup
    setInterval(() => {
      this.saveSettings();
      console.log('Backup save completed');
    }, 300000);
    
    // Save before window closes
    window.addEventListener('beforeunload', () => {
      this.saveSettings();
      console.log('Saving overtrade data before close');
    });
    
    // Initial status update
    setTimeout(async () => {
      await this.updateStatusDisplay();
    }, 100);
  }

  // Public method to check before executing trades
  async checkBeforeTrade(tradeType, tradeData = {}) {
    return await this.checkAndShowReminder(tradeType, tradeData);
  }

  // Method to record position management actions (doesn't count towards overtrade)
  recordPositionManagement(action, tradeData = {}) {
    console.log('Position management action recorded (not counted for overtrade):', {
      action,
      data: tradeData,
      timestamp: new Date().toLocaleString()
    });
    
    // Could store these separately if needed for analytics
    // For now, just log them
  }

  // Get current status for display
  async getStatus() {
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    return {
      enabled: this.settings.enabled,
      currentPeriodTrades,
      threshold: this.settings.maxTrades,
      mode: 'time_period',
      timePeriod: this.settings.timePeriod,
      isOverThreshold: currentPeriodTrades >= this.settings.maxTrades,
      trackingOpen: this.settings.applyToOpenPositions,
      trackingClose: this.settings.applyToClosePositions
    };
  }

  // Test method to simulate open positions for testing
  async simulateOpenPositionsForTesting(count = 5) {
    // Simulate open positions by setting the cached count
    this.cachedOpenPositionsCount = count;
    
    // Update the persistent panel
    await this.updateStatusDisplay();
    
    showMessage(`Simulated ${count} open positions for testing`, 'info');
    console.log(`Simulated ${count} open positions. Use resetTradeCount() to clear.`);
  }

  // Export data for backup
  exportData() {
    const data = {
      settings: this.settings,
      tradeHistory: this.tradeHistory,
      lastWarningTime: this.lastWarningTime,
      warningCount: this.warningCount,
      exportDate: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overtrade-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showMessage('Overtrade data exported', 'success');
  }

  // Import data from backup
  importData(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      if (data.settings) this.settings = data.settings;
      if (data.tradeHistory) this.tradeHistory = data.tradeHistory;
      if (data.lastWarningTime) this.lastWarningTime = data.lastWarningTime;
      if (data.warningCount) this.warningCount = data.warningCount;
      
      this.saveSettings();
      this.updateStatusDisplay();
      
      showMessage('Overtrade data imported successfully', 'success');
      console.log('Imported data from:', data.exportDate);
    } catch (error) {
      console.error('Error importing data:', error);
      showMessage('Failed to import data', 'error');
    }
  }

  // Clear all data (for testing or reset)
  clearAllData() {
    // Use global confirmation function if available, otherwise fallback to confirm
    if (typeof showConfirmation === 'function') {
      showConfirmation(
        'Clear Overtrade Data',
        'Are you sure you want to clear all overtrade data? This cannot be undone.',
        () => {
          this.executeClearAllData();
        }
      );
    } else {
      if (confirm('Are you sure you want to clear all overtrade data? This cannot be undone.')) {
        this.executeClearAllData();
      }
    }
  }
  
  executeClearAllData() {
    localStorage.removeItem('overtradeSettings');
    localStorage.removeItem('overtradeHistory');
    localStorage.removeItem('overtradeLastWarning');
    localStorage.removeItem('overtradeWarningCount');
    
    this.tradeHistory = [];
    this.lastWarningTime = null;
    this.warningCount = 0;
    
    this.updateStatusDisplay();
    showMessage('All overtrade data cleared', 'info');
  }

  // Get detailed status for debugging
  async getDetailedStatus() {
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    const currentOpenPositions = await this.getCurrentOpenPositions();
    return {
      enabled: this.settings.enabled,
      settings: this.settings,
      mode: 'time_period_based',
      currentPeriodTrades: currentPeriodTrades,
      currentOpenPositions: currentOpenPositions,
      threshold: this.settings.maxTrades,
      timePeriod: this.settings.timePeriod,
      totalTradesRecorded: this.tradeHistory.length,
      oldestTrade: this.tradeHistory.length > 0 ? new Date(this.tradeHistory[0].timestamp).toLocaleString() : 'None',
      newestTrade: this.tradeHistory.length > 0 ? new Date(this.tradeHistory[this.tradeHistory.length - 1].timestamp).toLocaleString() : 'None',
      nextReset: this.getNextResetTime(),
      periodStart: this.getPeriodStartTime(),
      lastWarning: this.lastWarningTime ? new Date(this.lastWarningTime).toLocaleString() : 'Never',
      warningCount: this.warningCount,
      trackingOpen: this.settings.applyToOpenPositions,
      trackingClose: this.settings.applyToClosePositions,
      mt5Connected: window.mt5Bridge ? window.mt5Bridge.isConnected() : false,
      note: 'Now counting trades within time periods. Tracks both open and close positions based on settings.'
    };
  }
}

// Initialize overtrade control
window.overtradeControl = new OvertradeControl();

// Add console helper for debugging
console.log('Overtrade Control initialized. Now counting trades within time periods. Use window.overtradeControl.getDetailedStatus() to check status.');