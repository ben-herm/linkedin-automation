// Enhanced Daily Lead Initialization with Comprehensive Logging
const cron = require('node-cron');

class LeadInitializationScheduler {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
  }

  start() {
    console.log('🔄 Starting daily lead initialization scheduler...');

    // Run every day at 8 AM (before main automation at 9 AM)
    cron.schedule('0 8 * * *', async () => {
      await this.runDailyInitialization();
    }, {
      scheduled: true,
      timezone: "Asia/Jerusalem"
    });

    // Also run at startup to catch any immediate issues
    setTimeout(() => {
      this.runDailyInitialization();
    }, 5000); // 5 seconds after startup

    console.log('✅ Lead initialization scheduler started');
    console.log('   📅 Daily run: Every day at 8 AM (Asia/Jerusalem timezone)');
    console.log('   🚀 Startup run: 5 seconds after server start');
  }

  async runDailyInitialization() {
    const startTime = new Date();
    console.log('\n🔄 ===== LEAD INITIALIZATION STARTED =====');
    console.log(`⏰ Start Time: ${startTime.toISOString()}`);
    console.log(`📅 Date: ${startTime.toDateString()}`);
    
    if (this.isRunning) {
      console.log('⏳ Lead initialization already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Lead initialization scheduler activated');

    try {
      // Find leads without campaign states
      console.log('\n🔍 STEP 1: Searching for uninitialized leads...');
      const uninitialized = await this.findUninitializedLeads();
      
      console.log(`   Found ${uninitialized.length} leads without campaign states`);
      
      if (uninitialized.length > 0) {
        console.log('   Uninitialized leads:');
        uninitialized.slice(0, 10).forEach((lead, idx) => {
          console.log(`     ${idx + 1}. ${lead.full_name} (ID: ${lead.LeadId}) - ${lead.linkedin_profile_url}`);
        });
        if (uninitialized.length > 10) {
          console.log(`     ... and ${uninitialized.length - 10} more leads`);
        }
      }
      
      if (uninitialized.length === 0) {
        console.log('✅ All leads are properly initialized');
        return;
      }

      // Initialize each lead
      console.log('\n📝 STEP 2: Initializing leads with NEW_LEAD status...');
      let initialized = 0;
      let errors = 0;
      
      for (let i = 0; i < uninitialized.length; i++) {
        const lead = uninitialized[i];
        
        try {
          console.log(`   📍 Initializing lead ${i + 1}/${uninitialized.length}: ${lead.full_name}`);
          console.log(`      Lead ID: ${lead.LeadId}`);
          console.log(`      LinkedIn: ${lead.linkedin_profile_url}`);
          
          await this.db.updateCampaignState(lead.LeadId, 'NEW_LEAD', {
            source: 'automatic_initialization',
            linkedin_url: lead.linkedin_profile_url,
            initialized_at: new Date().toISOString(),
            initialized_by: 'daily_scheduler'
          });
          
          initialized++;
          console.log(`      ✅ SUCCESS: Initialized ${lead.full_name} as NEW_LEAD`);
          
        } catch (error) {
          errors++;
          console.error(`      ❌ FAILED: Could not initialize ${lead.full_name}`);
          console.error(`      🔍 Error message: ${error.message}`);
          console.error(`      📍 Error stack:`, error.stack);
        }
      }

      // Final summary
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.log('\n✅ ===== LEAD INITIALIZATION COMPLETED =====');
      console.log(`⏰ End Time: ${endTime.toISOString()}`);
      console.log(`⏱️ Duration: ${duration} seconds`);
      console.log(`📊 Results:`);
      console.log(`   ✅ Leads initialized: ${initialized}`);
      console.log(`   ❌ Errors encountered: ${errors}`);
      console.log(`   📋 Total leads processed: ${uninitialized.length}`);
      console.log(`   📈 Success rate: ${initialized > 0 ? Math.round((initialized / uninitialized.length) * 100) : 0}%`);
      console.log('==========================================\n');

    } catch (error) {
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.error('\n💥 ===== LEAD INITIALIZATION FAILED =====');
      console.error(`⏰ Failed at: ${endTime.toISOString()}`);
      console.error(`⏱️ Duration before failure: ${duration} seconds`);
      console.error(`🔍 Error message: ${error.message}`);
      console.error(`📍 Error stack:`, error.stack);
      console.error('=====================================\n');
    } finally {
      this.isRunning = false;
      console.log('🔄 Lead initialization scheduler reset - ready for next run');
    }
  }

  async findUninitializedLeads() {
    try {
      console.log('   🔍 Querying database for leads without campaign states...');
      
      const query = `
        SELECT l."LeadId", l."full_name", l."linkedin_profile_url"
        FROM "Leads" l
        LEFT JOIN campaign_states cs ON l."LeadId" = cs.lead_id
        WHERE cs.lead_id IS NULL
        ORDER BY l."LeadId"
      `;
      
      const result = await this.db.executeQuery(query);
      console.log(`   📊 Database query completed: ${result.length} uninitialized leads found`);
      
      return result;
    } catch (error) {
      console.error('   💥 Database query failed:', error.message);
      throw error;
    }
  }
}

module.exports = LeadInitializationScheduler;
