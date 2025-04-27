import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { sendMessage, serializeError } from '../connection-bridge';

// Legacy error handler for backward compatibility
function legacySerializeError(error) {
  if (!error) return new Error('Unknown error');
  
  try {
    // Handle Chrome's runtime.lastError more directly
    if (error === chrome.runtime.lastError) {
      let errorMessage = "Unknown Chrome runtime error";
      
      try {
        // Try different ways to access the message
        if (chrome.runtime.lastError.message) {
          errorMessage = chrome.runtime.lastError.message;
        } else if (chrome.runtime.lastError.toString) {
          errorMessage = chrome.runtime.lastError.toString();
        }
      } catch (e) {
        console.error("Failed to access runtime error details:", e);
      }
      
      return new Error(errorMessage);
    }
    
    if (typeof error === 'string') return new Error(error);
    if (error instanceof Error) return error;
    if (error.message) return new Error(error.message);
    return new Error(JSON.stringify(error));
  } catch (e) {
    return new Error('Error occurred (could not serialize details)');
  }
}

export const fetchEmails = createAsyncThunk(
  'email/fetchEmails',
  async (queryParams = {}, { rejectWithValue, getState }) => {
    try {
      // Check if chrome.runtime is available
      if (!chrome.runtime) {
        return rejectWithValue('Extension runtime not available');
      }
      
      // Get currently selected service from state if not provided in params
      const state = getState();
      const service = queryParams.service || 
                     (state.email.gmailConnected ? 'gmail' : 
                      state.email.outlookConnected ? 'outlook' : null);
      
      const query = queryParams.query || '';
      
      if (!service) {
        console.error('No email service is connected or specified');
        return rejectWithValue({
          message: 'No email service is connected',
          details: 'Please connect to Gmail or Outlook before fetching emails'
        });
      }
      
      if (!['gmail', 'outlook'].includes(service)) {
        console.error(`Invalid service specified: ${service}`);
        return rejectWithValue({
          message: 'Invalid email service',
          details: `${service} is not a supported email service`
        });
      }
      
      console.log(`Fetching emails for ${service} service:`, query);
      
      // First check if background script is properly initialized
      const pingResponse = await sendMessage({ type: 'PING' });
      if (!pingResponse || pingResponse.status !== "ok" || !pingResponse.initialized) {
        throw new Error('Background script not ready: ' + 
          (pingResponse?.error || 'Unknown initialization error'));
      }
      
      // Use the appropriate fetch messages endpoint based on the service
      let responseType = '';
      if (service === 'gmail') {
        responseType = 'AUTH_AND_FETCH_GMAIL';
      } else if (service === 'outlook') {
        responseType = 'AUTH_AND_FETCH_OUTLOOK';
      } else {
        throw new Error(`Unknown service: ${service}`);
      }
      
      // Now that we know background is ready, request emails
      const response = await sendMessage({ 
        type: responseType,
        query: query
      });
      
      console.log(`${service} email fetch response:`, response);
      if (!response || response.status !== "ok" || !response.threads) {
        throw new Error(response?.error || 'No emails received from the server');
      }
      
      return response.threads;
    } catch (error) {
      console.error('fetchEmails error:', error);
      return rejectWithValue(error.message || 'Failed to fetch emails');
    }
  }
);

