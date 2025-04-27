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

      case 'CLEAN_EMAILS':
        const requestedService = request.service || selectedService; // Use request.service if provided, fallback to global
        console.log(`[CLEAN_EMAILS] 1. Received request. Service: ${requestedService}, Message IDs:`, request.messageIds);
        
        if (!requestedService) {
          console.error('[CLEAN_EMAILS] Error: No service specified or selected');
          return sendResponse({ 
            error: 'No service specified or selected',
            success: false
          });
        }
        
        if (!request.messageIds || !Array.isArray(request.messageIds) || request.messageIds.length === 0) {
          console.error('[CLEAN_EMAILS] Error: No message IDs provided');
          return sendResponse({ 
            error: 'No message IDs provided for cleaning',
            success: false
          });
        }
        
        console.log(`[CLEAN_EMAILS] 2. Processing deletion for ${request.messageIds.length} emails via ${requestedService}`);
        try {
          // Verify service exists and is initialized
          if (!services[requestedService]) {
            // If the requested service doesn't exist, check if any other service is available
            const availableServices = Object.keys(services).filter(key => services[key]);
            if (availableServices.length === 0) {
              const serviceErrorMsg = `No email services are available`;
              console.error(`[CLEAN_EMAILS] Error: ${serviceErrorMsg}`);
              throw new Error(serviceErrorMsg);
            }
            
            // Use the first available service as a fallback
            const fallbackService = availableServices[0];
            console.log(`[CLEAN_EMAILS] Service ${requestedService} not available, falling back to ${fallbackService}`);
            const serviceErrorMsg = `Service ${requestedService} is not available, using ${fallbackService} instead`;
            console.warn(`[CLEAN_EMAILS] Warning: ${serviceErrorMsg}`);
            // Continue with the fallback service
            requestedService = fallbackService;
          }
          
          // Ensure the service is authenticated
          if (!services[requestedService].accessToken) {
            console.log(`[CLEAN_EMAILS] 3a. Authenticating ${requestedService} before cleaning...`);
            const authSuccess = await services[requestedService].authenticate();
            if (!authSuccess) {
              const authErrorMsg = `Failed to authenticate with ${requestedService}`;
              console.error(`[CLEAN_EMAILS] Error: ${authErrorMsg}`);
              throw new Error(authErrorMsg);
            }
            console.log(`[CLEAN_EMAILS] 3b. Authentication successful.`);
        } else {
             console.log(`[CLEAN_EMAILS] 3c. Already authenticated with ${requestedService}.`);
          }
          
          // Call the deleteMessages method on the correct service instance
          console.log(`[CLEAN_EMAILS] 4. Calling deleteMessages for ${requestedService}...`);
          const deleteResult = await services[requestedService].deleteMessages(request.messageIds);
          console.log(`[CLEAN_EMAILS] 5. deleteMessages result for ${requestedService}:`, deleteResult);
          
          if (!deleteResult || !deleteResult.success) {
             const deleteErrorMsg = deleteResult?.error || `Unknown error from deleteMessages for ${requestedService}`;
             console.error(`[CLEAN_EMAILS] Error: ${deleteErrorMsg}`);
             throw new Error(deleteErrorMsg);
          }
          
          console.log(`[CLEAN_EMAILS] 6. Successfully deleted ${deleteResult.count} emails. Sending success response.`);
          sendResponse({ 
            success: true, 
            count: deleteResult.count, 
            failedCount: deleteResult.failedCount || 0, 
            errors: deleteResult.errors 
          });
          
        } catch (error) {
          console.error(`[CLEAN_EMAILS] 7. Caught error during cleaning for ${requestedService}:`, error);
          sendResponse({ 
            success: false, 
            error: `Failed to clean emails: ${error.message || 'Unknown error'}`, 
            details: serializeError(error) 
          });
        }
        break;

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
        console.log('[OPEN_POPUP] Received request');
        try {
          console.log('[OPEN_POPUP] 1. Setting storage...');
          await chrome.storage.local.set({ 
            'popup_requested': Date.now(),
            'popup_source': 'content_script'
          });
          console.log('[OPEN_POPUP] 2. Storage set. Setting popup URL...');
          
          // Ensure popup is set correctly
          await new Promise((resolve, reject) => {
            chrome.action.setPopup({ popup: 'popup.html' }, () => {
              const error = logRuntimeError('setPopup');
              if (error) {
                console.error('[OPEN_POPUP] 3a. Error setting popup:', error);
                reject(error);
              } else {
                console.log('[OPEN_POPUP] 3b. Popup URL set successfully.');
                resolve();
              }
            });
          });
          
          console.log('[OPEN_POPUP] 4. Attempting programmatic open...');
          
          try {
            // Attempt multiple techniques to open the popup
            
            // Technique 1: Use chrome.action.openPopup if available
            if (chrome.action && typeof chrome.action.openPopup === 'function') {
              try {
                await chrome.action.openPopup();
                console.log('[OPEN_POPUP] 4a. chrome.action.openPopup() called successfully.');
              } catch (popupError) {
                console.log('[OPEN_POPUP] 4b. chrome.action.openPopup() threw an error:', popupError);
                // Continue to other techniques
              }
            } else {
              console.log('[OPEN_POPUP] 4c. chrome.action.openPopup() not available');
            }
            
            // Regardless of whether the programmatic popup worked, send a success response
            // because our content script will detect if it didn't work and show a message
            console.log('[OPEN_POPUP] 5. Sending success response...');
            sendResponse({ 
              status: 'success', 
              message: 'Popup opening initiated',
              success: true
            });
          } catch (openError) {
            console.error('[OPEN_POPUP] Error opening popup:', openError);
            // Send warning response if we can't open programmatically
            sendResponse({ 
              status: 'warning', 
              message: 'Please click the extension icon in the toolbar',
              success: true,
              reason: 'Programmatic popup opening failed: ' + (openError.message || 'unknown error')
            });
          }
          
          return true; // Indicate async response
        } catch (error) {
          console.error('[OPEN_POPUP] Exception during handler execution:', error);
          // Try to send error response
          try {
             sendResponse({ status: 'error', error: 'Exception in OPEN_POPUP handler: ' + serializeError(error) });
          } catch(e) { console.error('Failed to send error response after exception', e); }
          return true; // Maintain async response
        }
        break;

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
            console.log('[AUTH_AND_FETCH_GMAIL] Fetching threads...');
            const threads = await services.gmail.fetchThreads();
            console.log(`[AUTH_AND_FETCH_GMAIL] Fetched ${threads?.length || 0} threads`);
            sendResponse({ status: "ok", threads });
          } catch (err) {
            console.error("[AUTH_AND_FETCH_GMAIL] Error fetching Gmail emails:", err);
            sendResponse({ status: "error", error: serializeError(err) });
          }
        });
        return true; // Indicate async response
        
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
    'OPEN_POPUP'
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

chrome.action.onClicked.addListener(() => {
  try {
    console.log("🔔 [Test] Extension icon clicked — service worker is alive");
    // Potentially open the popup manually here if needed, or ensure it's set
    chrome.action.setPopup({ popup: 'popup.html' });
  } catch (e) {
    console.error("🛑 Error in onClicked listener:", e);
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

// Listen for popup connections via long-lived port
chrome.runtime.onConnect.addListener(port => {
  try {
    if (port.name === 'popup') {
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
      port.onDisconnect.addListener(() => {
         try {
            console.log('Popup port disconnected');
            if (chrome.runtime.lastError) {
              console.error('Port disconnected with error:', chrome.runtime.lastError.message);
            }
          } catch (e) {
            console.error("🛑 Error in port.onDisconnect listener:", e);
          }
      });
    }
  } catch (e) {
    console.error("🛑 Error setting up onConnect listener:", e);
  }
});

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