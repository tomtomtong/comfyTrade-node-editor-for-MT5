// Application Configuration - Updated to use centralized settings
const AppConfig = {
  
  // Get Twilio settings
  getTwilioSettings() {
    return window.settingsManager ? window.settingsManager.get('twilio') : {
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
    };
  },
  
  // Update Twilio settings
  async updateTwilioSettings(settings) {
    if (window.settingsManager) {
      const currentSettings = window.settingsManager.get('twilio') || {};
      const updatedSettings = { ...currentSettings, ...settings };
      await window.settingsManager.set('twilio', updatedSettings);
    }
  },
  
  // Deprecated methods for backward compatibility
  saveToLocalStorage() {
    console.warn('AppConfig.saveToLocalStorage() is deprecated. Settings are now saved automatically.');
  },
  
  loadFromLocalStorage() {
    console.warn('AppConfig.loadFromLocalStorage() is deprecated. Settings are now loaded automatically.');
  }
};
