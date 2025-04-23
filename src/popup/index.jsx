import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import { fetchEmails } from '../redux/emailSlice';
import './popup.css';

function PopupApp() {
  const dispatch = useDispatch();
  const { groups, loading, error } = useSelector(s => s.email);

  useEffect(() => {
    dispatch(fetchEmails("gmail"));
  }, [dispatch]);

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="p-4">
      <h2>Senders</h2>
      <ul>
        {Object.entries(groups).map(([sender, { count }]) => (
          <li key={sender}>
            <label>
              <input type="checkbox" data-sender={sender} />
              {sender} ({count})
            </label>
          </li>
        ))}
      </ul>
      <button
        onClick={() => {
          const checked = Array.from(
            document.querySelectorAll("input[type=checkbox]:checked")
          ).map(cb => cb.dataset.sender);
          chrome.runtime.sendMessage({ type: "DELETE_SENDERS", senders: checked });
        }}
      >
        Delete Selected
      </button>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <Provider store={store}>
    <PopupApp />
  </Provider>
);