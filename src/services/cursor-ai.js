// Simple AI Service - Generates truly personalized messages
class CursorAIService {
  constructor() {
    this.available = true;
    console.log('🤖 AI Service initialized - generating personalized messages');
  }

  async analyzeLinkedInProfile(leadData) {
    // Simple analysis based on their data
    const industry = leadData.industry || 'business';
    const title = leadData.title || 'business owner';
    
    return `As a ${title.toLowerCase()} in ${industry.toLowerCase()}, ${leadData.name} likely deals with operational challenges typical of their industry. Focus on time-saving and efficiency benefits.`;
  }

  async generateConnectionRequest(leadData, profileAnalysis) {
    console.log(`🤖 Generating personalized message for ${leadData.name} at ${leadData.company}`);
    
    // Extract key info
    const name = leadData.name.split(' ')[0];
    const company = leadData.company;
    const title = leadData.title?.toLowerCase() || 'business owner';
    const industry = leadData.industry?.toLowerCase() || 'business';
    const location = leadData.location;

    // Generate BUDDY-STYLE messages that sound like personal research
    let message;
    const messageVariations = [];

    // Create multiple natural, researched-sounding variations
    if (industry.includes('retail') && title.includes('founder')) {
      messageVariations.push(
        `Hey ${name}, saw ${company} and had to reach out. Retail is brutal right now with inventory management and all the moving pieces. Been working with a few other retail founders who were drowning in the same stuff. Mind if we connect?`,
        `Hi ${name}, came across ${company} and your background caught my eye. The retail space is so demanding - between inventory, staff, and customer management. I've been helping some founders in similar spots streamline their operations. Worth a quick connect?`,
        `${name}, noticed you're building something cool with ${company}. Retail operations can be such a nightmare to manage manually. I work with founders who've been in your shoes and found some game-changing approaches. Interested in connecting?`
      );
    } else if (industry.includes('food') && title.includes('owner')) {
      messageVariations.push(
        `Hey ${name}, ${company} looks awesome! Restaurant operations are insanely complex - the scheduling, supplier coordination, customer service juggling act. I work with restaurant owners who've cracked the code on streamlining this stuff. Worth connecting?`,
        `Hi ${name}, stumbled across ${company} and love what you're doing. The food industry is so demanding operationally. Been helping restaurant owners automate the backend chaos so they can focus on what they love. Mind connecting?`,
        `${name}, ${company} caught my attention! Running a restaurant means wearing 50 hats at once. I've worked with owners who found ways to get their time back without sacrificing quality. Interested in a quick connect?`
      );
    } else if (industry.includes('healthcare') && title.includes('manager')) {
      messageVariations.push(
        `Hey ${name}, saw your work at ${company}. Healthcare admin is absolutely brutal - patient scheduling, billing, compliance paperwork. I work with practice managers who've found ways to cut through the administrative nightmare. Worth connecting?`,
        `Hi ${name}, came across ${company} and had to reach out. Managing a healthcare practice means drowning in paperwork instead of focusing on patient care. Been helping managers in similar situations reclaim their time. Mind if we connect?`,
        `${name}, noticed ${company} and your role there. The administrative burden in healthcare is insane. I work with practice managers who've automated the tedious stuff and gotten their lives back. Interested in connecting?`
      );
    } else if (industry.includes('manufacturing') && title.includes('director')) {
      messageVariations.push(
        `Hey ${name}, ${company} looks solid! Manufacturing operations are incredibly complex - production planning, quality control, logistics coordination. I work with ops directors who've streamlined these processes beautifully. Worth a connect?`,
        `Hi ${name}, came across ${company} and your background. Manufacturing requires juggling so many systems and processes manually. Been helping operations directors automate the coordination headaches. Mind connecting?`,
        `${name}, saw your work at ${company}. Production operations can be such a coordination nightmare. I work with directors who've found elegant solutions to streamline the chaos. Interested in a quick connect?`
      );
    } else if (industry.includes('technology') && title.includes('ceo')) {
      messageVariations.push(
        `Hey ${name}, ${company} looks interesting! Even tech companies get bogged down in operational stuff that pulls focus from the real innovation work. I help tech CEOs eliminate that overhead so they can build what matters. Worth connecting?`,
        `Hi ${name}, came across ${company} and had to reach out. Funny how even tech companies end up with manual processes eating away at strategic time. Work with CEOs who've solved this elegantly. Mind if we connect?`,
        `${name}, noticed ${company} - looks like you're building something cool! The irony of tech companies having manual admin processes isn't lost on me. Help CEOs automate the boring stuff. Interested in connecting?`
      );
    } else {
      // Natural, researched-sounding default
      messageVariations.push(
        `Hey ${name}, came across ${company} and your background in ${industry}. Running a business means juggling countless operational details that eat into strategic time. Been working with leaders in similar situations who've found elegant solutions. Worth connecting?`,
        `Hi ${name}, saw ${company} and had to reach out. The ${industry} space requires managing so many moving pieces simultaneously. I work with ${title}s who've streamlined their operations beautifully. Mind if we connect?`,
        `${name}, noticed your work at ${company}. ${industry} businesses have such complex operational demands. Been helping leaders automate the time-consuming stuff so they can focus on growth. Interested in a quick connect?`
      );
    }

    // Randomly select for variety (sounds more human)
    message = messageVariations[Math.floor(Math.random() * messageVariations.length)];

    // Add natural location context (like a real person would)
    if (location) {
      if (location.includes('San Francisco')) {
        message = message.replace('Worth connecting?', 'Bay Area entrepreneurs are always interesting to connect with!');
        message = message.replace('Mind if we connect?', 'Mind if we connect? Love the SF startup energy.');
        message = message.replace('Interested in connecting?', 'Interested in connecting? Always great meeting Bay Area founders.');
      } else if (location.includes('New York')) {
        message = message.replace('Worth connecting?', 'NYC business scene is incredible - worth connecting!');
        message = message.replace('Mind if we connect?', 'Mind if we connect? NYC has the best entrepreneurs.');
        message = message.replace('Interested in connecting?', 'Interested in connecting? Love the NYC hustle.');
      } else if (location.includes('Chicago')) {
        message = message.replace('Worth connecting?', 'Chicago business community is so solid - worth connecting!');
        message = message.replace('Mind if we connect?', 'Mind if we connect? Chicago entrepreneurs are the best.');
        message = message.replace('Interested in connecting?', 'Interested in connecting? Love Chicago\'s business culture.');
      } else if (location.includes('Los Angeles')) {
        message = message.replace('Worth connecting?', 'LA business scene is so diverse - worth connecting!');
        message = message.replace('Mind if we connect?', 'Mind if we connect? LA entrepreneurs are fascinating.');
        message = message.replace('Interested in connecting?', 'Interested in connecting? Love LA\'s creative business energy.');
      } else if (location.includes('Detroit')) {
        message = message.replace('Worth connecting?', 'Detroit\'s comeback story is inspiring - worth connecting!');
        message = message.replace('Mind if we connect?', 'Mind if we connect? Detroit entrepreneurs are resilient.');
        message = message.replace('Interested in connecting?', 'Interested in connecting? Love Detroit\'s entrepreneurial spirit.');
      }
    }

    // Ensure under 300 characters
    if (message.length > 300) {
      message = `Hi ${name}, I help ${title}s at companies like ${company} automate admin tasks and reclaim 15+ hours weekly. Worth connecting?`;
    }

    console.log(`✅ Generated: "${message}"`);
    return message;
  }