export const getEmailDetails = createAsyncThunk(
  'email/getDetails',
  async ({ service, messageId }, { rejectWithValue }) => {
    try {
      return await service.getEmailDetails(messageId);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const loadFilters = createAsyncThunk(
  'email/loadFilters',
  async () => {
    const result = await new Promise(resolve => 
      chrome.storage.sync.get(['emailFilters'], resolve)
    );
    return result.emailFilters || [];
  }
);

export const saveFilter = createAsyncThunk(
  'email/saveFilter',
  async (filter, { getState }) => {
    const { email } = getState();
    const filters = [...(email.filters || []), filter];
    await new Promise(resolve => 
      chrome.storage.sync.set({ emailFilters: filters }, resolve)
    );
    return filter;
  }
);

const initialState = {
  gmailConnected: false,
  outlookConnected: false,
  emails: [],
  groups: [],
  selectedEmail: null,
  loading: false,
  error: null,
  filters: [],
  activeFilter: null,
  autoCleanEnabled: false
};

function groupBySender(threads) {
  if (!Array.isArray(threads)) {
    console.error('Expected array for groupBySender, got:', typeof threads);
    return [];
  }

  console.log('Threads for grouping:', threads);
  
  // Convert to array structure (instead of object) for easier rendering
  const senderMap = threads.reduce((acc, thread) => {
    // Try different ways to extract the sender
    let sender = 'Unknown';
    
    // Try to extract the best sender information available
    if (thread.sender && typeof thread.sender === 'string') {
      sender = thread.sender;
    } else if (thread.sender && thread.sender.emailAddress && thread.sender.emailAddress.address) {
      // For Outlook format
      sender = thread.sender.emailAddress.name || thread.sender.emailAddress.address;
    } else if (thread.from) {
      sender = thread.from;
    } else if (thread.messages && thread.messages.length > 0) {
      // For Gmail thread format, get sender from first message headers
      const firstMessage = thread.messages[0];
      if (firstMessage.payload && firstMessage.payload.headers) {
        const fromHeader = firstMessage.payload.headers.find(h => 
          h.name.toLowerCase() === 'from' || h.name.toLowerCase() === 'sender'
        );
        if (fromHeader && fromHeader.value) {
          // Extract just the email or name from "Name <email@example.com>" format
          const matches = fromHeader.value.match(/(.+?)\s*(?:<(.+?)>)?$/);
          if (matches) {
            sender = matches[1].trim(); // Use the name part if available
          } else {
            sender = fromHeader.value;
          }
        }
      }
    }
    
    // Clean up the sender name - extract from pattern "Name <email@example.com>"
    if (sender.includes('<')) {
      const matches = sender.match(/(.+?)\s*<.+?>$/);
      if (matches) {
        sender = matches[1].trim();
      }
    }
    
    // Further cleanup: remove quotes around names
    sender = sender.replace(/^["'](.+)["']$/, '$1');
    
    // Extract domain for grouping if it looks like an email address without a name
    if (sender.includes('@') && !sender.includes(' ')) {
      // This is just an email address
      const domainMatch = sender.match(/@([^>]+)(?:>|$)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        // Convert domain to friendly name
        const parts = domain.split('.');
        if (parts.length >= 2) {
          // Use the organization part (e.g., "example" from "example.com")
          sender = parts[parts.length - 2].charAt(0).toUpperCase() + 
                   parts[parts.length - 2].slice(1);
        }
      }
    }
    
    // Fallback for completely unknown senders
    if (!sender || sender === 'Unknown') {
      console.log('Unknown sender for thread:', thread);
    }
    
    if (!acc[sender]) {
      acc[sender] = {
        sender,
        count: 0,
        emails: []
      };
    }
    acc[sender].emails.push(thread);
    acc[sender].count += 1;
    return acc;
  }, {});
  
  // Convert to array and sort by count
  return Object.values(senderMap).sort((a, b) => b.count - a.count);
}

const emailSlice = createSlice({
  name: 'email',
  initialState,
  reducers: {
    setGmailConnection: (state, action) => {
      state.gmailConnected = action.payload;
    },
    setOutlookConnection: (state, action) => {
      state.outlookConnected = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setActiveFilter: (state, action) => {
      state.activeFilter = action.payload;
    },
    removeFilter: (state, action) => {
      state.filters = state.filters.filter(f => f.id !== action.payload);
      if (state.activeFilter?.id === action.payload) {
        state.activeFilter = null;
      }
      chrome.storage.sync.set({ emailFilters: state.filters });
    },
    setAutoCleanEnabled: (state, action) => {
      state.autoCleanEnabled = action.payload;
      // Send message to background script using the connection bridge
      sendMessage({ 
        type: 'TOGGLE_AUTO_CLEAN', 
        enabled: action.payload 
      }).catch(err => {
        console.error('Error toggling auto-clean:', err);
      });
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEmails.fulfilled, (state, action) => {
        state.loading = false;
        
        if (Array.isArray(action.payload)) {
          state.emails = action.payload;
          state.groups = groupBySender(action.payload);
        } else {
          console.error('Expected array of emails but got:', action.payload);
          state.emails = [];
          state.groups = [];
          state.error = 'Invalid email data received';
        }
      })
      .addCase(fetchEmails.rejected, (state, action) => {
        state.loading = false;
        
        // Handle the different types of error formats
        if (action.payload) {
          // This is from rejectWithValue in the thunk
          if (typeof action.payload === 'string') {
            state.error = action.payload;
          } else if (typeof action.payload === 'object') {
            if (action.payload.message) {
              state.error = action.payload.details 
                ? `${action.payload.message}: ${action.payload.details}` 
                : action.payload.message;
            } else {
              // Try to stringify
              try {
                state.error = JSON.stringify(action.payload);
              } catch (e) {
                state.error = 'Unknown error format';
              }
            }
          } else {
            state.error = String(action.payload);
          }
        } else if (action.error) {
          // This is from a thrown error
          state.error = action.error.message || 'Unknown error';
        } else {
          state.error = 'Failed to fetch emails';
        }
        
        console.error('Email fetch error:', state.error);
      })
      .addCase(getEmailDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getEmailDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedEmail = action.payload;
      })
      .addCase(getEmailDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(loadFilters.fulfilled, (state, action) => {
        state.filters = action.payload;
      })
      .addCase(saveFilter.fulfilled, (state, action) => {
        state.filters.push(action.payload);
      });
  },
});

export const {
  setGmailConnection,
  setOutlookConnection,
  clearError,
  setActiveFilter,
  removeFilter,
  setAutoCleanEnabled,
} = emailSlice.actions;

export default emailSlice.reducer;