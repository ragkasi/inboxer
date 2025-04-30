// Content script to interact with email pages
console.log("Email Cleaner Content Script v1.0.5 loaded");

// Safety check and initialization for Chrome API
(function initializeContentScript() {
  // Check if Chrome API is available
  if (typeof chrome === 'undefined') {
    console.error('Chrome API is not defined. Running in a fallback mode.');
    // Set up a retry mechanism
    setTimeout(initializeContentScript, 500);
    return;
  }

  if (typeof chrome.runtime === 'undefined') {
    console.error('chrome.runtime is not defined. Running in a fallback mode.');
    // Set up a retry mechanism
    setTimeout(initializeContentScript, 500);
    return;
  }

  // Try to check if runtime is fully initialized
  try {
    if (!chrome.runtime.id) {
      console.warn('chrome.runtime.id is not available. Extension context may be invalid.');
      // Still continue as this might be false negative
    }
    
    // Set up message listener only once runtime is confirmed available
    setupMessageListener();
    console.log("Chrome API initialized successfully");
  } catch (e) {
    console.error('Error initializing Chrome API:', e);
    // Set up a retry mechanism
    setTimeout(initializeContentScript, 500);
  }
})();

// Setup message listener safely
function setupMessageListener() {
  try {
    // Only add listener if it's not already added
    if (chrome.runtime.onMessage.hasListeners && chrome.runtime.onMessage.hasListeners()) {
      console.log("Message listener already exists");
      return;
    }
    
    // Add the message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.type === "PING") {
          console.log("Received PING from background script");
          sendResponse({ success: true, status: "alive" });
        }
        else if (message.type === "SHOW_MANUAL_INSTRUCTIONS") {
          console.log("Received instruction to show manual popup instructions");
          showManualInstructions();
          sendResponse({ success: true });
        }
        else if (message.type === "OPEN_EMAIL_CLEANER") {
          console.log("Received instruction to open Email Cleaner");
          openEmailCleaner();
          sendResponse({ success: true });
        }
      } catch (e) {
        console.error("Error handling message:", e);
        sendResponse({ success: false, error: e.message });
      }
      
      // Return false because we're not using sendResponse asynchronously
      return false;
    });
    
    console.log("Message listener successfully registered");
  } catch (e) {
    console.error("Error setting up message listener:", e);
    // Retry after a delay
    setTimeout(setupMessageListener, 500);
  }
}

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

