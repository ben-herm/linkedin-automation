// Enhanced Daily LinkedIn Automation Scheduler with Comprehensive Logging
const cron = require('node-cron');
const { LinkedInMessagingStateMachine } = require('../langgraph/states');

class DailyAutomationScheduler {
  constructor(db, unipile, ai) {
    this.db = db;
    this.unipile = unipile;
    this.ai = ai;
    this.stateMachine = new LinkedInMessagingStateMachine(db, unipile, ai);
    this.isRunning = false;
  }

  // Start the daily automation scheduler
  start() {
    console.log('🕐 Starting daily automation scheduler...');

    // Run once per day at 9 AM - send daily connection requests
    cron.schedule('0 9 * * *', async () => {
      await this.runDailyAutomation();
    }, {
      scheduled: true,
      timezone: "Asia/Jerusalem"
    });

    console.log('✅ Daily automation scheduler started');
    console.log('   📅 Daily run: Every day at 9 AM (Asia/Jerusalem timezone)');
    console.log('   🎯 Goal: Send up to 1 connection request per day (safe rate)');
    console.log('   ⏰ Timing: 5-20 minute random delays between requests');
  }

  // Enhanced manual trigger with comprehensive logging
  async runDailyAutomation() {
    const startTime = new Date();
    console.log('\n🚀 ===== DAILY AUTOMATION STARTED =====');
    console.log(`⏰ Start Time: ${startTime.toISOString()}`);
    console.log(`📅 Date: ${startTime.toDateString()}`);
    console.log(`🕐 Time: ${startTime.toTimeString()}`);
    
    if (this.isRunning) {
      console.log('⏳ Daily automation already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Daily automation scheduler activated');

    try {
      // 1. Check daily limits
      console.log('\n📊 STEP 1: Checking daily limits...');
      const limits = await this.stateMachine.checkDailyLimits();
      console.log('   Current limits:', JSON.stringify(limits, null, 2));

      if (!limits.canSendConnections && !limits.canSendMessages) {
        console.log('🛑 Daily limits reached, skipping automation');
        console.log('   Connection limit reached:', !limits.canSendConnections);
        console.log('   Message limit reached:', !limits.canSendMessages);
        return;
      }

      // 2. Get leads ready for automation
      console.log('\n📋 STEP 2: Fetching leads ready for automation...');
      const newLeads = await this.db.executeQuery(`
        SELECT l."LeadId" as id, 
               l.full_name as name, 
               COALESCE(l.positions->0->>'company', 'Unknown Company') as company,
               l.headline as title,
               CASE 
                 WHEN l.headline ILIKE '%healthcare%' OR l.headline ILIKE '%medical%' OR l.headline ILIKE '%pharma%' THEN 'Healthcare'
                 WHEN l.headline ILIKE '%manufacturing%' OR l.headline ILIKE '%production%' THEN 'Manufacturing' 
                 WHEN l.headline ILIKE '%restaurant%' OR l.headline ILIKE '%food%' THEN 'Food & Restaurant'
                 WHEN l.headline ILIKE '%retail%' OR l.headline ILIKE '%store%' THEN 'Retail'
                 WHEN l.headline ILIKE '%technology%' OR l.headline ILIKE '%software%' OR l.headline ILIKE '%tech%' THEN 'Technology'
                 WHEN l.headline ILIKE '%founder%' OR l.headline ILIKE '%ceo%' OR l.headline ILIKE '%owner%' THEN 'Business Leadership'
                 ELSE 'Business'
               END as industry,
               COALESCE(l.positions->0->>'location', 'Unknown') as location,
               l.linkedin_profile_url as linkedin_url
        FROM "Leads" l
        JOIN (
          SELECT lead_id, current_state,
                 ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
          FROM campaign_states
        ) cs ON l."LeadId" = cs.lead_id AND cs.rn = 1
        WHERE cs.current_state = 'NEW_LEAD'
        LIMIT 25
      `);
      
      console.log(`   Found ${newLeads.length} leads in NEW_LEAD status`);
      
      if (newLeads.length > 0) {
        console.log('   Lead details:');
        newLeads.slice(0, 5).forEach((lead, idx) => {
          console.log(`     ${idx + 1}. ${lead.name} (${lead.company}) - ${lead.linkedin_url}`);
        });
        if (newLeads.length > 5) {
          console.log(`     ... and ${newLeads.length - 5} more leads`);
        }
      }

      if (newLeads.length === 0) {
        console.log('📭 No leads ready for automation - all leads already processed');
        return;
      }

      // 3. Process leads in batches
      console.log('\n🤝 STEP 3: Processing leads and sending connection requests...');
      let connectionsSent = 0;
      let errors = 0;
      const maxConnections = parseInt(process.env.MAX_CONNECTION_REQUESTS_PER_DAY) || 1;
      console.log(`   Daily limit: ${maxConnections} connection requests`);
      
      for (let i = 0; i < newLeads.length; i++) {
        const lead = newLeads[i];
        
        if (connectionsSent >= maxConnections) {
          console.log(`\n🛑 Daily limit reached (${maxConnections} connections sent)`);
          console.log(`   Remaining leads: ${newLeads.length - i} (will be processed tomorrow)`);
          break;
        }

        console.log(`\n   📍 Processing lead ${i + 1}/${newLeads.length}: ${lead.name}`);
        console.log(`      Company: ${lead.company}`);
        console.log(`      Title: ${lead.title}`);
        console.log(`      Industry: ${lead.industry}`);
        console.log(`      LinkedIn: ${lead.linkedin_url}`);
        
        try {
          console.log(`      🔄 Executing start_campaign action...`);
          const result = await this.stateMachine.executeAction(lead.id, 'start_campaign');
          
          if (result && result.success) {
            connectionsSent++;
            console.log(`      ✅ SUCCESS: Connection request sent to ${lead.name}`);
            console.log(`      📊 Progress: ${connectionsSent}/${maxConnections} connections sent today`);
            
            // Random delay between requests (configurable via environment)
            const minDelay = parseInt(process.env.CONNECTION_DELAY_MIN_MINUTES) || 5;
            const maxDelay = parseInt(process.env.CONNECTION_DELAY_MAX_MINUTES) || 20;
            const delay = Math.floor(Math.random() * (maxDelay - minDelay) * 60 * 1000) + (minDelay * 60 * 1000);
            const delayMinutes = Math.round(delay / (60 * 1000));
            console.log(`      ⏳ Waiting ${delayMinutes} minutes before next request... (${minDelay}-${maxDelay} min range)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            errors++;
            console.log(`      ❌ FAILED: Could not send connection request to ${lead.name}`);
            console.log(`      🔍 Error details:`, result?.error || 'Unknown error');
          }
        } catch (error) {
          errors++;
          console.error(`      💥 EXCEPTION: Error processing lead ${lead.name}`);
          console.error(`      🔍 Error message: ${error.message}`);
          console.error(`      📍 Error stack:`, error.stack);
        }
      }

      // 4. Summary notification (dashboard only)
      console.log('\n📊 STEP 4: Automation summary complete');
      console.log('   📊 All notifications will be handled via dashboard at http://localhost:3000');

      // 5. Final summary
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.log('\n✅ ===== DAILY AUTOMATION COMPLETED =====');
      console.log(`⏰ End Time: ${endTime.toISOString()}`);
      console.log(`⏱️ Duration: ${duration} seconds`);
      console.log(`📊 Results:`);
      console.log(`   ✅ Connection requests sent: ${connectionsSent}`);
      console.log(`   ❌ Errors encountered: ${errors}`);
      console.log(`   📋 Total leads processed: ${Math.min(newLeads.length, maxConnections)}`);
      console.log(`   📈 Success rate: ${connectionsSent > 0 ? Math.round((connectionsSent / (connectionsSent + errors)) * 100) : 0}%`);
      console.log('==========================================\n');

    } catch (error) {
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.error('\n💥 ===== DAILY AUTOMATION FAILED =====');
      console.error(`⏰ Failed at: ${endTime.toISOString()}`);
      console.error(`⏱️ Duration before failure: ${duration} seconds`);
      console.error(`🔍 Error message: ${error.message}`);
      console.error(`📍 Error stack:`, error.stack);
      console.error('=====================================\n');
    } finally {
      this.isRunning = false;
      console.log('🔄 Daily automation scheduler reset - ready for next run');
    }
  }
}

module.exports = DailyAutomationScheduler;
