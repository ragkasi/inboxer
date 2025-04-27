import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import { fetchEmails } from '../redux/emailSlice';
import './popup.css';
import { 
  sendMessage, 
  serializeError, 
  initializeConnection, 
  wakeUpBackground 
} from '../connection-bridge';

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

function PopupApp() {
  const dispatch = useDispatch();
  const { groups, loading, error } = useSelector(s => s.email);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('checking');

  // Check if background script is available
  useEffect(() => {
    const checkConnection = async () => {
      setConnectionStatus('checking');
      
      try {
        console.log("Initializing connection to background...");
        
        // Initialize connection to background
        await wakeUpBackground();
        
        console.log("Sending PING to background script...");
        
        // Send ping to check status
        let pingResponse = null;
        try {
          pingResponse = await sendMessage({ type: "PING" });
          console.log("PING response:", pingResponse);
        } catch (pingError) {
          console.error("Failed to ping background:", pingError);
          throw pingError;
        }
        
        if (pingResponse && pingResponse.status === "ok") {
          console.log("Background connection successful");
          
          // Get available services
          let servicesResponse = null;
          try {
            servicesResponse = await sendMessage({ type: "GET_SERVICES" });
            console.log("Services response:", servicesResponse);
          } catch (servicesError) {
            console.error("Failed to get services:", servicesError);
            
            // Don't throw error here, still allow connection
            setErrorMsg("Error fetching available services");
          }
          
          setConnectionStatus('connected');
          
          // Check if Gmail service is available
          const gmailAvailable = servicesResponse?.services?.gmail === true;
          
          if (gmailAvailable) {
            console.log("Gmail service available, fetching emails");
            try {
              dispatch(fetchEmails(safeFetchEmails("gmail")));
            } catch (err) {
              console.error("Error dispatching fetchEmails:", err);
              setErrorMsg("Error connecting to Gmail: " + (err.message || String(err)));
            }
          } else {
            console.log("Gmail service not available");
            setErrorMsg("Gmail service not available. Please connect your account first.");
          }
        } else {
          // Handle error or initialization issues
          console.error("Background script not ready:", pingResponse);
          
          // Extract error information if available
          let errorDetails = "";
          if (pingResponse && pingResponse.error) {
            errorDetails = `: ${pingResponse.error}`;
          }
          
          setConnectionStatus('error');
          setErrorMsg(`Connection Error${errorDetails}`);
          
          // Try to initialize the background script
          try {
            console.log("Attempting to initialize background script...");
            const initResponse = await sendMessage({ type: "INITIALIZE" });
            console.log("Initialize response:", initResponse);
            
            if (initResponse && initResponse.success) {
              console.log("Background script initialized successfully, retrying...");
              
              // Retry the connection after initialization
              const retryResponse = await sendMessage({ type: "PING" });
              if (retryResponse && retryResponse.status === "ok") {
                console.log("Retry successful after initialization");
                setConnectionStatus('connected');
                setErrorMsg('');
                
                // Try to get services again
                const retryServicesResponse = await sendMessage({ type: "GET_SERVICES" });
                
                // Check if Gmail service is available after initialization
                const gmailAvailable = retryServicesResponse?.services?.gmail === true;
                if (gmailAvailable) {
                  dispatch(fetchEmails(safeFetchEmails("gmail")));
                } else {
                  setErrorMsg("Gmail service not available. Please connect your account first.");
                }
              }
            }
          } catch (initError) {
            console.error("Failed to initialize background:", initError);
            setErrorMsg("Failed to initialize extension background service. Please try reloading the extension.");
          }
        }
      } catch (error) {
        console.error("Connection error:", error);
        
        // Format error message for display
        const errorMessage = error.message || String(error);
        
        setConnectionStatus('error');
        setErrorMsg(`Connection Error\n${errorMessage}\n\nPlease try reloading the extension or refreshing the page.`);
      }
    };
    
    checkConnection();
  }, [dispatch]);

  const reloadPopup = () => {
    chrome.runtime.reload();
  };

  return (
    <div className="popup-container">
      <h1>Email Cleaner</h1>
      
      {connectionStatus === 'error' ? (
        <div className="error-container">
          <h2>Connection Error</h2>
          <p>{errorMsg}</p>
          <button onClick={reloadPopup} className="reload-button">Reload Popup</button>
        </div>
      ) : errorMsg ? (
        <div className="warning-container">
          <p>{errorMsg}</p>
          <button onClick={reloadPopup} className="reload-button">Reload Popup</button>
        </div>
      ) : connectionStatus === 'checking' ? (
        <div>Connecting to service...</div>
      ) : loading ? (
        <div>Loading emails...</div>  
      ) : error ? (
        <div className="error-container">
          <h2>Error Loading Emails</h2>
          <p>{error}</p>
          <button onClick={() => dispatch(fetchEmails(safeFetchEmails("gmail")))} className="retry-button">
            Retry
          </button>
        </div>
      ) : groups && groups.length > 0 ? (
        <div className="groups-container">
          <h2>Email Groups</h2>
          {groups.map(group => (
            <div key={group.sender} className="email-group">
              <h3>{group.sender} ({group.count})</h3>
              <button onClick={() => {
                console.log(`Deleting all emails from ${group.sender}`, group);
                // Set a loading state for this specific group
                setErrorMsg(`Deleting emails from ${group.sender}...`);
                
                // Get message IDs for this group
                let messageIds = [];
                
                if (group.emails && Array.isArray(group.emails)) {
                  // Extract message IDs based on thread/email structure
                  messageIds = group.emails.flatMap(email => {
                    // If it's a thread with messages array
                    if (email.messages && Array.isArray(email.messages)) {
                      return email.messages.map(message => message.id);
                    }
                    // If it has a direct id property
                    else if (email.id) {
                      return [email.id];
                    }
                    return [];
                  });
                }
                
                if (messageIds.length === 0) {
                  setErrorMsg(`Error: Could not find message IDs for ${group.sender}`);
                  return;
                }
                
                console.log(`Deleting ${messageIds.length} messages from ${group.sender}`);
                
                // Send delete request to background script
                sendMessage({ 
                  type: "CLEAN_EMAILS", 
                  service: "gmail", 
                  messageIds: messageIds 
                })
                .then(response => {
                  console.log("Delete response:", response);
                  if (response.success) {
                    setErrorMsg(`Successfully deleted ${response.count} emails from ${group.sender}`);
                    // Refresh the email list
                    dispatch(fetchEmails(safeFetchEmails("gmail")));
                    
                    // Clear message after a few seconds
                    setTimeout(() => {
                      if (errorMsg.includes(group.sender)) {
                        setErrorMsg('');
                      }
                    }, 3000);
                  } else {
                    // Show error message
                    setErrorMsg(`Error deleting emails: ${response.error || 'Unknown error'}`);
                  }
                })
                .catch(err => {
                  console.error("Delete error:", err);
                  setErrorMsg(`Error deleting emails: ${err.message || String(err)}`);
                });
              }}>Delete All</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-emails">
          <p>No emails found or no account connected.</p>
          <button onClick={() => dispatch(fetchEmails(safeFetchEmails("gmail")))} className="connect-button">
            Connect Gmail Account
          </button>
        </div>
      )}
    </div>
  );
}

// Render the app in the DOM
document.addEventListener('DOMContentLoaded', () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <Provider store={store}>
      <PopupApp />
    </Provider>
  );
});