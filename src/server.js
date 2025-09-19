require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import our services
const DatabaseManager = require('./database/real-postgres-schema');
const UnipileService = require('./services/unipile');
const OpenAIService = require('./services/openai');
const WhatsAppService = require('./services/whatsapp');

// Import routes
const leadsRoutes = require('./routes/leads');
const messagesRoutes = require('./routes/messages');
const webhooksRoutes = require('./routes/webhooks');
const dashboardRoutes = require('./routes/dashboard');

// Import schedulers with comprehensive logging
const DailyAutomationScheduler = require('./scheduler/daily-automation-enhanced');
const LeadInitializationScheduler = require('./scheduler/lead-initialization-enhanced');

class LinkedInAutomationServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.db = null;
    this.unipile = null;
    this.ai = null;
    this.whatsapp = null;
    this.scheduler = null;
    this.leadInitializer = null;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing LinkedIn Automation System...');

      // Initialize database
      this.db = new DatabaseManager();
      await this.db.connect();
      await this.db.initializeTables();
      
      // Initialize some leads with NEW_LEAD status for testing
      await this.db.initializeNewLeads(10);
      console.log('✅ Database initialized with real lead data');

      // Initialize services
      this.unipile = new UnipileService(process.env.UNIPILE_API_TOKEN);
      console.log('✅ Unipile service initialized');

      // Initialize OpenAI GPT-5 service
      console.log('🤖 Using OpenAI GPT-5 service for human-like message generation');
      this.ai = new OpenAIService();
      console.log('✅ AI service initialized (OpenAI GPT-5 - Human-like personalization mode)');

      // Initialize WhatsApp service only if credentials are provided
      if (process.env.TWILIO_ACCOUNT_SID && 
          process.env.TWILIO_AUTH_TOKEN && 
          process.env.TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid') {
        
        const whatsappNumbers = [
          process.env.MAIN_WHATSAPP_NUMBER,
          process.env.SECONDARY_WHATSAPP_NUMBER
        ].filter(Boolean);

        this.whatsapp = new WhatsAppService(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN,
          process.env.TWILIO_WHATSAPP_NUMBER,
          whatsappNumbers
        );
        console.log('✅ WhatsApp service initialized');
      } else {
        // WhatsApp not configured - will skip notifications
        this.whatsapp = null;
        console.log('⚠️ WhatsApp service not configured - notifications disabled');
      }

      // Test connections
      await this.testConnections();

      // Setup Express app
      this.setupMiddleware();
      this.setupRoutes();

      // 🔗 WEBHOOKS (manually configured by user)
      console.log('🔗 Using manually configured webhooks');

      // 🔄 START LEAD INITIALIZATION SCHEDULER (runs first)
      this.leadInitializer = new LeadInitializationScheduler(this.db);
      this.leadInitializer.start();

      // 🕐 START DAILY AUTOMATION SCHEDULER
      this.scheduler = new DailyAutomationScheduler(this.db, this.unipile, this.ai);
      this.scheduler.start();

      // Make schedulers and services available to routes
      this.app.locals.scheduler = this.scheduler;
      this.app.locals.leadInitializer = this.leadInitializer;
      this.app.locals.unipile = this.unipile;
      this.app.locals.ai = this.ai;
      this.app.locals.whatsapp = this.whatsapp;

      console.log('✅ Server initialization complete');
    } catch (error) {
      console.error('❌ Failed to initialize server:', error);
      throw error;
    }
  }

  async testConnections() {
    console.log('🔍 Testing service connections...');

    // Test Unipile
    const unipileTest = await this.unipile.testConnection();
    if (unipileTest.success) {
      console.log('✅ Unipile connection successful');
    } else {
      console.log('⚠️ Unipile connection failed:', unipileTest.error);
    }

    // Test AI
    const aiTest = await this.ai.testConnection();
    if (aiTest.success) {
      console.log('✅ AI service connection successful');
    } else {
      console.log('⚠️ AI service connection failed:', aiTest.error);
    }

    // Test WhatsApp (only if configured)
    if (this.whatsapp) {
      const whatsappTest = await this.whatsapp.testConnection();
      if (whatsappTest.success) {
        console.log('✅ WhatsApp connection successful');
      } else {
        console.log('⚠️ WhatsApp connection failed:', whatsappTest.error);
      }
    } else {
      console.log('⚠️ WhatsApp not configured - skipping test');
    }
  }

  setupMiddleware() {
    // Security and CORS with relaxed CSP for development
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
          fontSrc: ["'self'", "https:", "data:"],
          imgSrc: ["'self'", "data:"],
        },
      },
    }));
    this.app.use(cors());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Static files for dashboard
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Make services available to routes
    this.app.use((req, res, next) => {
      req.db = this.db;
      req.unipile = this.unipile;
      req.ai = this.ai;
      req.whatsapp = this.whatsapp;
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/leads', leadsRoutes);
    this.app.use('/api/messages', messagesRoutes);
    this.app.use('/webhooks', webhooksRoutes);
    this.app.use('/dashboard', dashboardRoutes);

    // Main dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: !!this.db,
          unipile: !!this.unipile,
          ai: !!this.ai,
          whatsapp: !!this.whatsapp
        }
      });
    });

    // Test Unipile connection endpoint
    this.app.get('/api/test/unipile', async (req, res) => {
      try {
        const testResult = await this.unipile.testConnection();
        res.json(testResult);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Error handling
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });
  }

  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(this.port, () => {
        console.log(`🌟 LinkedIn Automation Server running on port ${this.port}`);
        console.log(`📊 Dashboard: http://localhost:${this.port}`);
        console.log(`🔗 Health Check: http://localhost:${this.port}/health`);
        console.log('');
        console.log('🚀 System is ready for LinkedIn automation!');
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('🛑 Stopping server...');
    
    if (this.server) {
      this.server.close();
    }
    
    if (this.db) {
      await this.db.close();
    }
    
    console.log('✅ Server stopped');
  }

  async setupWebhooksAutomatically() {
    try {
      console.log('🔄 Setting up webhooks for continuous automation...');
      
      const AutoWebhookSetup = require('../scripts/auto-setup-webhooks');
      const autoSetup = new AutoWebhookSetup();
      
      // Only setup if environment is ready
      if (autoSetup.isWebhookEnvironmentReady()) {
        const success = await autoSetup.autoSetup();
        if (success) {
          console.log('✅ Webhooks configured - automation will run automatically');
        } else {
          console.log('⚠️ Webhooks not configured - manual intervention may be required');
        }
      } else {
        console.log('⚠️ Webhook environment not ready - skipping auto-setup');
        console.log('   Add UNIPILE_DSN to .env and run: node scripts/setup-webhooks.js');
      }
      
    } catch (error) {
      console.log('⚠️ Auto webhook setup failed:', error.message);
      console.log('   Manual setup: node scripts/setup-webhooks.js');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.server) {
    await global.server.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');
  if (global.server) {
    await global.server.stop();
  }
  process.exit(0);
});

// Start the server
if (require.main === module) {
  const server = new LinkedInAutomationServer();
  global.server = server;
  server.start().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = LinkedInAutomationServer;
