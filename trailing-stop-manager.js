/**
 * Trailing Stop Loss Manager
 * Automatically adjusts SL and TP for positions every 5 minutes
 */

class TrailingStopManager {
  constructor() {
    this.trailingPositions = new Map(); // ticket -> {settings, lastPrice, lastAdjustment}
    this.intervalId = null;
    this.updateInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
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

    // Calculate TP distance (use percentage if provided, otherwise absolute)
    let tpDistance = trailing.tpDistance;
    if (trailing.tpDistancePercent > 0) {
      tpDistance = currentPrice * (trailing.tpDistancePercent / 100);
    }

    console.log('Trailing: Distances - SL:', slDistance, 'TP:', tpDistance, 'current price:', currentPrice);

    if (isBuy) {
      // BUY: always recalc from current price
      if (slDistance > 0) {
        newSL = currentPrice - slDistance;
      }
      if (tpDistance > 0) {
        newTP = currentPrice + tpDistance;
      }
    } else {
      // SELL: always recalc from current price
      if (slDistance > 0) {
        newSL = currentPrice + slDistance;
      }
      if (tpDistance > 0) {
        newTP = currentPrice - tpDistance;
      }
    }

    // Update last price
    trailing.lastPrice = currentPrice;
    trailing.lastAdjustment = new Date().toISOString();

    // If neither distance is set, nothing to do
    if (slDistance <= 0 && tpDistance <= 0) {
      console.log('Trailing: No valid distance set for ticket', position.ticket);
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
    // Use global isConnected flag from renderer instead of mt5API.isConnected()
    console.log('Trailing: Checking connection... isConnected =', window.isConnected, 'mt5API =', !!window.mt5API);
    
    if (!window.mt5API || !window.isConnected) {
      console.warn('Trailing: Not connected to MT5. isConnected:', window.isConnected, 'mt5API:', !!window.mt5API);
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

    // Run immediately on start, then every 5 minutes
    this.adjustAllPositions();
    this.intervalId = setInterval(() => {
      this.adjustAllPositions();
    }, this.updateInterval);

    console.log('Trailing stop manager started (updates every 5 minutes)');
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
   * Clean up trailing positions that no longer exist
   */
  async cleanup() {
    // Use global isConnected flag from renderer instead of mt5API.isConnected()
    if (!window.mt5API || !window.isConnected) {
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
      window.trailingStopManager = new TrailingStopManager();
      
      // Clean up when positions are refreshed
      const originalRefresh = window.handleRefreshPositions;
      if (originalRefresh) {
        window.handleRefreshPositions = async function() {
          await originalRefresh();
          if (window.trailingStopManager) {
            await window.trailingStopManager.cleanup();
          }
        };
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

