import {
  TAB_GROUP_NONE,
  buildUniqueManagedTitle,
  createElement,
  faviconSrc,
  isInternalExtensionTab,
  isManagedGroup,
  matchesTabKeyword,
  pickGroupColor,
  sortTabs,
  stripGroupPrefix,
  tabHost
} from './shared.js';

const CUSTOM_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6d28d9"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs><rect x="18" y="18" width="476" height="476" rx="118" fill="url(#bg)"/><g opacity="0.98"><g transform="translate(0 6) rotate(-10 219 180)"><rect x="110" y="98" width="218" height="164" rx="44" fill="#2ee9ff" stroke="white" stroke-width="10"/><rect x="128" y="114" width="182" height="40" rx="18" fill="rgba(255,255,255,0.5)"/></g><g transform="rotate(-2 262 228)"><rect x="152" y="146" width="220" height="164" rx="44" fill="white" stroke="white" stroke-width="10"/><rect x="170" y="162" width="184" height="40" rx="18" fill="#eaf2ff"/></g><g transform="rotate(8 304 276)"><rect x="194" y="194" width="220" height="164" rx="44" fill="#ffa136" stroke="white" stroke-width="10"/><rect x="212" y="210" width="184" height="40" rx="18" fill="#ffd6a5"/></g></g><rect x="98" y="220" width="160" height="72" rx="34" fill="#ffd648" stroke="#fff5c8" stroke-width="8"/><rect x="92" y="254" width="338" height="166" rx="60" fill="#ffbc2e" stroke="#fff5c8" stroke-width="10"/><rect x="112" y="274" width="298" height="130" rx="48" fill="#ffcd4e"/><rect x="356" y="92" width="76" height="76" rx="26" fill="white"/><path d="M394 110l8 12 12 8-12 8-8 12-8-12-12-8 12-8 8-12z" fill="#6d28d9"/><rect x="18" y="18" width="476" height="476" rx="118" fill="none" stroke="rgba(255,255,255,0.27)" stroke-width="6"/></svg>`;
const STACK_UI_MARK = '⧉️';
const PAYPAL_DONATION_URL = 'https://www.paypal.com/paypalme/robin326753';

const dict = {
  en: {
    extTagline: 'Stack tabs. Keep every page.',
    searchPlaceholder: 'Search stacks, titles, or links...',
    selectAll: 'Select all',
    releaseAll: 'Release all stacks',
    existingStacks: 'Existing stacks',
    existingStacksHint: 'Expand, manage, or release your saved stacks.',
    noStacks: 'No stacks yet',
    noStacksHint: 'Create a new stack with the ungrouped tabs below.',
    eligibleTabs: 'Tabs for a new stack',
    currentWindowOnly: 'Only ungrouped tabs from this window appear here.',
    noEligibleTabs: 'No eligible tabs',
    noEligibleTabsHint: 'All tabs in this window are already grouped.',
    createStack: 'Create new stack',
    defaultStackName: 'Stack',
    tabSingular: 'tab',
    tabPlural: 'tabs',
    expand: 'Expand',
    collapse: 'Collapse',
    manage: 'Manage',
    release: 'Release',
    sponsor: 'Sponsor',
    confirmReleaseAll: 'Are you sure you want to release all TabStack groups in this window?'
  },
  zh: {
    extTagline: '收纳标签，不丢页面。',
    searchPlaceholder: '搜索收纳、标题或链接...',
    selectAll: '全选',
    releaseAll: '释放全部收纳',
    existingStacks: '已有收纳',
    existingStacksHint: '展开、管理或释放已有收纳。',
    noStacks: '还没有收纳',
    noStacksHint: '在下方选择未分组标签，即可创建新的收纳。',
    eligibleTabs: '可加入新收纳的标签',
    currentWindowOnly: '这里只显示当前窗口中未分组的标签页。',
    noEligibleTabs: '没有可收纳的标签',
    noEligibleTabsHint: '当前窗口中的标签都已经分组。',
    createStack: '创建新收纳',
    defaultStackName: '收纳',
    tabSingular: '个标签',
    tabPlural: '个标签',
    expand: '展开',
    collapse: '收起',
    manage: '管理',
    release: '释放',
    sponsor: '赞助',
    confirmReleaseAll: '确定要释放当前窗口中的全部 TabStack 收纳吗？'
  }
};

const state = {
  windowId: null,
  searchKeyword: '',
  selectedTabIds: new Set(),
  allTabs: [],
  eligibleTabs: [],
  managedGroups: [],
  tabsByGroup: new Map(),
  lang: localStorage.getItem('tabstack_lang') || 'en'
};

const elements = {};

function msg(key) {
  return dict[state.lang][key] || key;
}

function syncLanguageButtons() {
  elements.langBtnEn.classList.toggle('active', state.lang === 'en');
  elements.langBtnZh.classList.toggle('active', state.lang === 'zh');
  elements.langBtnEn.setAttribute('aria-pressed', String(state.lang === 'en'));
  elements.langBtnZh.setAttribute('aria-pressed', String(state.lang === 'zh'));
}

function setLanguage(lang) {
  if (lang !== 'en' && lang !== 'zh') {
    return;
  }
  state.lang = lang;
  localStorage.setItem('tabstack_lang', state.lang);
  updateUITexts();
}

function updateUITexts() {
  document.documentElement.lang = state.lang;
  document.getElementById('extTagline').textContent = msg('extTagline');
  elements.searchInput.placeholder = msg('searchPlaceholder');
  elements.selectAllBtn.textContent = msg('selectAll');
  elements.releaseAllBtn.textContent = msg('releaseAll');
  elements.sponsorBtn.textContent = msg('sponsor');
  document.getElementById('titleExisting').textContent = msg('existingStacks');
  document.getElementById('hintExisting').textContent = msg('existingStacksHint');
  document.getElementById('emptyExistingTitle').textContent = msg('noStacks');
  document.getElementById('emptyExistingHint').textContent = msg('noStacksHint');
  document.getElementById('titleEligible').textContent = msg('eligibleTabs');
  document.getElementById('hintEligible').textContent = msg('currentWindowOnly');
  document.getElementById('emptyEligibleTitle').textContent = msg('noEligibleTabs');
  document.getElementById('emptyEligibleHint').textContent = msg('noEligibleTabsHint');
  syncLanguageButtons();
  updatePrimaryButton();
  if (state.windowId) {
    render();
  }
}

async function getFocusedNormalWindowId() {
  const currentWindow = await chrome.windows.getCurrent({ populate: false });
  return currentWindow?.id;
}

async function loadData() {
  state.windowId = await getFocusedNormalWindowId();
  if (!state.windowId) {
    state.allTabs = [];
    state.eligibleTabs = [];
    state.managedGroups = [];
    state.tabsByGroup = new Map();
    render();
    return;
  }

  const [groups, tabs] = await Promise.all([
    chrome.tabGroups.query({ windowId: state.windowId }),
    chrome.tabs.query({ windowId: state.windowId })
  ]);

  state.allTabs = sortTabs(tabs);
  state.tabsByGroup = new Map();
  for (const tab of state.allTabs) {
    if (tab.groupId > -1) {
      const collection = state.tabsByGroup.get(tab.groupId) || [];
      collection.push(tab);
      state.tabsByGroup.set(tab.groupId, collection);
    }
  }

  state.managedGroups = groups
      .filter(isManagedGroup)
      .sort((left, right) => {
        const leftTabs = state.tabsByGroup.get(left.id) || [];
        const rightTabs = state.tabsByGroup.get(right.id) || [];
        const leftIndex = leftTabs[0]?.index ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = rightTabs[0]?.index ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });

  state.eligibleTabs = state.allTabs.filter((tab) => tab.groupId === TAB_GROUP_NONE && !isInternalExtensionTab(tab));
  state.selectedTabIds = new Set(
      [...state.selectedTabIds].filter((tabId) => state.eligibleTabs.some((tab) => tab.id === tabId))
  );
  render();
}

async function toggleGroupCollapseSafe(groupId, isCollapsed) {
  if (!isCollapsed) {
    const tabsInGroup = state.tabsByGroup.get(groupId) || [];
    const isActiveInGroup = tabsInGroup.some((tab) => tab.active);

    if (isActiveInGroup) {
      const outsideTab = state.allTabs.find((tab) => tab.groupId !== groupId);
      if (outsideTab) {
        await chrome.tabs.update(outsideTab.id, { active: true });
      } else {
        await chrome.tabs.create({ active: true, windowId: state.windowId });
      }
    }
  }

  await chrome.tabGroups.update(groupId, { collapsed: !isCollapsed });
  await loadData();
}

function filteredGroups() {
  const keyword = state.searchKeyword.trim().toLowerCase();
  if (!keyword) {
    return state.managedGroups;
  }
  return state.managedGroups.filter((group) => stripGroupPrefix(group.title).toLowerCase().includes(keyword));
}

function filteredEligibleTabs() {
  const keyword = state.searchKeyword.trim();
  return state.eligibleTabs.filter((tab) => matchesTabKeyword(tab, keyword));
}

function formatTabCount(count) {
  const label = count === 1 ? msg('tabSingular') : msg('tabPlural');
  return `${count} ${label}`;
}

function renderGroupPreviews(container, tabs) {
  const previewTabs = tabs.slice(0, 3);
  for (const tab of previewTabs) {
    const image = createElement('img');
    image.src = faviconSrc(tab);
    image.alt = '';
    container.appendChild(image);
  }
}

function renderGroups() {
  const groups = filteredGroups();
  elements.groupsList.innerHTML = '';
  elements.stackCountBadge.textContent = String(state.managedGroups.length);
  elements.groupsEmpty.classList.toggle('hidden', groups.length > 0);

  for (const group of groups) {
    const groupTabs = sortTabs(state.tabsByGroup.get(group.id) || []);
    const card = createElement('div', 'group-card');
    card.setAttribute('data-group-color', group.color);

    const logoWrap = createElement('div', 'group-card__logo');
    logoWrap.innerHTML = CUSTOM_SVG_ICON;

    const content = createElement('div', 'group-card__content');
    const pill = createElement('div', 'group-pill');
    const mark = createElement('span', 'group-pill__emoji', STACK_UI_MARK);
    const label = createElement('span', 'group-pill__label', stripGroupPrefix(group.title));
    pill.append(mark, label);

    const meta = createElement('div', 'group-card__meta');
    const previews = createElement('div', 'group-card__previews');
    renderGroupPreviews(previews, groupTabs);
    const count = createElement('span', '', formatTabCount(groupTabs.length));
    meta.append(previews, count);

    content.append(pill, meta);

    const actions = createElement('div', 'group-card__actions');

    const toggleBtn = createElement('button', 'action-text', group.collapsed ? msg('expand') : msg('collapse'));
    toggleBtn.type = 'button';
    toggleBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await toggleGroupCollapseSafe(group.id, group.collapsed);
    });

    const manageBtn = createElement('button', 'action-text', msg('manage'));
    manageBtn.type = 'button';
    manageBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await chrome.runtime.sendMessage({ type: 'openManager', groupId: group.id });
      window.close();
    });

    // 这里将 Release 按钮加了回来
    const releaseBtn = createElement('button', 'action-text text-danger', msg('release'));
    releaseBtn.type = 'button';
    releaseBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const tabsToUngroup = state.tabsByGroup.get(group.id) || [];
      if (tabsToUngroup.length > 0) {
        await chrome.tabs.ungroup(tabsToUngroup.map((tab) => tab.id));
      }
      await loadData();
    });

    actions.append(toggleBtn, manageBtn, releaseBtn);
    card.append(logoWrap, content, actions);

    card.addEventListener('click', async (event) => {
      if (event.target.closest('button')) {
        return;
      }
      await toggleGroupCollapseSafe(group.id, group.collapsed);
    });

    elements.groupsList.appendChild(card);
  }
}

