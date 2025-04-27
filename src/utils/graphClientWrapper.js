/**
 * Wrapper for Microsoft Graph Client to ensure we use the bundled version
 * rather than trying to load from a CDN
 */
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch"; // Required for the client to work in service workers

// Prevent the Microsoft Graph client from trying to load scripts from CDN
// This approach overrides the internal script loading mechanism
// Check if window exists (we're in a browser context)
if (typeof window !== 'undefined') {
  // Create a function that will always return a resolved promise
  // to simulate successful script loading
  const mockScriptLoader = () => Promise.resolve();
  
  // Try to patch the internal loadDefaultMicrosoftGraphClientBundle function
  try {
    // In some versions, this is where the CDN script loading happens
    if (Client._internal && Client._internal.loadDefaultMicrosoftGraphClientBundle) {
      Client._internal.loadDefaultMicrosoftGraphClientBundle = mockScriptLoader;
    }
    
    // In other versions, it might be in a different location
    if (Client.loadDefaultMicrosoftGraphClientBundle) {
      Client.loadDefaultMicrosoftGraphClientBundle = mockScriptLoader;
    }
    
    console.log('Successfully patched Microsoft Graph Client to prevent CDN loading');
  } catch (error) {
    console.warn('Could not patch Microsoft Graph Client script loader:', error);
  }
}

// Export the Client class
export { Client };

/**
 * Create a Microsoft Graph client with authentication
 * @param {string} token - The access token for authentication
 * @returns {Client} - The initialized Microsoft Graph client
 */
export function createGraphClient(token) {
  if (!token) {
    throw new Error('Access token is required to create Graph client');
  }
  
  try {
    // Initialize the client with the token
    return Client.init({
      authProvider: (done) => {
        done(null, token);
      }
    });
  } catch (error) {
    console.error('Error creating Microsoft Graph client:', error);
    throw error;
  }
}

/**
 * Utility function to perform a request with error handling
 * @param {Client} client - The Microsoft Graph client
 * @param {string} endpoint - The API endpoint to call
 * @param {string} method - The HTTP method to use
 * @param {Object} [data] - Optional data to include in the request
 * @returns {Promise<any>} - The response data
 */
export async function graphRequest(client, endpoint, method = 'GET', data = null) {
  if (!client) {
    throw new Error('Graph client is required');
  }
  
  try {
    let request = client.api(endpoint);
    
    switch (method.toUpperCase()) {
      case 'GET':
        return await request.get();
      case 'POST':
        return await request.post(data);
      case 'DELETE':
        return await request.delete();
      case 'PATCH':
        return await request.patch(data);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  } catch (error) {
    console.error(`Error in Graph API request to ${endpoint}:`, error);
    throw error;
  }
} 