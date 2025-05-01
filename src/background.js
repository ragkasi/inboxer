// IMPORTANT: Top-level logs outside any module system or function will be visible
console.log("🔷 [Test] Background script loaded as ES module at", new Date().toISOString());

// Explicitly force logs to appear even in wrapped code
(function forceConsoleLog() {
  // Save original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Override console methods to ensure they always get sent to DevTools
  console.log = function(...args) {
    originalLog.apply(console, args);
  };
  
  console.warn = function(...args) {
    originalWarn.apply(console, args);
  };
  
  console.error = function(...args) {
    originalError.apply(console, args);
  };
})();

// IMPORTANT: This forces the script to log unconditionally
self.addEventListener("install", (event) => {
  console.log("🚀 SERVICE WORKER INSTALL EVENT", new Date().toISOString());
  self.skipWaiting(); // Force activation
});

// Force service worker to activate immediately
self.addEventListener("activate", (event) => {
  console.log("🚀 SERVICE WORKER ACTIVATE EVENT", new Date().toISOString());
  // This ensures the service worker activates immediately
  event.waitUntil(self.clients.claim());
});

console.log("🔷 [Test] Background script loaded at", new Date().toISOString());

import { GmailService } from "./utils/gmail.js";
import { deleteOutlookMessages as deleteOutlookMessagesUtil } from "./utils/graphClient.js";
import { OutlookService } from './utils/outlook';
// We can't directly import the Client from @microsoft/microsoft-graph-client in a browser extension
// Instead we need to use the global Client object that's available via the script tag

// Track initialization status
let initialized = false;
let initializationError = null;
let messageListenerFunction = null; // Store the actual function reference
let selectedService = null;
let keepAliveIntervalId = null;

// Constants
const MICROSOFT_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite'
];

// Configuration
const config = {
  gmail: {
    clientId: process.env.REACT_APP_GMAIL_CLIENT_ID,
  },
  outlook: {
    clientId: process.env.REACT_APP_OUTLOOK_CLIENT_ID,
  }
};

// Service instances
const services = {
  gmail: new GmailService(),
  outlook: new OutlookService(),
};

const PING_INTERVAL = 20 * 1000; // 20 seconds

console.log("Background script starting execution at", new Date().toISOString());

/**
 * Helper function to safely serialize errors
 * @param {Error|Object|string} error - The error to serialize
 * @returns {string} - Serialized error message
 */
function serializeError(error) {
  if (!error) return 'Unknown error';
  
  try {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || 'Unknown error';
    if (error.message) return error.message;
    
    // Better handling for object-type errors
    if (typeof error === 'object') {
      // Try to extract useful information from the error object
      const errorStr = JSON.stringify(error);
      if (errorStr && errorStr !== '{}') {
        return errorStr;
      }
      
      // If we can't get a useful JSON representation,
      // try to find any string property that might contain error info
      for (const key in error) {
        if (typeof error[key] === 'string' && error[key]) {
          return `${key}: ${error[key]}`;
        }
      }
    }
    
    return JSON.stringify(error);
  } catch (e) {
    return 'Error occurred (could not serialize details)';
  }
}

// Log runtime errors to debug extension issues
const logRuntimeError = (context) => {
  const error = chrome.runtime.lastError;
  if (error) {
    const serialized = serializeError(error);
    console.error(`Runtime error (${context}):`, serialized, error);
    return serialized;
  }
  return null;
};

/**
 * Initialize the extension background services (async part)
 */
async function initializeExtensionServices() {
  if (initialized) {
    console.log('[Initialize] Already initialized.');
    return true;
  }
  console.log('[Initialize] Starting...');
  try {
    console.log('[Initialize] Getting storage...');
    const settings = await chrome.storage.local.get(['autoCleanEnabled', 'autoCleanInterval']);
    console.log('[Initialize] Storage retrieved:', settings);

    if (settings.autoCleanEnabled) {
      const intervalMinutes = settings.autoCleanInterval || 60;
      console.log(`[Initialize] Setting alarm for ${intervalMinutes} minutes...`);
      await chrome.alarms.create('autoCleanEmails', { periodInMinutes: intervalMinutes });
      console.log(`[Initialize] Alarm set.`);
    }

    // Initialize analytics system
    console.log('[Initialize] Initializing analytics...');
    await emailAnalytics.initialize();

    // Initialize services concurrently
    const servicePromises = [];
    console.log('[Initialize] Checking Gmail config...');
    if (config.gmail.clientId) {
      console.log('[Initialize] Pushing Gmail init promise...');
      servicePromises.push(
        services.gmail.initialize(config.gmail.clientId)
          .then(() => console.log('✅ Gmail service initialized successfully'))
          .catch(err => {
            console.error('🛑 Error initializing Gmail service:', serializeError(err), err);
            // Optionally re-throw or handle differently if needed
            // throw err; // Re-throwing would stop Promise.all earlier
          })
      );
    } else {
      console.log('[Initialize] Gmail Client ID not configured.');
    }

    console.log('[Initialize] Checking Outlook config...');
    if (config.outlook.clientId) {
      console.log('[Initialize] Pushing Outlook init promise...');
      servicePromises.push(
        services.outlook.initialize(config.outlook.clientId)
          .then(() => console.log('✅ Outlook service initialized successfully'))
          .catch(err => {
             console.error('🛑 Error initializing Outlook service:', serializeError(err), err);
             // Optionally re-throw
             // throw err;
          })
      );
    } else {
        console.log('[Initialize] Outlook Client ID not configured.');
    }

    console.log(`[Initialize] Awaiting ${servicePromises.length} service promises...`);
    await Promise.all(servicePromises);
    console.log('[Initialize] All service promises settled.');

    initialized = true;
    initializationError = null;
    console.log('✅ Extension service initialization complete');
    return true;
  } catch (error) {
    // Log the raw error object before serialization
    console.error('🛑 [Initialize] Caught error object:', error);
    const serializedMsg = serializeError(error);
    console.error('🛑 Error initializing extension services (serialized):', serializedMsg);
    initialized = false;
    initializationError = serializedMsg; // Store the serialized version
    return false;
  }
}

/**
 * Handle messages asynchronously. Must be called from the synchronous wrapper.
 */
