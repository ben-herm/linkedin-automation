const twilio = require('twilio');

class WhatsAppService {
  constructor(accountSid, authToken, fromNumber, notificationNumbers = []) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
    this.notificationNumbers = notificationNumbers;
  }

  async sendApprovalRequest(lead, message) {
    try {
      const text = `🔔 APPROVAL REQUEST\n\n` +
        `Lead: ${lead.name}\n` +
        `Company: ${lead.company}\n` +
        `Message: "${message}"\n\n` +
        `Reply YES to approve, NO to reject`;

      await this.sendToNotificationNumbers(text);
      return { success: true };
    } catch (error) {
      console.error('Error sending approval request:', error);
      return { success: false, error: error.message };
    }
  }

  async sendConnectionAccepted(lead) {
    try {
      const text = `✅ CONNECTION ACCEPTED\n\n` +
        `${lead.name} from ${lead.company} accepted your connection!\n` +
        `LinkedIn: ${lead.linkedin_url}`;

      await this.sendToNotificationNumbers(text);
      return { success: true };
    } catch (error) {
      console.error('Error sending connection accepted notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendResponseReceived(lead, message, sentiment) {
    try {
      const emoji = sentiment === 'INTERESTED' ? '🔥' : 
                   sentiment === 'NOT_INTERESTED' ? '❄️' : '💬';
      
      const text = `${emoji} RESPONSE RECEIVED\n\n` +
        `From: ${lead.name} (${lead.company})\n` +
        `Sentiment: ${sentiment}\n` +
        `Message: "${message}"\n\n` +
        `LinkedIn: ${lead.linkedin_url}`;

      await this.sendToNotificationNumbers(text);
      return { success: true };
    } catch (error) {
      console.error('Error sending response notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendHotLeadAlert(lead, message) {
    try {
      const text = `🔥🔥 HOT LEAD ALERT! 🔥🔥\n\n` +
        `${lead.name} from ${lead.company} is interested!\n` +
        `Message: "${message}"\n\n` +
        `RESPOND IMMEDIATELY!\n` +
        `LinkedIn: ${lead.linkedin_url}`;

      await this.sendToNotificationNumbers(text);
      return { success: true };
    } catch (error) {
      console.error('Error sending hot lead alert:', error);
      return { success: false, error: error.message };
    }
  }

  async sendCalendarRequest(lead, message) {
    try {
      const text = `📅 CALENDAR REQUEST!\n\n` +
        `${lead.name} from ${lead.company} wants to schedule a call!\n` +
        `Message: "${message}"\n\n` +
        `Send them your Calendly link: ${process.env.CALENDLY_LINK}\n` +
        `LinkedIn: ${lead.linkedin_url}`;

      await this.sendToNotificationNumbers(text);
      return { success: true };
    } catch (error) {
      console.error('Error sending calendar request:', error);
      return { success: false, error: error.message };
    }
  }

  async sendToNotificationNumbers(message) {
    const promises = this.notificationNumbers.map(number => 
      this.client.messages.create({
        from: this.fromNumber,
        to: number,
        body: message
      })
    );

    await Promise.all(promises);
  }

  async testConnection() {
    try {
      // Test by getting account info
      const account = await this.client.api.accounts(this.client.accountSid).fetch();
      return {
        success: true,
        message: `Connected to Twilio account: ${account.friendlyName}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = WhatsAppService;
