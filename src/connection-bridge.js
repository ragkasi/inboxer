/**
 * Connection Bridge for Email Cleaner Extension
 * 
 * This module provides a unified interface for communication between 
 * the popup and the ES module background service worker.
 */

/**
 * Safely serializes errors to ensure they can be passed between contexts
 */
export function serializeError(error) {
  if (!error) return { message: 'Unknown error' };
  
  try {
    // Handle string errors
    if (typeof error === 'string') return { message: error };
    
    // Special handling for Chrome's runtime.lastError 
    if (error === chrome.runtime.lastError) {
      let errorMessage = "Unknown Chrome runtime error";
      
      try {
        if (chrome.runtime.lastError.message) {
          errorMessage = chrome.runtime.lastError.message;
        } else if (chrome.runtime.lastError.toString) {
          errorMessage = chrome.runtime.lastError.toString();
        }
      } catch (e) {
        console.error("Failed to access runtime error details:", e);
      }
      
      return { 
        message: errorMessage,
        isRuntimeError: true
      };
    }
    
    // Handle Error objects
    if (error instanceof Error) {
      return { 
        message: error.message || 'Unknown error',
        name: error.name,
        stack: error.stack,
        code: error.code
      };
    }
    
    // Handle plain objects with a message property
    if (typeof error === 'object') {
      return { 
        message: error.message || JSON.stringify(error) || 'Unknown error object',
        ...error // Keep other properties if they exist
      };
    }
    
    // Fallback
    return { message: String(error) };
  } catch (e) {
    console.error('Error while serializing error:', e);
    return { message: 'Failed to parse error details' };
  }
}

/**
 * Check if runtime is available and context is valid
 * @returns {boolean} Whether context is valid
 */
export function isContextValid() {
  try {
    // This will throw an error if the extension context is invalidated
    return !!chrome.runtime.id;
  } catch (e) {
    console.error('Extension context check failed:', e);
    return false;
  }
}

/**
 * A persistent port for communication with the background
 */
let port = null;

/**
 * Connect to the background script using a persistent port
 * This is more reliable for MV3 with ES modules
 */
export function connectToBackground() {
  if (port) {
    try {
      port.disconnect();
    } catch (e) {
      console.error('Error disconnecting existing port:', e);
    }
  }
  
  try {
    port = chrome.runtime.connect({ name: 'popup' });
    console.log('Connected to background with persistent port');
    
    port.onDisconnect.addListener(() => {
      console.log('Port disconnected');
      port = null;
      
      // Handle any connection error
      if (chrome.runtime.lastError) {
        console.error('Port disconnected due to error:', 
          chrome.runtime.lastError.message || 'Unknown error');
      }
    });
    
    return true;
  } catch (e) {
    console.error('Failed to connect to background:', e);
    port = null;
    return false;
  }
}

/**
 * Send a message to the background via persistent port
 * @param {Object} message - The message to send
 * @returns {Promise<Object>} - The response
 */
export function sendPortMessage(message) {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) {
      reject(serializeError('Extension context is invalid'));
      return;
    }
    
    // Ensure we have a connection
    if (!port && !connectToBackground()) {
      reject(serializeError('Could not establish connection to background'));
      return;
    }
    
    try {
      // Add a correlation ID to track this specific message
      const correlationId = Date.now() + Math.random().toString(36).substring(2, 9);
      message.correlationId = correlationId;
      
      // Set up response handler before sending
      const responseHandler = (response) => {
        // Only handle responses for this message
        if (response.correlationId !== correlationId) return;
        
        // Remove the listener once we've received our response
        try {
          port.onMessage.removeListener(responseHandler);
        } catch (e) {
          console.error('Error removing port message listener:', e);
        }
        
        // Check for errors in the response
        if (response.error || response.status === 'error') {
          reject(serializeError(response.error || 'Unknown error from background'));
          return;
        }
        
        resolve(response);
      };
      
      // Add the listener
      port.onMessage.addListener(responseHandler);
      
      // Send the message
      port.postMessage(message);
      
      // Set a timeout to clean up the listener and reject if no response
      setTimeout(() => {
        try {
          port.onMessage.removeListener(responseHandler);
        } catch (e) {
          // Ignore errors when removing listener
        }
        reject(serializeError(`Timeout waiting for response to ${message.type}`));
      }, 5000); // 5 second timeout
      
    } catch (e) {
      reject(serializeError(e));
    }
  });
}

/**
 * Send a message using chrome.runtime.sendMessage
 * This is the legacy approach but has better compatibility
 * @param {Object} message - The message to send
 * @returns {Promise<Object>} - The response
 */
export function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) {
      reject(serializeError('Extension context is invalid'));
      return;
    }
    
    try {
      console.log(`Sending runtime message: ${message.type}`);
      chrome.runtime.sendMessage(message, (response) => {
        // Check for runtime error
        if (chrome.runtime.lastError) {
          reject(serializeError(chrome.runtime.lastError));
          return;
        }
        
        if (!response) {
          reject(serializeError('No response received from background script'));
          return;
        }
        
        // Check for error in response
        if (response.error || response.status === 'error') {
          reject(serializeError(response.error || 'Unknown error from background'));
          return;
        }
        
        resolve(response);
      });
    } catch (e) {
      reject(serializeError(e));
    }
  });
}

