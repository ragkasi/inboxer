import { GmailService } from "./utils/gmail.js";

// Initialize weekly auto-clean alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("weeklyAutoClean", {
    periodInMinutes: 7 * 24 * 60
  });
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "weeklyAutoClean") {
    // Get saved filters and tokens
    chrome.storage.local.get(['emailThreads', 'tokens', 'autoCleanFilters'], async (result) => {
      const { tokens, autoCleanFilters } = result;
      if (!tokens || !autoCleanFilters) return;

      try {
        // Re-fetch and process based on saved filters
        if (tokens.gmail && autoCleanFilters.gmail) {
          const gmailService = new GmailService();
          await gmailService.initialize();
          gmailService.accessToken = tokens.gmail;
          const threads = await gmailService.fetchThreads();
          const messageIds = threads
            .filter(thread => autoCleanFilters.gmail.includes(
              thread.messages[0].payload.headers.find(h => h.name === "From").value
            ))
            .flatMap(t => t.messages.map(m => m.id));
          
          if (messageIds.length > 0) {
            await gmailService.deleteMessages(messageIds);
          }
        }
        
        // Similar logic for Outlook can be added here
      } catch (error) {
        console.error('Auto-clean error:', error);
      }
    });
  }
});

async function deleteOutlookMessages(token, messageIds) {
  const client = Client.init({
    authProvider: done => done(null, token)
  });
  
  return Promise.all(messageIds.map(id =>
    client.api(`/me/messages/${id}`).delete()
  ));
}

function groupBySender(threads) {
  return threads.reduce((groups, thread) => {
    const msg = thread.messages[0];
    const from = msg.payload.headers.find(h => h.name === "From").value;
    groups[from] = groups[from] || { count: 0, threads: [] };
    groups[from].count++;
    groups[from].threads.push(thread);
    return groups;
  }, {});
}

function computeSubscriptionScore(threads) {
  // e.g. openCount / totalSent
  return threads.map(thread => {
    const opens = thread.history ? thread.history.filter(h => h.labelsAdded).length : 0;
    return { thread, score: opens / thread.messages.length };
  });
}

const MICROSOFT_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite'
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'GMAIL_AUTH':
      // Handle Gmail OAuth flow
      chrome.identity.getAuthToken({ interactive: true }, token => {
        if (chrome.runtime.lastError) {
          return sendResponse({ error: chrome.runtime.lastError });
        }
        sendResponse({ token });
      });
      return true;
    
    case 'OUTLOOK_AUTH':
      // Handle Microsoft OAuth flow
      const redirectURL = chrome.identity.getRedirectURL();
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const authURL = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${clientId}` +
        `&response_type=token` +
        `&redirect_uri=${encodeURIComponent(redirectURL)}` +
        `&scope=${encodeURIComponent(MICROSOFT_SCOPES.join(' '))}`;

      chrome.identity.launchWebAuthFlow({
        url: authURL,
        interactive: true
      }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          return sendResponse({ error: chrome.runtime.lastError });
        }
        
        // Extract access token from response URL
        const url = new URL(responseUrl);
        const params = new URLSearchParams(url.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
          sendResponse({ token });
        } else {
          sendResponse({ error: 'Failed to get access token' });
        }
      });
      return true;

    case 'AUTH_AND_FETCH_GMAIL':
      chrome.identity.getAuthToken({ interactive: true }, token => {
        if (chrome.runtime.lastError) {
          return sendResponse({ error: chrome.runtime.lastError });
        }
        const gmailService = new GmailService();
        gmailService.initialize()
          .then(() => {
            gmailService.accessToken = token;
            return gmailService.fetchThreads();
          })
          .then(threads => sendResponse({ threads }))
          .catch(err => sendResponse({ error: err }));
      });
      return true;

    case 'DELETE_SENDERS':
      const { senders, provider } = request;
      
      // First get stored threads
      chrome.storage.local.get(['emailThreads', 'tokens'], async (result) => {
        const { emailThreads, tokens } = result;
        if (!emailThreads || !tokens) {
          return sendResponse({ error: 'No email data found' });
        }

        try {
          // Filter threads by selected senders
          const threadsToDelete = emailThreads.filter(thread => 
            senders.includes(thread.messages[0].payload.headers.find(h => h.name === "From").value)
          );

          const messageIds = threadsToDelete.flatMap(t => t.messages.map(m => m.id));

          if (provider === 'gmail' && tokens.gmail) {
            const gmailService = new GmailService();
            await gmailService.initialize();
            gmailService.accessToken = tokens.gmail;
            await gmailService.deleteMessages(messageIds);
          } else if (provider === 'outlook' && tokens.outlook) {
            await deleteOutlookMessages(tokens.outlook, messageIds);
          }

          sendResponse({ success: true });
        } catch (error) {
          console.error('Error deleting messages:', error);
          sendResponse({ error: error.message });
        }
      });
      return true;

    case 'TOGGLE_AUTO_CLEAN':
      if (request.enabled) {
        chrome.alarms.create("weeklyAutoClean", { 
          periodInMinutes: 7 * 24 * 60 
        });
      } else {
        chrome.alarms.clear("weeklyAutoClean");
      }
      sendResponse({ success: true });
      return true;
      
    default:
      break;
  }
  return true;
});