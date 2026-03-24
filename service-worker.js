import {
  MANAGER_PAGE,
  buildUniqueManagedTitle,
  isManagedGroup,
  pickGroupColor,
  sortTabs
} from './shared.js';

const COLLAPSE_STATE_KEY = 'tabstackCollapsedStates';
const stateStore = chrome.storage.session || chrome.storage.local;
const openingGroupWindows = new Map();

async function getCollapsedStates() {
  const stored = await stateStore.get(COLLAPSE_STATE_KEY);
  return stored[COLLAPSE_STATE_KEY] || {};
}

async function setCollapsedState(groupId, collapsed) {
  const states = await getCollapsedStates();
  states[groupId] = Boolean(collapsed);
  await stateStore.set({ [COLLAPSE_STATE_KEY]: states });
}

async function removeCollapsedState(groupId) {
  const states = await getCollapsedStates();
  delete states[groupId];
  await stateStore.set({ [COLLAPSE_STATE_KEY]: states });
}

async function seedCollapsedStates() {
  const groups = await chrome.tabGroups.query({});
  const states = {};
  for (const group of groups) {
    states[group.id] = Boolean(group.collapsed);
  }
  await stateStore.set({ [COLLAPSE_STATE_KEY]: states });
}

async function getGroupTabs(groupId, windowId) {
  return sortTabs(await chrome.tabs.query({ windowId, groupId }));
}

async function computeManagedGroupUpdate(groupId) {
  let group;
  try {
    group = await chrome.tabGroups.get(groupId);
  } catch {
    return null;
  }

  if (!isManagedGroup(group)) {
    return null;
  }

  const tabs = await getGroupTabs(groupId, group.windowId);
  if (tabs.length === 0) {
    return null;
  }

  const fallbackName = chrome.i18n.getMessage('defaultStackName') || 'Stack';
  const existingGroups = await chrome.tabGroups.query({ windowId: group.windowId });
  const nextTitle = buildUniqueManagedTitle(
      tabs[0]?.title || fallbackName,
      existingGroups,
      groupId,
      fallbackName
  );
  const nextColor = pickGroupColor(nextTitle);

  return {
    group,
    title: nextTitle,
    color: nextColor,
    firstTabIndex: tabs[0]?.index ?? Number.MAX_SAFE_INTEGER
  };
}

async function retitleManagedGroup(groupId) {
  const computed = await computeManagedGroupUpdate(groupId);
  if (!computed) {
    return;
  }

  const { group, title, color } = computed;
  const updates = {};

  if (group.title !== title) {
    updates.title = title;
  }
  if (group.color !== color) {
    updates.color = color;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.tabGroups.update(groupId, updates);
  }
}

async function listManagedGroupsInWindow(windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  const computed = await Promise.all(
      groups
          .filter(isManagedGroup)
          .map((group) => computeManagedGroupUpdate(group.id))
  );

  return computed
      .filter(Boolean)
      .sort((left, right) => left.firstTabIndex - right.firstTabIndex);
}

async function refreshManagedTitlesInWindow(windowId) {
  const managedGroups = await listManagedGroupsInWindow(windowId);
  const usedTitles = new Set();

  for (const entry of managedGroups) {
    const updates = {};
    let nextTitle = entry.title;

    if (usedTitles.has(nextTitle)) {
      const fallbackName = chrome.i18n.getMessage('defaultStackName') || 'Stack';
      const existingGroups = (await chrome.tabGroups.query({ windowId }))
          .filter(isManagedGroup)
          .map((group) => ({ ...group, title: group.id === entry.group.id ? '' : group.title }));
      nextTitle = buildUniqueManagedTitle(
          nextTitle,
          existingGroups,
          entry.group.id,
          fallbackName
      );
    }

    usedTitles.add(nextTitle);

    if (entry.group.title !== nextTitle) {
      updates.title = nextTitle;
    }
    if (entry.group.color !== entry.color) {
      updates.color = entry.color;
    }

    if (Object.keys(updates).length > 0) {
      await chrome.tabGroups.update(entry.group.id, updates);
    }
  }
}

async function focusExistingManagerWindow(groupId) {
  const managerUrl = chrome.runtime.getURL(MANAGER_PAGE);
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (!tab.url || !tab.url.startsWith(managerUrl)) {
      continue;
    }

    const url = new URL(tab.url);
    if (url.searchParams.get('groupId') === String(groupId)) {
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      if (tab.id !== undefined) {
        await chrome.tabs.update(tab.id, { active: true });
      }
      return true;
    }
  }

  return false;
}

