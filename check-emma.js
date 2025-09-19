const { Pool } = require('pg');
require('dotenv').config();

async function checkEmma() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('🔍 CHECKING EMMA JOHNSON REPLIES');
    console.log('=================================');
    
    // Find Emma
    const emma = await client.query(
      'SELECT "LeadId", full_name FROM "Leads" WHERE full_name ILIKE $1',
      ['%Emma Johnson%']
    );
    
    if (emma.rows.length === 0) {
      console.log('❌ Emma Johnson not found');
      return;
    }
    
    const emmaId = emma.rows[0].LeadId;
    console.log(`✅ Found Emma: ID=${emmaId}, Name=${emma.rows[0].full_name}`);
    
    // Check responses
    const responses = await client.query(
      'SELECT id, content, unipile_message_id, received_at, status, processed FROM responses WHERE lead_id = $1 ORDER BY received_at DESC',
      [emmaId]
    );
    
    console.log(`\n📊 Emma has ${responses.rows.length} responses:`);
    responses.rows.forEach((response, index) => {
      console.log(`   ${index + 1}. ID: ${response.id}`);
      console.log(`      Content: "${response.content}"`);
      console.log(`      Unipile ID: ${response.unipile_message_id}`);
      console.log(`      Received: ${response.received_at}`);
      console.log(`      Status: ${response.status} | Processed: ${response.processed}`);
    });
    
    // Check campaign state
    const campaignState = await client.query(
      'SELECT current_state, created_at FROM campaign_states WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [emmaId]
    );
    
    if (campaignState.rows.length > 0) {
      console.log(`\n🎯 Current campaign state: ${campaignState.rows[0].current_state}`);
      console.log(`   Since: ${campaignState.rows[0].created_at}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkEmma();
