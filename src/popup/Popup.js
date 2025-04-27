import React, { useState, Suspense, lazy, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setGmailConnection, setOutlookConnection, fetchEmails, setAutoCleanEnabled } from '../redux/emailSlice';
import './Popup.css';

const EmailList = lazy(() => import('./components/EmailList'));

/**
 * Safely extracts error message from various error formats
 * @param {Error|Object|string} error - The error to parse
 * @returns {string} - Human-readable error message
 */
const getErrorMessage = (error) => {
  try {
    if (!error) return "Unknown error occurred";
    
    console.log("Error type:", typeof error);
    
    // Log the error structure for debugging
    try {
      console.log("Error stringified:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    } catch (e) {
      console.log("Could not stringify error:", e.message);
    }
    
    // Handle error objects with message property
    if (typeof error === 'object') {
      // Case 1: Redux toolkit's rejectWithValue format
      if (error.payload) {
        if (typeof error.payload === 'string') {
          return error.payload;
        } else if (typeof error.payload === 'object') {
          // First try detailed format
          if (error.payload.message) {
            return error.payload.details ? 
              `${error.payload.message}: ${error.payload.details}` : 
              error.payload.message;
          }
          // Fall back to any serializable format
          return JSON.stringify(error.payload);
        }
      }
    
      // Case 2: Standard Error object
      if (error.message) {
        return error.message;
      }
      
      // Case 3: Chrome runtime error
      if (error.lastError && error.lastError.message) {
        return error.lastError.message;
      }
      
      // Case 4: Response object with error property
      if (error.error) {
        if (typeof error.error === 'string') {
          return error.error;
        } else if (typeof error.error === 'object' && error.error.message) {
          return error.error.message;
        }
      }
      
      // Case 5: Response with specific status messages
      if (error.status && error.status !== 'ok') {
        let baseMessage = `Status: ${error.status}`;
        if (error.statusMessage) {
          return `${baseMessage} - ${error.statusMessage}`;
        }
        return baseMessage;
      }
      
      // Case 6: Try to convert the entire error object to string
      try {
        return JSON.stringify(error);
      } catch (e) {
        // In case JSON.stringify fails due to circular references
        return Object.prototype.toString.call(error);
      }
    }
    
    // Handle string errors
    if (typeof error === 'string') {
      return error;
    }
    
    // Fallback for any other type
    return String(error);
  } catch (e) {
    console.error("Error in getErrorMessage:", e);
    return "Failed to process error message";
  }
};

/**
 * Sends a message to the background script with improved error handling and retry logic
 * @param {string} action - The action to perform
 * @param {Object} payload - The payload to send
 * @param {number} retries - Number of retries (default: 1)
 * @returns {Promise<Object>} - The response from the background script
 */
const sendMessage = async (action, payload = {}, retries = 2) => {
  console.log(`Sending ${action} message to background script with payload:`, payload);
  
  // Verify extension connection before sending message
  async function verifyConnection() {
    try {
      // Simple way to check if extension context is valid
      const extensionId = chrome.runtime.id;
      if (!extensionId) {
        throw new Error("Extension context is invalid");
      }
      
      // Try to wake up the background script if it might be inactive
      try {
        const pingResponse = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
            resolve(response);
          });
          // Add timeout to prevent hanging
          setTimeout(() => resolve(null), 300);
        });
        
        if (!pingResponse) {
          console.warn("Background script not responding to ping, attempting wake up");
          await wakeUpBackgroundScript();
        }
      } catch (pingError) {
        console.warn("Ping error:", pingError);
        // Try to wake up anyway
        await wakeUpBackgroundScript();
      }
      
      return true;
    } catch (e) {
      console.error("Extension connection verification failed:", e);
      // If we detect a context invalidation, reload the popup
      setTimeout(() => {
        window.location.reload();
      }, 500);
      return false;
    }
  }

  // Function to send the actual message
  const attemptSend = () => {
    return new Promise((resolve, reject) => {
      // IMPORTANT: Background.js expects a "type" property, not "action"
      const message = { type: action, ...payload };
      
      try {
        // Add a timeout to prevent hanging if the message port closes
        const timeoutId = setTimeout(() => {
          console.warn(`Message ${action} timed out after 5 seconds`);
          reject(new Error(`Message timed out. Background script may be unresponsive.`));
        }, 5000);
        
        chrome.runtime.sendMessage(message, response => {
          clearTimeout(timeoutId); // Clear the timeout
          
          const lastError = chrome.runtime.lastError;
          
          if (lastError) {
            console.error(`Chrome runtime error in sendMessage(${action}):`, lastError);
            
            // Special handling for port closed errors - try to recover
            if (lastError.message && lastError.message.includes('message port closed')) {
              console.warn('Message port closed, attempting to recover connection...');
              // Trigger wake-up on next attempt
              setTimeout(() => {
                wakeUpBackgroundScript().catch(e => 
                  console.error('Failed to wake up background after port closed:', e)
                );
              }, 500);
            }
            
            return reject(lastError);
          }
          
          console.log(`Received response for ${action}:`, response);
          
          if (!response) {
            const error = new Error(`No response received for ${action}`);
            console.error(error);
            return reject(error);
          }
          
          // Check if response is an error object
          if (response.error || response.status === 'error') {
            console.error(`Error in response for ${action}:`, response);
            return reject(response);
          }
          
          return resolve(response);
        });
      } catch (error) {
        console.error(`Exception during sendMessage(${action}):`, error);
        reject(error);
      }
    });
  };

  // Check connection first
  if (!(await verifyConnection())) {
    throw new Error("Extension connection error. Please refresh the page.");
  }
  
  // Try to send the message with retries
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${retries} for ${action}`);
        // Wait a bit before retrying (increasing delay)
        await new Promise(r => setTimeout(r, 100 * attempt));
      }
      return await attemptSend();
    } catch (error) {
      console.error(`Attempt ${attempt} failed for ${action}:`, error);
      lastError = error;
      
      // If this is a "receiver doesn't exist" error and we have retries left,
      // try again after a short delay
      const errorMessage = typeof error === 'object' && error.message ? error.message : String(error);
      if (!errorMessage.includes("Receiving end does not exist")) {
        // For other errors, don't retry
        break;
      }
    }
  }
  
  // If we get here, all retries failed
  throw lastError || new Error(`Failed to send message after ${retries} retries`);
};

/**
 * Specialized function to wake up the background script
 * @returns {Promise<boolean>} Whether waking up was successful
 */
async function wakeUpBackgroundScript() {
  console.log("Attempting to wake up background script...");
  
  try {
    // Strategy 1: Try a direct message
    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'WAKE_UP' }, (response) => {
          resolve(!!response);
        });
        // Don't let it hang forever
        setTimeout(() => resolve(false), 300);
      });
      
      if (result) {
        console.log("Background woke up with direct message");
        return true;
      }
    } catch (e) {
      console.log("Direct wake-up failed:", e);
    }
    
    // Strategy 2: Use storage as an indirect trigger (background listens to storage changes)
    try {
      await chrome.storage.local.set({ 
        'popup_wake_background': Date.now() 
      });
      console.log("Set storage wake-up trigger");
      // Give it a moment to respond
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.log("Storage wake-up failed:", e);
    }
    
    // Strategy 3: Request an "urgent" ping - Chrome prioritizes this
    try {
      chrome.runtime.sendMessage({ type: 'PING', urgent: true });
      console.log("Sent urgent ping");
      // Give it a moment to potentially wake up
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.log("Urgent ping failed:", e);
    }
    
    // Final check if one of the strategies worked
    const finalCheck = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
        resolve(!!response);
      });
      setTimeout(() => resolve(false), 200);
    });
    
    return finalCheck;
  } catch (error) {
    console.error("Error in wakeUpBackgroundScript:", error);
    return false;
  }
}

// Modified checkBackgroundStatus with wake-up logic
async function checkBackgroundStatus(maxRetries = 3) {
  let lastError = null;
  
  // First, try to wake up the background script
  const wakeupSuccess = await wakeUpBackgroundScript();
  console.log("Background wake-up attempt result:", wakeupSuccess);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Background status check attempt ${attempt + 1}/${maxRetries + 1}`);
      
      if (attempt > 0) {
        // Increasing backoff for retries
        await new Promise(r => setTimeout(r, 300 * attempt));
        
        // Try to wake up again on subsequent attempts
        if (attempt > 1) {
          await wakeUpBackgroundScript();
        }
      }
      
      // Prefer using PING as it's a simpler message
      const response = await sendMessage('PING');
      console.log('Background status response:', response);
      
      // Check for specific initialization status
      if (response && typeof response === 'object') {
        if (response.status === 'ok' && response.initialized === true) {
          console.log('Background script is initialized and ready');
          return true;
        } else if (response.status === 'ok' && response.initialized === false) {
          console.warn('Background script reports it is not initialized yet');
          
          // If this is not our last attempt, let's try to initialize it
          if (attempt < maxRetries) {
            console.log('Attempting to initialize background script...');
            await sendMessage('INITIALIZE');
            continue; // Skip to next retry
          }
          
          throw new Error('Background script is not fully initialized yet');
        }
      }
      
      // Fallback for other response formats
      if (response && response.success === true) {
        console.log('Background script responded successfully');
        return true;
      }
      
      console.warn('Invalid or unexpected response from background script:', response);
      // Continue with retries rather than throwing immediately
    } catch (error) {
      console.error(`Background status check failed (attempt ${attempt + 1}):`, error);
      lastError = error;
      
      // Only retry on connection errors
      if (error && error.message && !error.message.includes('Receiving end does not exist')) {
        break;
      }
    }
  }
  
  // If we get here, all attempts failed
  console.error('All background status check attempts failed');
  throw lastError || new Error('Failed to connect to extension background');
}

