const express = require('express');
const path = require('path');

const router = express.Router();

// GET /dashboard/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {};

    // Total leads
    const totalLeadsQuery = 'SELECT COUNT(*) as count FROM "Leads" WHERE linkedin_profile_url IS NOT NULL';
    const totalLeads = await req.db.executeQuery(totalLeadsQuery);
    
    // Lead initialization stats
    const initializedLeadsQuery = 'SELECT COUNT(DISTINCT lead_id) as count FROM campaign_states';
    const initializedLeads = await req.db.executeQuery(initializedLeadsQuery);
    
    const uninitializedLeadsQuery = `
      SELECT COUNT(*) as count
      FROM "Leads" l
      LEFT JOIN campaign_states cs ON l."LeadId" = cs.lead_id
      WHERE l.linkedin_profile_url IS NOT NULL
        AND cs.lead_id IS NULL
    `;
    const uninitializedLeads = await req.db.executeQuery(uninitializedLeadsQuery);
    stats.totalLeads = totalLeads[0].count;
    stats.initializedLeads = initializedLeads[0].count;
    stats.uninitializedLeads = uninitializedLeads[0].count;

    // Leads by state
    const stateQuery = `
      SELECT cs.current_state, COUNT(*) as count
      FROM (
        SELECT lead_id, current_state,
               ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
        FROM campaign_states
      ) cs
      WHERE cs.rn = 1
      GROUP BY cs.current_state
    `;
    const stateResults = await req.db.executeQuery(stateQuery);
    stats.leadsByState = stateResults.reduce((acc, row) => {
      acc[row.current_state] = row.count;
      return acc;
    }, {});

    // Messages stats
    const messageStatsQuery = `
      SELECT 
        status,
        type,
        COUNT(*) as count
      FROM messages
      GROUP BY status, type
    `;
    const messageStats = await req.db.executeQuery(messageStatsQuery);
    stats.messageStats = messageStats;

    // Daily limits - get today's actual limits (not yesterday's)
    const today = new Date().toISOString().split('T')[0];
    let dailyLimits = await req.db.getDailyLimits(today);
    
    // If no limits exist for today, initialize with zeros
    if (!dailyLimits || (!dailyLimits.connection_requests_sent && dailyLimits.connection_requests_sent !== 0)) {
      dailyLimits = {
        connection_requests_sent: 0,
        messages_sent: 0,
        profile_views: 0
      };
    }
    
    // Count actual connection requests sent from campaign states TODAY
    const connectionRequestsSent = await req.db.executeQuery(`
      SELECT COUNT(*) as count
      FROM (
        SELECT lead_id, current_state, created_at,
               ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
        FROM campaign_states
      ) cs
      WHERE cs.rn = 1 AND cs.current_state = 'CONNECTION_REQUEST_SENT'
        AND DATE(cs.created_at) = $1
    `, [today]);

    stats.dailyLimits = {
      ...dailyLimits,
      connection_requests_sent: connectionRequestsSent[0].count, // Use actual count from DB
      limits: {
        connectionRequests: parseInt(process.env.MAX_CONNECTION_REQUESTS_PER_DAY) || 1,
        messages: parseInt(process.env.MAX_MESSAGES_PER_DAY) || 1,
        profileViews: parseInt(process.env.MAX_PROFILE_VIEWS_PER_DAY) || 5
      }
    };

    // Recent responses (PostgreSQL compatible) - Only show UNREAD responses
    const recentResponsesQuery = `
      SELECT r.*, l.full_name as name, COALESCE(l.positions->0->>'company', 'Unknown Company') as company
      FROM responses r
      JOIN "Leads" l ON r.lead_id = l."LeadId"
      WHERE r.status = 'UNREAD' AND r.processed = FALSE
      ORDER BY r.received_at DESC
      LIMIT 10
    `;
    const recentResponses = await req.db.executeQuery(recentResponsesQuery);
    stats.recentResponses = recentResponses;
    
    // Count of responses we haven't replied to yet (for the Replies card) - deduplicated by lead_id
    const unrepliedResponsesCount = await req.db.executeQuery(`
      SELECT COUNT(*) as count
      FROM (
        SELECT DISTINCT lead_id
        FROM responses
        WHERE status = 'UNREAD' AND processed = FALSE
      ) as unique_leads
    `);
    stats.unrepliedResponsesCount = unrepliedResponsesCount[0].count;

    // Hot leads (interested responses in last 7 days) - PostgreSQL compatible
    const hotLeadsQuery = `
      SELECT l.*, r.content as last_response, r.received_at
      FROM "Leads" l
      JOIN responses r ON l."LeadId" = r.lead_id
      WHERE r.sentiment = 'INTERESTED' 
        AND r.received_at >= NOW() - INTERVAL '7 days'
        AND r.status = 'UNREAD' AND r.processed = FALSE
      ORDER BY r.received_at DESC
    `;
    const hotLeads = await req.db.executeQuery(hotLeadsQuery);
    stats.hotLeads = hotLeads;

    // Pending approvals (PostgreSQL compatible)
    const pendingApprovalsQuery = `
      SELECT COUNT(*) as count
      FROM messages
      WHERE status = 'draft' AND human_approved = false
    `;
    const pendingApprovals = await req.db.executeQuery(pendingApprovalsQuery);
    stats.pendingApprovals = pendingApprovals[0].count;

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// GET /dashboard/leads-by-state/:state - Get leads for a specific state
router.get('/leads-by-state/:state', async (req, res) => {
  try {
    const { state } = req.params;
    const { limit = 50 } = req.query;

    // Get leads in the specified state with latest reply content
    const leadsQuery = `
      SELECT 
        l."LeadId" as id,
        l.full_name as name,
        COALESCE(l.positions->0->>'company', l.current_company_name, 'Unknown Company') as company,
        l.headline as title,
        l.linkedin_profile_url as linkedin_url,
        cs.current_state,
        cs.created_at as state_since,
        cs.state_data,
        r.content as latest_reply,
        r.received_at as reply_time
      FROM "Leads" l
      JOIN (
        SELECT 
          lead_id,
          current_state,
          created_at,
          state_data,
          ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
        FROM campaign_states
      ) cs ON l."LeadId" = cs.lead_id AND cs.rn = 1
      LEFT JOIN (
        SELECT 
          lead_id,
          content,
          received_at,
          ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY received_at DESC) as rn
        FROM responses
      ) r ON l."LeadId" = r.lead_id AND r.rn = 1
      WHERE (cs.current_state = $1
        OR (cs.current_state = 'FOLLOW_UP_DRAFTED' AND $1 = 'RESPONSE_RECEIVED'))
        AND l.linkedin_profile_url IS NOT NULL
      ORDER BY cs.created_at DESC
      LIMIT $2
    `;

    const leads = await req.db.executeQuery(leadsQuery, [state, parseInt(limit)]);
    
    res.json({
      state: state,
      count: leads.length,
      leads: leads
    });
    
  } catch (error) {
    console.error('Error fetching leads by state:', error);
    res.status(500).json({ error: 'Failed to fetch leads by state' });
  }
});

