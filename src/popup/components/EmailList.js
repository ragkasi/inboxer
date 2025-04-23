import React from 'react';

const EmailList = ({ emails, loading }) => {
  if (loading) {
    return <div className="loading">Loading emails...</div>;
  }

  return (
    <div className="email-list">
      {emails.map(email => (
        <div key={email.id} className="email-item">
          <div className="email-subject">{email.subject || 'No Subject'}</div>
          <div className="email-sender">{email.from || 'Unknown Sender'}</div>
          <div className="email-date">
            {new Date(email.date).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
};

export default EmailList;