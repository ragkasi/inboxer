import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchEmails = createAsyncThunk(
  'email/fetchEmails',
  async (provider) => {
    const resp = await new Promise(resolve =>
      chrome.runtime.sendMessage(
        { type: "AUTH_AND_FETCH_GMAIL" },
        resolve
      )
    );
    if (resp.error) throw new Error(resp.error.message || resp.error);
    return resp.threads;
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
  groups: {},
  selectedEmail: null,
  loading: false,
  error: null,
  filters: [],
  activeFilter: null,
  autoCleanEnabled: false
};

function groupBySender(threads) {
  return threads.reduce((groups, thread) => {
    const sender = thread.sender || 'Unknown';
    if (!groups[sender]) {
      groups[sender] = [];
    }
    groups[sender].push(thread);
    return groups;
  }, {});
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
      // Send message to background script
      chrome.runtime.sendMessage({ 
        type: 'TOGGLE_AUTO_CLEAN', 
        enabled: action.payload 
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
        state.emails = action.payload;
        state.groups = groupBySender(action.payload);
      })
      .addCase(fetchEmails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
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