// GET /dashboard/debug-info - Get debug information about daily limits
router.get('/debug-info', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Check daily limits
    const dailyLimits = await req.db.executeQuery('SELECT * FROM daily_limits WHERE date = $1', [today]);
    
    // Check recent activity
    const recentActivity = await req.db.executeQuery(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10'
    );
    
    // Check connection requests sent today
    const connectionRequests = await req.db.executeQuery(`
      SELECT cs.*, l.full_name, l.linkedin_profile_url 
      FROM campaign_states cs
      JOIN "Leads" l ON cs.lead_id = l."LeadId"
      WHERE cs.current_state = 'CONNECTION_REQUEST_SENT' 
        AND DATE(cs.created_at) = $1
      ORDER BY cs.created_at DESC
    `, [today]);
    
    res.json({
      today: today,
      dailyLimits: dailyLimits,
      recentActivity: recentActivity,
      connectionRequestsToday: connectionRequests
    });
    
  } catch (error) {
    console.error('Error fetching debug info:', error);
    res.status(500).json({ error: 'Failed to fetch debug info' });
  }
});

// GET /dashboard/analytics - Get detailed analytics
router.get('/analytics', async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    let dateFilter = '';
    switch (timeframe) {
      case '7d':
        dateFilter = "AND created_at >= datetime('now', '-7 days')";
        break;
      case '30d':
        dateFilter = "AND created_at >= datetime('now', '-30 days')";
        break;
      case '90d':
        dateFilter = "AND created_at >= datetime('now', '-90 days')";
        break;
      default:
        dateFilter = "AND created_at >= datetime('now', '-30 days')";
    }

    const analytics = {};

    // Connection request performance
    const connectionStatsQuery = `
      SELECT 
        DATE(sent_at) as date,
        COUNT(*) as sent,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM campaign_states cs 
          WHERE cs.lead_id = messages.lead_id 
            AND cs.current_state = 'CONNECTION_ACCEPTED'
        ) THEN 1 ELSE 0 END) as accepted
      FROM messages
      WHERE message_type = 'connection_request' 
        AND sent_at IS NOT NULL
        ${dateFilter.replace('created_at', 'sent_at')}
      GROUP BY DATE(sent_at)
      ORDER BY date DESC
    `;
    const connectionStats = await req.db.executeQuery(connectionStatsQuery);
    analytics.connectionStats = connectionStats;

    // Response rates
    const responseRateQuery = `
      SELECT 
        DATE(m.sent_at) as date,
        COUNT(m.id) as messages_sent,
        COUNT(r.id) as responses_received
      FROM messages m
      LEFT JOIN responses r ON m.lead_id = r.lead_id 
        AND r.received_at > m.sent_at
        AND r.received_at <= datetime(m.sent_at, '+7 days')
      WHERE m.message_type IN ('follow_up', 'first_message')
        AND m.sent_at IS NOT NULL
        ${dateFilter.replace('created_at', 'm.sent_at')}
      GROUP BY DATE(m.sent_at)
      ORDER BY date DESC
    `;
    const responseRates = await req.db.executeQuery(responseRateQuery);
    analytics.responseRates = responseRates;

    // Industry performance
    const industryStatsQuery = `
      SELECT 
        l.industry,
        COUNT(l.id) as total_leads,
        COUNT(CASE WHEN cs.current_state = 'CONNECTION_ACCEPTED' THEN 1 END) as connections,
        COUNT(CASE WHEN cs.current_state = 'HOT_LEAD' THEN 1 END) as hot_leads,
        COUNT(r.id) as responses
      FROM leads l
      LEFT JOIN (
        SELECT lead_id, current_state,
               ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
        FROM campaign_states
      ) cs ON l.id = cs.lead_id AND cs.rn = 1
      LEFT JOIN responses r ON l.id = r.lead_id
      WHERE l.industry IS NOT NULL
        ${dateFilter.replace('created_at', 'l.created_at')}
      GROUP BY l.industry
      ORDER BY total_leads DESC
    `;
    const industryStats = await req.db.executeQuery(industryStatsQuery);
    analytics.industryStats = industryStats;

    // Conversion funnel
    const funnelQuery = `
      SELECT 
        'Total Leads' as stage, COUNT(*) as count, 100.0 as percentage
      FROM leads
      WHERE 1=1 ${dateFilter}
      
      UNION ALL
      
      SELECT 
        'Connection Requests Sent' as stage, 
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads WHERE 1=1 ${dateFilter}), 1) as percentage
      FROM messages
      WHERE message_type = 'connection_request' AND status = 'sent'
        ${dateFilter}
      
      UNION ALL
      
      SELECT 
        'Connections Accepted' as stage,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads WHERE 1=1 ${dateFilter}), 1) as percentage
      FROM campaign_states
      WHERE current_state = 'CONNECTION_ACCEPTED'
        ${dateFilter}
      
      UNION ALL
      
      SELECT 
        'Responses Received' as stage,
        COUNT(DISTINCT lead_id) as count,
        ROUND(COUNT(DISTINCT lead_id) * 100.0 / (SELECT COUNT(*) FROM leads WHERE 1=1 ${dateFilter}), 1) as percentage
      FROM responses
      WHERE 1=1 ${dateFilter.replace('created_at', 'received_at')}
      
      UNION ALL
      
      SELECT 
        'Hot Leads' as stage,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads WHERE 1=1 ${dateFilter}), 1) as percentage
      FROM campaign_states
      WHERE current_state = 'HOT_LEAD'
        ${dateFilter}
    `;
    const funnelStats = await req.db.executeQuery(funnelQuery);
    analytics.conversionFunnel = funnelStats;

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /dashboard/activity - Get recent activity feed
router.get('/activity', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const activityQuery = `
      SELECT 
        al.*,
        l.name,
        l.company
      FROM activity_log al
      LEFT JOIN leads l ON al.lead_id = l.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `;

    const activity = await req.db.executeQuery(activityQuery, [parseInt(limit)]);

    res.json({ activity });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// POST /dashboard/initialize-leads - Manual trigger for lead initialization
router.post('/initialize-leads', async (req, res) => {
  try {
    const leadInitializer = req.app.locals.leadInitializer;
    
    if (!leadInitializer) {
      return res.status(500).json({ error: 'Lead initializer not available' });
    }

    // Get current stats
    const statsBefore = await leadInitializer.getStats();
    
    // Run initialization
    await leadInitializer.runNow();
    
    // Get updated stats
    const statsAfter = await leadInitializer.getStats();
    
    res.json({
      success: true,
      message: 'Lead initialization completed',
      before: statsBefore,
      after: statsAfter,
      initialized: statsBefore.uninitialized
    });
    
  } catch (error) {
    console.error('Error running lead initialization:', error);
    res.status(500).json({ 
      error: 'Failed to initialize leads',
      message: error.message 
    });
  }
});

// POST /dashboard/reset-daily-limits - Reset today's daily limits to 0
router.post('/reset-daily-limits', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Reset today's limits to 0
    await req.db.executeQuery(`
      INSERT INTO daily_limits (date, connection_requests_sent, messages_sent, profile_views)
      VALUES ($1, 0, 0, 0)
      ON CONFLICT (date) 
      DO UPDATE SET 
        connection_requests_sent = 0,
        messages_sent = 0,
        profile_views = 0,
        created_at = CURRENT_TIMESTAMP
    `, [today]);
    
    res.json({
      success: true,
      message: 'Daily limits reset to 0 for today',
      date: today
    });
    
  } catch (error) {
    console.error('Error resetting daily limits:', error);
    res.status(500).json({ 
      error: 'Failed to reset daily limits',
      message: error.message 
    });
  }
});

