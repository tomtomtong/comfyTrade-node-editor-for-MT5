// Volume Control System - Symbol-specific volume limits
class VolumeControl {
  constructor() {
    this.settings = {
      enabled: true,
      symbolLimits: {}, // { "EURUSD": 0.5, "GBPUSD": 1.0, etc. }
      maxVolume: 1.0,
      warningThreshold: 0.8,
      autoReduce: false,
      reductionFactor: 0.5
    };
    
    this.loadSettings();
    this.setupEventListeners();
  }

  loadSettings() {
    try {
      if (window.settingsManager) {
        const saved = window.settingsManager.get('volumeControl');
        if (saved) {
          this.settings = { ...this.settings, ...saved };
        }
      }
      
      console.log('Volume control loaded:', {
        enabled: this.settings.enabled,
        symbolCount: Object.keys(this.settings.symbolLimits).length,
        symbols: Object.keys(this.settings.symbolLimits)
      });
    } catch (error) {
      console.error('Error loading volume control settings:', error);
    }
  }

  async saveSettings() {
    try {
      if (window.settingsManager) {
        await window.settingsManager.set('volumeControl', this.settings);
        console.log('Volume control settings saved:', this.settings);
      }
    } catch (error) {
      console.error('Error saving volume control settings:', error);
    }
  }

  setupEventListeners() {
    // Settings modal event listeners will be set up when modal is shown
    this.setupFileControls();
  }

  setupFileControls() {
    // File controls are now handled in the main settings modal
    // This method is kept for compatibility but no longer needed
  }

  async loadSettingsFromFile(file) {
    try {
      const text = await file.text();
      const success = this.importSettings(text);
      
      if (success) {
        // Refresh the UI if we're in settings modal
        if (typeof updateVolumeLimitsList === 'function') {
          updateVolumeLimitsList();
        }
        
        // Clear the file input
        const fileInput = document.getElementById('volumeSettingsFileInput');
        if (fileInput) {
          fileInput.value = '';
        }
      }
    } catch (error) {
      console.error('Error reading settings file:', error);
      showMessage('Failed to read settings file', 'error');
    }
  }

  // Check if a trade volume exceeds the limit for a symbol
  checkVolumeLimit(symbol, requestedVolume) {
    if (!this.settings.enabled) {
      return { allowed: true };
    }

    const symbolUpper = symbol.toUpperCase();
    const limit = this.settings.symbolLimits[symbolUpper];
    
    if (!limit) {
      // No limit set for this symbol
      return { allowed: true };
    }

    if (requestedVolume > limit) {
      return {
        allowed: false,
        limit: limit,
        requested: requestedVolume,
        message: `Volume ${requestedVolume} exceeds limit of ${limit} for ${symbolUpper}`
      };
    }

    return { allowed: true, limit: limit };
  }

  // Add or update a symbol volume limit
  setSymbolLimit(symbol, maxVolume) {
    if (!symbol || maxVolume <= 0) {
      throw new Error('Invalid symbol or volume');
    }

    const symbolUpper = symbol.toUpperCase();
    this.settings.symbolLimits[symbolUpper] = maxVolume;
    this.saveSettings();
    
    console.log(`Volume limit set: ${symbolUpper} = ${maxVolume}`);
    return true;
  }

  // Remove a symbol volume limit
  removeSymbolLimit(symbol) {
    const symbolUpper = symbol.toUpperCase();
    if (this.settings.symbolLimits[symbolUpper]) {
      delete this.settings.symbolLimits[symbolUpper];
      this.saveSettings();
      console.log(`Volume limit removed for: ${symbolUpper}`);
      return true;
    }
    return false;
  }

  // Get all symbol limits
  getSymbolLimits() {
    return { ...this.settings.symbolLimits };
  }

  // Get limit for specific symbol
  getSymbolLimit(symbol) {
    const symbolUpper = symbol.toUpperCase();
    return this.settings.symbolLimits[symbolUpper] || null;
  }

