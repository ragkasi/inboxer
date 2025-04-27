import axios from 'axios';

export class GmailService {
  constructor() {
    this.accessToken = null;
  }

  async initialize(clientId) {
    this.clientId = clientId;
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
          const response = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ids: batch,
                addLabelIds: ['TRASH']
              })
            }
          );
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to delete messages: ${errorData.error?.message || response.statusText}`);
          }
          
          return response;
        }));
        
        console.log(`Successfully processed ${messageIds.length} messages for deletion`);
        return { success: true, count: messageIds.length };
      } else {
        // For a single message, use standard delete endpoint
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageIds[0]}/trash`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            }
          }
        );
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to delete message: ${errorData.error?.message || response.statusText}`);
        }
        
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
      const headers = { 
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      };
      
      // Fetch thread list
      const listResponse = await axios.get(
        'https://gmail.googleapis.com/gmail/v1/users/me/threads',
        { headers, params: { maxResults } }
      );
      const threads = listResponse.data.threads || [];

      // Fetch details for each thread
      const details = await Promise.all(
        threads.map(thread =>
          axios.get(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}`,
            { headers }
          )
        )
      );
      
      return details.map(response => response.data);
    } catch (error) {
      console.error('Error fetching Gmail threads:', error);
      return [];
    }
  }
}