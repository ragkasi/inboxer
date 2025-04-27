import { Client } from "./graphClientWrapper";
import "isomorphic-fetch";
import axios from 'axios';

export class OutlookService {
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
      console.error('Outlook authentication error:', error);
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
      // Fetch emails from Outlook API
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages?$filter=contains(subject,'${query}')`,
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
      return data.value || [];
    } catch (error) {
      console.error('Error fetching Outlook messages:', error);
      return [];
    }
  }

  async getEmailDetails(messageId) {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
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
      console.error('Error fetching Outlook message details:', error);
      return null;
    }
  }
  
  async deleteMessages(messageIds) {
    if (!messageIds || messageIds.length === 0) {
      console.warn('No message IDs provided for deletion');
      return { success: false, error: 'No message IDs provided' };
    }
    
    try {
      console.log(`Attempting to delete ${messageIds.length} Outlook messages`);
      
      // Process in batches to avoid hitting API limits
      const batchSize = 20;
      const batches = [];
      let successCount = 0;
      let errors = [];
      
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      // Microsoft Graph API doesn't support true batch delete, so we need to delete one by one
      for (const batch of batches) {
        const results = await Promise.allSettled(batch.map(async (messageId) => {
          const response = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
              }
            }
          );
          
          if (!response.ok) {
            // For DELETE requests, empty response with status 204 is success
            if (response.status !== 204) {
              let errorMessage = response.statusText;
              try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
              } catch (e) {
                // If we can't parse the error JSON, just use the status text
              }
              throw new Error(`Failed to delete message ${messageId}: ${errorMessage}`);
            }
          }
          
          return messageId;
        }));
        
        // Process results from this batch
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            errors.push(result.reason.message);
          }
        });
      }
      
      console.log(`Deleted ${successCount}/${messageIds.length} Outlook messages`);
      
      return { 
        success: successCount > 0, 
        count: successCount,
        failedCount: messageIds.length - successCount,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      console.error('Error deleting Outlook messages:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error during deletion',
        details: error
      };
    }
  }
}