function renderTabs() {
  const tabs = filteredEligibleTabs();
  elements.tabsGrid.innerHTML = '';
  elements.eligibleCountBadge.textContent = String(state.eligibleTabs.length);
  elements.tabsEmpty.classList.toggle('hidden', tabs.length > 0);

  for (const tab of tabs) {
    const card = createElement('button', 'tab-card');
    card.type = 'button';
    if (state.selectedTabIds.has(tab.id)) {
      card.classList.add('selected');
    }

    const textWrap = createElement('div', 'tab-card__text');
    const title = createElement('div', 'tab-card__title', tab.title || tab.pendingUrl || msg('defaultStackName'));
    const host = createElement('div', 'tab-card__host', tabHost(tab) || tab.url || '');
    textWrap.append(title, host);

    card.append(textWrap);
    card.addEventListener('click', () => {
      if (state.selectedTabIds.has(tab.id)) {
        state.selectedTabIds.delete(tab.id);
      } else {
        state.selectedTabIds.add(tab.id);
      }
      renderTabs();
      updatePrimaryButton();
    });

    elements.tabsGrid.appendChild(card);
  }
}

function updatePrimaryButton() {
  const selectedCount = state.selectedTabIds.size;
  elements.stackBtn.disabled = selectedCount === 0;
  elements.stackBtn.textContent = selectedCount > 0
      ? `${msg('createStack')} (${selectedCount})`
      : msg('createStack');
  elements.releaseAllBtn.disabled = state.managedGroups.length === 0;
}

