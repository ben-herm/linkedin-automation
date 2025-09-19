#!/usr/bin/env node

require('dotenv').config();
const DatabaseManager = require('../src/database/schema');

async function setupDatabase() {
  console.log('🗄️ Setting up LinkedIn Automation Database...');
  
  const db = new DatabaseManager(process.env.DATABASE_PATH || './data/linkedin_automation.db');
  
  try {
    await db.connect();
    await db.initializeTables();
    
    // Insert default system settings
    const defaultSettings = [
      {
        key: 'daily_connection_limit',
        value: '25',
        description: 'Maximum connection requests per day'
      },
      {
        key: 'daily_message_limit',
        value: '50',
        description: 'Maximum messages per day'
      },
      {
        key: 'follow_up_delay_days',
        value: '3',
        description: 'Days to wait between follow-up messages'
      },
      {
        key: 'max_follow_ups',
        value: '3',
        description: 'Maximum number of follow-up messages per lead'
      },
      {
        key: 'system_status',
        value: 'active',
        description: 'System operational status'
      }
    ];

    for (const setting of defaultSettings) {
      try {
        await db.executeQuery(
          'INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)',
          [setting.key, setting.value, setting.description]
        );
      } catch (error) {
        console.log(`Setting ${setting.key} already exists, skipping...`);
      }
    }

    console.log('✅ Database setup completed successfully!');
    console.log('');
    console.log('📊 Database location:', db.dbPath);
    console.log('🔧 Default settings configured');
    console.log('');
    console.log('Next steps:');
    console.log('1. Copy env.example to .env');
    console.log('2. Add your API keys to .env');
    console.log('3. Run: npm start');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;