async function handleMessageAsync(request, sender, sendResponse) {
  console.log('Async handler processing message:', request.type);

  // Basic PING/WAKE_UP handled synchronously in the wrapper now
  // Internal ping is also handled synchronously

  // Ensure services are initialized for most actions
  if (!initialized && !['INITIALIZE', 'PING', 'WAKE_UP', 'INTERNAL_PING'].includes(request.type)) {
    const initSuccess = await initializeExtensionServices();
    if (!initSuccess) {
      sendResponse({ error: 'Extension services failed to initialize', details: initializationError });
      return;
    }
  }

  // --- Main Message Handling Logic ---
  try {
    console.log(`[handleMessageAsync] Processing type: ${request.type}`);
  switch (request.type) {
      case 'INITIALIZE':
        try {
          const result = await initializeExtensionServices();
          sendResponse({ success: result, error: initializationError });
        } catch (initError) {
          console.error('[INITIALIZE] Error:', initError);
          sendResponse({ success: false, error: serializeError(initError) });
        }
        break;

      case 'PANEL_OPENED':
        try {
          console.log('[PANEL_OPENED] Panel opened at:', request.location);
          // Log this event - could be useful for analytics
          await chrome.storage.local.set({ 
            'panel_opened_timestamp': Date.now(),
            'panel_location': request.location
          });
          // No need to wait for response
          sendResponse({ success: true });
        } catch (error) {
          console.error('[PANEL_OPENED] Error:', error);
          sendResponse({ success: false, error: serializeError(error) });
        }
        break;

      case 'OPEN_EMAIL_CLEANER':
        try {
          console.log('[OPEN_EMAIL_CLEANER] Request to open email cleaner from:', sender?.tab?.url || 'unknown');
          // This message is sent from background to content script, not the other way around
          // But we'll handle it here in case the content script sends it
          sendResponse({ success: true, message: 'Email cleaner open request acknowledged' });
        } catch (error) {
          console.error('[OPEN_EMAIL_CLEANER] Error:', error);
          sendResponse({ success: false, error: serializeError(error) });
        }
        break;

      case 'SELECT_SERVICE':
        try {
          if (request.service && ['gmail', 'outlook'].includes(request.service)) {
            selectedService = request.service;
            console.log(`[SELECT_SERVICE] Service selected: ${selectedService}`);
            sendResponse({ success: true, selectedService });
          } else {
            sendResponse({ error: 'Invalid service specified' });
          }
        } catch (selectError) {
            console.error('[SELECT_SERVICE] Error:', selectError);
            sendResponse({ success: false, error: serializeError(selectError) });
        }
        break;

      case 'AUTHENTICATE':
        try {
          if (!selectedService) return sendResponse({ error: 'No service selected' });
          console.log(`[AUTHENTICATE] Authenticating ${selectedService}`);
          const authResult = await services[selectedService].authenticate();
          sendResponse({ success: authResult });
        } catch (authError) {
          console.error('[AUTHENTICATE] Error:', authError);
          sendResponse({ success: false, error: serializeError(authError) });
        }
        break;

      case 'AUTHENTICATE_GMAIL_DIRECTLY':
        console.log('[AUTHENTICATE_GMAIL_DIRECTLY] Starting direct Gmail authentication');
        
        // Create a connection keepalive to prevent port closure
        const authKeepAliveInterval = setInterval(() => {
          console.log('[AUTHENTICATE_GMAIL_DIRECTLY] Keeping connection alive...');
        }, 1000);
        
        try {
          chrome.identity.getAuthToken({ interactive: true }, async (token) => {
            let responded = false;
            
            const error = logRuntimeError('Gmail direct auth');
            if (error || !token) {
              clearInterval(authKeepAliveInterval);
              console.error('[AUTHENTICATE_GMAIL_DIRECTLY] Failed to get auth token:', error);
              
              if (!responded) {
                responded = true;
                sendResponse({
                  success: false,
                  error: error || 'Failed to get Gmail authentication token'
                });
              }
              return;
            }
            
            try {
              console.log('[AUTHENTICATE_GMAIL_DIRECTLY] Got auth token:', token.substring(0, 5) + '...');
              
              // Store token for later use
              await chrome.storage.local.set({ 'gmail_token': token });
              
              // Set the token on the service
              services.gmail.accessToken = token;
              
              // Immediately send success response
              if (!responded) {
                responded = true;
                clearInterval(authKeepAliveInterval);
                
                console.log('[AUTHENTICATE_GMAIL_DIRECTLY] Authentication successful, sending response');
                sendResponse({ success: true });
              }
              
              // Try to initialize the service with this token, but don't wait for it before responding
              try {
                await services.gmail.initialize(config.gmail.clientId);
                console.log('[AUTHENTICATE_GMAIL_DIRECTLY] Gmail service initialized successfully');
              } catch (initError) {
                console.error('[AUTHENTICATE_GMAIL_DIRECTLY] Gmail service initialization failed:', initError);
                // We already responded, so we just log the error
              }
            } catch (e) {
              clearInterval(authKeepAliveInterval);
              console.error('[AUTHENTICATE_GMAIL_DIRECTLY] Error during authentication:', e);
              
              if (!responded) {
                responded = true;
                sendResponse({ 
                  success: false, 
                  error: 'Error during authentication: ' + serializeError(e)
                });
              }
            }
          });
          
          // Must return true for async response
          return true;
        } catch (e) {
          clearInterval(authKeepAliveInterval);
          console.error('[AUTHENTICATE_GMAIL_DIRECTLY] Caught exception:', e);
          sendResponse({
            success: false,
            error: 'Exception during authentication: ' + serializeError(e)
          });
          return false;
        }
        break;

      case 'CLEAN_EMAILS':
        console.log('[CLEAN_EMAILS] Received request to clean emails:', request);
        
        // Create a connection keepalive to prevent port closure
        const cleanupKeepAliveInterval = setInterval(() => {
          console.log('[CLEAN_EMAILS] Keeping connection alive...');
        }, 1000);
        
        let responded = false;
        
        try {
          if (!request.messageIds || !Array.isArray(request.messageIds) || request.messageIds.length === 0) {
            clearInterval(cleanupKeepAliveInterval);
            console.error('[CLEAN_EMAILS] No message IDs provided');
            return sendResponse({ 
              success: false, 
              error: 'No message IDs provided' 
            });
          }
          
          const service = request.service || selectedService;
          if (!service) {
            clearInterval(cleanupKeepAliveInterval);
            console.error('[CLEAN_EMAILS] No service specified or selected');
            return sendResponse({ 
              success: false, 
              error: 'No email service specified or selected' 
            });
          }
          
          console.log(`[CLEAN_EMAILS] Attempting to delete ${request.messageIds.length} emails from ${service}`);
          
          if (service === 'gmail') {
            console.log('[CLEAN_EMAILS] Processing Gmail deletion request');
            
            // Get the stored token first
            chrome.storage.local.get(['gmail_token'], async (result) => {
              try {
                const token = result.gmail_token;
                
                if (!token) {
                  clearInterval(cleanupKeepAliveInterval);
                  console.error('[CLEAN_EMAILS] No Gmail token found in storage');
                  
                  if (!responded) {
                    responded = true;
              return sendResponse({ 
                success: false, 
                      error: 'No authentication token found. Please try authenticating again.'
              });
            }
                  return;
                }
                
                console.log('[CLEAN_EMAILS] Found stored token, initializing Gmail client');
                
                // Set the access token
                services.gmail.accessToken = token;
            
                // Process messages in small batches for faster response
                const firstBatchSize = Math.min(10, request.messageIds.length);
                const firstBatch = request.messageIds.slice(0, firstBatchSize);
                const remainingBatch = request.messageIds.slice(firstBatchSize);
              
              try {
                  // First initialize the client if needed
                  if (!services.gmail.client || !services.gmail.initialized) {
                    await services.gmail.initialize(config.gmail.clientId);
                  }
                  
                  if (!services.gmail.client) {
                    clearInterval(cleanupKeepAliveInterval);
                    console.error('[CLEAN_EMAILS] Failed to initialize Gmail client');
                    
                    if (!responded) {
                      responded = true;
                      return sendResponse({
                        success: false, 
                        error: 'Failed to initialize Gmail client'
                      });
                  }
                    return;
                  }
                  
                  // Process first batch, then respond to user
                  await processMessageBatch(firstBatch);
                  
                  // Send success response for the first batch
                  if (!responded) {
                    responded = true;
                    clearInterval(cleanupKeepAliveInterval);
                    
                    console.log(`[CLEAN_EMAILS] First batch processed (${firstBatchSize} messages), sending response`);
                    sendResponse({ 
                      success: true, 
                      count: firstBatchSize,
                      message: remainingBatch.length > 0 ? 
                        `Deleted ${firstBatchSize} messages, continuing with remaining ${remainingBatch.length} in the background...` : 
                        `Successfully deleted ${firstBatchSize} messages`
                    });
                }
                  
                  // Process remaining messages in the background
                  if (remainingBatch.length > 0) {
                    processRemainingMessages(remainingBatch);
                  }
                } catch (initError) {
                  clearInterval(cleanupKeepAliveInterval);
                  console.error('[CLEAN_EMAILS] Gmail client error:', initError);
                  
                  if (!responded) {
                    responded = true;
              return sendResponse({ 
                      success: false,
                      error: 'Error initializing Gmail client: ' + serializeError(initError)
                    });
                  }
                }
              } catch (error) {
                clearInterval(cleanupKeepAliveInterval);
                console.error('[CLEAN_EMAILS] Error in Gmail deletion:', error);
                
                if (!responded) {
                  responded = true;
              return sendResponse({ 
                success: false, 
                    error: `Error deleting emails: ${serializeError(error)}`
                  });
                }
              }
            });
            
            // Helper function to process a batch of messages
            async function processMessageBatch(messageBatch) {
              if (messageBatch.length === 0) return { success: true, count: 0 };
              
              if (messageBatch.length === 1) {
                // For a single message, use trash endpoint
                await services.gmail.client.users.messages.trash({
                  userId: 'me',
                  id: messageBatch[0]
                });
                return { success: true, count: 1 };
              } else {
                // For multiple messages, use batchModify
                await services.gmail.client.users.messages.batchModify({
                  userId: 'me',
                  requestBody: {
                    ids: messageBatch,
                    addLabelIds: ['TRASH']
                  }
                });
                return { success: true, count: messageBatch.length };
              }
            }
            
            // Helper function to process remaining messages in background
            async function processRemainingMessages(remaining) {
              try {
                console.log(`[CLEAN_EMAILS] Processing remaining ${remaining.length} messages in the background`);
                
                // Process in batches of 50
                const batchSize = 50;
                let successCount = 0;
                let errorCount = 0;
                
                for (let i = 0; i < remaining.length; i += batchSize) {
                  const batch = remaining.slice(i, i + batchSize);
                  
                  try {
                    await processMessageBatch(batch);
                    successCount += batch.length;
                    console.log(`[CLEAN_EMAILS] Background batch ${Math.floor(i/batchSize) + 1} complete, ${successCount}/${remaining.length} processed`);
                  } catch (batchError) {
                    errorCount += batch.length;
                    console.error(`[CLEAN_EMAILS] Error in background batch:`, batchError);
                  }
                  
                  // Small delay between batches
                  if (i + batchSize < remaining.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                  }
                }
                
                console.log(`[CLEAN_EMAILS] Background processing complete. Success: ${successCount}, Failed: ${errorCount}`);
              } catch (error) {
                console.error('[CLEAN_EMAILS] Error processing background messages:', error);
            }
            }
            
            // Required for async sendResponse
            return true;
          } 
          else if (service === 'outlook') {
            // Ensure we have an authenticated Outlook client
            const outlookClient = await services.outlook.initialize(config.outlook.clientId);
            if (!outlookClient) {
              console.error('[CLEAN_EMAILS] Outlook client not available');
              return sendResponse({ 
                success: false, 
                error: 'Outlook client not available. Please authenticate first.' 
              });
            }
            
            // Outlook implementation similar to Gmail
            const batchSize = 20;
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < request.messageIds.length; i += batchSize) {
              const batch = request.messageIds.slice(i, i + batchSize);
              console.log(`[CLEAN_EMAILS] Processing Outlook batch ${i/batchSize + 1}/${Math.ceil(request.messageIds.length/batchSize)}`);
              
              try {
                const results = await Promise.allSettled(batch.map(async (messageId) => {
                  try {
                    await outlookClient.api(`/me/messages/${messageId}/move`).post({
                      destinationId: 'deleteditems'
                    });
                    return { success: true, messageId };
                  } catch (error) {
                    console.error(`[CLEAN_EMAILS] Error moving Outlook message ${messageId}:`, error);
                    return { success: false, messageId, error };
                  }
                }));
                
                results.forEach(result => {
                  if (result.status === 'fulfilled' && result.value.success) {
                    successCount++;
                  } else {
                    errorCount++;
                  }
                });
                
                if (i + batchSize < request.messageIds.length) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              } catch (batchError) {
                console.error(`[CLEAN_EMAILS] Error processing Outlook batch:`, batchError);
                errorCount += batch.length;
              }
            }
            
            console.log(`[CLEAN_EMAILS] Completed Outlook deletion. Success: ${successCount}, Failed: ${errorCount}`);
            
            if (successCount > 0) {
              return sendResponse({ 
                success: true, 
                count: successCount,
                failed: errorCount,
                partial: errorCount > 0,
                message: errorCount > 0 ? 
                  `Moved ${successCount} emails to Deleted Items, but ${errorCount} failed` : 
                  `Successfully moved ${successCount} emails to Deleted Items`
              });
            } else {
              return sendResponse({ 
                success: false, 
                error: `Failed to delete any emails. Please try again later.` 
              });
            }
          } 
          else {
            return sendResponse({ 
              success: false, 
              error: `Unsupported service: ${service}` 
            });
          }
        } catch (error) {
          console.error('[CLEAN_EMAILS] Exception:', error);
          return sendResponse({ 
            success: false, 
            error: `Exception cleaning emails: ${error.message || 'Unknown error'}`
          });
        }
        
        // Ensure async handling
        return true;

      // --- Simplified Status/Info Handlers (Assumed Safe/Sync for Wrapper) ---
      case 'GET_STATUS':
        try {
          console.log('[GET_STATUS] Responding');
          sendResponse({ status: 'ok', initialized, lastError: initializationError });
        } catch (statusError) {
           console.error('[GET_STATUS] Error:', statusError);
           sendResponse({ status: 'error', error: serializeError(statusError) });
        }
        break;
      case 'GET_SERVICES':
        try {
          console.log('[GET_SERVICES] Responding');
          sendResponse({ status: 'ok', services: { gmail: !!services.gmail, outlook: !!services.outlook } });
        } catch (serviceError) {
           console.error('[GET_SERVICES] Error:', serviceError);
           sendResponse({ status: 'error', error: serializeError(serviceError) });
        }
        break;
      // ... other simple cases like GET_AUTH_STATUS, FETCH_EMAILS (placeholder), DELETE_EMAIL (placeholder), OPEN_POPUP

      case 'OPEN_POPUP':
        console.log('Attempting to open popup from background script');
        
        // Try using chrome.action.openPopup() if available (Chrome 92+)
        if (chrome.action && chrome.action.openPopup) {
          try {
            chrome.action.openPopup();
            console.log('Opened popup via chrome.action.openPopup()');
            sendResponse({ success: true });
          } catch (error) {
            console.error('Failed to open popup via chrome.action.openPopup():', error);
            sendResponse({ success: false, error: error.message });
          }
        } 
        // Try using chrome.browserAction for older Chrome versions
        else if (chrome.browserAction && chrome.browserAction.openPopup) {
          try {
            chrome.browserAction.openPopup();
            console.log('Opened popup via chrome.browserAction.openPopup()');
            sendResponse({ success: true });
          } catch (error) {
            console.error('Failed to open popup via chrome.browserAction.openPopup():', error);
            sendResponse({ success: false, error: error.message });
          }
        }
        // If neither API is available
        else {
          console.log('openPopup API not available on this browser');
          sendResponse({ success: false, reason: 'API_NOT_AVAILABLE' });
        }
        
        // Required for async sendResponse
        return true;

      // --- Authentication Flows (Require Async Handling) ---
      case 'GMAIL_AUTH':
        console.log('[GMAIL_AUTH] Starting');
      chrome.identity.getAuthToken({ interactive: true }, token => {
          const error = logRuntimeError('Gmail auth');
          if (error) console.error('[GMAIL_AUTH] Error:', error);
          sendResponse(error ? { status: "error", error } : { status: "ok", token });
        });
        return true; // Indicate async response

      case 'OUTLOOK_AUTH':
        console.log('[OUTLOOK_AUTH] Starting');
        const redirectURL = chrome.identity.getRedirectURL();
        const clientId = config.outlook.clientId;
        if (!clientId) {
             console.error('[OUTLOOK_AUTH] Missing Client ID');
             return sendResponse({ status: "error", error: "Outlook Client ID not configured" });
        }
        const authURL = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectURL)}&scope=${encodeURIComponent(MICROSOFT_SCOPES.join(' '))}`;
        chrome.identity.launchWebAuthFlow({ url: authURL, interactive: true }, responseUrl => {
          const error = logRuntimeError('Outlook auth');
          if (error || !responseUrl) {
              console.error('[OUTLOOK_AUTH] Auth flow error:', error);
              return sendResponse({ status: "error", error: error || 'Auth flow cancelled or failed' });
          }
          const url = new URL(responseUrl);
          const params = new URLSearchParams(url.hash.substring(1));
          const token = params.get('access_token');
          if (!token) {
              console.error('[OUTLOOK_AUTH] Failed to get token');
              return sendResponse({ status: "error", error: 'Failed to get access token' });
          }
          sendResponse(token ? { status: "ok", token } : { status: "error", error: 'Failed to get access token' });
        });
        return true; // Indicate async response

      case 'AUTH_AND_FETCH_GMAIL':
        console.log('[AUTH_AND_FETCH_GMAIL] Starting');
        chrome.identity.getAuthToken({ interactive: true }, async token => {
          const error = logRuntimeError('Gmail fetch token');
          if (error || !token) {
            console.error('[AUTH_AND_FETCH_GMAIL] Token error:', error);
            return sendResponse({ status: "error", error: error || 'Failed to get Gmail token' });
          }
          try {
            console.log('[AUTH_AND_FETCH_GMAIL] Token acquired, initializing service...');
            await services.gmail.initialize(config.gmail.clientId); // Ensure initialized with ID
            services.gmail.accessToken = token;
            console.log('[AUTH_AND_FETCH_GMAIL] Fetching threads (excluding sent folder)...');
            // Fetch threads excluding sent emails
            const threads = await services.gmail.fetchThreadsByQuery('-in:sent');
            console.log(`[AUTH_AND_FETCH_GMAIL] Fetched ${threads?.length || 0} threads`);
            
            // Instead of processing threads for analytics incrementally, we'll just return them
            // This prevents double-counting emails each time the Emails tab is opened
            sendResponse({ status: "ok", threads });
          } catch (err) {
            console.error("[AUTH_AND_FETCH_GMAIL] Error fetching Gmail emails:", err);
            sendResponse({ status: "error", error: serializeError(err) });
          }
        });
        return true;
        
      case 'AUTH_AND_FETCH_OUTLOOK':
        console.log('[AUTH_AND_FETCH_OUTLOOK] Starting');
        const outlookRedirectURL = chrome.identity.getRedirectURL();
        const outlookClientId = config.outlook.clientId;
        if (!outlookClientId) {
            console.error('[AUTH_AND_FETCH_OUTLOOK] Missing Client ID');
            return sendResponse({ status: "error", error: "Outlook Client ID not configured" });
        }
        const outlookAuthURL = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${outlookClientId}&response_type=token&redirect_uri=${encodeURIComponent(outlookRedirectURL)}&scope=${encodeURIComponent(MICROSOFT_SCOPES.join(' '))}`;
        chrome.identity.launchWebAuthFlow({ url: outlookAuthURL, interactive: true }, async responseUrl => {
            const error = logRuntimeError('Outlook fetch token');
            if (error || !responseUrl) {
                console.error('[AUTH_AND_FETCH_OUTLOOK] Auth flow error:', error);
                return sendResponse({ status: "error", error: error || 'Outlook auth flow cancelled or failed' });
            }
            const url = new URL(responseUrl);
            const params = new URLSearchParams(url.hash.substring(1));
            const token = params.get('access_token');
            if (!token) {
                console.error('[AUTH_AND_FETCH_OUTLOOK] Failed to get token');
                return sendResponse({ status: "error", error: 'Failed to get Outlook access token' });
            }
            try {
                console.log('[AUTH_AND_FETCH_OUTLOOK] Token acquired, initializing service...');
                await services.outlook.initialize(config.outlook.clientId); // Ensure initialized with ID
                services.outlook.accessToken = token;
                console.log('[AUTH_AND_FETCH_OUTLOOK] Fetching emails...');
                const emails = await services.outlook.listEmails(request.query || '');
                console.log(`[AUTH_AND_FETCH_OUTLOOK] Fetched ${emails?.length || 0} emails`);
                const threads = emails.map(email => ({ id: email.id, snippet: email.bodyPreview || '', messages: [email], sender: email.sender?.emailAddress?.address || 'unknown' }));
                sendResponse({ status: "ok", threads });
            } catch (err) {
                console.error("Error fetching Outlook emails:", err);
                sendResponse({ status: "error", error: serializeError(err) });
            }
        });
        return true; // Indicate async response

    case 'DELETE_SENDERS':
        console.log('[DELETE_SENDERS] Starting');
      const { senders, provider } = request;
      chrome.storage.local.get(['emailThreads', 'tokens'], async (result) => {
          const error = logRuntimeError('Delete Senders - Get storage');
          if (error) {
              console.error('[DELETE_SENDERS] Storage error:', error);
              return sendResponse({ status: "error", error });
          }
        const { emailThreads, tokens } = result;
        if (!emailThreads || !tokens) {
              console.error('[DELETE_SENDERS] Missing data in storage');
              return sendResponse({ status: "error", error: 'No email data found in storage' });
          }
          try {
            const threadsToDelete = emailThreads.filter(thread => senders.includes(thread.messages?.[0]?.payload?.headers?.find(h => h.name === "From")?.value));
            const messageIds = threadsToDelete.flatMap(t => t.messages.map(m => m.id));
            if (messageIds.length === 0) {
                console.log('[DELETE_SENDERS] No matching messages');
                return sendResponse({ status: "ok", message: "No matching messages found to delete" });
            }
            console.log(`[DELETE_SENDERS] Deleting ${messageIds.length} messages for ${provider}`);
            if (provider === 'gmail' && tokens.gmail) {
              await services.gmail.initialize(config.gmail.clientId); // Ensure initialized with ID
              services.gmail.accessToken = tokens.gmail;
              await services.gmail.deleteMessages(messageIds);
            } else if (provider === 'outlook' && tokens.outlook) {
              await deleteOutlookMessagesUtil(tokens.outlook, messageIds);
            } else {
              throw new Error(`Invalid provider or missing token for ${provider}`);
            }
            sendResponse({ status: "ok", count: messageIds.length });
          } catch (delError) {
            console.error('Error deleting messages:', delError);
            sendResponse({ status: "error", error: serializeError(delError) });
          }
        });
        return true; // Indicate async response

      case 'TOGGLE_AUTO_CLEAN':
        console.log(`[TOGGLE_AUTO_CLEAN] Setting to ${request.enabled}`);
        const alarmName = 'weeklyAutoClean';
        try {
          if (request.enabled) {
            await chrome.alarms.create(alarmName, { periodInMinutes: 7 * 24 * 60 });
            console.log('Auto-clean alarm created');
          } else {
            await chrome.alarms.clear(alarmName);
            console.log('Auto-clean alarm cleared');
          }
          await chrome.storage.local.set({ autoCleanEnabled: !!request.enabled }); // Store state
          sendResponse({ status: "ok" });
        } catch(alarmError) {
            console.error('Error managing alarm:', alarmError);
            sendResponse({ status: "error", error: serializeError(alarmError) });
        }
        break; // Async handling within try/catch, but response is sent sync

      case 'GET_SUBSCRIPTIONS':
        console.log('[GET_SUBSCRIPTIONS] Fetching subscription data', request.includeEmails ? 'with email details' : 'without email details');
        try {
          // Initialize analytics if not already done
          if (!emailAnalytics.senderStats || Object.keys(emailAnalytics.senderStats).length === 0) {
            await emailAnalytics.initialize();
          }
          
          // Get subscriptions (rarely opened emails)
          const subscriptions = emailAnalytics.getRarelyOpenedSubscriptions();
          console.log(`[GET_SUBSCRIPTIONS] Found ${subscriptions.length} subscriptions`);
          
          // If detailed emails are requested, fetch thread information for each subscription
          if (request.includeEmails && subscriptions.length > 0) {
            try {
              console.log('[GET_SUBSCRIPTIONS] Fetching detailed email information');
              
              // Authenticate to get email data
              let token = null;
              try {
                // Try to get token from storage first
                const result = await chrome.storage.local.get(['gmail_token']);
                token = result.gmail_token;
                
                if (!token) {
                  // If no stored token, try to get a new one
                  token = await new Promise((resolve, reject) => {
                    chrome.identity.getAuthToken({ interactive: false }, (authToken) => {
                      if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                      }
                      resolve(authToken);
                    });
                  });
                }
              } catch (authError) {
                console.error('[GET_SUBSCRIPTIONS] Auth error:', authError);
                // Continue with limited data if auth fails
              }
              
              if (token) {
                // Initialize Gmail service if needed
                services.gmail.accessToken = token;
                if (!services.gmail.client || !services.gmail.initialized) {
                  await services.gmail.initialize(config.gmail.clientId);
                }
                
                // Fetch a limited number of threads for each subscription, up to 50 total
                const maxThreadsPerSender = 10;
                const totalThreadsLimit = 50;
                let threadsAdded = 0;
                
                for (const subscription of subscriptions) {
                  if (threadsAdded >= totalThreadsLimit) break;
                  
                  try {
                    // Search for emails from this sender
                    const query = `from:${subscription.email}`;
                    const threads = await services.gmail.fetchThreadsByQuery(query, maxThreadsPerSender);
                    
                    if (threads && threads.length > 0) {
                      // Add the thread data to the subscription object
                      subscription.emails = threads;
                      threadsAdded += threads.length;
                    }
                  } catch (e) {
                    console.error(`[GET_SUBSCRIPTIONS] Error fetching threads for ${subscription.email}:`, e);
                    // Continue with next subscription
                  }
                }
                
                console.log(`[GET_SUBSCRIPTIONS] Added email details to ${threadsAdded} threads`);
              } else {
                console.warn('[GET_SUBSCRIPTIONS] No auth token available for detailed email info');
              }
            } catch (fetchError) {
              console.error('[GET_SUBSCRIPTIONS] Error fetching email details:', fetchError);
              // Continue with limited subscription data
            }
          }
          
          sendResponse({
            success: true,
            subscriptions: subscriptions
          });
        } catch (error) {
          console.error('[GET_SUBSCRIPTIONS] Error:', error);
          sendResponse({
            success: false,
            error: 'Error getting subscriptions: ' + serializeError(error)
          });
        }
        // Required for async sendResponse
        return true;
        
      case 'GET_EMAIL_ANALYTICS':
        console.log('[GET_EMAIL_ANALYTICS] Fetching analytics data');
        try {
          // Initialize analytics if not already done
          if (!emailAnalytics.senderStats || Object.keys(emailAnalytics.senderStats).length === 0) {
            await emailAnalytics.initialize();
          }
          
          // Compute analytics data
          const topSenders = emailAnalytics.getTopSenders(10);
          const regularCompanies = emailAnalytics.getRegularCompanyEmails(3, 30);
          
          // Get actual inbox count if possible
          let totalEmails = 0;
          try {
            // If Gmail service is already authenticated, get actual inbox count
            if (services.gmail && services.gmail.accessToken) {
              const response = await services.gmail.client.users.threads.list({
                userId: 'me',
                maxResults: 1,  // We only need the total, not actual threads
                q: '-in:sent' // Exclude emails from sent folder
              });
              if (response && response.data && response.data.resultSizeEstimate !== undefined) {
                totalEmails = response.data.resultSizeEstimate;
                console.log(`[GET_EMAIL_ANALYTICS] Got actual inbox count (excluding sent): ${totalEmails}`);
              }
            }
          } catch (countError) {
            console.error('[GET_EMAIL_ANALYTICS] Error getting actual inbox count:', countError);
            // Fall back to analytics count
            totalEmails = emailAnalytics.getTotalEmailCount();
          }
          
          // Calculate other statistics
          const senderStats = Object.values(emailAnalytics.senderStats);
          const totalSenders = senderStats.length;
          const newsletters = senderStats.filter(s => s.categoryGuess === 'newsletter').length;
          const shopping = senderStats.filter(s => s.categoryGuess === 'shopping').length;
          
          console.log(`[GET_EMAIL_ANALYTICS] Prepared analytics data`);
          
          sendResponse({
            success: true,
            analytics: {
              topSenders: topSenders,
              regularCompanies: regularCompanies,
              stats: {
                totalSenders: totalSenders,
                totalEmails: totalEmails,
                newsletters: newsletters,
                shopping: shopping
              }
            }
          });
        } catch (error) {
          console.error('[GET_EMAIL_ANALYTICS] Error:', error);
          sendResponse({
            success: false,
            error: 'Error getting analytics: ' + serializeError(error)
          });
        }
        // Required for async sendResponse
        return true;
        
      case 'SCAN_EMAILS':
        console.log('[SCAN_EMAILS] Starting scan of user emails');
        
        try {
          // Get auth token for Gmail API
          chrome.identity.getAuthToken({ interactive: true }, async token => {
            if (chrome.runtime.lastError || !token) {
              console.error('[SCAN_EMAILS] Auth token error:', chrome.runtime.lastError);
              sendResponse({
                success: false,
                error: 'Failed to authenticate: ' + (chrome.runtime.lastError?.message || 'No token')
              });
              return;
            }
            
            try {
              // Initialize Gmail service
              await services.gmail.initialize(config.gmail.clientId);
              services.gmail.accessToken = token;
              
              // Fetch threads, excluding sent emails
              console.log('[SCAN_EMAILS] Fetching threads (excluding sent folder)...');
              const threads = await services.gmail.fetchThreadsByQuery('-in:sent', 1000); // Get up to 1000 threads, excluding sent
              
              if (!threads || threads.length === 0) {
                console.warn('[SCAN_EMAILS] No threads found');
                sendResponse({
                  success: true,
                  count: 0,
                  message: 'No emails found to scan'
                });
                return;
              }
              
              // Process threads for analytics with resetCounts=true to avoid double counting
              console.log(`[SCAN_EMAILS] Processing ${threads.length} threads...`);
              const updatedCount = emailAnalytics.processThreads(threads, {}, true);
              
              // Send response
              sendResponse({
                success: true,
                count: updatedCount,
                message: `Scanned ${updatedCount} emails successfully`
              });
            } catch (error) {
              console.error('[SCAN_EMAILS] Error:', error);
              sendResponse({
                success: false,
                error: 'Error scanning emails: ' + serializeError(error)
              });
            }
          });
          
          // Required for async sendResponse
          return true;
        } catch (error) {
          console.error('[SCAN_EMAILS] Top-level error:', error);
          sendResponse({
            success: false,
            error: 'Error initiating scan: ' + serializeError(error)
          });
        }
        break;
        
      case 'GET_SETTINGS':
        console.log('[GET_SETTINGS] Fetching settings');
        try {
          // Make sure to add GET_SETTINGS to the requiresAsync array in handleMessageWrapper
          // This ensures Chrome knows the response will be async
          chrome.storage.local.get(['autoCleanEnabled', 'autoCleanInterval'], result => {
            try {
              console.log('[GET_SETTINGS] Retrieved settings:', result);
              // Always use success flag for consistent response structure
              sendResponse({
                success: true,
                settings: {
                  autoCleanEnabled: result.autoCleanEnabled || false,
                  autoCleanInterval: result.autoCleanInterval || 7 // Default to weekly
                }
              });
            } catch (responseError) {
              console.error('[GET_SETTINGS] Error preparing response:', responseError);
              sendResponse({
                success: false,
                error: serializeError(responseError)
              });
            }
          });
          
          // This is crucial - tell Chrome we'll respond asynchronously
          return true;
        } catch (error) {
          console.error('[GET_SETTINGS] Error:', error);
          sendResponse({
            success: false,
            error: serializeError(error)
          });
          return false; // synchronous response in case of error
        }
        break;
        
      case 'SAVE_SETTINGS':
        console.log('[SAVE_SETTINGS] Saving settings:', request.settings);
        try {
          if (!request.settings) {
            sendResponse({
              success: false,
              error: 'No settings provided'
            });
            return;
          }
          
          const settings = {
            autoCleanEnabled: !!request.settings.autoCleanEnabled,
            autoCleanInterval: parseInt(request.settings.autoCleanInterval) || 7
          };
          
          // Update alarm if auto-clean is enabled
          if (settings.autoCleanEnabled) {
            try {
              await chrome.alarms.create('autoCleanEmails', { 
                periodInMinutes: settings.autoCleanInterval * 24 * 60 // Convert days to minutes
              });
              console.log(`[SAVE_SETTINGS] Alarm set for ${settings.autoCleanInterval} days`);
            } catch (alarmError) {
              console.error('[SAVE_SETTINGS] Error setting alarm:', alarmError);
              // Continue anyway - storage is more important than the alarm
            }
          } else {
            try {
              await chrome.alarms.clear('autoCleanEmails');
              console.log('[SAVE_SETTINGS] Alarm cleared');
            } catch (alarmError) {
              console.error('[SAVE_SETTINGS] Error clearing alarm:', alarmError);
              // Continue anyway - storage is more important than the alarm
            }
          }
          
          // Save settings to storage
          try {
            await chrome.storage.local.set(settings);
            
            sendResponse({
              success: true,
              message: 'Settings saved successfully'
            });
          } catch (storageError) {
            console.error('[SAVE_SETTINGS] Error saving to storage:', storageError);
            sendResponse({
              success: false,
              error: serializeError(storageError)
            });
          }
        } catch (error) {
          console.error('[SAVE_SETTINGS] Error:', error);
          sendResponse({
            success: false,
            error: serializeError(error)
          });
        }
        // Required for async sendResponse
        return true;

      default:
        console.warn('Unknown message type received:', request.type);
        sendResponse({ status: 'error', error: `Unknown message type: ${request.type}` });
    }
  } catch (error) {
    // Catch errors from the main switch statement structure itself
    const errorMessage = serializeError(error);
    console.error(`[handleMessageAsync] Top-level error for type ${request.type}:`, errorMessage, error);
    // Ensure response is sent even if the switch logic fails
    try {
        sendResponse({ status: 'error', error: `Internal error processing ${request.type}: ${errorMessage}` });
    } catch(e) {
        console.error("Failed to send error response:", e);
    }
  }
}