// Style for the standalone panel
const panelStyles = {
  position: 'fixed',
  top: '50px',
  right: '20px',
  zIndex: '10000',
  width: '400px',
  height: '600px',
  backgroundColor: 'white',
  borderRadius: '8px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'transform 0.3s ease-in-out',
  transform: 'translateX(450px)'
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

// Function to create and show a standalone panel with simple UI
function showStandalonePanel() {
  // Remove existing panel if any
  removeStandalonePanel();
  
  // Create panel container
  const panel = document.createElement('div');
  panel.id = 'email-cleaner-panel';
  Object.assign(panel.style, panelStyles);
  
  // Create header
  const header = document.createElement('div');
  Object.assign(header.style, {
    backgroundColor: '#4285f4',
    color: 'white',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #3367d6'
  });
  
  // Add title
  const title = document.createElement('h3');
  title.textContent = 'Email Cleaner';
  Object.assign(title.style, {
    margin: '0',
    fontSize: '16px',
    fontWeight: 'bold'
  });
  header.appendChild(title);
  
  // Add diagnostic button
  const diagButton = document.createElement('button');
  diagButton.textContent = 'Diagnostic';
  Object.assign(diagButton.style, {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: 'white',
    padding: '4px 8px',
    fontSize: '12px',
    borderRadius: '4px',
    marginRight: '10px',
    cursor: 'pointer'
  });
  diagButton.onclick = (e) => {
    e.stopPropagation();
    testExtensionConnectivity();
  };
  header.appendChild(diagButton);
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  Object.assign(closeButton.style, {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0',
    lineHeight: '1'
  });
  closeButton.onclick = removeStandalonePanel;
  header.appendChild(closeButton);
  
  // Create content area
  const content = document.createElement('div');
  Object.assign(content.style, {
    padding: '16px',
    overflowY: 'auto',
    height: 'calc(100% - 45px)', // Subtract header height
    boxSizing: 'border-box'
  });
  
  // Create a loading indicator
  const loader = document.createElement('div');
  loader.id = 'email-cleaner-loader';
  Object.assign(loader.style, {
    textAlign: 'center',
    padding: '20px',
    color: '#666'
  });
  loader.textContent = 'Analyzing emails...';
  content.appendChild(loader);
  
  // Add info text
  const info = document.createElement('p');
  info.textContent = 'This simplified version allows you to view and manage your emails grouped by sender.';
  Object.assign(info.style, {
    marginBottom: '20px',
    color: '#666',
    fontSize: '14px'
  });
  content.appendChild(info);
  
  // Add help text for deletion
  const helpText = document.createElement('div');
  helpText.id = 'email-cleaner-help';
  Object.assign(helpText.style, {
    padding: '10px',
    marginBottom: '15px',
    backgroundColor: '#f9f9f9',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#444',
    display: 'none' // Initially hidden
  });
  
  helpText.innerHTML = `
    <p><strong>Using Email Cleaner:</strong></p>
    <ol>
      <li>Click "Connect Gmail Account" to authenticate</li>
      <li>View your emails grouped by sender</li>
      <li>Use "Delete All" to remove all emails from a sender</li>
      <li>If you encounter errors, try the "Diagnostic" button</li>
    </ol>
    <p><strong>Troubleshooting:</strong> If Delete All doesn't work, try reloading the page and starting again.</p>
  `;
  content.appendChild(helpText);
  
  // Show the help text after a delay
  setTimeout(() => {
    if (helpText) helpText.style.display = 'block';
  }, 1000);
  
  // Create button to connect gmail (will be shown if needed)
  const connectButton = document.createElement('button');
  connectButton.id = 'email-cleaner-connect-button';
  connectButton.textContent = 'Connect Gmail Account';
  Object.assign(connectButton.style, {
    backgroundColor: '#4285f4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    margin: '10px 0',
    display: 'none' // Initially hidden
  });
  connectButton.onclick = () => {
    tryConnectGmail();
  };
  content.appendChild(connectButton);
  
  // Create email groups container
  const groupsContainer = document.createElement('div');
  groupsContainer.id = 'email-cleaner-groups';
  content.appendChild(groupsContainer);
  
  // Add components to panel
  panel.appendChild(header);
  panel.appendChild(content);
  
  // Add to page
  document.body.appendChild(panel);
  
  // Animate in after a short delay
  setTimeout(() => {
    panel.style.transform = 'translateX(0)';
  }, 10);
  
  // Add event listener for closing when clicking outside
  document.addEventListener('click', handleOutsideClick);
  
  // Try to load emails immediately
  setTimeout(() => {
    tryLoadEmails();
  }, 500);
  
  return panel;
}

// Function to remove the standalone panel
function removeStandalonePanel() {
  const panel = document.getElementById('email-cleaner-panel');
  if (panel) {
    // Animate out
    panel.style.transform = 'translateX(450px)';
    
    // Remove after animation completes
    setTimeout(() => {
      if (panel.parentNode) {
        document.body.removeChild(panel);
      }
    }, 300);
    
    // Remove click listener
    document.removeEventListener('click', handleOutsideClick);
  }
}

// Handle clicks outside the panel to close it
function handleOutsideClick(event) {
  const panel = document.getElementById('email-cleaner-panel');
  const button = document.getElementById('email-cleaner-button');
  
  if (panel && !panel.contains(event.target) && event.target !== button) {
    removeStandalonePanel();
  }
}

// Try to safely interact with Chrome APIs
function safelyCallChromeAPI(apiCall, fallback) {
  try {
    // Check if Chrome exists
    if (typeof chrome === 'undefined') {
      console.log('Chrome API is not defined');
      return fallback();
    }
    
    // Check if runtime exists
    if (typeof chrome.runtime === 'undefined') {
      console.log('chrome.runtime is not defined');
      return fallback();
    }
    
    // Check if runtime.id exists (extension context)
    if (!chrome.runtime.id) {
      console.log('chrome.runtime.id is not available (invalid extension context)');
      return fallback();
    }
    
    // Try to execute the API call
    return apiCall();
  } catch (error) {
    console.error('Error calling Chrome API:', error);
    return fallback();
  }
}

// Try to load emails from Gmail
function tryLoadEmails() {
  const loader = document.getElementById('email-cleaner-loader');
  const connectButton = document.getElementById('email-cleaner-connect-button');
  const groupsContainer = document.getElementById('email-cleaner-groups');
  
  if (!loader || !connectButton || !groupsContainer) return;
  
  loader.textContent = 'Loading emails...';
  
  // Try to use Chrome API to fetch emails
  safelyCallChromeAPI(
    // API call
    () => {
      console.log('Attempting to fetch emails via Chrome API');
      chrome.runtime.sendMessage({ 
        type: 'AUTH_AND_FETCH_GMAIL'
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error fetching emails:', chrome.runtime.lastError);
          showConnectButton();
          return;
        }
        
        if (!response || response.status !== 'ok' || !response.threads) {
          console.error('Invalid response while fetching emails:', response);
          showConnectButton();
          return;
        }
        
        // Successfully got emails
        displayEmails(response.threads);
      });
    },
    // Fallback
    () => {
      console.log('Using fallback for email loading');
      showConnectButton();
    }
  );
  
  function showConnectButton() {
    loader.textContent = 'No emails loaded. Please connect your account.';
    connectButton.style.display = 'block';
  }
}

