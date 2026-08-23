'use strict';

/*
 * Mark, Set, Go! — non-workspace Reader switching
 * v1.1.1 (2026-08-23)
 *
 * This layer intentionally sits ABOVE the protected Reader engine. It keeps
 * multiple in-memory Reader snapshots while preserving app.js's existing
 * activeReaderSnapshot / ReaderContinuity contract for the currently visible
 * Reader. Reader switching lives in the top Reader menu; nothing is injected
 * into the Reader canvas. Persistent restoration is a separate phase.
 */
(() => {
  if (window.parent !== window || window.__MSG_WORKSPACE_PANE__ || window.MSGWorkspacePane) return;

  if (
    typeof renderReaderWithText !== 'function' ||
    typeof renderEmptyReader !== 'function' ||
    typeof applyReaderSessionSnapshot !== 'function' ||
    typeof ReaderContinuity !== 'object'
  ) {
    console.warn('Reader switcher did not start because the main Reader runtime is unavailable.');
    return;
  }

  const slots = [];
  let activeSlotId = null;
  let nextOrdinal = 1;
  let restoringSlot = false;
  let suppressSlotSync = false;
  let readerMenu = null;

  function removeLegacyReaderStrip() {
    document.querySelectorAll('.reader-session-switcher').forEach((node) => node.remove());
  }

  // v1.0.x inserted Reader tabs directly into the Reader page. Remove any
  // legacy markup immediately; the CSS companion also keeps it hidden if an
  // older script tries to add it again after this script runs.
  removeLegacyReaderStrip();

  const originalRenderReaderWithText = renderReaderWithText;
  const originalRenderEmptyReader = renderEmptyReader;
  const originalApplyReaderSessionSnapshot = applyReaderSessionSnapshot;
  const originalCommit = ReaderContinuity.commit.bind(ReaderContinuity);
  const originalSaveBeforeNavigation = ReaderContinuity.saveBeforeNavigation.bind(ReaderContinuity);

  function cloneSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    try {
      return typeof structuredClone === 'function'
        ? structuredClone(snapshot)
        : JSON.parse(JSON.stringify(snapshot));
    } catch {
      return { ...snapshot, controls: { ...(snapshot.controls || {}) } };
    }
  }

  function slotById(id) {
    return slots.find((slot) => slot.id === id) || null;
  }

  function activeSlot() {
    return slotById(activeSlotId);
  }

  function slotTitle(slot) {
    return String(slot?.snapshot?.title || 'Empty Reader').trim() || 'Empty Reader';
  }

  function decorateSnapshot(snapshot, slot) {
    if (!snapshot || !slot) return snapshot;
    return {
      ...snapshot,
      readerId: slot.id,
      readerLabel: slot.label,
      readerOrdinal: slot.ordinal,
      controls: { ...(snapshot.controls || {}) }
    };
  }


  function updateTopReaderButton() {
    const button = document.querySelector('.top-reader-return[data-action="reader"]');
    const slot = activeSlot();
    if (!button || !slot) return;
    const title = slotTitle(slot);
    button.title = `Return to ${slot.label}${title === 'Empty Reader' ? '' : ` — ${title}`}`;
    button.dataset.readerSlotId = slot.id;
    button.dataset.readerLabel = slot.label;
  }

  function dispatchSessionEvent(name, slot = activeSlot()) {
    const detail = slot ? {
      readerId: slot.id,
      readerLabel: slot.label,
      readerOrdinal: slot.ordinal,
      documentId: slot.snapshot?.documentId || '',
      title: slot.snapshot?.title || '',
      hasDocument: Boolean(slot.snapshot?.title && slot.snapshot?.currentText)
    } : {
      readerId: '',
      readerLabel: '',
      readerOrdinal: 0,
      documentId: '',
      title: '',
      hasDocument: false
    };
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function createSlot({ snapshot = null, activate = true } = {}) {
    const ordinal = nextOrdinal++;
    const slot = {
      id: `reader-${ordinal}`,
      ordinal,
      label: `Reader ${ordinal}`,
      snapshot: null,
      createdAt: new Date().toISOString(),
      lastActivatedAt: new Date().toISOString()
    };
    slot.snapshot = snapshot ? decorateSnapshot(cloneSnapshot(snapshot), slot) : null;
    slots.push(slot);
    if (activate) activeSlotId = slot.id;
    dispatchSessionEvent('marksetgo:reader-session-list-changed', slot);
    return slot;
  }

  function ensureActiveSlot(snapshot = null) {
    let slot = activeSlot();
    if (!slot) slot = createSlot({ snapshot, activate: true });
    else if (snapshot && !slot.snapshot) slot.snapshot = decorateSnapshot(cloneSnapshot(snapshot), slot);
    return slot;
  }

  function syncSlotFromSnapshot(snapshot, { slot = activeSlot() } = {}) {
    if (!slot || !snapshot) return null;
    slot.snapshot = decorateSnapshot(cloneSnapshot(snapshot), slot);
    return slot.snapshot;
  }

  function captureActiveSlot({ persist = true } = {}) {
    const slot = activeSlot();
    if (!slot) return null;

    let snapshot = null;
    try { snapshot = ReaderContinuity.capture(); } catch {}
    if (!snapshot && activeReaderSnapshot?.title && activeReaderSnapshot?.currentText) {
      snapshot = activeReaderSnapshot;
    }
    if (!snapshot) return slot.snapshot;

    const decorated = decorateSnapshot(snapshot, slot);
    syncSlotFromSnapshot(decorated, { slot });

    if (persist) {
      suppressSlotSync = true;
      try { originalCommit(decorated, { immediate: true }); }
      finally { suppressSlotSync = false; }
    }
    return slot.snapshot;
  }

  function ensureReaderMenu() {
    if (readerMenu?.isConnected) return readerMenu;
    readerMenu = document.createElement('div');
    readerMenu.className = 'reader-session-menu';
    readerMenu.id = 'reader-session-menu';
    readerMenu.setAttribute('role', 'menu');
    readerMenu.setAttribute('aria-label', 'Readers');
    readerMenu.hidden = true;
    document.body.appendChild(readerMenu);
    return readerMenu;
  }

  function positionReaderMenu() {
    const button = document.querySelector('.top-reader-return[data-action="reader"]');
    const menu = ensureReaderMenu();
    if (!button || menu.hidden) return;
    const rect = button.getBoundingClientRect();
    const gap = 7;
    const viewportPad = 10;
    const menuWidth = Math.min(360, window.innerWidth - viewportPad * 2);
    let left = rect.right - menuWidth;
    left = Math.max(viewportPad, Math.min(left, window.innerWidth - menuWidth - viewportPad));
    let top = rect.bottom + gap;
    const estimatedHeight = Math.min(menu.scrollHeight || 300, Math.min(window.innerHeight * .70, 520));
    if (top + estimatedHeight > window.innerHeight - viewportPad) {
      top = Math.max(viewportPad, rect.top - estimatedHeight - gap);
    }
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function renderReaderMenu() {
    const menu = ensureReaderMenu();
    ensureActiveSlot(activeReaderSnapshot?.title && activeReaderSnapshot?.currentText ? activeReaderSnapshot : null);
    menu.innerHTML = `
      <div class="reader-session-menu-list">
        ${slots.map((slot) => {
          const active = slot.id === activeSlotId;
          return `
            <button type="button"
              class="reader-session-menu-item${active ? ' is-active' : ''}"
              role="menuitem"
              data-reader-slot-switch="${escapeHtml(slot.id)}"
              aria-current="${active ? 'true' : 'false'}">
              <span class="reader-session-menu-reader">${escapeHtml(slot.label)}</span>
              <span class="reader-session-menu-title">${escapeHtml(slotTitle(slot))}</span>
            </button>`;
        }).join('')}
      </div>
      <div class="reader-session-menu-separator" aria-hidden="true"></div>
      <button type="button" class="reader-session-menu-new" role="menuitem" data-reader-slot-new>＋ New Reader</button>`;
    updateTopReaderButton();
    if (!menu.hidden) positionReaderMenu();
  }

  function closeReaderMenu({ focusButton = false } = {}) {
    const menu = ensureReaderMenu();
    menu.hidden = true;
    const button = document.querySelector('.top-reader-return[data-action="reader"]');
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      if (focusButton) button.focus();
    }
  }

  function openReaderMenu() {
    const menu = ensureReaderMenu();
    renderReaderMenu();
    menu.hidden = false;
    const button = document.querySelector('.top-reader-return[data-action="reader"]');
    if (button) {
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-controls', menu.id);
      button.setAttribute('aria-expanded', 'true');
    }
    positionReaderMenu();
    menu.querySelector('.reader-session-menu-item.is-active, .reader-session-menu-item, .reader-session-menu-new')?.focus();
  }

  function toggleReaderMenu() {
    const menu = ensureReaderMenu();
    if (menu.hidden) openReaderMenu();
    else closeReaderMenu({ focusButton: true });
  }

  function showEmptyActiveSlot() {
    stopReader();
    try { clearActiveReaderPane(); } catch {
      activeReaderSnapshot = null;
    }
    originalRenderEmptyReader();
    removeLegacyReaderStrip();
    renderReaderMenu();
    dispatchSessionEvent('marksetgo:reader-session-changed');
  }

  function switchTo(slotId, { resumePlayback = false } = {}) {
    closeReaderMenu();
    const target = slotById(slotId);
    if (!target) return false;

    if (activeSlotId === target.id) {
      renderReaderMenu();
      return true;
    }

    captureActiveSlot({ persist: true });
    stopReader();
    activeSlotId = target.id;
    target.lastActivatedAt = new Date().toISOString();

    restoringSlot = true;
    try {
      if (target.snapshot?.title && target.snapshot?.currentText) {
        const snapshot = decorateSnapshot(cloneSnapshot(target.snapshot), target);
        activeReaderSnapshot = snapshot;
        originalApplyReaderSessionSnapshot(snapshot, { resumePlayback });
        removeLegacyReaderStrip();
        activeReaderSnapshot = decorateSnapshot(cloneSnapshot(activeReaderSnapshot || snapshot), target);
        syncSlotFromSnapshot(activeReaderSnapshot, { slot: target });
        renderReaderMenu();
      } else {
        showEmptyActiveSlot();
      }
    } finally {
      restoringSlot = false;
    }

    updateTopReaderButton();
    dispatchSessionEvent('marksetgo:reader-session-changed', target);
    return true;
  }

  function createBlankReader() {
    closeReaderMenu();
    captureActiveSlot({ persist: true });
    stopReader();
    const slot = createSlot({ activate: true });
    activeReaderSnapshot = null;
    showEmptyActiveSlot();
    renderReaderMenu();
    dispatchSessionEvent('marksetgo:reader-session-changed', slot);
    return slot;
  }

  function closeSlot(slotId) {
    closeReaderMenu();
    const index = slots.findIndex((slot) => slot.id === slotId);
    if (index < 0) return false;

    // Keep one Reader available rather than renumbering/recreating the last tab.
    if (slots.length === 1) {
      const only = slots[0];
      only.snapshot = null;
      activeSlotId = only.id;
      activeReaderSnapshot = null;
      showEmptyActiveSlot();
      renderReaderMenu();
      dispatchSessionEvent('marksetgo:reader-session-list-changed', only);
      return true;
    }

    const wasActive = activeSlotId === slotId;
    if (wasActive) captureActiveSlot({ persist: true });
    slots.splice(index, 1);

    if (wasActive) {
      const fallback = slots[Math.max(0, index - 1)] || slots[0];
      activeSlotId = null;
      switchTo(fallback.id, { resumePlayback: false });
    } else {
      renderReaderMenu();
    }

    dispatchSessionEvent('marksetgo:reader-session-list-changed');
    return true;
  }

  function activeContext() {
    const slot = activeSlot();
    if (!slot) return null;
    const snapshot = slot.snapshot || activeReaderSnapshot || null;
    return {
      readerId: slot.id,
      readerLabel: slot.label,
      readerOrdinal: slot.ordinal,
      documentId: snapshot?.documentId || state?.documentId || '',
      title: snapshot?.title || state?.title || '',
      index: Math.max(0, Number(snapshot?.index ?? state?.index) || 0),
      hasDocument: Boolean(snapshot?.title && snapshot?.currentText)
    };
  }

  // Keep app.js's single-current-Reader compatibility snapshot synchronized
  // with whichever Reader slot is active whenever its own continuity layer saves.
  ReaderContinuity.commit = function readerSlotAwareCommit(snapshot, options) {
    const slot = ensureActiveSlot(snapshot);
    const decorated = decorateSnapshot(snapshot, slot);
    const result = originalCommit(decorated, options);
    if (!suppressSlotSync) syncSlotFromSnapshot(activeReaderSnapshot || decorated, { slot });
    updateTopReaderButton();
    return result;
  };

  ReaderContinuity.saveBeforeNavigation = function readerSlotAwareSaveBeforeNavigation() {
    const snapshot = originalSaveBeforeNavigation();
    if (snapshot) syncSlotFromSnapshot(activeReaderSnapshot || snapshot);
    return snapshot;
  };

  renderReaderWithText = function readerSlotAwareRenderReaderWithText(title, text, source = { type: 'text' }) {
    // Walkthrough/demo Readers deliberately remain outside the user's open Reader list.
    const ephemeral = Boolean(source?.ephemeral || source?.type === 'walkthrough');
    if (ephemeral || restoringSlot) {
      const result = originalRenderReaderWithText(title, text, source);
      removeLegacyReaderStrip();
      return result;
    }

    const slot = ensureActiveSlot();
    const result = originalRenderReaderWithText(title, text, source);
    removeLegacyReaderStrip();
    if (result === false) return result;

    const snapshot = activeReaderSnapshot || (() => {
      try { return buildReaderSessionSnapshot(); } catch { return null; }
    })();
    if (snapshot) {
      const decorated = decorateSnapshot(snapshot, slot);
      activeReaderSnapshot = decorated;
      syncSlotFromSnapshot(decorated, { slot });
    }
    renderReaderMenu();
    dispatchSessionEvent('marksetgo:reader-session-changed', slot);
    return result;
  };

  renderEmptyReader = function readerSlotAwareRenderEmptyReader() {
    ensureActiveSlot();
    const result = originalRenderEmptyReader();
    removeLegacyReaderStrip();
    renderReaderMenu();
    dispatchSessionEvent('marksetgo:reader-session-changed');
    return result;
  };

  applyReaderSessionSnapshot = function readerSlotAwareApplyReaderSessionSnapshot(snapshot, options) {
    const slot = ensureActiveSlot(snapshot);
    const decorated = decorateSnapshot(snapshot, slot);
    const result = originalApplyReaderSessionSnapshot(decorated, options);
    removeLegacyReaderStrip();
    if (result) {
      const current = decorateSnapshot(activeReaderSnapshot || decorated, slot);
      activeReaderSnapshot = current;
      syncSlotFromSnapshot(current, { slot });
      renderReaderMenu();
      window.setTimeout(() => {
        if (activeSlotId !== slot.id) return;
        const latest = activeReaderSnapshot || (() => {
          try { return ReaderContinuity.capture(); } catch { return null; }
        })();
        if (latest) syncSlotFromSnapshot(decorateSnapshot(latest, slot), { slot });
        renderReaderMenu();
      }, 260);
    }
    return result;
  };

  document.addEventListener('click', (event) => {
    const topReaderButton = event.target.closest?.('.top-reader-return[data-action="reader"]');
    if (topReaderButton) {
      // The top Reader control owns switching/creation. Prevent app.js from
      // immediately navigating so the user can choose the Reader explicitly.
      event.preventDefault();
      event.stopPropagation();
      toggleReaderMenu();
      return;
    }

    const newButton = event.target.closest?.('[data-reader-slot-new]');
    if (newButton) {
      event.preventDefault();
      event.stopPropagation();
      createBlankReader();
      return;
    }

    const closeButton = event.target.closest?.('[data-reader-slot-close]');
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      closeSlot(closeButton.dataset.readerSlotClose);
      return;
    }

    const switchButton = event.target.closest?.('[data-reader-slot-switch]');
    if (switchButton) {
      event.preventDefault();
      event.stopPropagation();
      switchTo(switchButton.dataset.readerSlotSwitch, { resumePlayback: false });
      return;
    }

    if (readerMenu && !readerMenu.hidden && !event.target.closest?.('#reader-session-menu')) {
      closeReaderMenu();
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && readerMenu && !readerMenu.hidden) {
      event.preventDefault();
      closeReaderMenu({ focusButton: true });
    }
  });

  window.addEventListener('resize', () => {
    if (readerMenu && !readerMenu.hidden) positionReaderMenu();
  });

  window.addEventListener('scroll', () => {
    if (readerMenu && !readerMenu.hidden) positionReaderMenu();
  }, true);

  // Small public bridge for the next phases (Ask Mark provenance, comparison
  // cards, Symposium handoff, and eventually persisted multi-Reader sessions).
  window.MarkSetGoReaderSessions = Object.freeze({
    getActiveContext: activeContext,
    list: () => slots.map((slot) => ({
      readerId: slot.id,
      readerLabel: slot.label,
      readerOrdinal: slot.ordinal,
      documentId: slot.snapshot?.documentId || '',
      title: slot.snapshot?.title || '',
      index: Math.max(0, Number(slot.snapshot?.index) || 0),
      hasDocument: Boolean(slot.snapshot?.title && slot.snapshot?.currentText)
    })),
    switchTo: (readerId) => switchTo(String(readerId || ''), { resumePlayback: false }),
    newReader: createBlankReader,
    close: (readerId) => closeSlot(String(readerId || '')),
    openTextInNewReader: (title, text, source = { type: 'text' }) => {
      captureActiveSlot({ persist: true });
      const slot = createSlot({ activate: true });
      activeReaderSnapshot = null;
      renderReaderWithText(title, text, source);
      return { readerId: slot.id, readerLabel: slot.label };
    },
    checkpoint: () => captureActiveSlot({ persist: true })
  });

  const topReaderButton = document.querySelector('.top-reader-return[data-action="reader"]');
  if (topReaderButton) {
    topReaderButton.setAttribute('aria-haspopup', 'menu');
    topReaderButton.setAttribute('aria-expanded', 'false');
    topReaderButton.setAttribute('aria-controls', 'reader-session-menu');
  }

  // If app.js happened to render a Reader before this deferred script ran,
  // adopt it as Reader 1. Otherwise the first Reader destination/open creates it.
  if (activeReaderSnapshot?.title && activeReaderSnapshot?.currentText) {
    const first = ensureActiveSlot(activeReaderSnapshot);
    activeReaderSnapshot = decorateSnapshot(activeReaderSnapshot, first);
    renderReaderMenu();
  } else if (app.querySelector('.empty-reader-page')) {
    ensureActiveSlot();
    renderReaderMenu();
  }
})();