// GET /dashboard/sent-requests-today - Get connection requests sent today
router.get('/sent-requests-today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get leads with connection requests sent today (any state after CONNECTION_REQUEST_SENT)
    const sentRequestsQuery = `
      SELECT 
        l."LeadId" as id,
        l.full_name as name,
        COALESCE(l.positions->0->>'company', l.current_company_name, 'Unknown Company') as company,
        l.headline as title,
        l.linkedin_profile_url as linkedin_url,
        cs.current_state,
        cs.created_at as sent_at,
        cs.state_data
      FROM "Leads" l
      JOIN campaign_states cs ON l."LeadId" = cs.lead_id
      WHERE cs.current_state IN ('CONNECTION_REQUEST_SENT', 'CONNECTION_ACCEPTED', 'RESPONSE_RECEIVED', 'FOLLOW_UP_DRAFTED', 'FOLLOW_UP_SENT')
        AND DATE(cs.created_at) = $1
        AND l.linkedin_profile_url IS NOT NULL
      ORDER BY cs.created_at DESC
    `;

    console.log(`🔍 Sent requests query for ${today}:`);
    console.log(`   Query: ${sentRequestsQuery}`);
    console.log(`   Params: [${today}]`);
    
    const sentRequests = await req.db.executeQuery(sentRequestsQuery, [today]);
    
    console.log(`   Results: ${sentRequests.length} leads found`);
    if (sentRequests.length > 0) {
      sentRequests.forEach((lead, idx) => {
        console.log(`     ${idx + 1}. ${lead.name} - ${lead.current_state} - ${lead.sent_at}`);
      });
    }
    
    res.json({
      date: today,
      count: sentRequests.length,
      requests: sentRequests
    });
    
  } catch (error) {
    console.error('Error fetching sent requests:', error);
    res.status(500).json({ error: 'Failed to fetch sent requests' });
  }
});