// Function to try connecting Gmail
function tryConnectGmail() {
  const loader = document.getElementById('email-cleaner-loader');
  const connectButton = document.getElementById('email-cleaner-connect-button');
  
  if (!loader || !connectButton) return;
  
  loader.textContent = 'Connecting to Gmail...';
  connectButton.style.display = 'none';
  
  safelyCallChromeAPI(
    // API call
    () => {
      console.log('Attempting to authenticate via Chrome API');
      chrome.runtime.sendMessage({ 
        type: 'SELECT_SERVICE',
        service: 'gmail'
      }, response => {
        if (chrome.runtime.lastError || !response || !response.success) {
          console.error('Error selecting Gmail service:', chrome.runtime.lastError || response);
          connectFailed();
          return;
        }
        
        // Service selected, now authenticate
        chrome.runtime.sendMessage({ 
          type: 'AUTHENTICATE'
        }, authResponse => {
          if (chrome.runtime.lastError || !authResponse || !authResponse.success) {
            console.error('Error authenticating:', chrome.runtime.lastError || authResponse);
            connectFailed();
            return;
          }
          
          // Authentication successful, fetch emails
          tryLoadEmails();
        });
      });
    },
    // Fallback
    connectFailed
  );
  
  function connectFailed() {
    loader.textContent = 'Could not connect to Gmail. Please open the extension directly.';
    createNotification('Please open the Email Cleaner extension directly from your Chrome toolbar');
    
    // Show a button to direct user to the extension
    const directButton = document.createElement('button');
    directButton.textContent = 'Open Extension Directly';
    Object.assign(directButton.style, {
      backgroundColor: '#4285f4',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      padding: '10px 16px',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      margin: '10px 0',
      display: 'block'
    });
    
    // Replace the connect button with this new button
    if (connectButton.parentNode) {
      connectButton.parentNode.insertBefore(directButton, connectButton.nextSibling);
      connectButton.style.display = 'none';
    }
    
    // When clicked, show instructions
    directButton.onclick = () => {
      createNotification('Please click on the Email Cleaner icon in your Chrome toolbar (top-right of the browser)');
    };
  }
}

