import axios from 'axios';

export class GmailService {
  constructor() {
    this.accessToken = null;
    this.initialized = false;
  }

  async initialize(clientId) {
    this.clientId = clientId;
    
    try {
      // Create a simple client object for Gmail API interaction
      // We're not using the Google API client library because it's complex to integrate with MV3
      // Instead, we create a client interface using fetch that mimics the same interface
      this.client = {
        users: {
          messages: {
            list: async (params) => {
              return this.fetchWithAuth(`https://gmail.googleapis.com/gmail/v1/users/${params.userId}/messages`, params);
            },
            get: async (params) => {
              return this.fetchWithAuth(`https://gmail.googleapis.com/gmail/v1/users/${params.userId}/messages/${params.id}`);
            },
            trash: async (params) => {
              return this.fetchWithAuth(
                `https://gmail.googleapis.com/gmail/v1/users/${params.userId}/messages/${params.id}/trash`,
                null,
                'POST'
              );
            },
            batchModify: async (params) => {
              return this.fetchWithAuth(
                `https://gmail.googleapis.com/gmail/v1/users/${params.userId}/messages/batchModify`,
                params.requestBody,
                'POST'
              );
            }
          },
          threads: {
            list: async (params) => {
              return this.fetchWithAuth(`https://gmail.googleapis.com/gmail/v1/users/${params.userId}/threads`, params);
            },
            get: async (params) => {
              return this.fetchWithAuth(`https://gmail.googleapis.com/gmail/v1/users/${params.userId}/threads/${params.id}`);
            }
          }
        }
      };
      
      this.initialized = true;
      console.log('Gmail client successfully initialized');
      return this.client;
    } catch (error) {
      console.error('Error initializing Gmail client:', error);
      this.initialized = false;
      throw error;
    }
  }
  
  // Helper method to perform authenticated fetch requests
  async fetchWithAuth(url, params = null, method = 'GET') {
    if (!this.accessToken) {
      throw new Error('No access token available. Please authenticate first.');
    }
    
    try {
      const headers = {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      };
      
      const options = {
        method,
        headers
      };
      
      // For GET requests, add query parameters to URL
      if (method === 'GET' && params) {
        const queryParams = new URLSearchParams();
        
        // Filter out special parameters
        const { userId, id, ...restParams } = params;
        
        // Add remaining params to query string
        Object.entries(restParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value);
          }
        });
        
        const queryString = queryParams.toString();
        if (queryString) {
          url = `${url}?${queryString}`;
        }
      }
      
      // For POST/PUT/PATCH, add body
      if (method !== 'GET' && params) {
        options.body = JSON.stringify(params);
      }
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (e) {
          // If not JSON, use the raw text
          errorJson = { error: errorText };
        }
        
        throw new Error(`API request failed: ${errorJson.error?.message || response.statusText}`);
      }
      
      // Parse response as JSON if it's not empty
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      
      return { data };
    } catch (error) {
      console.error('Error in fetchWithAuth:', error);
      throw error;
    }
  }

  async authenticate() {
    try {
      const token = await this.getAuthToken();
      this.accessToken = token;
      return true;
    } catch (error) {
      console.error('Gmail authentication error:', error);
      return false;
    }
  }

  async getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  async listEmails(query = '') {
    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }

      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      return [];
    }
  }

  async getEmailDetails(messageId) {
    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch email details');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching Gmail message details:', error);
      return null;
    }
  }

  async deleteMessages(messageIds) {
    if (!messageIds || messageIds.length === 0) {
      console.warn('No message IDs provided for deletion');
      return { success: false, error: 'No message IDs provided' };
    }
    
    try {
      console.log(`Attempting to delete ${messageIds.length} Gmail messages`);
      
      if (!this.client || !this.initialized) {
        // Make sure the client is initialized
        await this.initialize(this.clientId);
      }
      
      // For better performance with multiple messages, use batch requests
      if (messageIds.length > 1) {
        // Process in batches of 50 to avoid hitting API limits
        const batchSize = 50;
        const batches = [];
        
        for (let i = 0; i < messageIds.length; i += batchSize) {
          const batch = messageIds.slice(i, i + batchSize);
          batches.push(batch);
        }
        
        const results = await Promise.all(batches.map(async (batch) => {
          // Use Gmail's batchModify endpoint for efficient processing
          await this.client.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids: batch,
              addLabelIds: ['TRASH']
            }
          });
          
          return { success: true, count: batch.length };
        }));
        
        console.log(`Successfully processed ${messageIds.length} messages for deletion`);
        return { success: true, count: messageIds.length };
      } else {
        // For a single message, use standard trash endpoint
        await this.client.users.messages.trash({
          userId: 'me',
          id: messageIds[0]
        });
        
        console.log('Successfully deleted message');
        return { success: true, count: 1 };
      }
    } catch (error) {
      console.error('Error deleting Gmail messages:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error during deletion',
        details: error
      };
    }
  }

  async fetchThreads(maxResults = 500) {
    try {
      if (!this.client || !this.initialized) {
        // Make sure the client is initialized
        await this.initialize(this.clientId);
      }
      
      // Fetch thread list
      const listResponse = await this.client.users.threads.list({
        userId: 'me',
        maxResults
      });
      const threads = listResponse.data.threads || [];

      // Fetch details for each thread
      const details = await Promise.all(
        threads.map(thread =>
          this.client.users.threads.get({
            userId: 'me',
            id: thread.id
          })
        )
      );
      
      return details.map(response => response.data);
    } catch (error) {
      console.error('Error fetching Gmail threads:', error);
      return [];
    }
  }

  /**
   * Fetches Gmail threads based on a search query
   * @param {string} query - Gmail search query (e.g., "from:example@gmail.com")
   * @param {number} maxResults - Maximum number of threads to fetch
   * @returns {Promise<Array>} - Array of thread objects with messages
   */
  async fetchThreadsByQuery(query, maxResults = 10) {
    if (!this.client || !this.initialized) {
      await this.initialize(this.clientId);
    }
    
    console.log(`[Gmail] Fetching up to ${maxResults} threads with query: ${query}`);
    
    try {
      // List threads matching the query
      const response = await this.client.users.threads.list({
        userId: 'me',
        q: query,
        maxResults: maxResults
      });
      
      if (!response.data.threads || response.data.threads.length === 0) {
        console.log('[Gmail] No threads found for query');
        return [];
      }
      
      console.log(`[Gmail] Found ${response.data.threads.length} threads, fetching details`);
      
      // Get detailed thread data for each thread ID
      const threads = await Promise.all(
        response.data.threads.map(async thread => {
          try {
            const threadData = await this.client.users.threads.get({
              userId: 'me',
              id: thread.id
            });
            return threadData.data;
          } catch (e) {
            console.error(`[Gmail] Error fetching thread ${thread.id}:`, e);
            return null;
          }
        })
      );
      
      // Filter out any null results from errors
      return threads.filter(thread => thread !== null);
    } catch (error) {
      console.error('[Gmail] Error fetching threads by query:', error);
      throw error;
    }
  }
}