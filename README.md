# 🚀 LinkedIn Automation System

**Complete end-to-end LinkedIn outreach automation with AI message generation, human approval workflow, and real-time dashboard monitoring.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://postgresql.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-purple.svg)](https://openai.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ✨ Features

- **🤖 AI-Powered Messages**: Personalized connection requests and follow-ups using OpenAI GPT-4o
- **👥 Smart Lead Management**: Import leads from CSV, track campaign states, manage automation flow
- **✅ Human Approval Workflow**: Review and approve all messages before sending
- **📊 Real-time Dashboard**: Monitor automation pipeline, approve messages, track responses
- **🔄 Automated State Machine**: Intelligent lead progression through campaign stages
- **📱 Webhook Integration**: Real-time processing of LinkedIn events and responses
- **🛡️ LinkedIn Compliant**: Respects rate limits and follows best practices
- **📈 Analytics & Reporting**: Track performance, conversion rates, and campaign metrics

## 🎯 Perfect For

- **Sales Teams**: B2B outreach and lead generation
- **Agencies**: Client lead generation services
- **Entrepreneurs**: Scaling LinkedIn networking
- **Business Owners**: Automated prospect outreach

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL database (Supabase recommended)
- Unipile API account
- OpenAI API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/linkedin-automation.git
cd linkedin-automation
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
```

4. **Configure your `.env` file**
```env
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Unipile API (LinkedIn Integration)
UNIPILE_API_TOKEN=your_unipile_api_token
UNIPILE_DSN=your_unipile_dsn
UNIPILE_LINKEDIN_ACCOUNT_ID=your_linkedin_account_id

# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# Daily Limits (adjust as needed)
MAX_CONNECTION_REQUESTS_PER_DAY=10
MAX_MESSAGES_PER_DAY=20
MAX_PROFILE_VIEWS_PER_DAY=75

# Message Timing
MESSAGE_DELAY_MIN_MINUTES=30
MESSAGE_DELAY_MAX_MINUTES=120
FOLLOW_UP_DELAY_DAYS=3
```

5. **Initialize the database**
```bash
npm run setup
```

6. **Start the system**
```bash
npm start
```

7. **Access the dashboard**
Open http://localhost:3000 in your browser

---

## 📊 System Architecture

### Automation Pipeline

```mermaid
graph TD
    A[Lead Import] --> B[NEW_LEAD]
    B --> C[Daily Automation]
    C --> D[CONNECTION_REQUEST_SENT]
    D --> E[Connection Accepted]
    E --> F[CONNECTION_ACCEPTED]
    F --> G[AI Message Generation]
    G --> H[FIRST_MESSAGE_DRAFTED]
    H --> I[Human Approval]
    I --> J[FIRST_MESSAGE_SENT]
    J --> K[Response Received]
    K --> L[AI Analysis]
    L --> M{Response Type}
    M -->|Interested| N[HOT_LEAD]
    M -->|Neutral| O[Follow-up Generated]
    M -->|Negative| P[CLOSED_LOST]
    O --> Q[FOLLOW_UP_DRAFTED]
    Q --> I
```

### Database Schema

- **`"Leads"`**: Main lead data and LinkedIn profiles (existing table)
  - `LeadId` (Primary Key), `full_name`, `linkedin_profile_url`, `headline`, `current_company_name`, `positions` (JSONB), `status`, `summary`, `skills`
- **`campaign_states`**: Tracks lead progression through automation
  - `id` (Primary Key), `lead_id`, `current_state`, `previous_state`, `state_data` (JSONB), `created_at`, `updated_at`
- **`messages`**: Generated and sent messages
  - `id` (Primary Key), `lead_id`, `type`, `content`, `ai_generated`, `status`, `human_approved`, `sent_at`, `unipile_message_id`, `created_at`, `updated_at`
- **`responses`**: Prospect replies and interactions
  - `id` (Primary Key), `lead_id`, `content`, `sentiment`, `unipile_message_id`, `status`, `processed`, `received_at`, `created_at`
- **`activity_log`**: Comprehensive audit trail
  - `id` (Primary Key), `lead_id`, `action`, `details` (JSONB), `success`, `error_message`, `created_at`
- **`daily_limits`**: Tracks daily usage limits
  - `id` (Primary Key), `date`, `connection_requests_sent`, `messages_sent`, `profile_views`, `created_at`

---

## 🎮 How to Use

### 1. Import Leads

Create a CSV file with the following columns:
```csv
name,company,linkedin_url,title,industry
John Smith,TechCorp Inc,https://linkedin.com/in/johnsmith,CEO,Technology
Sarah Johnson,RestaurantCo,https://linkedin.com/in/sarahjohnson,Owner,Food & Restaurant
```

**Upload via Dashboard:**
1. Go to http://localhost:3000
2. Click "Import Leads" button
3. Select your CSV file
4. System automatically imports and initializes leads

**Or use API:**
```bash
curl -X POST http://localhost:3000/api/leads/import \
  -F "csvFile=@leads.csv"
```

### 2. Start Automation

**Automatic Processing:**
- System runs daily at 9 AM (Asia/Jerusalem timezone)
- Initializes new leads with `NEW_LEAD` status
- Sends connection requests (respects daily limits)
- Processes webhook events in real-time

**Manual Trigger:**
```bash
# Run daily automation now
curl -X POST http://localhost:3000/api/leads/run-daily-automation