/**
 * Send a message to the background script, trying multiple methods if needed
 * @param {Object} message - The message to send
 * @param {Object} options - Options for sending the message
 * @returns {Promise<Object>} - The response
 */
export async function sendMessage(message, options = {}) {
  const { retries = 2, usePort = true, timeout = 5000 } = options;
  
  let lastError = null;
  
  // Try to use port messaging first if specified
  if (usePort) {
    try {
      // Ensure we have a connection
      if (!port) {
        connectToBackground();
      }
      
      if (port) {
        return await sendPortMessage(message);
      }
    } catch (e) {
      console.warn('Port messaging failed, falling back to runtime messaging:', e);
      lastError = e;
    }
  }
  
  // Fall back to runtime messaging with retries
  for (let i = 0; i <= retries; i++) {
    try {
      return await sendRuntimeMessage(message);
    } catch (e) {
      console.warn(`Runtime messaging attempt ${i + 1}/${retries + 1} failed:`, e);
      lastError = e;
      
      // Wait before retrying, increasing delay each time
      if (i < retries) {
        await new Promise(r => setTimeout(r, 100 * (i + 1)));
      }
    }
  }
  
  // If we get here, all attempts failed
  throw lastError || new Error('Failed to send message to background script');
}

/**
 * Wake up the background script if needed
 * @returns {Promise<boolean>} - Whether wake-up was successful
 */
export async function wakeUpBackground() {
  console.log('Attempting to wake up background script...');
  
  try {
    // First try direct port connection
    if (connectToBackground()) {
      const response = await sendPortMessage({ type: 'PING' });
      if (response && response.status === 'ok') {
        return true;
      }
    }
    
    // Then try runtime messaging
    const response = await sendRuntimeMessage({ type: 'WAKE_UP' });
    return !!(response && response.status === 'ok');
  } catch (e) {
    console.warn('Wake-up attempt failed:', e);
    
    // Try storage method as a last resort
    try {
      await chrome.storage.local.set({ 'popup_wake_background': Date.now() });
      // Give it a moment to potentially wake up
      await new Promise(r => setTimeout(r, 300));
      return true;
    } catch (storageError) {
      console.error('Storage wake-up attempt failed:', storageError);
      return false;
    }
  }
}

/**
 * Initialize the connection to the background
 * This should be called when the popup loads
 */
export async function initializeConnection() {
  // First wake up the background if needed
  await wakeUpBackground();
  
  // Then establish a port connection
  connectToBackground();
  
  // Check if the background is initialized
  try {
    const status = await sendMessage({ type: 'GET_STATUS' });
    return status && status.initialized === true;
  } catch (e) {
    console.error('Failed to check background status:', e);
    return false;
  }
}

/**
 * Try to open the popup programmatically
 * @returns {Promise<boolean>} - Whether opening was successful
 */
export async function openPopup() {
  try {
    console.log("Attempting to open popup");
    
    // First attempt: try via background script message
    try {
      const response = await sendMessage({ type: 'OPEN_POPUP' });
      if (response && response.success) {
        console.log("Popup opened via background script");
        return true;
      }
    } catch (e) {
      console.error("Failed to open popup via background:", e);
    }
    
    // Second attempt: try via direct URL
    try {
      const extensionId = chrome.runtime.id;
      if (extensionId) {
        const popupUrl = `chrome-extension://${extensionId}/popup.html`;
        
        // Use chrome.tabs.create for more reliable popup opening
        // This works better with Chrome's security restrictions
        if (chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create(
            { 
              url: popupUrl,
              active: true 
            },
            (tab) => {
              if (chrome.runtime.lastError) {
                console.error('Error opening tab:', chrome.runtime.lastError);
                return false;
              }
              return true;
            }
          );
          return true;
        }
        
        // Fallback to window.open with proper options to avoid security issues
        const popupWindow = window.open(
          popupUrl,
          'EmailCleanerPopup',
          'width=400,height=600,status=no,scrollbars=yes,resizable=yes,noopener,noreferrer'
        );
        
        if (popupWindow) {
          console.log("Popup opened via window.open");
          return true;
        }
      }
    } catch (e) {
      console.error("Failed to open popup via direct URL:", e);
    }
    
    // Final attempt: Notify user to click the extension icon manually
    try {
      // Send a message to show instructions via the content script
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "SHOW_MANUAL_INSTRUCTIONS"
          });
        }
      });
    } catch (e) {
      console.error("Failed to send instructions message:", e);
    }
    
    return false;
  } catch (error) {
    console.error("Error in openPopup:", error);
    return false;
  }
}

// Export a default object with all functions
export default {
  serializeError,
  isContextValid,
  connectToBackground,
  sendPortMessage,
  sendRuntimeMessage,
  sendMessage,
  wakeUpBackground,
  initializeConnection,
  openPopup
}; 