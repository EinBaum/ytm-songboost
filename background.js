'use strict';

const GREEN = '#188038';
const ORANGE = '#e8710a';
const GREY = '#5f6368';
const WHITE = '#ffffff';

function badgeFor(status) {
  if (!status || !status.track) return { text: '', color: GREY };
  if (!status.enabled) return { text: 'off', color: GREY };
  const applied = Math.max(0, status.appliedDb);
  const text = applied >= 9.95 ? String(Math.round(applied)) : applied.toFixed(1);
  if (status.appliedDb < status.targetDb - 0.05) return { text, color: ORANGE };
  return { text, color: applied < 0.05 ? GREY : GREEN };
}

async function show(status) {
  const badge = badgeFor(status);
  await chrome.action.setBadgeText({ text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setBadgeTextColor({ color: WHITE });
}

async function onReport(tab, status) {
  const { sourceTabId = null } = await chrome.storage.session.get('sourceTabId');
  if (sourceTabId !== null && sourceTabId !== tab.id && !tab.audible) return;
  await chrome.storage.session.set({ sourceTabId: tab.id });
  await show(status);
}

async function onTabRemoved(tabId) {
  const { sourceTabId = null } = await chrome.storage.session.get('sourceTabId');
  if (tabId !== sourceTabId) return;
  await chrome.storage.session.remove('sourceTabId');
  await show(null);
}

let queue = Promise.resolve();

function enqueue(task) {
  queue = queue.then(task).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'badge' || !sender.tab) return;
  enqueue(() => onReport(sender.tab, message.status));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(() => onTabRemoved(tabId));
});