# Initialize leads manually
curl -X POST http://localhost:3000/dashboard/initialize-leads
```

### 3. Approve Messages

**Dashboard Workflow:**
1. Go to http://localhost:3000
2. Click on "Messages Drafted" card
3. Review AI-generated messages
4. **Approve**: Message gets sent automatically
5. **Reject**: Lead workflow pauses
6. **Edit**: Modify content before approving

**Bulk Operations:**
- Select multiple messages for bulk approval
- Filter by message type (connection_request, follow_up)
- View message history and context

### 4. Monitor & Respond

**Dashboard Cards:**
- **Pipeline Overview**: See leads in each automation stage
- **Unread Replies**: Respond to prospect messages
- **Hot Leads**: Follow up on interested prospects
- **Today's Progress**: Track daily activity

**Real-time Updates:**
- Webhook processes LinkedIn events instantly
- Dashboard updates automatically
- Activity log tracks all actions

---

## 🔧 API Endpoints

### Dashboard
- `GET /dashboard/stats` - System statistics and metrics
- `GET /dashboard/leads-by-state/:state` - Leads by automation state
- `GET /dashboard/unread-replies` - Unread prospect responses
- `GET /dashboard/sent-requests-today` - Connection requests sent today
- `POST /dashboard/initialize-leads` - Manually initialize leads
- `POST /dashboard/reset-daily-limits` - Reset today's limits

### Leads
- `GET /api/leads` - List all leads
- `GET /api/leads/:id` - Get specific lead
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `POST /api/leads/import` - Import leads from CSV
- `POST /api/leads/run-daily-automation` - Trigger daily automation

### Messages
- `GET /api/messages` - List messages with pagination
- `GET /api/messages/pending-approval` - Messages awaiting approval
- `GET /api/messages/:id` - Get specific message
- `POST /api/messages/:id/approve` - Approve/reject message
- `POST /api/messages/bulk-approve` - Bulk approve messages
- `POST /api/messages/generate` - Generate new AI message
- `POST /api/messages/:id/regenerate` - Regenerate message content
- `PUT /api/messages/:id` - Update message content
- `DELETE /api/messages/:id` - Delete message

### Webhooks
- `POST /webhooks/unipile` - Unipile webhook endpoint (handles all events)

---

## 🛡️ Safety Features

### Rate Limiting
- Configurable daily limits for connections, messages, and profile views
- Random delays between actions (30-120 minutes)
- Automatic limit tracking and enforcement

### Human Oversight
- All messages require human approval before sending
- Dashboard interface for easy message review
- Bulk approval capabilities for efficiency

### Error Handling
- Comprehensive error logging and recovery
- Automatic retry mechanisms for failed operations
- Account health monitoring and protection

### LinkedIn Compliance
- Respects LinkedIn's rate limits and best practices
- Gradual ramp-up of activity levels
- Smart error handling for account restrictions

---

## 📈 Expected Results

### Conservative Approach (Week 1)
- **Leads Processed**: 100
- **Connection Requests**: 10/day
- **Acceptance Rate**: ~20% = 14 connections
- **Response Rate**: ~10% = 1-2 conversations

### Full Scale (Month 1)
- **Leads Processed**: 500+
- **Connection Requests**: 10/day = 300+ requests
- **Accepted Connections**: ~60
- **Qualified Conversations**: ~6-10
- **Hot Leads**: 2-3 per week

---

## 🔧 Configuration

### Daily Limits
Adjust in your `.env` file:
```env
MAX_CONNECTION_REQUESTS_PER_DAY=10  # Start conservative
MAX_MESSAGES_PER_DAY=20             # Increase gradually
MAX_PROFILE_VIEWS_PER_DAY=75        # Usually automatic
```

### Message Timing
```env
MESSAGE_DELAY_MIN_MINUTES=30        # Minimum delay
MESSAGE_DELAY_MAX_MINUTES=120       # Maximum delay
FOLLOW_UP_DELAY_DAYS=3              # Days between follow-ups
```

### Automation Schedule
- **Lead Initialization**: Daily at 8 AM (Asia/Jerusalem timezone)
- **Daily Automation**: Daily at 9 AM (Asia/Jerusalem timezone)
- **Webhook Processing**: Real-time (24/7)
- **Timezone**: Asia/Jerusalem (hardcoded in scheduler)

---

## 🆘 Troubleshooting

### Common Issues

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

### Debug Mode
Enable detailed logging:
```bash
DEBUG=* npm start
```

### Test System
Run comprehensive system tests:
```bash
npm test
```

---

## 📚 API Documentation

### Webhook Events

The system processes these Unipile webhook events:

- **`message_received`**: Prospect replies to your messages
- **`new_relation`**: Connection requests accepted  
- **`message_sent`**: Confirmation of sent messages
- **`message_reaction`**: Message reactions (likes, etc.)
- **`message_read`**: Message read receipts
- **`message_edited`**: Message edits
- **`message_deleted`**: Message deletions

### State Machine

Leads progress through these states:
- `NEW_LEAD` → `CONNECTION_REQUEST_SENT` → `CONNECTION_ACCEPTED`
- `CONNECTION_ACCEPTED` → `FIRST_MESSAGE_DRAFTED` → `FIRST_MESSAGE_SENT`
- `FIRST_MESSAGE_SENT` → `RESPONSE_RECEIVED` → `FOLLOW_UP_DRAFTED`
- `FOLLOW_UP_DRAFTED` → `FOLLOW_UP_SENT` → `HOT_LEAD`/`CLOSED_LOST`

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