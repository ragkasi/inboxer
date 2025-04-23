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