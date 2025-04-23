// Content script to interact with email pages
const isGmail = window.location.hostname === 'mail.google.com';
const isOutlook = window.location.hostname === 'outlook.office.com';

// Add button to Gmail interface
if (isGmail) {
  const btn = document.createElement("button");
  btn.textContent = "Open Email Cleaner";
  btn.onclick = () => chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
  document.body.appendChild(btn);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'SCAN_EMAILS':
      // TODO: Implement email scanning logic
      break;
    case 'CLEAN_EMAILS':
      // TODO: Implement email cleaning logic
      break;
    default:
      break;
  }
  return true;
});