'use strict';

/*
 * Mark, Set, Go! — non-workspace Reader switching
 * v1.0.0 (2026-08-23)
 *
 * This layer intentionally sits ABOVE the protected Reader engine. It keeps
 * multiple in-memory Reader snapshots while preserving app.js's existing
 * activeReaderSnapshot / ReaderContinuity contract for the currently visible
 * Reader. Persistent restoration of the full Reader list is a separate phase.
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

  function tabMarkup(slot) {
    const active = slot.id === activeSlotId;
    const title = slotTitle(slot);
    const safeLabel = escapeHtml(slot.label);
    const safeTitle = escapeHtml(title);
    return `
      <div class="reader-session-tab-wrap${active ? ' is-active' : ''}" data-reader-slot-wrap="${escapeHtml(slot.id)}">
        <button
          type="button"
          class="reader-session-tab${active ? ' is-active' : ''}"
          role="tab"
          aria-selected="${active ? 'true' : 'false'}"
          data-reader-slot-switch="${escapeHtml(slot.id)}"
          title="${safeLabel} — ${safeTitle}">
          <strong>${safeLabel}</strong>
          <span>${safeTitle}</span>
        </button>
        ${slots.length > 1 ? `<button type="button" class="reader-session-close" data-reader-slot-close="${escapeHtml(slot.id)}" aria-label="Close ${safeLabel}" title="Close ${safeLabel}">×</button>` : ''}
      </div>`;
  }

  function renderSwitcher() {
    const host = app.querySelector('.reader-page-panel, .empty-reader-page');
    if (!host) return;

    ensureActiveSlot(activeReaderSnapshot?.title && activeReaderSnapshot?.currentText ? activeReaderSnapshot : null);

    let switcher = host.querySelector(':scope > .reader-session-switcher');
    if (!switcher) {
      switcher = document.createElement('nav');
      switcher.className = 'reader-session-switcher';
      switcher.setAttribute('aria-label', 'Open Readers');
      host.prepend(switcher);
    }

    switcher.innerHTML = `
      <div class="reader-session-tabs" role="tablist" aria-label="Open Readers">
        ${slots.map(tabMarkup).join('')}
      </div>
      <button type="button" class="reader-session-new" data-reader-slot-new title="Open another Reader">＋ Reader</button>`;

    const current = activeSlot();
    if (current) {
      host.dataset.readerSlotId = current.id;
      host.dataset.readerLabel = current.label;
      host.dataset.readerOrdinal = String(current.ordinal);
    }
    updateTopReaderButton();
  }

  function showEmptyActiveSlot() {
    stopReader();
    try { clearActiveReaderPane(); } catch {
      activeReaderSnapshot = null;
    }
    originalRenderEmptyReader();
    renderSwitcher();
    dispatchSessionEvent('marksetgo:reader-session-changed');
  }

  function switchTo(slotId, { resumePlayback = false } = {}) {
    const target = slotById(slotId);
    if (!target) return false;

    if (activeSlotId === target.id) {
      renderSwitcher();
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
        activeReaderSnapshot = decorateSnapshot(cloneSnapshot(activeReaderSnapshot || snapshot), target);
        syncSlotFromSnapshot(activeReaderSnapshot, { slot: target });
        renderSwitcher();
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
    captureActiveSlot({ persist: true });
    stopReader();
    const slot = createSlot({ activate: true });
    activeReaderSnapshot = null;
    showEmptyActiveSlot();
    renderSwitcher();
    dispatchSessionEvent('marksetgo:reader-session-changed', slot);
    return slot;
  }

  function closeSlot(slotId) {
    const index = slots.findIndex((slot) => slot.id === slotId);
    if (index < 0) return false;

    // Keep one Reader available rather than renumbering/recreating the last tab.
    if (slots.length === 1) {
      const only = slots[0];
      only.snapshot = null;
      activeSlotId = only.id;
      activeReaderSnapshot = null;
      showEmptyActiveSlot();
      renderSwitcher();
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
      renderSwitcher();
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
    if (ephemeral || restoringSlot) return originalRenderReaderWithText(title, text, source);

    const slot = ensureActiveSlot();
    const result = originalRenderReaderWithText(title, text, source);
    if (result === false) return result;

    const snapshot = activeReaderSnapshot || (() => {
      try { return buildReaderSessionSnapshot(); } catch { return null; }
    })();
    if (snapshot) {
      const decorated = decorateSnapshot(snapshot, slot);
      activeReaderSnapshot = decorated;
      syncSlotFromSnapshot(decorated, { slot });
    }
    renderSwitcher();
    dispatchSessionEvent('marksetgo:reader-session-changed', slot);
    return result;
  };

  renderEmptyReader = function readerSlotAwareRenderEmptyReader() {
    ensureActiveSlot();
    const result = originalRenderEmptyReader();
    renderSwitcher();
    dispatchSessionEvent('marksetgo:reader-session-changed');
    return result;
  };

  applyReaderSessionSnapshot = function readerSlotAwareApplyReaderSessionSnapshot(snapshot, options) {
    const slot = ensureActiveSlot(snapshot);
    const decorated = decorateSnapshot(snapshot, slot);
    const result = originalApplyReaderSessionSnapshot(decorated, options);
    if (result) {
      const current = decorateSnapshot(activeReaderSnapshot || decorated, slot);
      activeReaderSnapshot = current;
      syncSlotFromSnapshot(current, { slot });
      renderSwitcher();
      window.setTimeout(() => {
        if (activeSlotId !== slot.id) return;
        const latest = activeReaderSnapshot || (() => {
          try { return ReaderContinuity.capture(); } catch { return null; }
        })();
        if (latest) syncSlotFromSnapshot(decorateSnapshot(latest, slot), { slot });
        renderSwitcher();
      }, 260);
    }
    return result;
  };

  document.addEventListener('click', (event) => {
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
    }
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

  // If app.js happened to render a Reader before this deferred script ran,
  // adopt it as Reader 1. Otherwise the first Reader destination/open creates it.
  if (activeReaderSnapshot?.title && activeReaderSnapshot?.currentText) {
    const first = ensureActiveSlot(activeReaderSnapshot);
    activeReaderSnapshot = decorateSnapshot(activeReaderSnapshot, first);
    renderSwitcher();
  } else if (app.querySelector('.empty-reader-page')) {
    ensureActiveSlot();
    renderSwitcher();
  }
})();
