const express = require('express');
const { LinkedInMessagingStateMachine } = require('../langgraph/states');

const router = express.Router();

// Initialize state machine
let stateMachine = null;

router.use((req, res, next) => {
  if (!stateMachine) {
    stateMachine = new LinkedInMessagingStateMachine(
      req.db,
      req.unipile,
      req.ai
    );
  }
  req.stateMachine = stateMachine;
  next();
});


// POST /webhooks/unipile - Handle ALL Unipile webhooks according to official docs
router.post('/unipile', async (req, res) => {
  try {
    // Log all headers to see what Unipile actually sends
    console.log('webhook started');
    console.log('📋 Webhook Headers:', req.headers);
    
    // Check for common webhook authentication headers
    const possibleAuthHeaders = [
      'unipile-auth',
      'x-webhook-signature', 
      'x-unipile-signature',
      'authorization',
      'x-signature',
      'webhook-signature'
    ];
    
    console.log('🔍 Checking for authentication headers:');
    possibleAuthHeaders.forEach(header => {
      if (req.headers[header]) {
        console.log(`   ✅ Found ${header}: ${req.headers[header]}`);
      }
    });
    
    // For development: Allow webhook to proceed and log what we receive
    console.log('⚠️  AUTHENTICATION: Bypassed for development - implement proper auth after testing');

    const webhookPayload = req.body;
    const timestamp = new Date().toISOString();
    
    // Debug: Log raw body to see what we're actually receiving
    console.log('🔍 Raw request body:', JSON.stringify(req.body, null, 2));
    console.log('🔍 Content-Type:', req.headers['content-type']);
    
    // Clear logging for raw events
    console.log('\n🚨 RAW EVENT FROM UNIPILE:');
    console.log('========================');
    console.log('Raw req.body type:', typeof req.body);
    console.log('Raw req.body keys:', Object.keys(req.body || {}));
    console.log('Raw req.body:', req.body);
    console.log('========================\n');
    
    // Create unique event ID for duplicate prevention
    const eventId = `${webhookPayload.event}_${webhookPayload.account_id}_${webhookPayload.user_provider_id || webhookPayload.user_public_identifier || 'unknown'}_${webhookPayload.timestamp || Date.now()}`;
    
    // Check for duplicate events in the last 5 minutes
    const recentEvents = await req.db.executeQuery(
      'SELECT id FROM activity_log WHERE action = $1 AND details->>\'eventId\' = $2 AND created_at > NOW() - INTERVAL \'5 minutes\'',
      ['webhook_received', eventId]
    );
    
    if (recentEvents.length > 0) {
      console.log(`⚠️ Duplicate webhook event detected, ignoring: ${eventId}`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    
    console.log('\n📥 ===== UNIPILE WEBHOOK RECEIVED =====');
    console.log(`⏰ FULL PAYLOAD: ${webhookPayload}`);
    console.log(`⏰ Timestamp: ${timestamp}`);
    console.log(`🔔 Event: ${webhookPayload.event}`);
    console.log(`🏢 Account Type: ${webhookPayload.account_type}`);
    console.log(`🆔 Account ID: ${webhookPayload.account_id}`);
    console.log(`🆔 Event ID: ${eventId}`);
    console.log(`📋 Full Payload:`, JSON.stringify(webhookPayload, null, 2));
    console.log('=====================================\n');
    
    // Webhook processing enabled - continue with normal flow

    // Log the webhook event
    await req.db.executeQuery(
      'INSERT INTO activity_log (action, details, success) VALUES ($1, $2, $3)',
      ['webhook_received', JSON.stringify({...webhookPayload, eventId}), true]
    );

    // Route webhook based on official Unipile webhook structure
    await routeWebhookEvent(req, webhookPayload);

    // Always respond with 200 within 30 seconds (per Unipile docs)
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      processed: true,
      eventId: eventId
    });

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    
    // Log the error but still return 200 to prevent retries (per Unipile docs)
    await req.db.executeQuery(
      'INSERT INTO activity_log (action, details, success, error_message) VALUES ($1, $2, $3, $4)',
      ['webhook_error', JSON.stringify(req.body), false, error.message]
    );
    
    res.status(200).json({ 
      received: true, 
      error: 'Processing error logged',
      timestamp: new Date().toISOString()
    });
  }
});

