// Content script to interact with email pages
console.log("Email Cleaner Content Script v1.0.5 loaded");

// Global flag to track deletion operations
let isDeleteOperationInProgress = false;

// Add this code to protect the panel from being removed during deletion operations
// Place it at the top level of the file after the global variables

// Create a MutationObserver to detect if the panel is being removed during deletion
const panelProtectionObserver = new MutationObserver((mutations) => {
  // Skip if no deletion is in progress
  if (!isDeleteOperationInProgress) return;
  
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
      // Check if our panel was removed
      for (let i = 0; i < mutation.removedNodes.length; i++) {
        const node = mutation.removedNodes[i];
        if (node.id === 'email-cleaner-panel') {
          console.log('⚠️ PANEL PROTECTION: Panel removed during deletion! Re-creating it.');
          
          // Stop current observation to avoid infinite loops
          panelProtectionObserver.disconnect();
          
          // Create the panel again
          setTimeout(() => {
            showStandalonePanel();
            // Resume observation
            observePanelRemoval();
          }, 100);
          
          // Break after handling the panel
          break;
        }
      }
    }
  }
});

// Function to start observing for panel removal
function observePanelRemoval() {
  panelProtectionObserver.observe(document.body, { 
    childList: true,
    subtree: false
  });
}

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
    e.stopPropagation(); // Prevent panel from closing
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
  closeButton.onclick = (e) => {
    e.stopPropagation(); // Prevent event propagation
    removeStandalonePanel(true); // Force close
  };
  header.appendChild(closeButton);
  
  // Create tab navigation
  const tabNav = document.createElement('div');
  Object.assign(tabNav.style, {
    display: 'flex',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f8f8f8'
  });
  
  // Tab content container
  const content = document.createElement('div');
  content.id = 'email-cleaner-content';
  Object.assign(content.style, {
    padding: '16px',
    overflowY: 'auto',
    height: 'calc(100% - 86px)', // Subtract header and tabs height
    boxSizing: 'border-box'
  });
  
  // Define tabs
  const tabs = [
    { id: 'emails', label: 'Emails' },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' }
  ];
  
  // Create tabs
  tabs.forEach((tab, index) => {
    const tabButton = document.createElement('button');
    tabButton.textContent = tab.label;
    tabButton.dataset.tabId = tab.id;
    Object.assign(tabButton.style, {
      padding: '10px 16px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: index === 0 ? 'bold' : 'normal',
      borderBottom: index === 0 ? '2px solid #4285f4' : 'none',
      color: index === 0 ? '#4285f4' : '#666'
    });
    
    tabButton.onclick = (e) => {
      e.stopPropagation(); // Prevent panel from closing when switching tabs
      
      // Update tab buttons
      Array.from(tabNav.children).forEach(btn => {
        btn.style.fontWeight = 'normal';
        btn.style.borderBottom = 'none';
        btn.style.color = '#666';
      });
      tabButton.style.fontWeight = 'bold';
      tabButton.style.borderBottom = '2px solid #4285f4';
      tabButton.style.color = '#4285f4';
      
      // Update content
      showTabContent(tab.id);
    };
    
    tabNav.appendChild(tabButton);
  });
  
  // Add components to panel
  panel.appendChild(header);
  panel.appendChild(tabNav);
  panel.appendChild(content);
  
  // Prevent panel from closing when clicking inside it
  panel.onclick = (e) => {
    e.stopPropagation();
  };
  
  // Add to page
  document.body.appendChild(panel);
  
  // Start observing for panel removal
  observePanelRemoval();
  
  // Animate in after a short delay
  setTimeout(() => {
    panel.style.transform = 'translateX(0)';
  }, 10);
  
  // Add event listener for closing when clicking outside
  document.addEventListener('click', handleOutsideClick);
  
  // Show default tab (emails)
  showTabContent('emails');
  
  return panel;
}

// Tab content creators
function createEmailsTab(container) {
  // Create a loading indicator
  const loader = document.createElement('div');
  loader.id = 'email-cleaner-loader';
  Object.assign(loader.style, {
    textAlign: 'center',
    padding: '20px',
    color: '#666'
  });
  loader.textContent = 'Analyzing emails...';
  container.appendChild(loader);
  
  // Add info text
  const info = document.createElement('p');
  info.textContent = 'This simplified version allows you to view and manage your emails grouped by sender.';
  Object.assign(info.style, {
    marginBottom: '20px',
    color: '#666',
    fontSize: '14px'
  });
  container.appendChild(info);
  
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
  container.appendChild(helpText);
  
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
  container.appendChild(connectButton);
  
  // Create email groups container
  const groupsContainer = document.createElement('div');
  groupsContainer.id = 'email-cleaner-groups';
  container.appendChild(groupsContainer);
  
  // Try to load emails immediately
  setTimeout(() => {
    tryLoadEmails();
  }, 500);
}

