import {
  TAB_GROUP_NONE,
  colorHex,
  createElement,
  faviconSrc,
  isInternalExtensionTab,
  matchesTabKeyword,
  queryParam,
  sortTabs,
  stripGroupPrefix,
  tabHost
} from './shared.js';

const STACK_UI_MARK = '⧉️';

const dict = {
  en: {
    manageWindowTitle: 'Manage stack',
    manageWindowSubtitle: 'Open tabs, move them in or out, or release this stack.',
    stackTitleAutoHint: 'The stack name follows the first tab',
    focusGroup: 'Locate stack',
    dissolveStack: 'Release stack',
    closeManager: 'Close',
    tabsInStack: 'Tabs in this stack',
    removeSelected: 'Remove selected',
    searchGroupPlaceholder: 'Search tabs in this stack...',
    groupClosed: 'This stack is no longer available',
    groupClosedHint: 'The group may have been released or emptied.',
    availableTabs: 'Tabs you can add',
    addSelected: 'Add selected',
    searchAvailablePlaceholder: 'Search tabs you can add...',
    noEligibleTabs: 'No tabs to add',
    noEligibleTabsHint: 'There are no ungrouped tabs available in this window.',
    tabSingular: 'tab',
    tabPlural: 'tabs',
    searchNoResults: 'No matching tabs',
    searchNoResultsHint: 'Try a different keyword or clear the search field.',
    removeOne: 'Remove',
    addOne: 'Add',
    openTab: 'Open',
    defaultStackName: 'Stack',
    confirmDissolveStack: 'Are you sure you want to release all tabs from this stack?'
  },
  zh: {
    manageWindowTitle: '管理收纳',
    manageWindowSubtitle: '打开标签、移入移出，或释放当前收纳。',
    stackTitleAutoHint: '收纳名称会跟随第一个标签自动更新',
    focusGroup: '定位收纳',
    dissolveStack: '释放收纳',
    closeManager: '关闭',
    tabsInStack: '当前收纳中的标签',
    removeSelected: '移出选中',
    searchGroupPlaceholder: '搜索当前收纳中的标签...',
    groupClosed: '这个收纳已经不存在了',
    groupClosedHint: '该分组可能已经被释放，或其中标签已全部移出。',
    availableTabs: '可加入当前收纳的标签',
    addSelected: '加入选中',
    searchAvailablePlaceholder: '搜索可加入的标签...',
    noEligibleTabs: '没有可加入的标签',
    noEligibleTabsHint: '当前窗口中没有未分组标签可加入。',
    tabSingular: '个标签',
    tabPlural: '个标签',
    searchNoResults: '没有匹配结果',
    searchNoResultsHint: '试试别的关键词，或者清空搜索框。',
    removeOne: '移出',
    addOne: '加入',
    openTab: '打开',
    defaultStackName: '收纳',
    confirmDissolveStack: '确定要释放这个收纳中的所有标签吗？'
  }
};

const state = {
  groupId: null,
  group: null,
  groupTabs: [],
  availableTabs: [],
  selectedGroupTabIds: new Set(),
  selectedAvailableTabIds: new Set(),
  groupSearch: '',
  availableSearch: '',
  lang: localStorage.getItem('tabstack_lang') || 'en'
};

const elements = {};
let refreshTimer = null;

function msg(key) {
  return dict[state.lang][key] || key;
}

function initI18n() {
  document.documentElement.lang = state.lang;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = msg(element.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = msg(element.dataset.i18nPlaceholder);
  });

  document.title = `${msg('manageWindowTitle')} · TabStack`;
}

function formatTabCount(count) {
  const label = count === 1 ? msg('tabSingular') : msg('tabPlural');
  return `${count} ${label}`;
}