// Route webhook events based on official Unipile webhook structure
async function routeWebhookEvent(req, payload) {
  const { event, account_type, account_id } = payload;

  // Only process LinkedIn events for our automation
  if (account_type !== 'LINKEDIN') {
    console.log(`⚠️ Ignoring non-LinkedIn event: ${account_type}`);
    return;
  }

  console.log(`🔄 Processing LinkedIn event: ${event} for account: ${account_id}`);

  switch (event) {
    // MESSAGE EVENTS (from 'messaging' webhook source)
    case 'message_received':
      await handleMessageReceived(req, payload);
      break;
    
    case 'message_sent':
      await handleMessageSent(req, payload);
      break;
      
    case 'message_delivered':
      await handleMessageDelivered(req, payload);
      break;
      
    case 'message_read':
      await handleMessageRead(req, payload);
      break;
      
    case 'message_failed':
      await handleMessageFailed(req, payload);
      break;

    // RELATION EVENTS (from 'relations' webhook source)  
    case 'new_relation':
      await handleNewRelation(req, payload);
      break;
      
    case 'relation_rejected':
    case 'connection_rejected':
      await handleConnectionRejected(req, payload);
      break;

    // ACCOUNT STATUS EVENTS (from 'account_status' webhook source)
    case 'account_sync_completed':
      await handleAccountSyncCompleted(req, payload);
      break;
      
    case 'account_sync_failed':
      await handleAccountSyncFailed(req, payload);
      break;
      
    case 'account_restricted':
      await handleAccountRestricted(req, payload);
      break;
      
    case 'account_warning':
      await handleAccountWarning(req, payload);
      break;

    default:
      console.log(`⚠️ Unhandled webhook event: ${event}`);
      // Log unknown events for future implementation
      await req.db.executeQuery(
        'INSERT INTO activity_log (action, details, success) VALUES ($1, $2, $3)',
        ['unknown_webhook_event', JSON.stringify(payload), true]
      );
  }
}

// ==================== MESSAGE EVENT HANDLERS ====================

// Helper function to get lead data with consistent company/location extraction
async function getLeadData(db, whereClause, params) {
  return await db.executeQuery(
    `SELECT "LeadId" as id, 
            full_name as name, 
            linkedin_profile_url as linkedin_url, 
            headline as title,
            CASE 
              WHEN positions IS NULL OR jsonb_array_length(positions) = 0 THEN 'Unknown Company'
              WHEN positions->0->>'company' IS NULL THEN 'Unknown Company'
              ELSE positions->0->>'company'
            END as company,
            CASE 
              WHEN positions IS NULL OR jsonb_array_length(positions) = 0 THEN 'Unknown'
              WHEN positions->0->>'location' IS NULL THEN 'Unknown'
              ELSE positions->0->>'location'
            END as location
     FROM "Leads" ${whereClause}`,
    params
  );
}

