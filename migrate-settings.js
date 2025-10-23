// Settings Migration Utility
// This script helps migrate from localStorage to the unified JSON file system

class SettingsMigrator {
  constructor() {
    this.migrationLog = [];
  }

  // Check if migration is needed
  needsMigration() {
    // Check if old localStorage data exists and new file doesn't
    const hasOldData = this.hasLocalStorageData();
    const hasNewFile = this.hasUnifiedSettingsFile();
    
    return hasOldData && !hasNewFile;
  }

  hasLocalStorageData() {
    const keys = [
      'openTradingView',
      'aiEnabled',
      'appConfig',
      'volumeControlSettings',
      'overtradeSettings',
      'panelSizes',
      'historicalData'
    ];
    
    return keys.some(key => localStorage.getItem(key) !== null);
  }

  async hasUnifiedSettingsFile() {
    try {
      if (window.electronAPI && window.electronAPI.loadSettings) {
        const settings = await window.electronAPI.loadSettings('app_settings.json');
        return settings !== null;
      }
    } catch (error) {
      console.log('No unified settings file found');
    }
    return false;
  }

  // Perform migration
  async migrate() {
    console.log('Starting settings migration...');
    this.migrationLog = [];

    try {
      // Create new settings manager instance to handle migration
      const tempSettingsManager = new SettingsManager();
      await tempSettingsManager.loadSettings(); // This will trigger migration

      // Clear old localStorage data after successful migration
      this.clearOldLocalStorageData();

      this.migrationLog.push('✓ Migration completed successfully');
      console.log('Settings migration completed successfully');
      
      return { success: true, log: this.migrationLog };
    } catch (error) {
      this.migrationLog.push(`✗ Migration failed: ${error.message}`);
      console.error('Settings migration failed:', error);
      
      return { success: false, error: error.message, log: this.migrationLog };
    }
  }

  clearOldLocalStorageData() {
    const keysToRemove = [
      'openTradingView',
      'aiEnabled',
      'aiFirecrawlEnabled',
      'aiFirecrawlApiKey',
      'aiFirecrawlBaseUrl',
      'aiOpenRouterEnabled',
      'aiOpenRouterApiKey',
      'aiOpenRouterModel',
      'aiOpenRouterBaseUrl',
      'aiMarketAnalysis',
      'aiNewsAnalysis',
      'aiStrategyOptimization',
      'aiRiskAssessment',
      'appConfig',
      'volumeControlSettings',
      'overtradeSettings',
      'overtradeHistory',
      'overtradeLastWarning',
      'overtradeWarningCount',
      'panelSizes',
      'historicalData'
    ];

    let removedCount = 0;
    keysToRemove.forEach(key => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removedCount++;
      }
    });

    this.migrationLog.push(`✓ Cleaned up ${removedCount} old localStorage entries`);
    console.log(`Cleaned up ${removedCount} old localStorage entries`);
  }

  // Show migration dialog to user
  async showMigrationDialog() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal migration-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h2>🔄 Settings Migration</h2>
          <p>We've updated how settings are stored. Your existing settings can be migrated to the new system.</p>
          <div class="migration-info">
            <p><strong>Benefits of the new system:</strong></p>
            <ul>
              <li>All settings stored in one file</li>
              <li>Better backup and restore capabilities</li>
              <li>Improved performance</li>
              <li>Cross-platform compatibility</li>
            </ul>
          </div>
          <div class="migration-buttons">
            <button id="migrateNowBtn" class="btn btn-primary">Migrate Now</button>
            <button id="migrateLaterBtn" class="btn btn-secondary">Later</button>
            <button id="skipMigrationBtn" class="btn btn-warning">Skip (Start Fresh)</button>
          </div>
          <div id="migrationProgress" style="display: none;">
            <p>Migrating settings...</p>
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
          </div>
          <div id="migrationLog" style="display: none;">
            <h4>Migration Log:</h4>
            <div id="migrationLogContent"></div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.classList.add('show');

      document.getElementById('migrateNowBtn').onclick = async () => {
        document.getElementById('migrationProgress').style.display = 'block';
        document.querySelector('.migration-buttons').style.display = 'none';
        
        const result = await this.migrate();
        
        document.getElementById('migrationProgress').style.display = 'none';
        document.getElementById('migrationLog').style.display = 'block';
        document.getElementById('migrationLogContent').innerHTML = 
          result.log.map(entry => `<div>${entry}</div>`).join('');
        
        setTimeout(() => {
          modal.classList.remove('show');
          setTimeout(() => document.body.removeChild(modal), 300);
          resolve('migrated');
        }, 2000);
      };

      document.getElementById('migrateLaterBtn').onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => document.body.removeChild(modal), 300);
        resolve('later');
      };

      document.getElementById('skipMigrationBtn').onclick = () => {
        this.clearOldLocalStorageData();
        modal.classList.remove('show');
        setTimeout(() => document.body.removeChild(modal), 300);
        resolve('skipped');
      };
    });
  }

  // Auto-check and migrate on app startup
  async autoMigrate() {
    if (await this.needsMigration()) {
      console.log('Migration needed, showing dialog...');
      return await this.showMigrationDialog();
    } else {
      console.log('No migration needed');
      return 'not_needed';
    }
  }
}

// Create global migrator instance
window.settingsMigrator = new SettingsMigrator();

// Auto-run migration check on startup
document.addEventListener('DOMContentLoaded', async () => {
  // Wait a bit for other systems to initialize
  setTimeout(async () => {
    await window.settingsMigrator.autoMigrate();
  }, 1000);
});