// GET /dashboard/unread-replies - Get unread replies
router.get('/unread-replies', async (req, res) => {
  try {
    const unreadRepliesQuery = `
      SELECT 
        r.*, 
        l.full_name as name, 
        COALESCE(l.positions->0->>'company', l.current_company_name, 'Unknown Company') as company,
        l.headline as title,
        l.linkedin_profile_url as linkedin_url,
        r.received_at as response_timestamp
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY received_at DESC) as rn
        FROM responses
        WHERE status = 'UNREAD' AND processed = FALSE
      ) r
      JOIN "Leads" l ON r.lead_id = l."LeadId"
      WHERE r.rn = 1
      ORDER BY r.received_at DESC
    `;
    
    const unreadReplies = await req.db.executeQuery(unreadRepliesQuery);
    
    res.json({
      count: unreadReplies.length,
      replies: unreadReplies
    });
    
  } catch (error) {
    console.error('Error fetching unread replies:', error);
    res.status(500).json({ error: 'Failed to fetch unread replies' });
  }
});

// POST /dashboard/fix-emma - Fix Emma Johnson's state
router.post('/fix-emma', async (req, res) => {
  try {
    // Directly update Emma Johnson to CONNECTION_REQUEST_SENT
    await req.db.executeQuery(`
      INSERT INTO campaign_states (lead_id, current_state, state_data, created_at)
      VALUES (492, 'CONNECTION_REQUEST_SENT', '{"manually_fixed": true}', CURRENT_TIMESTAMP)
    `);
    
    res.json({ success: true, message: 'Emma Johnson set to CONNECTION_REQUEST_SENT' });
  } catch (error) {
    console.error('Error fixing Emma:', error);
    res.status(500).json({ error: 'Failed to fix Emma Johnson' });
  }
});

