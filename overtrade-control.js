// Overtrade Control System - Restricts opening positions when limit is exceeded
// Only affects open positions, not close positions or other operations
// Now supports separate controls for real trading and simulator
class OvertradeControl {
  constructor() {
    // Default settings for real trading
    const defaultRealSettings = {
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
    
    // Default settings for simulator (can have different limits)
    const defaultSimulatorSettings = {
      enabled: true,
      maxTrades: 10, // Higher limit for simulator
      timePeriod: 'hour',
      reminderFrequency: 'first',
      applyToManual: true,
      applyToStrategy: true,
      applyToNodes: true,
      applyToOpenPositions: true,
      applyToClosePositions: false
    };
    
    // Separate settings for real and simulator
    this.settingsReal = { ...defaultRealSettings };
    this.settingsSimulator = { ...defaultSimulatorSettings };
    
    // Separate trade history for real and simulator
    this.tradeHistoryReal = [];
    this.tradeHistorySimulator = [];
    
    // Separate warning tracking
    this.lastWarningTimeReal = null;
    this.lastWarningTimeSimulator = null;
    this.warningCountReal = 0;
    this.warningCountSimulator = 0;
    
    this.cachedOpenPositionsCount = 0;
    
    // Don't load settings here - wait for settings manager to be ready
    this.settingsLoaded = false;
    this.setupEventListeners();
    this.startPeriodicCleanup();
  }
  
  // Get current settings based on mode
  getCurrentSettings() {
    return this.isSimulatorModeSync() ? this.settingsSimulator : this.settingsReal;
  }
  
  // Get current trade history based on mode
  getCurrentTradeHistory() {
    return this.isSimulatorModeSync() ? this.tradeHistorySimulator : this.tradeHistoryReal;
  }
  
  // Set current trade history based on mode
  setCurrentTradeHistory(history) {
    if (this.isSimulatorModeSync()) {
      this.tradeHistorySimulator = history;
    } else {
      this.tradeHistoryReal = history;
    }
  }
  
  // Get current warning time based on mode
  getCurrentLastWarningTime() {
    return this.isSimulatorModeSync() ? this.lastWarningTimeSimulator : this.lastWarningTimeReal;
  }
  
  // Set current warning time based on mode
  setCurrentLastWarningTime(time) {
    if (this.isSimulatorModeSync()) {
      this.lastWarningTimeSimulator = time;
    } else {
      this.lastWarningTimeReal = time;
    }
  }
  
  // Get current warning count based on mode
  getCurrentWarningCount() {
    return this.isSimulatorModeSync() ? this.warningCountSimulator : this.warningCountReal;
  }
  
  // Set current warning count based on mode
  setCurrentWarningCount(count) {
    if (this.isSimulatorModeSync()) {
      this.warningCountSimulator = count;
    } else {
      this.warningCountReal = count;
    }
  }
  
  // Synchronous check for simulator mode (for internal use)
  isSimulatorModeSync() {
    // Try to get from cached settings first
    if (window.settingsManager && window.settingsManager.settings) {
      return window.settingsManager.settings.simulatorMode === true;
    }
    return false;
  }

  loadSettings() {
    try {
      if (window.settingsManager && window.settingsManager.settings) {
        // Load real trading settings
        const savedReal = window.settingsManager.get('overtradeControlReal');
        if (savedReal) {
          this.settingsReal = { ...this.settingsReal, ...savedReal };
        } else {
          // Migrate old settings to real if they exist
          const saved = window.settingsManager.get('overtradeControl');
          if (saved) {
            this.settingsReal = { ...this.settingsReal, ...saved };
          }
        }
        
        // Load simulator settings
        const savedSimulator = window.settingsManager.get('overtradeControlSimulator');
        if (savedSimulator) {
          this.settingsSimulator = { ...this.settingsSimulator, ...savedSimulator };
        }
        
        // Load real trading history
        const historyReal = window.settingsManager.get('overtradeHistoryReal');
        if (historyReal) {
          this.tradeHistoryReal = historyReal;
        } else {
          // Migrate old history to real if it exists
          const history = window.settingsManager.get('overtradeHistory');
          if (history) {
            this.tradeHistoryReal = history;
          }
        }
        this.cleanupOldTrades();
        
        // Load simulator history
        const historySimulator = window.settingsManager.get('overtradeHistorySimulator');
        if (historySimulator) {
          this.tradeHistorySimulator = historySimulator;
        }
        
        // Load real warning data
        const lastWarningReal = window.settingsManager.get('overtradeLastWarningReal');
        if (lastWarningReal) {
          this.lastWarningTimeReal = lastWarningReal;
        } else {
          // Migrate old warning time to real if it exists
          const lastWarning = window.settingsManager.get('overtradeLastWarning');
          if (lastWarning) {
            this.lastWarningTimeReal = lastWarning;
          }
        }
        
        const warningCountReal = window.settingsManager.get('overtradeWarningCountReal');
        if (warningCountReal !== undefined) {
          this.warningCountReal = warningCountReal;
        } else {
          // Migrate old warning count to real if it exists
          const warningCount = window.settingsManager.get('overtradeWarningCount');
          if (warningCount !== undefined) {
            this.warningCountReal = warningCount;
          }
        }
        
        // Load simulator warning data
        const lastWarningSimulator = window.settingsManager.get('overtradeLastWarningSimulator');
        if (lastWarningSimulator) {
          this.lastWarningTimeSimulator = lastWarningSimulator;
        }
        
        const warningCountSimulator = window.settingsManager.get('overtradeWarningCountSimulator');
        if (warningCountSimulator !== undefined) {
          this.warningCountSimulator = warningCountSimulator;
        }
        
        this.settingsLoaded = true;
      } else {
        // Settings manager not ready yet, retry in 100ms
        setTimeout(() => this.loadSettings(), 100);
        return;
      }
      
      const currentSettings = this.getCurrentSettings();
      const currentHistory = this.getCurrentTradeHistory();
      const currentWarning = this.getCurrentLastWarningTime();
      
      console.log('Overtrade control loaded:', {
        mode: this.isSimulatorModeSync() ? 'simulator' : 'real',
        settings: currentSettings,
        tradeCount: currentHistory.length,
        lastWarning: currentWarning ? new Date(currentWarning).toLocaleString() : 'Never',
        realTradeCount: this.tradeHistoryReal.length,
        simulatorTradeCount: this.tradeHistorySimulator.length
      });
    } catch (error) {
      console.error('Error loading overtrade settings:', error);
    }
  }

  async saveSettings() {
    try {
      if (window.settingsManager) {
        await window.settingsManager.update({
          'overtradeControlReal': this.settingsReal,
          'overtradeControlSimulator': this.settingsSimulator,
          'overtradeHistoryReal': this.tradeHistoryReal,
          'overtradeHistorySimulator': this.tradeHistorySimulator,
          'overtradeLastWarningReal': this.lastWarningTimeReal || 0,
          'overtradeLastWarningSimulator': this.lastWarningTimeSimulator || 0,
          'overtradeWarningCountReal': this.warningCountReal,
          'overtradeWarningCountSimulator': this.warningCountSimulator
        });
        
        const currentSettings = this.getCurrentSettings();
        const currentHistory = this.getCurrentTradeHistory();
        
        console.log('Overtrade data saved:', {
          mode: this.isSimulatorModeSync() ? 'simulator' : 'real',
          tradeCount: currentHistory.length,
          settings: currentSettings,
          realTradeCount: this.tradeHistoryReal.length,
          simulatorTradeCount: this.tradeHistorySimulator.length
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
    const settings = this.getCurrentSettings();
    return periods[settings.timePeriod] || periods.hour;
  }

  cleanupOldTrades() {
    const cutoffTime = Date.now() - this.getTimePeriodMs();
    const history = this.getCurrentTradeHistory();
    const cleaned = history.filter(trade => trade.timestamp > cutoffTime);
    this.setCurrentTradeHistory(cleaned);
    
    // Also cleanup the other mode's history
    const otherCutoffTime = Date.now() - this.getTimePeriodMsForMode(!this.isSimulatorModeSync());
    if (this.isSimulatorModeSync()) {
      this.tradeHistoryReal = this.tradeHistoryReal.filter(trade => trade.timestamp > otherCutoffTime);
    } else {
      this.tradeHistorySimulator = this.tradeHistorySimulator.filter(trade => trade.timestamp > otherCutoffTime);
    }
  }
  
  getTimePeriodMsForMode(isSimulator) {
    const periods = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    };
    const settings = isSimulator ? this.settingsSimulator : this.settingsReal;
    return periods[settings.timePeriod] || periods.hour;
  }

  getCurrentPeriodTrades() {
    // Count trades within the current time period
    this.cleanupOldTrades();
    return this.getCurrentTradeHistory().length;
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
    const settings = this.getCurrentSettings();
    if (!settings.enabled) return false;
    
    // Check if this trade type should trigger reminders
    const typeMap = {
      manual: settings.applyToManual,
      strategy: settings.applyToStrategy,
      node: settings.applyToNodes
    };
    
    if (!typeMap[tradeType]) return false;
    
    // Check if this position action type should trigger reminders
    const isOpenPosition = this.isNewPositionTrade(tradeData);
    const isClosePosition = this.isClosePositionTrade(tradeData);
    
    if (isOpenPosition && !settings.applyToOpenPositions) return false;
    if (isClosePosition && !settings.applyToClosePositions) return false;
    
    // Get current period trade count
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    
    // Check if we've reached the threshold
    if (currentPeriodTrades < settings.maxTrades) return false;
    
    // Check reminder frequency
    const lastWarning = this.getCurrentLastWarningTime();
    switch (settings.reminderFrequency) {
      case 'every':
        return true;
      case 'first':
        return !lastWarning || (Date.now() - lastWarning) > this.getTimePeriodMs();
      case 'periodic':
        return (currentPeriodTrades - settings.maxTrades) % 3 === 0;
      default:
        return true;
    }
  }

  async recordTrade(tradeType, tradeData = {}) {
    const settings = this.getCurrentSettings();
    const history = this.getCurrentTradeHistory();
    
    // Record trades based on settings - can include both open and close positions
    const isOpenPosition = this.isNewPositionTrade(tradeData);
    const isClosePosition = this.isClosePositionTrade(tradeData);
    
    // Check if we should record this type of trade
    const shouldRecord = (isOpenPosition && settings.applyToOpenPositions) || 
                        (isClosePosition && settings.applyToClosePositions);
    
    if (!shouldRecord) {
      console.log('Trade not recorded - type not tracked:', {
        mode: this.isSimulatorModeSync() ? 'simulator' : 'real',
        type: tradeType,
        action: tradeData.action || 'unknown',
        isOpen: isOpenPosition,
        isClose: isClosePosition,
        trackOpen: settings.applyToOpenPositions,
        trackClose: settings.applyToClosePositions
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
    
    history.push(trade);
    this.setCurrentTradeHistory(history);
    
    // Save immediately after recording trade
    this.saveSettings();
    
    // Update display
    this.updateStatusDisplay();
    
    console.log('Trade recorded:', {
      mode: this.isSimulatorModeSync() ? 'simulator' : 'real',
      type: tradeType,
      action: trade.action,
      positionType: trade.positionType,
      totalTrades: history.length,
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
      const settings = this.getCurrentSettings();
      
      // Check if overtrade control is enabled for current mode
      if (!settings.enabled) {
        resolve(true);
        return;
      }
      
      // Check if this is an open position trade
      const isOpenPosition = this.isNewPositionTrade(tradeData);
      const isClosePosition = this.isClosePositionTrade(tradeData);
      
      // Overtrade control only affects open positions, not close positions
      if (isClosePosition) {
        // Always allow closing positions
        resolve(true);
        return;
      }
      
      // Only check and restrict open positions
      if (!isOpenPosition) {
        // If it's not clearly an open position, allow it (for backward compatibility)
        resolve(true);
        return;
      }
      
      // Check if this trade type should be restricted
      const typeMap = {
        manual: settings.applyToManual,
        strategy: settings.applyToStrategy,
        node: settings.applyToNodes
      };
      
      if (!typeMap[tradeType]) {
        // This trade type is not restricted
        resolve(true);
        return;
      }
      
      // Check if open positions are being tracked
      if (!settings.applyToOpenPositions) {
        // Open positions are not being tracked, allow the trade
        resolve(true);
        return;
      }
      
      // Get current period trade count
      const currentPeriodTrades = this.getCurrentPeriodTrades();
      
      // If limit is exceeded, BLOCK the trade (don't allow proceeding)
      if (currentPeriodTrades >= settings.maxTrades) {
        // Show warning message but block the trade
        this.showOvertradeBlockedMessage(currentPeriodTrades, settings);
        resolve(false); // Block the trade
        return;
      }
      
      // Limit not exceeded, record and allow the trade
      await this.recordTrade(tradeType, tradeData);
      resolve(true);
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
    const settings = this.getCurrentSettings();
    const periodName = settings.timePeriod;
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
    const settings = this.getCurrentSettings();
    const periodName = settings.timePeriod;
    const mode = this.isSimulatorModeSync() ? 'Simulator' : 'Real Trading';
    const alertMessage = `⚠️ Overtrade Alert (${mode}): ${currentPeriodTrades} trades this ${periodName}!`;
    
    if (typeof showMessage === 'function') {
      showMessage(alertMessage, 'error');
      
      // Show additional popup after a short delay for emphasis
      setTimeout(() => {
        showMessage(`Trades: ${currentPeriodTrades}/${settings.maxTrades} limit this ${periodName}`, 'warning');
      }, 3500);
    }
    
    // Also log to console for debugging
    console.warn('Trade limit exceeded:', {
      mode: this.isSimulatorModeSync() ? 'simulator' : 'real',
      currentPeriodTrades: currentPeriodTrades,
      threshold: settings.maxTrades,
      period: periodName,
      message: `${currentPeriodTrades} trades exceed limit of ${settings.maxTrades} for this ${periodName}`
    });
  }

  showOvertradeBlockedMessage(currentPeriodTrades, settings) {
    // Update the persistent panel
    this.updatePersistentPanel(currentPeriodTrades);
    
    // Show blocking message
    const periodName = settings.timePeriod;
    const mode = this.isSimulatorModeSync() ? 'Simulator' : 'Real Trading';
    const blockedMessage = `🚫 Trade BLOCKED (${mode}): Limit of ${settings.maxTrades} trades per ${periodName} reached (${currentPeriodTrades} trades). Opening new positions is restricted.`;
    
    if (typeof showMessage === 'function') {
      showMessage(blockedMessage, 'error');
    }
    
    // Also log to console for debugging
    console.warn('Trade blocked by overtrade control:', {
      mode: this.isSimulatorModeSync() ? 'simulator' : 'real',
      currentPeriodTrades: currentPeriodTrades,
      threshold: settings.maxTrades,
      period: periodName,
      message: `Opening position blocked: ${currentPeriodTrades} trades exceed limit of ${settings.maxTrades} for this ${periodName}`
    });
  }



  hideWarningModal() {
    document.getElementById('overtradeWarningModal').classList.remove('show');
  }

  async proceedWithTrade() {
    this.setCurrentLastWarningTime(Date.now());
    this.setCurrentWarningCount(this.getCurrentWarningCount() + 1);
    
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
    const settings = this.getCurrentSettings();
    settings.enabled = false;
    this.saveSettings();
    await this.proceedWithTrade();
    const mode = this.isSimulatorModeSync() ? 'simulator' : 'real trading';
    showMessage(`Overtrade reminders disabled for ${mode}`, 'info');
  }

  saveConfig() {
    // This method is now handled by the settings modal
    console.log('saveConfig called - now handled by settings modal');
  }

  getNextResetTime() {
    const history = this.getCurrentTradeHistory();
    if (history.length === 0) return 'No trades recorded';
    
    const oldestTrade = Math.min(...history.map(t => t.timestamp));
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
    const history = this.getCurrentTradeHistory();
    if (history.length === 0) return 'No trades';
    
    const oldestTrade = Math.min(...history.map(t => t.timestamp));
    return new Date(oldestTrade).toLocaleString();
  }

  async resetTradeCount() {
    this.setCurrentTradeHistory([]);
    this.setCurrentLastWarningTime(null);
    this.setCurrentWarningCount(0);
    this.cachedOpenPositionsCount = 0;
    this.saveSettings();
    await this.updateStatusDisplay();
    const mode = this.isSimulatorModeSync() ? 'simulator' : 'real trading';
    showMessage(`Trade count reset for ${mode}`, 'info');
  }

  async updateStatusDisplay() {
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    const settings = this.getCurrentSettings();
    const remaining = Math.max(0, settings.maxTrades - currentPeriodTrades);
    const lastWarning = this.getCurrentLastWarningTime();
    const lastWarningStr = lastWarning ? new Date(lastWarning).toLocaleString() : 'Never';
    const nextReset = this.getNextResetTime();
    
    // Update settings modal display if elements exist
    const settingsCurrentTradeCountEl = document.getElementById('settingsCurrentTradeCount');
    const settingsRemainingTradesEl = document.getElementById('settingsRemainingTrades');
    const settingsNextResetEl = document.getElementById('settingsNextReset');
    const settingsLastWarningEl = document.getElementById('settingsLastWarning');
    
    if (settingsCurrentTradeCountEl) settingsCurrentTradeCountEl.textContent = currentPeriodTrades;
    if (settingsRemainingTradesEl) settingsRemainingTradesEl.textContent = remaining;
    if (settingsNextResetEl) settingsNextResetEl.textContent = nextReset;
    if (settingsLastWarningEl) settingsLastWarningEl.textContent = lastWarningStr;
    
    // Update persistent panel
    this.updatePersistentPanel(currentPeriodTrades);
    
    // Update toolbar status
    this.updateToolbarStatus(currentPeriodTrades);
  }

  updatePersistentPanel(currentPeriodTrades) {
    const settings = this.getCurrentSettings();
    if (!settings.enabled) {
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
    const mode = this.isSimulatorModeSync() ? 'Simulator' : 'Real';
    if (countEl) countEl.textContent = currentPeriodTrades;
    if (limitEl) limitEl.textContent = settings.maxTrades;
    if (periodEl) periodEl.textContent = `this ${settings.timePeriod} (${mode})`;
    if (resetEl) {
      resetEl.textContent = this.getNextResetTime();
    }

    // Determine status level
    const isOverLimit = currentPeriodTrades >= settings.maxTrades;
    const isNearLimit = currentPeriodTrades >= settings.maxTrades * 0.8;

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
      if (text) text.textContent = `TRADE LIMIT EXCEEDED THIS ${settings.timePeriod.toUpperCase()}! (${mode})`;
      if (messageEl) messageEl.style.display = 'flex';
    } else if (isNearLimit) {
      // Warning state - near limit
      panel.classList.add('warning');
      indicator.classList.add('warning');
      icon.classList.add('warning');
      text.classList.add('warning');
      if (countEl) countEl.classList.add('warning');
      
      if (icon) icon.textContent = '⚠️';
      if (text) text.textContent = `Approaching Trade Limit This ${settings.timePeriod} (${mode})`;
      if (messageEl) messageEl.style.display = 'none';
    } else {
      // Safe state
      if (icon) icon.textContent = '✅';
      if (text) text.textContent = `Safe - Trades This ${settings.timePeriod} (${mode})`;
      if (messageEl) messageEl.style.display = 'none';
    }
  }

  updateToolbarStatus(currentPeriodTrades) {
    const statusEl = document.getElementById('overtradeStatus');
    const displayEl = document.getElementById('tradeCountDisplay');
    
    if (!statusEl || !displayEl) return;
    
    const settings = this.getCurrentSettings();
    if (!settings.enabled) {
      statusEl.style.display = 'none';
      return;
    }
    
    statusEl.style.display = 'block';
    const mode = this.isSimulatorModeSync() ? 'S' : 'R';
    displayEl.textContent = `${currentPeriodTrades}/${settings.maxTrades} ${settings.timePeriod} (${mode})`;
    
    // Update status color based on trade count
    statusEl.classList.remove('warning', 'danger');
    
    if (currentPeriodTrades >= settings.maxTrades) {
      statusEl.classList.add('danger');
    } else if (currentPeriodTrades >= settings.maxTrades * 0.8) {
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
      const historyReal = this.tradeHistoryReal.length;
      const historySimulator = this.tradeHistorySimulator.length;
      this.cleanupOldTrades();
      const afterReal = this.tradeHistoryReal.length;
      const afterSimulator = this.tradeHistorySimulator.length;
      
      const cleanedReal = historyReal - afterReal;
      const cleanedSimulator = historySimulator - afterSimulator;
      
      if (cleanedReal > 0 || cleanedSimulator > 0) {
        console.log(`Cleaned up ${cleanedReal} real trades and ${cleanedSimulator} simulator trades`);
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
    const settings = this.getCurrentSettings();
    return {
      enabled: settings.enabled,
      currentPeriodTrades,
      threshold: settings.maxTrades,
      mode: 'time_period',
      tradingMode: this.isSimulatorModeSync() ? 'simulator' : 'real',
      timePeriod: settings.timePeriod,
      isOverThreshold: currentPeriodTrades >= settings.maxTrades,
      trackingOpen: settings.applyToOpenPositions,
      trackingClose: settings.applyToClosePositions
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
      settingsReal: this.settingsReal,
      settingsSimulator: this.settingsSimulator,
      tradeHistoryReal: this.tradeHistoryReal,
      tradeHistorySimulator: this.tradeHistorySimulator,
      lastWarningTimeReal: this.lastWarningTimeReal,
      lastWarningTimeSimulator: this.lastWarningTimeSimulator,
      warningCountReal: this.warningCountReal,
      warningCountSimulator: this.warningCountSimulator,
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
    
    showMessage('Overtrade data exported (both real and simulator)', 'success');
  }

  // Import data from backup
  importData(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      // Support both old format (single settings) and new format (separate real/simulator)
      if (data.settingsReal) {
        this.settingsReal = data.settingsReal;
      } else if (data.settings) {
        // Migrate old format to real
        this.settingsReal = data.settings;
      }
      
      if (data.settingsSimulator) {
        this.settingsSimulator = data.settingsSimulator;
      }
      
      if (data.tradeHistoryReal) {
        this.tradeHistoryReal = data.tradeHistoryReal;
      } else if (data.tradeHistory) {
        // Migrate old format to real
        this.tradeHistoryReal = data.tradeHistory;
      }
      
      if (data.tradeHistorySimulator) {
        this.tradeHistorySimulator = data.tradeHistorySimulator;
      }
      
      if (data.lastWarningTimeReal) {
        this.lastWarningTimeReal = data.lastWarningTimeReal;
      } else if (data.lastWarningTime) {
        // Migrate old format to real
        this.lastWarningTimeReal = data.lastWarningTime;
      }
      
      if (data.lastWarningTimeSimulator) {
        this.lastWarningTimeSimulator = data.lastWarningTimeSimulator;
      }
      
      if (data.warningCountReal !== undefined) {
        this.warningCountReal = data.warningCountReal;
      } else if (data.warningCount !== undefined) {
        // Migrate old format to real
        this.warningCountReal = data.warningCount;
      }
      
      if (data.warningCountSimulator !== undefined) {
        this.warningCountSimulator = data.warningCountSimulator;
      }
      
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
    // Clear from settings manager
    if (window.settingsManager) {
      window.settingsManager.update({
        'overtradeControlReal': null,
        'overtradeControlSimulator': null,
        'overtradeHistoryReal': [],
        'overtradeHistorySimulator': [],
        'overtradeLastWarningReal': 0,
        'overtradeLastWarningSimulator': 0,
        'overtradeWarningCountReal': 0,
        'overtradeWarningCountSimulator': 0
      });
    }
    
    this.tradeHistoryReal = [];
    this.tradeHistorySimulator = [];
    this.lastWarningTimeReal = null;
    this.lastWarningTimeSimulator = null;
    this.warningCountReal = 0;
    this.warningCountSimulator = 0;
    
    this.updateStatusDisplay();
    showMessage('All overtrade data cleared (both real and simulator)', 'info');
  }

  // Get detailed status for debugging
  async getDetailedStatus() {
    const currentPeriodTrades = this.getCurrentPeriodTrades();
    const currentOpenPositions = await this.getCurrentOpenPositions();
    const settings = this.getCurrentSettings();
    const history = this.getCurrentTradeHistory();
    const lastWarning = this.getCurrentLastWarningTime();
    const warningCount = this.getCurrentWarningCount();
    
    return {
      enabled: settings.enabled,
      settings: settings,
      tradingMode: this.isSimulatorModeSync() ? 'simulator' : 'real',
      mode: 'time_period_based',
      currentPeriodTrades: currentPeriodTrades,
      currentOpenPositions: currentOpenPositions,
      threshold: settings.maxTrades,
      timePeriod: settings.timePeriod,
      totalTradesRecorded: history.length,
      oldestTrade: history.length > 0 ? new Date(history[0].timestamp).toLocaleString() : 'None',
      newestTrade: history.length > 0 ? new Date(history[history.length - 1].timestamp).toLocaleString() : 'None',
      nextReset: this.getNextResetTime(),
      periodStart: this.getPeriodStartTime(),
      lastWarning: lastWarning ? new Date(lastWarning).toLocaleString() : 'Never',
      warningCount: warningCount,
      trackingOpen: settings.applyToOpenPositions,
      trackingClose: settings.applyToClosePositions,
      mt5Connected: window.mt5Bridge ? window.mt5Bridge.isConnected() : false,
      realTradeCount: this.tradeHistoryReal.length,
      simulatorTradeCount: this.tradeHistorySimulator.length,
      note: 'Now counting trades within time periods. Separate tracking for real trading and simulator. Tracks both open and close positions based on settings.'
    };
  }
}

// Initialize overtrade control
window.overtradeControl = new OvertradeControl();

// Add console helper for debugging
console.log('Overtrade Control initialized. Now counting trades within time periods. Use window.overtradeControl.getDetailedStatus() to check status.');