function createSubscriptionsTab(container) {
  // Add description
  const description = document.createElement('p');
  description.textContent = 'Manage your email subscriptions. This tab shows newsletters and promotional emails you rarely open.';
  container.appendChild(description);
  
  // Add loading indicator
  const loader = document.createElement('div');
  loader.textContent = 'Loading subscription data...';
  Object.assign(loader.style, {
    textAlign: 'center',
    padding: '20px',
    color: '#666'
  });
  container.appendChild(loader);
  
  // Create subscriptions container
  const subscriptionsContainer = document.createElement('div');
  subscriptionsContainer.id = 'subscriptions-container';
  container.appendChild(subscriptionsContainer);
  
  // Load the subscriptions data
  safelyCallChromeAPI(
    // API call
    () => {
      console.log("Requesting subscription data with email details");
      chrome.runtime.sendMessage({ 
        type: 'GET_SUBSCRIPTIONS',
        includeEmails: true  // Request full email details
      }, response => {
        // Remove loader
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
        
        if (chrome.runtime.lastError) {
          console.error('Error loading subscriptions:', chrome.runtime.lastError);
          showError('Could not load subscription data. Please try again later.');
          return;
        }
        
        if (!response || !response.success) {
          console.error('Error response:', response);
          showError('Could not load subscription data: ' + (response?.error || 'Unknown error'));
          return;
        }
        
        // Show subscriptions
        displaySubscriptions(response.subscriptions || []);
      });
    },
    // Fallback
    () => {
      // Remove loader
      if (loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
      showError('Could not connect to extension. Please try again later.');
    }
  );
  
  // Helper to show error
  function showError(message) {
    const errorElem = document.createElement('div');
    
    // If the error is an object, try to extract useful information
    if (typeof message === 'object') {
      try {
        message = JSON.stringify(message, null, 2);
      } catch (e) {
        message = 'Unknown error (cannot display details)';
      }
    }
    
    errorElem.textContent = message;
    Object.assign(errorElem.style, {
      color: '#d32f2f',
      padding: '16px',
      textAlign: 'center',
      backgroundColor: '#ffebee',
      borderRadius: '4px',
      marginTop: '16px'
    });
    subscriptionsContainer.appendChild(errorElem);
    
    // Add a retry button
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Retry';
    Object.assign(retryButton.style, {
      backgroundColor: '#4285f4',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      padding: '8px 16px',
      fontSize: '14px',
      cursor: 'pointer',
      margin: '10px auto',
      display: 'block'
    });
    retryButton.onclick = () => {
      // Reload the tab
      const tabButton = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.dataset.tabId === 'subscriptions');
      if (tabButton) {
        tabButton.click();
      }
    };
    subscriptionsContainer.appendChild(retryButton);
  }
  
  // Helper to display subscriptions
  function displaySubscriptions(subscriptions) {
    if (subscriptions.length === 0) {
      const noDataElem = document.createElement('div');
      noDataElem.textContent = 'No subscription data available yet. Please open more emails to build up analytics data.';
      Object.assign(noDataElem.style, {
        padding: '16px',
        textAlign: 'center',
        color: '#666'
      });
      subscriptionsContainer.appendChild(noDataElem);
      return;
    }
    
    // Create a list of subscriptions
    const subsList = document.createElement('div');
    Object.assign(subsList.style, {
      marginTop: '16px'
    });
    
    // Add each subscription
    subscriptions.forEach(sub => {
      const subItem = document.createElement('div');
      Object.assign(subItem.style, {
        padding: '12px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      });
      
      // Sender info
      const senderInfo = document.createElement('div');
      
      // Create name element with category badge
      const nameContainer = document.createElement('div');
      Object.assign(nameContainer.style, {
        display: 'flex',
        alignItems: 'center',
        marginBottom: '4px'
      });
      
      const nameElem = document.createElement('strong');
      nameElem.textContent = sub.name;
      nameContainer.appendChild(nameElem);
      
      // Category badge if available
      if (sub.categoryGuess) {
        const badge = document.createElement('span');
        badge.textContent = sub.categoryGuess;
        Object.assign(badge.style, {
          fontSize: '10px',
          backgroundColor: '#f1f1f1',
          color: '#666',
          borderRadius: '10px',
          padding: '2px 6px',
          marginLeft: '8px'
        });
        nameContainer.appendChild(badge);
      }
      
      senderInfo.appendChild(nameContainer);
      
      // Email and stats
      const emailElem = document.createElement('div');
      emailElem.textContent = sub.email;
      Object.assign(emailElem.style, {
        fontSize: '12px',
        color: '#666'
      });
      senderInfo.appendChild(emailElem);
      
      // Stats
      const statsElem = document.createElement('div');
      statsElem.textContent = `${sub.count} emails received, ${sub.opened} opened`;
      Object.assign(statsElem.style, {
        fontSize: '12px',
        color: '#666',
        marginTop: '2px'
      });
      senderInfo.appendChild(statsElem);
      
      subItem.appendChild(senderInfo);
      
      // Actions
      const actionsDiv = document.createElement('div');
      
      // Delete button with more aggressive event handling
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete All';
      Object.assign(deleteBtn.style, {
        backgroundColor: '#f44336',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '6px 12px',
        marginRight: '8px',
        cursor: 'pointer'
      });
      
      // Delete button with additional event protections
      deleteBtn.addEventListener('click', function(event) {
        // Stop propagation at capture phase
        event.stopPropagation();
        event.preventDefault();
        
        console.log('Subscription Delete button clicked, preventing default and propagation');
        
        // Extract message IDs from subscription emails if they exist
        const messageIds = sub.emails ? extractMessageIds(sub.emails) : [];
        
        if (messageIds.length === 0) {
          createNotification(`No emails found for ${sub.name}`);
          return;
        }
        
        // Update UI to indicate deletion in progress
        this.textContent = 'Deleting...';
        this.disabled = true;
        
        // Use long-lived port connection
        deleteWithPortConnection(messageIds, this, null, null);
        
        // Return false for older browsers
        return false;
      });
      
      // Also prevent mousedown and mouseup from bubbling
      deleteBtn.addEventListener('mousedown', function(event) {
        event.stopPropagation();
      });
      
      deleteBtn.addEventListener('mouseup', function(event) {
        event.stopPropagation();
      });
      
      actionsDiv.appendChild(deleteBtn);
      
      // Unsubscribe button
      const unsubBtn = document.createElement('button');
      unsubBtn.textContent = 'Unsubscribe';
      Object.assign(unsubBtn.style, {
        backgroundColor: '#9e9e9e',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '6px 12px',
        cursor: 'pointer'
      });
      unsubBtn.onclick = () => handleUnsubscribe(sub);
      actionsDiv.appendChild(unsubBtn);
      
      subItem.appendChild(actionsDiv);
      subsList.appendChild(subItem);
    });
    
    subscriptionsContainer.appendChild(subsList);
  }
  
  // Handle deletion of subscription emails
  function handleSubscriptionDelete(subscription, event) {
    // Stop event propagation to prevent it from closing the panel
    event.stopPropagation();
    console.log("Deleting subscription:", subscription);
    
    // Extract message IDs from subscription emails if they exist
    let messageIds = [];
    
    if (subscription.emails && Array.isArray(subscription.emails)) {
      messageIds = extractMessageIds(subscription.emails);
      console.log(`Extracted ${messageIds.length} message IDs from subscription emails`);
    }
    
    if (messageIds.length === 0) {
      createNotification(`No emails found for ${subscription.name || subscription.email}. Try reloading and try again.`);
      return;
    }
    
    // Find the delete button and update its state
    const deleteBtn = event.target;
    if (deleteBtn) {
      deleteBtn.textContent = 'Deleting...';
      deleteBtn.disabled = true;
    }
    
    // Use the existing deletion connection
    deleteWithPortConnection(messageIds, deleteBtn, null, null);
  }
  
  // Handle unsubscribe action
  function handleUnsubscribe(subscription) {
    // Implementation for unsubscribe functionality
    // For now, show a notification that this is coming soon
    createNotification(`Unsubscribe from ${subscription.name} - Coming soon!`);
  }
}

// Function to display the analytics tab content
function createAnalyticsTab(container) {
  // Add description
  const description = document.createElement('p');
  description.textContent = 'Email Analytics helps you understand your email patterns and identify opportunities to clean your inbox.';
  container.appendChild(description);
  
  // Add loading indicator
  const loader = document.createElement('div');
  loader.textContent = 'Loading analytics data...';
  Object.assign(loader.style, {
    textAlign: 'center',
    padding: '20px',
    color: '#666'
  });
  container.appendChild(loader);
  
  // Create analytics container
  const analyticsContainer = document.createElement('div');
  analyticsContainer.id = 'analytics-container';
  container.appendChild(analyticsContainer);
  
  // Load the analytics data
  safelyCallChromeAPI(
    // API call
    () => {
      chrome.runtime.sendMessage({ 
        type: 'GET_EMAIL_ANALYTICS'
      }, response => {
        // Remove loader
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
        
        if (chrome.runtime.lastError) {
          console.error('Error loading analytics:', chrome.runtime.lastError);
          showError('Could not load analytics data. Please try again later.');
          return;
        }
        
        if (!response || !response.success) {
          console.error('Error response:', response);
          showError('Could not load analytics data: ' + (response?.error || 'Unknown error'));
          return;
        }
        
        // Show analytics
        displayAnalytics(response.analytics || {});
      });
    },
    // Fallback
    () => {
      // Remove loader
      if (loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
      showError('Could not connect to extension. Please try again later.');
    }
  );
  
  // Helper to display analytics
  function displayAnalytics(analytics) {
    if (!analytics.topSenders || analytics.topSenders.length === 0) {
      const noDataElem = document.createElement('div');
      noDataElem.textContent = 'No analytics data available yet. Please scan your emails first.';
      Object.assign(noDataElem.style, {
        padding: '16px',
        textAlign: 'center',
        color: '#666'
      });
      analyticsContainer.appendChild(noDataElem);
      
      // Add scan button
      const scanButton = document.createElement('button');
      scanButton.textContent = 'Scan My Inbox';
      Object.assign(scanButton.style, {
        backgroundColor: '#4285f4',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '10px 16px',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: 'pointer',
        margin: '10px auto',
        display: 'block'
      });
      scanButton.onclick = () => {
        scanButton.disabled = true;
        scanButton.textContent = 'Scanning...';
        triggerEmailScan();
      };
      analyticsContainer.appendChild(scanButton);
      
      return;
    }
    
    // Create analytics sections
    const topSendersSection = createAnalyticsSection('Top Email Senders', analytics.topSenders);
    analyticsContainer.appendChild(topSendersSection);
    
    const companiesSection = createAnalyticsSection('Regular Company Emails', analytics.regularCompanies);
    analyticsContainer.appendChild(companiesSection);
    
    const inboxStatsSection = createStatsSection('Inbox Statistics', analytics.stats);
    analyticsContainer.appendChild(inboxStatsSection);
  }
  
  // Create a section for the analytics display
  function createAnalyticsSection(title, data) {
    const section = document.createElement('div');
    Object.assign(section.style, {
      marginBottom: '24px'
    });
    
    const titleElem = document.createElement('h4');
    titleElem.textContent = title;
    Object.assign(titleElem.style, {
      marginBottom: '12px',
      borderBottom: '1px solid #eee',
      paddingBottom: '8px'
    });
    section.appendChild(titleElem);
    
    if (!data || data.length === 0) {
      const noDataElem = document.createElement('p');
      noDataElem.textContent = 'No data available';
      Object.assign(noDataElem.style, {
        color: '#666',
        fontStyle: 'italic'
      });
      section.appendChild(noDataElem);
      return section;
    }
    
    // Create data list
    const list = document.createElement('div');
    
    data.forEach(item => {
      const listItem = document.createElement('div');
      Object.assign(listItem.style, {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid #f5f5f5'
      });
      
      const nameElem = document.createElement('div');
      nameElem.textContent = item.name;
      listItem.appendChild(nameElem);
      
      const countElem = document.createElement('div');
      countElem.textContent = `${item.count} emails`;
      Object.assign(countElem.style, {
        color: '#666'
      });
      listItem.appendChild(countElem);
      
      list.appendChild(listItem);
    });
    
    section.appendChild(list);
    return section;
  }
  
  // Create a section for statistics
  function createStatsSection(title, stats) {
    const section = document.createElement('div');
    Object.assign(section.style, {
      marginBottom: '24px'
    });
    
    const titleElem = document.createElement('h4');
    titleElem.textContent = title;
    Object.assign(titleElem.style, {
      marginBottom: '12px',
      borderBottom: '1px solid #eee',
      paddingBottom: '8px'
    });
    section.appendChild(titleElem);
    
    if (!stats) {
      const noDataElem = document.createElement('p');
      noDataElem.textContent = 'No statistics available';
      Object.assign(noDataElem.style, {
        color: '#666',
        fontStyle: 'italic'
      });
      section.appendChild(noDataElem);
      return section;
    }
    
    // Create stats grid
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '16px'
    });
    
    // Add stats
    const statsToShow = [
      { label: 'Total Senders', value: stats.totalSenders || 0 },
      { label: 'Total Emails', value: stats.totalEmails || 0 },
      { label: 'Newsletters', value: stats.newsletters || 0 },
      { label: 'Shopping', value: stats.shopping || 0 }
    ];
    
    statsToShow.forEach(stat => {
      const statItem = document.createElement('div');
      Object.assign(statItem.style, {
        padding: '12px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        textAlign: 'center'
      });
      
      const valueElem = document.createElement('div');
      valueElem.textContent = stat.value;
      Object.assign(valueElem.style, {
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#4285f4'
      });
      statItem.appendChild(valueElem);
      
      const labelElem = document.createElement('div');
      labelElem.textContent = stat.label;
      Object.assign(labelElem.style, {
        fontSize: '12px',
        color: '#666',
        marginTop: '4px'
      });
      statItem.appendChild(labelElem);
      
      grid.appendChild(statItem);
    });
    
    section.appendChild(grid);
    return section;
  }
  
  // Trigger a scan of the user's emails
  function triggerEmailScan() {
    safelyCallChromeAPI(
      // API call
      () => {
        chrome.runtime.sendMessage({ 
          type: 'SCAN_EMAILS'
        }, response => {
          if (chrome.runtime.lastError) {
            console.error('Error scanning emails:', chrome.runtime.lastError);
            createNotification('Error scanning emails: ' + chrome.runtime.lastError.message);
            return;
          }
          
          if (!response || !response.success) {
            console.error('Scan error:', response);
            createNotification('Error scanning emails: ' + (response?.error || 'Unknown error'));
            return;
          }
          
          // Show success and reload the tab
          createNotification(`Scanned ${response.count || 0} emails successfully!`);
  setTimeout(() => {
            // Reload the analytics tab
            const analyticsButton = Array.from(document.querySelectorAll('button'))
              .find(btn => btn.dataset.tabId === 'analytics');
            if (analyticsButton) {
              analyticsButton.click();
            }
          }, 1000);
        });
      },
      // Fallback
      () => {
        createNotification('Could not connect to the extension. Please try again.');
      }
    );
  }
}

// Function to display the settings tab content
function createSettingsTab(container) {
  // Add description
  const description = document.createElement('p');
  description.textContent = 'Configure Email Cleaner settings and automation.';
  container.appendChild(description);
  
  // Create settings form
  const form = document.createElement('div');
  Object.assign(form.style, {
    marginTop: '20px'
  });
  
  // Auto-clean section
  const autoCleanSection = document.createElement('div');
  Object.assign(autoCleanSection.style, {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px'
  });
  
  const autoCleanTitle = document.createElement('h4');
  autoCleanTitle.textContent = 'Automatic Cleaning';
  Object.assign(autoCleanTitle.style, {
    marginTop: '0',
    marginBottom: '16px'
  });
  autoCleanSection.appendChild(autoCleanTitle);
  
  // Auto-clean toggle
  const autoCleanToggleContainer = document.createElement('div');
  Object.assign(autoCleanToggleContainer.style, {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '16px'
  });
  
  const autoCleanToggle = document.createElement('input');
  autoCleanToggle.type = 'checkbox';
  autoCleanToggle.id = 'auto-clean-toggle';
  autoCleanSection.appendChild(autoCleanToggleContainer);
  
  const autoCleanLabel = document.createElement('label');
  autoCleanLabel.htmlFor = 'auto-clean-toggle';
  autoCleanLabel.textContent = 'Enable automatic inbox cleaning';
  Object.assign(autoCleanLabel.style, {
    marginLeft: '8px'
  });
  
  autoCleanToggleContainer.appendChild(autoCleanToggle);
  autoCleanToggleContainer.appendChild(autoCleanLabel);
  
  // Interval selector
  const intervalContainer = document.createElement('div');
  Object.assign(intervalContainer.style, {
    marginBottom: '16px'
  });
  
  const intervalLabel = document.createElement('label');
  intervalLabel.htmlFor = 'clean-interval';
  intervalLabel.textContent = 'Clean inbox every:';
  Object.assign(intervalLabel.style, {
    display: 'block',
    marginBottom: '8px'
  });
  intervalContainer.appendChild(intervalLabel);
  
  const intervalSelect = document.createElement('select');
  intervalSelect.id = 'clean-interval';
  Object.assign(intervalSelect.style, {
    width: '100%',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd'
  });
  
  // Add interval options
  const intervals = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];
  
  intervals.forEach(interval => {
    const option = document.createElement('option');
    option.value = interval.value;
    option.textContent = interval.label;
    intervalSelect.appendChild(option);
  });
  
  intervalContainer.appendChild(intervalSelect);
  autoCleanSection.appendChild(intervalContainer);
  
  // Save button
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save Settings';
  Object.assign(saveButton.style, {
    backgroundColor: '#4285f4',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '10px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    width: '100%'
  });
  saveButton.onclick = saveSettings;
  autoCleanSection.appendChild(saveButton);
  
  form.appendChild(autoCleanSection);
  
  // Coming soon section
  const comingSoonSection = document.createElement('div');
  Object.assign(comingSoonSection.style, {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#e8f5e9',
    borderRadius: '4px',
    textAlign: 'center'
  });
  
  const comingSoonTitle = document.createElement('h4');
  comingSoonTitle.textContent = 'Coming Soon';
  Object.assign(comingSoonTitle.style, {
    marginTop: '0',
    color: '#2e7d32'
  });
  comingSoonSection.appendChild(comingSoonTitle);
  
  const comingSoonText = document.createElement('p');
  comingSoonText.textContent = 'Advanced features including auto-unsubscribe, digest mode, and premium filters are coming soon!';
  comingSoonSection.appendChild(comingSoonText);
  
  form.appendChild(comingSoonSection);
  
  container.appendChild(form);
  
  // Load current settings
  loadSettings();
  
  // Helper to load settings
  function loadSettings() {
    safelyCallChromeAPI(
      // API call
      () => {
        chrome.runtime.sendMessage({ 
          type: 'GET_SETTINGS'
        }, response => {
          if (chrome.runtime.lastError) {
            console.error('Error loading settings:', chrome.runtime.lastError);
            debugLogObject('Chrome Runtime Last Error', chrome.runtime.lastError);
            createNotification('Error loading settings: ' + (chrome.runtime.lastError.message || 'Unknown error'));
            return;
          }
          
          if (!response || !response.success) {
            console.error('Settings error:', response);
            debugLogObject('Settings Response Error', response);
            
            // Enhanced error handling to debug the [object Object] issue
            let errorMessage = 'Unknown error';
            
            if (response && response.error) {
              debugLogObject('Response Error Object', response.error);
              
              // Explicit handling of different error types
              if (typeof response.error === 'string') {
                errorMessage = response.error;
              } else if (typeof response.error === 'object') {
                if (response.error === null) {
                  errorMessage = 'Null error object received';
                } else if (response.error.message) {
                  errorMessage = response.error.message;
                } else {
                  try {
                    errorMessage = JSON.stringify(response.error);
                  } catch (e) {
                    errorMessage = 'Complex error object (cannot stringify)';
                  }
                }
              } else {
                errorMessage = String(response.error);
              }
            }
            
            createNotification('Error loading settings: ' + errorMessage);
            return;
          }
          
          // Update form with settings
          const settings = response.settings || {};
          autoCleanToggle.checked = settings.autoCleanEnabled || false;
          
          if (settings.autoCleanInterval) {
            if (settings.autoCleanInterval === 1) {
              intervalSelect.value = 'daily';
            } else if (settings.autoCleanInterval === 7) {
              intervalSelect.value = 'weekly';
            } else if (settings.autoCleanInterval === 30) {
              intervalSelect.value = 'monthly';
            }
          }
        });
      },
      // Fallback
      () => {
        console.error('Could not connect to extension to load settings');
        createNotification('Could not connect to extension to load settings');
      }
    );
  }
  
  // Helper to save settings
  function saveSettings() {
    const intervalValues = {
      'daily': 1,
      'weekly': 7,
      'monthly': 30
    };
    
    const settings = {
      autoCleanEnabled: autoCleanToggle.checked,
      autoCleanInterval: intervalValues[intervalSelect.value] || 7
    };
    
    safelyCallChromeAPI(
      // API call
      () => {
        chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          settings: settings
        }, response => {
          if (chrome.runtime.lastError) {
            console.error('Error saving settings:', chrome.runtime.lastError);
            debugLogObject('Chrome Runtime Last Error', chrome.runtime.lastError);
            createNotification('Error saving settings: ' + (chrome.runtime.lastError.message || 'Unknown error'));
            return;
          }
          
          if (!response || !response.success) {
            console.error('Save settings error:', response);
            debugLogObject('Settings Save Response Error', response);
            
            // Enhanced error handling to debug the [object Object] issue
            let errorMessage = 'Unknown error';
            
            if (response && response.error) {
              debugLogObject('Save Response Error Object', response.error);
              
              // Explicit handling of different error types
              if (typeof response.error === 'string') {
                errorMessage = response.error;
              } else if (typeof response.error === 'object') {
                if (response.error === null) {
                  errorMessage = 'Null error object received';
                } else if (response.error.message) {
                  errorMessage = response.error.message;
                } else {
                  try {
                    errorMessage = JSON.stringify(response.error);
                  } catch (e) {
                    errorMessage = 'Complex error object (cannot stringify)';
                  }
                }
              } else {
                errorMessage = String(response.error);
              }
            }
            
            createNotification('Error saving settings: ' + errorMessage);
            return;
          }
          
          createNotification('Settings saved successfully');
        });
      },
      // Fallback
      () => {
        createNotification('Could not connect to extension to save settings');
      }
    );
  }
}

