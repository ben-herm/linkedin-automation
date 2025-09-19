const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function comparePayloadKeys() {
  console.log('🔍 COMPARING PAYLOAD KEYS');
  console.log('========================');

  try {
    // 1. Get the most recent webhook payload
    console.log('1️⃣ RECENT WEBHOOK PAYLOAD KEYS:');
    const recentWebhook = await pool.query(`
      SELECT 
        created_at,
        details
      FROM activity_log
      WHERE action = 'webhook_received' 
        AND created_at >= NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (recentWebhook.rows.length > 0) {
      const webhook = recentWebhook.rows[0];
      console.log(`   Timestamp: ${webhook.created_at}`);
      console.log('   Actual payload keys:');
      console.log('   ', Object.keys(webhook.details || {}));
      console.log('');
    }

    // 2. Expected keys from Unipile documentation
    console.log('2️⃣ EXPECTED KEYS FROM UNIPILE DOCS:');
    const expectedKeys = [
      'account_id',
      'account_type', 
      'account_info',
      'event',
      'chat_id',
      'timestamp',
      'webhook_name',
      'message_id',
      'message',
      'sender',
      'attendees',
      'attachments',
      'reaction',
      'reaction_sender'
    ];
    console.log('   Expected keys:');
    expectedKeys.forEach((key, idx) => {
      console.log(`     ${idx + 1}. ${key}`);
    });
    console.log('');

    // 3. Keys in our curl request
    console.log('3️⃣ KEYS IN OUR CURL REQUEST:');
    const curlKeys = [
      'account_id',
      'account_type',
      'account_info', 
      'event',
      'chat_id',
      'timestamp',
      'webhook_name',
      'message_id',
      'message',
      'sender',
      'attendees'
    ];
    console.log('   Curl request keys:');
    curlKeys.forEach((key, idx) => {
      console.log(`     ${idx + 1}. ${key}`);
    });
    console.log('');

    // 4. Check what keys we're actually receiving
    console.log('4️⃣ ACTUAL RECEIVED KEYS:');
    const actualKeys = await pool.query(`
      SELECT DISTINCT jsonb_object_keys(details) as key
      FROM activity_log
      WHERE action = 'webhook_received'
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY key
    `);
    
    console.log('   Keys found in recent webhooks:');
    actualKeys.rows.forEach((row, idx) => {
      console.log(`     ${idx + 1}. ${row.key}`);
    });
    console.log('');

    // 5. Check for nested JSON strings
    console.log('5️⃣ CHECKING FOR NESTED JSON:');
    const nestedJson = await pool.query(`
      SELECT 
        created_at,
        details
      FROM activity_log
      WHERE action = 'webhook_received' 
        AND created_at >= NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (nestedJson.rows.length > 0) {
      const webhook = nestedJson.rows[0];
      console.log('   Checking for nested JSON strings in keys...');
      
      Object.keys(webhook.details || {}).forEach(key => {
        if (key.includes('{') && key.includes('}')) {
          console.log(`   ⚠️  Found nested JSON in key: ${key.substring(0, 100)}...`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Error during comparison:', error.message);
  } finally {
    await pool.end();
  }
}

comparePayloadKeys();
