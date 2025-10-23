# Unified Settings System

## Overview

The MT5 Trading Strategy Executor now uses a unified settings system that stores all configuration in a single JSON file (`app_settings.json`). This replaces the previous localStorage-based system and provides better reliability, backup capabilities, and cross-platform compatibility.

## Key Features

- **Single File Storage**: All settings stored in `app_settings.json`
- **Automatic Migration**: Seamlessly migrates from old localStorage system
- **Backup & Restore**: Easy export/import of all settings
- **Real-time Sync**: Settings are saved immediately when changed
- **Backward Compatibility**: Maintains compatibility with existing Python bridge

## Settings Structure

```json
{
  "openTradingView": true,
  "ai": {
    "enabled": false,
    "firecrawl": {
      "enabled": false,
      "apiKey": "",
      "baseUrl": "https://api.firecrawl.dev"
    },
    "openRouter": {
      "enabled": false,
      "apiKey": "",
      "model": "anthropic/claude-3.5-sonnet",
      "baseUrl": "https://openrouter.ai/api/v1"
    },
    "features": {
      "marketAnalysis": true,
      "newsAnalysis": true,
      "strategyOptimization": false,
      "riskAssessment": true
    }
  },
  "twilio": {
    "enabled": false,
    "accountSid": "",
    "authToken": "",
    "fromNumber": "",
    "recipientNumber": "",
    "method": "sms",
    "alerts": {
      "take_profit": true,
      "stop_loss": true,
      "position_opened": false,
      "position_closed": false
    }
  },
  "volumeControl": {
    "enabled": true,
    "symbolLimits": {}
  },
  "overtradeControl": {
    "enabled": true,
    "maxTradesPerHour": 10,
    "maxTradesPerDay": 50,
    "cooldownMinutes": 5,
    "warningEnabled": true,
    "blockTrading": false
  },
  "ui": {
    "panelSizes": null,
    "theme": "dark"
  },
  "historicalData": null,
  "simulator": {
    "positions": [],
    "closed_positions": [],
    "next_ticket": 1000000,
    "initial_balance": 10000.0
  }
}
```

## API Usage

### JavaScript (Frontend)

```javascript
// Get a setting
const aiEnabled = window.settingsManager.get('ai.enabled');
const twilioAlerts = window.settingsManager.get('twilio.alerts');

// Set a setting
await window.settingsManager.set('ai.enabled', true);
await window.settingsManager.set('twilio.accountSid', 'your_sid');

// Update multiple settings
await window.settingsManager.update({
  'ai.enabled': true,
  'ai.firecrawl.apiKey': 'your_key',
  'twilio.enabled': false
});

// Get all settings
const allSettings = window.settingsManager.getAll();

// Reset to defaults
await window.settingsManager.reset();
```

### Python (Backend)

```python
import json

# Load settings
with open('app_settings.json', 'r') as f:
    settings = json.load(f)

# Access Twilio settings
twilio_config = settings.get('twilio', {})
account_sid = twilio_config.get('accountSid', '')

# Update settings
settings['twilio']['enabled'] = True
with open('app_settings.json', 'w') as f:
    json.dump(settings, f, indent=2)
```

## Migration

The system automatically detects old localStorage data and offers to migrate it to the new format. Users can:

1. **Migrate Now**: Automatically transfer all settings
2. **Later**: Keep using old system temporarily
3. **Skip**: Start fresh with default settings

## Backup & Restore

### Export Settings
```javascript
// Export all settings to a downloadable JSON file
await window.settingsBackup.exportSettings();
```

### Import Settings
```javascript
// Import settings from a backup file
window.settingsBackup.setupImportHandler();
```

### Emergency Restore
```javascript
// Restore from automatic backup (created before imports)
await window.settingsBackup.restoreEmergencyBackup();
```

### Reset to Defaults
```javascript
// Reset all settings to default values
await window.settingsBackup.resetToDefaults();
```

## File Locations

- **Main Settings**: `app_settings.json` (root directory)
- **Legacy Files**: Still maintained for backward compatibility
  - `twilio_config.json`
  - `simulator_positions.json`
  - `mt5_trading_settings.json`

## Benefits

1. **Reliability**: File-based storage is more reliable than localStorage
2. **Portability**: Easy to backup, share, and restore settings
3. **Performance**: Faster loading and saving of settings
4. **Debugging**: Settings are human-readable in JSON format
5. **Version Control**: Settings file can be version controlled
6. **Cross-Platform**: Works consistently across different operating systems

## Troubleshooting

### Settings Not Loading
1. Check if `app_settings.json` exists in the root directory
2. Verify the file has valid JSON syntax
3. Check browser console for error messages
4. Try resetting to defaults if file is corrupted

### Migration Issues
1. Check browser console for migration errors
2. Manually export localStorage data before migration
3. Use emergency restore if migration fails
4. Contact support with error logs

### Backup/Restore Problems
1. Ensure backup file is valid JSON
2. Check file permissions in the application directory
3. Verify Electron file system access is working
4. Try creating a new backup and test restore

## Development Notes

- Settings are automatically saved when changed
- All components use the same settings manager instance
- Settings are loaded asynchronously on application startup
- Migration only runs once when old data is detected
- Emergency backups are created before any destructive operations