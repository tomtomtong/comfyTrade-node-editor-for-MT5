/**
 * Trailing Stop Loss Manager
 * Automatically adjusts SL and TP for positions every 5 minutes
 */

class TrailingStopManager {
  constructor() {
    this.trailingPositions = new Map(); // ticket -> {settings, lastPrice, lastAdjustment}
    this.intervalId = null;
    this.updateInterval = 5 * 60 * 1000; // Default: 5 minutes in milliseconds
    this.lastCheckTime = null;
    this.loadSettings();
    this.start();
  }

  /**
   * Load trailing settings from app_settings.json via SettingsManager
   */
  async loadSettings() {
    try {
      if (window.settingsManager) {
        const trailingData = window.settingsManager.get('trailing_stops') || {};
        
        // Load interval setting (default to 5 minutes if not set)
        const intervalSeconds = window.settingsManager.get('general.trailingStopInterval') || 300;
        this.updateInterval = intervalSeconds * 1000; // Convert to milliseconds
        
        // Restore trailing positions
        if (trailingData.positions && Array.isArray(trailingData.positions)) {
          trailingData.positions.forEach(pos => {
            this.trailingPositions.set(pos.ticket, {
              ticket: pos.ticket,
              slDistance: pos.slDistance || 0, // Distance in price units
              slDistancePercent: pos.slDistancePercent || 0, // Distance as percentage
              tpDistance: pos.tpDistance || 0, // Distance in price units
              tpDistancePercent: pos.tpDistancePercent || 0, // Distance as percentage
              triggerPrice: pos.triggerPrice || 0, // Price at which trailing activates (0 = immediate)
              maxSL: pos.maxSL || null, // Maximum SL value that cannot be exceeded (null = no limit)
              maxTP: pos.maxTP || null, // Maximum TP value that cannot be exceeded (null = no limit)
              lastPrice: pos.lastPrice || 0,
              lastAdjustment: pos.lastAdjustment || new Date().toISOString(),
              enabled: true
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading trailing stop settings:', error);
    }
  }

  /**
   * Save trailing settings to app_settings.json via SettingsManager
   */
  async saveSettings() {
    try {
      if (window.settingsManager) {
        await window.settingsManager.set('trailing_stops', {
          positions: Array.from(this.trailingPositions.values()).map(pos => ({
            ticket: pos.ticket,
            slDistance: pos.slDistance,
            slDistancePercent: pos.slDistancePercent,
            tpDistance: pos.tpDistance,
            tpDistancePercent: pos.tpDistancePercent,
            triggerPrice: pos.triggerPrice || 0,
            maxSL: pos.maxSL || null,
            maxTP: pos.maxTP || null,
            lastPrice: pos.lastPrice,
            lastAdjustment: pos.lastAdjustment
          })),
          lastUpdated: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error saving trailing stop settings:', error);
    }
  }

  /**
   * Enable trailing stop for a position
   */
  async enableTrailing(ticket, settings) {
    const position = {
      ticket: ticket,
      slDistance: settings.slDistance || 0,
      slDistancePercent: settings.slDistancePercent || 0,
      tpDistance: settings.tpDistance || 0,
      tpDistancePercent: settings.tpDistancePercent || 0,
      triggerPrice: settings.triggerPrice || 0, // 0 means activate immediately
      maxSL: settings.maxSL || null, // Maximum SL value that cannot be exceeded (null = no limit)
      maxTP: settings.maxTP || null, // Maximum TP value that cannot be exceeded (null = no limit)
      lastPrice: settings.initialPrice || 0,
      lastAdjustment: new Date().toISOString(),
      enabled: true
    };
    
    this.trailingPositions.set(ticket, position);
    await this.saveSettings();
    
    return { success: true, message: 'Trailing stop enabled' };
  }

  /**
   * Disable trailing stop for a position
   */
  async disableTrailing(ticket) {
    if (this.trailingPositions.has(ticket)) {
      this.trailingPositions.delete(ticket);
      await this.saveSettings();
      return { success: true, message: 'Trailing stop disabled' };
    }
    return { success: false, message: 'Trailing stop not found' };
  }

  /**
   * Check if trailing is enabled for a position
   */
  isTrailingEnabled(ticket) {
    return this.trailingPositions.has(ticket);
  }

  /**
   * Get trailing settings for a position
   */
  getTrailingSettings(ticket) {
    return this.trailingPositions.get(ticket) || null;
  }

  /**
   * Get all trailing positions
   */
  getAllTrailingPositions() {
    return Array.from(this.trailingPositions.keys());
  }

  /**
   * Calculate new SL and TP based on current price and position type
   */
  calculateNewSLTP(position, currentPrice) {
    const trailing = this.trailingPositions.get(position.ticket);
    console.log('Trailing: calculateNewSLTP for ticket', position.ticket, 'trailing config:', trailing);
    
    if (!trailing || !trailing.enabled) {
      console.warn('Trailing: No trailing config or not enabled for ticket', position.ticket);
      return null;
    }

    const isBuy = position.type === 'BUY';
    
    // Check if trigger price has been reached
    const triggerPrice = trailing.triggerPrice || 0;
    if (triggerPrice > 0) {
      const triggerReached = isBuy 
        ? currentPrice >= triggerPrice  // For BUY: activate when price reaches or exceeds trigger
        : currentPrice <= triggerPrice; // For SELL: activate when price reaches or falls below trigger
      
      if (!triggerReached) {
        console.log(`Trailing: Trigger price not reached for ticket ${position.ticket}. Current: ${currentPrice}, Trigger: ${triggerPrice}`);
        return null; // Don't activate trailing yet
      } else {
        console.log(`Trailing: Trigger price reached for ticket ${position.ticket}. Current: ${currentPrice}, Trigger: ${triggerPrice}`);
      }
    }
    // Handle both property name formats (stop_loss/stopLoss)
    const currentSL = position.stop_loss || position.stopLoss || 0;
    const currentTP = position.take_profit || position.takeProfit || 0;
    let newSL = currentSL;
    let newTP = currentTP;

    // Calculate SL distance (use percentage if provided, otherwise absolute)
    let slDistance = trailing.slDistance;
    if (trailing.slDistancePercent > 0) {
      slDistance = currentPrice * (trailing.slDistancePercent / 100);
    }

    // Calculate TP distance
    let tpDistance = 0;
    tpDistance = trailing.tpDistance;
    if (trailing.tpDistancePercent > 0) {
      tpDistance = currentPrice * (trailing.tpDistancePercent / 100);
    }

    console.log('Trailing: Distances - SL:', slDistance, 'TP:', tpDistance, 'current price:', currentPrice);

    // Calculate new SL (always trailing if distance is set)
    if (slDistance > 0) {
      if (isBuy) {
        // BUY: SL moves up as price increases (never down)
        newSL = currentPrice - slDistance;
        // Only move SL up, never down
        if (newSL < currentSL) {
          newSL = currentSL;
        }
      } else {
        // SELL: SL moves down as price decreases (never up)
        newSL = currentPrice + slDistance;
        // Only move SL down, never up
        if (newSL > currentSL) {
          newSL = currentSL;
        }
      }
    }

    // Apply maximum SL limit if set
    const maxSL = trailing.maxSL;
    if (maxSL !== null && maxSL > 0) {
      if (isBuy) {
        // For BUY: maxSL is the maximum value SL can reach (e.g., if maxSL = 1.1000, SL cannot exceed 1.1000)
        if (newSL > maxSL) {
          console.log(`Trailing: SL ${newSL} exceeds maximum ${maxSL}, capping at ${maxSL}`);
          newSL = maxSL;
        }
        // Ensure we don't move SL down even if maxSL is lower than currentSL
        if (newSL < currentSL) {
          console.log(`Trailing: Capped SL ${newSL} would move against position (current: ${currentSL}), keeping current SL`);
          newSL = currentSL;
        }
      } else {
        // For SELL: maxSL is the minimum value SL can reach (e.g., if maxSL = 1.1000, SL cannot go below 1.1000)
        if (newSL < maxSL) {
          console.log(`Trailing: SL ${newSL} exceeds maximum ${maxSL}, capping at ${maxSL}`);
          newSL = maxSL;
        }
        // Ensure we don't move SL up even if maxSL is higher than currentSL
        if (newSL > currentSL) {
          console.log(`Trailing: Capped SL ${newSL} would move against position (current: ${currentSL}), keeping current SL`);
          newSL = currentSL;
        }
      }
    }

    // Calculate new TP
    if (tpDistance > 0) {
      // Calculate trailing TP
      if (isBuy) {
        newTP = currentPrice + tpDistance;
      } else {
        newTP = currentPrice - tpDistance;
      }
    } else {
      // Keep current TP
      newTP = currentTP;
    }

    // Apply maximum TP limit if set
    const maxTP = trailing.maxTP;
    if (maxTP !== null && maxTP > 0) {
      if (isBuy) {
        // For BUY: maxTP is the maximum value TP can reach (e.g., if maxTP = 1.2000, TP cannot exceed 1.2000)
        if (newTP > maxTP) {
          console.log(`Trailing: TP ${newTP} exceeds maximum ${maxTP}, capping at ${maxTP}`);
          newTP = maxTP;
        }
        // Ensure we don't move TP down even if maxTP is lower than currentTP
        if (newTP < currentTP) {
          console.log(`Trailing: Capped TP ${newTP} would move against position (current: ${currentTP}), keeping current TP`);
          newTP = currentTP;
        }
      } else {
        // For SELL: maxTP is the minimum value TP can reach (e.g., if maxTP = 1.2000, TP cannot go below 1.2000)
        if (newTP < maxTP) {
          console.log(`Trailing: TP ${newTP} exceeds maximum ${maxTP}, capping at ${maxTP}`);
          newTP = maxTP;
        }
        // Ensure we don't move TP up even if maxTP is higher than currentTP
        if (newTP > currentTP) {
          console.log(`Trailing: Capped TP ${newTP} would move against position (current: ${currentTP}), keeping current TP`);
          newTP = currentTP;
        }
      }
    }

    // Update last price
    trailing.lastPrice = currentPrice;
    trailing.lastAdjustment = new Date().toISOString();

    // If SL distance is not set and TP distance is not set, nothing to do
    if (slDistance <= 0 && tpDistance <= 0) {
      console.log('Trailing: No valid distance set for ticket', position.ticket);
      return null;
    }

    // Skip update if SL hasn't changed (already at maxSL or no movement needed)
    if (newSL === currentSL && newTP === currentTP) {
      console.log('Trailing: No changes needed for ticket', position.ticket, 'SL:', currentSL, 'TP:', currentTP);
      return null;
    }

    console.log('Trailing: Will update ticket', position.ticket, 'to SL:', newSL, 'TP:', newTP);
    return {
      ticket: position.ticket,
      stopLoss: newSL,
      takeProfit: newTP,
      currentPrice: currentPrice
    };
  }

  /**
   * Adjust SL/TP for all trailing positions
   */
  async adjustAllPositions() {
    // Update last check time
    this.lastCheckTime = new Date();
    
    // Use global isConnected flag from renderer instead of mt5API.isConnected()
    // Default to false if window.isConnected is undefined (renderer.js not loaded yet)
    const isConnected = window.isConnected !== undefined ? window.isConnected : false;
    console.log('Trailing: Checking connection... isConnected =', isConnected, 'mt5API =', !!window.mt5API);
    
    if (!window.mt5API || !isConnected) {
      console.warn('Trailing: Not connected to MT5. isConnected:', isConnected, 'mt5API:', !!window.mt5API);
      return { adjusted: 0, failed: ['Not connected to MT5'] };
    }

    try {
      // Get all open positions
      console.log('Trailing: Fetching positions...');
      const result = await window.mt5API.getPositions();
      console.log('Trailing: Positions result:', result.success, 'data length:', result.data?.length);
      
      if (!result.success || !result.data) {
        return { adjusted: 0, failed: ['Failed to get positions'] };
      }

      const positions = result.data;
      const trailingTickets = this.getAllTrailingPositions();
      console.log('Trailing: Found', positions.length, 'positions,', trailingTickets.length, 'have trailing enabled:', trailingTickets);
      let adjustedCount = 0;
      const failed = [];

      for (const position of positions) {
        if (trailingTickets.includes(position.ticket)) {
          console.log('Trailing: Processing position ticket', position.ticket, 'current price:', position.current_price);
          const adjustment = this.calculateNewSLTP(position, position.current_price);
          console.log('Trailing: Adjustment calculated:', adjustment);
          
          if (adjustment) {
            try {
              // Modify position with new SL/TP
              const modifyResult = await window.mt5API.modifyPosition(
                adjustment.ticket,
                adjustment.stopLoss,
                adjustment.takeProfit
              );

              if (modifyResult.success && modifyResult.data.success) {
                console.log(`Trailing stop adjusted for ticket ${adjustment.ticket}: SL=${adjustment.stopLoss.toFixed(5)}, TP=${adjustment.takeProfit.toFixed(5)}`);
                adjustedCount += 1;
              } else {
                const msg = modifyResult.data?.error || modifyResult.error || 'Unknown error';
                console.warn(`Failed to adjust trailing stop for ticket ${adjustment.ticket}:`, msg);
                failed.push(`Ticket ${adjustment.ticket}: ${msg}`);
                if (typeof showMessage === 'function') {
                  showMessage(`Failed to adjust trailing stop for ticket ${adjustment.ticket}: ${msg}`, 'error');
                }
              }
            } catch (error) {
              console.error(`Error adjusting trailing stop for ticket ${adjustment.ticket}:`, error);
              failed.push(`Ticket ${adjustment.ticket}: ${error.message || error}`);
              if (typeof showMessage === 'function') {
                showMessage(`Error adjusting trailing stop for ticket ${adjustment.ticket}: ${error.message || error}`, 'error');
              }
            }
          }
        }
      }

      // Save updated settings
      await this.saveSettings();
      
      // Update UI status if available
      this.updateUIStatus();
      
      return { adjusted: adjustedCount, failed };
    } catch (error) {
      console.error('Error adjusting trailing positions:', error);
      return { adjusted: 0, failed: [error.message || String(error)] };
    }
  }

  /**
   * Start the trailing stop adjustment interval
   */
  async start() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Load settings first
    await this.loadSettings();

    // Run immediately on start, then at the configured interval
    this.adjustAllPositions();
    this.intervalId = setInterval(() => {
      this.adjustAllPositions();
    }, this.updateInterval);

    const intervalMinutes = Math.round(this.updateInterval / 60000);
    console.log(`Trailing stop manager started (updates every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''})`);
  }

  /**
   * Stop the trailing stop adjustment interval
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Trailing stop manager stopped');
    }
  }

  /**
   * Restart with new interval
   */
  async restart() {
    this.stop();
    await this.start();
  }

  /**
   * Update interval setting
   */
  async setUpdateInterval(intervalSeconds) {
    this.updateInterval = intervalSeconds * 1000;
    await this.restart();
  }

  /**
   * Get current interval in seconds
   */
  getCurrentInterval() {
    return Math.round(this.updateInterval / 1000);
  }

  /**
   * Check if the manager is fully initialized
   */
  isInitialized() {
    return this.intervalId !== null && typeof this.updateInterval === 'number';
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      isRunning: this.intervalId !== null,
      intervalSeconds: this.getCurrentInterval(),
      activePositions: this.trailingPositions.size,
      lastCheck: this.lastCheckTime,
      nextCheck: this.intervalId ? new Date(Date.now() + this.updateInterval) : null
    };
  }

  /**
   * Update UI status elements if they exist
   */
  updateUIStatus() {
    const status = this.getStatus();
    
    // Update status indicator
    const statusElement = document.getElementById('trailingStopStatus');
    if (statusElement) {
      statusElement.textContent = status.isRunning ? 'Active' : 'Stopped';
      statusElement.className = `status-indicator ${status.isRunning ? 'active' : 'inactive'}`;
    }

    // Update active positions count
    const activeCountElement = document.getElementById('trailingStopActiveCount');
    if (activeCountElement) {
      activeCountElement.textContent = status.activePositions;
    }

    // Update last check time
    const lastCheckElement = document.getElementById('trailingStopLastCheck');
    if (lastCheckElement) {
      if (status.lastCheck) {
        lastCheckElement.textContent = status.lastCheck.toLocaleTimeString();
      } else {
        lastCheckElement.textContent = 'Never';
      }
    }

    // Update next check time
    const nextCheckElement = document.getElementById('trailingStopNextCheck');
    if (nextCheckElement) {
      if (status.nextCheck) {
        nextCheckElement.textContent = status.nextCheck.toLocaleTimeString();
      } else {
        nextCheckElement.textContent = '-';
      }
    }
  }

  /**
   * Clean up trailing positions that no longer exist
   */
  async cleanup() {
    // Use global isConnected flag from renderer instead of mt5API.isConnected()
    // Default to false if window.isConnected is undefined (renderer.js not loaded yet)
    const isConnected = window.isConnected !== undefined ? window.isConnected : false;
    if (!window.mt5API || !isConnected) {
      return;
    }

    try {
      const result = await window.mt5API.getPositions();
      if (result.success && result.data) {
        const openTickets = result.data.map(p => p.ticket);
        const trailingTickets = Array.from(this.trailingPositions.keys());
        
        trailingTickets.forEach(ticket => {
          if (!openTickets.includes(ticket)) {
            this.trailingPositions.delete(ticket);
            console.log(`Removed trailing stop for closed position ${ticket}`);
          }
        });
        
        await this.saveSettings();
      }
    } catch (error) {
      console.error('Error cleaning up trailing positions:', error);
    }
  }
}

// Initialize trailing stop manager when settings manager is ready
if (typeof window !== 'undefined') {
  // Wait for settings manager to be available
  function initTrailingManager() {
    if (window.settingsManager) {
      if (!window.trailingStopManager) {
        window.trailingStopManager = new TrailingStopManager();
        console.log('TrailingStopManager initialized');
      }
      
      // Clean up when positions are refreshed
      const originalRefresh = window.handleRefreshPositions;
      if (originalRefresh && !window.handleRefreshPositions._trailingCleanupAdded) {
        window.handleRefreshPositions = async function() {
          await originalRefresh();
          if (window.trailingStopManager && typeof window.trailingStopManager.cleanup === 'function') {
            await window.trailingStopManager.cleanup();
          }
        };
        window.handleRefreshPositions._trailingCleanupAdded = true;
      }
    } else {
      // Retry after a short delay
      setTimeout(initTrailingManager, 100);
    }
  }
  
  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrailingManager);
  } else {
    initTrailingManager();
  }
}