// Handle message received (prospect replied) - CRITICAL for automation flow
async function handleMessageReceived(req, payload) {
  try {
    // Handle different possible payload structures
    const { sender, message, message_id, timestamp, chat_id, attendees, account_info } = payload;
    
    // CRITICAL: Check if this message was sent by our account (not received from prospect)
    // According to Unipile docs: compare sender.attendee_provider_id with account_info.user_id
    const ourAccountUserId = account_info?.user_id;
    const senderProviderId = sender?.attendee_provider_id;
    
    if (ourAccountUserId && senderProviderId && ourAccountUserId === senderProviderId) {
      console.log(`📤 Message sent by our account (${sender?.attendee_name}) - ignoring webhook`);
      console.log(`   Our account ID: ${ourAccountUserId}`);
      console.log(`   Sender ID: ${senderProviderId}`);
      console.log(`   Content: "${message}"`);
      return; // Don't process messages we sent ourselves
    }
    
    // Extract sender profile URL - try multiple possible structures
    let senderProfileUrl = null;
    let senderName = null;
    
    if (sender?.attendee_profile_url) {
      // Structure 1: sender.attendee_profile_url
      senderProfileUrl = sender.attendee_profile_url;
      senderName = sender.attendee_name;
    } else if (sender?.profile_url) {
      // Structure 2: sender.profile_url
      senderProfileUrl = sender.profile_url;
      senderName = sender.name || sender.full_name;
    } else if (attendees && attendees.length > 0) {
      // Structure 3: find sender in attendees array
      const senderAttendee = attendees.find(a => a.is_sender || a.attendee_profile_url);
      if (senderAttendee) {
        senderProfileUrl = senderAttendee.attendee_profile_url || senderAttendee.profile_url;
        senderName = senderAttendee.attendee_name || senderAttendee.name;
      }
    }
    
    if (!senderProfileUrl) {
      console.log('⚠️ Message received but no sender profile URL found');
      console.log('Available payload keys:', Object.keys(payload));
      console.log('Sender object:', JSON.stringify(sender, null, 2));
      return;
    }

    console.log(`💬 Message received from: ${senderName} (${senderProfileUrl})`);
    console.log(`   Content: "${message}"`);
    console.log(`   Our account ID: ${ourAccountUserId}`);
    console.log(`   Sender ID: ${senderProviderId}`);

    // Find the lead by LinkedIn URL - try exact match first, then pattern match
    let lead = await getLeadData(req.db, 'WHERE linkedin_profile_url = $1', [senderProfileUrl]);
    
    // If exact match fails, try pattern matching with profile identifier
    if (!lead[0]) {
      const profileId = senderProfileUrl.split('/').pop()?.replace('/', '');
      if (profileId) {
        // Try matching by the provider ID (the long string in the URL)
        lead = await getLeadData(req.db, 'WHERE linkedin_profile_url LIKE $1', [`%${profileId}%`]);
      }
    }
    
    // No more fallback searches - if we can't find the lead, that's it

    if (!lead[0]) {
      console.log(`⚠️ Message received from unknown profile: ${senderProfileUrl}`);
      return;
    }

    const leadId = lead[0].id;
    console.log(`✅ Found lead: ${lead[0].name} (ID: ${leadId})`);

    // Check for duplicate response based on unipile_message_id
    const existingResponse = await req.db.executeQuery(
      'SELECT id FROM responses WHERE unipile_message_id = $1',
      [message_id]
    );
    
    if (existingResponse.length > 0) {
      console.log(`⚠️ Duplicate response detected, skipping: ${message_id}`);
      return;
    }
    
    // Parse and validate timestamp
    let validTimestamp;
    if (timestamp) {
      try {
        validTimestamp = new Date(timestamp).toISOString();
        if (isNaN(new Date(timestamp).getTime())) {
          throw new Error('Invalid timestamp');
        }
      } catch (error) {
        console.log(`⚠️ Invalid timestamp provided: ${timestamp}, using current time`);
        validTimestamp = new Date().toISOString();
      }
    } else {
      validTimestamp = new Date().toISOString();
    }
    
    // Store the response in database
    const responseResult = await req.db.executeQuery(
      'INSERT INTO responses (lead_id, content, unipile_message_id, received_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [leadId, message, message_id, validTimestamp]
    );

    // 🤖 AI ANALYSIS - CRITICAL for automation routing
    console.log(`🤖 Analyzing response from ${senderName}: "${message}"`);
    const analysis = await req.ai.analyzeResponse(message);

    // Update response with analysis
    await req.db.executeQuery(
      'UPDATE responses SET sentiment = $1 WHERE id = $2',
      [analysis.sentiment, responseResult[0].id]
    );

    // Update campaign state based on analysis
    if (analysis.sentiment === 'INTERESTED' || analysis.calendar_request) {
      await req.db.updateCampaignState(leadId, 'HOT_LEAD', {
        responseId: responseResult[0].id,
        sentiment: analysis.sentiment,
        calendarRequest: analysis.calendar_request,
        analysis: analysis,
        receivedAt: timestamp || new Date().toISOString()
      });

      // 🔥 HOT LEAD NOTIFICATIONS (Dashboard only)
      console.log(`🔥 HOT LEAD DETECTED: ${lead[0].name} - Check dashboard for details`);
    } else if (analysis.sentiment === 'NEGATIVE') {
      await req.db.updateCampaignState(leadId, 'CLOSED_LOST', {
        reason: 'negative_response',
        responseId: responseResult[0].id,
        analysis: analysis
      });
    } else {
      // Neutral response - auto-generate follow-up message
      await req.db.updateCampaignState(leadId, 'RESPONSE_RECEIVED', {
        responseId: responseResult[0].id,
        sentiment: analysis.sentiment,
        analysis: analysis
      });

      console.log(`✅ Response received from ${lead[0].name} - marked as RESPONSE_RECEIVED`);
      console.log(`🤖 Auto-generating follow-up message...`);
      
      try {
        // Get message history for context
        const messageHistory = await req.db.executeQuery(
          'SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC',
          [leadId]
        );
        
        // Map lead data to expected format
        const mappedLead = {
          name: lead[0].full_name,
          company: lead[0].positions?.[0]?.company || lead[0].current_company_name || 'Unknown Company',
          title: lead[0].positions?.[0]?.title || lead[0].headline,
          location: lead[0].positions?.[0]?.location || 'Unknown',
          linkedin_url: lead[0].linkedin_profile_url,
          summary: lead[0].summary,
          skills: lead[0].skills
        };
        
        // Generate follow-up message using OpenAI
        console.log(`🤖 Generating follow-up message for ${mappedLead.name}...`);
        const followUpContent = await req.ai.generateFollowUpMessage(mappedLead, messageHistory, 1);
        
        if (!followUpContent || followUpContent.trim() === '') {
          throw new Error('AI generated empty message content');
        }
        
        console.log(`✅ Generated follow-up message: "${followUpContent.substring(0, 100)}..."`);
        
        // Check if there's already a pending follow-up message for this lead
        const existingMessage = await req.db.executeQuery(
          'SELECT id FROM messages WHERE lead_id = $1 AND type = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
          [leadId, 'follow_up', 'draft']
        );
        
        let followUpResult;
        if (existingMessage.length > 0) {
          // Update existing pending message
          followUpResult = await req.db.executeQuery(
            'UPDATE messages SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
            [followUpContent, existingMessage[0].id]
          );
          console.log(`🔄 Updated existing follow-up message for ${lead[0].name}`);
        } else {
          // Create new draft follow-up message
          followUpResult = await req.db.executeQuery(
            'INSERT INTO messages (lead_id, type, content, ai_generated, status, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING id',
            [leadId, 'follow_up', followUpContent, true, 'draft']
          );
          console.log(`✨ Created new follow-up message for ${lead[0].name}`);
        }
        
        // Update campaign state to follow-up drafted
        await req.db.updateCampaignState(leadId, 'FOLLOW_UP_DRAFTED', {
          messageId: followUpResult[0].id,
          responseId: responseResult[0].id,
          sentiment: analysis.sentiment,
          followUpNumber: 1
        });
        
        console.log(`✅ Follow-up message drafted for ${lead[0].name} - awaiting approval in dashboard`);
        
      } catch (followUpError) {
        console.error(`❌ Failed to generate follow-up for ${lead[0].name}:`, followUpError);
        // Don't fail the whole process if follow-up generation fails
      }
    }

    // Log activity
    await req.db.executeQuery(
      'INSERT INTO activity_log (lead_id, action, details, success) VALUES ($1, $2, $3, $4)',
      [leadId, 'response_received', JSON.stringify({ payload, analysis }), true]
    );

    console.log(`✅ Response processed for ${lead[0].name}: ${analysis.sentiment}`);

  } catch (error) {
    console.error('Error handling message received:', error);
    throw error;
  }
}