// Display emails grouped by sender
function displayEmails(threads) {
  const loader = document.getElementById('email-cleaner-loader');
  const groupsContainer = document.getElementById('email-cleaner-groups');
  
  if (!loader || !groupsContainer) return;
  
  // Hide loader
  loader.style.display = 'none';
  
  // Process threads to group by sender
  const senderGroups = {};
  
  threads.forEach(thread => {
    // Try to extract sender from different possible structures
    let sender = 'Unknown Sender';
    
    if (thread.messages && thread.messages.length > 0) {
      const firstMessage = thread.messages[0];
      if (firstMessage.payload && firstMessage.payload.headers) {
        const fromHeader = firstMessage.payload.headers.find(h => 
          h.name.toLowerCase() === 'from' || h.name.toLowerCase() === 'sender'
        );
        if (fromHeader && fromHeader.value) {
          sender = fromHeader.value;
          // Clean up email format like "Name <email@example.com>"
          const matches = sender.match(/(.+?)\s*<.+?>/);
          if (matches) {
            sender = matches[1].trim();
          }
        }
      }
    }
    
    // Initialize group if new
    if (!senderGroups[sender]) {
      senderGroups[sender] = {
        count: 0,
        emails: []
      };
    }
    
    // Add thread to group
    senderGroups[sender].emails.push(thread);
    senderGroups[sender].count++;
  });
  
  // Convert to array and sort by count
  const sortedGroups = Object.keys(senderGroups)
    .map(sender => ({
      sender,
      count: senderGroups[sender].count,
      emails: senderGroups[sender].emails
    }))
    .sort((a, b) => b.count - a.count);
  
  // Create UI for each group
  if (sortedGroups.length === 0) {
    // Replace innerHTML with DOM creation
    groupsContainer.textContent = ''; // Clear first
    const noEmailsText = document.createElement('p');
    noEmailsText.textContent = 'No emails found';
    noEmailsText.style.textAlign = 'center';
    noEmailsText.style.color = '#666';
    groupsContainer.appendChild(noEmailsText);
    return;
  }
  
  // Clear container
  groupsContainer.textContent = '';
  
  // Add each group
  sortedGroups.forEach(group => {
    const groupElement = document.createElement('div');
    groupElement.className = 'email-group';
    Object.assign(groupElement.style, {
      marginBottom: '12px',
      padding: '12px',
      backgroundColor: '#f5f5f5',
      borderRadius: '4px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    });
    
    // Group header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    });
    
    // Sender info - replace innerHTML with DOM creation
    const senderInfo = document.createElement('div');
    
    // Create sender name element
    const senderName = document.createElement('strong');
    senderName.textContent = group.sender;
    senderInfo.appendChild(senderName);
    
    // Add a space
    senderInfo.appendChild(document.createTextNode(' '));
    
    // Create count element
    const countSpan = document.createElement('span');
    countSpan.textContent = `(${group.count})`;
    countSpan.style.color = '#666';
    senderInfo.appendChild(countSpan);
    
    header.appendChild(senderInfo);
    
    // Delete all button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete All';
    Object.assign(deleteButton.style, {
      backgroundColor: '#f44336',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      padding: '6px 12px',
      fontSize: '12px',
      cursor: 'pointer'
    });
    
    // Delete all handler
    deleteButton.onclick = () => {
      // Extract message IDs
      const messageIds = extractMessageIds(group.emails);
      
      if (messageIds.length === 0) {
        createNotification('No message IDs found to delete');
        return;
      }
      
      // Update UI to indicate deletion in progress
      deleteButton.textContent = 'Deleting...';
      deleteButton.disabled = true;
      
      // Use long-lived port connection
      deleteWithPortConnection(messageIds);
      
      // Delete emails using a long-lived port connection
      function deleteWithPortConnection(ids) {
        let port = null;
        let portTimeout = null;
        let lastProgressMessage = 'Starting...';
        let operationCompleted = false;

        try {
          createNotification('Connecting to Gmail...');
          
          port = chrome.runtime.connect({ name: 'gmail_deletion' });
          
          // Listen for messages
          port.onMessage.addListener((response) => {
            console.log('[Port Listener] Message:', response);
            // Reset timeout on any message activity
            clearTimeout(portTimeout);
            startPortTimeout(); 
            
            switch (response.type) {
              case 'ACKNOWLEDGED':
                lastProgressMessage = 'Request received by background...';
                createNotification(lastProgressMessage);
                break;
              case 'AUTH_SUCCESS':
                lastProgressMessage = 'Authenticated. Initializing...';
                createNotification(lastProgressMessage);
                break;
              case 'DELETE_PROGRESS':
                lastProgressMessage = response.message || 'Processing...';
                createNotification(lastProgressMessage);
                break;
              case 'DELETE_SUCCESS':
                operationCompleted = true;
                cleanupAndFinish(null, response.count);
                break;
              case 'ERROR':
                operationCompleted = true;
                cleanupAndFinish(response.error || 'Unknown error');
                break;
              default:
                 console.warn('[Port Listener] Unknown message type:', response.type);
            }
          });
          
          // Handle disconnection
          port.onDisconnect.addListener(() => {
            console.log('[Port Disconnect] Port disconnected.');
            clearTimeout(portTimeout);
            // Only show error if the operation wasn't explicitly completed
            if (!operationCompleted) {
              const errorMsg = chrome.runtime.lastError ? 
                  `Connection lost: ${chrome.runtime.lastError.message}` : 
                  'Connection lost unexpectedly.';
              deleteFailed(errorMsg + ` (Last status: ${lastProgressMessage})`);
            }
            port = null; // Ensure port is marked as null
          });
          
          // Send initial request
          port.postMessage({
            type: 'DELETE_EMAILS',
            service: 'gmail',
            messageIds: ids
          });
          
          // Start initial timeout
          startPortTimeout();
          
        } catch (error) {
          console.error('[Port Setup] Error:', error);
          cleanupAndFinish('Failed to connect: ' + error.message);
        }
        
        // Helper to start/reset the inactivity timeout
        function startPortTimeout() {
          clearTimeout(portTimeout);
          portTimeout = setTimeout(() => {
            console.warn('[Port Timeout] No activity for 60 seconds.');
            cleanupAndFinish('Operation timed out due to inactivity. Please try again.');
          }, 60000); // 60 second timeout
        }
        
        // Helper to clean up resources and finalize UI
        function cleanupAndFinish(error = null, count = 0) {
           clearTimeout(portTimeout);
           if (port) {
              try { port.disconnect(); } catch(e){} 
              port = null;
           }
           
           if (error) {
              deleteFailed(error);
           } else {
              deleteSuccessful(count);
           }
        }
      }
      
      function deleteFailed(message = 'Failed to delete emails.') {
        console.error('Delete operation failed:', message);
        createNotification(message);
        deleteButton.textContent = 'Delete All';
        deleteButton.disabled = false;
      }
      
      function deleteSuccessful(count) {
        createNotification(`Successfully deleted ${count} email${count !== 1 ? 's' : ''}`);
        
        // Remove this group from the UI
        if (groupElement.parentNode) {
          groupElement.parentNode.removeChild(groupElement);
        }
        
        // If no groups left, show message
        if (groupsContainer.children.length === 0) {
          // Replace innerHTML with DOM creation
          const noEmailsText = document.createElement('p');
          noEmailsText.textContent = 'No emails remaining';
          noEmailsText.style.textAlign = 'center';
          noEmailsText.style.color = '#666';
          groupsContainer.appendChild(noEmailsText);
        }
        
        // Refresh the inbox after a short delay
        console.log('Deletion successful, scheduling inbox refresh...');
        setTimeout(() => {
          console.log('Executing scheduled inbox refresh.');
          refreshInbox();
        }, 500); // Add a 500ms delay before refreshing
      }
    };
    
    header.appendChild(deleteButton);
    groupElement.appendChild(header);
    
    // Add to container
    groupsContainer.appendChild(groupElement);
  });
}

// Helper to extract message IDs from emails
function extractMessageIds(emails) {
  const messageIds = [];
  
  emails.forEach(email => {
    // If it's a thread with messages array
    if (email.messages && Array.isArray(email.messages)) {
      email.messages.forEach(message => {
        if (message.id) {
          messageIds.push(message.id);
        }
      });
    }
    // If it has a direct id property
    else if (email.id) {
      messageIds.push(email.id);
    }
  });
  
  return messageIds;
}

// Function to attempt opening Email Cleaner
async function attemptOpenEmailCleaner() {
  console.log('Attempting to open Email Cleaner...');
  
  // Show our standalone panel immediately
  openEmailCleaner();
  
  // Notify background script that panel was opened
  try {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ 
        type: 'PANEL_OPENED',
        location: window.location.href
      });
    }
  } catch (e) {
    console.error('Error notifying background script:', e);
  }
  
  return true;
}

