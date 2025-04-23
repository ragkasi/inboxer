import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";

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
      chrome.runtime.sendMessage(
        { type: 'OUTLOOK_AUTH' },
        response => {
          if (response.error) {
            reject(response.error);
          } else {
            resolve(response.token);
          }
        }
      );
    });
  }

  async listEmails(query = '') {
    try {
      const client = Client.init({
        authProvider: done => done(null, this.accessToken)
      });
      
      let request = client
        .api("/me/mailFolders/Inbox/messages")
        .select("sender,subject,receivedDateTime,isRead")
        .top(500);
        
      if (query) {
        request = request.filter(query);
      }
      
      const res = await request.get();
      return res.value || [];
    } catch (error) {
      console.error('Error fetching Outlook messages:', error);
      throw error;
    }
  }

  async getEmailDetails(messageId) {
    try {
      const client = Client.init({
        authProvider: done => done(null, this.accessToken)
      });

      const message = await client
        .api(`/me/messages/${messageId}`)
        .get();

      return message;
    } catch (error) {
      console.error('Error fetching Outlook message details:', error);
      throw error;
    }
  }
}