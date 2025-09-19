const { Pool } = require('pg');

class RealPostgresDatabaseManager {
  constructor(connectionString = process.env.DATABASE_URL) {
    this.connectionString = connectionString;
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: {
          rejectUnauthorized: false // For Supabase
        }
      });
      
      // Test connection
      const client = await this.pool.connect();
      console.log('✅ Connected to PostgreSQL database (Real Leads Data)');
      client.release();
      
    } catch (error) {
      console.error('❌ Error connecting to database:', error);
      throw error;
    }
  }

  async initializeTables() {
    // Only create the additional tables we need for automation
    // Your existing "Leads" table stays as-is
    const tables = [
      // Campaign states - tracks lead progression through automation
      `CREATE TABLE IF NOT EXISTS campaign_states (
        id SERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES "Leads"("LeadId") ON DELETE CASCADE,
        current_state VARCHAR(100) NOT NULL,
        previous_state VARCHAR(100),
        state_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Messages table - stores all generated and sent messages
      `CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES "Leads"("LeadId") ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'connection_request',
        content TEXT NOT NULL,
        ai_generated BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'draft',
        human_approved BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP,
        unipile_message_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Add missing columns to existing messages table
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE`,
      
      // Add missing columns to existing responses table
      `ALTER TABLE responses ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE responses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING'`,

      // Responses table - stores prospect replies
      `CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES "Leads"("LeadId") ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        sentiment VARCHAR(50),
        unipile_message_id VARCHAR(255),
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Activity log - comprehensive audit trail
      `CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES "Leads"("LeadId") ON DELETE CASCADE,
        action VARCHAR(255) NOT NULL,
        details JSONB,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Daily limits tracking
      `CREATE TABLE IF NOT EXISTS daily_limits (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        connection_requests_sent INTEGER DEFAULT 0,
        messages_sent INTEGER DEFAULT 0,
        profile_views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      )`
    ];

    for (const table of tables) {
      await this.executeQuery(table);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_campaign_states_lead_id ON campaign_states(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_campaign_states_current_state ON campaign_states(current_state)',
      'CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)',
      'CREATE INDEX IF NOT EXISTS idx_responses_lead_id ON responses(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_activity_log_lead_id ON activity_log(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_daily_limits_date ON daily_limits(date)'
    ];

    for (const index of indexes) {
      await this.executeQuery(index);
    }

    console.log('✅ Automation tables and indexes created successfully');
  }

  async executeQuery(query, params = []) {
    try {
      const client = await this.pool.connect();
      const result = await client.query(query, params);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // Get leads in format compatible with our automation
  // Maps your real data structure to what our automation expects
  async getLeadsForAutomation(limit = 25) {
    const query = `
      SELECT 
        "LeadId" as id,
        full_name as name,
        COALESCE(
          (positions->0->>'company'), 
          current_company_name
        ) as company,
        linkedin_profile_url as linkedin_url,
        headline as title,
        CASE 
          WHEN positions->0->>'company' LIKE '%Medical%' OR headline ILIKE '%medical%' OR headline ILIKE '%doctor%' OR headline ILIKE '%physician%' THEN 'Healthcare'
          WHEN positions->0->>'company' LIKE '%Tech%' OR headline ILIKE '%technology%' OR headline ILIKE '%software%' THEN 'Technology'
          WHEN headline ILIKE '%consultant%' THEN 'Consulting'
          WHEN headline ILIKE '%director%' OR headline ILIKE '%manager%' THEN 'Management'
          ELSE 'Business Services'
        END as industry,
        'United States' as location
      FROM "Leads" 
      WHERE status = 'initial data'
      LIMIT $1
    `;
    return await this.executeQuery(query, [limit]);
  }

  // Get NEW_LEAD status leads for daily automation
  async getNewLeadsForProcessing(limit = 25) {
    const query = `
      SELECT l."LeadId" as id, l.full_name as name, 
             COALESCE((l.positions->0->>'company'), l.current_company_name) as company,
             l.headline as title,
             CASE 
               WHEN l.positions->0->>'company' LIKE '%Medical%' OR l.headline ILIKE '%medical%' THEN 'Healthcare'
               WHEN l.positions->0->>'company' LIKE '%Tech%' OR l.headline ILIKE '%technology%' THEN 'Technology'
               ELSE 'Business Services'
             END as industry,
             'United States' as location,
             l.linkedin_profile_url as linkedin_url
      FROM "Leads" l
      JOIN (
        SELECT lead_id, current_state,
               ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
        FROM campaign_states
      ) cs ON l."LeadId" = cs.lead_id AND cs.rn = 1
      WHERE cs.current_state = 'NEW_LEAD'
      LIMIT $1
    `;
    return await this.executeQuery(query, [limit]);
  }

  // Initialize leads with NEW_LEAD status
  async initializeNewLeads(limit = 10) {
    console.log(`🔄 Initializing ${limit} leads with NEW_LEAD status...`);
    
    // Get leads that don't have any campaign state yet
    const newLeads = await this.executeQuery(`
      SELECT "LeadId" 
      FROM "Leads" l
      LEFT JOIN campaign_states cs ON l."LeadId" = cs.lead_id
      WHERE cs.lead_id IS NULL 
        AND l.status = 'initial data'
        AND l.full_name IS NOT NULL
        AND l.linkedin_profile_url IS NOT NULL
      LIMIT $1
    `, [limit]);

    console.log(`📋 Found ${newLeads.length} leads to initialize`);

    for (const lead of newLeads) {
      await this.updateCampaignState(lead.LeadId, 'NEW_LEAD', {
        source: 'real_data_initialization',
        initializedAt: new Date().toISOString()
      });
    }

    console.log(`✅ Initialized ${newLeads.length} leads with NEW_LEAD status`);
    return newLeads.length;
  }

  // Helper methods for campaign state management
  async updateCampaignState(leadId, newState, stateData = {}) {
    // Check if a campaign state already exists for this lead
    const existingState = await this.getCurrentCampaignState(leadId);
    
    if (existingState) {
      // Update existing state
      const query = `
        UPDATE campaign_states 
        SET 
          previous_state = current_state,
          current_state = $2,
          state_data = $3,
          updated_at = NOW()
        WHERE lead_id = $1
        RETURNING id
      `;
      return await this.executeQuery(query, [
        leadId, 
        newState, 
        JSON.stringify(stateData)
      ]);
    } else {
      // Insert new state
      const query = `
        INSERT INTO campaign_states (lead_id, current_state, previous_state, state_data, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
      `;
      return await this.executeQuery(query, [
        leadId, 
        newState, 
        null, // No previous state for new entries
        JSON.stringify(stateData)
      ]);
    }
  }

  async getCurrentCampaignState(leadId) {
    const query = `
      SELECT current_state, state_data, created_at
      FROM campaign_states
      WHERE lead_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await this.executeQuery(query, [leadId]);
    return result[0] || null;
  }

  // Daily limits helper
  async getDailyLimits(date) {
    const query = `
      SELECT connection_requests_sent, messages_sent, profile_views
      FROM daily_limits
      WHERE date = $1
    `;
    const result = await this.executeQuery(query, [date]);
    return result[0] || { connection_requests_sent: 0, messages_sent: 0, profile_views: 0 };
  }

  async updateDailyLimits(date, field, increment = 1) {
    const query = `
      INSERT INTO daily_limits (date, ${field})
      VALUES ($1, $2)
      ON CONFLICT (date)
      DO UPDATE SET ${field} = daily_limits.${field} + $2
    `;
    return await this.executeQuery(query, [date, increment]);
  }

  // Alias method for compatibility with state machine
  async incrementDailyLimit(field) {
    const today = new Date().toISOString().split('T')[0];
    return await this.updateDailyLimits(today, field, 1);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }
}

module.exports = RealPostgresDatabaseManager;
