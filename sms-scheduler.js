/**
 * SMS Scheduler for Scheduled Reminders
 * Handles scheduling and sending SMS messages at specified times
 */

const TwilioAlerts = require('./twilio-alerts');
const path = require('path');
const fs = require('fs');

class SMSScheduler {
  constructor() {
    this.reminders = [];
    this.timers = new Map(); // Map of reminder IDs to timer objects
    this.twilioAlerts = null;
    this.settingsPath = path.join(__dirname, 'app_settings.json');
    this.isRunning = false;
    this.pollInterval = null; // Polling interval for checking due reminders
    this.errorCallback = null; // Callback function to send errors to UI
  }

  /**
   * Set error callback function to send errors to UI
   * @param {Function} callback - Function to call when SMS send fails
   */
  setErrorCallback(callback) {
    this.errorCallback = callback;
  }

  /**
   * Initialize the scheduler with Twilio credentials
   * @param {string} accountSid - Twilio Account SID
   * @param {string} authToken - Twilio Auth Token
   * @param {string} fromNumber - Twilio phone number
   */
  initialize(accountSid, authToken, fromNumber) {
    if (accountSid && authToken && fromNumber) {
      this.twilioAlerts = new TwilioAlerts(accountSid, authToken, fromNumber);
      console.log('SMS Scheduler initialized with Twilio credentials');
    } else {
      console.warn('SMS Scheduler: Twilio credentials not provided');
      this.twilioAlerts = null;
    }
  }

