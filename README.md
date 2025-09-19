# 🚀 LinkedIn Automation System

**Complete LinkedIn outreach automation with AI message generation, human approval workflow, and real-time dashboard monitoring.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://postgresql.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-purple.svg)](https://openai.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ✨ What This System Actually Does

This is a **LinkedIn automation system** that:

1. **Imports leads** from CSV files into an existing PostgreSQL database
2. **Automatically initializes** leads with `NEW_LEAD` status
3. **Sends connection requests** daily (respecting LinkedIn limits)
4. **Generates AI messages** when connections are accepted
5. **Requires human approval** before sending any messages
6. **Processes webhook events** in real-time from LinkedIn
7. **Provides a dashboard** to monitor and manage the entire pipeline

## 🎯 Perfect For

- **Sales Teams**: B2B outreach and lead generation
- **Agencies**: Client lead generation services  
- **Entrepreneurs**: Scaling LinkedIn networking
- **Business Owners**: Automated prospect outreach

---

## 🚀 Complete Setup Guide

### Prerequisites

- Node.js 18+ 
- PostgreSQL database (Supabase recommended)
- Unipile API account
- OpenAI API key

### Step 1: Clone & Install

```bash
git clone https://github.com/your-username/linkedin-automation.git
cd linkedin-automation
npm install
```

### Step 2: Environment Configuration

Create `.env` file with these **REQUIRED** variables:

```env
# Database (REQUIRED)
DATABASE_URL=postgresql://username:password@host:port/database

# Unipile API (REQUIRED for LinkedIn integration)
UNIPILE_API_TOKEN=your_unipile_api_token
UNIPILE_DSN=your_unipile_dsn
UNIPILE_LINKEDIN_ACCOUNT_ID=your_linkedin_account_id

# OpenAI API (REQUIRED for AI message generation)
OPENAI_API_KEY=your_openai_api_key

# Daily Limits (OPTIONAL - defaults shown)
MAX_CONNECTION_REQUESTS_PER_DAY=1
MAX_MESSAGES_PER_DAY=1
MAX_PROFILE_VIEWS_PER_DAY=75

# Message Timing (OPTIONAL - defaults shown)
MESSAGE_DELAY_MIN_MINUTES=30
MESSAGE_DELAY_MAX_MINUTES=120
FOLLOW_UP_DELAY_DAYS=3

# WhatsApp Notifications (OPTIONAL)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
MAIN_WHATSAPP_NUMBER=+1234567890
SECONDARY_WHATSAPP_NUMBER=+1234567891

# Business Info (OPTIONAL)
CALENDLY_LINK=https://calendly.com/your-link

# Server (OPTIONAL)
PORT=3000
NODE_ENV=development
```

### Step 3: Database Setup

```bash
npm run setup-db
```

**What this does:**
- Connects to your PostgreSQL database
- Creates automation tables (`campaign_states`, `messages`, `responses`, `activity_log`, `daily_limits`)
- **Does NOT create the `"Leads"` table** (uses your existing one)

### Step 4: Webhook Setup (Optional)

```bash
npm run setup-webhooks
```

**What this does:**
- Sets up webhooks with Unipile for real-time LinkedIn events
- Requires ngrok for local development
- **Can be skipped** - system works without webhooks (manual processing)

### Step 5: Start the System

```bash
npm start
```

**What happens:**
- Server starts on http://localhost:3000
- Database connects and initializes
- Schedulers start (8 AM lead init, 9 AM automation)
- Dashboard becomes available

### Step 6: Access Dashboard

Open http://localhost:3000 in your browser

---

## 📊 The Complete System Flow

### 🔄 **Automation Pipeline**

