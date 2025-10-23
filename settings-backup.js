// Settings Backup and Restore Utility
class SettingsBackup {
  constructor() {
    this.backupVersion = '1.0';
  }

  // Export all settings to a backup file
  async exportSettings() {
    try {
      if (!window.settingsManager) {
        throw new Error('Settings manager not available');
      }

      const settings = window.settingsManager.getAll();
      const backup = {
        version: this.backupVersion,
        timestamp: new Date().toISOString(),
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        settings: settings
      };

      const dataStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `mt5-trader-settings-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage('Settings exported successfully', 'success');
      return true;
    } catch (error) {
      console.error('Error exporting settings:', error);
      showMessage('Failed to export settings: ' + error.message, 'error');
      return false;
    }
  }

  // Import settings from a backup file
  async importSettings(file) {
    try {
      if (!window.settingsManager) {
        throw new Error('Settings manager not available');
      }

      const text = await file.text();
      const backup = JSON.parse(text);

      // Validate backup format
      if (!backup.version || !backup.settings) {
        throw new Error('Invalid backup file format');
      }

      // Show confirmation dialog
      const confirmed = await this.showImportConfirmation(backup);
      if (!confirmed) {
        return false;
      }

      // Create a backup of current settings first
      await this.createAutoBackup();

      // Import the settings
      window.settingsManager.settings = backup.settings;
      await window.settingsManager.saveSettings();

      // Reload the page to apply new settings
      showMessage('Settings imported successfully. Reloading application...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 2000);

      return true;
    } catch (error) {
      console.error('Error importing settings:', error);
      showMessage('Failed to import settings: ' + error.message, 'error');
      return false;
    }
  }

  // Create automatic backup before importing
  async createAutoBackup() {
    try {
      const settings = window.settingsManager.getAll();
      const backup = {
        version: this.backupVersion,
        timestamp: new Date().toISOString(),
        type: 'auto-backup',
        settings: settings
      };

      // Store in localStorage as emergency backup
      localStorage.setItem('mt5-trader-emergency-backup', JSON.stringify(backup));
      console.log('Emergency backup created');
    } catch (error) {
      console.error('Failed to create emergency backup:', error);
    }
  }

  // Show import confirmation dialog
  showImportConfirmation(backup) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal backup-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h2>⚠️ Import Settings</h2>
          <div class="backup-info">
            <p><strong>Backup Information:</strong></p>
            <ul>
              <li><strong>Created:</strong> ${new Date(backup.timestamp).toLocaleString()}</li>
              <li><strong>Version:</strong> ${backup.version}</li>
              <li><strong>Platform:</strong> ${backup.platform || 'Unknown'}</li>
            </ul>
          </div>
          <div class="warning-box">
            <p><strong>⚠️ Warning:</strong> This will replace all your current settings. An automatic backup will be created first.</p>
          </div>
          <div class="backup-buttons">
            <button id="confirmImportBtn" class="btn btn-warning">Import Settings</button>
            <button id="cancelImportBtn" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.classList.add('show');

      document.getElementById('confirmImportBtn').onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => document.body.removeChild(modal), 300);
        resolve(true);
      };

      document.getElementById('cancelImportBtn').onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => document.body.removeChild(modal), 300);
        resolve(false);
      };
    });
  }

  // Restore from emergency backup
  async restoreEmergencyBackup() {
    try {
      const backupStr = localStorage.getItem('mt5-trader-emergency-backup');
      if (!backupStr) {
        throw new Error('No emergency backup found');
      }

      const backup = JSON.parse(backupStr);
      window.settingsManager.settings = backup.settings;
      await window.settingsManager.saveSettings();

      showMessage('Emergency backup restored successfully', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 2000);

      return true;
    } catch (error) {
      console.error('Error restoring emergency backup:', error);
      showMessage('Failed to restore emergency backup: ' + error.message, 'error');
      return false;
    }
  }

  // Reset all settings to defaults
  async resetToDefaults() {
    try {
      if (!window.settingsManager) {
        throw new Error('Settings manager not available');
      }

      const confirmed = await this.showResetConfirmation();
      if (!confirmed) {
        return false;
      }

      // Create backup before reset
      await this.createAutoBackup();

      // Reset to defaults
      await window.settingsManager.reset();

      showMessage('Settings reset to defaults. Reloading application...', 'info');
      setTimeout(() => {
        window.location.reload();
      }, 2000);

      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      showMessage('Failed to reset settings: ' + error.message, 'error');
      return false;
    }
  }

  // Show reset confirmation dialog
  showResetConfirmation() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal backup-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h2>🔄 Reset Settings</h2>
          <div class="warning-box">
            <p><strong>⚠️ Warning:</strong> This will reset ALL settings to their default values. This action cannot be undone (except by restoring from a backup).</p>
            <p>An automatic backup will be created before resetting.</p>
          </div>
          <div class="backup-buttons">
            <button id="confirmResetBtn" class="btn btn-danger">Reset to Defaults</button>
            <button id="cancelResetBtn" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.classList.add('show');

      document.getElementById('confirmResetBtn').onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => document.body.removeChild(modal), 300);
        resolve(true);
      };

      document.getElementById('cancelResetBtn').onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => document.body.removeChild(modal), 300);
        resolve(false);
      };
    });
  }

  // Setup file input handler for import
  setupImportHandler() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.importSettings(file);
      }
    };
    input.click();
  }
}

// Create global backup utility
window.settingsBackup = new SettingsBackup();

// Add backup/restore functions to global scope for easy access
window.exportSettings = () => window.settingsBackup.exportSettings();
window.importSettings = () => window.settingsBackup.setupImportHandler();
window.resetSettings = () => window.settingsBackup.resetToDefaults();
window.restoreEmergencyBackup = () => window.settingsBackup.restoreEmergencyBackup();