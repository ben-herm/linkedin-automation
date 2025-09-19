const OpenAI = require('openai');
const axios = require('axios');

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
    
    console.log('🤖 OpenAI Service initialized with GPT-4o');
  }

  // Test connection to OpenAI API
  async testConnection() {
    try {
      console.log('🔍 Testing OpenAI API connection...');
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello, this is a connection test.' }],
        max_completion_tokens: 10
      });
      
      console.log('✅ OpenAI API connection successful!');
      return true;
    } catch (error) {
      console.error('❌ OpenAI API connection failed:', error.message);
      return false;
    }
  }

  // Analyze response sentiment and intent
  async analyzeResponse(responseText) {
    try {
      const prompt = `Analyze this LinkedIn message response and determine:
1. Sentiment: INTERESTED, NEUTRAL, or NEGATIVE
2. Intent: What the person is trying to communicate
3. Calendar request: true/false if they're asking for a meeting
4. Key topics: What they're interested in discussing

Message: "${responseText}"

Respond in JSON format:
{
  "sentiment": "NEUTRAL",
  "intent": "brief greeting",
  "calendar_request": false,
  "key_topics": ["greeting"],
  "confidence": 0.8
}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 200
      });

      const content = response.choices[0].message.content;
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch (error) {
        console.log('⚠️ JSON parse failed, using fallback analysis');
        analysis = {
          sentiment: 'NEUTRAL',
          intent: 'unknown',
          calendar_request: false,
          key_topics: [],
          confidence: 0.5
        };
      }
      console.log(`🤖 Response analysis: ${analysis.sentiment} (${analysis.confidence} confidence)`);
      
      return analysis;
    } catch (error) {
      console.error('❌ Error analyzing response:', error);
      return {
        sentiment: 'NEUTRAL',
        intent: 'unknown',
        calendar_request: false,
        key_topics: [],
        confidence: 0.5
      };
    }
  }

  // Fetch and analyze webpage content
  async analyzeWebpage(url) {
    try {
      console.log(`🔍 Analyzing webpage: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const html = response.data;
      
      // Extract key information using GPT-5
      const prompt = `Analyze this webpage HTML and extract key business information:

URL: ${url}
HTML: ${html.substring(0, 5000)}...

Extract:
1. Company name and industry
2. Key services/products
3. Recent news or updates
4. Leadership team info
5. Company size/scale
6. Any interesting facts

Respond in JSON format:
{
  "company_name": "Company Name",
  "industry": "Industry",
  "services": ["service1", "service2"],
  "recent_news": ["news1", "news2"],
  "leadership": ["CEO: Name", "CTO: Name"],
  "company_size": "50-100 employees",
  "interesting_facts": ["fact1", "fact2"]
}`;

      const gptResponse = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 500
      });

      const content = gptResponse.choices[0].message.content;
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch (error) {
        console.log('⚠️ JSON parse failed, using fallback analysis');
        analysis = {
          company_name: 'Unknown',
          industry: 'Unknown',
          services: [],
          recent_news: [],
          leadership: [],
          company_size: 'Unknown',
          interesting_facts: []
        };
      }
      console.log(`✅ Webpage analyzed: ${analysis.company_name} - ${analysis.industry}`);
      
      return analysis;
    } catch (error) {
      console.error(`❌ Error analyzing webpage ${url}:`, error.message);
      return {
        company_name: 'Unknown',
        industry: 'Unknown',
        services: [],
        recent_news: [],
        leadership: [],
        company_size: 'Unknown',
        interesting_facts: []
      };
    }
  }

  // Generate human-like message with full context
  async generateMessage(leadData, messageHistory, guidelines, messageType = 'first_message') {
    try {
      console.log(`🤖 Generating ${messageType} for ${leadData.name}...`);
      
      // Analyze any links in the lead data
      let linkAnalysis = {};
      if (leadData.linkedin_url) {
        linkAnalysis.linkedin = await this.analyzeWebpage(leadData.linkedin_url);
      }
      
      // Build context for AI
      const context = {
        lead: leadData,
        messageHistory: messageHistory,
        guidelines: guidelines,
        linkAnalysis: linkAnalysis,
        messageType: messageType
      };
      
      const prompt = this.buildPrompt(context);
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 300
      });

      const message = response.choices[0].message.content.trim();
      console.log(`✅ Generated message: "${message.substring(0, 100)}..."`);
      console.log(`📝 Full message: "${message}"`);
      
      return message;
    } catch (error) {
      console.error('❌ Error generating message:', error);
      throw error;
    }
  }

  // Build comprehensive prompt for message generation
  buildPrompt(context) {
    const { lead, messageHistory, guidelines, linkAnalysis, messageType } = context;
    
    let prompt = `Write a casual LinkedIn message to ${lead.name} who works as ${lead.title} at ${lead.company}.

Previous messages:
${messageHistory.length > 0 ? messageHistory.map(msg => `- ${msg.type}: "${msg.content}"`).join('\n') : 'No previous messages'}

Write a short, friendly message that sounds human (not AI). Keep it under 200 characters.

Message:`;

    return prompt;
  }

  // Generate follow-up message
  async generateFollowUpMessage(leadData, messageHistory, followUpNumber = 1) {
    const guidelines = await this.loadGuidelines('follow_up');
    return await this.generateMessage(leadData, messageHistory, guidelines, 'follow_up');
  }

  // Generate first message
  async generateFirstMessage(leadData, messageHistory) {
    const guidelines = await this.loadGuidelines('first_message');
    return await this.generateMessage(leadData, messageHistory, guidelines, 'first_message');
  }

  // Load AI guidelines from file
  async loadGuidelines(messageType) {
    try {
      const fs = require('fs').promises;
      const guidelines = await fs.readFile('AI_MESSAGE_GUIDELINES.md', 'utf8');
      return guidelines;
    } catch (error) {
      console.error('❌ Error loading guidelines:', error);
      return 'Be human, casual, and engaging. Reference their company and ask relevant questions.';
    }
  }
}

module.exports = OpenAIService;