/**
 * Synchronous message listener wrapper.
 * Handles basic/fast messages directly and determines if async handling is needed.
 */
function handleMessageWrapper(request, sender, sendResponse) {
  console.log(`SYNC Listener received: ${request?.type} from ${sender?.origin || sender?.id}`);

  // --- Handle immediate/synchronous responses --- 
  if (request.type === 'PING' || request.type === 'WAKE_UP') {
    sendResponse({
      status: "ok",
      initialized: initialized,
      timestamp: new Date().toISOString(),
      message: `Acknowledged ${request.type}`
    });
    return false; // Indicate synchronous response
  }

  if (request.type === 'INTERNAL_PING') {
    sendResponse({ alive: true, timestamp: new Date().toISOString() });
    return false; // Indicate synchronous response
  }

  // --- Determine if async handling is required --- 
  const requiresAsync = [
    'INITIALIZE',
    'AUTHENTICATE',
    'CLEAN_EMAILS',
    'GMAIL_AUTH',
    'OUTLOOK_AUTH',
    'AUTH_AND_FETCH_GMAIL',
    'AUTH_AND_FETCH_OUTLOOK',
    'DELETE_SENDERS',
    'OPEN_POPUP',
    'PANEL_OPENED',
    'OPEN_EMAIL_CLEANER',
    'GET_SETTINGS',
    'SAVE_SETTINGS',
    'GET_SUBSCRIPTIONS',
    'GET_EMAIL_ANALYTICS',
    'SCAN_EMAILS'
    // TOGGLE_AUTO_CLEAN uses async internally but sends response synchronously
  ].includes(request.type);

  // If requires async, call the async handler and return true
  if (requiresAsync) {
    console.log(`Passing ${request.type} to async handler`);
    handleMessageAsync(request, sender, sendResponse);
    return true;
  } else {
    // If not explicitly async, try handling here or pass to async *without* returning true
    console.log(`Handling ${request.type} potentially synchronously`);
    // We pass non-async cases to the async handler too, but tell Chrome
    // the response will be synchronous (by returning false/undefined).
    // The async handler MUST send a response for these cases.
    handleMessageAsync(request, sender, sendResponse);
    return false; 
  }
}

