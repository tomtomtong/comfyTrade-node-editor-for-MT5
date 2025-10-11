// Application Configuration
const AppConfig = {
  // Quick symbol buttons configuration
  quickSymbols: [
    'EURUSD',
    'GBPUSD',
    'USDJPY',
    'AUDUSD',
    'USDCAD'
  ],
  
  // Twilio configuration
  twilioSettings: {
    enabled: false,
    accountSid: '',
    authToken: '',
    fromNumber: '',
    recipientNumber: '',
    method: 'sms',
    alerts: {
      take_profit: true,
      stop_loss: true,
      position_opened: false,
      position_closed: false
    }
  },
  
  // Add more symbols here as needed
  // Example: 'EURJPY', 'EURGBP', 'NZDUSD', 'XAUUSD', etc.
  
  // Get quick symbols array
  getQuickSymbols() {
    return this.quickSymbols;
  },
  
  // Add a new quick symbol
  addQuickSymbol(symbol) {
    if (!this.quickSymbols.includes(symbol)) {
      this.quickSymbols.push(symbol);
      this.saveToLocalStorage();
    }
  },
  
  // Remove a quick symbol
  removeQuickSymbol(symbol) {
    const index = this.quickSymbols.indexOf(symbol);
    if (index > -1) {
      this.quickSymbols.splice(index, 1);
      this.saveToLocalStorage();
    }
  },
  
  // Get Twilio settings
  getTwilioSettings() {
    return { ...this.twilioSettings };
  },
  
  // Update Twilio settings
  updateTwilioSettings(settings) {
    this.twilioSettings = {
      ...this.twilioSettings,
      ...settings
    };
    this.saveToLocalStorage();
  },
  
  // Save configuration to localStorage
  saveToLocalStorage() {
    localStorage.setItem('appConfig', JSON.stringify({
      quickSymbols: this.quickSymbols,
      twilioSettings: this.twilioSettings
    }));
  },
  
  // Load configuration from localStorage
  loadFromLocalStorage() {
    const saved = localStorage.getItem('appConfig');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (config.quickSymbols && Array.isArray(config.quickSymbols)) {
          this.quickSymbols = config.quickSymbols;
        }
        if (config.twilioSettings && typeof config.twilioSettings === 'object') {
          this.twilioSettings = {
            ...this.twilioSettings,
            ...config.twilioSettings
          };
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    }
  }
};

// Load config on startup
AppConfig.loadFromLocalStorage();
