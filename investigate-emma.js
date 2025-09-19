const { Pool } = require('pg');
require('dotenv').config();

async function investigateEmma() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('🔍 INVESTIGATING EMMA JOHNSON SITUATION');
    console.log('==========================================');
    
    // 1. Find Emma in Leads table
    console.log('\n1️⃣ EMMA IN LEADS TABLE:');
    const emmaLead = await client.query(
      'SELECT "LeadId", full_name, linkedin_profile_url, headline FROM "Leads" WHERE full_name ILIKE $1',
      ['%Emma Johnson%']
    );
    
    if (emmaLead.rows.length === 0) {
      console.log('❌ Emma Johnson not found in Leads table');
      return;
    }
    
    const emmaId = emmaLead.rows[0].LeadId;
    console.log(`✅ Found Emma: ID=${emmaId}, Name=${emmaLead.rows[0].full_name}`);
    console.log(`   LinkedIn: ${emmaLead.rows[0].linkedin_profile_url}`);
    console.log(`   Headline: ${emmaLead.rows[0].headline}`);
    
    // 2. Check Emma's campaign states
    console.log('\n2️⃣ EMMA\'S CAMPAIGN STATES:');
    const campaignStates = await client.query(
      'SELECT current_state, previous_state, state_data, created_at, updated_at FROM campaign_states WHERE lead_id = $1 ORDER BY created_at DESC',
      [emmaId]
    );
    
    console.log(`   Found ${campaignStates.rows.length} campaign state records:`);
    campaignStates.rows.forEach((state, index) => {
      console.log(`   ${index + 1}. State: ${state.current_state} | Created: ${state.created_at} | Updated: ${state.updated_at}`);
      if (state.state_data) {
        console.log(`      Data: ${JSON.stringify(state.state_data)}`);
      }
    });
    
    // 3. Check Emma's responses
    console.log('\n3️⃣ EMMA\'S RESPONSES:');
    const responses = await client.query(
      'SELECT id, content, sentiment, unipile_message_id, received_at, processed, status FROM responses WHERE lead_id = $1 ORDER BY received_at DESC',
      [emmaId]
    );
    
    console.log(`   Found ${responses.rows.length} response records:`);
    responses.rows.forEach((response, index) => {
      console.log(`   ${index + 1}. ID: ${response.id} | Content: "${response.content}"`);
      console.log(`      Sentiment: ${response.sentiment} | Processed: ${response.processed} | Status: ${response.status}`);
      console.log(`      Received: ${response.received_at} | Unipile ID: ${response.unipile_message_id}`);
    });
    
    // 4. Check Emma's messages
    console.log('\n4️⃣ EMMA\'S MESSAGES:');
    const messages = await client.query(
      'SELECT id, type, content, status, ai_generated, human_approved, created_at, response_id FROM messages WHERE lead_id = $1 ORDER BY created_at DESC',
      [emmaId]
    );
    
    console.log(`   Found ${messages.rows.length} message records:`);
    messages.rows.forEach((message, index) => {
      console.log(`   ${index + 1}. ID: ${message.id} | Type: ${message.type} | Status: ${message.status}`);
      console.log(`      AI Generated: ${message.ai_generated} | Human Approved: ${message.human_approved}`);
      console.log(`      Response ID: ${message.response_id} | Created: ${message.created_at}`);
      console.log(`      Content: "${message.content.substring(0, 100)}..."`);
    });
    
    // 5. Check activity logs for Emma
    console.log('\n5️⃣ EMMA\'S ACTIVITY LOGS:');
    const activityLogs = await client.query(
      'SELECT action, details, success, created_at FROM activity_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 10',
      [emmaId]
    );
    
    console.log(`   Found ${activityLogs.rows.length} recent activity records:`);
    activityLogs.rows.forEach((log, index) => {
      console.log(`   ${index + 1}. Action: ${log.action} | Success: ${log.success} | Created: ${log.created_at}`);
      if (log.details) {
        console.log(`      Details: ${JSON.stringify(log.details).substring(0, 100)}...`);
      }
    });
    
    // 6. Check for any duplicate entries
    console.log('\n6️⃣ DUPLICATE ANALYSIS:');
    const duplicateResponses = await client.query(
      'SELECT content, COUNT(*) as count FROM responses WHERE lead_id = $1 GROUP BY content HAVING COUNT(*) > 1',
      [emmaId]
    );
    
    if (duplicateResponses.rows.length > 0) {
      console.log('   ⚠️ DUPLICATE RESPONSES FOUND:');
      duplicateResponses.rows.forEach(dup => {
        console.log(`      Content: "${dup.content}" appears ${dup.count} times`);
      });
    } else {
      console.log('   ✅ No duplicate responses found');
    }
    
    console.log('\n✅ Investigation completed');
    
  } catch (error) {
    console.error('❌ Error during investigation:', error.message);
  } finally {
    await pool.end();
  }
}

investigateEmma();