function render() {
  renderGroups();
  renderTabs();
  updatePrimaryButton();
}

async function createManagedGroup() {
  const selectedTabs = sortTabs(state.eligibleTabs.filter((tab) => state.selectedTabIds.has(tab.id)));
  if (selectedTabs.length === 0 || !state.windowId) {
    return;
  }

  const groupId = await chrome.tabs.group({
    createProperties: { windowId: state.windowId },
    tabIds: selectedTabs.map((tab) => tab.id)
  });

  const existingGroups = await chrome.tabGroups.query({ windowId: state.windowId });
  const fallback = msg('defaultStackName');
  const title = buildUniqueManagedTitle(selectedTabs[0]?.title || fallback, existingGroups, groupId, fallback);
  const color = pickGroupColor(title);

  await chrome.tabGroups.update(groupId, {
    title,
    color,
    collapsed: true
  });

  state.selectedTabIds.clear();
  await loadData();
}

async function releaseAllManagedGroups() {
  if (state.managedGroups.length === 0) {
    return;
  }

  const confirmed = window.confirm(msg('confirmReleaseAll'));
  if (!confirmed) {
    return;
  }

  const tabIdsToUngroup = [];
  for (const group of state.managedGroups) {
    const tabs = state.tabsByGroup.get(group.id) || [];
    tabIdsToUngroup.push(...tabs.map((tab) => tab.id));
  }

  if (tabIdsToUngroup.length > 0) {
    await chrome.tabs.ungroup(tabIdsToUngroup);
  }

  state.selectedTabIds.clear();
  await loadData();
}

function bindEvents() {
  elements.searchInput.addEventListener('input', (event) => {
    state.searchKeyword = event.target.value || '';
    render();
  });

  elements.selectAllBtn.addEventListener('click', () => {
    for (const tab of filteredEligibleTabs()) {
      state.selectedTabIds.add(tab.id);
    }
    renderTabs();
    updatePrimaryButton();
  });

  elements.langBtnEn.addEventListener('click', () => {
    setLanguage('en');
  });

  elements.langBtnZh.addEventListener('click', () => {
    setLanguage('zh');
  });

  elements.releaseAllBtn.addEventListener('click', () => {
    releaseAllManagedGroups().catch(console.error);
  });

  elements.sponsorBtn.addEventListener('click', async () => {
    await chrome.tabs.create({ url: PAYPAL_DONATION_URL });
    window.close();
  });

  elements.stackBtn.addEventListener('click', () => {
    createManagedGroup().catch(console.error);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  elements.searchInput = document.getElementById('searchInput');
  elements.selectAllBtn = document.getElementById('selectAllBtn');
  elements.releaseAllBtn = document.getElementById('releaseAllBtn');
  elements.groupsList = document.getElementById('groupsList');
  elements.groupsEmpty = document.getElementById('groupsEmpty');
  elements.stackCountBadge = document.getElementById('stackCountBadge');
  elements.tabsGrid = document.getElementById('tabsGrid');
  elements.tabsEmpty = document.getElementById('tabsEmpty');
  elements.eligibleCountBadge = document.getElementById('eligibleCountBadge');
  elements.stackBtn = document.getElementById('stackBtn');
  elements.sponsorBtn = document.getElementById('sponsorBtn');
  elements.langBtnEn = document.getElementById('langBtnEn');
  elements.langBtnZh = document.getElementById('langBtnZh');

  updateUITexts();
  bindEvents();
  await loadData();
});