  // Enable/disable volume control
  setEnabled(enabled) {
    this.settings.enabled = enabled;
    this.saveSettings();
    console.log(`Volume control ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Check before executing a trade (main validation method)
  async validateTradeVolume(symbol, volume) {
    const result = this.checkVolumeLimit(symbol, volume);
    
    if (!result.allowed) {
      // Show warning modal and return promise
      return new Promise((resolve) => {
        this.showVolumeWarningModal(symbol, volume, result.limit, resolve);
      });
    }
    
    return true; // Volume is within limits
  }

  showVolumeWarningModal(symbol, requestedVolume, limit, resolve) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('volumeWarningModal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'volumeWarningModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content volume-warning-modal">
          <h2 style="color: #FF9800;">⚠️ Volume Limit Exceeded</h2>
          <div class="volume-warning-content">
            <p>The requested volume exceeds the limit for this symbol:</p>
            <div class="volume-warning-details">
              <div><strong>Symbol:</strong> <span id="warningSymbol"></span></div>
              <div><strong>Requested Volume:</strong> <span id="warningRequestedVolume"></span></div>
              <div><strong>Maximum Allowed:</strong> <span id="warningMaxVolume"></span></div>
            </div>
            <p style="margin-top: 15px;">What would you like to do?</p>
          </div>
          <div class="volume-modal-buttons">
            <button id="adjustVolumeBtn" class="btn btn-primary btn-volume">Use Max Volume (${limit})</button>
            <button id="cancelVolumeTradeBtn" class="btn btn-secondary btn-volume">Cancel Trade</button>
            <button id="proceedAnywayBtn" class="btn btn-warning btn-volume">Proceed Anyway</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    // Update modal content
    document.getElementById('warningSymbol').textContent = symbol;
    document.getElementById('warningRequestedVolume').textContent = requestedVolume;
    document.getElementById('warningMaxVolume').textContent = limit;
    
    // Update button text with actual limit
    document.getElementById('adjustVolumeBtn').textContent = `Use Max Volume (${limit})`;

    // Set up event handlers
    document.getElementById('adjustVolumeBtn').onclick = () => {
      modal.classList.remove('show');
      resolve({ allowed: true, adjustedVolume: limit });
    };

    document.getElementById('cancelVolumeTradeBtn').onclick = () => {
      modal.classList.remove('show');
      resolve({ allowed: false, cancelled: true });
    };

    document.getElementById('proceedAnywayBtn').onclick = () => {
      modal.classList.remove('show');
      resolve({ allowed: true, override: true });
    };

    // Show modal
    modal.classList.add('show');
  }



  // Import settings from backup
  importSettings(jsonData) {
    try {
      let data;
      
      if (typeof jsonData === 'string') {
        // Attempt to parse JSON with detailed error logging
        try {
          data = JSON.parse(jsonData);
        } catch (parseError) {
          console.error(`❌ JSON Parse Error in volume control settings:`);
          console.error(`   Parse error: ${parseError.message}`);
          console.error(`   Data preview (first 200 chars):`);
          console.error(`   "${jsonData.substring(0, 200)}${jsonData.length > 200 ? '...' : ''}"`);
          
          // Try to identify common JSON issues
          if (jsonData.trim() === '') {
            console.error(`   Issue: Volume control data is empty`);
            showMessage('Volume control data is empty', 'error');
          } else if (!jsonData.trim().startsWith('{') && !jsonData.trim().startsWith('[')) {
            console.error(`   Issue: Volume control data doesn't start with { or [ (not valid JSON)`);
            showMessage('Volume control data is not valid JSON', 'error');
          } else {
            showMessage(`Invalid JSON in volume control data: ${parseError.message}`, 'error');
          }
          return false;
        }
      } else {
        data = jsonData;
      }
      
      // Handle raw settings format only
      let settingsToImport;
      if (data.volumeControl) {
        // Raw settings format (like app_settings.json) - extract volumeControl
        settingsToImport = data.volumeControl;
      } else if (data.enabled !== undefined || data.symbolLimits !== undefined) {
        // Direct volume control settings format
        settingsToImport = data;
      } else {
        console.error('❌ Invalid volume control data format - no volumeControl settings found');
        throw new Error('Invalid data format');
      }
      
      // Import only volume control specific settings
      this.settings = { ...this.settings, ...settingsToImport };
      this.saveSettings();
      showMessage('Volume control settings imported successfully', 'success');
      console.log('✅ Imported volume control data');
      return true;
    } catch (error) {
      console.error('❌ Error importing volume control data:', error.message);
      showMessage('Failed to import volume control data', 'error');
      return false;
    }
  }

  // Clear all settings
  clearAllSettings() {
    if (typeof showConfirmation === 'function') {
      showConfirmation(
        'Clear Volume Control Settings',
        'Are you sure you want to clear all volume control settings? This will remove all symbol limits.',
        () => {
          this.executeClearAllSettings();
        }
      );
    } else {
      if (confirm('Are you sure you want to clear all volume control settings?')) {
        this.executeClearAllSettings();
      }
    }
  }

  async executeClearAllSettings() {
    this.settings = {
      enabled: false,
      symbolLimits: {}
    };
    
    if (window.settingsManager) {
      await window.settingsManager.set('volumeControl', this.settings);
    }
    
    showMessage('Volume control settings cleared', 'info');
    console.log('Volume control settings cleared');
  }

  // Get status for debugging
  getStatus() {
    return {
      enabled: this.settings.enabled,
      symbolCount: Object.keys(this.settings.symbolLimits).length,
      symbols: this.settings.symbolLimits
    };
  }
}

// Initialize volume control
window.volumeControl = new VolumeControl();

console.log('Volume Control initialized. Use window.volumeControl.getStatus() to check status.');