// Function to open the email cleaner interface
function openEmailCleaner() {
  console.log("🔍 [ContentScript] Opening Email Cleaner in standalone mode");
  
  // Show our standalone panel
  showStandalonePanel();
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
    
    // Click handler to open extension interface
    btn.onclick = async () => {
      console.log("Button clicked - attempting to open Email Cleaner");
      const success = await attemptOpenEmailCleaner();
      
      // If opening failed, show manual instructions
      if (!success) {
        showManualInstructions();
      }
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

// Diagnostic content script
console.log("Email Cleaner Diagnostic Script v2 loaded");

// Create very basic styles for our diagnostic elements
const diagStyles = {
  position: 'fixed',
  zIndex: '10000',
  backgroundColor: 'white',
  border: '1px solid #ccc',
  padding: '10px',
  boxShadow: '0 0 10px rgba(0,0,0,0.3)',
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#333',
  maxWidth: '90%',
  maxHeight: '90%',
  overflow: 'auto',
  lineHeight: '1.5'
};

// Create a diagnostic button
function createDiagButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Open Email Cleaner';
  btn.id = 'email-cleaner-diag-btn';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    zIndex: '9999',
    padding: '8px 16px',
    backgroundColor: '#4285f4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer'
  });
  
  btn.onclick = attemptOpenEmailCleaner;
  
  document.body.appendChild(btn);
  console.log('Email Cleaner button added');
}

