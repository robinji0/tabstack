export const BRAND_MARK = '⧉'; // 使用零宽空格作为隐形标识
export const GROUP_PREFIX = `${BRAND_MARK}`;
export const MANAGER_PAGE = 'manager.html';
export const TAB_GROUP_NONE = -1;
export const GROUP_COLORS = ['blue', 'cyan', 'green', 'orange', 'pink', 'purple', 'red'];
export const COLOR_HEX = {
  blue: '#2563eb',
  cyan: '#0891b2',
  green: '#059669',
  orange: '#ea580c',
  pink: '#db2777',
  purple: '#7c3aed',
  red: '#dc2626',
  grey: '#64748b',
  yellow: '#ca8a04'
};

export const FALLBACK_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCBmaWxsPSIjZTZmMGZmIiByeD0iMTYiIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIvPjxjaXJjbGUgY3g9IjMyIiBjeT0iMzIiIHI9IjE4IiBmaWxsPSIjMjU2M2ViIiBvcGFjaXR5PSIwLjE4Ii8+PHBhdGggZD0iTTMyIDE0YzkuOTQxIDAgMTggOC4wNTkgMTggMThTNDEuOTQxIDUwIDMyIDUwIDE0IDQxLjk0MSAxNCAzMiAyMi4wNTkgMTQgMzIgMTRabTAgNWMtNy4xOCAwLTEzIDUuODItMTMgMTNzNS44MiAxMyAxMyAxMyAxMy01LjgyIDEzLTEzLTUuODItMTMtMTMtMTNaIiBmaWxsPSIjMjU2M2ViIi8+PHBhdGggZD0iTTMyIDIwYzMuNDI2IDAgNi4yIDUuMzcxIDYuMiAxMnMtMi43NzQgMTItNi4yIDEyLTYuMi01LjM3MS02LjItMTIgMi43NzQtMTIgNi4yLTEyWm0wIDVjLS44MjcgMC0xLjY4NiAxLjk2Ny0xLjY4NiA3czAuODU5IDcgMS42ODYgN2MuODI3IDAgMS42ODYtMS45NjcgMS42ODYtN3MtMC44NTktNy0xLjY4Ni03WiIgZmlsbD0iIzI1NjNlYiIvPjwvc3ZnPg==';

export function isManagedGroupTitle(title = '') {
  // 兼容旧的 emoji 图标和新的隐形空格
  return title.startsWith('\u200B') || title.startsWith('⧉');
}

export function isManagedGroup(group) {
  return Boolean(group && isManagedGroupTitle(group.title || ''));
}

export function stripGroupPrefix(title = '') {
  let t = String(title || '');
  // 强力替换旧版冗余图标和新版隐形空格
  return t.replace(/^⧉\s*/, '').replace(/^\u200B\s*/, '').trim();
}

export function normalizeTitle(title = '', fallback = 'Stack', maxLength = 18) {
  const cleaned = String(title || '').replace(/\s+/g, ' ').trim();
  const base = cleaned || fallback;
  if (base.length <= maxLength) {
    return base;
  }
  return `${base.slice(0, maxLength - 1).trimEnd()}…`;
}

export function hashString(input = '') {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function pickGroupColor(seed = '') {
  return GROUP_COLORS[Math.abs(hashString(seed)) % GROUP_COLORS.length];
}

export function buildUniqueManagedTitle(baseName, existingGroups = [], excludeGroupId = null, fallback = 'Stack') {
  const cleanBase = normalizeTitle(baseName, fallback);
  const usedTitles = new Set(
      existingGroups
          .filter((group) => group.id !== excludeGroupId && isManagedGroup(group))
          .map((group) => group.title)
  );

  const initialTitle = `${GROUP_PREFIX}${cleanBase}`;
  if (!usedTitles.has(initialTitle)) {
    return initialTitle;
  }

  let suffix = 2;
  while (usedTitles.has(`${GROUP_PREFIX}${cleanBase} · ${suffix}`)) {
    suffix += 1;
  }
  return `${GROUP_PREFIX}${cleanBase} · ${suffix}`;
}

export function colorHex(color = 'blue') {
  return COLOR_HEX[color] || COLOR_HEX.blue;
}

export function faviconSrc(tab) {
  return tab?.favIconUrl || FALLBACK_FAVICON;
}

export function tabHost(tab) {
  try {
    const url = new URL(tab?.url || tab?.pendingUrl || '');
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isInternalExtensionTab(tab) {
  const url = tab?.url || tab?.pendingUrl || '';
  return url.startsWith('chrome-extension://') || url.startsWith('edge-extension://');
}

export function sortTabs(tabs = []) {
  return [...tabs].sort((a, b) => a.index - b.index);
}

export function createElement(tagName, className = '', text = null) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== null && text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function matchesTabKeyword(tab, keyword = '') {
  if (!keyword) {
    return true;
  }
  const needle = keyword.toLowerCase();
  return [tab?.title, tab?.url, tab?.pendingUrl, tabHost(tab)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
}