```mermaid
graph TD
    A[CSV Import] --> B[NEW_LEAD]
    B --> C[Daily Scheduler 9 AM]
    C --> D[CONNECTION_REQUEST_SENT]
    D --> E[Webhook: Connection Accepted]
    E --> F[CONNECTION_ACCEPTED]
    F --> G[AI Generates Message]
    G --> H[FIRST_MESSAGE_DRAFTED]
    H --> I[Human Approval Required]
    I --> J{Approved?}
    J -->|Yes| K[FIRST_MESSAGE_SENT]
    J -->|No| L[Workflow Paused]
    K --> M[Webhook: Response Received]
    M --> N[RESPONSE_RECEIVED]
    N --> O[AI Analyzes Response]
    O --> P{Response Type}
    P -->|Interested| Q[HOT_LEAD]
    P -->|Neutral| R[FOLLOW_UP_DRAFTED]
    P -->|Negative| S[CLOSED_LOST]
    R --> I
```

### 🕐 **Daily Automation Schedule**

- **8:00 AM (Asia/Jerusalem)**: Lead Initialization
  - Finds leads without campaign states
  - Sets them to `NEW_LEAD` status
  - Runs automatically via cron job

- **9:00 AM (Asia/Jerusalem)**: Daily Automation
  - Gets leads in `NEW_LEAD` status
  - Sends connection requests (respects daily limits)
  - Updates states to `CONNECTION_REQUEST_SENT`
  - Runs automatically via cron job

- **24/7**: Webhook Processing
  - Handles LinkedIn events in real-time
  - Processes connection acceptances
  - Processes message responses
  - Updates lead states automatically

---

## 🎮 Complete Usage Guide

### 1. Import Leads

**CSV Format Required:**
```csv
name,company,linkedin_url,title,industry
John Smith,TechCorp Inc,https://linkedin.com/in/johnsmith,CEO,Technology
Sarah Johnson,RestaurantCo,https://linkedin.com/in/sarahjohnson,Owner,Food & Restaurant
```

**Import Methods:**

**Method A: API Only (Current)**
```bash
curl -X POST http://localhost:3000/api/leads/import \
  -F "csvFile=@leads.csv"
```

**Method B: Direct Database (Alternative)**
- Import directly into your `"Leads"` table
- System will detect and initialize them automatically

**What Happens During Import:**
1. Parses CSV file
2. Validates required fields (`name`, `linkedin_url`)
3. Checks for duplicates (by LinkedIn URL)
4. Inserts into `"Leads"` table
5. **Automatically sets `NEW_LEAD` status** via `updateCampaignState()`
6. Returns import results

### 2. Monitor Automation

**The system automatically:**
- **8 AM**: Initializes new leads with `NEW_LEAD` status
- **9 AM**: Sends connection requests (respects daily limits)
- **24/7**: Processes webhook events in real-time
- **On Connection Accept**: Generates AI messages for approval
- **On Response**: Analyzes sentiment and updates states

### 3. Approve Messages

**Dashboard Workflow:**
1. Go to http://localhost:3000
2. Look for "Messages Drafted" section (if any pending)
3. Review AI-generated messages
4. **Approve**: Message gets sent automatically
5. **Reject**: Lead workflow pauses
6. **Edit**: Modify content before approving
7. **Bulk Actions**: Approve/reject all messages at once

### 4. Handle Responses

**When prospects reply:**
1. Webhook processes the response instantly
2. AI analyzes the response sentiment
3. Dashboard shows "Unread Replies" card
4. You can view and respond to replies
5. System marks responses as `HOT_LEAD` if interested

---

## 📱 Complete Dashboard Features

### **Pipeline Overview Cards**
- **🆕 New Leads**: Leads ready for processing
- **🤝 Requests Sent**: Connection requests awaiting acceptance
- **✅ Connected**: Accepted connections ready for messaging
- **✍️ Drafted**: Messages awaiting approval
- **💬 Replies**: Unread prospect responses
- **🔥 Hot Leads**: Interested prospects needing attention
- **❌ Closed Lost**: Not interested prospects
- **📈 Today's Progress**: Connection requests sent today
- **📊 Total Active**: Leads in automation pipeline
- **⚠️ Not Started**: Leads needing initialization

### **Interactive Features**
- **Click any card** to view detailed list of leads
- **Modal popups** show lead details and LinkedIn profiles
- **Copy LinkedIn URLs** to clipboard
- **View lead states** and timestamps
- **Auto-refresh** every 30 seconds

