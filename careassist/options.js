'use strict';

const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const savedMsg = document.getElementById('saved-msg');

// Load existing key (show masked placeholder if set)
chrome.storage.local.get(['charted_api_key'], (result) => {
  if (result.charted_api_key) {
    apiKeyInput.placeholder = 'sk-ant-api03-… (already saved)';
  }
});

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  chrome.storage.local.set({ charted_api_key: key }, () => {
    apiKeyInput.value = '';
    apiKeyInput.placeholder = 'sk-ant-api03-… (already saved)';
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 3000);
  });
});