// Show instructions for manually opening the extension
function showManualInstructions() {
  console.log('Showing manual instructions');
  
  // Create a notification element with instructions
  const notification = createNotification(
    'Please click the Email Cleaner icon in your Chrome toolbar (top right of browser)',
    15000 // Show for 15 seconds
  );
  
  // Make it more noticeable
  Object.assign(notification.style, {
    backgroundColor: 'rgba(66, 133, 244, 0.9)',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
    fontSize: '15px',
    padding: '16px'
  });
  
  // Create SVG element programmatically to avoid Trusted Types error
  const iconIndicator = document.createElement('div');
  
  // Create SVG element and set attributes
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  
  // Create path element and set attributes
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 18l8.5-6L4 6v12zm12-12v12h2V6h-2z');
  path.setAttribute('fill', 'white');
  
  // Append path to SVG and SVG to container
  svg.appendChild(path);
  iconIndicator.appendChild(svg);
  
  Object.assign(iconIndicator.style, {
    position: 'fixed',
    top: '10px',
    right: '20px',
    zIndex: '9999',
    backgroundColor: 'rgba(66, 133, 244, 0.9)',
    borderRadius: '50%',
    padding: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
    animation: 'pulse 1.5s infinite'
  });
  
  // Add keyframe animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
  
  // Add to page and remove after some time
  document.body.appendChild(iconIndicator);
  setTimeout(() => {
    if (iconIndicator.parentNode) {
      document.body.removeChild(iconIndicator);
    }
  }, 15000);
}

// Run diagnostics to help user troubleshoot
function runDiagnostics() {
  console.log('Running diagnostics...');
  
  // Create diagnostic panel
  const panel = document.createElement('div');
  panel.id = 'email-cleaner-diag-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    zIndex: '10000',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    padding: '10px',
    boxShadow: '0 0 10px rgba(0,0,0,0.3)',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#333',
    maxWidth: '90%',
    maxHeight: '90%',
    overflow: 'auto',
    lineHeight: '1.5',
    top: '50px',
    left: '50px',
    width: '80%',
    height: '80%'
  });
  
  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.marginBottom = '10px';
  closeBtn.onclick = () => document.body.removeChild(panel);
  panel.appendChild(closeBtn);
  
  // Create results container
  const results = document.createElement('div');
  results.id = 'diag-results';
  panel.appendChild(results);
  
  // Add to page
  document.body.appendChild(panel);
  
  // Run some tests
  addResult('Diagnostic Started', 'Checking extension status...');
  testChrome();
  testRuntime();
  testSendMessage();
  testRuntimeId();
}

// Add result to diagnostic panel
function addResult(title, content, isError = false) {
  const results = document.getElementById('diag-results');
  if (!results) return;
  
  const resultItem = document.createElement('div');
  resultItem.style.marginBottom = '10px';
  resultItem.style.padding = '5px';
  resultItem.style.border = `1px solid ${isError ? 'red' : '#ddd'}`;
  resultItem.style.backgroundColor = isError ? '#ffebee' : '#fff';
  
  const titleElem = document.createElement('div');
  titleElem.textContent = title;
  titleElem.style.fontWeight = 'bold';
  titleElem.style.marginBottom = '5px';
  resultItem.appendChild(titleElem);
  
  const contentElem = document.createElement('pre');
  contentElem.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  contentElem.style.margin = '0';
  contentElem.style.whiteSpace = 'pre-wrap';
  contentElem.style.wordBreak = 'break-word';
  resultItem.appendChild(contentElem);
  
  results.appendChild(resultItem);
  console.log(`Diagnostic result: ${title}`, content);
}

