// Fixed version of the extension icon click handler
// Copy this code into background.js replacing the existing chrome.action.onClicked handler

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
        console.log("🔔 Extension icon clicked on Gmail/Outlook — attempting to open sliding panel");
        
        try {
          chrome.tabs.sendMessage(tab.id, { type: "OPEN_SLIDING_PANEL" }, (response) => {
            // Handle any errors
            if (chrome.runtime.lastError) {
              console.log('Error opening sliding panel:', chrome.runtime.lastError);
              // If there's an error, reload the tab to ensure content script is loaded
              chrome.tabs.reload(tab.id);
            } else {
              console.log('Successfully opened sliding panel:', response);
            }
          });
        } catch (error) {
          console.error('Error sending message to tab:', error);
          chrome.tabs.reload(tab.id);
        }
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