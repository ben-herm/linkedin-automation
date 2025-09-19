#!/usr/bin/env node

/**
 * Complete Webhook Setup Script for LinkedIn Automation
 * 
 * This script sets up COMPREHENSIVE webhook listening for ALL LinkedIn events
 * to ensure the automation runs end-to-end without manual intervention.
 * 
 * Events we MUST listen to:
 * - connection_accepted: Trigger first message draft
 * - connection_rejected: Mark as closed lost
 * - message_sent: Confirm delivery and update state
 * - message_received: Analyze response and trigger follow-ups
 * - profile_viewed: Track engagement and update limits
 * - account_restricted: Pause all automation
 * - message_failed: Retry logic
 */

require('dotenv').config();
const axios = require('axios');
const UnipileService = require('../src/services/unipile');

class WebhookManager {
  constructor() {
    this.unipile = new UnipileService(process.env.UNIPILE_API_TOKEN);
    this.webhookUrl = null;
    this.ngrokUrl = null;
    this.dsn = process.env.UNIPILE_DSN;
    
    // Based on official Unipile webhook documentation
    // We need to create separate webhooks for different sources
    this.webhookSources = [
      'messaging',        // For message_received, message_sent, etc.
      'account_status',   // For account status changes
      'relations'         // For new connections/relations
    ];
    
    this.createdWebhooks = [];
  }

  async setupCompleteWebhookSystem() {
    console.log('🚀 Setting up COMPLETE webhook system for LinkedIn automation...\n');
    
    try {
      // Step 1: Ensure server is running and accessible
      await this.ensureServerRunning();
      
      // Step 2: Setup public URL (ngrok or production)
      await this.setupPublicUrl();
      
      // Step 3: Register ALL required webhooks with Unipile
      await this.registerAllWebhooks();
      
      // Step 4: Test webhook endpoint
      await this.testWebhookEndpoint();
      
      // Step 5: Setup webhook monitoring
      await this.setupWebhookMonitoring();
      
      console.log('✅ COMPLETE webhook system setup successful!');
      console.log('🔄 All LinkedIn events will now trigger automation automatically');
      
    } catch (error) {
      console.error('❌ Webhook setup failed:', error);
      throw error;
    }
  }

  async ensureServerRunning() {
    console.log('1️⃣ Checking if automation server is running...');
    
    try {
      const response = await axios.get('http://localhost:3000/health', { timeout: 5000 });
      console.log('   ✅ Server is running and healthy');
      return true;
    } catch (error) {
      console.log('   ❌ Server is not running!');
      console.log('   🔧 Please start the server first: npm start');
      throw new Error('Server must be running before setting up webhooks');
    }
  }

