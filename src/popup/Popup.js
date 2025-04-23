import React, { useState, Suspense, lazy, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setGmailConnection, setOutlookConnection, fetchEmails, setAutoCleanEnabled } from '../redux/emailSlice';

const EmailList = lazy(() => import('./components/EmailList'));

const Popup = () => {
  const dispatch = useDispatch();
  const [services, setServices] = useState({ gmail: null, outlook: null });
  const { 
    gmailConnected, 
    outlookConnected, 
    emails, 
    loading, 
    error,
    autoCleanEnabled 
  } = useSelector(state => state.email);

  // Load auto-clean state on mount
  useEffect(() => {
    chrome.storage.local.get(['autoCleanEnabled'], (result) => {
      if (result.autoCleanEnabled !== undefined) {
        dispatch(setAutoCleanEnabled(result.autoCleanEnabled));
      }
    });
  }, [dispatch]);

  const handleGmailConnect = async () => {
    try {
      if (!services.gmail) {
        const { GmailService } = await import('../services/gmailService');
        const gmailService = new GmailService();
        setServices(prev => ({ ...prev, gmail: gmailService }));
      }

      await services.gmail.initialize(process.env.GOOGLE_CLIENT_ID);
      const isAuthenticated = await services.gmail.authenticate();
      dispatch(setGmailConnection(isAuthenticated));
      
      if (isAuthenticated) {
        dispatch(fetchEmails({ service: services.gmail, query: '' }));
      }
    } catch (error) {
      console.error('Gmail connection error:', error);
    }
  };

  const handleOutlookConnect = async () => {
    try {
      if (!services.outlook) {
        const { OutlookService } = await import('../services/outlookService');
        const outlookService = new OutlookService();
        setServices(prev => ({ ...prev, outlook: outlookService }));
      }

      await services.outlook.initialize(process.env.MICROSOFT_CLIENT_ID);
      const isAuthenticated = await services.outlook.authenticate();
      dispatch(setOutlookConnection(isAuthenticated));
      
      if (isAuthenticated) {
        dispatch(fetchEmails({ service: services.outlook, query: '' }));
      }
    } catch (error) {
      console.error('Outlook connection error:', error);
    }
  };

  const handleAutoCleanToggle = (enabled) => {
    dispatch(setAutoCleanEnabled(enabled));
    chrome.storage.local.set({ autoCleanEnabled: enabled });
  };

  return (
    <div className="popup-container">
      <h1>Email Cleaner</h1>
      
      <div className="connection-status">
        <div>
          Gmail: {gmailConnected ? '✓ Connected' : '✗ Not Connected'}
          <button 
            onClick={handleGmailConnect}
            disabled={loading}
          >
            {gmailConnected ? 'Refresh' : 'Connect Gmail'}
          </button>
        </div>
        
        <div>
          Outlook: {outlookConnected ? '✓ Connected' : '✗ Not Connected'}
          <button 
            onClick={handleOutlookConnect}
            disabled={loading}
          >
            {outlookConnected ? 'Refresh' : 'Connect Outlook'}
          </button>
        </div>

        <div className="auto-clean-toggle">
          <label>
            Weekly Auto-Clean:
            <input
              type="checkbox"
              checked={autoCleanEnabled}
              onChange={(e) => handleAutoCleanToggle(e.target.checked)}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      <Suspense fallback={<div className="loading">Loading email list component...</div>}>
        <EmailList emails={emails} loading={loading} />
      </Suspense>
    </div>
  );
};

export default Popup;