// Function to remove the standalone panel
function removeStandalonePanel(force = false) {
  console.log("Attempting to remove panel, force:", force, "deletion in progress:", isDeleteOperationInProgress);
  
  // Extra defensive check - if deletion is happening, don't close unless forced
  if (!force && isDeleteOperationInProgress) {
    console.log('PREVENTED: Deletion in progress, panel close prevented');
    return false; // Indicate closure was prevented
  }
  
  const panel = document.getElementById('email-cleaner-panel');
  if (panel) {
    console.log('Removing panel');
    
    // Animate out
    panel.style.transform = 'translateX(450px)';
    
    // Remove after animation completes
    setTimeout(() => {
      if (panel && panel.parentNode) {
        document.body.removeChild(panel);
        console.log('Panel removed from DOM');
      }
    }, 300);
    
    // Remove click listener
    document.removeEventListener('click', handleOutsideClick);
    return true; // Indicate panel was closed
  }
  return false; // Panel wasn't found
}

// Handle clicks outside the panel to close it
function handleOutsideClick(event) {
  // If deletion is in progress, don't allow closing via outside click
  if (isDeleteOperationInProgress) {
    console.log('IGNORED outside click: deletion in progress');
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  
  const panel = document.getElementById('email-cleaner-panel');
  const button = document.getElementById('email-cleaner-button');
  
  if (panel && !panel.contains(event.target) && event.target !== button) {
    console.log('Outside click detected, closing panel');
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
    
    // Delete all button with more aggressive event handling
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
    
    // Delete all handler with additional event protections
    deleteButton.addEventListener('click', function(event) {
      // Stop propagation at capture phase
      event.stopPropagation();
      event.preventDefault();
      
      console.log('Delete All button clicked, preventing default and propagation');
      
      // Extract message IDs
      const messageIds = extractMessageIds(group.emails);
      
      if (messageIds.length === 0) {
        createNotification('No message IDs found to delete');
        return;
      }
      
      // Update UI to indicate deletion in progress
      this.textContent = 'Deleting...';
      this.disabled = true;
      
      // Use long-lived port connection
      deleteWithPortConnection(messageIds, this, groupElement, groupsContainer);
      
      // Return false for older browsers
      return false;
    });
    
    // Also prevent mousedown and mouseup from bubbling
    deleteButton.addEventListener('mousedown', function(event) {
      event.stopPropagation();
    });
    
    deleteButton.addEventListener('mouseup', function(event) {
      event.stopPropagation();
    });
    
    header.appendChild(deleteButton);
    groupElement.appendChild(header);
    
    // Add to container
    groupsContainer.appendChild(groupElement);
  });
}