/**
 * Sets up the message listener, ensuring it's only added once.
 */
function setupMessageListener() {
  console.log('Attempting to set up message listener...');
  try {
    if (messageListenerFunction) {
      if (chrome.runtime.onMessage.hasListener(messageListenerFunction)) {
        console.log('Listener already exists. Removing old one.');
        try {
            chrome.runtime.onMessage.removeListener(messageListenerFunction);
        } catch(e) { console.error('Error removing existing listener:', e); }
      } else {
          console.log('Listener function existed but was not attached. Proceeding to add.');
      }
    }
    
    messageListenerFunction = (request, sender, sendResponse) => {
      // Wrap the core handler in a try/catch to prevent listener crashes
      try {
        // handleMessageWrapper returns true if the response is async
        return handleMessageWrapper(request, sender, sendResponse);
      } catch (e) {
        console.error("FATAL: Uncaught error in handleMessageWrapper:", e);
        // Try to send an error response if possible
        try {
          sendResponse({ status: 'error', error: 'Internal background script error: ' + serializeError(e) });
        } catch (sendErr) {
          console.error("Failed to send error response from wrapper catch:", sendErr);
        }
        // Return false as we are not handling asynchronously anymore
        return false;
      }
    };

    chrome.runtime.onMessage.addListener(messageListenerFunction);
    console.log('Message listener successfully added.');
  } catch (e) {
    console.error("FATAL: Failed to add message listener:", e);
    initializationError = "Failed to setup message listener: " + serializeError(e);
  }
}

