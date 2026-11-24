(() => {
  'use strict';

  const DEFAULTS = { enabled: true, maxBoostDb: 12 };

  function pushSettings() {
    try {
      chrome.storage.local.get(DEFAULTS, (settings) => {
        document.dispatchEvent(new CustomEvent('ytm-songboost:settings', { detail: JSON.stringify(settings) }));
      });
    } catch {}
  }

  document.addEventListener('ytm-songboost:ready', pushSettings);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') pushSettings();
  });
  pushSettings();

  function report(status) {
    try {
      chrome.runtime.sendMessage({ type: 'badge', status }).catch(() => {});
    } catch {}
  }

  document.addEventListener('ytm-songboost:changed', (event) => {
    let status = null;
    try {
      status = JSON.parse(event.detail);
    } catch {}
    report(status);
  });
  window.addEventListener('pagehide', () => report(null));

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message !== 'status') return;
    let detail = 'null';
    const onStatus = (event) => {
      detail = event.detail;
    };
    document.addEventListener('ytm-songboost:status', onStatus);
    document.dispatchEvent(new CustomEvent('ytm-songboost:query'));
    document.removeEventListener('ytm-songboost:status', onStatus);
    let status = null;
    try {
      status = JSON.parse(detail);
    } catch {}
    sendResponse(status);
  });
})();
