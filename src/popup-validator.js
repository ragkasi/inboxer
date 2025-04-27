/**
 * Extension Context Validator
 * This module checks if the extension context is valid when the popup loads
 */

// Simple verification that ensures we have a valid extension context
(function checkExtensionContext() {
  try {
    // This will throw if context is invalid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.error('Invalid extension context detected');
      document.addEventListener('DOMContentLoaded', () => {
        const root = document.getElementById('root');
        if (root) {
          root.innerHTML = `
            <div style="padding: 20px; color: #d32f2f; text-align: center;">
              <h2>Extension Error</h2>
              <p>The extension context appears to be invalid.</p>
              <p>Please try reloading the extension from chrome://extensions page.</p>
              <button onclick="chrome.runtime.reload()">Reload Extension</button>
            </div>
          `;
        }
      });
    } else {
      console.log('Extension context valid, popup loading...');
    }
  } catch (e) {
    console.error('Extension context check failed:', e);
    
    // Handle failure case
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = `
          <div style="padding: 20px; color: #d32f2f; text-align: center;">
            <h2>Extension Error</h2>
            <p>The extension context appears to be invalid.</p>
            <p>Error: ${e.message || 'Unknown error'}</p>
            <p>Please try reloading the extension from chrome://extensions page.</p>
          </div>
        `;
      }
    });
  }
})(); 