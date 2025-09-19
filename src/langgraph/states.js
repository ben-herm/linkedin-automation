// LinkedIn Messaging State Machine with LangGraph Logic
class LinkedInMessagingStateMachine {
  constructor(db, unipile, ai) {
    this.db = db;
    this.unipile = unipile;
    this.ai = ai;
    
    // Daily limits from environment - FIXED: Match scheduler default of 10
    this.dailyLimits = {
      connectionRequests: parseInt(process.env.MAX_CONNECTION_REQUESTS_PER_DAY) || 1,
      messages: parseInt(process.env.MAX_MESSAGES_PER_DAY) || 1,
      profileViews: parseInt(process.env.MAX_PROFILE_VIEWS_PER_DAY) || 75
    };
    
    // Message delays
    this.messageDelays = {
      min: parseInt(process.env.MESSAGE_DELAY_MIN_MINUTES) || 30,
      max: parseInt(process.env.MESSAGE_DELAY_MAX_MINUTES) || 120,
      followUpDays: parseInt(process.env.FOLLOW_UP_DELAY_DAYS) || 3
    };
  }

  // Main state machine executor
  async executeAction(leadId, action) {
    console.log(`🔄 StateMachine: Executing ${action} for lead ${leadId}`);
    
    try {
      // Some actions don't require a specific lead
      if (action === 'check_daily_limits' || action === 'process_batch') {
        switch (action) {
          case 'check_daily_limits':
            return await this.checkDailyLimits();
          case 'process_batch':
            return await this.processBatch();
        }
      }

      // Actions that require a specific lead
      const currentStateResult = await this.db.executeQuery(
        'SELECT current_state FROM campaign_states WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
        [leadId]
      );
      const currentState = currentStateResult.length > 0 ? currentStateResult[0].current_state : null;
      const lead = await this.db.executeQuery(`
        SELECT "LeadId" as id, 
               full_name as name, 
               COALESCE(positions->0->>'company', 'Unknown Company') as company,
               linkedin_profile_url as linkedin_url, 
               headline as title,
               CASE 
                 WHEN headline ILIKE '%healthcare%' OR headline ILIKE '%medical%' OR headline ILIKE '%pharma%' THEN 'Healthcare'
                 WHEN headline ILIKE '%manufacturing%' OR headline ILIKE '%production%' THEN 'Manufacturing' 
                 WHEN headline ILIKE '%restaurant%' OR headline ILIKE '%food%' THEN 'Food & Restaurant'
                 WHEN headline ILIKE '%retail%' OR headline ILIKE '%store%' THEN 'Retail'
                 WHEN headline ILIKE '%technology%' OR headline ILIKE '%software%' OR headline ILIKE '%tech%' THEN 'Technology'
                 WHEN headline ILIKE '%founder%' OR headline ILIKE '%ceo%' OR headline ILIKE '%owner%' THEN 'Business Leadership'
                 ELSE 'Business'
               END as industry,
               COALESCE(positions->0->>'location', 'Unknown') as location,
               positions, skills, summary
        FROM "Leads" WHERE "LeadId" = $1
      `, [leadId]);
      
      if (!lead[0]) {
        throw new Error(`Lead ${leadId} not found`);
      }

      switch (action) {
        case 'start_campaign':
          return await this.sendConnectionRequest(leadId, lead[0]);
        case 'send_connection_request':
          return await this.sendConnectionRequest(leadId, lead[0]);
        case 'draft_first_message':
          return await this.draftFirstMessage(leadId, lead[0]);
        case 'continue_after_approval':
          // This action is called from routes with parameters
          console.log(`⚠️ continue_after_approval called without parameters - this should be called from routes`);
          throw new Error('continue_after_approval must be called with approval status and message ID');
        case 'send_follow_up':
          return await this.sendFollowUpMessage(leadId, lead[0]);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      console.error(`❌ Error executing ${action} for lead ${leadId}:`, error);
      await this.handleError(leadId, action, error);
      return { success: false, error: error.message, leadId, action };
    }
  }

  // Analyze LinkedIn profile
  async analyzeProfile(leadId, lead) {
    console.log(`🔍 Analyzing profile for ${lead.name}`);
    
    try {
      // AI analysis of profile
      const analysis = await this.ai.analyzeLinkedInProfile(lead);
      
      // Update state with analysis
      await this.db.updateCampaignState(leadId, 'PROFILE_ANALYZED', {
        profileAnalysis: analysis,
        analyzedAt: new Date().toISOString()
      });
      
      // Auto-trigger next step
      setTimeout(() => this.executeAction(leadId, 'draft_connection_request'), 1000);
      
      return { success: true, analysis, nextAction: 'draft_connection_request' };
    } catch (error) {
      await this.db.updateCampaignState(leadId, 'PROFILE_ANALYSIS_FAILED', {
        error: error.message,
        failedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  // Draft connection request (no message - just prepare to send)
  async draftConnectionRequest(leadId, lead) {
    console.log(`✍️ Preparing connection request for ${lead.name}`);
    
    try {
      // Check daily limits first
      const limitsCheck = await this.checkDailyLimits();
      if (!limitsCheck.canSendConnections) {
        await this.db.updateCampaignState(leadId, 'WAITING_DAILY_LIMIT_RESET', {
          reason: 'connection_request_limit_reached',
          waitUntil: limitsCheck.resetTime
        });
        return { success: false, reason: 'daily_limit_reached', waitUntil: limitsCheck.resetTime };
      }
      
      // No message strategy - just mark as ready to send
      await this.db.updateCampaignState(leadId, 'CONNECTION_REQUEST_READY', {
        strategy: 'no_message',
        readyAt: new Date().toISOString()
      });
      
      // Auto-send connection request with delay
      setTimeout(() => this.executeAction(leadId, 'send_connection_request'), 
        this.getRandomDelay(this.messageDelays.min, this.messageDelays.max) * 60 * 1000);
      
      return { success: true, strategy: 'no_message', nextAction: 'send_connection_request' };
    } catch (error) {
      await this.db.updateCampaignState(leadId, 'CONNECTION_REQUEST_DRAFT_FAILED', {
        error: error.message,
        failedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  // Send connection request (no message)
  async sendConnectionRequest(leadId, lead) {
    console.log(`🤝 Sending connection request to ${lead.name}`);
    
    try {
      // Check daily limits first
      const limitsCheck = await this.checkDailyLimits();
      if (!limitsCheck.canSendConnections) {
        await this.db.updateCampaignState(leadId, 'WAITING_DAILY_LIMIT_RESET', {
          reason: 'connection_request_limit_reached',
          waitUntil: limitsCheck.resetTime
        });
        return { success: false, reason: 'daily_limit_reached', waitUntil: limitsCheck.resetTime };
      }
      
      // Send empty connection request via Unipile
      const result = await this.unipile.sendConnectionRequest(lead.linkedin_url, null);
      
      // Update daily limits
      await this.db.incrementDailyLimit('connection_requests_sent');
      
      // Update state
      await this.db.updateCampaignState(leadId, 'CONNECTION_REQUEST_SENT', {
        unipileMessageId: result.id,
        sentAt: new Date().toISOString(),
        strategy: 'no_message'
      });
      
      console.log(`✅ Connection request sent to ${lead.name}`);
      return { success: true, unipileId: result.id };
      
    } catch (error) {
      return await this.handleConnectionRequestError(leadId, lead, error);
    }
  }

  // Handle connection request errors with smart retry logic
  async handleConnectionRequestError(leadId, lead, error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('already connected')) {
      await this.db.updateCampaignState(leadId, 'ALREADY_CONNECTED', {
        error: 'Already connected to this person',
        discoveredAt: new Date().toISOString()
      });
      // Skip to first message
      setTimeout(() => this.executeAction(leadId, 'draft_first_message'), 5000);
      return { success: false, reason: 'already_connected', nextAction: 'draft_first_message' };
      
    } else if (errorMessage.includes('limit') || errorMessage.includes('rate')) {
      await this.db.updateCampaignState(leadId, 'CONNECTION_REQUEST_LIMIT_REACHED', {
        error: error.message,
        pausedAt: new Date().toISOString(),
        retryAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
      return { success: false, reason: 'daily_limit_reached', retryAfter: '24h' };
      
    } else if (errorMessage.includes('private') || errorMessage.includes('not found')) {
      await this.db.updateCampaignState(leadId, 'CONNECTION_REQUEST_FAILED_PRIVATE', {
        error: error.message,
        finalState: true
      });
      return { success: false, reason: 'private_profile', final: true };
      
    } else if (errorMessage.includes('restricted') || errorMessage.includes('suspended')) {
      await this.db.updateCampaignState(leadId, 'ACCOUNT_RESTRICTED', {
        error: error.message,
        accountIssue: true,
        pausedAt: new Date().toISOString()
      });
      return { success: false, reason: 'account_restricted', pauseAll: true };
      
    } else {
      // Generic retry logic
      await this.db.updateCampaignState(leadId, 'CONNECTION_REQUEST_RETRY', {
        error: error.message,
        retryCount: 1,
        retryAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });
      return { success: false, reason: 'generic_error', retryAfter: '1h' };
    }
  }

  // Draft first message after connection accepted
  async draftFirstMessage(leadId, lead) {
    console.log(`✍️ Drafting first message for ${lead.name}`);
    
    try {
      // Check if lead has sent us any messages before (they might have messaged us first)
      const existingMessages = await this.db.executeQuery(
        'SELECT * FROM responses WHERE lead_id = $1 ORDER BY received_at DESC',
        [leadId]
      );
      
      // Get any previous messages we sent to this lead
      const messageHistory = await this.db.executeQuery(
        'SELECT * FROM messages WHERE lead_id = $1 AND status = \'sent\' ORDER BY created_at ASC',
        [leadId]
      );
      
      console.log(`📋 Found ${existingMessages.length} responses from ${lead.name} and ${messageHistory.length} previous messages`);
      
      // Generate personalized first message with context
      const message = await this.ai.generateFollowUpMessage(lead, messageHistory, 1);
      
      // Store as draft requiring approval
      const messageResult = await this.db.executeQuery(
        'INSERT INTO messages (lead_id, content, type, status, human_approved) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [leadId, message, 'first_message', 'draft', false]
      );
      
      await this.db.updateCampaignState(leadId, 'FIRST_MESSAGE_DRAFTED', {
        messageId: messageResult[0].id,
        draftedAt: new Date().toISOString(),
        requiresApproval: true,
        hasExistingResponses: existingMessages.length > 0
      });
      
      console.log(`✅ First message drafted for ${lead.name} - awaiting approval`);
      return { success: true, messageId: messageResult[0].id, requiresApproval: true };
      
    } catch (error) {
      await this.db.updateCampaignState(leadId, 'FIRST_MESSAGE_DRAFT_FAILED', {
        error: error.message,
        failedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  // Continue after human approval
  async continueAfterApproval(leadId, approved, messageId = null) {
    console.log(`✅ Approval received for lead ${leadId}: ${approved ? 'APPROVED' : 'REJECTED'}`);
    
    try {
      // FIXED: Fetch lead data once at the beginning
      const lead = await this.db.executeQuery(`
        SELECT "LeadId" as id, 
               full_name as name, 
               COALESCE(positions->0->>'company', 'Unknown Company') as company,
               linkedin_profile_url as linkedin_url, 
               headline as title,
               CASE 
                 WHEN headline ILIKE '%healthcare%' OR headline ILIKE '%medical%' OR headline ILIKE '%pharma%' THEN 'Healthcare'
                 WHEN headline ILIKE '%manufacturing%' OR headline ILIKE '%production%' THEN 'Manufacturing' 
                 WHEN headline ILIKE '%restaurant%' OR headline ILIKE '%food%' THEN 'Food & Restaurant'
                 WHEN headline ILIKE '%retail%' OR headline ILIKE '%store%' THEN 'Retail'
                 WHEN headline ILIKE '%technology%' OR headline ILIKE '%software%' OR headline ILIKE '%tech%' THEN 'Technology'
                 WHEN headline ILIKE '%founder%' OR headline ILIKE '%ceo%' OR headline ILIKE '%owner%' THEN 'Business Leadership'
                 ELSE 'Business'
               END as industry,
               COALESCE(positions->0->>'location', 'Unknown') as location,
               positions, skills, summary
        FROM "Leads" WHERE "LeadId" = $1
      `, [leadId]);
      
      if (!lead[0]) {
        throw new Error(`Lead ${leadId} not found`);
      }
      
      if (!approved) {
        console.log(`🔄 Message rejected for lead ${leadId} - generating new message...`);
        
        // Mark the rejected message
        if (messageId) {
          await this.db.executeQuery(
            'UPDATE messages SET status = \'rejected\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [messageId]
          );
        }
        
        // Generate a NEW message
        console.log(`🤖 Generating new message for ${lead[0].name}...`);
        await this.draftFirstMessage(leadId, lead[0]);
        
        return { success: true, status: 'regenerated', message: 'New message generated for approval' };
      }
      
      // ACTUALLY SEND THE MESSAGE THROUGH UNIPILE
      console.log(`🚀 Sending approved message for lead ${leadId}...`);
      
      // Get the message to send (either by messageId or the latest draft)
      let message;
      if (messageId) {
        message = await this.db.executeQuery('SELECT * FROM messages WHERE id = $1', [messageId]);
      } else {
        message = await this.db.executeQuery('SELECT * FROM messages WHERE lead_id = $1 AND status = \'draft\' ORDER BY created_at DESC LIMIT 1', [leadId]);
      }
      
      if (!message[0]) {
        throw new Error(`Message not found for ID ${messageId || leadId}`);
      }
      
      // Update message status to approved before sending
      await this.db.executeQuery(
        'UPDATE messages SET status = \'approved\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [message[0].id]
      );
      
      // Send via Unipile - FIXED: Remove invalid type check
      console.log(`🚀 Sending message via Unipile for lead ${leadId}`);
      console.log(`   Message type: ${message[0].type || 'first_message'}`);
      console.log(`   Message content: ${message[0].content.substring(0, 100)}...`);
      
      // All approved messages are sent as regular messages (not connection requests)
      // Connection requests are sent without messages during the initial campaign
      const unipileResponse = await this.unipile.sendMessage(lead[0].linkedin_url, message[0].content);
      
      // Update message status to sent
      await this.db.executeQuery(
        'UPDATE messages SET status = \'sent\', sent_at = CURRENT_TIMESTAMP, unipile_message_id = $1 WHERE id = $2',
        [unipileResponse.id || 'unknown', message[0].id]
      );
      
      // CRITICAL FIX: Update campaign state based on message type
      const messageType = message[0].type || 'first_message';
      let newState;
      
      if (messageType === 'follow_up') {
        newState = 'FOLLOW_UP_SENT';
      } else {
        newState = 'FIRST_MESSAGE_SENT';
      }
      
      await this.db.updateCampaignState(leadId, newState, {
        messageId: message[0].id,
        unipileMessageId: unipileResponse.id || 'unknown',
        sentAt: new Date().toISOString(),
        messageType: messageType
      });
      
      // CRITICAL FIX: Increment daily message limits
      await this.db.incrementDailyLimit('messages_sent');
      
      // CRITICAL FIX: Mark latest reply as processed when message is sent (only for this lead)
      const latestReply = await this.db.executeQuery(
        'SELECT id FROM responses WHERE lead_id = $1 ORDER BY received_at DESC LIMIT 1',
        [leadId]
      );
      
      if (latestReply.length > 0) {
        await this.db.executeQuery(
          'UPDATE responses SET processed = TRUE, status = $1 WHERE id = $2',
          ['REPLIED', latestReply[0].id]
        );
        console.log(`   ✅ Marked latest reply as processed for lead ${leadId} (Reply ID: ${latestReply[0].id})`);
      }
      
      // CRITICAL FIX: Log activity
      await this.db.executeQuery(
        'INSERT INTO activity_log (lead_id, action, details, success) VALUES ($1, $2, $3, $4)',
        [leadId, 'message_sent', JSON.stringify({
          messageId: message[0].id,
          unipileMessageId: unipileResponse.id,
          messageType: message[0].type,
          content: message[0].content.substring(0, 100) + '...'
        }), true]
      );
      
      console.log(`✅ Message sent successfully via Unipile for lead ${leadId}`);
      console.log(`   Message ID: ${message[0].id}`);
      console.log(`   Unipile Message ID: ${unipileResponse.id || 'unknown'}`);
      console.log(`   Campaign state updated to: FIRST_MESSAGE_SENT`);
      
      return { success: true, status: 'sent', unipileResponse, messageId: message[0].id };
      
    } catch (error) {
      console.error(`❌ DETAILED ERROR processing approval for lead ${leadId}:`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Error stack: ${error.stack}`);
      console.error(`   Lead ID: ${leadId}`);
      console.error(`   Message ID: ${messageId}`);
      console.error(`   Approval status: ${approved}`);
      
      // Update message status to failed
      if (messageId) {
        try {
          await this.db.executeQuery(
            'UPDATE messages SET status = \'failed\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [messageId]
          );
          console.log(`   ✅ Message ${messageId} marked as failed`);
        } catch (updateError) {
          console.error(`   ❌ Failed to update message status: ${updateError.message}`);
        }
      }
      
      // Update campaign state to indicate failure
      try {
        await this.db.updateCampaignState(leadId, 'MESSAGE_SEND_FAILED', {
          error: error.message,
          failedAt: new Date().toISOString(),
          messageId: messageId
        });
        console.log(`   ✅ Campaign state updated to MESSAGE_SEND_FAILED`);
      } catch (stateError) {
        console.error(`   ❌ Failed to update campaign state: ${stateError.message}`);
      }
      
      // Log the error
      try {
        await this.db.executeQuery(
          'INSERT INTO activity_log (lead_id, action, details, success, error_message) VALUES ($1, $2, $3, $4, $5)',
          [leadId, 'message_send_failed', JSON.stringify({
            error: error.message,
            messageId: messageId,
            approvalStatus: approved
          }), false, error.message]
        );
        console.log(`   ✅ Error logged to activity_log`);
      } catch (logError) {
        console.error(`   ❌ Failed to log error: ${logError.message}`);
      }
      
      throw error;
    }
  }

  // Check daily limits
  async checkDailyLimits() {
    const today = new Date().toISOString().split('T')[0];
    const limits = await this.db.getDailyLimits(today);
    
    return {
      canSendConnections: limits.connection_requests_sent < this.dailyLimits.connectionRequests,
      canSendMessages: limits.messages_sent < this.dailyLimits.messages,
      canViewProfiles: limits.profile_views < this.dailyLimits.profileViews,
      resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      current: limits,
      limits: this.dailyLimits
    };
  }

  // Process daily batch of leads
  async processBatch(batchSize = 25) {
    console.log(`🔄 Processing daily batch of ${batchSize} leads`);
    
    try {
      // Get leads ready for processing (NEW_LEAD state)
      const leads = await this.db.executeQuery(`
        SELECT l.id, l.name, l.company 
        FROM leads l
        JOIN (
          SELECT lead_id, current_state,
                 ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
          FROM campaign_states
        ) cs ON l.id = cs.lead_id AND cs.rn = 1
        WHERE cs.current_state = 'NEW_LEAD'
        LIMIT ?
      `, [batchSize]);
      
      console.log(`📋 Found ${leads.length} leads ready for processing`);
      
      // Process each lead with random delays
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const delay = this.getRandomDelay(1, 5) * 60 * 1000 + (i * 30000);
        setTimeout(() => this.executeAction(lead.id, 'analyze_profile'), delay);
      }
      
      return { success: true, processed: leads.length, leads: leads.map(l => l.name) };
      
    } catch (error) {
      console.error('❌ Error processing batch:', error);
      throw error;
    }
  }

  // Utility: Get random delay between min and max minutes
  getRandomDelay(minMinutes, maxMinutes) {
    return Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
  }

  // Send follow-up message (after approval)
  async sendFollowUpMessage(leadId, leadData) {
    console.log(`📤 Sending follow-up message for ${leadData.name}...`);
    
    try {
      // Get the approved follow-up message
      const message = await this.db.executeQuery(
        'SELECT * FROM messages WHERE lead_id = $1 AND type = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
        [leadId, 'follow_up', 'approved']
      );
      
      if (!message[0]) {
        throw new Error('No approved follow-up message found');
      }
      
      // Send via Unipile
      const unipileResponse = await this.unipile.sendMessage(leadData.linkedin_url, message[0].content);
      
      // Update message status to sent
      await this.db.executeQuery(
        'UPDATE messages SET status = $1, sent_at = CURRENT_TIMESTAMP, unipile_message_id = $2 WHERE id = $3',
        ['sent', unipileResponse.id || 'unknown', message[0].id]
      );
      
      // Update campaign state
      await this.db.updateCampaignState(leadId, 'FOLLOW_UP_SENT', {
        messageId: message[0].id,
        unipileMessageId: unipileResponse.id || 'unknown',
        sentAt: new Date().toISOString(),
        followUpNumber: 1
      });
      
      // Increment daily message limit
      await this.db.incrementDailyLimit('messages_sent');
      
      // Log activity
      await this.db.executeQuery(
        'INSERT INTO activity_log (lead_id, action, details, success) VALUES ($1, $2, $3, $4)',
        [leadId, 'follow_up_sent', JSON.stringify({ messageId: message[0].id, unipileResponse }), true]
      );
      
      console.log(`✅ Follow-up message sent successfully for ${leadData.name}`);
      
      return {
        success: true,
        status: 'sent',
        unipileResponse,
        messageId: message[0].id
      };
      
    } catch (error) {
      console.error(`❌ Error sending follow-up message for ${leadData.name}:`, error);
      
      // Update message status to failed
      await this.db.executeQuery(
        'UPDATE messages SET status = $1 WHERE id = (SELECT id FROM messages WHERE lead_id = $2 AND type = $3 ORDER BY created_at DESC LIMIT 1)',
        ['failed', leadId, 'follow_up']
      );
      
      // Update campaign state to failed
      await this.db.updateCampaignState(leadId, 'FOLLOW_UP_SEND_FAILED', {
        error: error.message,
        failedAt: new Date().toISOString()
      });
      
      // Log error
      await this.db.executeQuery(
        'INSERT INTO activity_log (lead_id, action, details, success, error_message) VALUES ($1, $2, $3, $4, $5)',
        [leadId, 'follow_up_send_failed', JSON.stringify({ error: error.message }), false, error.message]
      );
      
      throw error;
    }
  }

  // Error handler
  async handleError(leadId, action, error) {
    await this.db.executeQuery(
      'INSERT INTO activity_log (lead_id, action, details, success, error_message) VALUES ($1, $2, $3, $4, $5)',
      [leadId, `state_machine_${action}`, JSON.stringify({ action, error: error.message }), false, error.message]
    );
  }
}

module.exports = { LinkedInMessagingStateMachine };
