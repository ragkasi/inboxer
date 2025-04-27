// Content script to interact with email pages
console.log("Email Cleaner Content Script v1.0.2 loaded (extension popup mode)");
const isGmail = window.location.hostname === 'mail.google.com';
const isOutlook = window.location.hostname === 'outlook.office.com';

// Style for the button
const buttonStyles = {
  position: 'fixed',
  bottom: '20px',
  left: '20px',
  zIndex: '9999',
  padding: '8px 16px',
  borderRadius: '4px',
  fontSize: '14px',
  fontWeight: 'bold',
  backgroundColor: '#4285f4', // Google blue
  color: 'white',
  border: 'none',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  fontFamily: 'Roboto, Arial, sans-serif'
};

// Style for the notification
const notificationStyles = {
  position: 'fixed',
  bottom: '80px',
  left: '20px',
  zIndex: '9998',
  padding: '12px 16px',
  borderRadius: '4px',
  backgroundColor: 'rgba(33, 33, 33, 0.9)',
  color: 'white',
  maxWidth: '280px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
  fontFamily: 'Roboto, Arial, sans-serif',
  fontSize: '14px',
  transition: 'opacity 0.3s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};

// Create a notification element
function createNotification(message, duration = 8000) {
  // Remove existing notification if any
  const existingNotification = document.getElementById('email-cleaner-notification');
  if (existingNotification) {
    document.body.removeChild(existingNotification);
  }
  
  // Create notification container
  const notification = document.createElement('div');
  notification.id = 'email-cleaner-notification';
  Object.assign(notification.style, notificationStyles);
  
  // Add message text
  const text = document.createElement('span');
  text.textContent = message;
  notification.appendChild(text);
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  Object.assign(closeButton.style, {
    background: 'none',
    border: 'none',
    color: 'white',
    marginLeft: '8px',
    cursor: 'pointer',
    fontSize: '16px'
  });
  closeButton.onclick = () => {
    if (notification.parentNode) {
      document.body.removeChild(notification);
    }
  };
  notification.appendChild(closeButton);
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto-remove after specified duration
  if (duration > 0) {
    setTimeout(() => {
      if (notification.parentNode) {
        // Fade out first
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
    }, duration);
  }
  
  return notification;
}

// Function to check if Chrome extension APIs are available
function isChromeAPIAvailable() {
  return typeof chrome !== 'undefined' && 
         typeof chrome.runtime !== 'undefined' && 
         typeof chrome.runtime.sendMessage === 'function' &&
         chrome.runtime.id; // This will be undefined if the extension context is invalid
}

// Helper to wait for Chrome API to be available
function waitForChromeAPI(maxWaitTimeMs = 5000, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // First check immediately
    if (isChromeAPIAvailable()) {
      return resolve(true);
    }
    
    // If not immediately available, start checking with intervals
    const checkInterval = setInterval(() => {
      // Check if we've timed out
      if (Date.now() - startTime > maxWaitTimeMs) {
        clearInterval(checkInterval);
        console.error("🔍 [ContentScript] Chrome API not available after timeout");
        return reject(new Error("Chrome API not available after timeout"));
      }
      
      // Check if API is now available
      if (isChromeAPIAvailable()) {
        clearInterval(checkInterval);
        console.log("🔍 [ContentScript] Chrome API now available");
        return resolve(true);
      }
    }, intervalMs);
  });
}

// Show an error notification if the extension API isn't available
function showAPIUnavailableError() {
  createNotification(
    "Extension API not available. Please try refreshing the page or reinstalling the extension.",
    15000
  );
}

// Function to open the extension popup with retries
function openExtensionPopup() {
  console.log("🔍 [ContentScript] Attempting to open extension popup...");
  
  // Check if Chrome API is available
  if (!isChromeAPIAvailable()) {
    console.warn("🔍 [ContentScript] Chrome API not immediately available, waiting...");
    
    // Wait for API to become available with timeout
    waitForChromeAPI(5000)
      .then(() => {
        console.log("🔍 [ContentScript] Chrome API now available, proceeding to open popup");
        attemptToOpenPopup();
      })
      .catch(error => {
        console.error("🔍 [ContentScript] Chrome API still not available:", error);
        showAPIUnavailableError();
      });
    return;
  }
  
  // If API is immediately available, proceed with opening the popup
  attemptToOpenPopup();
}

