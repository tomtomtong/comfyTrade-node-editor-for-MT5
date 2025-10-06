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
      applyToNodes: true
    };
    
    this.tradeHistory = [];
    this.lastWarningTime = null;
    this.warningCount = 0;
    
    this.loadSettings();
    this.setupEventListeners();
    this.startPeriodicCleanup();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('overtradeSettings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
      
      const history = localStorage.getItem('overtradeHistory');
      if (history) {
        this.tradeHistory = JSON.parse(history);
        this.cleanupOldTrades();
      }
      
      // Load last warning time
      const lastWarning = localStorage.getItem('overtradeLastWarning');
      if (lastWarning) {
        this.lastWarningTime = parseInt(lastWarning);
      }
      
      // Load warning count
      const warningCount = localStorage.getItem('overtradeWarningCount');
      if (warningCount) {
        this.warningCount = parseInt(warningCount);
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

  saveSettings() {
    try {
      localStorage.setItem('overtradeSettings', JSON.stringify(this.settings));
      localStorage.setItem('overtradeHistory', JSON.stringify(this.tradeHistory));
      localStorage.setItem('overtradeLastWarning', this.lastWarningTime ? this.lastWarningTime.toString() : '0');
      localStorage.setItem('overtradeWarningCount', this.warningCount.toString());
      
      console.log('Overtrade data saved:', {
        tradeCount: this.tradeHistory.length,
        settings: this.settings
      });
    } catch (error) {
      console.error('Error saving overtrade settings:', error);
    }
  }

  setupEventListeners() {
    // Modal controls
    document.getElementById('overtradeConfigBtn').addEventListener('click', () => this.showConfigModal());
    document.getElementById('saveOvertradeBtn').addEventListener('click', () => this.saveConfig());
    document.getElementById('resetTradeCountBtn').addEventListener('click', () => this.resetTradeCount());
    document.getElementById('testOvertradeBtn').addEventListener('click', () => this.simulateTradesForTesting());
    document.getElementById('cancelOvertradeBtn').addEventListener('click', () => this.hideConfigModal());
    
    // Warning modal controls
    document.getElementById('proceedTradeBtn').addEventListener('click', () => this.proceedWithTrade());
    document.getElementById('cancelTradeFromWarningBtn').addEventListener('click', () => this.cancelTradeFromWarning());
    document.getElementById('disableRemindersBtn').addEventListener('click', () => this.disableReminders());
    
    // No popup controls needed - using persistent panel
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
    this.cleanupOldTrades();
    return this.tradeHistory.length;
  }

  shouldShowReminder(tradeType) {
    if (!this.settings.enabled) return false;
    
    // Check if this trade type should trigger reminders
    const typeMap = {
      manual: this.settings.applyToManual,
      strategy: this.settings.applyToStrategy,
      node: this.settings.applyToNodes
    };
    
    if (!typeMap[tradeType]) return false;
    
    const currentTrades = this.getCurrentPeriodTrades();
    
    // Check if we've reached the threshold
    if (currentTrades < this.settings.maxTrades) return false;
    
    // Check reminder frequency
    switch (this.settings.reminderFrequency) {
      case 'every':
        return true;
      case 'first':
        return !this.lastWarningTime || (Date.now() - this.lastWarningTime) > this.getTimePeriodMs();
      case 'periodic':
        return (currentTrades - this.settings.maxTrades) % 3 === 0;
      default:
        return true;
    }
  }

  recordTrade(tradeType, tradeData = {}) {
    const trade = {
      timestamp: Date.now(),
      type: tradeType,
      data: tradeData
    };
    
    this.tradeHistory.push(trade);
    
    // Save immediately after recording trade
    this.saveSettings();
    
    // Update display
    this.updateStatusDisplay();
    
    console.log('Trade recorded:', {
      type: tradeType,
      totalTrades: this.tradeHistory.length,
      currentPeriodTrades: this.getCurrentPeriodTrades()
    });
  }

  checkAndShowReminder(tradeType, tradeData = {}) {
    return new Promise((resolve) => {
      if (this.shouldShowReminder(tradeType)) {
        this.pendingTradeResolve = resolve;
        this.pendingTradeData = { type: tradeType, data: tradeData };
        this.showWarningModal();
      } else {
        // Record the trade and proceed
        this.recordTrade(tradeType, tradeData);
        resolve(true);
      }
    });
  }

  showConfigModal() {
    // Populate form with current settings
    document.getElementById('overtradeEnabled').value = this.settings.enabled.toString();
    document.getElementById('maxTrades').value = this.settings.maxTrades;
    document.getElementById('timePeriod').value = this.settings.timePeriod;
    document.getElementById('reminderFrequency').value = this.settings.reminderFrequency;
    document.getElementById('applyToManual').checked = this.settings.applyToManual;
    document.getElementById('applyToStrategy').checked = this.settings.applyToStrategy;
    document.getElementById('applyToNodes').checked = this.settings.applyToNodes;
    
    this.updateStatusDisplay();
    document.getElementById('overtradeModal').classList.add('show');
  }

  hideConfigModal() {
    document.getElementById('overtradeModal').classList.remove('show');
  }

  showWarningModal() {
    const currentTrades = this.getCurrentPeriodTrades();
    const periodStart = new Date(Date.now() - this.getTimePeriodMs()).toLocaleTimeString();
    const nextReset = new Date(Date.now() + this.getTimePeriodMs()).toLocaleTimeString();
    
    // Show immediate popup notification
    this.showOvertradePopup(currentTrades);
    
    document.getElementById('warningTradeCount').textContent = currentTrades;
    document.getElementById('warningTimePeriod').textContent = this.settings.timePeriod;
    document.getElementById('warningFrequency').textContent = `${currentTrades} trades/${this.settings.timePeriod}`;
    document.getElementById('warningPeriodStart').textContent = periodStart;
    document.getElementById('warningNextReset').textContent = nextReset;
    
    document.getElementById('overtradeWarningModal').classList.add('show');
  }

  showOvertradePopup(currentTrades) {
    // Update the persistent panel instead of showing popup
    this.updatePersistentPanel(currentTrades);
    
    // Show message notification for immediate feedback
    const alertMessage = `⚠️ Overtrade Alert: ${currentTrades} trades in the last ${this.settings.timePeriod}!`;
    
    if (typeof showMessage === 'function') {
      showMessage(alertMessage, 'error');
      
      // Show additional popup after a short delay for emphasis
      setTimeout(() => {
        showMessage(`Trading frequency: ${currentTrades}/${this.settings.maxTrades} trades per ${this.settings.timePeriod}`, 'warning');
      }, 3500);
    }
    
    // Also log to console for debugging
    console.warn('Overtrade detected:', {
      currentTrades,
      threshold: this.settings.maxTrades,
      timePeriod: this.settings.timePeriod,
      frequency: `${currentTrades} trades/${this.settings.timePeriod}`
    });
  }



  hideWarningModal() {
    document.getElementById('overtradeWarningModal').classList.remove('show');
  }

  proceedWithTrade() {
    this.lastWarningTime = Date.now();
    this.warningCount++;
    
    // Record the trade
    if (this.pendingTradeData) {
      this.recordTrade(this.pendingTradeData.type, this.pendingTradeData.data);
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

  disableReminders() {
    this.settings.enabled = false;
    this.saveSettings();
    this.proceedWithTrade();
    showMessage('Overtrade reminders disabled', 'info');
  }

  saveConfig() {
    // Get values from form
    this.settings.enabled = document.getElementById('overtradeEnabled').value === 'true';
    this.settings.maxTrades = parseInt(document.getElementById('maxTrades').value);
    this.settings.timePeriod = document.getElementById('timePeriod').value;
    this.settings.reminderFrequency = document.getElementById('reminderFrequency').value;
    this.settings.applyToManual = document.getElementById('applyToManual').checked;
    this.settings.applyToStrategy = document.getElementById('applyToStrategy').checked;
    this.settings.applyToNodes = document.getElementById('applyToNodes').checked;
    
    this.saveSettings();
    this.hideConfigModal();
    showMessage('Overtrade reminder settings saved', 'success');
  }

  resetTradeCount() {
    this.tradeHistory = [];
    this.lastWarningTime = null;
    this.warningCount = 0;
    this.saveSettings();
    this.updateStatusDisplay();
    showMessage('Trade count reset', 'info');
  }

  updateStatusDisplay() {
    const currentTrades = this.getCurrentPeriodTrades();
    const remaining = Math.max(0, this.settings.maxTrades - currentTrades);
    const nextReset = new Date(Date.now() + this.getTimePeriodMs()).toLocaleString();
    const lastWarning = this.lastWarningTime ? new Date(this.lastWarningTime).toLocaleString() : 'Never';
    
    // Update modal display if elements exist
    const currentTradeCountEl = document.getElementById('currentTradeCount');
    const remainingTradesEl = document.getElementById('remainingTrades');
    const nextResetEl = document.getElementById('nextReset');
    const lastWarningEl = document.getElementById('lastWarning');
    
    if (currentTradeCountEl) currentTradeCountEl.textContent = currentTrades;
    if (remainingTradesEl) remainingTradesEl.textContent = remaining;
    if (nextResetEl) nextResetEl.textContent = nextReset;
    if (lastWarningEl) lastWarningEl.textContent = lastWarning;
    
    // Update persistent panel
    this.updatePersistentPanel(currentTrades);
    
    // Update toolbar status
    this.updateToolbarStatus(currentTrades);
  }

  updatePersistentPanel(currentTrades) {
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
    if (countEl) countEl.textContent = currentTrades;
    if (limitEl) limitEl.textContent = this.settings.maxTrades;
    if (periodEl) periodEl.textContent = this.settings.timePeriod;
    if (resetEl) {
      const nextReset = new Date(Date.now() + this.getTimePeriodMs());
      resetEl.textContent = nextReset.toLocaleTimeString();
    }

    // Determine status level
    const isOverLimit = currentTrades >= this.settings.maxTrades;
    const isNearLimit = currentTrades >= this.settings.maxTrades * 0.8;

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
      if (text) text.textContent = 'OVERTRADE ALERT!';
      if (messageEl) messageEl.style.display = 'flex';
    } else if (isNearLimit) {
      // Warning state - near limit
      panel.classList.add('warning');
      indicator.classList.add('warning');
      icon.classList.add('warning');
      text.classList.add('warning');
      if (countEl) countEl.classList.add('warning');
      
      if (icon) icon.textContent = '⚠️';
      if (text) text.textContent = 'Approaching Limit';
      if (messageEl) messageEl.style.display = 'none';
    } else {
      // Safe state
      if (icon) icon.textContent = '✅';
      if (text) text.textContent = 'Safe Trading';
      if (messageEl) messageEl.style.display = 'none';
    }
  }

  updateToolbarStatus(currentTrades) {
    const statusEl = document.getElementById('overtradeStatus');
    const displayEl = document.getElementById('tradeCountDisplay');
    
    if (!statusEl || !displayEl) return;
    
    if (!this.settings.enabled) {
      statusEl.style.display = 'none';
      return;
    }
    
    statusEl.style.display = 'block';
    displayEl.textContent = `${currentTrades}/${this.settings.maxTrades} ${this.settings.timePeriod}`;
    
    // Update status color based on trade count
    statusEl.classList.remove('warning', 'danger');
    
    if (currentTrades >= this.settings.maxTrades) {
      statusEl.classList.add('danger');
    } else if (currentTrades >= this.settings.maxTrades * 0.8) {
      statusEl.classList.add('warning');
    }
  }

  startPeriodicCleanup() {
    // Clean up old trades every minute
    setInterval(() => {
      const beforeCount = this.tradeHistory.length;
      this.cleanupOldTrades();
      const afterCount = this.tradeHistory.length;
      
      if (beforeCount !== afterCount) {
        console.log(`Cleaned up ${beforeCount - afterCount} old trades`);
        this.saveSettings();
      }
      
      this.updateStatusDisplay();
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
    setTimeout(() => this.updateStatusDisplay(), 100);
  }

  // Public method to check before executing trades
  async checkBeforeTrade(tradeType, tradeData = {}) {
    return await this.checkAndShowReminder(tradeType, tradeData);
  }

  // Get current status for display
  getStatus() {
    const currentTrades = this.getCurrentPeriodTrades();
    return {
      enabled: this.settings.enabled,
      currentTrades,
      threshold: this.settings.maxTrades,
      timePeriod: this.settings.timePeriod,
      isOverThreshold: currentTrades >= this.settings.maxTrades
    };
  }

  // Test method to simulate trades for testing
  simulateTradesForTesting(count = 5) {
    for (let i = 0; i < count; i++) {
      this.recordTrade('manual', { test: true, index: i });
    }
    
    // Update the persistent panel
    this.updateStatusDisplay();
    
    showMessage(`Simulated ${count} trades for testing`, 'info');
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
    if (confirm('Are you sure you want to clear all overtrade data? This cannot be undone.')) {
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
  }

  // Get detailed status for debugging
  getDetailedStatus() {
    return {
      enabled: this.settings.enabled,
      settings: this.settings,
      totalTradesRecorded: this.tradeHistory.length,
      currentPeriodTrades: this.getCurrentPeriodTrades(),
      oldestTrade: this.tradeHistory.length > 0 ? new Date(this.tradeHistory[0].timestamp).toLocaleString() : 'None',
      newestTrade: this.tradeHistory.length > 0 ? new Date(this.tradeHistory[this.tradeHistory.length - 1].timestamp).toLocaleString() : 'None',
      lastWarning: this.lastWarningTime ? new Date(this.lastWarningTime).toLocaleString() : 'Never',
      warningCount: this.warningCount,
      nextReset: new Date(Date.now() + this.getTimePeriodMs()).toLocaleString()
    };
  }
}

// Initialize overtrade control
window.overtradeControl = new OvertradeControl();

// Add console helper for debugging
console.log('Overtrade Control initialized. Use window.overtradeControl.getDetailedStatus() to check status.');