// Test if Chrome object exists
function testChrome() {
  try {
    const chromeExists = typeof chrome !== 'undefined';
    addResult('Chrome object exists', chromeExists ? 'Yes' : 'No', !chromeExists);
  } catch (e) {
    addResult('Error testing Chrome', e.message, true);
  }
}

// Test if chrome.runtime exists
function testRuntime() {
  try {
    const runtimeExists = typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
    addResult('chrome.runtime exists', runtimeExists ? 'Yes' : 'No', !runtimeExists);
  } catch (e) {
    addResult('Error testing chrome.runtime', e.message, true);
  }
}

// Test if chrome.runtime.sendMessage exists
function testSendMessage() {
  try {
    const sendMessageExists = typeof chrome !== 'undefined' && 
                             typeof chrome.runtime !== 'undefined' && 
                             typeof chrome.runtime.sendMessage === 'function';
    addResult('chrome.runtime.sendMessage exists', sendMessageExists ? 'Yes' : 'No', !sendMessageExists);
    
    // Try sending a PING message
    if (sendMessageExists) {
      chrome.runtime.sendMessage({ type: 'PING' }, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          addResult('PING result', `Error: ${lastError.message}`, true);
        } else {
          addResult('PING result', `Success: ${JSON.stringify(response)}`);
        }
      });
    }
  } catch (e) {
    addResult('Error testing sendMessage', e.message, true);
  }
}

// Test if chrome.runtime.id exists
function testRuntimeId() {
  try {
    const hasId = typeof chrome !== 'undefined' && 
                  typeof chrome.runtime !== 'undefined' && 
                  !!chrome.runtime.id;
    
    const idValue = hasId ? chrome.runtime.id : 'Not available';
    addResult('chrome.runtime.id', idValue, !hasId);
    
    if (!hasId && typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined') {
      addResult('Context likely invalid', 'The extension context is probably invalid, which happens when the extension is updated/reloaded', true);
    }
  } catch (e) {
    addResult('Error testing runtime.id', e.message, true);
  }
}

console.log("Email Cleaner script ready");

// Add context menu for diagnostics
document.addEventListener('contextmenu', function(e) {
  if (e.target.id === 'email-cleaner-button') {
    e.preventDefault();
    
    // Toggle diagnostics panel on right-click
    const existingPanel = document.getElementById('email-cleaner-diag-panel');
    if (existingPanel) {
      document.body.removeChild(existingPanel);
    } else {
      runDiagnostics();
    }
  }
});

// Test extension connectivity and display status to user
function testExtensionConnectivity() {
  const statusPanel = document.createElement('div');
  Object.assign(statusPanel.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: 'white',
    padding: '10px',
    borderRadius: '5px',
    zIndex: '10000',
    fontFamily: 'monospace',
    fontSize: '12px',
    maxWidth: '300px'
  });
  
  statusPanel.textContent = 'Testing extension connectivity...';
  document.body.appendChild(statusPanel);
  
  let results = [];
  
  // Check Chrome API availability
  if (typeof chrome === 'undefined') {
    results.push('❌ Chrome API not available');
  } else {
    results.push('✅ Chrome API available');
    
    // Check runtime
    if (typeof chrome.runtime === 'undefined') {
      results.push('❌ chrome.runtime not available');
    } else {
      results.push('✅ chrome.runtime available');
      
      // Check runtime ID
      if (!chrome.runtime.id) {
        results.push('❌ Invalid extension context (no runtime.id)');
      } else {
        results.push(`✅ Valid extension context (ID: ${chrome.runtime.id.substring(0,6)}...)`);
        
        // Test ping to background
        try {
          chrome.runtime.sendMessage({ type: 'PING' }, response => {
            if (chrome.runtime.lastError) {
              results.push(`❌ Background connection error: ${chrome.runtime.lastError.message}`);
            } else if (response) {
              results.push(`✅ Background responded to ping: ${JSON.stringify(response).substring(0, 40)}...`);
            } else {
              results.push('❌ Background did not respond to ping');
            }
            
            // Finally check auth
            chrome.runtime.sendMessage({ type: 'AUTHENTICATE_GMAIL_DIRECTLY' }, authResponse => {
              if (chrome.runtime.lastError) {
                results.push(`❌ Auth error: ${chrome.runtime.lastError.message}`);
              } else if (authResponse && authResponse.success) {
                results.push('✅ Gmail authentication successful');
              } else {
                results.push(`❌ Gmail auth failed: ${authResponse?.error || 'unknown reason'}`);
              }
              
              updateStatus();
            });
          });
        } catch (e) {
          results.push(`❌ Error sending ping: ${e.message}`);
          updateStatus();
        }
      }
    }
  }
  
  function updateStatus() {
    statusPanel.innerHTML = '<strong>Extension Status:</strong><br>' + results.join('<br>');
    
    // Auto remove after 15 seconds
    setTimeout(() => {
      if (statusPanel.parentNode) {
        document.body.removeChild(statusPanel);
      }
    }, 15000);
  }
  
  updateStatus();
}

