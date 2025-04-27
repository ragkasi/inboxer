/**
 * Utility file to create a Microsoft Graph client
 */
import { Client, createGraphClient as createClient } from "./graphClientWrapper";
import "isomorphic-fetch"; // Required for the client to work in service workers

// Create a Microsoft Graph client
export function createGraphClient(token) {
  try {
    return createClient(token);
  } catch (error) {
    console.error('Error creating Microsoft Graph client:', error);
    return null;
  }
}

// Delete Outlook messages
export async function deleteOutlookMessages(token, messageIds) {
  try {
    const client = createGraphClient(token);
    
    if (!client) {
      throw new Error('Could not initialize Microsoft Graph Client');
    }
    
    const deletePromises = messageIds.map(id => {
      return new Promise((resolve, reject) => {
        client.api(`/me/messages/${id}`)
          .delete((err) => {
            if (err) {
              console.error(`Error deleting message ${id}:`, err);
              reject(err);
            } else {
              resolve();
            }
          });
      });
    });
    
    return Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting Outlook messages:', error);
    return Promise.reject(error);
  }
} 