/**
 * Keep-alive ping function.
 */
function keepAlive() {
  try {
    // First check if context is valid before trying to send a message
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({ type: 'INTERNAL_PING' }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.warn('Self-ping failed, context likely invalid. Re-setting listener.', error);
          // If ping fails, the context might be bad, try resetting the listener
          setupMessageListener(); 
        }
      });
    } else {
      console.warn('Chrome runtime context is invalid, attempting to re-initialize listeners');
      // Try to re-initialize everything
      setupMessageListener();
      initializeExtensionServices().catch(err => 
        console.error('Failed to re-initialize extension services:', err)
      );
    }
  } catch (e) {
    console.error('Error during self-ping:', e);
    // Try to recover by re-initializing
    setTimeout(() => {
      console.log('Attempting recovery after ping error...');
      setupMessageListener();
    }, 1000);
  }
}

// --- Script Execution Start --- 

// **0. Global Error Handler (Attempt)**
// Note: This might not catch all SW errors, but it's worth trying
self.addEventListener('error', event => {
  console.error('🛑 Uncaught Global Error in Service Worker:', event.error || event.message);
});
self.addEventListener('unhandledrejection', event => {
  console.error('🛑 Unhandled Promise Rejection in Service Worker:', event.reason);
});

// Force console to show our logs by calling console.log outside of any function
console.log("🔶 TOP-LEVEL EXECUTION", new Date().toISOString());

