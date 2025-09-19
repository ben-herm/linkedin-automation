const axios = require('axios');

async function completeReset() {
  try {
    console.log('🔄 COMPLETE SYSTEM RESET STARTING...');
    
    // 1. Delete all messages related to Ben Herman (LeadId: 4921)
    console.log('\n1️⃣ Deleting all messages for Ben Herman...');
    try {
      const deleteMessagesResponse = await axios.post('http://localhost:3000/dashboard/reset-ben-herman');
      console.log('✅ Ben Herman messages deleted:', deleteMessagesResponse.data);
    } catch (error) {
      console.log('❌ Error deleting Ben Herman messages:', error.response?.data || error.message);
    }
    
    // 2. Move Emma Johnson to CONNECTION_ACCEPTED state
    console.log('\n2️⃣ Moving Emma Johnson to CONNECTION_ACCEPTED state...');
    try {
      const approveEmmaResponse = await axios.post('http://localhost:3000/dashboard/approve-emma');
      console.log('✅ Emma Johnson approved:', approveEmmaResponse.data);
    } catch (error) {
      console.log('❌ Error approving Emma Johnson:', error.response?.data || error.message);
    }
    
    // 3. Reset daily timer
    console.log('\n3️⃣ Resetting daily timer...');
    try {
      const resetTimerResponse = await axios.post('http://localhost:3000/dashboard/reset-daily-limits');
      console.log('✅ Daily timer reset:', resetTimerResponse.data);
    } catch (error) {
      console.log('❌ Error resetting daily timer:', error.response?.data || error.message);
    }
    
    // 4. Verify the results
    console.log('\n4️⃣ Verifying results...');
    setTimeout(async () => {
      try {
        const statsResponse = await axios.get('http://localhost:3000/dashboard/stats');
        console.log('\n📊 FINAL STATUS:');
        console.log('Leads by state:', statsResponse.data.leadsByState);
        console.log('Daily limits:', statsResponse.data.dailyLimits);
        console.log('Message stats:', statsResponse.data.messageStats);
        
        // Check if Emma is in CONNECTION_ACCEPTED
        const connectionAcceptedResponse = await axios.get('http://localhost:3000/dashboard/leads-by-state/CONNECTION_ACCEPTED');
        const emma = connectionAcceptedResponse.data.leads.find(lead => lead.name === 'Emma Johnson');
        
        if (emma) {
          console.log('\n✅ SUCCESS: Emma Johnson is in CONNECTION_ACCEPTED state!');
          console.log('- Name:', emma.name);
          console.log('- Company:', emma.company);
        } else {
          console.log('\n❌ Emma Johnson not found in CONNECTION_ACCEPTED state');
        }
        
        // Check if Ben Herman has no messages
        const pendingMessagesResponse = await axios.get('http://localhost:3000/api/messages/pending-approval');
        const benMessages = pendingMessagesResponse.data.filter ? 
          pendingMessagesResponse.data.filter(msg => msg.name === 'Ben Herman') : 
          [];
        
        if (benMessages.length === 0) {
          console.log('✅ SUCCESS: Ben Herman has no pending messages');
        } else {
          console.log('❌ Ben Herman still has', benMessages.length, 'pending messages');
        }
        
      } catch (error) {
        console.error('Error verifying results:', error.message);
      }
    }, 2000);
    
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
  }
}

completeReset();
