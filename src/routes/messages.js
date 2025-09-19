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
      req.ai,
      req.whatsapp
    );
  }
  req.stateMachine = stateMachine;
  next();
});

// GET /api/messages - List all messages with pagination
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, leadId } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT m.*, 
             l.full_name as name, 
             COALESCE(l.positions->0->>'company', 'Unknown Company') as company, 
             l.linkedin_profile_url as linkedin_url
      FROM messages m
      JOIN "Leads" l ON m.lead_id = l."LeadId"
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND m.status = $${params.length + 1}`;
      params.push(status);
    }

    if (type) {
      query += ` AND m.type = $${params.length + 1}`;
      params.push(type);
    }

    if (leadId) {
      query += ` AND m.lead_id = $${params.length + 1}`;
      params.push(leadId);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const messages = await req.db.executeQuery(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM messages m WHERE 1=1';
    const countParams = [];

    if (status) {
      countQuery += ` AND m.status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    if (type) {
      countQuery += ` AND m.type = $${countParams.length + 1}`;
      countParams.push(type);
    }

    if (leadId) {
      countQuery += ` AND m.lead_id = $${countParams.length + 1}`;
      countParams.push(leadId);
    }

    const countResult = await req.db.executeQuery(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET /api/messages/pending-approval - Get messages awaiting human approval
router.get('/pending-approval', async (req, res) => {
  try {
    const query = `
      SELECT m.id, m.lead_id, m.type, m.content, m.status, m.human_approved, m.created_at,
             l.full_name as name, 
             COALESCE(l.positions->0->>'company', l.current_company_name, 'Unknown Company') as company, 
             l.headline as title,
             'Business' as industry,
             l.linkedin_profile_url as linkedin_url,
             r.content as latest_reply,
             r.received_at as reply_time
      FROM messages m
      JOIN "Leads" l ON m.lead_id = l."LeadId"
      LEFT JOIN (
        SELECT 
          lead_id,
          content,
          received_at,
          ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY received_at DESC) as rn
        FROM responses
      ) r ON l."LeadId" = r.lead_id AND r.rn = 1
      WHERE m.status = 'draft' AND m.human_approved = false
      ORDER BY m.created_at ASC
    `;

    const messages = await req.db.executeQuery(query);

    res.json({ messages });
  } catch (error) {
    console.error('Error fetching pending messages:', error);
    res.status(500).json({ error: 'Failed to fetch pending messages' });
  }
});

// GET /api/messages/:id - Get specific message
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT m.*, 
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
             l.linkedin_profile_url as linkedin_url
      FROM messages m
      JOIN "Leads" l ON m.lead_id = l."LeadId"
      WHERE m.id = $1
    `;

    const message = await req.db.executeQuery(query, [id]);

    if (!message[0]) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: message[0] });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

// POST /api/messages/:id/approve - Approve a message
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, editedContent } = req.body;

    // Get the message
    const messageQuery = 'SELECT * FROM messages WHERE id = $1';
    const message = await req.db.executeQuery(messageQuery, [id]);

    if (!message[0]) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message[0].status !== 'draft') {
      return res.status(400).json({ error: 'Message is not in draft status' });
    }

    let updateQuery;
    let params;

    if (approved) {
      // Update content if edited
      const finalContent = editedContent || message[0].content;
      
      updateQuery = `
        UPDATE messages 
        SET human_approved = 1, status = 'approved', content = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
      params = [finalContent, id];

      // Mark the latest response for this lead as replied
      const latestResponse = await req.db.executeQuery(
        'SELECT id FROM responses WHERE lead_id = $1 ORDER BY received_at DESC LIMIT 1',
        [message[0].lead_id]
      );
      
      if (latestResponse.length > 0) {
        await req.db.executeQuery(
          'UPDATE responses SET status = $1, processed = TRUE WHERE id = $2',
          ['REPLIED', latestResponse[0].id]
        );
        console.log(`✅ Marked latest response ${latestResponse[0].id} as REPLIED`);
      }

      // Continue the workflow
      await req.stateMachine.continueAfterApproval(message[0].lead_id, true);
    } else {
      updateQuery = `
        UPDATE messages 
        SET human_approved = 0, status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      params = [id];

      // Mark the latest response for this lead as ignored
      const latestResponse = await req.db.executeQuery(
        'SELECT id FROM responses WHERE lead_id = $1 ORDER BY received_at DESC LIMIT 1',
        [message[0].lead_id]
      );
      
      if (latestResponse.length > 0) {
        await req.db.executeQuery(
          'UPDATE responses SET status = $1, processed = TRUE WHERE id = $2',
          ['IGNORED', latestResponse[0].id]
        );
        console.log(`✅ Marked latest response ${latestResponse[0].id} as IGNORED`);
      }

      // Pause the workflow
      await req.stateMachine.continueAfterApproval(message[0].lead_id, false);
    }

    await req.db.executeQuery(updateQuery, params);

    res.json({ 
      message: approved ? 'Message approved and sent' : 'Message rejected',
      approved 
    });
  } catch (error) {
    console.error('Error approving message:', error);
    res.status(500).json({ error: 'Failed to approve message' });
  }
});

// POST /api/messages/:id/bulk-approve - Bulk approve messages
router.post('/bulk-approve', async (req, res) => {
  try {
    const { messageIds, approved } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds must be a non-empty array' });
    }

    const results = [];
    const errors = [];

    for (const messageId of messageIds) {
      try {
        // Get the message
        const messageQuery = 'SELECT * FROM messages WHERE id = $1';
        const message = await req.db.executeQuery(messageQuery, [messageId]);

        if (!message[0]) {
          errors.push({ messageId, error: 'Message not found' });
          continue;
        }

        if (message[0].status !== 'draft') {
          errors.push({ messageId, error: 'Message is not in draft status' });
          continue;
        }

        // Update the message
        if (approved) {
          await req.db.executeQuery(
            'UPDATE messages SET human_approved = 1, status = \'approved\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [messageId]
          );
          
          // Continue workflow
          await req.stateMachine.continueAfterApproval(message[0].lead_id, true);
        } else {
          await req.db.executeQuery(
            'UPDATE messages SET human_approved = 0, status = \'rejected\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [messageId]
          );
          
          // Pause workflow
          await req.stateMachine.continueAfterApproval(message[0].lead_id, false);
        }

        results.push({ messageId, success: true });
      } catch (error) {
        errors.push({ messageId, error: error.message });
      }
    }

    res.json({
      summary: {
        total: messageIds.length,
        successful: results.length,
        failed: errors.length
      },
      results,
      errors
    });
  } catch (error) {
    console.error('Error bulk approving messages:', error);
    res.status(500).json({ error: 'Failed to bulk approve messages' });
  }
});

// POST /api/messages/generate - Generate a new message using AI
router.post('/generate', async (req, res) => {
  try {
    const { leadId, messageType = 'connection_request' } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    // Get lead data
    const lead = await req.db.executeQuery(`
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
             positions, skills, summary
      FROM "Leads" WHERE "LeadId" = $1
    `, [leadId]);
    if (!lead[0]) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const leadData = lead[0];
    console.log(`🤖 Generating ${messageType} for ${leadData.name}`);

    let content;
    try {
      if (messageType === 'connection_request') {
        content = await req.ai.generateConnectionRequest(leadData);
      } else if (messageType === 'follow_up') {
        // Get message history for context
        const messageHistory = await req.db.executeQuery(
          'SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC',
          [leadId]
        );
        content = await req.ai.generateFollowUpMessage(leadData, messageHistory);
      } else {
        return res.status(400).json({ error: 'Invalid message type' });
      }
    } catch (aiError) {
      console.error('AI generation error:', aiError);
      return res.status(500).json({ error: 'Failed to generate message content' });
    }

    // Create draft message
    const result = await req.db.executeQuery(`
      INSERT INTO messages (lead_id, type, content, ai_generated, status)
      VALUES ($1, $2, $3, 1, 'draft')
    `, [leadId, messageType, content]);

    const newMessage = await req.db.executeQuery(
      'SELECT * FROM messages WHERE id = $1',
      [result.lastID]
    );

    res.status(201).json({
      success: true,
      message: 'Message generated successfully',
      data: newMessage[0]
    });

  } catch (error) {
    console.error('Error generating message:', error);
    res.status(500).json({ error: 'Failed to generate message' });
  }
});

// POST /api/messages/:id/regenerate - Regenerate a message using AI
router.post('/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the message and lead data
    const query = `
      SELECT m.*, l.*
      FROM messages m
      JOIN leads l ON m.lead_id = l.id
      WHERE m.id = $1
    `;

    const result = await req.db.executeQuery(query, [id]);

    if (!result[0]) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageData = result[0];

    if (messageData.status !== 'draft') {
      return res.status(400).json({ error: 'Can only regenerate draft messages' });
    }

    // Generate new message content
    let newContent;
    if (messageData.type === 'connection_request') {
      // Get profile analysis if available
      const stateQuery = 'SELECT state_data FROM campaign_states WHERE lead_id = $1 AND current_state = $2 ORDER BY created_at DESC LIMIT 1';
      const stateResult = await req.db.executeQuery(stateQuery, [messageData.lead_id, 'PROFILE_ANALYZED']);
      
      let profileAnalysis = '';
      if (stateResult[0]) {
        try {
          const stateData = JSON.parse(stateResult[0].state_data);
          profileAnalysis = stateData.profileAnalysis || '';
        } catch (e) {
          console.warn('Could not parse state data');
        }
      }

      newContent = await req.ai.generateConnectionRequest(messageData, profileAnalysis);
    } else {
      // Get message history for follow-ups
      const historyQuery = 'SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC';
      const messageHistory = await req.db.executeQuery(historyQuery, [messageData.lead_id]);
      
      const followUpNumber = messageHistory.filter(m => m.type === 'follow_up').length + 1;
      newContent = await req.ai.generateFollowUpMessage(messageData, messageHistory, followUpNumber);
    }

    // Update the message content
    await req.db.executeQuery(
      'UPDATE messages SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newContent, id]
    );

    res.json({ 
      message: 'Message regenerated successfully',
      newContent 
    });
  } catch (error) {
    console.error('Error regenerating message:', error);
    res.status(500).json({ error: 'Failed to regenerate message' });
  }
});

// PUT /api/messages/:id - Update message content
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if message exists and is editable
    const message = await req.db.executeQuery('SELECT * FROM messages WHERE id = $1', [id]);

    if (!message[0]) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message[0].status !== 'draft') {
      return res.status(400).json({ error: 'Can only edit draft messages' });
    }

    // Update the message
    await req.db.executeQuery(
      'UPDATE messages SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [content.trim(), id]
    );

    res.json({ message: 'Message updated successfully' });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// DELETE /api/messages/:id - Delete a message
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if message exists
    const message = await req.db.executeQuery('SELECT * FROM messages WHERE id = $1', [id]);

    if (!message[0]) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message[0].status === 'sent') {
      return res.status(400).json({ error: 'Cannot delete sent messages' });
    }

    // Delete the message
    const result = await req.db.executeQuery('DELETE FROM messages WHERE id = $1', [id]);

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

module.exports = router;