// Helper to extract message IDs from emails
function extractMessageIds(emails) {
  const messageIds = [];
  
  if (!emails || !Array.isArray(emails)) {
    console.warn('extractMessageIds: Invalid emails data:', emails);
    return messageIds;
  }
  
  emails.forEach(email => {
    console.log("Processing email for ID extraction:", email);
    
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
    // Gmail API format - if it's a thread ID
    else if (typeof email === 'object' && email.id) {
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

// Add this debug logging function at the top of the file (after existing imports/declarations)
function debugLogObject(label, obj) {
  console.log(`=== DEBUG ${label} ===`);
  console.log("Type:", typeof obj);
  console.log("toString:", String(obj));
  
  if (obj === null) {
    console.log("Value: null");
    return;
  }
  
  if (obj === undefined) {
    console.log("Value: undefined");
    return;
  }
  
  try {
    console.log("JSON.stringify:", JSON.stringify(obj));
  } catch (e) {
    console.log("Cannot stringify:", e.message);
  }
  
  // For error objects
  if (obj instanceof Error) {
    console.log("name:", obj.name);
    console.log("message:", obj.message);
    console.log("stack:", obj.stack);
  }
  
  // Show all properties
  console.log("Properties:");
  try {
    Object.getOwnPropertyNames(obj).forEach(prop => {
      try {
        console.log(`- ${prop}:`, obj[prop]);
      } catch (e) {
        console.log(`- ${prop}: [Error accessing: ${e.message}]`);
      }
    });
  } catch (e) {
    console.log("Error listing properties:", e.message);
  }
  console.log("=== END DEBUG ===");
}

// Update the deleteWithPortConnection function for more aggressive flag management
function deleteWithPortConnection(ids, deleteButton, groupElement, groupsContainer) {
  // Check if we have valid message IDs
  if (!ids || ids.length === 0) {
    console.error("No valid message IDs provided to deleteWithPortConnection");
    if (deleteButton) {
      deleteButton.textContent = 'Delete All';
      deleteButton.disabled = false;
    }
    createNotification("No valid message IDs found to delete");
    return;
  }
  
  console.log(`Deleting ${ids.length} messages:`, ids);
  
  let port = null;
  let portTimeout = null;
  let lastProgressMessage = 'Starting...';
  let operationCompleted = false;

  try {
    // Set the global flag to prevent panel closing
    window.isDeleteOperationInProgress = true; // Access as window property for extra visibility
    isDeleteOperationInProgress = true;
    console.log('⚠️ DELETION STARTED: Setting flag to prevent panel close');
    
    // Make absolutely sure panel is re-rendered to capture flag
    const panel = document.getElementById('email-cleaner-panel');
    if (panel) {
      panel.setAttribute('data-deleting', 'true');
    }
    
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
    window.isDeleteOperationInProgress = false;
    isDeleteOperationInProgress = false;
    console.log('⚠️ DELETION ERROR: Resetting flag due to error');
    
    const panel = document.getElementById('email-cleaner-panel');
    if (panel) {
      panel.removeAttribute('data-deleting');
    }
    
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
    
    // Reset the global flag when operation is complete
    setTimeout(() => {
      // Delay flag reset to ensure UI updates first
      window.isDeleteOperationInProgress = false;
      isDeleteOperationInProgress = false;
      console.log('⚠️ DELETION FINISHED: Resetting flag, panel can close now');
      
      const panel = document.getElementById('email-cleaner-panel');
      if (panel) {
        panel.removeAttribute('data-deleting');
      }
    }, 500);
    
    if (error) {
      deleteFailed(error);
    } else {
      deleteSuccessful(count);
    }
  }
  
  // Handler for failed deletion
  function deleteFailed(message = 'Failed to delete emails.') {
    console.error('Delete operation failed:', message);
    createNotification(message);
    if (deleteButton) {
      deleteButton.textContent = 'Delete All';
      deleteButton.disabled = false;
    }
  }
  
  // Handler for successful deletion
  function deleteSuccessful(count) {
    createNotification(`Successfully deleted ${count} email${count !== 1 ? 's' : ''}. Please refresh your inbox to see the changes.`);
    
    // Remove this group from the UI if group elements were provided
    if (groupElement && groupElement.parentNode) {
      groupElement.parentNode.removeChild(groupElement);
    }
    
    // If no groups left, show message
    if (groupsContainer && groupsContainer.children.length === 0) {
      // Replace innerHTML with DOM creation
      const noEmailsText = document.createElement('p');
      noEmailsText.textContent = 'No emails remaining';
      noEmailsText.style.textAlign = 'center';
      noEmailsText.style.color = '#666';
      groupsContainer.appendChild(noEmailsText);
    }
    
    // Refresh the inbox without reloading the page
    refreshInbox();
  }
}

// Function to refresh the Gmail inbox without reloading the entire page
function refreshInbox() {
  if (!isGmail) return; // Only for Gmail
  
  try {
    console.log('Attempting to refresh Gmail inbox...');
    
    // Method 1: Try to find and click the refresh button
    const refreshButtons = Array.from(document.querySelectorAll('div[role="button"], button'))
      .filter(el => {
        // Find elements that have a refresh icon (using various potential attributes)
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const dataTooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        
        return ariaLabel.includes('refresh') || 
               dataTooltip.includes('refresh') || 
               title.includes('refresh') ||
               ariaLabel.includes('reload') || 
               dataTooltip.includes('reload') || 
               title.includes('reload');
      });
    
    if (refreshButtons.length > 0) {
      console.log('Found refresh button, clicking it...');
      refreshButtons[0].click();
      return;
    }
    
    // Method 2: Try to trigger the keyboard shortcut for refresh (u key in Gmail)
    console.log('No refresh button found, trying keyboard shortcut...');
    
    // Focus on the main content area first
    const contentArea = document.querySelector('div[role="main"]');
    if (contentArea) {
      contentArea.focus();
      
      // Create and dispatch a keyboard event for the 'u' key (Gmail's refresh shortcut)
      const refreshEvent = new KeyboardEvent('keydown', {
        key: 'u',
        code: 'KeyU',
        keyCode: 85,
        which: 85,
        bubbles: true,
        cancelable: true
      });
      
      document.activeElement.dispatchEvent(refreshEvent);
      return;
    }
    
    // Method 3: As a last resort, try to manipulate the URL hash
    console.log('Trying URL hash manipulation...');
    const currentHash = window.location.hash;
    if (currentHash.includes('inbox') || currentHash === '#' || currentHash === '') {
      // Store current hash
      const origHash = window.location.hash;
      
      // Change hash slightly to trigger a reload
      window.location.hash = currentHash + '&refresh=' + Date.now();
      
      // Set it back after a brief delay
      setTimeout(() => {
        window.location.hash = origHash;
      }, 100);
    }
    
  } catch (e) {
    console.error('Error refreshing inbox:', e);
    // Silently fail - this is just a convenience feature
  }
}

// Function to show tab content
function showTabContent(tabId) {
  const contentContainer = document.getElementById('email-cleaner-content');
  contentContainer.innerHTML = ''; // Clear current content
  
  switch(tabId) {
    case 'emails':
      createEmailsTab(contentContainer);
      break;
    case 'subscriptions':
      createSubscriptionsTab(contentContainer);
      break;
    case 'analytics':
      createAnalyticsTab(contentContainer);
      break;
    case 'settings':
      createSettingsTab(contentContainer);
      break;
    default:
      createEmailsTab(contentContainer);
  }
}