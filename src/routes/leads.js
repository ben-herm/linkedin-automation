const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const router = express.Router();

// Configure multer for CSV uploads
const upload = multer({ dest: 'uploads/' });

// GET /api/leads - Get all leads
router.get('/', async (req, res) => {
  try {
    const leads = await req.db.executeQuery('SELECT * FROM "Leads" ORDER BY "LeadId" DESC');
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/:id - Get specific lead
router.get('/:id', async (req, res) => {
  try {
    const lead = await req.db.executeQuery('SELECT * FROM "Leads" WHERE "LeadId" = $1', [req.params.id]);
    if (!lead[0]) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead[0]);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// POST /api/leads - Create new lead
router.post('/', async (req, res) => {
  try {
    const { name, company, linkedin_url, title, location } = req.body;
    
    if (!name || !linkedin_url) {
      return res.status(400).json({ error: 'Name and LinkedIn URL are required' });
    }

    const result = await req.db.executeQuery(
      'INSERT INTO "Leads" (full_name, current_company_name, linkedin_profile_url, headline) VALUES ($1, $2, $3, $4) RETURNING "LeadId"',
      [name, company, linkedin_url, title]
    );

    const newLead = await req.db.executeQuery('SELECT * FROM "Leads" WHERE "LeadId" = $1', [result[0].LeadId]);
    res.status(201).json(newLead[0]);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:id - Update lead
router.put('/:id', async (req, res) => {
  try {
    const { name, company, linkedin_url, title, location } = req.body;
    
    await req.db.executeQuery(
      'UPDATE "Leads" SET full_name = $1, current_company_name = $2, linkedin_profile_url = $3, headline = $4, location = $5 WHERE "LeadId" = $6',
      [name, company, linkedin_url, title, location, req.params.id]
    );

    const updatedLead = await req.db.executeQuery('SELECT * FROM "Leads" WHERE "LeadId" = $1', [req.params.id]);
    if (!updatedLead[0]) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(updatedLead[0]);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - Delete lead
router.delete('/:id', async (req, res) => {
  try {
    const result = await req.db.executeQuery('DELETE FROM "Leads" WHERE "LeadId" = $1', [req.params.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// POST /api/leads/import - Import leads from CSV
router.post('/import', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded' });
  }

  const results = {
    imported: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  try {
    const leads = [];
    
    // Parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
          // Validate required fields
          if (!data.name || !data.linkedin_url) {
            results.errors++;
            results.details.push(`Row skipped: Missing name or linkedin_url`);
            return;
          }
          
          leads.push({
            name: data.name.trim(),
            company: data.company?.trim() || null,
            linkedin_url: data.linkedin_url.trim(),
            title: data.title?.trim() || null,
            industry: data.industry?.trim() || null,
            location: data.location?.trim() || null,
            employee_count: data.employee_count?.trim() || null,
            revenue_range: data.revenue_range?.trim() || null
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Import leads to database
    for (const lead of leads) {
      try {
        // Check if lead already exists
        const existing = await req.db.executeQuery(
          'SELECT "LeadId" FROM "Leads" WHERE linkedin_profile_url = $1',
          [lead.linkedin_url]
        );

        if (existing.length > 0) {
          results.skipped++;
          results.details.push(`Skipped: ${lead.name} (already exists)`);
          continue;
        }

        // Insert new lead
        const result = await req.db.executeQuery(
          'INSERT INTO "Leads" (full_name, current_company_name, linkedin_profile_url, headline, location) VALUES ($1, $2, $3, $4, $5) RETURNING "LeadId"',
          [lead.name, lead.company, lead.linkedin_url, lead.title, lead.location]
        );

        // Initialize campaign state
        await req.db.updateCampaignState(result[0].LeadId, 'NEW_LEAD', {
          source: 'csv_import',
          importedAt: new Date().toISOString()
        });

        results.imported++;
        results.details.push(`Imported: ${lead.name} from ${lead.company}`);
        
      } catch (error) {
        results.errors++;
        results.details.push(`Error importing ${lead.name}: ${error.message}`);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'CSV import completed',
      summary: {
        imported: results.imported,
        skipped: results.skipped,
        errors: results.errors
      },
      details: results.details
    });

  } catch (error) {
    console.error('Error importing CSV:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to import CSV file' });
  }
});

// POST /api/leads/start-batch - Start processing batch of leads
router.post('/start-batch', async (req, res) => {
  try {
    const { batchSize = 25 } = req.body;
    
    // Initialize state machine
    const { LinkedInMessagingStateMachine } = require('../langgraph/states');
    const stateMachine = new LinkedInMessagingStateMachine(
      req.db,
      req.unipile,
      req.ai,
      req.whatsapp
    );
    
    // Process batch
    const result = await stateMachine.executeAction(null, 'process_batch');
    
    res.json({
      message: 'Batch processing started',
      result: result,
      batchSize: batchSize
    });
    
  } catch (error) {
    console.error('Error starting batch:', error);
    res.status(500).json({ error: 'Failed to start batch processing' });
  }
});

// POST /api/leads/run-daily-automation - Manual trigger for daily automation
router.post('/run-daily-automation', async (req, res) => {
  try {
    // Access the scheduler from the server instance
    if (req.app.locals.scheduler) {
      await req.app.locals.scheduler.runNow();
      res.json({ message: 'Daily automation triggered successfully' });
    } else {
      res.status(503).json({ error: 'Scheduler not available' });
    }
  } catch (error) {
    console.error('Error running daily automation:', error);
    res.status(500).json({ error: 'Failed to run daily automation' });
  }
});

module.exports = router;