// Safe wrapper for fetchEmails to ensure correct parameter format
const safeFetchEmails = (service, query = "") => {
  console.log(`Safely dispatching fetchEmails with service: ${service}`);
  // Always make sure we're passing an object
  if (typeof service === 'string') {
    return { service, query };
  } else if (typeof service === 'object' && service !== null) {
    return service;
  } else {
    console.error('Invalid parameter passed to fetchEmails:', service);
    return { service: 'gmail', query: '' }; // Default fallback
  }
};

/**
 * Attempt to reload the extension
 */
async function attemptExtensionReload() {
  try {
    // First try the chrome.runtime.reload() method if available
    if (chrome.runtime && chrome.runtime.reload) {
      chrome.runtime.reload();
      return true;
    }
  } catch (e) {
    console.error("Failed to reload extension:", e);
  }
  
  return false;
}

/**
 * Offline mode component shown when background can't be reached
 */
const OfflineMode = ({ onRetryConnection, error }) => {
  return (
    <div className="popup-container">
      <div className="error-message">
        <h3>Connection Error</h3>
        <p>{error || 'Could not connect to extension background.'}</p>
        <p>This can happen if the extension was recently installed or updated.</p>
        <div className="error-actions">
          <button onClick={onRetryConnection}>
            Retry Connection
          </button>
          <button onClick={async () => {
            // Try reloading or prompt the user to reload manually
            const reloaded = await attemptExtensionReload();
            if (!reloaded) {
              alert("Please manually reload the extension by going to chrome://extensions/ and clicking the reload icon.");
            }
          }}>
            Reload Extension
          </button>
        </div>
      </div>
    </div>
  );
};