// **1. Setup Listener Immediately**
setupMessageListener(); 

// **2. Start Async Initialization**
// Don't await here, let it run in the background
initializeExtensionServices().catch(initErr => {
  console.error("🛑 Top-level initialization failed:", initErr);
  initializationError = serializeError(initErr);
  initialized = false; // Ensure status reflects failure
});

// **3. Start Keep-Alive**
if (keepAliveIntervalId) clearInterval(keepAliveIntervalId);
keepAliveIntervalId = setInterval(keepAlive, PING_INTERVAL);
console.log(`Keep-alive ping started (interval: ${PING_INTERVAL}ms).`);

// --- Chrome Event Listeners ---

chrome.runtime.onInstalled.addListener((details) => {
  try {
    console.log(`🔧 [Test] onInstalled fired (${details.reason}) at`, new Date().toISOString());
    console.log(`Extension ${details.reason} event at`, new Date().toISOString());
    setupMessageListener(); // Ensure listener is attached on install/update
    initializeExtensionServices();
  } catch (e) {
    console.error("🛑 Error in onInstalled listener:", e);
  }
});

// Add back the listener for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
  try {
    // Ensure we have a valid tab ID
    if (tab.id) {
      // Check if the current tab is Gmail or Outlook
      const isGmailOrOutlook = tab.url && (
        tab.url.includes('mail.google.com') || 
        tab.url.includes('outlook.office.com')
      );
      
      if (isGmailOrOutlook) {
        console.log("🔔 Extension icon clicked on Gmail/Outlook — attempting to call openEmailCleaner");
        
        // Check if content script is loaded and inject if needed
        ensureContentScriptLoaded(tab.id, () => {
          // After ensuring content script is loaded, send the message
          chrome.tabs.sendMessage(tab.id, { type: "OPEN_EMAIL_CLEANER" }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Error calling openEmailCleaner via message:', chrome.runtime.lastError);
              // Try sending a manual instructions message (also might fail, but worth trying)
              chrome.tabs.sendMessage(tab.id, { type: "SHOW_MANUAL_INSTRUCTIONS" }, () => {
                // Ignore any errors here
              });
            } else {
              console.log('Successfully requested openEmailCleaner:', response);
            }
          });
        });
      } else {
        // Not on Gmail or Outlook - redirect to Gmail
        console.log("Extension icon clicked on non-email page. Redirecting to Gmail...");
        chrome.tabs.update(tab.id, { url: "https://mail.google.com" });
      }
    } else {
      console.error('Could not get active tab ID.');
    }
  } catch (e) {
    console.error("🛑 Error in onClicked handler:", e);
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  try {
    if (namespace === 'local' && changes.popup_wake_background) {
      console.log('Background woken by storage change');
      setupMessageListener(); // Ensure listener is ready
    }
  } catch (e) {
    console.error("🛑 Error in onChanged listener:", e);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    console.log(`Alarm "${alarm.name}" triggered`);
    if (alarm.name === 'autoCleanEmails' || alarm.name === 'weeklyAutoClean') {
      console.log('Auto-clean alarm triggered - starting process');
      // TODO: Implement actual auto-cleaning logic
      // Ensure services are ready before cleaning
      if (!initialized) {
         console.log('[onAlarm] Initializing services before auto-clean...');
         await initializeExtensionServices();
      }
      if (initialized) {
          // Call cleaning function for the configured service (need to store which service)
          console.warn("Auto-cleaning logic not implemented yet!");
      } else {
          console.error('[onAlarm] Services not initialized, cannot auto-clean.');
      }
    }
  } catch (e) {
    console.error("🛑 Error in onAlarm listener:", e);
  }
});

chrome.runtime.onStartup.addListener(() => {
  try {
    console.log('Browser startup detected');
    setupMessageListener(); // Ensure listener is attached
    initializeExtensionServices();
  } catch (e) {
    console.error("🛑 Error in onStartup listener:", e);
  }
});

console.log("Background script initial execution completed.");

