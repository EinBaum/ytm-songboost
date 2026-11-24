'use strict';

const DEFAULTS = { enabled: true, maxBoostDb: 12 };
const REFRESH_MS = 500;

const enabled = document.getElementById('enabled');
const max = document.getElementById('max');
const maxValue = document.getElementById('maxValue');
const track = document.getElementById('track');
const message = document.getElementById('message');
const boost = document.getElementById('boost');
const hint = document.getElementById('hint');

function showMax() {
  maxValue.textContent = `${max.value} dB`;
}

function show(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

function db(value) {
  return `${Math.max(0, value).toFixed(1)} dB`;
}

function showMessage(text) {
  show(track, '');
  show(message, text);
  show(boost, '');
  show(hint, '');
}

function render(status) {
  if (!status.track) {
    showMessage('No track loaded or no loudness metadata.');
    return;
  }
  show(track, status.artist ? `${status.artist} - ${status.title}` : status.title);
  show(message, '');
  if (!status.enabled) {
    show(boost, 'Bypassed');
    show(hint, '');
    return;
  }
  const capped = status.appliedDb < status.targetDb - 0.05;
  show(boost, capped ? `Gain +${db(status.appliedDb)} of +${db(status.targetDb)}` : `Gain +${db(status.appliedDb)}`);
  show(hint, capped ? 'Volume too high for the full gain. Turn the YouTube Music volume down.' : '');
}

async function refresh() {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  const tab = tabs.find((t) => t.audible) || tabs.find((t) => t.active) || tabs[0];
  if (!tab) {
    showMessage('No YouTube Music tab open.');
    return;
  }
  let status = null;
  try {
    status = await chrome.tabs.sendMessage(tab.id, 'status');
  } catch {}
  if (!status) {
    showMessage('Content script not attached. Reload the YouTube Music tab.');
    return;
  }
  render(status);
}

chrome.storage.local.get(DEFAULTS, (settings) => {
  enabled.checked = settings.enabled;
  max.value = settings.maxBoostDb;
  showMax();
});

enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabled.checked });
});

max.addEventListener('input', () => {
  showMax();
  chrome.storage.local.set({ maxBoostDb: Number(max.value) });
});

refresh();
setInterval(refresh, REFRESH_MS);