async function refreshGroupData() {
  if (!state.groupId) {
    return;
  }

  try {
    state.group = await chrome.tabGroups.get(state.groupId);
  } catch {
    state.group = null;
    state.groupTabs = [];
    state.availableTabs = [];
    render();
    return;
  }

  const allTabs = sortTabs(await chrome.tabs.query({ windowId: state.group.windowId }));
  state.groupTabs = allTabs.filter((tab) => tab.groupId === state.groupId);
  state.availableTabs = allTabs.filter((tab) => tab.groupId === TAB_GROUP_NONE && !isInternalExtensionTab(tab));

  const validGroupIds = new Set(state.groupTabs.map((tab) => tab.id));
  const validAvailableIds = new Set(state.availableTabs.map((tab) => tab.id));

  state.selectedGroupTabIds = new Set([...state.selectedGroupTabIds].filter((tabId) => validGroupIds.has(tabId)));
  state.selectedAvailableTabIds = new Set([...state.selectedAvailableTabIds].filter((tabId) => validAvailableIds.has(tabId)));

  document.title = `${stripGroupPrefix(state.group.title)} · ${msg('manageWindowTitle')} · TabStack`;
  render();
}

function filteredGroupTabs() {
  return state.groupTabs.filter((tab) => matchesTabKeyword(tab, state.groupSearch));
}

function filteredAvailableTabs() {
  return state.availableTabs.filter((tab) => matchesTabKeyword(tab, state.availableSearch));
}

function updateButtons() {
  const removeCount = state.selectedGroupTabIds.size;
  const addCount = state.selectedAvailableTabIds.size;

  elements.removeSelectedBtn.disabled = removeCount === 0;
  elements.addSelectedBtn.disabled = addCount === 0;
  elements.focusGroupBtn.disabled = !state.group || state.groupTabs.length === 0;
  elements.dissolveBtn.disabled = !state.group || state.groupTabs.length === 0;

  elements.removeSelectedBtn.textContent = removeCount > 0
      ? `${msg('removeSelected')} (${removeCount})`
      : msg('removeSelected');

  elements.addSelectedBtn.textContent = addCount > 0
      ? `${msg('addSelected')} (${addCount})`
      : msg('addSelected');
}

function scheduleRefresh(delay = 120) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshGroupData().catch(() => {});
  }, delay);
}

function renderHeader() {
  if (!state.group) {
    elements.groupHero.style.setProperty('--group-color', colorHex('grey'));
    elements.groupNameLabel.textContent = msg('groupClosed');
    elements.groupCount.textContent = msg('groupClosedHint');
    elements.inStackCountLabel.textContent = formatTabCount(0);
    elements.availableCountLabel.textContent = formatTabCount(0);
    document.title = `${msg('manageWindowTitle')} · TabStack`;
    return;
  }

  elements.groupHero.style.setProperty('--group-color', colorHex(state.group.color));
  elements.groupNameLabel.textContent = stripGroupPrefix(state.group.title);
  elements.groupCount.textContent = formatTabCount(state.groupTabs.length);
  elements.inStackCountLabel.textContent = formatTabCount(state.groupTabs.length);
  elements.availableCountLabel.textContent = formatTabCount(state.availableTabs.length);
  document.title = `${stripGroupPrefix(state.group.title)} · ${msg('manageWindowTitle')} · TabStack`;
}

function buildTabRow(tab, options = {}) {
  const { selectedSet, primaryActionLabel, primaryActionClass, primaryActionHandler, focusHandler } = options;
  const row = createElement('div', 'tab-row');
  if (selectedSet.has(tab.id)) {
    row.classList.add('selected');
  }

  const toggleButton = createElement('button', 'tab-row__toggle');
  toggleButton.type = 'button';
  toggleButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (selectedSet.has(tab.id)) {
      selectedSet.delete(tab.id);
    } else {
      selectedSet.add(tab.id);
    }
    renderLists();
    updateButtons();
  });

  const icon = createElement('img', 'tab-row__icon');
  icon.src = faviconSrc(tab);
  icon.alt = '';

  const body = createElement('div', 'tab-row__body');
  const title = createElement('div', 'tab-row__title', tab.title || tab.pendingUrl || msg('defaultStackName'));
  const meta = createElement('div', 'tab-row__meta', tabHost(tab) || tab.url || '');
  body.append(title, meta);

  const actions = createElement('div', 'tab-row__actions');
  const openButton = createElement('button', 'action-quiet', msg('openTab'));
  openButton.type = 'button';
  openButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    await focusHandler(tab.id);
  });

  const actionButton = createElement('button', primaryActionClass, primaryActionLabel);
  actionButton.type = 'button';
  actionButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    await primaryActionHandler(tab.id);
  });

  actions.append(openButton, actionButton);
  row.append(toggleButton, icon, body, actions);
  row.addEventListener('click', () => {
    if (selectedSet.has(tab.id)) {
      selectedSet.delete(tab.id);
    } else {
      selectedSet.add(tab.id);
    }
    renderLists();
    updateButtons();
  });
  return row;
}

function renderLists() {
  const groupTabs = filteredGroupTabs();
  const availableTabs = filteredAvailableTabs();

  elements.groupTabsList.innerHTML = '';
  elements.availableTabsList.innerHTML = '';

  elements.groupTabsEmpty.classList.toggle('hidden', state.groupTabs.length > 0);
  elements.availableTabsEmpty.classList.toggle('hidden', availableTabs.length > 0);

  if (state.groupTabs.length > 0 && groupTabs.length === 0) {
    const empty = createElement('div', 'empty-state');
    empty.append(
        createElement('div', 'empty-state__title', msg('searchNoResults')),
        createElement('div', 'empty-state__hint', msg('searchNoResultsHint'))
    );
    elements.groupTabsList.appendChild(empty);
  }

  if (availableTabs.length === 0 && state.availableTabs.length > 0) {
    const empty = createElement('div', 'empty-state');
    empty.append(
        createElement('div', 'empty-state__title', msg('searchNoResults')),
        createElement('div', 'empty-state__hint', msg('searchNoResultsHint'))
    );
    elements.availableTabsList.appendChild(empty);
  }

  for (const tab of groupTabs) {
    const row = buildTabRow(tab, {
      selectedSet: state.selectedGroupTabIds,
      primaryActionLabel: msg('removeOne'),
      primaryActionClass: 'action-danger',
      primaryActionHandler: removeSingleTab,
      focusHandler: focusBrowserTab
    });
    elements.groupTabsList.appendChild(row);
  }

  for (const tab of availableTabs) {
    const row = buildTabRow(tab, {
      selectedSet: state.selectedAvailableTabIds,
      primaryActionLabel: msg('addOne'),
      primaryActionClass: 'action-tint',
      primaryActionHandler: addSingleTab,
      focusHandler: focusBrowserTab
    });
    elements.availableTabsList.appendChild(row);
  }
}

function render() {
  initI18n();
  renderHeader();
  renderLists();
  updateButtons();
}

async function retitleCurrentGroup() {
  if (!state.groupId) {
    return;
  }
  await chrome.runtime.sendMessage({ type: 'retitleManagedGroup', groupId: state.groupId });
}

async function focusBrowserTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (state.group && state.group.collapsed) {
    await chrome.tabGroups.update(state.group.id, { collapsed: false });
  }
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
  // 核心修改：在定位标签页并唤起浏览器后，关闭管理弹窗
  window.close();
}

async function focusGroup() {
  if (!state.group || state.groupTabs.length === 0) {
    return;
  }
  await focusBrowserTab(state.groupTabs[0].id);
}

async function removeSingleTab(tabId) {
  await chrome.tabs.ungroup(tabId);
  state.selectedGroupTabIds.delete(tabId);
  await retitleCurrentGroup();
  await refreshGroupData();
}

async function addSingleTab(tabId) {
  await chrome.tabs.group({ groupId: state.groupId, tabIds: [tabId] });
  state.selectedAvailableTabIds.delete(tabId);
  await retitleCurrentGroup();
  await refreshGroupData();
}

async function removeSelectedTabs() {
  const tabIds = [...state.selectedGroupTabIds];
  if (tabIds.length === 0) {
    return;
  }
  await chrome.tabs.ungroup(tabIds);
  state.selectedGroupTabIds.clear();
  await retitleCurrentGroup();
  await refreshGroupData();
}