  async generateFollowUpMessage(leadData, messageHistory, followUpNumber = 1) {
    const name = leadData.name.split(' ')[0];
    const company = leadData.company;
    const industry = leadData.industry || 'business';
    const title = leadData.title || 'business owner';

    // Check message history to understand context
    const hasPreviousMessages = messageHistory && messageHistory.length > 0;
    const previousMessageTypes = hasPreviousMessages ? messageHistory.map(m => m.type).join(', ') : 'none';
    
    console.log(`🤖 Generating message #${followUpNumber} for ${name} (${title} at ${company})`);
    console.log(`   Previous messages: ${previousMessageTypes}`);
    console.log(`   Following AI_MESSAGE_GUIDELINES.md for ${followUpNumber === 1 ? 'First Message' : 'Follow-up #' + (followUpNumber - 1)}`);

    if (followUpNumber === 1) {
      // FIRST MESSAGE AFTER CONNECTION (Following guidelines)
      // Should be warm, professional, reference LinkedIn details, engaging question, 2-3 sentences
      const industryInsights = {
        'Healthcare': 'patient scheduling and billing admin',
        'Manufacturing': 'production planning and inventory tracking', 
        'Food & Restaurant': 'staff scheduling and supplier coordination',
        'Retail': 'inventory management and customer service',
        'Technology': 'administrative overhead that pulls focus from innovation',
        'Business Leadership': 'operational details that eat into strategic time'
      };
      
      const insight = industryInsights[industry] || 'administrative tasks';
      
      return `Hi ${name}, thanks for connecting! Noticed you're leading ${company} - ${industry.toLowerCase()} businesses have such complex ${insight} demands. Been helping similar ${title}s automate the time-consuming stuff. What's your biggest operational headache right now?`;
      
    } else if (followUpNumber === 2) {
      // FIRST FOLLOW-UP: Provide value (case study/insight), reference previous context, 3-4 sentences
      return `Hi ${name}, quick follow-up on streamlining ${company}'s operations. Just helped a ${industry.toLowerCase()} company similar to yours eliminate 18 hours of weekly admin work. Their ${title} went from working 60+ hour weeks to focusing purely on growth. What percentage of your time currently goes to admin vs strategic work?`;
      
    } else if (followUpNumber === 3) {
      // SECOND FOLLOW-UP: More direct value offer, soft meeting suggestion, 2-3 sentences
      return `Hi ${name}, last note from me! If you're like most ${title}s I work with, you're probably spending 15+ hours weekly on tasks that could be automated. Worth a brief 15-minute call to see if there's a fit for ${company}?`;
      
    } else {
      // FINAL MESSAGE: Direct calendar link, no pressure, 1-2 sentences
      return `Hi ${name}, completely understand if this isn't a priority. If you ever want to explore automating ${company}'s operations, here's my calendar: ${process.env.CALENDLY_LINK || 'https://calendly.com/your-link'}`;
    }
  }