// The actual popup opening logic (extracted to a separate function)
function attemptToOpenPopup() {
  // Store if the popup actually appears (for the user)
  let popupOpened = false;
  
  // Create a variable to hold any notification we might show
  let notificationTimeout = null;
  
  // Watch for focus/blur events to detect if popup appears
  const detectPopupOpen = () => {
    // If window loses focus, likely because popup opened
    popupOpened = true;
    
    // Clear any scheduled notification
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
    
    // Remove this listener
    window.removeEventListener('blur', detectPopupOpen);
  };
  
  // Add a listener to detect window blur (which happens when popup opens)
  window.addEventListener('blur', detectPopupOpen);
  
  try {
    // Try to open the popup via background script
    console.log("🔍 [ContentScript] Sending OPEN_POPUP message...");
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }, (response) => {
      console.log("🔍 [ContentScript] Received response for OPEN_POPUP:", response);
      
      // Extract error details safely
      let error = null;
      if (chrome.runtime.lastError) {
        error = chrome.runtime.lastError;
        let errorMessage = "Unknown error";
        
        // Try to extract the actual error message
        if (typeof error === 'object') {
          if (error.message) {
            errorMessage = error.message;
          } else {
            try {
              errorMessage = JSON.stringify(error);
            } catch (e) {
              errorMessage = "Error object could not be stringified";
            }
          }
        } else {
          errorMessage = String(error);
        }
        
        console.log("🔍 [ContentScript] Message from runtime:", errorMessage);
        
        // If we get "message port closed", it's likely because the popup opened and
        // took focus, which is actually what we want
        if (errorMessage.includes("message port closed")) {
          console.log("🔍 [ContentScript] Message port closed - this likely means the popup opened successfully");
          // Mark popup as opened to prevent showing error notifications
          popupOpened = true;
          // Make sure no notification is scheduled
          if (notificationTimeout) {
            clearTimeout(notificationTimeout);
            notificationTimeout = null;
          }
          return;
        }
        
        // For other errors, continue with notification
        console.error("🔍 [ContentScript] Error from runtime:", errorMessage);
        
        // Only schedule notification - don't show immediately
        notificationTimeout = setTimeout(() => {
          // Only show notification if popup didn't appear
          if (!popupOpened) {
            createNotification("Error contacting extension. Please click the extension icon manually.");
          }
        }, 500); // Wait to see if popup appears despite error
        
        return;
      }
      
      if (!response) {
        console.error("🔍 [ContentScript] No response received for OPEN_POPUP");
        
        // Only schedule notification - don't show immediately
        notificationTimeout = setTimeout(() => {
          // Only show notification if popup didn't appear
          if (!popupOpened) {
            createNotification("Extension is not responding. Please reload the extension.");
          }
        }, 500);
        
        return;
      }
      
      // If background script gives a warning, schedule notification
      if (response && response.status === 'warning') {
        console.log("🔍 [ContentScript] Received warning, scheduling notification");
        
        // Only schedule notification - don't show immediately
        notificationTimeout = setTimeout(() => {
          // Only show notification if popup didn't appear
          if (!popupOpened) {
            createNotification("Please click the Email Cleaner extension icon in your browser toolbar");
          }
        }, 500);
        
      } else if (response && response.status === 'error') {
        // Only schedule notification - don't show immediately
        console.error("🔍 [ContentScript] Received error status:", response.error);
        
        notificationTimeout = setTimeout(() => {
          // Only show notification if popup didn't appear
          if (!popupOpened) {
            createNotification(`Error: ${response.error || 'Unable to open popup'}`);
          }
        }, 500);
        
      } else {
        // Handle unexpected responses, but still only notify if popup doesn't appear
        console.warn('🔍 [ContentScript] Unexpected response from OPEN_POPUP:', response);
        
        notificationTimeout = setTimeout(() => {
          if (!popupOpened) {
            createNotification("Please click the Email Cleaner extension icon in your browser toolbar");
          }
        }, 500);
      }
    });
    
    console.log("🔍 [ContentScript] OPEN_POPUP message sent.");
  } catch (err) {
    console.error("🔍 [ContentScript] Exception while trying to send message:", err);
    createNotification("Error communicating with extension. Please try refreshing the page.");
  }
  
  // Clean up the blur listener after some time if it wasn't triggered
  setTimeout(() => {
    window.removeEventListener('blur', detectPopupOpen);
  }, 5000);
}

// Add button to Gmail interface
if (isGmail || isOutlook) {
  // Create button element
  const createButton = () => {
    const btn = document.createElement("button");
    btn.textContent = "Open Email Cleaner";
    btn.id = "email-cleaner-button";
    
    // Apply styles to the button
    Object.assign(btn.style, buttonStyles);
    
    // Add hover effect
    btn.onmouseover = () => {
      btn.style.backgroundColor = '#3367d6'; // Darker blue on hover
    };
    
    btn.onmouseout = () => {
      btn.style.backgroundColor = '#4285f4'; // Back to original blue
    };
    
    // Click handler to open extension popup
    btn.onclick = () => {
      console.log("🔍 Button clicked - requesting extension popup");
      openExtensionPopup();
    };
    
    return btn;
  };
  
  // Function to add button to page
  const addButtonToPage = () => {
    // Check if button already exists
    if (document.getElementById('email-cleaner-button')) {
      return;
    }
    
    const btn = createButton();
    document.body.appendChild(btn);
    console.log('Email Cleaner button added to page');
  };
  
  // Add the button after a slight delay to ensure the page is loaded
  // and retry a few times if the page isn't fully ready
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  
  const tryAddButton = () => {
    if (attempts >= MAX_ATTEMPTS) {
      console.error('Failed to add Email Cleaner button after maximum attempts');
      return;
    }
    
    attempts++;
    
    if (document.body) {
      addButtonToPage();
    } else {
      console.log(`Body not ready, will retry (attempt ${attempts}/${MAX_ATTEMPTS})...`);
      setTimeout(tryAddButton, 1000);
    }
  };
  
  // Start trying to add the button
  setTimeout(tryAddButton, 1000);
  
  // Also add button when URL changes (for Gmail's SPA behavior)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('URL changed, re-adding button');
      setTimeout(addButtonToPage, 1000);
    }
  }).observe(document, {subtree: true, childList: true});
}