// POST /dashboard/approve-emma - Manually approve Emma Johnson's connection
router.post('/approve-emma', async (req, res) => {
  try {
    console.log('🔄 Manually approving Emma Johnson connection...');
    
    // Update Emma Johnson to CONNECTION_ACCEPTED
    await req.db.executeQuery(`
      INSERT INTO campaign_states (lead_id, current_state, state_data, created_at)
      VALUES (492, 'CONNECTION_ACCEPTED', $1, CURRENT_TIMESTAMP)
    `, [JSON.stringify({
      manuallyApproved: true,
      approvedAt: new Date().toISOString(),
      reason: 'Manual approval for testing'
    })]);
    
    console.log('✅ Emma Johnson manually approved to CONNECTION_ACCEPTED');
    
    res.json({ 
      success: true, 
      message: 'Emma Johnson manually approved to CONNECTION_ACCEPTED state' 
    });
    
  } catch (error) {
    console.error('Error approving Emma:', error);
    res.status(500).json({ error: 'Failed to approve Emma Johnson' });
  }
});

// POST /dashboard/test-automation/:leadId - Manually trigger automation for a specific lead
router.post('/test-automation/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    
    console.log(`🧪 Manual automation test for Lead ${leadId}`);
    
    // Initialize services (get from app locals)
    const db = req.db;
    const unipile = req.app.locals.unipile || req.app.get('unipile');
    const ai = req.app.locals.ai || req.app.get('ai');
    const whatsapp = req.app.locals.whatsapp || req.app.get('whatsapp');
    
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    if (!unipile) {
      return res.status(500).json({ error: 'Unipile service not initialized' });
    }
    
    if (!ai) {
      return res.status(500).json({ error: 'AI service not initialized' });
    }
    
    // Import state machine
    const { LinkedInMessagingStateMachine } = require('../langgraph/states');
    const stateMachine = new LinkedInMessagingStateMachine(db, unipile, ai, whatsapp);
    
    // Check if lead exists
    const lead = await db.executeQuery('SELECT * FROM "Leads" WHERE "LeadId" = $1', [parseInt(leadId)]);
    if (lead.length === 0) {
      return res.status(404).json({ error: `Lead ${leadId} not found` });
    }
    
    const leadData = lead[0];
    console.log(`📋 Testing with: ${leadData.full_name} (${leadData.linkedin_profile_url})`);
    
    // Check current campaign state
    const currentState = await db.executeQuery(
      'SELECT * FROM campaign_states WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [parseInt(leadId)]
    );
    
    // Initialize if no state exists
    if (currentState.length === 0) {
      console.log(`🆕 Initializing Lead ${leadId} with NEW_LEAD status`);
      await db.updateCampaignState(parseInt(leadId), 'NEW_LEAD', {
        initialized_by: 'manual_test',
        initialized_at: new Date().toISOString(),
        test_lead: true,
        linkedin_url: leadData.linkedin_profile_url
      });
    }
    
    // Check daily limits
    const limits = await stateMachine.checkDailyLimits();
    console.log(`📊 Daily limits: ${limits.connectionRequestsSent}/${limits.maxConnectionRequests}`);
    
    if (!limits.canSendConnections) {
      return res.status(400).json({ 
        error: 'Daily connection limit reached',
        limits: limits
      });
    }
    
    // Execute automation
    console.log(`🚀 Executing start_campaign for Lead ${leadId}...`);
    const result = await stateMachine.executeAction(parseInt(leadId), 'start_campaign');
    
    // Get updated state
    const updatedState = await db.executeQuery(
      'SELECT * FROM campaign_states WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [parseInt(leadId)]
    );
    
    // Get updated limits
    const today = new Date().toISOString().split('T')[0];
    const newLimits = await db.getDailyLimits(today);
    
    res.json({
      success: true,
      leadId: parseInt(leadId),
      leadName: leadData.full_name,
      linkedinUrl: leadData.linkedin_profile_url,
      automationResult: result,
      newState: updatedState[0]?.current_state,
      dailyLimits: {
        connectionsSent: newLimits.connection_requests_sent || 0,
        maxConnections: limits.maxConnectionRequests
      }
    });
    
  } catch (error) {
    console.error('Error in manual automation test:', error);
    res.status(500).json({ 
      error: 'Automation test failed',
      message: error.message 
    });
  }
});