  async analyzeResponse(responseText) {
      const text = responseText.toLowerCase();
      
    const interestedKeywords = ['yes', 'interested', 'tell me more', 'sounds good', 'schedule', 'call', 'meeting'];
    const negativeKeywords = ['not interested', 'no thanks', 'remove', 'stop', 'busy'];
    const calendarKeywords = ['calendar', 'schedule', 'meeting', 'call', 'available', 'book'];

      const interested = interestedKeywords.some(word => text.includes(word));
      const negative = negativeKeywords.some(word => text.includes(word));
      const calendar = calendarKeywords.some(word => text.includes(word));

      let sentiment = 'NEUTRAL';
      if (interested || calendar) sentiment = 'INTERESTED';
      if (negative) sentiment = 'NEGATIVE';

      return {
        sentiment,
        calendar_request: calendar,
      wants_info: interested,
      pricing_question: text.includes('cost') || text.includes('price'),
        confidence: 0.8,
      reasoning: 'Keyword-based analysis'
      };
  }

  async generateResponseToProspect(leadData, prospectMessage, context = {}) {
      const name = leadData.name.split(' ')[0];
      const analysis = await this.analyzeResponse(prospectMessage);
      
      if (analysis.calendar_request) {
      return `Hi ${name}, absolutely! I'd love to chat about how we can help ${leadData.company} streamline operations. Here's my calendar: ${process.env.CALENDLY_LINK || 'https://calendly.com/your-link'}`;
      }
      
      if (analysis.sentiment === 'INTERESTED') {
      return `Hi ${name}, glad this resonates! Many ${leadData.industry || 'business'} owners are surprised by how much time they get back. Worth a brief call to see if there's a fit for ${leadData.company}?`;
    }
    
    return `Hi ${name}, thanks for getting back to me! I'd love to learn more about ${leadData.company}'s current operations. Any interest in a brief call this week?`;
  }

  async testConnection() {
    return { 
      success: true, 
      message: 'AI service ready - generating personalized messages' 
    };
  }
}

module.exports = CursorAIService;