// Listen for port connections from content scripts
chrome.runtime.onConnect.addListener(port => {
  try {
    console.log('Port connected:', port.name);
    
    if (port.name === 'gmail_deletion') {
      // Handle Gmail deletion operation via port
      handleGmailDeletionPort(port);
    } else if (port.name === 'popup') {
      // Existing popup port handling
      console.log('Popup port connected');
      port.onMessage.addListener(async request => {
        const correlationId = request.correlationId;
        try {
          if (request.type === 'PING') {
            // Simple ping response
            port.postMessage({ correlationId, status: 'ok', initialized, error: initializationError, timestamp: new Date().toISOString() });
          } else {
            // Delegate to existing async handler
            // Use a promise wrapper to ensure sendResponse is called even on error
            await new Promise(resolve => {
                handleMessageAsync(request, port.sender, response => {
                    try {
                        port.postMessage({ correlationId, ...response });
                    } catch (e) {
                        console.error("Error posting message back to port:", e);
                        // Attempt to post error back if possible
                        try { port.postMessage({ correlationId, status: 'error', error: serializeError(e) }); } catch {} 
                    }
                    resolve(); // Resolve the promise once response is sent
                });
            });
          }
        } catch (e) {
          console.error('🛑 Error handling port message:', e);
          // Attempt to post error back if possible
          try { port.postMessage({ correlationId, status: 'error', error: serializeError(e) }); } catch {}
        }
      });
    }
    
      port.onDisconnect.addListener(() => {
         try {
        console.log('Port disconnected:', port.name);
            if (chrome.runtime.lastError) {
              console.error('Port disconnected with error:', chrome.runtime.lastError.message);
            }
          } catch (e) {
            console.error("🛑 Error in port.onDisconnect listener:", e);
          }
      });
  } catch (e) {
    console.error("🛑 Error setting up port connection:", e);
  }
});

/**
 * Handler for Gmail deletion port operations.
 * Uses a long-lived connection for better reliability.
 */
function handleGmailDeletionPort(port) {
  console.log(`[Gmail Port ${port.sender?.tab?.id}] Connection established.`);
  let operationActive = false;

  port.onMessage.addListener(async (request) => {
    // Prevent handling new messages if an operation is already running on this port
    if (operationActive) {
      console.warn(`[Gmail Port ${port.sender?.tab?.id}] Operation already active. Ignoring new request:`, request.type);
      return;
    }
    operationActive = true;
    
    try {
      console.log(`[Gmail Port ${port.sender?.tab?.id}] Received request:`, request.type);
      
      if (request.type === 'DELETE_EMAILS') {
        // Acknowledge request immediately
        port.postMessage({ type: 'ACKNOWLEDGED' });
        
        // Start the deletion process asynchronously
        await performGmailDeleteOperation(port, request);
      } else {
         console.warn(`[Gmail Port ${port.sender?.tab?.id}] Unknown message type:`, request.type);
         sendPortError(port, `Unknown request type: ${request.type}`);
      }
    } catch (error) {
      console.error(`[Gmail Port ${port.sender?.tab?.id}] Error handling message:`, error);
      sendPortError(port, 'Error processing request: ' + serializeError(error));
    } finally {
        // Allow new operations once this one is done (or errored)
        // Note: The port might disconnect before this runs if errors occur
        operationActive = false; 
    }
  });

  port.onDisconnect.addListener(() => {
    console.log(`[Gmail Port ${port.sender?.tab?.id}] Port disconnected. Operation active:`, operationActive);
    // Clean up any resources if needed, although intervals/timeouts should be cleared within the operation
  });

  // --- Helper functions --- 

  function sendPortMessage(port, message) {
    try {
      // Check if port is still valid before sending
      // Attempting to send on a disconnected port throws an error
      port.postMessage(message);
  } catch (e) {
      console.warn(`[Gmail Port ${port.sender?.tab?.id}] Failed to send message (port likely disconnected):`, message, e);
    }
  }

  function sendPortError(port, errorMessage) {
    sendPortMessage(port, {
      type: 'ERROR',
      error: errorMessage
    });
  }

  // --- Main Operation Logic --- 

  async function performGmailDeleteOperation(port, request) {
    let token = null;
    try {
      // 1. Authenticate
      sendPortMessage(port, { type: 'DELETE_PROGRESS', message: 'Authenticating... ' });
      token = await authenticateGmail(port);
      if (!token) return; // Error handled within authenticateGmail
      sendPortMessage(port, { type: 'AUTH_SUCCESS' });

      // 2. Setup Service & Client
      sendPortMessage(port, { type: 'DELETE_PROGRESS', message: 'Initializing Gmail access...' });
      services.gmail.accessToken = token;
      await initializeGmailClient(port);

      // 3. Process Deletion
      await processGmailDeletion(port, request.messageIds);
      
      console.log(`[Gmail Port ${port.sender?.tab?.id}] Deletion operation completed.`);

    } catch (error) {
      console.error(`[Gmail Port ${port.sender?.tab?.id}] Operation failed:`, error);
      sendPortError(port, 'Operation failed: ' + serializeError(error));
    } finally {
       // Try to disconnect the port cleanly after operation finishes or fails
       try { port.disconnect(); } catch(e) { /* Ignore error if already disconnected */ }
    }
  }

  // Authenticate with Gmail
  async function authenticateGmail(port) {
      return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          const error = chrome.runtime.lastError;
          if (error || !token) {
            const errorMsg = 'Authentication failed: ' + (error?.message || 'No token received');
            console.error('[Gmail Auth] Error:', errorMsg);
            sendPortError(port, errorMsg);
            resolve(null);
          } else {
            // Store token silently in background
            chrome.storage.local.set({ 'gmail_token': token }).catch(err => 
                console.warn('[Gmail Auth] Failed to store token:', err)
            );
            console.log('[Gmail Auth] Success.');
            resolve(token);
          }
        });
      });
  }
  
  // Initialize the Gmail client
  async function initializeGmailClient(port) {
    try {
      await services.gmail.initialize(config.gmail.clientId);
      if (!services.gmail.client) {
        throw new Error('Gmail client object not created after initialization');
      }
       console.log('[Gmail Init] Success.');
    } catch (error) {
      console.error('[Gmail Init] Error:', error);
      sendPortError(port, 'Gmail initialization failed: ' + serializeError(error));
      throw error; // Rethrow to stop the operation
    }
  }
  
  // Process Gmail message deletion
  async function processGmailDeletion(port, messageIds) {
    if (!messageIds || messageIds.length === 0) {
        sendPortError(port, 'No message IDs provided');
        return; // Stop processing
    }

    const batchSize = 25;
    let processedCount = 0;
    let failedCount = 0;
    const totalBatches = Math.ceil(messageIds.length / batchSize);

    console.log(`[Gmail Delete] Starting deletion for ${messageIds.length} messages in ${totalBatches} batches.`);

    for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, Math.min(i + batchSize, messageIds.length));
        const batchNumber = Math.floor(i / batchSize) + 1;

        sendPortMessage(port, {
            type: 'DELETE_PROGRESS',
            message: `Processing batch ${batchNumber}/${totalBatches}... (${processedCount}/${messageIds.length})`
        });

        try {
            // Ensure client is still valid (though it should be)
            if (!services.gmail.client) throw new Error('Gmail client not available');

            if (batch.length === 1) {
                await services.gmail.client.users.messages.trash({ userId: 'me', id: batch[0] });
            } else {
                await services.gmail.client.users.messages.batchModify({
                    userId: 'me',
                    requestBody: { ids: batch, addLabelIds: ['TRASH'] }
                });
            }
            processedCount += batch.length;
            console.log(`[Gmail Delete] Batch ${batchNumber} success (${batch.length} messages). Processed: ${processedCount}`);
        } catch (batchError) {
            failedCount += batch.length;
            const errorMsg = `Batch ${batchNumber} failed: ${serializeError(batchError)}`;
            console.error(`[Gmail Delete] ${errorMsg}`);
            // Send error for this batch, but continue processing others
            sendPortMessage(port, { type: 'DELETE_PROGRESS', message: errorMsg });
        }

        // Small delay between batches
        if (i + batchSize < messageIds.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    const finalMessage = failedCount > 0 ? 
        `Completed: Deleted ${processedCount}, Failed ${failedCount}` : 
        `Successfully deleted ${processedCount} emails`;
        
    console.log(`[Gmail Delete] Finished. ${finalMessage}`);
    
    // Send final status
    sendPortMessage(port, {
        type: 'DELETE_SUCCESS',
        count: processedCount,
        failed: failedCount,
        message: finalMessage
    });
  }
}

// Add the smoke test message listener
chrome.runtime.onMessage.addListener((msg, s, r) => {
  // Exclude the main listener function to avoid double processing
  if (msg && messageListenerFunction && msg !== messageListenerFunction) { 
    try {
      if (msg?.type === "TEST_PING") {
        console.log("✉️ [Test] Received TEST_PING from", s.id || s.origin);
        r({ pong: new Date().toISOString() });
        return false; // Indicate synchronous response
      }
      if (msg.type === "SMOKE_TEST") {
        console.log("✉️ [Smoke Test] Got SMOKE_TEST");
        r({ ok: true });
        return false; // Indicate synchronous response
      }
      // If it wasn't handled here, let the main listener potentially handle it.
      // However, this listener should ideally only handle specific test messages.
      // Return undefined or false if not handled.
      return false; 
    } catch (e) {
      console.error("🛑 Error in smoke test listener:", e);
      // Cannot reliably send response here if `r` is invalid
      return false;
    }
  }
  return false; // Don't interfere with the main listener
});