// Add the test function to the global scope for debugging
window.testEmailCleanerExtension = testExtensionConnectivity;

// Function to refresh Gmail inbox by forcing DOM repaint
function refreshInbox() {
  if (!isGmail) return; // Only for Gmail
  
  console.log('[refreshInbox] Attempting refresh via DOM repaint and button click...');
  createNotification('Refreshing inbox...', 2000);
  
  try {
    // Method 1: Force repaint of the email list container
    let repaintAttempted = false;
    const listContainers = [
      document.querySelector('div[gh="tl"] table[role="grid"]'), // Most specific list grid
      document.querySelector('div[role="main"] table[role="grid"]'), // Main grid
      document.querySelector('.Cp table[role="grid"]'),           // Grid inside .Cp
      document.querySelector('.AO table[role="grid"]'),           // Grid inside .AO
      document.querySelector('div[gh="tl"]')                       // Threadlist container
    ].filter(el => el && el.offsetParent !== null);
    
    if (listContainers.length > 0) {
      console.log(`[refreshInbox] Found ${listContainers.length} potential list containers. Attempting repaint...`);
      listContainers.forEach((container, index) => {
        try {
          // Add a temporary class to trigger style recalculation/repaint
          const tempClass = 'email-cleaner-refresh-pulse';
          container.classList.add(tempClass);
          
          // Ensure the style exists
          if (!document.getElementById('email-cleaner-temp-style')) {
            const style = document.createElement('style');
            style.id = 'email-cleaner-temp-style';
            // Minimal style change to trigger repaint
            style.textContent = `.${tempClass} { opacity: 0.999 !important; }`; 
            document.head.appendChild(style);
          }
          
          // Remove the class after a short delay
          setTimeout(() => {
            container.classList.remove(tempClass);
            console.log(`[refreshInbox] Repaint forced on container ${index + 1}`);
            
            // Clean up the style element after the last container
            if (index === listContainers.length - 1 && document.getElementById('email-cleaner-temp-style')) {
              document.head.removeChild(document.getElementById('email-cleaner-temp-style'));
            }
          }, 50); 
        } catch (e) {
          console.error(`[refreshInbox] Error forcing repaint on container ${index + 1}:`, e);
        }
      });
      repaintAttempted = true;
    } else {
      console.log('[refreshInbox] No visible list containers found for repaint.');
    }

    // Method 2: Click the refresh button as a fallback or additional trigger
    // Run this slightly after the repaint attempt
    setTimeout(() => {
        console.log('[refreshInbox] Attempting refresh button click...');
        const refreshButtons = document.querySelectorAll('[aria-label="Refresh"], .T-I.nu.T-I-ax7, .asa[role="button"]');
        let buttonClicked = false;
        
        for (const btn of Array.from(refreshButtons)) {
          if (btn && btn.offsetParent !== null) {
            try {
                btn.click();
                console.log('[refreshInbox] Clicked refresh button.');
                buttonClicked = true;
                // Optionally click again
                // setTimeout(() => { try { btn.click(); } catch(e){} }, 100);
                break; // Exit after clicking the first visible button
            } catch (e) {
                console.error('[refreshInbox] Error clicking refresh button:', e);
            }
          }
        }
        if (!buttonClicked) {
            console.log('[refreshInbox] No visible refresh button found or clicked.');
        }
    }, repaintAttempted ? 150 : 50); // Add slight delay if repaint was attempted

  } catch (e) {
    console.error('[refreshInbox] General error during refresh:', e);
    createNotification('Could not refresh inbox automatically', 3000);
  }
}