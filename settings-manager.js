// Centralized Settings Manager
class SettingsManager {
  constructor() {
    this.settingsFile = 'app_settings.json';
    this.defaultSettings = {
      // General settings
      openTradingView: true,
      
      // AI Analysis settings
      ai: {
        enabled: false,
        firecrawl: {
          enabled: false,
          apiKey: '',
          baseUrl: 'https://api.firecrawl.dev'
        },
        openRouter: {
          enabled: false,
          apiKey: '',
          model: 'anthropic/claude-3.5-sonnet',
          baseUrl: 'https://openrouter.ai/api/v1'
        },
        features: {
          marketAnalysis: true,
          newsAnalysis: true,
          strategyOptimization: false,
          riskAssessment: true
        }
      },
      
      // Twilio settings
      twilio: {
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
      
      // Volume control settings
      volumeControl: {
        enabled: true,
        symbolLimits: {},
        maxVolume: 1.0,
        warningThreshold: 0.8,
        autoReduce: false,
        reductionFactor: 0.5
      },
      
      // Overtrade control settings
      overtradeControl: {
        enabled: true,
        maxTradesPerHour: 10,
        maxTradesPerDay: 50,
        cooldownMinutes: 5,
        warningEnabled: true,
        blockTrading: false
      },
      
      // Overtrade history and state
      overtradeHistory: [],
      overtradeLastWarning: 0,
      overtradeWarningCount: 0,
      
      // UI settings
      ui: {
        panelSizes: null,
        theme: 'dark'
      },
      
      // Historical data for backtesting
      historicalData: null,
      
      // MT5 trading settings
      mt5Trading: {
        symbol: "BTCUSD",
        orderType: "BUY",
        condition: "BELOW",
        targetPrice: 105000.0,
        volume: 0.01,
        checkInterval: 5
      }
    };
    
    this.settings = { ...this.defaultSettings };
    this.loadSettings();
  }
  
  // Load settings from JSON file
  async loadSettings() {
    try {
      // Try to load from file via Electron IPC
      if (window.electronAPI && window.electronAPI.loadSettings) {
        const fileSettings = await window.electronAPI.loadSettings(this.settingsFile);
        if (fileSettings) {
          this.settings = this.mergeSettings(this.defaultSettings, fileSettings);
          console.log('✅ Settings loaded from file:', this.settingsFile);
          return;
        }
      }
      
      // Fallback: migrate from localStorage if file doesn't exist
      console.log('📦 Migrating settings from localStorage to file system...');
      this.migrateFromLocalStorage();
      await this.saveSettings();
      
    } catch (error) {
      console.error('❌ Error loading settings:', error.message);
      
      // Show user-friendly error message for JSON parse errors
      if (error.message.includes('Invalid JSON format')) {
        console.error('🔧 SOLUTION: Check your app_settings.json file for syntax errors');
        console.error('   - Make sure all quotes are properly closed');
        console.error('   - Check for missing commas between properties');
        console.error('   - Ensure no trailing commas after the last property');
        console.error('   - Verify all brackets { } are properly matched');
        
        // Show a user notification if possible
        if (typeof showMessage === 'function') {
          showMessage('Settings file has invalid JSON format. Check console for details.', 'error');
        }
      }
      
      // Use default settings if loading fails
      console.log('🔄 Using default settings due to loading error');
      this.settings = { ...this.defaultSettings };
    }
  }
  
  // Save settings to JSON file
  async saveSettings() {
    try {
      if (window.electronAPI && window.electronAPI.saveSettings) {
        await window.electronAPI.saveSettings(this.settingsFile, this.settings);
        console.log('Settings saved to file:', this.settingsFile);
      } else {
        console.warn('Electron API not available, settings not saved to file');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
  
  // Migrate existing localStorage settings to new system
  migrateFromLocalStorage() {
    console.log('Migrating settings from localStorage...');
    
    // Migrate general settings
    const openTradingView = localStorage.getItem('openTradingView');
    if (openTradingView !== null) {
      this.settings.openTradingView = openTradingView !== 'false';
    }
    
    // Migrate AI settings
    const aiEnabled = localStorage.getItem('aiEnabled');
    if (aiEnabled !== null) {
      this.settings.ai.enabled = aiEnabled === 'true';
    }
    
    const firecrawlEnabled = localStorage.getItem('aiFirecrawlEnabled');
    if (firecrawlEnabled !== null) {
      this.settings.ai.firecrawl.enabled = firecrawlEnabled === 'true';
    }
    
    const firecrawlApiKey = localStorage.getItem('aiFirecrawlApiKey');
    if (firecrawlApiKey) {
      this.settings.ai.firecrawl.apiKey = firecrawlApiKey;
    }
    
    const firecrawlBaseUrl = localStorage.getItem('aiFirecrawlBaseUrl');
    if (firecrawlBaseUrl) {
      this.settings.ai.firecrawl.baseUrl = firecrawlBaseUrl;
    }
    
    // Migrate OpenRouter settings
    const openRouterEnabled = localStorage.getItem('aiOpenRouterEnabled');
    if (openRouterEnabled !== null) {
      this.settings.ai.openRouter.enabled = openRouterEnabled === 'true';
    }
    
    const openRouterApiKey = localStorage.getItem('aiOpenRouterApiKey');
    if (openRouterApiKey) {
      this.settings.ai.openRouter.apiKey = openRouterApiKey;
    }
    
    const openRouterModel = localStorage.getItem('aiOpenRouterModel');
    if (openRouterModel) {
      this.settings.ai.openRouter.model = openRouterModel;
    }
    
    const openRouterBaseUrl = localStorage.getItem('aiOpenRouterBaseUrl');
    if (openRouterBaseUrl) {
      this.settings.ai.openRouter.baseUrl = openRouterBaseUrl;
    }
    
    // Migrate AI features
    const marketAnalysis = localStorage.getItem('aiMarketAnalysis');
    if (marketAnalysis !== null) {
      this.settings.ai.features.marketAnalysis = marketAnalysis !== 'false';
    }
    
    const newsAnalysis = localStorage.getItem('aiNewsAnalysis');
    if (newsAnalysis !== null) {
      this.settings.ai.features.newsAnalysis = newsAnalysis !== 'false';
    }
    
    const strategyOptimization = localStorage.getItem('aiStrategyOptimization');
    if (strategyOptimization !== null) {
      this.settings.ai.features.strategyOptimization = strategyOptimization === 'true';
    }
    
    const riskAssessment = localStorage.getItem('aiRiskAssessment');
    if (riskAssessment !== null) {
      this.settings.ai.features.riskAssessment = riskAssessment !== 'false';
    }
    
    // Migrate app config (Twilio)
    const appConfig = localStorage.getItem('appConfig');
    if (appConfig) {
      try {
        const config = JSON.parse(appConfig);
        if (config.twilioSettings) {
          this.settings.twilio = { ...this.settings.twilio, ...config.twilioSettings };
        }
      } catch (e) {
        console.error('Error migrating app config:', e);
      }
    }
    
    // Migrate volume control settings
    const volumeControlSettings = localStorage.getItem('volumeControlSettings');
    if (volumeControlSettings) {
      try {
        const settings = JSON.parse(volumeControlSettings);
        this.settings.volumeControl = { ...this.settings.volumeControl, ...settings };
      } catch (e) {
        console.error('Error migrating volume control settings:', e);
      }
    }
    
    // Migrate overtrade settings
    const overtradeSettings = localStorage.getItem('overtradeSettings');
    if (overtradeSettings) {
      try {
        const settings = JSON.parse(overtradeSettings);
        this.settings.overtradeControl = { ...this.settings.overtradeControl, ...settings };
      } catch (e) {
        console.error('Error migrating overtrade settings:', e);
      }
    }
    
    // Migrate overtrade history
    const overtradeHistory = localStorage.getItem('overtradeHistory');
    if (overtradeHistory) {
      try {
        this.settings.overtradeHistory = JSON.parse(overtradeHistory);
      } catch (e) {
        console.error('Error migrating overtrade history:', e);
      }
    }
    
    // Migrate overtrade state
    const overtradeLastWarning = localStorage.getItem('overtradeLastWarning');
    if (overtradeLastWarning) {
      this.settings.overtradeLastWarning = parseInt(overtradeLastWarning) || 0;
    }
    
    const overtradeWarningCount = localStorage.getItem('overtradeWarningCount');
    if (overtradeWarningCount) {
      this.settings.overtradeWarningCount = parseInt(overtradeWarningCount) || 0;
    }
    
    // Migrate panel sizes
    const panelSizes = localStorage.getItem('panelSizes');
    if (panelSizes) {
      try {
        this.settings.ui.panelSizes = JSON.parse(panelSizes);
      } catch (e) {
        console.error('Error migrating panel sizes:', e);
      }
    }
    
    // Migrate historical data
    const historicalData = localStorage.getItem('historicalData');
    if (historicalData) {
      try {
        this.settings.historicalData = JSON.parse(historicalData);
      } catch (e) {
        console.error('Error migrating historical data:', e);
      }
    }
  }
  
  // Deep merge settings objects
  mergeSettings(defaults, saved) {
    const result = { ...defaults };
    
    for (const key in saved) {
      if (saved[key] !== null && typeof saved[key] === 'object' && !Array.isArray(saved[key])) {
        result[key] = this.mergeSettings(defaults[key] || {}, saved[key]);
      } else {
        result[key] = saved[key];
      }
    }
    
    return result;
  }
  
  // Get a setting value
  get(path) {
    const keys = path.split('.');
    let value = this.settings;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  // Set a setting value
  async set(path, value) {
    const keys = path.split('.');
    let current = this.settings;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the value
    current[keys[keys.length - 1]] = value;
    
    // Save to file
    await this.saveSettings();
  }
  
  // Update multiple settings at once
  async update(updates) {
    for (const [path, value] of Object.entries(updates)) {
      const keys = path.split('.');
      let current = this.settings;
      
      // Navigate to the parent object
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      // Set the value
      current[keys[keys.length - 1]] = value;
    }
    
    // Save to file
    await this.saveSettings();
  }
  
  // Get all settings
  getAll() {
    return { ...this.settings };
  }
  
  // Reset to default settings
  async reset() {
    this.settings = { ...this.defaultSettings };
    await this.saveSettings();
  }
  
  // Test function to simulate loading invalid JSON (for debugging)
  async testInvalidJson() {
    console.log('🧪 Testing invalid JSON error logging...');
    const originalFile = this.settingsFile;
    this.settingsFile = 'app_settings_test_invalid.json';
    
    try {
      await this.loadSettings();
    } catch (error) {
      console.log('✅ Error logging test completed');
    }
    
    // Restore original file
    this.settingsFile = originalFile;
  }
}

// Create global instance and initialize
window.settingsManager = new SettingsManager();

// Ensure settings are loaded when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager.loadSettings();
  });
} else {
  // DOM is already loaded
  window.settingsManager.loadSettings();
}

// Add helpful console messages for debugging
console.log('🔧 Settings Manager initialized');
console.log('💡 If you see JSON parse errors, check the console for detailed error information');
console.log('📁 Settings are stored in: app_settings.json');