async function openOrFocusManagerWindow(groupId) {
  if (openingGroupWindows.has(groupId)) {
    return openingGroupWindows.get(groupId);
  }

  const openingPromise = (async () => {
    let group;
    try {
      group = await chrome.tabGroups.get(groupId);
    } catch {
      return;
    }

    if (!isManagedGroup(group)) {
      return;
    }

    const focusedExisting = await focusExistingManagerWindow(groupId);
    if (focusedExisting) {
      return;
    }

    await chrome.windows.create({
      url: chrome.runtime.getURL(`${MANAGER_PAGE}?groupId=${groupId}`),
      type: 'popup',
      focused: true,
      width: 1060,
      height: 760
    });
  })().finally(() => {
    openingGroupWindows.delete(groupId);
  });

  openingGroupWindows.set(groupId, openingPromise);
  return openingPromise;
}

async function focusGroupAndOpenManager(groupId) {
  let group;
  try {
    group = await chrome.tabGroups.get(groupId);
  } catch {
    return;
  }

  if (!isManagedGroup(group)) {
    return;
  }

  const groupTabs = await getGroupTabs(groupId, group.windowId);
  if (groupTabs[0]) {
    await chrome.windows.update(group.windowId, { focused: true });
    if (group.collapsed) {
      await chrome.tabGroups.update(groupId, { collapsed: false });
    }
    await chrome.tabs.update(groupTabs[0].id, { active: true });
  }

  await openOrFocusManagerWindow(groupId);
}

async function releaseManagedGroup(groupId) {
  let group;
  try {
    group = await chrome.tabGroups.get(groupId);
  } catch {
    return;
  }

  if (!isManagedGroup(group)) {
    return;
  }

  const tabs = await getGroupTabs(groupId, group.windowId);
  if (tabs.length > 0) {
    await chrome.tabs.ungroup(tabs.map((tab) => tab.id));
  }

  await removeCollapsedState(groupId);
  await refreshManagedTitlesInWindow(group.windowId);
}

chrome.runtime.onInstalled.addListener(() => {
  seedCollapsedStates().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  seedCollapsedStates().catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'focusGroupAndManage':
        await focusGroupAndOpenManager(Number(message.groupId));
        sendResponse({ ok: true });
        return;
      case 'openManager':
        await openOrFocusManagerWindow(Number(message.groupId));
        sendResponse({ ok: true });
        return;
      case 'retitleManagedGroup': {
        const groupId = Number(message.groupId);
        let group;
        try {
          group = await chrome.tabGroups.get(groupId);
        } catch {
          sendResponse({ ok: true });
          return;
        }
        await refreshManagedTitlesInWindow(group.windowId);
        sendResponse({ ok: true });
        return;
      }
      case 'releaseManagedGroup':
        await releaseManagedGroup(Number(message.groupId));
        sendResponse({ ok: true });
        return;
      default:
        sendResponse({ ok: false, error: 'unknown-message' });
    }
  })().catch((error) => {
    console.error('TabStack service worker message error:', error);
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});

chrome.tabGroups.onCreated.addListener((group) => {
  setCollapsedState(group.id, group.collapsed).catch(console.error);
});

chrome.tabGroups.onRemoved.addListener((group) => {
  removeCollapsedState(group.id).catch(console.error);
});

// 移除掉自动展开时弹出管理窗口的逻辑，仅保留状态同步
chrome.tabGroups.onUpdated.addListener(async (group) => {
  try {
    const states = await getCollapsedStates();
    states[group.id] = Boolean(group.collapsed);
    await stateStore.set({ [COLLAPSE_STATE_KEY]: states });
  } catch (error) {
    console.error('TabStack tabGroups.onUpdated error:', error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if (typeof changeInfo.groupId === 'number' && tab.windowId !== undefined) {
      await refreshManagedTitlesInWindow(tab.windowId);
      return;
    }

    if (changeInfo.title && tab.groupId > -1) {
      const group = await chrome.tabGroups.get(tab.groupId);
      if (isManagedGroup(group)) {
        const tabs = await getGroupTabs(group.id, group.windowId);
        if (tabs[0]?.id === tabId) {
          await refreshManagedTitlesInWindow(group.windowId);
        }
      }
    }
  } catch {
    // Ignore transient tab or group errors.
  }
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  refreshManagedTitlesInWindow(moveInfo.windowId).catch(() => {});
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  refreshManagedTitlesInWindow(attachInfo.newWindowId).catch(() => {});
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  refreshManagedTitlesInWindow(detachInfo.oldWindowId).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (!removeInfo.isWindowClosing) {
    refreshManagedTitlesInWindow(removeInfo.windowId).catch(() => {});
  }
});
