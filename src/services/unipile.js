const axios = require('axios');

class UnipileService {
  constructor(apiToken, dsn = null) {
    this.apiToken = apiToken;
    this.dsn = dsn || process.env.UNIPILE_DSN;
    this.accountId = process.env.UNIPILE_LINKEDIN_ACCOUNT_ID;
    
    // Unipile uses DSN-based URLs: https://{YOUR_DSN}/api/v1/
    if (this.dsn) {
      this.baseUrl = `https://${this.dsn}/api/v1`;
    } else {
      this.baseUrl = 'https://api.unipile.com/v1'; // fallback
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-API-KEY': apiToken,  // Unipile uses X-API-KEY, not Bearer
        'Content-Type': 'application/json'
      }
    });
  }

  async sendConnectionRequest(linkedinUrl, message = null) {
    try {
      console.log(`Sending connection request to: ${linkedinUrl}${message ? ' with message' : ' without message'}`);
      
      // Step 1: Extract public ID from LinkedIn URL
      const publicId = linkedinUrl.split('/in/')[1]?.replace('/', '');
      if (!publicId) {
        throw new Error('Invalid LinkedIn URL format. Expected format: https://www.linkedin.com/in/username');
      }
      
      console.log(`Extracted public ID: ${publicId}`);
      
      // Step 2: Get user profile to obtain provider_id
      console.log('Getting user profile information...');
      const userResponse = await this.client.get(`/users/${publicId}`, {
        params: { account_id: this.accountId }
      });
      
      const providerId = userResponse.data.provider_id;
      if (!providerId) {
        throw new Error('Could not retrieve provider_id from user profile');
      }
      
      console.log(`Found provider_id: ${providerId}`);
      
      // Step 3: Send invitation using provider_id
      const invitePayload = {
        provider: "LINKEDIN",
        account_id: this.accountId,
        provider_id: providerId
      };
      
      // Only include message if provided (empty connection request feels more natural)
      if (message && message.trim()) {
        invitePayload.message = message;
      }

      console.log('Sending invitation with payload:', invitePayload);
      const response = await this.client.post('/users/invite', invitePayload);
      
      console.log('Connection request sent successfully:', response.data);
      return response.data;

    } catch (error) {
      console.error('❌ DETAILED ERROR sending connection request:');
      console.error('Status:', error.response?.status);
      console.error('Status Text:', error.response?.statusText);
      console.error('Headers:', error.response?.headers);
      console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Error Message:', error.message);
      console.error('Full Error:', error);
      
      throw new Error(`Failed to send connection request: ${error.response?.data?.message || error.message}`);
    }
  }

  async sendMessage(linkedinUrl, message) {
    try {
      console.log(`📤 Sending message to: ${linkedinUrl}`);
      console.log(`   Message content: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
      console.log(`   Account ID: ${this.accountId}`);
      
      // Step 1: Extract public ID from LinkedIn URL
      const publicId = linkedinUrl.split('/in/')[1]?.replace('/', '');
      if (!publicId) {
        throw new Error('Invalid LinkedIn URL format. Expected format: https://www.linkedin.com/in/username');
      }
      
      console.log(`   Extracted public ID: ${publicId}`);
      
      // Step 2: Get user profile to obtain provider_id
      console.log('   Getting user profile information...');
      const userResponse = await this.client.get(`/users/${publicId}`, {
        params: { account_id: this.accountId }
      });
      
      const providerId = userResponse.data.provider_id;
      if (!providerId) {
        throw new Error('Could not retrieve provider_id from user profile');
      }
      
      console.log(`   Found provider_id: ${providerId}`);
      
      // Step 3: Send message using correct format with attendees_ids
      // FIXED: Use multipart/form-data format as per Unipile documentation
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('account_id', this.accountId);
      formData.append('attendees_ids', providerId);  // FIXED: Single value, not JSON array
      formData.append('text', message);  // FIXED: Use 'text' field, not 'message'
      
      console.log('   Sending message with form data:');
      console.log(`     account_id: ${this.accountId}`);
      console.log(`     attendees_ids: ${providerId}`);
      console.log(`     text: ${message.substring(0, 100)}...`);
      
      const response = await this.client.post('/chats', formData, {
        headers: {
          ...formData.getHeaders(),
          'X-API-KEY': this.apiToken
        }
      });

      console.log('✅ Message sent successfully via Unipile:');
      console.log('   Response status:', response.status);
      console.log('   Response data:', JSON.stringify(response.data, null, 2));
      
      // Return the response data with proper structure
      return {
        id: response.data.id || response.data.message_id || 'unknown',
        status: 'sent',
        unipile_response: response.data,
        sent_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ DETAILED ERROR sending message:');
      console.error('   Status:', error.response?.status);
      console.error('   Status Text:', error.response?.statusText);
      console.error('   Headers:', error.response?.headers);
      console.error('   Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Error Message:', error.message);
      console.error('   Request URL:', error.config?.url);
      console.error('   Request Method:', error.config?.method);
      console.error('   Request Data:', JSON.stringify(error.config?.data, null, 2));
      
      throw new Error(`Failed to send message: ${error.response?.data?.message || error.message}`);
    }
  }

  async getProfile(linkedinUrl) {
    try {
      console.log(`Getting profile: ${linkedinUrl}`);
      
      // Extract public ID and use the working /users/{publicId} endpoint
      const publicId = linkedinUrl.split('/in/')[1]?.replace('/', '');
      if (!publicId) {
        throw new Error('Invalid LinkedIn URL format');
      }
      
      const response = await this.client.get(`/users/${publicId}`, {
        params: { account_id: this.accountId }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting profile:', error.response?.data || error.message);
      throw new Error(`Failed to get profile: ${error.response?.data?.message || error.message}`);
    }
  }

  async getMessages(linkedinUrl, limit = 50) {
    try {
      // Use the correct /messages endpoint
      const response = await this.client.get('/messages', {
        params: { 
          account_id: this.accountId,
          limit: limit 
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting messages:', error.response?.data || error.message);
      throw new Error(`Failed to get messages: ${error.response?.data?.message || error.message}`);
    }
  }

  async getConnectionStatus(linkedinUrl) {
    try {
      console.log(`🔍 Checking connection status for: ${linkedinUrl}`);
      
      // Extract public ID from LinkedIn URL
      const publicId = linkedinUrl.split('/in/')[1]?.replace('/', '');
      if (!publicId) {
        throw new Error('Invalid LinkedIn URL format');
      }
      
      // Get user profile to check network_distance
      const userResponse = await this.client.get(`/users/${publicId}`, {
        params: { account_id: this.accountId }
      });
      
      const networkDistance = userResponse.data.network_distance;
      const isConnected = networkDistance === 'FIRST_DEGREE';
      
      console.log(`   Network distance: ${networkDistance}`);
      console.log(`   Connected: ${isConnected}`);
      
      return {
        connected: isConnected,
        status: isConnected ? 'connected' : 'not_connected',
        network_distance: networkDistance,
        user_profile: userResponse.data
      };
    } catch (error) {
      console.error('Error getting connection status:', error.response?.data || error.message);
      throw new Error(`Failed to get connection status: ${error.response?.data?.message || error.message}`);
    }
  }

  async setupWebhook(webhookUrl, events = ['message_received', 'connection_accepted']) {
    try {
      const response = await this.client.post('/webhooks', {
        url: webhookUrl,
        events: events
      });

      console.log('Webhook setup successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error setting up webhook:', error.response?.data || error.message);
      throw new Error(`Failed to setup webhook: ${error.response?.data?.message || error.message}`);
    }
  }

  async testConnection() {
    try {
      console.log('Testing Unipile API connection...');
      console.log('API Token present:', !!this.apiToken);
      console.log('DSN:', this.dsn || 'Not configured');
      console.log('Base URL:', this.baseUrl);
      console.log('Account ID:', this.accountId);
      
      // Check if we have the required credentials
      if (!this.apiToken) {
        return { 
          success: false, 
          error: 'No API token provided' 
        };
      }

      if (!this.dsn) {
        return {
          success: false,
          error: 'No DSN configured. Unipile requires a Data Source Name (DSN) from your dashboard.'
        };
      }

      // Test the real Unipile API with /accounts endpoint
      console.log('🔍 Testing real Unipile API with /accounts endpoint...');
      const response = await this.client.get('/accounts');
      
      console.log('✅ Unipile API connection successful!');
      console.log('Response:', response.data);
      
      return { 
        success: true, 
        message: 'Successfully connected to Unipile API',
        data: response.data,
        endpoint: '/accounts'
      };
      
    } catch (error) {
      console.error('Unipile connection test failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      return { 
        success: false, 
        error: {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          details: error.response?.data
        }
      };
    }
  }

  // Rate limiting helpers
  async checkDailyLimits() {
    try {
      const response = await this.client.get('/account/limits');
      return response.data;
    } catch (error) {
      console.error('Error checking daily limits:', error.response?.data || error.message);
      return null;
    }
  }

  async getRateLimitStatus() {
    try {
      const response = await this.client.get('/account/rate-limit');
      return response.data;
    } catch (error) {
      console.error('Error getting rate limit status:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = UnipileService;

