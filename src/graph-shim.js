/**
 * This script intercepts attempts to load the Microsoft Graph SDK from CDN
 * and provides the functionality that's already bundled with our extension.
 * 
 * This prevents Content Security Policy violations when the SDK tries to 
 * load itself from jsdelivr.
 */

// Monitor for script injection attempts
const originalCreateElement = document.createElement;

document.createElement = function(tagName) {
  const element = originalCreateElement.call(document, tagName);
  
  if (tagName.toLowerCase() === 'script') {
    // Add a setter to the src property to intercept CDN requests
    const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    
    Object.defineProperty(element, 'src', {
      set: function(value) {
        // Check if this is a request for the Microsoft Graph SDK
        if (value && value.includes('microsoft-graph-client') && value.includes('cdn.jsdelivr.net')) {
          console.log('Intercepted attempt to load Microsoft Graph SDK from CDN:', value);
          
          // Instead of loading from CDN, we'll do nothing since the SDK is already bundled
          // We can optionally trigger a load event to make the script think it succeeded
          setTimeout(() => {
            const loadEvent = new Event('load');
            element.dispatchEvent(loadEvent);
          }, 0);
          
          return value; // Return the value even though we didn't set it
        }
        
        // For all other scripts, use the original setter
        return originalSrcDescriptor.set.call(this, value);
      },
      get: function() {
        return originalSrcDescriptor.get.call(this);
      }
    });
  }
  
  return element;
};

// This function is called to notify the extension that the shim is in place
function notifyShimActive() {
  if (window.chrome && chrome.runtime) {
    try {
      chrome.runtime.sendMessage({
        type: 'GRAPH_SHIM_ACTIVE',
        location: window.location.href
      });
    } catch (e) {
      console.error('Failed to notify extension about shim:', e);
    }
  }
}

// Call the notification function
notifyShimActive();

// Log that the shim is active
console.log('Microsoft Graph SDK CDN protection active'); 