import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchEmails } from '../../redux/emailSlice';
import './EmailList.css';

const EmailList = () => {
  const dispatch = useDispatch();
  const { emails, groups, loading, error } = useSelector(state => state.email);
  const selectedService = useSelector(state => {
    if (state.email.gmailConnected) return 'gmail';
    if (state.email.outlookConnected) return 'outlook';
    return null;
  });
  
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [selectedEmails, setSelectedEmails] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);

  // Toggle selection of all emails in a group
  const toggleSelectGroup = (sender) => {
    const groupEmails = groups.find(g => g.sender === sender)?.emails || [];
    const emailIds = groupEmails.map(email => email.id);
    
    // Check if all emails in this group are already selected
    const allSelected = emailIds.every(id => selectedEmails[id]);
    
    // Create a new selection state
    const newSelection = { ...selectedEmails };
    emailIds.forEach(id => {
      newSelection[id] = !allSelected;
    });
    
    setSelectedEmails(newSelection);
  };

  // Toggle selection of a single email
  const toggleSelectEmail = (emailId) => {
    setSelectedEmails(prev => ({
      ...prev,
      [emailId]: !prev[emailId]
    }));
  };

  // Handle deleting selected emails
  const handleDeleteSelected = async () => {
    const emailsToDelete = Object.keys(selectedEmails).filter(id => selectedEmails[id]);
    console.log(`[EmailList] handleDeleteSelected called. Service: ${selectedService}, Emails to delete:`, emailsToDelete);
    
    if (emailsToDelete.length === 0) {
      console.log('[EmailList] No emails selected.');
      alert('No emails selected');
      return;
    }
    
    if (!selectedService) {
      console.error('[EmailList] No service selected!');
      alert('No email service connected');
      return;
    }
    
    setIsDeleting(true);
    try {
      console.log(`[EmailList] Sending CLEAN_EMAILS message to background. Service: ${selectedService}, IDs:`, emailsToDelete.slice(0, 5), `... (${emailsToDelete.length} total)`);
      
      const message = {
        type: 'CLEAN_EMAILS',
        messageIds: emailsToDelete,
        service: selectedService // Explicitly pass the service
      };
      console.log('[EmailList] Sending message:', message);
      
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime.lastError;
          if (error) {
            console.error('[EmailList] Chrome runtime error during CLEAN_EMAILS:', error);
            reject(error);
            return;
          }
          if (!response) {
            console.error('[EmailList] No response received for CLEAN_EMAILS');
            reject(new Error('No response from background script for delete request'));
            return;
          }
          console.log('[EmailList] Received response for CLEAN_EMAILS:', response);
          resolve(response);
        });
      });
        
      if (response && response.success) {
        console.log('[EmailList] Deletion successful. Refreshing emails...');
        // Clear selection
        setSelectedEmails({});
        
        // Brief delay to allow UI to update before fetching
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch updated emails
        console.log('[EmailList] Fetching updated emails for service:', selectedService);
        await dispatch(fetchEmails({ service: selectedService }));
        
        // Show success notification after everything completes
        console.log('[EmailList] Email refresh completed. Showing success alert.');
        alert(`Successfully deleted ${response.count || emailsToDelete.length} emails`);
      } else {
        console.error('[EmailList] Deletion failed. Response:', response);
        throw new Error(response?.error || 'Failed to delete emails - unknown error from background script');
      }

    } catch (error) {
      console.error('[EmailList] Error in handleDeleteSelected:', error);
      alert(`Error deleting emails: ${error.message || 'Unknown error'}`);
    } finally {
      console.log('[EmailList] Finished delete process.');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Loading emails...</div>;
  }

  if (error) {
    return <div className="error-container">Error: {error}</div>;
  }

  if (groups.length === 0) {
    return <div className="empty-container">No emails found.</div>;
  }

  // Count selected emails
  const selectedCount = Object.values(selectedEmails).filter(Boolean).length;

  return (
    <div className="email-list-container">
      <div className="email-list-header">
        <h3>Email Groups by Sender</h3>
        {selectedCount > 0 && (
          <button 
            className="delete-button"
            onClick={handleDeleteSelected}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : `Delete Selected (${selectedCount})`}
          </button>
        )}
      </div>
      
      <div className="email-groups">
        {groups.map(group => (
          <div key={group.sender} className="email-group">
            <div 
              className="group-header" 
              onClick={() => setExpandedGroup(expandedGroup === group.sender ? null : group.sender)}
            >
              <div className="checkbox">
                <input 
                  type="checkbox"
                  checked={group.emails.every(email => selectedEmails[email.id])}
                  onChange={() => toggleSelectGroup(group.sender)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
              <div className="group-info">
                <span className="sender">{group.sender}</span>
                <span className="count">({group.count})</span>
              </div>
              <span className="expand-icon">{expandedGroup === group.sender ? '▼' : '►'}</span>
            </div>
            
            {expandedGroup === group.sender && (
              <div className="email-items">
                {group.emails.map(email => (
                  <div key={email.id} className="email-item">
                    <div className="checkbox">
                      <input 
                        type="checkbox"
                        checked={!!selectedEmails[email.id]}
                        onChange={() => toggleSelectEmail(email.id)}
                      />
                    </div>
                    <div className="email-content">
                      <div className="email-subject">{email.subject || 'No Subject'}</div>
                      <div className="email-snippet">{email.snippet || ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmailList;