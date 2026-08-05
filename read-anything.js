(() => {
  'use strict';

  const app = document.getElementById('app');
  const CAPTURE_KEY = 'markSetGoPendingWebCaptureV1';
  const CAPTURE_STORAGE = window.localStorage;
  const IMPORT_HISTORY_KEY = 'markSetGoImportHistoryV1';
  const FORMAT_RECORD_PREFIX = 'markSetGoReadAnythingFormatV1:';
  const FORMAT_DOCUMENT_INDEX_KEY = 'markSetGoReadAnythingDocumentIndexV1';
  const DOCUMENT_STORAGE_PREFIX = 'markSetGoDocumentV1:';
  let allowLegacyUpload = false;
  let activeImportedDocument = null;
  let activeImportedVersion = 'original';
  let formatControlAttachTimers = [];
  let pendingImportedRender = false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));


  function cleanImportedTitle(value) {
    return String(value || 'Imported document')
      .replace(/\s+[—-]\s+(?:Clean Format|Readable|Original|Quick Summary|Study Summary|Detailed Summary|Summary|College Level|High School Level|Grade \d+|Graduate Level|Custom Transform)\s*$/i, '')
      .trim() || 'Imported document';
  }

  function closeMenus() {
    document.querySelectorAll('.site-header details[open]').forEach((menu) => menu.removeAttribute('open'));
  }

  function history() {
    try { return JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) || '[]'); } catch { return []; }
  }

  function addHistory(documentRecord) {
    const key = `${documentRecord.source?.type || 'text'}|${documentRecord.source?.url || ''}|${documentRecord.title}`.toLowerCase();
    const items = history().filter((item) => item.key !== key);
    items.unshift({
      key,
      title: documentRecord.title,
      sourceType: documentRecord.source?.type || 'text',
      sourceUrl: documentRecord.source?.url || '',
      importedAt: new Date().toISOString(),
      characters: documentRecord.text.length
    });
    localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
  }



  function importedDocumentKey(documentRecord) {
    const source = documentRecord?.source || {};
    if (source.readAnythingKey) return String(source.readAnythingKey);
    const identity = `${source.type || 'text'}|${source.url || source.name || ''}|${documentRecord?.title || ''}`;
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
      hash ^= identity.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `ra-${(hash >>> 0).toString(36)}`;
  }

  function formatRecordStorageKey(key) {
    return `${FORMAT_RECORD_PREFIX}${key}`;
  }


  function formatDocumentIndex() {
    try {
      const value = JSON.parse(localStorage.getItem(FORMAT_DOCUMENT_INDEX_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function rememberFormatDocument(documentId, key) {
    if (!documentId || !key) return;
    const index = formatDocumentIndex();
    index[String(documentId)] = String(key);
    try { localStorage.setItem(FORMAT_DOCUMENT_INDEX_KEY, JSON.stringify(index)); } catch {}
  }

  function saveActiveFormatRecord() {
    if (!activeImportedDocument) return;
    const key = activeImportedDocument.source?.readAnythingKey || importedDocumentKey(activeImportedDocument);
    activeImportedDocument.source = { ...(activeImportedDocument.source || {}), readAnything: true, readAnythingKey: key };
    const record = {
      key,
      title: activeImportedDocument.baseTitle || activeImportedDocument.title,
      author: activeImportedDocument.author || '',
      source: activeImportedDocument.source,
      versions: activeImportedDocument.versions || {},
      originalText: activeImportedDocument.versions?.original || activeImportedDocument.originalText || '',
      selectedVersion: activeImportedVersion || 'original',
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(formatRecordStorageKey(key), JSON.stringify(record)); } catch (error) {
      console.warn('Imported formatting versions could not be stored.', error);
    }
  }

  function restoreImportedFormatRecord(documentId, documentTitle = '') {
    let storedDocument = null;
    try { storedDocument = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`) || 'null'); } catch {}
    const indexedKey = formatDocumentIndex()[String(documentId)] || '';
    const sourceKey = storedDocument?.source?.readAnythingKey || '';
    let key = sourceKey || indexedKey || (storedDocument?.source?.readAnything ? importedDocumentKey(storedDocument) : '');
    if (!key && documentTitle) {
      const normalizedTitle = cleanImportedTitle(documentTitle).toLowerCase();
      for (let index = 0; index < localStorage.length; index += 1) {
        const storageKey = localStorage.key(index) || '';
        if (!storageKey.startsWith(FORMAT_RECORD_PREFIX)) continue;
        try {
          const candidate = JSON.parse(localStorage.getItem(storageKey) || 'null');
          const candidateTitle = String(candidate?.title || '').trim().toLowerCase();
          if (candidateTitle && candidateTitle === normalizedTitle) {
            key = storageKey.slice(FORMAT_RECORD_PREFIX.length);
            rememberFormatDocument(documentId, key);
            break;
          }
        } catch {}
      }
    }
    if (!key) {
      activeImportedDocument = null;
      document.querySelector('#read-anything-format-control')?.remove();
      return false;
    }
    let record = null;
    try { record = JSON.parse(localStorage.getItem(formatRecordStorageKey(key)) || 'null'); } catch {}
    if (!record && !storedDocument?.source?.readAnything) return false;
    const readingLevel = storedDocument?.source?.readingLevel || record?.selectedVersion || 'original';
    activeImportedDocument = {
      title: cleanImportedTitle(record?.title || storedDocument?.source?.adaptedFrom || storedDocument?.title),
      baseTitle: cleanImportedTitle(record?.title || storedDocument?.source?.adaptedFrom || storedDocument?.title),
      author: record?.author || storedDocument?.source?.author || '',
      source: { ...(record?.source || storedDocument?.source || {}), readAnything: true, readAnythingKey: key },
      versions: { ...(record?.versions || {}), ...(record?.originalText ? { original: record.originalText } : {}), ...(storedDocument?.text ? { [readingLevel]: storedDocument.text } : {}) },
      originalText: record?.originalText || record?.versions?.original || ''
    };
    if (!activeImportedDocument.versions.original && activeImportedDocument.originalText) activeImportedDocument.versions.original = activeImportedDocument.originalText;
    if (!activeImportedDocument.versions.original && readingLevel === 'original' && storedDocument?.text) activeImportedDocument.versions.original = storedDocument.text;
    activeImportedVersion = record?.selectedVersion && activeImportedDocument.versions[record.selectedVersion]
      ? record.selectedVersion
      : readingLevel;
    scheduleFormatControlAttach();
    return true;
  }

  function splitReadableSentences(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const matches = text.match(/[^.!?]+(?:[.!?]+[”"']?|$)/g);
    const sentences = (matches || [text]).map((sentence) => sentence.trim()).filter(Boolean);
    const expanded = [];
    for (const sentence of sentences) {
      if (sentence.length <= 420) {
        expanded.push(sentence);
        continue;
      }
      const clauses = sentence
        .split(/(?<=[;:])\s+(?=[A-Z0-9“"'])/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (clauses.length > 1) expanded.push(...clauses);
      else expanded.push(sentence);
    }
    return expanded;
  }

  function paragraphizeLongText(value, { targetCharacters = 320, maxSentences = 3 } = {}) {
    const sentences = splitReadableSentences(value);
    if (!sentences.length) return '';
    if (sentences.length === 1 && sentences[0].length <= targetCharacters) return sentences[0];
    const paragraphs = [];
    let current = [];
    let length = 0;
    for (const sentence of sentences) {
      const nextLength = length + sentence.length + (current.length ? 1 : 0);
      if (current.length && (current.length >= maxSentences || nextLength > targetCharacters)) {
        paragraphs.push(current.join(' '));
        current = [];
        length = 0;
      }
      current.push(sentence);
      length += sentence.length + (current.length > 1 ? 1 : 0);
      if (sentence.length > targetCharacters * 1.4) {
        paragraphs.push(current.join(' '));
        current = [];
        length = 0;
      }
    }
    if (current.length) paragraphs.push(current.join(' '));
    return paragraphs.join('\n\n');
  }

  function cleanFormatText(value) {
    const lines = String(value || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim());
    const output = [];
    let paragraph = [];
    const flush = () => {
      if (!paragraph.length) return;
      const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      if (joined) output.push(paragraphizeLongText(joined));
      paragraph = [];
    };
    for (const line of lines) {
      if (!line) {
        flush();
        continue;
      }
      const isHeading = /^(chapter|part|section|article|book)\s+[\divxlcdm]+\b/i.test(line)
        || (/^[A-Z0-9][A-Z0-9 ’'“”"—–:-]{3,90}$/.test(line) && line.split(/\s+/).length < 12);
      const isList = /^[•▪◦*-]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
      const isShortQuote = /^[“"].*[”"]$/.test(line) && line.length < 420;
      if (isHeading || isList || isShortQuote) {
        flush();
        output.push(line);
        continue;
      }
      paragraph.push(line);
      const joinedLength = paragraph.join(' ').length;
      if (joinedLength >= 520 || (/[.!?;:][”"']?$/.test(line) && joinedLength >= 300)) flush();
    }
    flush();
    return output
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function paragraphBreakIndexes(value) {
    const blocks = String(value || '').replace(/\r/g, '').split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
    const indexes = [];
    let wordIndex = 0;
    blocks.forEach((block, index) => {
      if (index > 0) indexes.push(wordIndex);
      wordIndex += block.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    });
    return indexes;
  }

  function versionLabel(level) {
    return ({ original: 'Original', clean: 'Readable', summaryQuick: 'Summary', summaryStudy: 'Study Summary', summaryDetailed: 'Detailed Summary', custom: 'Custom', graduate: 'Graduate', college: 'College', highschool: 'High School', grade8: 'Grade 8', grade6: 'Grade 6', grade4: 'Grade 4' })[level] || level;
  }

  function transformSourceText() {
    if (!activeImportedDocument) return '';
    const versions = activeImportedDocument.versions || {};
    const candidates = [
      versions.clean,
      versions.original,
      versions[activeImportedVersion],
      ...Object.values(versions)
    ];
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text.length >= 20) return text;
    }
    return '';
  }

  function showTransformStatus(message, isError = false) {
    const el = document.querySelector('#read-anything-transform-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.hidden = !message;
  }

  function renderImportedVersion(level) {
    if (!activeImportedDocument) return;
    const text = activeImportedDocument.versions?.[level];
    if (!text) return;
    activeImportedVersion = level;
    saveActiveFormatRecord();
    app.classList.toggle('read-anything-paragraph-spacing', level === 'clean' || level.startsWith('summary') || level === 'custom');
    const suffix = '';
    pendingImportedRender = true;
    window.renderReaderWithText(`${activeImportedDocument.baseTitle || activeImportedDocument.title}${suffix}`, text, {
      ...(activeImportedDocument.source || {}),
      paragraphBreaks: paragraphBreakIndexes(text),
      readAnythingKey: activeImportedDocument.source?.readAnythingKey || importedDocumentKey(activeImportedDocument),
      author: activeImportedDocument.author || activeImportedDocument.source?.author || '',
      importedAt: activeImportedDocument.source?.importedAt || new Date().toISOString(),
      readAnything: true,
      adaptedFrom: cleanImportedTitle(activeImportedDocument.baseTitle || activeImportedDocument.title),
      readingLevel: level
    });
    scheduleFormatControlAttach();
  }

  async function requestReadingLevel(level) {
    if (!activeImportedDocument) return;
    if (activeImportedDocument.versions[level]) return renderImportedVersion(level);
    const sourceText = transformSourceText();
    if (sourceText.length < 20) throw new Error('The saved document text is unavailable. Reopen the original item from My Library and try again.');
    showTransformStatus(`Creating ${versionLabel(level)} version…`);
    const requestBody = JSON.stringify({
      title: activeImportedDocument.title,
      text: sourceText,
      level
    });

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 115000);
      try {
        if (attempt > 1) showTransformStatus(`Retrying ${versionLabel(level)} version…`);
        const response = await fetch('/api/read-anything/adapt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned HTTP ${response.status}.`);
        if (!payload.text) throw new Error('The server returned an empty adapted version.');
        activeImportedDocument.versions[level] = payload.text;
        saveActiveFormatRecord();
        showTransformStatus('');
        renderImportedVersion(level);
        return;
      } catch (error) {
        lastError = error;
        if (error?.name === 'AbortError') lastError = new Error('The adaptation took too long. Try a shorter article or section.');
        if (attempt < 2 && error?.name !== 'AbortError') await new Promise((resolve) => window.setTimeout(resolve, 1200));
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw new Error(lastError?.message === 'Failed to fetch'
      ? 'The adaptation connection was interrupted. Try again, or use a shorter article.'
      : lastError?.message || 'The reading-level version could not be created.');
  }


  async function requestSummary(style = 'quick') {
    if (!activeImportedDocument) return;
    const versionKey = `summary${style.charAt(0).toUpperCase()}${style.slice(1)}`;
    if (activeImportedDocument.versions[versionKey]) return renderImportedVersion(versionKey);
    const sourceText = transformSourceText();
    if (sourceText.length < 20) throw new Error('The saved document text is unavailable. Reopen the original item from My Library and try again.');
    showTransformStatus(`Creating ${style} summary…`);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch('/api/read-anything/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeImportedDocument.title,
          text: sourceText,
          style
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned HTTP ${response.status}.`);
      if (!payload.text) throw new Error('The server returned an empty summary.');
      activeImportedDocument.versions[versionKey] = payload.text;
      saveActiveFormatRecord();
      showTransformStatus('');
      renderImportedVersion(versionKey);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('The summary took too long. Try a shorter article or passage.');
      throw new Error(error?.message === 'Failed to fetch'
        ? 'The summary connection was interrupted. Try again.'
        : error?.message || 'The summary could not be created.');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function requestCustomTransform(instructions) {
    if (!activeImportedDocument) return;
    const prompt = String(instructions || '').trim();
    if (!prompt) throw new Error('Enter an instruction for the transformation.');
    const sourceText = transformSourceText();
    if (sourceText.length < 20) throw new Error('The saved document text is unavailable. Reopen the original item from My Library and try again.');
    showTransformStatus('Applying custom transformation…');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 115000);
    try {
      const response = await fetch('/api/read-anything/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeImportedDocument.title,
          text: sourceText,
          instructions: prompt
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned HTTP ${response.status}.`);
      if (!payload.text) throw new Error('The server returned an empty transformation.');
      activeImportedDocument.versions.custom = payload.text;
      activeImportedDocument.customInstruction = prompt;
      saveActiveFormatRecord();
      showTransformStatus('');
      renderImportedVersion('custom');
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('The transformation took too long. Try a shorter article or passage.');
      throw new Error(error?.message === 'Failed to fetch'
        ? 'The transformation connection was interrupted. Try again.'
        : error?.message || 'The transformation could not be created.');
    } finally {
      window.clearTimeout(timeout);
    }
  }


  async function requestTranslation(language) {
    const target = String(language || '').trim();
    if (!target) throw new Error('Choose a language.');
    if (!activeImportedDocument) throw new Error('Translation is available for imported documents.');
    const key = `translation_${target.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    if (activeImportedDocument.versions[key]) return renderImportedVersion(key);
    const sourceText = transformSourceText();
    if (sourceText.length < 20) throw new Error('The saved document text is unavailable. Reopen the original item from My Library and try again.');
    showTransformStatus(`Translating to ${target}…`);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 115000);
    try {
      const response = await fetch('/api/read-anything/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeImportedDocument.title,
          text: sourceText,
          instructions: `Translate the complete text into ${target}. Preserve headings, paragraph breaks, names, dates, quotations, and meaning. Return only the translated text.`
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned HTTP ${response.status}.`);
      if (!payload.text) throw new Error('The server returned an empty translation.');
      activeImportedDocument.versions[key] = payload.text;
      activeImportedDocument.translationLanguage = target;
      saveActiveFormatRecord();
      showTransformStatus('');
      renderImportedVersion(key);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('The translation took too long. Try a shorter article or passage.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function makeReadable() {
    if (!activeImportedDocument) throw new Error('Readable view is available for imported documents.');
    const original = String(activeImportedDocument.versions?.original || activeImportedDocument.originalText || '').trim();
    if (original.length < 20) throw new Error('The preserved original text is unavailable. Re-import this document once to restore it.');
    activeImportedDocument.versions.clean = cleanFormatText(original);
    saveActiveFormatRecord();
    renderImportedVersion('clean');
  }

  function restoreOriginal() {
    if (!activeImportedDocument) throw new Error('Original view is available for imported documents.');
    const original = String(activeImportedDocument.versions?.original || activeImportedDocument.originalText || '').trim();
    if (original.length < 20) throw new Error('The preserved original text is unavailable. Re-import this document once to restore it.');
    activeImportedDocument.versions.original = original;
    renderImportedVersion('original');
  }

  function scheduleFormatControlAttach() {
    document.querySelector('#read-anything-format-control')?.remove();
    document.dispatchEvent(new CustomEvent('marksetgo:transform-state', { detail: { version: activeImportedVersion, label: versionLabel(activeImportedVersion), active: Boolean(activeImportedDocument) } }));
    return;
    formatControlAttachTimers.forEach((timer) => window.clearTimeout(timer));
    formatControlAttachTimers = [];
    let frame = 0;
    const attachObserver = new MutationObserver(() => {
      if (!activeImportedDocument) return attachObserver.disconnect();
      installFormatControl();
      if (document.querySelector('#read-anything-format-control')) attachObserver.disconnect();
    });
    attachObserver.observe(app, { childList: true, subtree: true });
    window.setTimeout(() => attachObserver.disconnect(), 5000);
    const attachAfterRender = () => {
      if (!activeImportedDocument) return;
      installFormatControl();
      if (document.querySelector('#read-anything-format-control')) return;
      frame += 1;
      if (frame < 180) window.requestAnimationFrame(attachAfterRender);
    };
    window.requestAnimationFrame(attachAfterRender);
    [250, 750, 1500, 3000].forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (activeImportedDocument) installFormatControl();
      }, delay);
      formatControlAttachTimers.push(timer);
    });
  }

  function installFormatControl() {
    if (!activeImportedDocument) return;
    const commandBar = document.querySelector('#app .reader-pane-controls');
    const buttonGroup = commandBar?.querySelector('.reader-pane-buttons');
    if (!commandBar || !buttonGroup) return;

    commandBar.classList.add('read-anything-command-bar');
    const contentButton = buttonGroup.querySelector('#toggle-navigation-pane');
    const readerButton = buttonGroup.querySelector('#toggle-word-panel');
    const markButton = buttonGroup.querySelector('#toggle-mark-panel');
    if (contentButton) contentButton.innerHTML = 'Contents';
    if (readerButton) readerButton.innerHTML = 'Reader Tools';
    if (markButton) markButton.innerHTML = 'Ask Mark';

    const existing = document.querySelector('#read-anything-format-control');
    if (existing && existing.parentElement === commandBar) {
      existing.querySelector('.transform-state').textContent = versionLabel(activeImportedVersion);
      return;
    }
    existing?.remove();

    const control = document.createElement('details');
    control.id = 'read-anything-format-control';
    control.className = 'read-anything-format-control read-anything-transform-control';
    control.innerHTML = `<summary><span class="transform-label">Transform</span><span aria-hidden="true">·</span><span class="transform-state">${escapeHtml(versionLabel(activeImportedVersion))}</span><span class="transform-caret" aria-hidden="true">▾</span></summary><div class="read-anything-format-menu read-anything-transform-menu"><div class="read-anything-format-menu-head"><strong>Transform</strong><button type="button" data-action="close-format" aria-label="Close transform menu">×</button></div><section><span class="transform-section-label">Reading</span><div class="read-anything-format-actions transform-reading-actions"><button type="button" data-level="original">Original</button><button type="button" data-level="clean">Readable</button><button type="button" data-summary-style="quick">Summary</button></div></section><section><span class="transform-section-label">Reading Level</span><div class="read-anything-format-actions transform-level-actions"><button type="button" data-level-choice="original">Original</button><button type="button" data-level-choice="highschool">High School</button><button type="button" data-level-choice="college">College</button><button type="button" data-level-choice="graduate">Graduate</button></div></section><section class="transform-translate"><span class="transform-section-label">Translate</span><button type="button" class="transform-secondary-action" disabled title="Translation is coming in a future release.">Choose language…</button></section><section class="transform-custom"><label><span class="transform-section-label">Ask Mark</span><textarea id="read-anything-custom-instruction" rows="3" placeholder="Tell Mark how to transform this text…"></textarea></label><button type="button" class="primary" data-action="apply-custom">Apply</button></section><small class="transform-preserve-note">The original text is always preserved.</small><div id="read-anything-transform-status" class="status" hidden></div></div>`;

    const fullscreenButton = commandBar.querySelector('#toggle-reader-fullscreen');
    commandBar.insertBefore(control, fullscreenButton || null);
    if (window.matchMedia('(max-width: 700px)').matches) control.classList.add('read-anything-format-control-mobile');
    control.querySelectorAll('[data-level]').forEach((button) => button.classList.toggle('active', button.dataset.level === activeImportedVersion));
    if (activeImportedVersion.startsWith('summary')) control.querySelector('[data-summary-style="quick"]')?.classList.add('active');
    control.querySelectorAll('[data-level-choice]').forEach((button) => button.classList.toggle('active', button.dataset.levelChoice === activeImportedVersion));

    control.addEventListener('click', async (event) => {
      const levelButton = event.target.closest('[data-level]');
      if (levelButton) {
        const level = levelButton.dataset.level;
        if (level === 'clean') {
          const source = activeImportedDocument.versions.original || transformSourceText();
          activeImportedDocument.versions.clean = cleanFormatText(source);
          saveActiveFormatRecord();
        }
        renderImportedVersion(level);
        return;
      }
      const levelChoice = event.target.closest('[data-level-choice]');
      if (levelChoice) {
        const level = levelChoice.dataset.levelChoice;
        try {
          if (level === 'original') return renderImportedVersion('original');
          await requestReadingLevel(level);
        } catch (error) { showTransformStatus(error.message, true); }
        return;
      }
      if (event.target.closest('[data-action="close-format"]')) {
        control.open = false;
        return;
      }
      const summaryButton = event.target.closest('[data-summary-style]');
      if (summaryButton) {
        try { await requestSummary('quick'); } catch (error) { showTransformStatus(error.message, true); }
        return;
      }
      if (event.target.closest('[data-action="apply-custom"]')) {
        const instructions = control.querySelector('#read-anything-custom-instruction').value;
        try { await requestCustomTransform(instructions); } catch (error) { showTransformStatus(error.message, true); }
      }
    });
  }

  function openDocument(documentRecord) {
    const title = cleanImportedTitle(documentRecord?.title || 'Untitled');
    const text = String(documentRecord?.text || '').trim();
    if (!text) throw new Error('No readable text was found.');
    if (typeof window.renderReaderWithText !== 'function') throw new Error('The reader is not ready.');
    addHistory({ ...documentRecord, title, text });
    const readAnythingKey = importedDocumentKey({ ...documentRecord, title });
    activeImportedDocument = {
      ...documentRecord,
      title,
      baseTitle: title,
      author: documentRecord.author || documentRecord.source?.author || '',
      source: { ...(documentRecord.source || {}), readAnything: true, readAnythingKey },
      versions: { original: text, clean: cleanFormatText(text) },
      originalText: text
    };
    activeImportedVersion = 'original';
    saveActiveFormatRecord();
    renderImportedVersion('original');
  }

  function markdownToText(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|```$/g, ''))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function importUrl(url, status) {
    const response = await fetch('/api/fetch-text', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The webpage could not be imported.');
    const parsed = new URL(url);
    openDocument({
      title: payload.title || parsed.hostname,
      author: payload.author || '',
      text: payload.text,
      source: { type: 'website', url, site: parsed.hostname, importedAt: new Date().toISOString() }
    });
    status.textContent = 'Opening webpage…';
  }

  async function importDocx(file) {
    const response = await fetch('/api/import/docx', {
      method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: await file.arrayBuffer()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The Word document could not be imported.');
    openDocument({ title: payload.title || file.name.replace(/\.docx$/i, ''), text: payload.text, source: { type: 'docx', name: file.name, fileSize: file.size } });
  }

  async function importSimpleFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.docx')) return importDocx(file);
    if (lower.endsWith('.epub') || lower.endsWith('.pdf')) {
      allowLegacyUpload = true;
      const legacy = document.createElement('button');
      legacy.type = 'button';
      legacy.dataset.read = 'upload';
      legacy.hidden = true;
      document.body.appendChild(legacy);
      legacy.click();
      legacy.remove();
      allowLegacyUpload = false;
      window.setTimeout(() => document.getElementById('text-file')?.click(), 50);
      return;
    }
    const raw = await file.text();
    const text = lower.endsWith('.md') || lower.endsWith('.markdown') ? markdownToText(raw) : raw.trim();
    if (!text) throw new Error('The selected file is empty.');
    openDocument({
      title: file.name.replace(/\.(txt|md|markdown)$/i, ''), text,
      source: { type: lower.endsWith('.md') || lower.endsWith('.markdown') ? 'markdown' : 'text-upload', name: file.name, fileSize: file.size }
    });
  }

  function bookmarkletCode() {
    const target = `${location.origin}/capture`;
    return `javascript:(()=>{const e=s=>String(s||'').replace(/\\s+/g,' ').trim(),s=e(window.getSelection?.().toString()),r=document.querySelector('article,main,[role=main]')||document.body,t=e(document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.innerText||document.title),a=e(document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel=author]')?.innerText),x=s||[...r.querySelectorAll('h1,h2,h3,p,blockquote,li')].map(n=>e(n.innerText)).filter(v=>v.length>20).filter((v,i,z)=>z.indexOf(v)===i).join('\n\n'),k=s?'selection':'page',c=s?e(window.getSelection()?.anchorNode?.parentElement?.closest('p,blockquote,li')?.innerText||''):'',f=document.createElement('form');f.method='POST';f.action='${target}';f.target='_blank';[['title',t],['author',a],['url',location.href],['text',x],['captureType',k],['context',c]].forEach(([n,v])=>{const i=document.createElement('textarea');i.name=n;i.value=v;f.appendChild(i)});f.hidden=true;document.body.appendChild(f);f.submit();f.remove()})()`;
  }

  function renderHub() {
    closeMenus();
    const recent = history().slice(0, 5);
    app.innerHTML = `
      <section class="panel read-anything-page">
        <header class="read-anything-hero">
          <div><span class="source-category">Universal Import</span><h1>Read Anything</h1><p>Bring webpages, articles, books, documents, or pasted text into the same Mark, Set, Go! reader.</p></div>
          <span class="read-anything-promise">Read Anything. Learn Everything.</span>
        </header>

        <div class="read-anything-grid">
          <section class="read-anything-card featured">
            <span class="read-anything-icon">🌐</span><h2>Webpage or article</h2><p>Paste a public URL and extract its readable text.</p>
            <form id="read-anything-url-form"><label>Web address<input id="read-anything-url" type="url" required placeholder="https://example.com/article"></label><button class="primary" type="submit">Open in Reader</button></form>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">⇧</span><h2>Upload a file</h2><p>EPUB, PDF, Word, Markdown, and plain text.</p>
            <label class="secondary button-link read-anything-file-button">Choose file<input id="read-anything-file" type="file" accept=".epub,.pdf,.docx,.txt,.md,.markdown" hidden></label>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">📋</span><h2>Paste text</h2><p>Paste an article, notes, manuscript, or other text.</p>
            <button id="read-anything-paste" class="secondary" type="button">Paste Text</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">🔖</span><h2>Read with Mark</h2><p>Import a full webpage, or highlight a passage first to send only the selection.</p>
            <button id="read-anything-bookmarklet" class="secondary" type="button">Show Bookmarklet</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">G</span><h2>Project Gutenberg</h2><p>Search public-domain books already supported by the app.</p>
            <button class="secondary" type="button" data-read="gutenberg">Search Gutenberg</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">◎</span><h2>All public libraries</h2><p>Search Internet Archive, Wikisource, Gutenberg, and more.</p>
            <button class="secondary" type="button" data-read="unified-library">Browse Libraries</button>
          </section>
        </div>
        <div id="read-anything-status" class="status" role="status" aria-live="polite"></div>
        <section id="read-anything-workspace" class="read-anything-workspace" hidden></section>
        ${recent.length ? `<section class="read-anything-recent"><h2>Recent imports</h2>${recent.map((item) => `<article><span>${escapeHtml(item.sourceType)}</span><strong>${escapeHtml(item.title)}</strong><small>${new Date(item.importedAt).toLocaleString()}</small></article>`).join('')}</section>` : ''}
      </section>`;

    const status = app.querySelector('#read-anything-status');
    app.querySelector('#read-anything-url-form').addEventListener('submit', async (event) => {
      event.preventDefault(); status.className = 'status'; status.textContent = 'Extracting webpage…';
      try { await importUrl(app.querySelector('#read-anything-url').value.trim(), status); }
      catch (error) { status.className = 'status error'; status.textContent = error.message; }
    });
    app.querySelector('#read-anything-file').addEventListener('change', async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      status.className = 'status'; status.textContent = `Opening ${file.name}…`;
      try { await importSimpleFile(file); }
      catch (error) { status.className = 'status error'; status.textContent = error.message; }
    });
    app.querySelector('#read-anything-paste').addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      workspace.hidden = false;
      workspace.innerHTML = `<h2>Paste text</h2><label>Title<input id="paste-title" type="text" placeholder="Untitled"></label><label>Text<textarea id="paste-content" rows="12" placeholder="Paste readable text here…"></textarea></label><div class="source-actions"><button id="paste-open" class="primary" type="button">Open in Reader</button><button id="paste-cancel" class="secondary" type="button">Cancel</button></div>`;
      workspace.querySelector('#paste-open').addEventListener('click', () => {
        try { openDocument({ title: workspace.querySelector('#paste-title').value || 'Pasted Text', text: workspace.querySelector('#paste-content').value, source: { type: 'pasted-text' } }); }
        catch (error) { status.className = 'status error'; status.textContent = error.message; }
      });
      workspace.querySelector('#paste-cancel').addEventListener('click', () => { workspace.hidden = true; workspace.innerHTML = ''; });
      workspace.querySelector('#paste-content').focus();
    });
    app.querySelector('#read-anything-bookmarklet').addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      const code = bookmarkletCode();
      workspace.hidden = false;
      workspace.innerHTML = `<h2>Install “Read with Mark”</h2><p>Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>${escapeHtml(code)}</textarea></label>`;
      workspace.querySelector('#bookmarklet-code').addEventListener('focus', (event) => event.currentTarget.select());
    });
  }

  function openPendingCapture(attempt = 0) {
    let payload = null;
    try { payload = JSON.parse(CAPTURE_STORAGE.getItem(CAPTURE_KEY) || 'null'); } catch {}
    if (!payload?.text) return;
    if (typeof window.renderReaderWithText !== 'function' || attempt < 4) {
      if (attempt < 24) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
      return;
    }
    try {
      const isSelection = payload.captureType === 'selection';
      openDocument({
        title: isSelection ? `Selected passage — ${payload.title || 'Web Page'}` : (payload.title || 'Web Article'),
        author: payload.author || '',
        text: payload.text,
        source: {
          type: isSelection ? 'web-passage' : 'bookmarklet',
          url: payload.url || '',
          context: payload.context || '',
          captureType: payload.captureType || 'page',
          importedAt: new Date().toISOString()
        }
      });
      CAPTURE_STORAGE.removeItem(CAPTURE_KEY);
      if (location.hash.includes('read-anything-capture')) history.replaceState({}, '', location.pathname);
    } catch {
      if (attempt < 24) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
    }
  }

  document.addEventListener('marksetgo:document-available', (event) => {
    const documentId = event?.detail?.documentId;
    if (!documentId) return;
    if (pendingImportedRender && activeImportedDocument) {
      pendingImportedRender = false;
      const key = activeImportedDocument.source?.readAnythingKey || importedDocumentKey(activeImportedDocument);
      rememberFormatDocument(documentId, key);
      saveActiveFormatRecord();
      scheduleFormatControlAttach();
      return;
    }
    restoreImportedFormatRecord(documentId, event?.detail?.title || '');
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-read="upload"],[data-action="read-anything"]');
    if (!target || allowLegacyUpload) return;
    event.preventDefault(); event.stopImmediatePropagation();
    renderHub();
  }, true);

  window.MarkSetGoReadAnything = Object.freeze({
    render: renderHub,
    openDocument,
    bookmarkletCode,
    cleanFormatText,
    hasActiveDocument: () => Boolean(activeImportedDocument),
    getActiveVersion: () => ({ key: activeImportedVersion, label: versionLabel(activeImportedVersion), title: activeImportedDocument?.baseTitle || activeImportedDocument?.title || '' }),
    restoreOriginal,
    makeReadable,
    renderVersion: renderImportedVersion,
    requestReadingLevel,
    requestSummary,
    requestCustomTransform,
    requestTranslation
  });
  window.setTimeout(openPendingCapture, 0);
})();