// POST /dashboard/reset-ben-herman - Reset Ben Herman to CONNECTION_ACCEPTED state
router.post('/reset-ben-herman', async (req, res) => {
  try {
    console.log('🔄 Resetting Ben Herman to CONNECTION_ACCEPTED state...');
    
    // First, delete all messages for Ben Herman (LeadId: 4921)
    await req.db.executeQuery(`
      DELETE FROM messages WHERE lead_id = $1
    `, [4921]);
    
    // Delete all responses for Ben Herman
    await req.db.executeQuery(`
      DELETE FROM responses WHERE lead_id = $1
    `, [4921]);
    
    // Delete all campaign states for Ben Herman
    await req.db.executeQuery(`
      DELETE FROM campaign_states WHERE lead_id = $1
    `, [4921]);
    
    // Insert new campaign state: CONNECTION_ACCEPTED
    await req.db.executeQuery(`
      INSERT INTO campaign_states (lead_id, current_state, state_data, created_at)
      VALUES ($1, 'CONNECTION_ACCEPTED', '{"reset": true, "reset_at": $2}', CURRENT_TIMESTAMP)
    `, [4921, new Date().toISOString()]);
    
    console.log('✅ Ben Herman reset to CONNECTION_ACCEPTED state');
    console.log('✅ All messages and responses deleted');
    
    res.json({ 
      success: true, 
      message: 'Ben Herman reset to CONNECTION_ACCEPTED state',
      actions: [
        'Deleted all messages',
        'Deleted all responses', 
        'Deleted all campaign states',
        'Set state to CONNECTION_ACCEPTED'
      ]
    });
    
  } catch (error) {
    console.error('Error resetting Ben Herman:', error);
    res.status(500).json({ error: 'Failed to reset Ben Herman' });
  }
});

// GET /dashboard/cleanup-fake-data - Remove fake test data
router.get('/cleanup-fake-data', async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of fake test data...');
    
    // First, let's see what we have
    const checkResult = await req.db.executeQuery(`
      SELECT id, content, unipile_message_id, status 
      FROM responses 
      WHERE unipile_message_id LIKE 'test-%' 
      OR content LIKE 'Thanks for reaching out%'
      OR content LIKE 'Hi there! I came across%'
      OR content LIKE 'Hello from Emma%'
    `);
    
    console.log(`Found ${checkResult.length} fake responses to delete:`, checkResult);
    
    // Check if response_id column exists in messages table
    const columnCheck = await req.db.executeQuery(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'response_id'
    `);
    
    let deleteMessagesResult = { length: 0 };
    if (columnCheck.length > 0) {
      // Column exists, delete related messages
      deleteMessagesResult = await req.db.executeQuery(`
        DELETE FROM messages 
        WHERE response_id IN (
          SELECT id FROM responses 
          WHERE unipile_message_id LIKE 'test-%' 
          OR content LIKE 'Thanks for reaching out%'
          OR content LIKE 'Hi there! I came across%'
          OR content LIKE 'Hello from Emma%'
        )
      `);
      console.log(`Deleted ${deleteMessagesResult.length} related messages`);
    } else {
      console.log(`response_id column doesn't exist in messages table - skipping message cleanup`);
    }
    
    // Now delete the fake responses
    const deleteResult = await req.db.executeQuery(`
      DELETE FROM responses 
      WHERE unipile_message_id LIKE 'test-%' 
      OR content LIKE 'Thanks for reaching out%'
      OR content LIKE 'Hi there! I came across%'
      OR content LIKE 'Hello from Emma%'
    `);
    
    // Clean up orphaned campaign states (states for leads that no longer exist)
    const orphanedStates = await req.db.executeQuery(`
      SELECT cs.lead_id, cs.current_state, cs.created_at
      FROM campaign_states cs
      LEFT JOIN "Leads" l ON cs.lead_id = l."LeadId"
      WHERE l."LeadId" IS NULL
    `);
    
    console.log(`Found ${orphanedStates.length} orphaned campaign states:`, orphanedStates);
    
    let deletedStatesResult = { length: 0 };
    if (orphanedStates.length > 0) {
      deletedStatesResult = await req.db.executeQuery(`
        DELETE FROM campaign_states 
        WHERE lead_id IN (
          SELECT cs.lead_id
          FROM campaign_states cs
          LEFT JOIN "Leads" l ON cs.lead_id = l."LeadId"
          WHERE l."LeadId" IS NULL
        )
      `);
      console.log(`Deleted ${deletedStatesResult.length} orphaned campaign states`);
    }
    
    console.log(`🧹 Cleaned up fake test responses and orphaned states`);
    
    res.json({ 
      success: true, 
      message: `Removed fake test responses and orphaned states`,
      foundCount: checkResult.length,
      deletedMessages: deleteMessagesResult.length,
      deletedResponses: deleteResult.length,
      orphanedStates: orphanedStates.length,
      deletedStates: deletedStatesResult.length
    });
    
  } catch (error) {
    console.error('Error cleaning up fake data:', error);
    res.status(500).json({ error: 'Failed to clean up fake data', details: error.message });
  }
});

