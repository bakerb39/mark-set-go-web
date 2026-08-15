(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';

  const PERSONAS = Object.freeze({
    mark: Object.freeze({
      id: 'mark',
      name: 'Mark',
      ask: 'Ask Mark',
      avatar: '/assets/ask-mark/ask-mark-avatar.png'
    }),
    beth: Object.freeze({
      id: 'beth',
      name: 'Beth',
      ask: 'Ask Beth',
      avatar: '/assets/companions/beth/beth-avatar.png'
    }),
    chad: Object.freeze({
      id: 'chad',
      name: 'Chad',
      ask: 'Ask Chad',
      avatar: '/assets/companions/chad/chad-avatar.png'
    })
  });

  let scheduled = false;
  let applying = false;

  function selectedId() {
    // Prefer the app's live companion identity because app.js already consults
    // window.MSGCompanion.config before falling back to localStorage.
    const live = window.MSGCompanion?.config;
    if (live?.id && PERSONAS[live.id]) return live.id;

    try {
      const stored = String(
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_KEY) ||
        'mark'
      ).toLowerCase();
      return PERSONAS[stored] ? stored : 'mark';
    } catch {
      return 'mark';
    }
  }

  function identity() {
    const id = selectedId();
    const live = window.MSGCompanion?.config;

    if (live?.id === id) {
      return {
        ...PERSONAS[id],
        ...live,
        id,
        name: live.name || PERSONAS[id].name,
        ask: live.ask || `Ask ${live.name || PERSONAS[id].name}`,
        avatar: live.avatar || PERSONAS[id].avatar
      };
    }

    return PERSONAS[id];
  }

  function shouldSkipTextNode(node) {
    const parent = node?.parentElement;
    if (!parent) return true;

    // Never change actual reading material, selected quotations, user-authored
    // notes, source text, code, or the companion-choice names themselves.
    return Boolean(parent.closest([
      '#reader',
      '.interactive-reader',
      '.reader-word',
      '.reader-group',
      '.reading-column',
      '.book-page',
      '.reader-page',
      '.modern-guide-reading-copy',
      '.guide-reading-copy',
      '.article-body',
      '.document-body',
      '.mark-selection-card blockquote',
      '.fullscreen-mark-selection-card blockquote',
      'blockquote',
      'q',
      'pre',
      'code',
      'textarea',
      '[contenteditable="true"]',
      '.global-notebook-entry-body',
      '.notebook-entry-body',
      '.saved-note-body',
      '.companion-persona-options',
      '.companion-safe-grid',
      '.companion-persona-settings-safe',
      '[data-companion-choice]'
    ].join(',')));
  }

  function replaceCompanionCopy(value, person) {
    if (!value || !person) return value;
    let next = String(value);

    // Protect the product name before persona substitutions.
    const brandToken = '\uE000MSG_BRAND\uE001';
    next = next.replace(/Mark,\s*Set,\s*Go!/g, brandToken);

    // Ask-companion language.
    next = next
      .replace(/Ask (?:Mark|Beth|Chad)/gi, person.ask)
      .replace(/Meet (?:Mark|Beth|Chad)/gi, `Meet ${person.name}`)
      .replace(/Go Further with (?:Mark|Beth|Chad)/gi, `Go Further with ${person.name}`)
      .replace(/(?:Mark|Beth|Chad)[’']s Notebook/gi, `${person.name}’s Notebook`)
      .replace(/(?:Mark|Beth|Chad) Notebook/gi, `${person.name} Notebook`)
      .replace(/(?:Mark|Beth|Chad)[’']s full responses/gi, `${person.name}’s full responses`)
      .replace(/(?:Mark|Beth|Chad)[’']s response/gi, `${person.name}’s response`)
      .replace(/(?:Mark|Beth|Chad)[’']s analysis/gi, `${person.name}’s analysis`)
      .replace(/(?:Mark|Beth|Chad) uses\b/gi, `${person.name} uses`)
      .replace(/(?:Mark|Beth|Chad) can\b/gi, `${person.name} can`)
      .replace(/(?:Mark|Beth|Chad) is\b/gi, `${person.name} is`)
      .replace(/(?:Mark|Beth|Chad) will\b/gi, `${person.name} will`)
      .replace(/available to (?:Mark|Beth|Chad)\b/gi, `available to ${person.name}`)
      .replace(/with (?:Mark|Beth|Chad)\b/gi, `with ${person.name}`)
      .replace(/from (?:Mark|Beth|Chad)\b/gi, `from ${person.name}`)
      .replace(/Close (?:Mark|Beth|Chad)\b/gi, `Close ${person.name}`);

    // Standalone persona labels such as the drawer's "BETH" or "MARK".
    const trimmed = next.trim();
    if (/^(MARK|BETH|CHAD)$/i.test(trimmed)) {
      const leading = next.slice(0, next.indexOf(trimmed));
      const trailing = next.slice(next.indexOf(trimmed) + trimmed.length);
      const label = trimmed === trimmed.toUpperCase()
        ? person.name.toUpperCase()
        : person.name;
      next = `${leading}${label}${trailing}`;
    }

    return next.replace(new RegExp(brandToken, 'g'), 'Mark, Set, Go!');
  }

  function syncText(root, person) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      if (shouldSkipTextNode(node)) return;
      const current = node.nodeValue || '';
      const next = replaceCompanionCopy(current, person);
      if (next !== current) node.nodeValue = next;
    });
  }

  function syncAttributes(root, person) {
    if (!root) return;

    const attributes = ['aria-label', 'title', 'placeholder'];

    root.querySelectorAll('*').forEach((element) => {
      if (element.closest(
        '#reader, .interactive-reader, blockquote, q, pre, code, textarea, ' +
        '[contenteditable="true"], .companion-persona-options, .companion-safe-grid, ' +
        '.companion-persona-settings-safe, [data-companion-choice]'
      )) return;

      attributes.forEach((attribute) => {
        if (!element.hasAttribute(attribute)) return;
        const current = element.getAttribute(attribute) || '';
        const next = replaceCompanionCopy(current, person);
        if (next !== current) element.setAttribute(attribute, next);
      });
    });
  }

  function replaceAssistantSelfReference(value, person) {
    if (!value || !person) return value;

    const brandToken = '\uE010MSG_CHAT_BRAND\uE011';
    let next = String(value).replace(/Mark,\s*Set,\s*Go!/g, brandToken);

    // Only phrases that clearly identify the assistant itself are changed here.
    // Do not replace an arbitrary occurrence of "Mark", because a book/article
    // or the reader's question may actually be about a person named Mark.
    next = next
      .replace(/\bI am (?:Mark|Beth|Chad)\b/gi, `I am ${person.name}`)
      .replace(/\bI['’]m (?:Mark|Beth|Chad)\b/gi, `I’m ${person.name}`)
      .replace(/\bMy name is (?:Mark|Beth|Chad)\b/gi, `My name is ${person.name}`)
      .replace(/\bAs (?:Mark|Beth|Chad),/gi, `As ${person.name},`)
      .replace(/\b(?:Mark|Beth|Chad) here\b/gi, `${person.name} here`)
      .replace(/\b(?:Mark|Beth|Chad) can help\b/gi, `${person.name} can help`)
      .replace(/\b(?:Mark|Beth|Chad) can explain\b/gi, `${person.name} can explain`)
      .replace(/\b(?:Mark|Beth|Chad) is analyzing\b/gi, `${person.name} is analyzing`)
      .replace(/\b(?:Mark|Beth|Chad) is reading\b/gi, `${person.name} is reading`)
      .replace(/\b(?:Mark|Beth|Chad) is thinking\b/gi, `${person.name} is thinking`);

    return next.replace(new RegExp(brandToken, 'g'), 'Mark, Set, Go!');
  }

  function syncAssistantChatText(root, person) {
    if (!root || !person) return;

    const assistantSelectors = [
      '.mark-response',
      '.fullscreen-mark-response',
      '.ask-mark-response',
      '.assistant-message',
      '.chat-message.assistant',
      '.chat-message[data-role="assistant"]',
      '[data-role="assistant"]',
      '[data-message-role="assistant"]',
      '[data-author="assistant"]',
      '[data-speaker="assistant"]',
      '.ask-mark-message.assistant',
      '.mark-chat-assistant'
    ].join(',');

    root.querySelectorAll(assistantSelectors).forEach((message) => {
      // Do not alter quotations/source excerpts nested inside an assistant card.
      const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      nodes.forEach((node) => {
        if (node.parentElement?.closest('blockquote, q, pre, code')) return;
        const current = node.nodeValue || '';
        const next = replaceAssistantSelfReference(current, person);
        if (next !== current) node.nodeValue = next;
      });

      // Speaker/name labels should always follow the active companion.
      message.querySelectorAll(
        '.assistant-name, .message-author, .chat-speaker, ' +
        '.mark-response-heading span, [data-assistant-name]'
      ).forEach((label) => {
        const current = label.textContent || '';
        if (/^(Ask )?(Mark|Beth|Chad)$/i.test(current.trim())) {
          label.textContent = /^Ask /i.test(current.trim()) ? person.ask : person.name;
        }
      });
    });
  }

  function syncKnownGeneratedSurfaces(person) {
    // These are common hard-coded companion surfaces generated by app.js and
    // ask-mark-hub.js. The generic text pass handles their visible strings, and
    // this list ensures recently rerendered surfaces are covered immediately.
    [
      document.querySelector('#word-panel'),
      document.querySelector('#fullscreen-mark-drawer'),
      document.querySelector('#ask-mark-hub'),
      document.querySelector('.ask-mark-hub'),
      document.querySelector('.global-notebook-page'),
      document.querySelector('.ai-center'),
      document.querySelector('.profile-preferences-page'),
      document.querySelector('.home-mark-card'),
      document.querySelector('.modern-guide-page'),
      document.querySelector('.classic-guide-page')
    ].filter(Boolean).forEach((surface) => {
      syncText(surface, person);
      syncAttributes(surface, person);
      syncAssistantChatText(surface, person);
    });
  }

  function applyNow() {
    if (applying) return;
    applying = true;

    try {
      const person = identity();
      document.documentElement.dataset.activeCompanionName = person.name;

      const app = document.getElementById('app');
      if (app) {
        syncText(app, person);
        syncAttributes(app, person);
        syncAssistantChatText(app, person);
      }

      syncKnownGeneratedSurfaces(person);
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      applyNow();
    });
  }

  // Mark/Beth and Chad can all change through the profile selector.
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.companion-persona-options button')) {
      window.setTimeout(scheduleApply, 0);
      window.setTimeout(scheduleApply, 120);
    }
  }, true);

  document.addEventListener('marksetgo:companion-changed', scheduleApply);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY) scheduleApply();
  });

  const boot = () => {
    applyNow();

    const app = document.getElementById('app');
    if (app) {
      new MutationObserver(scheduleApply).observe(app, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    new MutationObserver(scheduleApply).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-companion']
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.MSGCompanionCopySync = Object.freeze({
    apply: scheduleApply,
    identity
  });
})();