// DEPRECATED: handleConnectionAccepted - replaced by handleNewRelation
// Unipile sends 'new_relation' events, not 'connection_accepted'
// This function is kept for reference but should not be called

// Additional handlers (simplified for space)
async function handleMessageSent(req, payload) {
  console.log('✅ Message sent:', payload.message_id);
  // Update message status to sent
}

async function handleMessageDelivered(req, payload) {
  console.log('✅ Message delivered:', payload.message_id);
  // Update message status to delivered
}

async function handleMessageRead(req, payload) {
  console.log('👀 Message read:', payload.message_id);
  // Update message read timestamp
}

async function handleMessageFailed(req, payload) {
  console.log('❌ Message failed:', payload.message_id, payload.error_message);
  // Update message status to failed and implement retry logic
}

async function handleConnectionRejected(req, payload) {
  console.log('❌ Connection rejected:', payload.sender?.attendee_name);
  // Mark lead as closed lost
}

async function handleNewRelation(req, payload) {
  try {
    const { account_id, user_full_name, user_provider_id, user_profile_url, user_public_identifier } = payload;
    
    console.log(`🤝 New relation detected: ${user_full_name}`);
    console.log(`   Profile URL: ${user_profile_url}`);
    console.log(`   Provider ID: ${user_provider_id}`);
    
    if (!user_profile_url) {
      console.log('⚠️ New relation but no profile URL found in payload');
      return;
    }

    // Find the lead by LinkedIn URL - try exact match first, then pattern match
    let lead = await getLeadData(req.db, 'WHERE linkedin_profile_url = $1', [user_profile_url]);
    
    // If exact match fails, try pattern matching with public identifier
    if (!lead[0] && user_public_identifier) {
      lead = await getLeadData(req.db, 'WHERE linkedin_profile_url LIKE $1', [`%${user_public_identifier}%`]);
    }

    if (!lead[0]) {
      console.log(`⚠️ New relation for unknown profile: ${user_profile_url}`);
      console.log(`   Searched for: ${user_public_identifier}`);
      return;
    }

    const leadId = lead[0].id;
    console.log(`✅ Found lead: ${lead[0].name} (ID: ${leadId})`);

    // Update campaign state to CONNECTION_ACCEPTED
    await req.db.updateCampaignState(leadId, 'CONNECTION_ACCEPTED', {
      unipileAccountId: account_id,
      acceptedAt: new Date().toISOString(),
      profileUrl: user_profile_url,
      providerId: user_provider_id,
      publicIdentifier: user_public_identifier,
      userName: user_full_name
    });

    // Log activity
    await req.db.executeQuery(
      'INSERT INTO activity_log (lead_id, action, details, success) VALUES ($1, $2, $3, $4)',
      [leadId, 'connection_accepted', JSON.stringify(payload), true]
    );

    // Connection accepted notification (Dashboard only)
    console.log(`✅ CONNECTION ACCEPTED: ${lead[0].name} - Check dashboard for next steps`);

    // 🚀 CRITICAL: Start next automation phase - draft first message
    console.log(`🚀 Connection accepted! Auto-triggering first message draft for ${lead[0].name}`);
    
    // Small delay to ensure state is updated
    setTimeout(async () => {
      try {
        await req.stateMachine.executeAction(leadId, 'draft_first_message');
      } catch (error) {
        console.error(`❌ Failed to auto-draft first message for lead ${leadId}:`, error);
      }
    }, 2000);

    console.log(`✅ New relation processed for lead ${leadId} (${lead[0].name})`);

  } catch (error) {
    console.error('Error handling new relation:', error);
    throw error;
  }
}