// GET /dashboard/cleanup-emma - Remove Emma's orphaned campaign state
router.get('/cleanup-emma', async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of Emma Johnson orphaned data...');
    
    // Check if Emma's campaign state exists
    const emmaStates = await req.db.executeQuery(`
      SELECT cs.lead_id, cs.current_state, cs.created_at
      FROM campaign_states cs
      WHERE cs.lead_id = 492
    `);
    
    console.log(`Found ${emmaStates.length} campaign states for Emma (LeadId 492):`, emmaStates);
    
    let deletedStatesResult = { length: 0 };
    if (emmaStates.length > 0) {
      deletedStatesResult = await req.db.executeQuery(`
        DELETE FROM campaign_states 
        WHERE lead_id = 492
      `);
      console.log(`Deleted ${deletedStatesResult.length} campaign states for Emma`);
    }
    
    // Also check for any responses for Emma
    const emmaResponses = await req.db.executeQuery(`
      SELECT id, content, unipile_message_id, status 
      FROM responses 
      WHERE lead_id = 492
    `);
    
    console.log(`Found ${emmaResponses.length} responses for Emma:`, emmaResponses);
    
    let deletedResponsesResult = { length: 0 };
    if (emmaResponses.length > 0) {
      deletedResponsesResult = await req.db.executeQuery(`
        DELETE FROM responses 
        WHERE lead_id = 492
      `);
      console.log(`Deleted ${deletedResponsesResult.length} responses for Emma`);
    }
    
    console.log(`🧹 Cleaned up Emma Johnson orphaned data`);
    
    res.json({ 
      success: true, 
      message: `Removed Emma Johnson orphaned data`,
      foundStates: emmaStates.length,
      deletedStates: deletedStatesResult.length,
      foundResponses: emmaResponses.length,
      deletedResponses: deletedResponsesResult.length
    });
    
  } catch (error) {
    console.error('Error cleaning up Emma data:', error);
    res.status(500).json({ error: 'Failed to clean up Emma data', details: error.message });
  }
});

// GET /dashboard/update-emma-state - Update Emma Johnson to CONNECTION_ACCEPTED
router.get('/update-emma-state', async (req, res) => {
  try {
    console.log('🔄 Updating Emma Johnson to CONNECTION_ACCEPTED state...');
    
    // Check Emma's current state
    const currentState = await req.db.executeQuery(`
      SELECT cs.lead_id, cs.current_state, cs.created_at, cs.state_data
      FROM campaign_states cs
      WHERE cs.lead_id = 492
    `);
    
    console.log(`Found ${currentState.length} campaign states for Emma (LeadId 492):`, currentState);
    
    if (currentState.length === 0) {
      // No state exists, create new one
      await req.db.updateCampaignState(492, 'CONNECTION_ACCEPTED', {
        source: 'manual_update',
        updatedAt: new Date().toISOString(),
        reason: 'Set to connection accepted for testing'
      });
      console.log('✅ Created new CONNECTION_ACCEPTED state for Emma');
    } else {
      // Update existing state
      await req.db.updateCampaignState(492, 'CONNECTION_ACCEPTED', {
        source: 'manual_update',
        previousState: currentState[0].current_state,
        updatedAt: new Date().toISOString(),
        reason: 'Updated to connection accepted for testing'
      });
      console.log(`✅ Updated Emma from ${currentState[0].current_state} to CONNECTION_ACCEPTED`);
    }
    
    // Verify the update
    const updatedState = await req.db.executeQuery(`
      SELECT cs.lead_id, cs.current_state, cs.created_at, cs.updated_at, cs.state_data
      FROM campaign_states cs
      WHERE cs.lead_id = 492
    `);
    
    console.log('✅ Emma Johnson state updated successfully');
    
    res.json({ 
      success: true, 
      message: 'Emma Johnson updated to CONNECTION_ACCEPTED',
      previousState: currentState.length > 0 ? currentState[0].current_state : 'none',
      newState: 'CONNECTION_ACCEPTED',
      updatedState: updatedState[0]
    });
    
  } catch (error) {
    console.error('Error updating Emma Johnson state:', error);
    res.status(500).json({ error: 'Failed to update Emma Johnson state', details: error.message });
  }
});