### **Message Management**
- **Pending Approvals**: Review AI-generated messages
- **Approve/Reject**: Individual message actions
- **Edit Messages**: Modify content before sending
- **Bulk Actions**: Approve/reject all messages
- **Message History**: View all sent messages

### **Real-time Updates**
- **Live Statistics**: Updated automatically
- **Webhook Processing**: Real-time event handling
- **State Changes**: Immediate status updates
- **Activity Logging**: Comprehensive audit trail

---

## 🔧 Complete API Reference

### **Dashboard Endpoints**
- `GET /dashboard/stats` - System statistics and metrics
- `GET /dashboard/leads-by-state/:state` - Leads by automation state
- `GET /dashboard/unread-replies` - Unread prospect responses
- `GET /dashboard/sent-requests-today` - Connection requests sent today
- `GET /dashboard/debug-info` - Debug information
- `GET /dashboard/analytics` - Detailed analytics
- `GET /dashboard/activity` - Activity feed
- `POST /dashboard/initialize-leads` - Manually initialize leads
- `POST /dashboard/reset-daily-limits` - Reset today's limits

### **Leads Endpoints**
- `GET /api/leads` - List all leads
- `GET /api/leads/:id` - Get specific lead
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `POST /api/leads/import` - Import leads from CSV
- `POST /api/leads/start-batch` - Start batch processing
- `POST /api/leads/run-daily-automation` - Trigger daily automation

### **Messages Endpoints**
- `GET /api/messages` - List messages with pagination
- `GET /api/messages/pending-approval` - Messages awaiting approval
- `GET /api/messages/:id` - Get specific message
- `POST /api/messages/:id/approve` - Approve/reject message
- `POST /api/messages/bulk-approve` - Bulk approve messages
- `POST /api/messages/generate` - Generate new AI message
- `POST /api/messages/:id/regenerate` - Regenerate message content
- `PUT /api/messages/:id` - Update message content
- `DELETE /api/messages/:id` - Delete message

### **Webhook Endpoints**
- `POST /webhooks/unipile` - Main webhook endpoint (handles all events)
- `POST /webhooks/test` - Test webhook endpoint
- `GET /webhooks/status` - Webhook health check

### **System Endpoints**
- `GET /health` - System health check
- `GET /api/test/unipile` - Test Unipile connection

---

## 🛡️ Safety Features

### **Rate Limiting**
- **Default**: 1 connection request/day, 1 message/day (very conservative)
- **Configurable**: Adjust in `.env` file
- **Automatic**: System respects LinkedIn's limits
- **Daily Tracking**: Monitors usage in `daily_limits` table

### **Human Oversight**
- **All messages require approval** before sending
- **Dashboard interface** for easy message review
- **Bulk approval** capabilities for efficiency
- **Edit functionality** for message customization

### **Error Handling**
- **Comprehensive logging** of all actions
- **Automatic retry** mechanisms for failed operations
- **Account health monitoring** and protection
- **Activity log** tracks all system events

### **Webhook Security**
- **Authentication bypassed** for development (can be enabled)
- **Event validation** and processing
- **Duplicate prevention** based on message IDs
- **Error recovery** and logging

---

## 📊 Complete Database Schema

### **`"Leads"`** (existing table - not created by system)
- `LeadId` (Primary Key)
- `full_name`
- `linkedin_profile_url`
- `headline`
- `current_company_name`
- `positions` (JSONB - array of position objects)
- `status` (e.g., 'initial data')
- `summary`
- `skills`

### **`campaign_states`** (automation tracking)
- `id` (Primary Key)
- `lead_id` (references "Leads"."LeadId")
- `current_state` (NEW_LEAD, CONNECTION_REQUEST_SENT, etc.)
- `previous_state`
- `state_data` (JSONB - additional state information)
- `created_at`
- `updated_at`