  /**
   * Load reminders from settings file
   */
  loadReminders() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        const reminders = settings.twilio?.scheduledReminders || [];
        this.reminders = reminders.filter(r => r.enabled !== false);
        console.log(`Loaded ${this.reminders.length} scheduled reminders`);
        return this.reminders;
      }
    } catch (error) {
      console.error('Error loading scheduled reminders:', error);
    }
    return [];
  }

  /**
   * Calculate next execution time for a reminder
   * @param {Object} reminder - Reminder object with schedule configuration
   * @returns {Date|null} - Next execution time or null if invalid
   */
  calculateNextExecution(reminder) {
    const now = new Date();
    let nextTime = null;

    if (reminder.type === 'once') {
      // One-time reminder at specific date/time(s)
      // Support both old format (single dateTime) and new format (dateTimes array)
      const dateTimes = reminder.dateTimes || (reminder.dateTime ? [reminder.dateTime] : []);
      
      if (dateTimes.length === 0) {
        return null; // No date/times specified
      }
      
      // Find the next upcoming date/time
      const upcomingTimes = dateTimes
        .map(dt => new Date(dt))
        .filter(dt => dt > now)
        .sort((a, b) => a - b);
      
      if (upcomingTimes.length === 0) {
        return null; // All date/times have passed
      }
      
      nextTime = upcomingTimes[0]; // Get the earliest upcoming date/time
    } else if (reminder.type === 'daily') {
      // Daily reminder at specific time
      const [hours, minutes] = reminder.time.split(':').map(Number);
      nextTime = new Date();
      nextTime.setHours(hours, minutes, 0, 0);
      
      // If time already passed today, schedule for tomorrow
      if (nextTime <= now) {
        nextTime.setDate(nextTime.getDate() + 1);
      }
    } else if (reminder.type === 'weekly') {
      // Weekly reminder on specific day(s) at specific time
      const [hours, minutes] = reminder.time.split(':').map(Number);
      const daysOfWeek = reminder.days || []; // Array of day numbers (0=Sunday, 6=Saturday)
      
      if (daysOfWeek.length === 0) return null;
      
      nextTime = new Date();
      nextTime.setHours(hours, minutes, 0, 0);
      
      const currentDay = now.getDay();
      const sortedDays = daysOfWeek.sort((a, b) => a - b);
      
      // Find next day in the week
      const nextDay = sortedDays.find(day => day > currentDay) || sortedDays[0];
      
      if (nextDay > currentDay) {
        // This week
        nextTime.setDate(now.getDate() + (nextDay - currentDay));
      } else {
        // Next week
        nextTime.setDate(now.getDate() + (7 - currentDay + nextDay));
      }
    } else if (reminder.type === 'interval') {
      // Reminder at regular intervals (e.g., every X hours/minutes)
      const lastExecution = reminder.lastExecution ? new Date(reminder.lastExecution) : null;
      const intervalMs = this.parseInterval(reminder.interval);
      
      if (!intervalMs) return null;
      
      if (lastExecution) {
        nextTime = new Date(lastExecution.getTime() + intervalMs);
        // If next time is in the past, calculate from now
        if (nextTime <= now) {
          nextTime = new Date(now.getTime() + intervalMs);
        }
      } else {
        nextTime = new Date(now.getTime() + intervalMs);
      }
    }

    return nextTime;
  }

  /**
   * Parse interval string (e.g., "2h", "30m", "1d") to milliseconds
   * @param {string} interval - Interval string
   * @returns {number|null} - Milliseconds or null if invalid
   */
  parseInterval(interval) {
    if (!interval) return null;
    
    const match = interval.match(/^(\d+)([hmsd])$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    return value * (multipliers[unit] || 0);
  }

  /**
   * Schedule a reminder
   * @param {Object} reminder - Reminder object
   */
  scheduleReminder(reminder) {
    if (!reminder.enabled) {
      this.cancelReminder(reminder.id);
      return;
    }

    const nextTime = this.calculateNextExecution(reminder);
    if (!nextTime) {
      console.log(`Reminder ${reminder.id} has no valid next execution time`);
      return;
    }

    const now = new Date();
    const delay = nextTime.getTime() - now.getTime();

    if (delay < 0) {
      console.log(`Reminder ${reminder.id} scheduled time is in the past`);
      return;
    }

    // Cancel existing timer if any
    this.cancelReminder(reminder.id);

    // Store the scheduled time for "once" type reminders with multiple date/times
    if (reminder.type === 'once' && reminder.dateTimes && Array.isArray(reminder.dateTimes)) {
      reminder._scheduledTime = nextTime.toISOString();
    }

    // Schedule new timer
    const timer = setTimeout(() => {
      this.executeReminder(reminder);
    }, delay);

    this.timers.set(reminder.id, timer);
    
    console.log(`Scheduled reminder "${reminder.name}" for ${nextTime.toLocaleString()} (in ${Math.round(delay / 1000 / 60)} minutes)`);
  }

  /**
   * Execute a reminder (send SMS)
   * @param {Object} reminder - Reminder object
   */
  async executeReminder(reminder) {
    if (!this.twilioAlerts || !this.twilioAlerts.isEnabled()) {
      const errorMsg = 'Cannot execute reminder: Twilio not configured';
      console.error(errorMsg);
      if (this.errorCallback) {
        this.errorCallback(`SMS Reminder "${reminder.name}": ${errorMsg}`);
      }
      return;
    }

    // Cancel any existing timer for this reminder (in case it was triggered via polling)
    this.cancelReminder(reminder.id);

    try {
      const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
      const twilioConfig = settings.twilio || {};
      const recipientNumber = reminder.recipientNumber;
      const method = reminder.method || twilioConfig.method || 'sms';

      if (!recipientNumber) {
        const errorMsg = `Cannot send reminder ${reminder.id}: No recipient number specified`;
        console.error(errorMsg);
        if (this.errorCallback) {
          this.errorCallback(`SMS Reminder "${reminder.name}": ${errorMsg}`);
        }
        return;
      }

      const message = reminder.message || 'Reminder from MT5 Trader';
      const result = await this.twilioAlerts.sendCustomAlert(message, recipientNumber, method);

      if (result.success) {
        console.log(`✓ Reminder "${reminder.name}" sent successfully`);
        
        // Update last execution time
        reminder.lastExecution = new Date().toISOString();
        
        // If it's a recurring reminder, schedule next execution
        if (reminder.type !== 'once') {
          this.scheduleReminder(reminder);
        } else {
          // One-time reminder - remove the executed date/time
          const now = new Date();
          if (reminder.dateTimes && Array.isArray(reminder.dateTimes)) {
            // Remove the date/time that was scheduled (stored in _scheduledTime)
            if (reminder._scheduledTime) {
              const scheduledTime = new Date(reminder._scheduledTime);
              reminder.dateTimes = reminder.dateTimes.filter(dt => {
                const dtDate = new Date(dt);
                // Remove if it matches the scheduled time (within 1 minute tolerance)
                const timeDiff = Math.abs(dtDate.getTime() - scheduledTime.getTime());
                return timeDiff > 60 * 1000;
              });
              delete reminder._scheduledTime;
            } else {
              // Fallback: remove date/times that are in the past (within 2 minute tolerance)
              reminder.dateTimes = reminder.dateTimes.filter(dt => {
                const dtDate = new Date(dt);
                return dtDate.getTime() > now.getTime() + 2 * 60 * 1000;
              });
            }
            
            // If there are more date/times remaining, schedule the next one
            if (reminder.dateTimes.length > 0) {
              this.scheduleReminder(reminder);
            } else {
              // All date/times completed - mark as disabled
              reminder.enabled = false;
              this.cancelReminder(reminder.id);
            }
          } else {
            // Old format (single dateTime) - mark as completed
            reminder.enabled = false;
            this.cancelReminder(reminder.id);
          }
        }
        
        // Save updated reminder
        this.saveReminders();
      } else {
        const errorMsg = `Failed to send reminder "${reminder.name}": ${result.error}`;
        console.error(errorMsg);
        // Always show error in UI
        if (this.errorCallback) {
          this.errorCallback(`SMS Reminder "${reminder.name}" failed: ${result.error}`);
        }
        // For recurring reminders, reschedule even on failure (will retry next cycle)
        if (reminder.type !== 'once') {
          this.scheduleReminder(reminder);
        }
      }
    } catch (error) {
      const errorMsg = `Error executing reminder ${reminder.id}: ${error.message}`;
      console.error(errorMsg);
      // Always show error in UI
      if (this.errorCallback) {
        this.errorCallback(`SMS Reminder "${reminder.name}" error: ${error.message}`);
      }
      // For recurring reminders, reschedule even on error (will retry next cycle)
      if (reminder.type !== 'once') {
        this.scheduleReminder(reminder);
      }
    }
  }

  /**
   * Cancel a scheduled reminder
   * @param {string} reminderId - Reminder ID
   */
  cancelReminder(reminderId) {
    const timer = this.timers.get(reminderId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(reminderId);
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('SMS Scheduler is already running');
      return;
    }

    this.loadReminders();
    
    // Load Twilio config
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        const twilioConfig = settings.twilio || {};
        
        if (twilioConfig.enabled && twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.fromNumber) {
          this.initialize(
            twilioConfig.accountSid,
            twilioConfig.authToken,
            twilioConfig.fromNumber
          );
        }
      }
    } catch (error) {
      console.error('Error loading Twilio config for scheduler:', error);
    }

    // Schedule all reminders
    this.reminders.forEach(reminder => {
      if (reminder.enabled) {
        this.scheduleReminder(reminder);
      }
    });

    // Start polling mechanism to check for due reminders every minute
    // This ensures reminders fire even if the app was closed and reopened
    this.startPolling();

    this.isRunning = true;
    console.log('SMS Scheduler started');
  }

  /**
   * Start polling mechanism to check for due reminders
   * This ensures reminders fire even if timers were missed (e.g., app was closed)
   */
  startPolling() {
    // Clear any existing polling interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Check for due reminders every minute
    this.pollInterval = setInterval(() => {
      this.checkDueReminders();
    }, 60 * 1000); // Check every 60 seconds

    // Also check immediately
    this.checkDueReminders();
  }

  /**
   * Check for reminders that are due and execute them
   */
  checkDueReminders() {
    if (!this.isRunning) return;

    const now = new Date();
    
    this.reminders.forEach(reminder => {
      if (!reminder.enabled) return;

      const nextTime = this.calculateNextExecution(reminder);
      if (!nextTime) return;

      // If the reminder is due (within the last minute), execute it
      const timeDiff = now.getTime() - nextTime.getTime();
      if (timeDiff >= 0 && timeDiff < 60 * 1000) {
        // Check if this reminder already has a timer (to avoid duplicate execution)
        if (!this.timers.has(reminder.id)) {
          console.log(`Executing due reminder "${reminder.name}" (detected via polling)`);
          this.executeReminder(reminder);
        }
      }
    });
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.timers.forEach((timer, id) => {
      clearTimeout(timer);
    });
    this.timers.clear();
    
    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    this.isRunning = false;
    console.log('SMS Scheduler stopped');
  }

  /**
   * Reload reminders from settings and reinitialize Twilio
   */
  reload() {
    this.stop();
    
    // Reload Twilio config
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        const twilioConfig = settings.twilio || {};
        
        if (twilioConfig.enabled && twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.fromNumber) {
          this.initialize(
            twilioConfig.accountSid,
            twilioConfig.authToken,
            twilioConfig.fromNumber
          );
        } else {
          this.twilioAlerts = null;
        }
      }
    } catch (error) {
      console.error('Error reloading Twilio config for scheduler:', error);
    }
    
    this.start();
  }

  /**
   * Save reminders to settings file
   */
  saveReminders() {
    try {
      const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
      if (!settings.twilio) {
        settings.twilio = {};
      }
      settings.twilio.scheduledReminders = this.reminders;
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving reminders:', error);
    }
  }

  /**
   * Add a new reminder
   * @param {Object} reminder - Reminder object
   */
  addReminder(reminder) {
    // Generate ID if not provided
    if (!reminder.id) {
      reminder.id = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    reminder.enabled = reminder.enabled !== false;
    this.reminders.push(reminder);
    this.saveReminders();
    
    if (reminder.enabled && this.isRunning) {
      this.scheduleReminder(reminder);
    }
    
    return reminder.id;
  }

  /**
   * Update an existing reminder
   * @param {string} reminderId - Reminder ID
   * @param {Object} updates - Updates to apply
   */
  updateReminder(reminderId, updates) {
    const index = this.reminders.findIndex(r => r.id === reminderId);
    if (index === -1) {
      throw new Error(`Reminder ${reminderId} not found`);
    }
    
    this.reminders[index] = { ...this.reminders[index], ...updates };
    this.saveReminders();
    
    // Reschedule if running
    if (this.isRunning) {
      this.cancelReminder(reminderId);
      if (this.reminders[index].enabled) {
        this.scheduleReminder(this.reminders[index]);
      }
    }
  }

  /**
   * Delete a reminder
   * @param {string} reminderId - Reminder ID
   */
  deleteReminder(reminderId) {
    this.cancelReminder(reminderId);
    this.reminders = this.reminders.filter(r => r.id !== reminderId);
    this.saveReminders();
  }

  /**
   * Get all reminders
   * @returns {Array} - Array of reminder objects
   */
  getReminders() {
    return [...this.reminders];
  }
}

module.exports = SMSScheduler;