// GET /dashboard/verify-emma - Comprehensive verification of Emma Johnson across all tables
router.get('/verify-emma', async (req, res) => {
  try {
    console.log('🔍 Comprehensive verification of Emma Johnson (LeadId 492)...');
    
    const verification = {
      leadId: 492,
      name: 'Emma Johnson',
      checks: {}
    };
    
    // 1. Check Leads table
    const leadData = await req.db.executeQuery(`
      SELECT "LeadId", full_name, linkedin_profile_url, status, current_company_name, headline
      FROM "Leads" 
      WHERE "LeadId" = 492
    `);
    verification.checks.leadsTable = {
      count: leadData.length,
      data: leadData[0] || null,
      status: leadData.length === 1 ? 'OK' : leadData.length === 0 ? 'MISSING' : 'DUPLICATE'
    };
    
    // 2. Check campaign_states table
    const campaignStates = await req.db.executeQuery(`
      SELECT lead_id, current_state, previous_state, created_at, updated_at, state_data
      FROM campaign_states 
      WHERE lead_id = 492
    `);
    verification.checks.campaignStatesTable = {
      count: campaignStates.length,
      data: campaignStates[0] || null,
      status: campaignStates.length === 1 ? 'OK' : campaignStates.length === 0 ? 'MISSING' : 'DUPLICATE'
    };
    
    // 3. Check responses table
    const responses = await req.db.executeQuery(`
      SELECT id, lead_id, content, status, received_at, unipile_message_id
      FROM responses 
      WHERE lead_id = 492
    `);
    verification.checks.responsesTable = {
      count: responses.length,
      data: responses,
      status: responses.length === 0 ? 'OK' : 'HAS_RESPONSES'
    };
    
    // 4. Check messages table
    const messages = await req.db.executeQuery(`
      SELECT id, lead_id, content, type, status, created_at, sent_at
      FROM messages 
      WHERE lead_id = 492
    `);
    verification.checks.messagesTable = {
      count: messages.length,
      data: messages,
      status: messages.length === 0 ? 'OK' : 'HAS_MESSAGES'
    };
    
    // 5. Check activity_log table
    const activityLogs = await req.db.executeQuery(`
      SELECT id, action, details, created_at, success
      FROM activity_log 
      WHERE details::text LIKE '%492%' OR details::text LIKE '%Emma%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    verification.checks.activityLogTable = {
      count: activityLogs.length,
      data: activityLogs,
      status: 'INFO'
    };
    
    // 6. Overall status
    const hasOneLead = verification.checks.leadsTable.count === 1;
    const hasOneCampaignState = verification.checks.campaignStatesTable.count === 1;
    const isConnectionAccepted = verification.checks.campaignStatesTable.data?.current_state === 'CONNECTION_ACCEPTED';
    
    verification.overallStatus = hasOneLead && hasOneCampaignState && isConnectionAccepted ? 'PERFECT' : 'NEEDS_ATTENTION';
    verification.summary = {
      hasOneLead,
      hasOneCampaignState,
      isConnectionAccepted,
      hasResponses: verification.checks.responsesTable.count > 0,
      hasMessages: verification.checks.messagesTable.count > 0
    };
    
    console.log('✅ Emma Johnson verification completed');
    console.log(`Overall Status: ${verification.overallStatus}`);
    console.log(`Lead Entry: ${verification.checks.leadsTable.count} (${verification.checks.leadsTable.status})`);
    console.log(`Campaign State: ${verification.checks.campaignStatesTable.count} (${verification.checks.campaignStatesTable.status})`);
    console.log(`Current State: ${verification.checks.campaignStatesTable.data?.current_state || 'NONE'}`);
    
    res.json(verification);
    
  } catch (error) {
    console.error('Error verifying Emma Johnson:', error);
    res.status(500).json({ error: 'Failed to verify Emma Johnson', details: error.message });
  }
});

module.exports = router;