### **`messages`** (generated messages)
- `id` (Primary Key)
- `lead_id` (references "Leads"."LeadId")
- `type` (connection_request, follow_up, etc.)
- `content` (message text)
- `ai_generated` (boolean)
- `status` (draft, approved, sent, rejected)
- `human_approved` (boolean)
- `sent_at` (timestamp when sent)
- `unipile_message_id` (Unipile's message ID)
- `created_at`
- `updated_at`

### **`responses`** (prospect replies)
- `id` (Primary Key)
- `lead_id` (references "Leads"."LeadId")
- `content` (response text)
- `sentiment` (INTERESTED, NEUTRAL, NEGATIVE)
- `unipile_message_id` (Unipile's message ID)
- `status` (UNREAD, REPLIED, IGNORED)
- `processed` (boolean)
- `received_at` (timestamp when received)
- `created_at`

### **`activity_log`** (audit trail)
- `id` (Primary Key)
- `lead_id` (references "Leads"."LeadId")
- `action` (action performed)
- `details` (JSONB - additional details)
- `success` (boolean)
- `error_message` (if failed)
- `created_at`

### **`daily_limits`** (usage tracking)
- `id` (Primary Key)
- `date` (date)
- `connection_requests_sent` (count)
- `messages_sent` (count)
- `profile_views` (count)
- `created_at`

---

## 🔄 Complete State Machine

### **State Progression**
1. `NEW_LEAD` → `CONNECTION_REQUEST_SENT` → `CONNECTION_ACCEPTED`
2. `CONNECTION_ACCEPTED` → `FIRST_MESSAGE_DRAFTED` → `FIRST_MESSAGE_SENT`
3. `FIRST_MESSAGE_SENT` → `RESPONSE_RECEIVED` → `FOLLOW_UP_DRAFTED`
4. `FOLLOW_UP_DRAFTED` → `FOLLOW_UP_SENT` → `HOT_LEAD`/`CLOSED_LOST`

### **State Descriptions**
- **`NEW_LEAD`**: Lead imported and ready for connection request
- **`CONNECTION_REQUEST_SENT`**: Connection request sent, awaiting acceptance
- **`CONNECTION_ACCEPTED`**: Connection accepted, ready for first message
- **`FIRST_MESSAGE_DRAFTED`**: AI generated first message, awaiting approval
- **`FIRST_MESSAGE_SENT`**: First message sent, awaiting response
- **`RESPONSE_RECEIVED`**: Prospect replied, response being analyzed
- **`FOLLOW_UP_DRAFTED`**: AI generated follow-up, awaiting approval
- **`FOLLOW_UP_SENT`**: Follow-up sent, awaiting response
- **`HOT_LEAD`**: Prospect shows interest, needs immediate attention
- **`CLOSED_LOST`**: Prospect not interested, campaign ended

---

## 📱 Complete Webhook Events

### **Supported Events**
- **`message_received`**: Prospect replies to your messages
- **`new_relation`**: Connection requests accepted  
- **`message_sent`**: Confirmation of sent messages
- **`message_reaction`**: Message reactions (likes, etc.)
- **`message_read`**: Message read receipts
- **`message_edited`**: Message edits
- **`message_deleted`**: Message deletions

### **Webhook Processing**
- **Real-time processing** of LinkedIn events
- **Sender detection** to ignore messages sent by your account
- **Lead matching** by LinkedIn profile URL
- **Duplicate prevention** based on Unipile message IDs
- **State updates** based on event type
- **Error handling** and logging

---

## ⚙️ Complete Configuration

### **Environment Variables**
```env
# Database (REQUIRED)
DATABASE_URL=postgresql://username:password@host:port/database

# Unipile API (REQUIRED)
UNIPILE_API_TOKEN=your_unipile_api_token
UNIPILE_DSN=your_unipile_dsn
UNIPILE_LINKEDIN_ACCOUNT_ID=your_linkedin_account_id

# OpenAI API (REQUIRED)
OPENAI_API_KEY=your_openai_api_key

# Daily Limits (OPTIONAL)
MAX_CONNECTION_REQUESTS_PER_DAY=1
MAX_MESSAGES_PER_DAY=1
MAX_PROFILE_VIEWS_PER_DAY=75

# Message Timing (OPTIONAL)
MESSAGE_DELAY_MIN_MINUTES=30
MESSAGE_DELAY_MAX_MINUTES=120
FOLLOW_UP_DELAY_DAYS=3

# WhatsApp (OPTIONAL)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
MAIN_WHATSAPP_NUMBER=+1234567890
SECONDARY_WHATSAPP_NUMBER=+1234567891

# Business Info (OPTIONAL)
CALENDLY_LINK=https://calendly.com/your-link

# Server (OPTIONAL)
PORT=3000
NODE_ENV=development
```

### **Automation Schedule**
- **Lead Initialization**: Daily at 8 AM (Asia/Jerusalem timezone)
- **Daily Automation**: Daily at 9 AM (Asia/Jerusalem timezone)
- **Webhook Processing**: Real-time (24/7)

### **Available Scripts**
```bash
npm start              # Start the server
npm run dev            # Start with nodemon (development)
npm test               # Run system tests
npm run setup-db       # Setup database tables
npm run setup-webhooks # Setup webhooks with Unipile
npm run setup          # Run both setup-db and setup-webhooks
npm run test-linkedin  # Test LinkedIn connection
npm run test-automation # Test complete automation flow
```

---

## 🆘 Complete Troubleshooting

### **Common Issues**

**"Database connection failed"**
```bash
# Check your DATABASE_URL in .env
# Ensure PostgreSQL is running
# Verify connection credentials
npm run setup-db
```

**"Unipile API failed"**
- Verify UNIPILE_API_TOKEN is correct
- Check UNIPILE_DSN configuration  
- Ensure LinkedIn account is connected in Unipile dashboard
- Verify UNIPILE_LINKEDIN_ACCOUNT_ID is set

**"OpenAI API failed"**
- Verify OPENAI_API_KEY is valid
- Check API key has sufficient credits
- Ensure billing is set up

**"No messages being sent"**
- Check daily limits in dashboard (`/dashboard/stats`)
- Verify messages are approved (`/api/messages/pending-approval`)
- Check system status and logs
- Ensure leads are initialized (`/dashboard/initialize-leads`)

**"Webhook not receiving events"**
- Verify webhook URL is configured in Unipile dashboard
- Check webhook authentication (currently bypassed for development)
- Ensure server is accessible from internet (use ngrok for local testing)

**"CSV import not working"**
- Use API endpoint: `POST /api/leads/import`
- Ensure CSV has required columns: `name`, `linkedin_url`
- Check file format and encoding

### **Debug Commands**
```bash
# Enable detailed logging
DEBUG=* npm start

# Test system components
npm test

# Check webhook status
curl http://localhost:3000/webhooks/status

# Check system health
curl http://localhost:3000/health

# Test Unipile connection
curl http://localhost:3000/api/test/unipile
```

### **Manual Operations**
```bash
# Initialize leads manually
curl -X POST http://localhost:3000/dashboard/initialize-leads

# Run daily automation manually
curl -X POST http://localhost:3000/api/leads/run-daily-automation

# Reset daily limits
curl -X POST http://localhost:3000/dashboard/reset-daily-limits

# Import leads via API
curl -X POST http://localhost:3000/api/leads/import -F "csvFile=@leads.csv"
```

---

## 📈 Expected Results

### **Conservative Approach (Week 1)**
- **Leads Processed**: 100
- **Connection Requests**: 1/day
- **Acceptance Rate**: ~20% = 7 connections
- **Response Rate**: ~10% = 1 conversation

### **Full Scale (Month 1)**
- **Leads Processed**: 500+
- **Connection Requests**: 1/day = 30+ requests
- **Accepted Connections**: ~6
- **Qualified Conversations**: ~1-2
- **Hot Leads**: 1-2 per month

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- **Documentation**: Check this README and code comments
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions

---

## ⚠️ Disclaimer

This tool is for educational and legitimate business purposes only. Users are responsible for complying with LinkedIn's Terms of Service and applicable laws. The authors are not responsible for any misuse of this software.

---

**Built with ❤️ for legitimate business growth and networking.**