const Popup = () => {
  const dispatch = useDispatch();
  const [services, setServices] = useState({ gmail: null, outlook: null });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [backgroundStatus, setBackgroundStatus] = useState({
    initialized: false,
    checking: true,
    error: null
  });
  const [selectedService, setSelectedService] = useState(null);
  
  // Interval reference for persistent pings
  const pingIntervalRef = useRef(null);
  
  const { 
    gmailConnected, 
    outlookConnected, 
    emails, 
    loading, 
    autoCleanEnabled 
  } = useSelector(state => state.email);
  
  // Use Redux state for autoClean
  const [autoClean, setAutoClean] = useState(autoCleanEnabled);

  // Keep autoClean in sync with Redux state
  useEffect(() => {
    setAutoClean(autoCleanEnabled);
  }, [autoCleanEnabled]);

  // Initialize popup
  useEffect(() => {
    async function initializePopup() {
      try {
        setBackgroundStatus(prev => ({ ...prev, checking: true, error: null }));
        
        // Check if this popup was requested by the content script
        chrome.storage.local.get(['popup_requested', 'popup_source'], async (result) => {
          if (result.popup_requested && result.popup_source === 'content_script') {
            console.log('Popup was requested by content script at:', new Date(result.popup_requested).toISOString());
            // Clear the flag to avoid handling it multiple times
            await chrome.storage.local.remove(['popup_requested', 'popup_source']);
            
            // Optional: You could auto-select a service or perform other actions
            // based on knowing this was triggered from the content script
          }
        });
        
        // Add a small delay to allow background script to potentially load
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Check if background script is initialized
        const isInitialized = await checkBackgroundStatus();
        
        setBackgroundStatus({
          initialized: isInitialized,
          checking: false,
          error: null
        });
        
        // If initialized, get available services
        if (isInitialized) {
          try {
            const response = await sendMessage('GET_SERVICES');
            if (response && response.services) {
              setServices(response.services || {});
            }
          } catch (serviceError) {
            console.error('Failed to get services:', serviceError);
          }
        }
      } catch (error) {
        console.error('Popup initialization failed:', error);
        setBackgroundStatus({
          initialized: false,
          checking: false,
          error: error.message || 'Failed to connect to extension'
        });
      }
    }
    
    const initializationTimeout = setTimeout(() => {
      if (backgroundStatus.checking) {
        console.error("Popup initialization timed out. Background script might be inactive.");
        setBackgroundStatus({
          initialized: false,
          checking: false,
          error: 'Extension connection timed out. Please try reloading the extension.'
        });
      }
    }, 5000); // 5-second timeout

    initializePopup().finally(() => {
      clearTimeout(initializationTimeout);
    });

    // Cleanup timeout on unmount
    return () => clearTimeout(initializationTimeout);
  }, []); // Dependencies remain empty to run only once on mount

  // Load auto-clean state on mount
  useEffect(() => {
    chrome.storage.local.get(['autoCleanEnabled'], (result) => {
      if (result.autoCleanEnabled !== undefined) {
        dispatch(setAutoCleanEnabled(result.autoCleanEnabled));
        setAutoClean(result.autoCleanEnabled);
      }
    });
  }, [dispatch]);

  // Set up persistent pings to keep background alive
  useEffect(() => {
    // Only start persistent pings if background is initialized
    if (backgroundStatus.initialized) {
      console.log("Starting persistent background pings");
      
      // Clear any existing interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      
      // Set up new interval
      pingIntervalRef.current = setInterval(async () => {
    try {
          // Use the simplest message possible
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
              if (chrome.runtime.lastError) {
                resolve(null);
              } else {
                resolve(response);
              }
            });
            
            // Don't let it hang too long
            setTimeout(() => resolve(null), 200);
          });
          
          if (!response) {
            console.warn("Background ping failed, attempting to wake up");
            await wakeUpBackgroundScript();
          }
        } catch (e) {
          console.error("Error during persistent ping:", e);
        }
      }, 3000); // Ping every 3 seconds
      
      // Clean up interval on unmount
      return () => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      };
    }
  }, [backgroundStatus.initialized]);

  const connectGmail = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      
      const response = await sendMessage('SELECT_SERVICE', { service: 'gmail' });
      
      if (response && response.success) {
        dispatch(setGmailConnection(true));
        setSelectedService('gmail');
        await dispatch(fetchEmails(safeFetchEmails('gmail')));
      } else {
        throw new Error(response?.error || 'Failed to connect to Gmail');
      }
      
      setStatus('connected');
    } catch (err) {
      console.error('Gmail connection error:', err);
      setError(getErrorMessage(err));
      setStatus('error');
    }
  }, [dispatch]);

  const connectOutlook = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      
      const response = await sendMessage('SELECT_SERVICE', { service: 'outlook' });
      
      if (response && response.success) {
        dispatch(setOutlookConnection(true));
        setSelectedService('outlook');
        await dispatch(fetchEmails(safeFetchEmails('outlook')));
      } else {
        throw new Error(response?.error || 'Failed to connect to Outlook');
      }
      
      setStatus('connected');
    } catch (err) {
      console.error('Outlook connection error:', err);
      setError(getErrorMessage(err));
      setStatus('error');
    }
  }, [dispatch]);

  const handleAutoCleanToggle = useCallback(async (enabled) => {
    try {
      setAutoClean(enabled);
      const response = await sendMessage('SET_AUTO_CLEAN', { enabled });
      
      if (response && response.success) {
        dispatch(setAutoCleanEnabled(enabled));
      }
    } catch (err) {
      console.error('Auto-clean toggle error:', err);
      setError(getErrorMessage(err));
    }
  }, [dispatch]);

  const cleanEmails = useCallback(async () => {
    try {
      setStatus('cleaning');
      setError(null);
      
      const response = await sendMessage('CLEAN_EMAILS');
      
      if (response && response.success) {
        await dispatch(fetchEmails(safeFetchEmails(selectedService)));
        setStatus('cleaned');
      } else {
        throw new Error(response?.error || 'Failed to clean emails');
      }
    } catch (err) {
      console.error('Email cleaning error:', err);
      setError(getErrorMessage(err));
      setStatus('error');
    }
  }, [dispatch, selectedService]);

  // Show loading state while checking background status
  if (backgroundStatus.checking) {
    return (
      <div className="popup-container">
        <div className="checking-status">
          <h3>Connecting...</h3>
          <p>Establishing connection to extension services</p>
        </div>
      </div>
    );
  }

  // Show error if background script is not initialized
  if (!backgroundStatus.initialized) {
    return (
      <OfflineMode 
        error={backgroundStatus.error || 'Background script not initialized'} 
        onRetryConnection={async () => {
          setBackgroundStatus(prev => ({ ...prev, checking: true, error: null }));
          try {
            // Attempt to wake up and initialize again
            await wakeUpBackgroundScript();
            const isInitialized = await checkBackgroundStatus(2); // Fewer retries on manual attempt
            
            setBackgroundStatus({
              initialized: isInitialized,
              checking: false,
              error: null
            });
          } catch (error) {
            setBackgroundStatus({
              initialized: false,
              checking: false,
              error: getErrorMessage(error)
            });
          }
        }}
      />
    );
  }

  // Main popup content
  return (
    <div className="popup-container">
      <h1>Email Cleaner</h1>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      {!selectedService && (
        <div className="service-selection">
          <h2>Select Email Service</h2>
          <button 
            onClick={connectGmail} 
            disabled={status === 'connecting' || !services.gmail}
          >
            {status === 'connecting' ? 'Connecting...' : 'Connect Gmail'}
          </button>
          <button 
            onClick={connectOutlook} 
            disabled={status === 'connecting' || !services.outlook}
          >
            {status === 'connecting' ? 'Connecting...' : 'Connect Outlook'}
          </button>
        </div>
      )}
      
      {selectedService && (
        <div className="email-management">
          <div className="service-info">
            <span>Connected to: {selectedService}</span>
            <button onClick={() => setSelectedService(null)}>Change</button>
        </div>

        <div className="auto-clean-toggle">
          <label>
            <input
              type="checkbox"
                checked={autoClean} 
              onChange={(e) => handleAutoCleanToggle(e.target.checked)}
            />
              Enable Auto-Clean
          </label>
        </div>
          
          <button 
            onClick={cleanEmails} 
            disabled={status === 'cleaning' || loading}
          >
            {status === 'cleaning' ? 'Cleaning...' : 'Clean Emails Now'}
          </button>
          
          <Suspense fallback={<div>Loading email list...</div>}>
            <EmailList />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export default Popup;