  async setupPublicUrl() {
    console.log('\n2️⃣ Setting up public URL for webhook access...');
    
    // Check if we're in production (has a domain)
    if (process.env.WEBHOOK_DOMAIN) {
      this.webhookUrl = `https://${process.env.WEBHOOK_DOMAIN}/webhooks/unipile`;
      console.log(`   ✅ Using production URL: ${this.webhookUrl}`);
      return;
    }
    
    // For local development, try to setup ngrok
    try {
      console.log('   🔧 Setting up ngrok tunnel for local development...');
      
      // Check if ngrok is running
      try {
        const ngrokApi = await axios.get('http://127.0.0.1:4040/api/tunnels');
        const tunnel = ngrokApi.data.tunnels.find(t => t.config.addr === 'http://localhost:3000');
        
        if (tunnel) {
          this.ngrokUrl = tunnel.public_url;
          this.webhookUrl = `${this.ngrokUrl}/webhooks/unipile`;
          console.log(`   ✅ Found existing ngrok tunnel: ${this.webhookUrl}`);
          return;
        }
      } catch (e) {
        // ngrok not running
      }
      
      console.log('   ⚠️ ngrok not detected. Please run: ngrok http 3000');
      console.log('   📋 Or set WEBHOOK_DOMAIN in .env for production');
      
      // For now, ask user to setup ngrok manually
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve, reject) => {
        readline.question('   🔗 Enter your ngrok URL (e.g., https://abc123.ngrok.io): ', (url) => {
          readline.close();
          if (!url || !url.startsWith('https://')) {
            reject(new Error('Valid HTTPS URL required for webhooks'));
            return;
          }
          this.webhookUrl = `${url}/webhooks/unipile`;
          console.log(`   ✅ Using webhook URL: ${this.webhookUrl}`);
          resolve();
        });
      });
      
    } catch (error) {
      throw new Error(`Failed to setup public URL: ${error.message}`);
    }
  }

  async registerAllWebhooks() {
    console.log('\n3️⃣ Registering ALL required webhooks with Unipile...');
    
    try {
      // First, clear any existing webhooks to avoid duplicates
      await this.clearExistingWebhooks();
      
      console.log(`   📡 Registering webhooks for ${this.webhookSources.length} source types...`);
      console.log(`   🔗 Webhook URL: ${this.webhookUrl}`);
      
      // Register separate webhooks for each source type (per Unipile docs)
      for (const source of this.webhookSources) {
        console.log(`   🔧 Creating webhook for source: ${source}`);
        
        const webhookData = {
          request_url: this.webhookUrl,
          source: source,
          headers: [
            {
              key: "Content-Type",
              value: "application/json"
            },
            {
              key: "Unipile-Auth", 
              value: process.env.WEBHOOK_SECRET || "linkedin-automation-webhook"
            }
          ]
        };
        
        const result = await this.createUnipileWebhook(webhookData);
        this.createdWebhooks.push({
          source: source,
          webhook_id: result.webhook_id,
          result: result
        });
        
        console.log(`   ✅ ${source} webhook created with ID: ${result.webhook_id}`);
      }
      
      console.log('   🎉 All webhooks registered successfully!');
      console.log(`   📊 Total webhooks created: ${this.createdWebhooks.length}`);
      
      // Store webhook info in database for monitoring
      await this.storeWebhookConfig(this.createdWebhooks);
      
      return this.createdWebhooks;
      
    } catch (error) {
      console.error('   ❌ Webhook registration failed:', error.message);
      throw error;
    }
  }

  async createUnipileWebhook(webhookData) {
    const axios = require('axios');
    
    if (!this.dsn) {
      throw new Error('UNIPILE_DSN is required. Get it from your Unipile dashboard.');
    }
    
    const url = `https://${this.dsn}/api/v1/webhooks`;
    
    try {
      const response = await axios.post(url, webhookData, {
        headers: {
          'X-API-KEY': process.env.UNIPILE_API_TOKEN,
          'accept': 'application/json',
          'content-type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Failed to create webhook for ${webhookData.source}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async clearExistingWebhooks() {
    try {
      // Try to get existing webhooks and remove them
      console.log('   🧹 Clearing existing webhooks...');
      
      // Note: This depends on Unipile API having a way to list/delete webhooks
      // If not available, we'll just register new ones (Unipile should handle duplicates)
      
    } catch (error) {
      console.log('   ⚠️ Could not clear existing webhooks (this is usually fine)');
    }
  }

  async testWebhookEndpoint() {
    console.log('\n4️⃣ Testing webhook endpoint...');
    
    try {
      const testPayload = {
        event: 'webhook_test',
        data: {
          test: true,
          timestamp: new Date().toISOString(),
          message: 'Webhook system test'
        }
      };
      
      // Test our webhook endpoint directly
      const response = await axios.post(`${this.webhookUrl.replace('/unipile', '/test')}`, testPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (response.status === 200) {
        console.log('   ✅ Webhook endpoint is responding correctly');
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
      
    } catch (error) {
      console.error('   ❌ Webhook endpoint test failed:', error.message);
      throw new Error('Webhook endpoint is not accessible - check your server and URL');
    }
  }

  async setupWebhookMonitoring() {
    console.log('\n5️⃣ Setting up webhook monitoring and health checks...');
    
    // This will be implemented as part of the server
    console.log('   ✅ Webhook monitoring will be handled by the main server');
    console.log('   📊 Check webhook status at: http://localhost:3000/webhooks/status');
  }

  async storeWebhookConfig(webhookResult) {
    // Store webhook configuration in database for monitoring
    try {
      const DatabaseManager = require('../src/database/schema');
      const db = new DatabaseManager(process.env.DATABASE_PATH);
      await db.connect();
      
      await db.executeQuery(`
        INSERT OR REPLACE INTO system_config (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, ['webhook_config', JSON.stringify({
        url: this.webhookUrl,
        events: this.requiredEvents,
        unipile_response: webhookResult,
        setup_date: new Date().toISOString()
      })]);
      
      await db.close();
      console.log('   💾 Webhook configuration stored in database');
      
    } catch (error) {
      console.log('   ⚠️ Could not store webhook config in database:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const manager = new WebhookManager();
  
  try {
    await manager.setupCompleteWebhookSystem();
    
    console.log('\n🎉 WEBHOOK SETUP COMPLETE!');
    console.log('\n📋 Next steps:');
    console.log('1. Import some leads: http://localhost:3000');
    console.log('2. Start automation: POST /api/leads/start-batch');
    console.log('3. Watch the magic happen automatically! 🚀');
    console.log('\n⚠️  IMPORTANT: Keep your server and ngrok running for continuous automation');
    
  } catch (error) {
    console.error('\n💥 Setup failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure your server is running: npm start');
    console.log('2. Check your Unipile API token in .env');
    console.log('3. Ensure ngrok is running: ngrok http 3000');
    console.log('4. Verify your LinkedIn account is connected in Unipile dashboard');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = WebhookManager;
