const { Pool } = require('pg');
require('dotenv').config();

async function cleanupSystem() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('🧹 SYSTEM CLEANUP STARTED');
    console.log('==========================');
    
    // 1. Remove duplicate responses (keep latest per lead)
    console.log('\n1️⃣ REMOVING DUPLICATE RESPONSES...');
    const duplicateResponses = await client.query(`
      DELETE FROM responses 
      WHERE id NOT IN (
        SELECT DISTINCT ON (lead_id) id 
        FROM responses 
        ORDER BY lead_id, received_at DESC
      )
    `);
    console.log(`✅ Removed ${duplicateResponses.rowCount} duplicate responses`);
    
    // 2. Fix any invalid timestamps
    console.log('\n2️⃣ FIXING INVALID TIMESTAMPS...');
    const invalidTimestamps = await client.query(`
      UPDATE responses 
      SET received_at = CURRENT_TIMESTAMP 
      WHERE received_at IS NULL OR received_at = '1970-01-01 00:00:00'::timestamp
    `);
    console.log(`✅ Fixed ${invalidTimestamps.rowCount} invalid timestamps`);
    
    // 3. Set proper status for unprocessed responses
    console.log('\n3️⃣ SETTING PROPER RESPONSE STATUS...');
    const unprocessedResponses = await client.query(`
      UPDATE responses 
      SET status = 'UNREAD', processed = FALSE 
      WHERE status IS NULL OR status = 'PENDING'
    `);
    console.log(`✅ Updated ${unprocessedResponses.rowCount} response statuses`);
    
    // 4. Clean up any orphaned messages (messages without valid lead_id)
    console.log('\n4️⃣ CLEANING ORPHANED MESSAGES...');
    const orphanedMessages = await client.query(`
      DELETE FROM messages 
      WHERE lead_id NOT IN (SELECT "LeadId" FROM "Leads")
    `);
    console.log(`✅ Removed ${orphanedMessages.rowCount} orphaned messages`);
    
    // 5. Clean up any orphaned responses
    console.log('\n5️⃣ CLEANING ORPHANED RESPONSES...');
    const orphanedResponses = await client.query(`
      DELETE FROM responses 
      WHERE lead_id NOT IN (SELECT "LeadId" FROM "Leads")
    `);
    console.log(`✅ Removed ${orphanedResponses.rowCount} orphaned responses`);
    
    // 6. Show final state
    console.log('\n📊 FINAL SYSTEM STATE:');
    const totalResponses = await client.query('SELECT COUNT(*) as count FROM responses');
    const unreadResponses = await client.query('SELECT COUNT(*) as count FROM responses WHERE status = \'UNREAD\' AND processed = FALSE');
    const totalMessages = await client.query('SELECT COUNT(*) as count FROM messages');
    
    console.log(`   Total responses: ${totalResponses.rows[0].count}`);
    console.log(`   Unread responses: ${unreadResponses.rows[0].count}`);
    console.log(`   Total messages: ${totalMessages.rows[0].count}`);
    
    console.log('\n✅ SYSTEM CLEANUP COMPLETED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
  } finally {
    await pool.end();
  }
}

cleanupSystem();
