#!/usr/bin/env node

/**
 * AUTO WEBHOOK SETUP - Runs automatically when server starts
 * 
 * This script ensures webhooks are ALWAYS configured and listening
 * for every LinkedIn state change to maintain full automation.
 */

require('dotenv').config();
const WebhookManager = require('./setup-webhooks');

class AutoWebhookSetup {
  constructor() {
    this.webhookManager = new WebhookManager();
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  async autoSetup() {
    console.log('🔄 Auto-setting up webhooks for continuous automation...');
    
    try {
      // Check if webhooks are already configured
      const existingConfig = await this.checkExistingWebhooks();
      
      if (existingConfig && existingConfig.isValid) {
        console.log('✅ Webhooks already configured and healthy');
        return true;
      }

      // Setup webhooks with retry logic
      await this.setupWithRetry();
      
      console.log('🎉 Auto webhook setup completed successfully!');
      return true;
      
    } catch (error) {
      console.error('❌ Auto webhook setup failed:', error.message);
      
      // Don't crash the server, but log the issue
      console.log('⚠️ Server will continue without webhooks - manual setup required');
      console.log('   Run: node scripts/setup-webhooks.js');
      
      return false;
    }
  }

  async checkExistingWebhooks() {
    try {
      const DatabaseManager = require('../src/database/schema');
      const db = new DatabaseManager(process.env.DATABASE_PATH);
      await db.connect();
      
      const config = await db.executeQuery(
        'SELECT value FROM system_config WHERE key = ?',
        ['webhook_config']
      );
      
      await db.close();
      
      if (config[0]) {
        const webhookConfig = JSON.parse(config[0].value);
        
        // Check if configuration is recent (less than 24 hours old)
        const setupDate = new Date(webhookConfig.setup_date);
        const now = new Date();
        const hoursSinceSetup = (now - setupDate) / (1000 * 60 * 60);
        
        if (hoursSinceSetup < 24) {
          return { isValid: true, config: webhookConfig };
        }
      }
      
      return { isValid: false };
      
    } catch (error) {
      console.log('⚠️ Could not check existing webhook config:', error.message);
      return { isValid: false };
    }
  }

  async setupWithRetry() {
    while (this.retryCount < this.maxRetries) {
      try {
        await this.webhookManager.setupCompleteWebhookSystem();
        return; // Success
        
      } catch (error) {
        this.retryCount++;
        console.log(`⚠️ Webhook setup attempt ${this.retryCount} failed: ${error.message}`);
        
        if (this.retryCount >= this.maxRetries) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, this.retryCount) * 1000;
        console.log(`⏳ Retrying in ${waitTime/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Check if we're in a valid environment for webhook setup
  isWebhookEnvironmentReady() {
    const required = [
      'UNIPILE_API_TOKEN',
      'UNIPILE_DSN'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.log(`⚠️ Missing required environment variables for webhooks: ${missing.join(', ')}`);
      return false;
    }
    
    return true;
  }
}

// Export for use in server startup
module.exports = AutoWebhookSetup;

// CLI usage
if (require.main === module) {
  const autoSetup = new AutoWebhookSetup();
  
  if (!autoSetup.isWebhookEnvironmentReady()) {
    console.log('❌ Environment not ready for webhook setup');
    process.exit(1);
  }
  
  autoSetup.autoSetup()
    .then((success) => {
      if (success) {
        console.log('✅ Auto webhook setup completed');
        process.exit(0);
      } else {
        console.log('⚠️ Webhook setup had issues but server can continue');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('❌ Fatal webhook setup error:', error);
      process.exit(1);
    });
}
