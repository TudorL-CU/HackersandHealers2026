chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_PAGE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: 'No active tab' });
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => {
            return {
              text: document.body.innerText,
              title: document.title,
              url: window.location.href,
            };
          },
        },
        (results) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else if (results && results[0]) {
            sendResponse({ data: results[0].result });
          } else {
            sendResponse({ error: 'Could not read page' });
          }
        }
      );
    });
    return true;
  }
});
