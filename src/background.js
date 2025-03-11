// Background script to handle events
chrome.action.onClicked.addListener((tab) => {
    // This will only execute if no popup is defined
    // Since we have a popup, this is just a fallback
  });
  
  // Listen for messages from content script or popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Can be used for additional background processing if needed
    return true;
  });