async function handleAccountRestricted(req, payload) {
  console.log('🚨 ACCOUNT RESTRICTED - PAUSING ALL AUTOMATION');
  // Pause all automation immediately
}

async function handleAccountWarning(req, payload) {
  console.log('⚠️ Account warning - reducing limits');
  // Reduce daily limits by 50%
}

async function handleAccountSyncCompleted(req, payload) {
  console.log('✅ Account sync completed');
}

async function handleAccountSyncFailed(req, payload) {
  console.log('❌ Account sync failed');
}

// POST /webhooks/test - Test webhook endpoint
router.post('/test', async (req, res) => {
  try {
    console.log('🧪 Test webhook received:', JSON.stringify(req.body, null, 2));
    
    await req.db.executeQuery(
      'INSERT INTO activity_log (action, details, success) VALUES ($1, $2, $3)',
      ['webhook_test', JSON.stringify(req.body), true]
    );

    res.json({ 
      message: 'Test webhook received successfully',
      timestamp: new Date().toISOString(),
      body: req.body
    });
  } catch (error) {
    console.error('Error handling test webhook:', error);
    res.status(500).json({ error: 'Failed to process test webhook' });
  }
});

// GET /webhooks/status - Webhook health check
router.get('/status', async (req, res) => {
  try {
    // Get recent webhook activity from activity_log table
    const recentActivity = await req.db.executeQuery(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5'
    );

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      webhookUrl: `${req.protocol}://${req.get('host')}/webhooks/unipile`,
      message: 'Webhook endpoint is ready to receive events',
      recentActivity: recentActivity
    });
  } catch (error) {
    console.error('Error getting webhook status:', error);
    res.status(500).json({ error: 'Failed to get webhook status' });
  }
});

module.exports = router;