// Output another visible log in the global scope
console.log("🚨 GLOBAL: Background script loaded", new Date().toISOString());

// Export key functions as ES modules for proper MV3 service worker support
export { 
  initializeExtensionServices, 
  setupMessageListener,
  handleMessageWrapper,
  handleMessageAsync,
  serializeError
};

/**
 * Ensures the content script is loaded in the specified tab
 * @param {number} tabId - The ID of the tab
 * @param {Function} callback - Function to call after ensuring content script is loaded
 */
function ensureContentScriptLoaded(tabId, callback) {
  // First try a simple ping to see if content script is already loaded
  try {
    chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
      if (response && response.success) {
        console.log("Content script responded to ping, proceeding...");
        callback();
        return;
      }
      
      console.log("Content script not detected or not responding, injecting content.js...");
      
      // Inject the content script
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
        world: "ISOLATED"
      }).then(() => {
        console.log("Content script injected successfully");
        // Give it a moment to initialize
        setTimeout(() => {
          // Try pinging again to confirm it's loaded
          chrome.tabs.sendMessage(tabId, { type: "PING" }, (pingResponse) => {
            if (pingResponse && pingResponse.success) {
              console.log("Injected content script confirmed working");
            } else {
              console.warn("Injected content script may not be working correctly");
            }
            callback();
          });
        }, 500);
      }).catch((err) => {
        console.error("Failed to inject content script:", err);
        
        // Try one more approach - register the content script
        chrome.scripting.registerContentScripts([{
          id: "email-cleaner-content",
          matches: ["https://mail.google.com/*", "https://outlook.office.com/*"],
          js: ["content.js"],
          runAt: "document_start",
          world: "ISOLATED"
        }]).then(() => {
          console.log("Content script registered, reloading page...");
          chrome.tabs.reload(tabId);
          setTimeout(callback, 1000);
        }).catch(regErr => {
          console.error("Failed to register content script:", regErr);
          callback(); // Call callback anyway as a fallback
        });
      });
    });
  } catch (e) {
    console.error("Error checking content script status:", e);
    callback(); // Call callback anyway as a fallback
  }
}

// Add email analytics storage and processing
const emailAnalytics = {
  // Store sender statistics
  senderStats: {},
  
  // Last scan timestamp
  lastScanTime: 0,
  
  // Initialize analytics from storage
  async initialize() {
    try {
      const data = await chrome.storage.local.get(['senderStats', 'lastScanTime']);
      this.senderStats = data.senderStats || {};
      this.lastScanTime = data.lastScanTime || 0;
      console.log('[EmailAnalytics] Initialized with', Object.keys(this.senderStats).length, 'senders');
    } catch (error) {
      console.error('[EmailAnalytics] Error initializing:', error);
    }
  },
  
  // Save current analytics to storage
  async save() {
    try {
      await chrome.storage.local.set({
        senderStats: this.senderStats,
        lastScanTime: this.lastScanTime
      });
      console.log('[EmailAnalytics] Saved analytics data');
    } catch (error) {
      console.error('[EmailAnalytics] Error saving data:', error);
    }
  },
  
  // Process threads to update analytics
  processThreads(threads, interactionData = {}, resetCounts = false) {
    if (!threads || !Array.isArray(threads)) return 0;
    
    console.log(`[EmailAnalytics] Processing ${threads.length} threads`);
    let updatedCount = 0;
    
    // Reset counts if this is a fresh scan rather than an incremental update
    if (resetCounts) {
      console.log('[EmailAnalytics] Resetting all sender counts for fresh scan');
      Object.values(this.senderStats).forEach(stats => {
        stats.count = 0;
      });
    }
    
    threads.forEach(thread => {
      if (!thread.messages || !thread.messages.length) return;
      
      // Get the first message for sender info
      const firstMessage = thread.messages[0];
      if (!firstMessage.payload || !firstMessage.payload.headers) return;
      
      // Find sender information
      const fromHeader = firstMessage.payload.headers.find(h => 
        h.name.toLowerCase() === 'from' || h.name.toLowerCase() === 'sender'
      );
      
      if (!fromHeader || !fromHeader.value) return;
      
      // Extract sender info
      const senderRaw = fromHeader.value;
      const senderName = this.extractSenderName(senderRaw);
      const senderEmail = this.extractSenderEmail(senderRaw);
      const senderDomain = this.extractDomain(senderEmail);
      
      // Get message dates
      const receivedDate = new Date(firstMessage.internalDate || Date.now());
      
      // Check if this is a new sender
      if (!this.senderStats[senderEmail]) {
        this.senderStats[senderEmail] = {
          name: senderName,
          email: senderEmail,
          domain: senderDomain,
          firstSeen: receivedDate.getTime(),
          lastSeen: receivedDate.getTime(),
          count: 0,
          opened: 0,
          categoryGuess: this.guessSenderCategory(senderName, senderDomain)
        };
      }
      
      // Update sender stats
      const stats = this.senderStats[senderEmail];
      stats.count++;
      stats.lastSeen = Math.max(stats.lastSeen, receivedDate.getTime());
      
      // Update opened count if we have interaction data
      if (interactionData && interactionData[thread.id]) {
        stats.opened += interactionData[thread.id].opened ? 1 : 0;
      }
      
      updatedCount++;
    });
    
    this.lastScanTime = Date.now();
    console.log(`[EmailAnalytics] Updated ${updatedCount} sender records`);
    this.save();
    
    return updatedCount;
  },
  
  // Extract sender's display name
  extractSenderName(from) {
    const match = from.match(/^"?([^"<]+)"?\s*(?:<.*>)?$/);
    return match ? match[1].trim() : from;
  },
  
  // Extract sender's email address
  extractSenderEmail(from) {
    const match = from.match(/<([^>]+)>/) || from.match(/([^\s<]+@[^\s>]+)/);
    return match ? match[1].toLowerCase() : from.toLowerCase();
  },
  
  // Extract domain from email
  extractDomain(email) {
    const match = email.match(/@([^>]+)$/);
    return match ? match[1].toLowerCase() : '';
  },
  
  // Guess sender category based on name and domain
  guessSenderCategory(name, domain) {
    // Simple categorization logic
    const lowerName = name.toLowerCase();
    const lowerDomain = domain.toLowerCase();
    
    // Newsletters and subscriptions
    if (lowerName.includes('newsletter') || 
        lowerName.includes('subscription') || 
        lowerName.includes('weekly') || 
        lowerName.includes('daily') ||
        lowerName.includes('digest') ||
        lowerName.includes('updates')) {
      return 'newsletter';
    }
    
    // Shopping and retail
    if (lowerName.includes('shop') || 
        lowerName.includes('store') || 
        lowerName.includes('buy') || 
        lowerName.includes('deal') ||
        lowerName.includes('sale') ||
        lowerDomain.includes('shop') ||
        lowerDomain.includes('retail')) {
      return 'shopping';
    }
    
    // Social media
    if (lowerDomain.includes('facebook') || 
        lowerDomain.includes('instagram') || 
        lowerDomain.includes('twitter') || 
        lowerDomain.includes('linkedin') ||
        lowerDomain.includes('tiktok')) {
      return 'social';
    }
    
    // Default category
    return 'other';
  },
  
  // Get top senders by frequency
  getTopSenders(limit = 20) {
    return Object.values(this.senderStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },
  
  // Get rarely opened subscriptions
  getRarelyOpenedSubscriptions() {
    return Object.values(this.senderStats)
      .filter(s => s.count >= 3 && s.opened === 0)
      .sort((a, b) => b.count - a.count);
  },
  
  // Get regular company emails
  getRegularCompanyEmails(minEmails = 3, daysThreshold = 30) {
    const nowTime = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const daysThresholdMs = daysThreshold * dayInMs;
    
    // Find senders who've sent multiple emails in the past X days
    return Object.values(this.senderStats)
      .filter(s => {
        return s.count >= minEmails && 
               (nowTime - s.lastSeen) < daysThresholdMs &&
               s.domain && // Has a valid domain
               !s.domain.includes('gmail.com') && // Not a personal Gmail
               !s.domain.includes('hotmail.com') && // Not a personal Hotmail
               !s.domain.includes('outlook.com'); // Not a personal Outlook
      })
      .sort((a, b) => b.count - a.count);
  },
  
  // Get total email count
  getTotalEmailCount() {
    return Object.values(this.senderStats).reduce((sum, s) => sum + s.count, 0);
  }
};