async function addSelectedTabs() {
  const tabIds = [...state.selectedAvailableTabIds];
  if (tabIds.length === 0) {
    return;
  }
  await chrome.tabs.group({ groupId: state.groupId, tabIds });
  state.selectedAvailableTabIds.clear();
  await retitleCurrentGroup();
  await refreshGroupData();
}

async function dissolveCurrentStack() {
  if (!state.groupId || state.groupTabs.length === 0) {
    return;
  }

  const confirmed = window.confirm(msg('confirmDissolveStack'));
  if (!confirmed) {
    return;
  }

  await chrome.tabs.ungroup(state.groupTabs.map((tab) => tab.id));
  window.close();
}

function bindEvents() {
  elements.focusGroupBtn.addEventListener('click', () => {
    focusGroup().catch(console.error);
  });

  elements.dissolveBtn.addEventListener('click', () => {
    dissolveCurrentStack().catch(console.error);
  });

  elements.closeBtn.addEventListener('click', () => {
    window.close();
  });

  elements.removeSelectedBtn.addEventListener('click', () => {
    removeSelectedTabs().catch(console.error);
  });

  elements.addSelectedBtn.addEventListener('click', () => {
    addSelectedTabs().catch(console.error);
  });

  elements.groupSearchInput.addEventListener('input', (event) => {
    state.groupSearch = event.target.value || '';
    renderLists();
  });

  elements.availableSearchInput.addEventListener('input', (event) => {
    state.availableSearch = event.target.value || '';
    renderLists();
  });
}

function registerLiveListeners() {
  const sameWindow = (windowId) => !state.group || windowId === state.group.windowId;

  chrome.tabs.onCreated.addListener((tab) => {
    if (sameWindow(tab.windowId)) {
      scheduleRefresh();
    }
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (sameWindow(removeInfo.windowId)) {
      scheduleRefresh();
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!sameWindow(tab.windowId)) {
      return;
    }
    if (typeof changeInfo.groupId === 'number' || changeInfo.title || changeInfo.url || changeInfo.pendingUrl || changeInfo.favIconUrl) {
      scheduleRefresh();
    }
  });

  chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    if (sameWindow(moveInfo.windowId)) {
      scheduleRefresh();
    }
  });

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    if (sameWindow(attachInfo.newWindowId)) {
      scheduleRefresh();
    }
  });

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    if (sameWindow(detachInfo.oldWindowId)) {
      scheduleRefresh();
    }
  });

  chrome.tabGroups.onUpdated.addListener((group) => {
    if (group.id === state.groupId) {
      scheduleRefresh();
    }
  });

  chrome.tabGroups.onRemoved.addListener((group) => {
    if (group.id === state.groupId) {
      scheduleRefresh();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  state.groupId = Number(queryParam('groupId'));

  elements.groupHero = document.getElementById('groupHero');
  elements.groupNameLabel = document.getElementById('groupNameLabel');
  elements.groupPreviewMark = document.getElementById('groupPreviewMark');
  elements.groupCount = document.getElementById('groupCount');
  elements.inStackCountLabel = document.getElementById('inStackCountLabel');
  elements.availableCountLabel = document.getElementById('availableCountLabel');
  elements.focusGroupBtn = document.getElementById('focusGroupBtn');
  // 已移除 refreshBtn
  elements.dissolveBtn = document.getElementById('dissolveBtn');
  elements.closeBtn = document.getElementById('closeBtn');
  elements.removeSelectedBtn = document.getElementById('removeSelectedBtn');
  elements.addSelectedBtn = document.getElementById('addSelectedBtn');
  elements.groupSearchInput = document.getElementById('groupSearchInput');
  elements.availableSearchInput = document.getElementById('availableSearchInput');
  elements.groupTabsList = document.getElementById('groupTabsList');
  elements.availableTabsList = document.getElementById('availableTabsList');
  elements.groupTabsEmpty = document.getElementById('groupTabsEmpty');
  elements.availableTabsEmpty = document.getElementById('availableTabsEmpty');

  initI18n();
  elements.groupPreviewMark.textContent = STACK_UI_MARK;
  bindEvents();
  registerLiveListeners();
  await refreshGroupData();
});
