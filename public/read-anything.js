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
    const entry = {
      key: key.slice(0, 2400),
      title: String(documentRecord.title || 'Imported document').slice(0, 300),
      sourceType: String(documentRecord.source?.type || 'text').slice(0, 80),
      sourceUrl: String(documentRecord.source?.url || '').slice(0, 2000),
      importedAt: new Date().toISOString(),
      characters: String(documentRecord.text || '').length
    };
    const items = history().filter((item) => item?.key !== key);
    items.unshift(entry);

    // Import history is optional metadata. A full localStorage quota must never
    // prevent a document/article from opening in the Reader.
    try {
      localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(items.slice(0, 15)));
    } catch (error) {
      try {
        localStorage.removeItem(IMPORT_HISTORY_KEY);
        localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify([entry]));
      } catch {
        console.warn('Import history was skipped because browser storage is full.', error);
      }
    }
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
    if (!key && storedDocument?.source?.originalKey) {
      const originalText = localStorage.getItem(storedDocument.source.originalKey) || '';
      if (originalText) {
        key = `builder-${String(documentId)}`;
        const currentKey = 'created';
        activeImportedDocument = {
          title: cleanImportedTitle(storedDocument.title),
          baseTitle: cleanImportedTitle(storedDocument.title),
          author: storedDocument.source?.author || '',
          source: { ...(storedDocument.source || {}), readAnything:true, readAnythingKey:key },
          versions: { original: originalText, [currentKey]: storedDocument.text || originalText },
          originalText
        };
        activeImportedVersion = currentKey;
        rememberFormatDocument(documentId, key);
        saveActiveFormatRecord();
        scheduleFormatControlAttach();
        return true;
      }
    }
    if (!key) {
      // A document can be fully loaded in the Reader without having originated in
      // Read Anything/Create a Book. Adopt the Reader's persisted document so
      // Ask Mark Format works for every readable text, not only imported ones.
      if (storedDocument?.text) {
        key = `reader-${String(documentId)}`;
        const originalText = String(storedDocument.text || '').trim();
        activeImportedDocument = {
          title: cleanImportedTitle(storedDocument.title || documentTitle || 'Untitled'),
          baseTitle: cleanImportedTitle(storedDocument.title || documentTitle || 'Untitled'),
          author: storedDocument.source?.author || '',
          source: {
            ...(storedDocument.source || {}),
            readAnything: true,
            readAnythingKey: key,
            readerDocumentId: String(documentId),
            formatterAdoptedFromReader: true
          },
          versions: { original: originalText },
          originalText
        };
        activeImportedVersion = 'original';
        rememberFormatDocument(documentId, key);
        saveActiveFormatRecord();
        scheduleFormatControlAttach();
        return true;
      }
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
      source: { ...(record?.source || storedDocument?.source || {}), readAnything: true, readAnythingKey: key, readerDocumentId: String(documentId) },
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


  function isStrongDocumentHeading(line, previousBlank = true, nextBlank = true) {
    const value = String(line || '').replace(/\s+/g, ' ').trim();
    if (!value || value.length > 120) return false;

    // Explicit structural labels are strong enough on their own.
    if (/^(?:chapter|chap\.?|book|part|section|article|canto|act|scene|letter)\s+(?:\d{1,3}|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)\b/i.test(value)) {
      return true;
    }
    if (/^(?:prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix)(?:\b|$)/i.test(value)) {
      return true;
    }

    // All-caps text is only a heading when it is actually isolated as a block.
    // This prevents wrapped prose lines from becoming false chapter headings.
    const words = value.split(/\s+/).filter(Boolean);
    const allCaps = /^[A-Z0-9][A-Z0-9 ’'“”"—–:,&().-]{2,119}$/.test(value)
      && /[A-Z]/.test(value)
      && words.length <= 10
      && !/[.!?]["'’”)]?$/.test(value);
    return Boolean(previousBlank && nextBlank && allCaps);
  }

  function repairFalseProseLineBreaks(value) {
    const source = String(value || '').replace(/\r/g, '');
    if (!source.trim()) return source;

    const structure = detectDocumentStructure(source);
    // These formats use line breaks semantically; do not flatten them.
    if (['poetry', 'table_of_contents', 'bibliography'].includes(structure.type)) return source;

    const lines = source.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
    const output = [];

    const nextNonBlankIndex = (from) => {
      for (let i = from; i < lines.length; i += 1) {
        if (lines[i]) return i;
      }
      return -1;
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) {
        if (output.length && output[output.length - 1] !== '') output.push('');
        continue;
      }

      const nextIndex = nextNonBlankIndex(i + 1);
      const next = nextIndex >= 0 ? lines[nextIndex] : '';
      const previousBlank = i === 0 || !lines[i - 1];
      const nextBlank = i === lines.length - 1 || !lines[i + 1];
      const thisHeading = isStrongDocumentHeading(line, previousBlank, nextBlank);
      const nextPreviousBlank = nextIndex <= 0 || !lines[nextIndex - 1];
      const nextNextBlank = nextIndex < 0 || nextIndex === lines.length - 1 || !lines[nextIndex + 1];
      const nextHeading = next ? isStrongDocumentHeading(next, nextPreviousBlank, nextNextBlank) : false;
      const thisList = /^(?:[•▪◦*-]\s+|\d+[.)]\s+)/.test(line);
      const nextList = /^(?:[•▪◦*-]\s+|\d+[.)]\s+)/.test(next);

      output.push(line);
      if (!next || thisHeading || nextHeading || thisList || nextList) continue;
      if (nextIndex !== i + 1) continue; // a real blank paragraph boundary exists

      const current = output[output.length - 1];
      const likelyContinuation =
        /[,;:—–-]$/.test(current) ||
        !/[.!?]["'’”)]?$/.test(current) ||
        /^[a-zà-öø-ÿ]/u.test(next) ||
        /^(?:and|or|but|nor|for|so|yet|that|which|who|whom|whose|where|when|while|because|although|though|if|unless|until|as|of|to|in|on|at|by|with|from|into|upon|through|than|then)\b/i.test(next);

      if (likelyContinuation) {
        output[output.length - 1] = `${current} ${next}`.replace(/\s+/g, ' ').trim();
        i = nextIndex;
      }
    }

    return output.join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cleanFormatText(value) {
    const lines = repairFalseProseLineBreaks(value)
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
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!line) {
        flush();
        continue;
      }
      const previousBlank = lineIndex === 0 || !lines[lineIndex - 1];
      const nextBlank = lineIndex === lines.length - 1 || !lines[lineIndex + 1];
      const isHeading = isStrongDocumentHeading(line, previousBlank, nextBlank);
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
    return ({ original: 'Original', clean: 'Readable', format_all: 'Formatted', summaryQuick: 'Summary', summaryStudy: 'Study Summary', summaryDetailed: 'Detailed Summary', custom: 'Custom', graduate: 'Graduate', college: 'College', highschool: 'High School', grade8: 'Grade 8', grade6: 'Grade 6', grade4: 'Grade 4' })[level] || level;
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
    app.classList.toggle('read-anything-paragraph-spacing', level === 'clean' || level === 'format_all' || level.startsWith('summary') || level === 'custom');
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
    const sourceText = String(
      activeImportedDocument.versions?.original ||
      activeImportedDocument.originalText ||
      transformSourceText()
    ).trim();
    if (sourceText.length < 20) throw new Error('The saved document text is unavailable. Reopen the original item from My Library and try again.');
    showTransformStatus(`Creating ${style} summary of the whole article…`);
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

  function detectDocumentStructure(value) {
    const text = String(value || '').replace(/\r/g, '').trim();
    if (!text) return { type: 'empty', confidence: 1, entries: 0 };

    const flat = text.replace(/\s+/g, ' ').trim();
    const tocHeading = /\b(?:BOOK|CHAPTER|PART|SECTION|ACT)\s+(?:[IVXLCDM]+|\d{1,3}|[A-Z]+(?:-[A-Z]+)*)\b/gi;
    const tocMatches = [...flat.matchAll(tocHeading)];

    if (tocMatches.length >= 4) {
      const distances = tocMatches.slice(1).map((match, index) => match.index - tocMatches[index].index);
      const averageDistance = distances.length
        ? distances.reduce((sum, distance) => sum + distance, 0) / distances.length
        : flat.length;
      const leading = flat.slice(0, tocMatches[0].index).trim();
      const compactLeading = !leading || leading.length <= 120;
      const denseSequence = averageDistance <= 220;

      if (compactLeading && denseSequence) {
        return {
          type: 'table_of_contents',
          confidence: Math.min(1, .72 + tocMatches.length * .015),
          entries: tocMatches.length + (leading ? 1 : 0)
        };
      }
    }

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const bibliographyLines = lines.filter(line =>
      /(?:\b(?:vol\.|pp?\.|ed\.|press|university|publisher|doi|isbn)\b|https?:\/\/)/i.test(line)
    ).length;
    if (lines.length >= 5 && bibliographyLines / lines.length >= .45) {
      return { type: 'bibliography', confidence: .78, entries: lines.length };
    }

    const poetryLines = lines.filter(line => line.length > 0 && line.length <= 85).length;
    const terminalPunctuation = lines.filter(line => /[.!?]["'’”)]?$/.test(line)).length;
    if (lines.length >= 6 && poetryLines / lines.length >= .8 && terminalPunctuation / lines.length < .55) {
      return { type: 'poetry', confidence: .68, entries: lines.length };
    }

    const frontMatterSignals = /(?:copyright|contents|translator(?:'s)?\s+preface|preface|foreword|introduction|publisher|printed in|isbn)/i;
    if (flat.length <= 8000 && frontMatterSignals.test(flat.slice(0, 2000))) {
      return { type: 'front_matter', confidence: .62, entries: 0 };
    }

    return { type: 'prose', confidence: .7, entries: 0 };
  }

  function formatTableOfContents(value) {
    const flat = String(value || '').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
    if (!flat) return '';

    const headingPattern = /\b(?:BOOK|CHAPTER|PART|SECTION|ACT)\s+(?:[IVXLCDM]+|\d{1,3}|[A-Z]+(?:-[A-Z]+)*)\b/gi;
    const matches = [...flat.matchAll(headingPattern)];
    if (matches.length < 2) return flat;

    const rows = [];
    const leading = flat.slice(0, matches[0].index).trim();
    if (leading) rows.push(leading.replace(/\s*[—–:-]\s*$/, '').trim());

    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index;
      const end = index + 1 < matches.length ? matches[index + 1].index : flat.length;
      let row = flat.slice(start, end).trim();

      // Keep the source wording, but normalize whitespace around the separator.
      row = row
        .replace(/\s*([—–])\s*/g, ' $1 ')
        .replace(/\s*:\s*/g, ': ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      rows.push(row);
    }

    return rows.join('\n\n').trim();
  }

  function structureAwareFormat(value, level = 'standard') {
    const structure = detectDocumentStructure(value);
    if (structure.type === 'table_of_contents') {
      return {
        text: formatTableOfContents(value),
        structure
      };
    }
    return { text: String(value || ''), structure };
  }

  function cleanupTextContent(value, level = 'standard') {
    const original = String(value || '').replace(/\r/g, '').normalize('NFKC');
    const detectedStructure = detectDocumentStructure(original);
    const report = {
      level,
      structureType: detectedStructure.type,
      structureConfidence: detectedStructure.confidence,
      structureEntries: detectedStructure.entries || 0,
      badCharacters: 0,
      pageArtifacts: 0,
      repeatedHeaders: 0,
      brokenWords: 0,
      spacingFixes: 0
    };
    if (!original.trim()) return { text: '', report };

    let text = original.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, () => { report.badCharacters += 1; return ''; });
    text = text.replace(/\u00ad/g, () => { report.badCharacters += 1; return ''; });
    text = text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ');

    if (level !== 'light') {
      // Join words split only by a line-ending hyphen; preserve normal hyphenated compounds.
      text = text.replace(/([\p{L}]{3,})-\s*\n\s*([\p{Ll}]{2,})/gu, (_m, a, b) => { report.brokenWords += 1; return `${a}${b}`; });

      const lines = text.split('\n');
      const normalized = lines.map(line => line.replace(/\s+/g, ' ').trim());
      const counts = new Map();
      normalized.forEach(line => {
        if (!line || line.length > 90) return;
        const key = line.toLocaleLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      });
      const kept = [];
      normalized.forEach((line, index) => {
        if (!line) { kept.push(''); return; }
        const key = line.toLocaleLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();
        const standalonePage = /^(?:page\s*)?\d{1,4}$/i.test(line) || /^[ivxlcdm]{1,8}$/i.test(line);
        const runningHeader = line.length <= 70 && (counts.get(key) || 0) >= 3 && !/^(chapter|book|part|section|act|scene)\b/i.test(line);
        const pageHeader = /^\d{1,4}\s+[A-Z][A-Z '&.,:-]{3,70}$/.test(line) || /^[A-Z][A-Z '&.,:-]{3,70}\s+\d{1,4}$/.test(line);
        if (standalonePage || pageHeader) { report.pageArtifacts += 1; return; }
        if (runningHeader) { report.repeatedHeaders += 1; return; }
        kept.push(line);
      });
      text = kept.join('\n');
      text = repairFalseProseLineBreaks(text);
    }

    // Common scan/encoding noise that can be corrected without changing meaning.
    const safeFixes = [
      [/\s+([,.;:!?])/g, '$1'],
      [/([“‘(])\s+/g, '$1'],
      [/\s+([”’)])/g, '$1'],
      [/\.{4,}/g, '…'],
      [/\s+—\s+/g, ' — ']
    ];
    safeFixes.forEach(([pattern, replacement]) => {
      const before = text;
      text = text.replace(pattern, replacement);
      if (text !== before) report.spacingFixes += 1;
    });

    // Structural formatting runs before generic prose paragraphization.
    // A compact TOC should become one semantic entry per block rather than
    // being mistaken for a long paragraph.
    if (detectedStructure.type === 'table_of_contents' && level !== 'light') {
      text = formatTableOfContents(text);
    } else if (level === 'light') {
      text = text.replace(/\n{3,}/g, '\n\n').trim();
    } else if (level === 'standard') {
      text = cleanFormatText(text).replace(/\n{3,}/g, '\n\n').trim();
    } else {
      text = smartFormatText(cleanFormatText(text), 'all').replace(/\n{3,}/g, '\n\n').trim();
    }
    return { text, report };
  }

  async function requestAiCleanupText(value, title = 'Untitled', level = 'deep') {
    const rawSourceText = String(value || '').replace(/\r/g, '').trim();
    const rawStructure = detectDocumentStructure(rawSourceText);
    const sourceText = ['poetry', 'table_of_contents', 'bibliography'].includes(rawStructure.type)
      ? rawSourceText
      : repairFalseProseLineBreaks(rawSourceText);
    if (sourceText.length < 20) throw new Error('There is not enough text to format.');
    if (sourceText.length > 120000) throw new Error('This AI cleanup segment is too large. The full-document formatter should split long documents automatically.');
    const structure = detectDocumentStructure(sourceText);
    const structureGuidance = {
      table_of_contents: `The passage appears to be a TABLE OF CONTENTS. Treat each Introduction/Book/Chapter/Part/Section entry as a distinct structural item. Put each entry on its own line or block, preserve the original labels and titles, preserve their order, and do not merge the entries into prose. Do not invent page numbers or titles.`,
      poetry: `The passage appears to contain POETRY or verse. Preserve deliberate line breaks, stanza breaks, indentation cues, capitalization, and punctuation. Do not paragraphize verse into prose.`,
      bibliography: `The passage appears to be a BIBLIOGRAPHY or reference list. Preserve one citation/reference per item and do not merge separate references into prose.`,
      front_matter: `The passage appears to be FRONT MATTER. Preserve distinct title, author, publisher, copyright, preface, introduction, and contents elements as separate structural blocks.`,
      prose: `The passage appears to be ordinary PROSE. Restore sensible paragraphs and section headings without rewriting the prose.`
    }[structure.type] || `Preserve the detected document structure.`;

    const instructions = `Perform a conservative editorial/OCR cleanup of this ${level === 'deep' ? 'book or document' : 'text'}. First identify and preserve the document's structure before correcting its surface text.

Detected structure: ${structure.type}.
${structureGuidance}

Do NOT summarize, paraphrase, simplify, modernize, censor, or rewrite the author's prose. Preserve every meaningful sentence, quotation, name, date, number, footnote marker, and intentional wording unless it is clearly scan/OCR corruption.

Repair only what is justified by the text and surrounding context.
IMPORTANT ORDER OF OPERATIONS: reconstruct ordinary prose paragraphs FIRST, then identify headings. A PDF line break is not a paragraph or heading boundary by itself.

- fix obvious OCR character substitutions, garbled characters, and scan noise;
- join false hard line breaks created by PDF/page extraction when two adjacent lines are clearly one continuing prose sentence or paragraph;
- if a line ends without sentence-ending punctuation and the following line continues the grammar/sentence, join them with one space;
- do not promote a short or isolated continuation line to a chapter/section heading merely because it appears on its own line;
- treat a heading as structural only when there is strong evidence: an explicit Chapter/Book/Part/Section label, a known front-matter label, or clear title-like isolation supported by surrounding blank lines;
- repair words broken across scanned page/line boundaries and obvious spacing errors;
- remove running page headers, repeated book/author titles, page numbers, footer fragments, and other recurring scan artifacts when they are not part of the prose;
- reconstruct damaged chapter, book, part, and section headings when the intended heading is reasonably clear;
- normalize chapter/section heading layout and paragraph breaks;
- normalize obvious quote/apostrophe/dash/ellipsis encoding problems;
- preserve archaic spelling, historical usage, capitalization, dialect, foreign-language phrases, and stylistic punctuation unless clearly corrupted;
- never invent missing prose. If a damaged word cannot be inferred confidently, leave it rather than guessing;
- preserve semantic lists as lists: a table of contents must remain a table of contents, bibliography entries must remain separate, and poetry must retain verse/stanza structure;
- when a TOC is compressed onto one line, split it at each Book/Chapter/Part/Section boundary instead of creating prose paragraphs.

Return only the complete cleaned text. Do not include a report, commentary, markdown fences, or explanation.`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 115000);
    try {
      const response = await fetch('/api/read-anything/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: String(title || 'Untitled'), text: sourceText, instructions }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned HTTP ${response.status}.`);
      if (!payload.text) throw new Error('The AI formatter returned an empty result.');
      // Finish with only safe character/spacing normalization; do not run structural regex cleanup over AI output.
      const finalPass = cleanupTextContent(payload.text, 'light');
      const finalStructure = detectDocumentStructure(finalPass.text);
      const finalText = ['poetry', 'table_of_contents', 'bibliography'].includes(finalStructure.type)
        ? finalPass.text
        : repairFalseProseLineBreaks(finalPass.text);
      return {
        text: finalText,
        report: {
          ...finalPass.report,
          level: 'deep',
          ai: true,
          structureType: structure.type,
          structureConfidence: structure.confidence,
          structureEntries: structure.entries || finalStructure.entries || 0
        }
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('AI Deep Clean took too long. Try a shorter chapter or use Standard cleanup.');
      throw new Error(error?.message === 'Failed to fetch'
        ? 'The AI formatter connection was interrupted. Try again.'
        : error?.message || 'AI Deep Clean could not be completed.');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function splitTextForDeepCleanup(value, maximumCharacters = 70000) {
    const text = String(value || '').replace(/\r/g, '').trim();
    if (!text) return [];
    if (text.length <= maximumCharacters) return [text];

    // Prefer paragraph and section boundaries. Never intentionally drop text.
    const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const chunks = [];
    let current = '';

    const pushCurrent = () => {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    };

    const splitOversizedBlock = (block) => {
      let remaining = block;
      while (remaining.length > maximumCharacters) {
        let cut = maximumCharacters;
        const floor = Math.floor(maximumCharacters * 0.65);
        const candidates = [
          remaining.lastIndexOf('\n', maximumCharacters),
          remaining.lastIndexOf('. ', maximumCharacters),
          remaining.lastIndexOf('? ', maximumCharacters),
          remaining.lastIndexOf('! ', maximumCharacters),
          remaining.lastIndexOf('; ', maximumCharacters),
          remaining.lastIndexOf(' ', maximumCharacters)
        ].filter((position) => position >= floor);
        if (candidates.length) cut = Math.max(...candidates) + 1;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
      }
      if (remaining) current = remaining;
    };

    for (const block of blocks) {
      if (block.length > maximumCharacters) {
        pushCurrent();
        splitOversizedBlock(block);
        continue;
      }
      const candidate = current ? `${current}\n\n${block}` : block;
      if (candidate.length > maximumCharacters) {
        pushCurrent();
        current = block;
      } else {
        current = candidate;
      }
    }
    pushCurrent();
    return chunks;
  }

  async function requestAiCleanupDocument(value, title = 'Untitled', onProgress = null) {
    const chunks = splitTextForDeepCleanup(value, 70000);
    if (!chunks.length) throw new Error('There is not enough text to format.');
    if (chunks.length === 1) return requestAiCleanupText(chunks[0], title, 'deep');

    const cleanedChunks = [];
    const aggregate = {
      level: 'deep', ai: true, chunked: true, chunks: chunks.length,
      badCharacters: 0, pageArtifacts: 0, repeatedHeaders: 0,
      brokenWords: 0, spacingFixes: 0
    };

    for (let index = 0; index < chunks.length; index += 1) {
      if (typeof onProgress === 'function') {
        onProgress({
          chunk: index + 1,
          totalChunks: chunks.length,
          percent: Math.round((index / chunks.length) * 100)
        });
      }
      const result = await requestAiCleanupText(
        chunks[index],
        `${title} — section ${index + 1} of ${chunks.length}`,
        'deep'
      );
      cleanedChunks.push(String(result.text || '').trim());
      const report = result.report || {};
      ['badCharacters','pageArtifacts','repeatedHeaders','brokenWords','spacingFixes'].forEach((key) => {
        aggregate[key] += Number(report[key]) || 0;
      });
    }

    if (typeof onProgress === 'function') {
      onProgress({ chunk: chunks.length, totalChunks: chunks.length, percent: 100 });
    }

    return {
      text: cleanedChunks.filter(Boolean).join('\n\n'),
      report: aggregate
    };
  }

  async function applyCleanup(level = 'standard', scope = 'document', selectedText = '', selectionRange = null, onProgress = null) {
    // The live Reader is the source of truth at action time.
    ensureActiveReaderDocument();

    const selected = String(selectedText || '').trim();
    const current = window.MarkSetGoCurrentReaderDocument?.get?.();
    const liveText = String(current?.text || '');
    const range = selectionRange || window.MarkSetGoCurrentReaderDocument?.getSelectionRange?.();

    if (scope === 'selection' && !selected && !String(range?.text || '').trim()) {
      throw new Error('No highlighted passage was available to format.');
    }
    if (!activeImportedDocument) {
      throw new Error(scope === 'selection'
        ? 'The highlighted passage is visible, but the Reader source text could not be accessed.'
        : 'No readable text is currently available to format.');
    }

    const original = String(activeImportedDocument.versions?.original || activeImportedDocument.originalText || '').trim();
    if (original.length < 20) throw new Error('The preserved original text is unavailable.');

    let result;

    if (scope === 'selection') {
      // Primary path: use the Reader's canonical word range converted to exact
      // character offsets in the currently displayed source text.
      const rangeMatchesCurrentDocument =
        range &&
        Number.isFinite(Number(range.charStart)) &&
        Number.isFinite(Number(range.charEnd)) &&
        Number(range.charStart) >= 0 &&
        Number(range.charEnd) > Number(range.charStart) &&
        (!range.documentId || !current?.documentId || String(range.documentId) === String(current.documentId));

      if (rangeMatchesCurrentDocument && liveText) {
        const charStart = Math.max(0, Number(range.charStart));
        const charEnd = Math.min(liveText.length, Number(range.charEnd));
        const sourcePassage = liveText.slice(charStart, charEnd);

        if (!sourcePassage.trim()) throw new Error('The highlighted Reader range was empty.');

        const cleaned = level === 'deep'
          ? await requestAiCleanupText(sourcePassage, activeImportedDocument.title || current?.title || 'Selected passage', level)
          : cleanupTextContent(sourcePassage, level);

        result = {
          text: liveText.slice(0, charStart) + cleaned.text + liveText.slice(charEnd),
          report: { ...cleaned.report, rangeBased: true }
        };
      } else {
        // Compatibility fallback for selections created by older builds that do
        // not expose indexes. This is intentionally secondary to range matching.
        const candidate = selected || String(range?.text || '').trim();
        const originalAt = candidate ? original.indexOf(candidate) : -1;
        const liveAt = candidate && liveText ? liveText.indexOf(candidate) : -1;

        if (originalAt < 0 && liveAt < 0) {
          throw new Error('The highlighted passage range could not be resolved in the current Reader.');
        }

        const baseText = liveAt >= 0 ? liveText : original;
        const at = liveAt >= 0 ? liveAt : originalAt;
        const cleaned = level === 'deep'
          ? await requestAiCleanupText(candidate, activeImportedDocument.title || current?.title || 'Selected passage', level)
          : cleanupTextContent(candidate, level);

        result = {
          text: baseText.slice(0, at) + cleaned.text + baseText.slice(at + candidate.length),
          report: { ...cleaned.report, rangeBased: false }
        };
      }
    } else {
      result = level === 'deep'
        ? await requestAiCleanupDocument(original, activeImportedDocument.title || 'Untitled', onProgress)
        : cleanupTextContent(original, level);
    }

    const key = `cleanup_${level}_${scope === 'selection' ? 'selection' : 'document'}`;
    activeImportedDocument.versions[key] = result.text;
    activeImportedDocument.cleanupReport = result.report;
    saveActiveFormatRecord();
    renderImportedVersion(key);
    return result.report;
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

  function smartFormatText(value, mode = 'all') {
    const original = String(value || '').replace(/\r/g, '').trim();
    if (!original) return '';
    let text = original.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ');
    if (mode === 'spacing') return text.replace(/\n{3,}/g, '\n\n').trim();
    const blocks = text.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (const block of blocks) {
      const lines = block.split('\n').map(x => x.trim()).filter(Boolean);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const previousBlank = lineIndex === 0;
        const nextBlank = lineIndex === lines.length - 1;
        const heading = isStrongDocumentHeading(line, previousBlank, nextBlank);
        const list = /^[•▪◦*-]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
        if ((mode === 'sections' || mode === 'all') && (heading || list)) { out.push(line); continue; }
        if (mode === 'sections') { out.push(line); continue; }
        out.push(paragraphizeLongText(line, 4, 520));
      }
    }
    return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function applySmartFormat(mode = 'all') {
    if (!activeImportedDocument) throw new Error('Smart Format is available for imported or pasted documents.');
    const original = String(activeImportedDocument.versions?.original || activeImportedDocument.originalText || '').trim();
    if (original.length < 20) throw new Error('The preserved original text is unavailable.');
    const key = `format_${mode}`;
    activeImportedDocument.versions[key] = smartFormatText(original, mode);
    saveActiveFormatRecord();
    renderImportedVersion(key);
  }

  function installDisplayFormatControl() {
    if (!activeImportedDocument) return;
    const display = [...document.querySelectorAll('#app .settings-panel')].find(d => d.querySelector('summary span')?.textContent?.trim() === 'Display');
    const content = display?.querySelector('.settings-content');
    if (!content || content.querySelector('.smart-format-control')) return;
    const box = document.createElement('div');
    box.className = 'smart-format-control smart-format-box';
    box.innerHTML = `<div class="smart-format-heading"><strong>Format</strong><small>Structure this text without rewriting it</small></div><div class="smart-format-actions"><button type="button" class="secondary" data-smart-format="spacing">Clean spacing</button><button type="button" class="secondary" data-smart-format="paragraphs">Paragraphs</button><button type="button" class="secondary" data-smart-format="sections">Sections</button><button type="button" class="primary" data-smart-format="all">Format all</button><button type="button" class="secondary" data-smart-format="original">Original</button></div>`;
    content.appendChild(box);
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-smart-format]'); if (!button) return;
      try { button.dataset.smartFormat === 'original' ? restoreOriginal() : applySmartFormat(button.dataset.smartFormat); }
      catch (error) { showTransformStatus(error.message, true); }
    });
  }

  function isWholeArticleDocument() {
    const type = String(activeImportedDocument?.source?.type || '').toLowerCase();
    return ['topic-feed', 'bookmarklet', 'website'].includes(type);
  }

  function activeArticleCompanionIdentity() {
    const live = window.MSGCompanion?.config;
    if (live?.id && live?.name) {
      return {
        id: live.id,
        name: live.name,
        ask: live.ask || `Ask ${live.name}`,
        avatar: live.avatar || ''
      };
    }

    let id = 'mark';
    try {
      id = String(
        localStorage.getItem('msg_companion_persona_v2') ||
        localStorage.getItem('msg_companion_persona_v1') ||
        'mark'
      ).toLowerCase();
    } catch {}

    if (id === 'chad') {
      return {
        id: 'chad',
        name: 'Chad',
        ask: 'Ask Chad',
        avatar: '/assets/companions/chad/chad-avatar.png'
      };
    }

    if (id === 'beth') {
      return {
        id: 'beth',
        name: 'Beth',
        ask: 'Ask Beth',
        avatar: '/assets/companions/beth/beth-avatar.png'
      };
    }

    return {
      id: 'mark',
      name: 'Mark',
      ask: 'Ask Mark',
      avatar: '/assets/ask-mark/ask-mark-avatar.png'
    };
  }

  function buildInvestorFollowupContext(result = {}) {
    const originalText = String(
      activeImportedDocument?.versions?.original ||
      activeImportedDocument?.originalText ||
      ''
    ).trim();

    const lines = [
      `Article: ${activeImportedDocument?.baseTitle || activeImportedDocument?.title || 'Current article'}`,
      '',
      'Initial investor analysis:',
      String(result?.analysis || '').trim(),
      Array.isArray(result?.keyPoints) && result.keyPoints.length
        ? `Key investor takeaways:\n${result.keyPoints.map((item) => `- ${item}`).join('\n')}`
        : '',
      Array.isArray(result?.catalysts) && result.catalysts.length
        ? `What to watch:\n${result.catalysts.map((item) => `- ${item}`).join('\n')}`
        : '',
      Array.isArray(result?.risks) && result.risks.length
        ? `Risks:\n${result.risks.map((item) => `- ${item}`).join('\n')}`
        : '',
      result?.recommendation
        ? `General investor posture:\n${result.recommendation}`
        : '',
      '',
      'Article text:',
      originalText
    ].filter(Boolean);

    // /api/mark-selection accepts at most 1,800 words and 12,000 characters.
    // Stay below both ceilings so the normal Ask-companion chat can use this
    // context without creating a new parallel chat system.
    const byChars = lines.join('\n\n').slice(0, 11500);
    return byChars.split(/\s+/).slice(0, 1700).join(' ').trim();
  }

  function primeInvestorFollowupContext(result = {}) {
    const contextText = buildInvestorFollowupContext(result);
    if (!contextText) return false;

    const companion = activeArticleCompanionIdentity();
    const selection = {
      text: contextText,
      selection: contextText,
      before: '',
      after: '',
      title: activeImportedDocument?.baseTitle || activeImportedDocument?.title || 'Current article',
      chapter: 'Whole article · Investor analysis',
      documentId: '',
      startIndex: 0,
      endIndex: Math.max(1, contextText.split(/\s+/).length),
      syntheticWholeArticle: true
    };

    let connected = false;

    // app.js and read-anything.js are classic deferred scripts. The Reader's
    // existing global lexical state is therefore available here without
    // changing Reader architecture. Setting only markSelection gives the
    // existing text-chat runMarkAction() the context it requires.
    try {
      if (typeof state !== 'undefined' && state) {
        selection.documentId = state.documentId || '';
        selection.startIndex = Math.max(0, Number(state.index) || 0);
        selection.endIndex = selection.startIndex + Math.max(1, contextText.split(/\s+/).length);
        state.markSelection = selection;
        connected = true;
      }
    } catch (error) {
      console.warn('Investor follow-up context could not attach to Reader state.', error);
    }

    window.MSGInvestorArticleContext = {
      companion,
      selection,
      analysis: result,
      // Follow-up chat is intentionally grounded in the WHOLE imported article.
      // Keep the complete original text in memory; do not reduce it to the
      // 1,700-word legacy selection bridge.
      articleText: originalText,
      title: activeImportedDocument?.baseTitle || activeImportedDocument?.title || 'Current article',
      sourceUrl: activeImportedDocument?.source?.url || '',
      history: Array.isArray(window.MSGInvestorArticleContext?.history)
        ? window.MSGInvestorArticleContext.history
        : [],
      updatedAt: new Date().toISOString()
    };

    document.dispatchEvent(new CustomEvent('marksetgo:investor-context-ready', {
      detail: {
        companion: companion.id,
        title: selection.title,
        connected
      }
    }));

    return connected;
  }

  function notifyAskMarkPanelUpdated(kind = 'response') {
    document.dispatchEvent(new CustomEvent('marksetgo:askmark-legacy-updated', {
      detail: { kind }
    }));
  }

  function openAskMarkInvestorPanel() {
    const layout = document.querySelector('#app #reader-layout');
    const selectionTab = document.querySelector('#app [data-mark-tab="selection"]');
    const markPanel = document.querySelector('#app #mark-selection-panel');

    // Prefer the Reader's native Ask Mark opener when it is globally available.
    if (typeof window.openMarkPanel === 'function') {
      try { window.openMarkPanel('selection'); } catch {}
    } else {
      const hidden = layout?.classList.contains('word-panel-hidden');
      const selectionActive = selectionTab?.classList.contains('active');
      if ((hidden || !selectionActive) && document.querySelector('#app #toggle-mark-panel')) {
        document.querySelector('#app #toggle-mark-panel').click();
      }
    }

    // Defensive DOM sync for builds where the legacy functions are not exported.
    layout?.classList.remove('word-panel-hidden');
    document.querySelectorAll('#app [data-mark-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.markTab === 'selection');
    });
    document.querySelectorAll('#app [data-mark-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.markPanel !== 'selection';
    });

    return markPanel || document.querySelector('#app #mark-selection-panel');
  }

  function renderInvestorAnalysisInAskMark(result, { loading = false, error = '' } = {}) {
    const panel = openAskMarkInvestorPanel();
    if (!panel) return;

    const companion = activeArticleCompanionIdentity();

    if (loading) {
      panel.innerHTML = `
        <div class="mark-selection-card">
          <span>Whole article · Investor view</span>
          <blockquote>${escapeHtml(activeImportedDocument?.baseTitle || activeImportedDocument?.title || 'Current article')}</blockquote>
        </div>
        <div id="mark-response" class="mark-response">
          <div class="mark-response-heading"><span>${escapeHtml(companion.ask)}</span><strong>Investor analysis</strong></div>
          <p class="status">${escapeHtml(companion.name)} is analyzing the full article from an investor perspective…</p>
        </div>`;
      notifyAskMarkPanelUpdated('response');
      return;
    }

    if (error) {
      panel.innerHTML = `
        <div class="mark-selection-card">
          <span>Whole article · Investor view</span>
          <blockquote>${escapeHtml(activeImportedDocument?.baseTitle || activeImportedDocument?.title || 'Current article')}</blockquote>
        </div>
        <div id="mark-response" class="mark-response">
          <div class="mark-response-heading"><span>${escapeHtml(companion.ask)}</span><strong>Investor analysis</strong></div>
          <p class="status error">${escapeHtml(error)}</p>
        </div>`;
      notifyAskMarkPanelUpdated('response');
      return;
    }

    const keyPoints = Array.isArray(result?.keyPoints) ? result.keyPoints : [];
    const catalysts = Array.isArray(result?.catalysts) ? result.catalysts : [];
    const risks = Array.isArray(result?.risks) ? result.risks : [];
    const cautions = Array.isArray(result?.cautions) ? result.cautions : [];

    panel.innerHTML = `
      <div class="mark-selection-card">
        <span>Whole article · Investor view</span>
        <blockquote>${escapeHtml(activeImportedDocument?.baseTitle || activeImportedDocument?.title || 'Current article')}</blockquote>
      </div>
      <div id="mark-response" class="mark-response" data-investor-analysis="1">
        <div class="mark-response-heading"><span>${escapeHtml(companion.ask)}</span><strong>${escapeHtml(result?.heading || 'Investor analysis')}</strong></div>
        <p>${escapeHtml(result?.analysis || '')}</p>
        ${keyPoints.length ? `<h4>Key investor takeaways</h4><ul>${keyPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        ${catalysts.length ? `<h4>What to watch</h4><ul>${catalysts.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        ${risks.length ? `<h4>Risks</h4><ul>${risks.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        <h4>General investor posture</h4>
        <p>${escapeHtml(result?.recommendation || 'The article alone does not support a clear investment posture.')}</p>
        ${cautions.length ? `<div class="mark-cautions">${cautions.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div>` : ''}
        <p><small>General market analysis based on this article, not personalized financial advice.</small></p>
      </div>`;

    // Give the existing Ask-companion text chat a whole-article context so
    // follow-up questions work immediately after this analysis.
    primeInvestorFollowupContext(result || {});
    notifyAskMarkPanelUpdated('response');
  }

  async function requestInvestorAnalysis() {
    if (!activeImportedDocument) throw new Error('No article is open.');

    const cached = activeImportedDocument.source?.investorAnalysis;
    if (cached?.analysis && cached?.recommendation) {
      renderInvestorAnalysisInAskMark(cached);
      primeInvestorFollowupContext(cached);
      return cached;
    }

    const originalText = String(
      activeImportedDocument.versions?.original ||
      activeImportedDocument.originalText ||
      ''
    ).trim();

    if (originalText.length < 40) throw new Error('The original article text is unavailable.');

    renderInvestorAnalysisInAskMark(null, { loading: true });

    const response = await fetch('/api/read-anything/investor-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: activeImportedDocument.baseTitle || activeImportedDocument.title,
        text: originalText,
        sourceUrl: activeImportedDocument.source?.url || '',
        topic: activeImportedDocument.source?.topic || ''
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const companion = activeArticleCompanionIdentity();
      const message = payload.detail || payload.error || `${companion.name} could not complete the investor analysis.`;
      renderInvestorAnalysisInAskMark(null, { error: message });
      throw new Error(message);
    }

    const result = payload.result || {};
    activeImportedDocument.source = {
      ...(activeImportedDocument.source || {}),
      investorAnalysis: result
    };
    saveActiveFormatRecord();
    renderInvestorAnalysisInAskMark(result);
    return result;
  }

  function installArticleSummaryButton() {
    const existing = document.querySelector('#read-anything-article-summary-action');

    if (!activeImportedDocument || !isWholeArticleDocument()) {
      existing?.remove();
      return;
    }

    const reader = document.querySelector('#app #reader');
    if (!reader) return;

    // Keep the action inside the Reader, but visually separate from article prose.
    // It belongs above the first line rather than participating in the text flow.
    const firstIndexed = reader.querySelector(
      '.reader-word[data-index], .reader-group[data-start-index]'
    );
    const firstIndex = firstIndexed
      ? Number(firstIndexed.dataset.index ?? firstIndexed.dataset.startIndex)
      : 0;

    if (Number.isFinite(firstIndex) && firstIndex > 0) {
      existing?.remove();
      return;
    }

    let actionRow = existing;

    if (!actionRow) {
      actionRow = document.createElement('div');
      actionRow.id = 'read-anything-article-summary-action';
      actionRow.className = 'read-anything-article-summary-row';
      actionRow.setAttribute('role', 'group');
      actionRow.setAttribute('aria-label', 'Article actions');
      actionRow.style.cssText = [
        'display:block',
        'width:100%',
        'box-sizing:border-box',
        'margin:0 0 .85em 0',
        'padding:0',
        'break-inside:avoid',
        'page-break-inside:avoid',
        'position:relative',
        'z-index:3'
      ].join(';');

      const makeArticleLink = (action, label, ariaLabel) => {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'read-anything-inline-article-summary';
        link.dataset.action = action;
        link.textContent = label;
        link.setAttribute('aria-label', ariaLabel);
        link.style.cssText = [
          'display:inline',
          'padding:0',
          'border:0',
          'background:none',
          'color:#1769aa',
          'font:inherit',
          'font-size:.8em',
          'font-weight:600',
          'line-height:1.2',
          'text-decoration:none',
          'cursor:pointer'
        ].join(';');

        link.onmouseenter = () => {
          link.style.textDecoration = 'underline';
          link.style.textUnderlineOffset = '2px';
        };
        link.onmouseleave = () => {
          link.style.textDecoration = 'none';
        };
        link.onfocus = () => {
          link.style.textDecoration = 'underline';
          link.style.textUnderlineOffset = '2px';
          link.style.outline = '2px solid rgba(23,105,170,.28)';
          link.style.outlineOffset = '3px';
          link.style.borderRadius = '2px';
        };
        link.onblur = () => {
          link.style.textDecoration = 'none';
          link.style.outline = 'none';
        };
        return link;
      };

      const summaryLink = makeArticleLink(
        'summarize-whole-article',
        'Summarize',
        'Summarize this whole article'
      );
      const separator = document.createElement('span');
      separator.textContent = ' · ';
      separator.setAttribute('aria-hidden', 'true');
      separator.style.cssText = 'font-size:.8em;opacity:.42;margin:0 .18em';

      const investorLink = makeArticleLink(
        'investor-analysis',
        'Analyze',
        'Analyze this whole article'
      );

      actionRow.append(summaryLink, separator, investorLink);
      reader.prepend(actionRow);
    } else if (actionRow.parentElement !== reader) {
      reader.prepend(actionRow);
    }

    const link = actionRow.querySelector('[data-action="summarize-whole-article"]');
    if (!link) return;

    const showingSummary = activeImportedVersion.startsWith('summary');
    link.textContent = showingSummary ? '← Back to article' : 'Summarize';
    link.title = showingSummary
      ? 'Return to the complete article'
      : 'Summarize the entire article into its key points — no highlighting required.';
    link.disabled = false;

    link.onclick = async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      if (activeImportedVersion.startsWith('summary')) {
        renderImportedVersion('original');
        return;
      }

      const originalLabel = link.textContent;
      link.disabled = true;
      link.textContent = 'Summarizing…';

      try {
        await requestSummary('quick');
      } catch (error) {
        showTransformStatus(error.message, true);
        link.textContent = 'Summary failed — try again';
        link.title = error.message || 'The article could not be summarized.';
        window.setTimeout(() => {
          if (!link.isConnected) return;
          link.disabled = false;
          link.textContent = originalLabel;
        }, 2500);
      }
    };

    const investorLink = actionRow.querySelector('[data-action="investor-analysis"]');
    if (investorLink) {
      {
        const companion = activeArticleCompanionIdentity();
        investorLink.title = 'Analyze the whole article and open the result in the active companion panel.';
      }
      investorLink.onclick = async (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        const originalLabel = investorLink.textContent;
        investorLink.disabled = true;
        investorLink.textContent = 'Analyzing…';

        try {
          await requestInvestorAnalysis();
        } catch (error) {
          // The Ask Mark panel already contains the detailed error.
          console.warn('Investor analysis failed:', error);
        } finally {
          if (investorLink.isConnected) {
            investorLink.disabled = false;
            investorLink.textContent = originalLabel;
          }
        }
      };
    }
  }

  function observeInlineArticleSummary() {
    const reader = document.querySelector('#app #reader');
    if (!reader || reader.dataset.inlineArticleSummaryObserved === '1') return;
    reader.dataset.inlineArticleSummaryObserved = '1';

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        if (!reader.isConnected || !activeImportedDocument || !isWholeArticleDocument()) {
          observer.disconnect();
          return;
        }
        installArticleSummaryButton();
      });
    });

    observer.observe(reader, { childList: true });
  }

  function installDefaultArticleBookPages() {
    if (!activeImportedDocument || !isWholeArticleDocument()) return;

    const bookPages = document.querySelector('#app #book-pages');
    if (!bookPages || bookPages.disabled || bookPages.checked) return;

    // Use the Reader's existing Book Pages change handler rather than changing
    // Reader internals directly. This keeps layout, pagination, position, and
    // persisted Reader state synchronized with the normal control.
    bookPages.checked = true;
    bookPages.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function scheduleFormatControlAttach() {
    document.querySelector('#read-anything-format-control')?.remove();
    document.dispatchEvent(new CustomEvent('marksetgo:transform-state', { detail: { version: activeImportedVersion, label: versionLabel(activeImportedVersion), active: Boolean(activeImportedDocument) } }));
    [0, 100, 350, 800].forEach((delay) => window.setTimeout(() => {
      installDisplayFormatControl();
      installArticleSummaryButton();
      observeInlineArticleSummary();
      installDefaultArticleBookPages();
    }, delay));
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
    // A whole-article analysis conversation belongs only to the article that
    // created it. Never let a later document inherit that context.
    window.MSGInvestorArticleContext = null;
    const title = cleanImportedTitle(documentRecord?.title || 'Untitled');
    const text = String(documentRecord?.text || '').trim();
    if (!text) throw new Error('No readable text was found.');
    if (typeof window.renderReaderWithText !== 'function') throw new Error('The reader is not ready.');
    addHistory({ ...documentRecord, title, text });
    const readAnythingKey = importedDocumentKey({ ...documentRecord, title });
    const sourceType = String(documentRecord?.source?.type || '').toLowerCase();
    const autoFormatArticle = ['topic-feed', 'bookmarklet', 'website'].includes(sourceType);
    const formattedArticle = autoFormatArticle ? smartFormatText(text, 'all') : '';

    activeImportedDocument = {
      ...documentRecord,
      title,
      baseTitle: title,
      author: documentRecord.author || documentRecord.source?.author || '',
      source: {
        ...(documentRecord.source || {}),
        readAnything: true,
        readAnythingKey,
        autoFormattedArticle: autoFormatArticle
      },
      versions: {
        original: text,
        clean: cleanFormatText(text),
        ...(autoFormatArticle && formattedArticle ? { format_all: formattedArticle } : {})
      },
      originalText: text
    };

    // Web/news articles open in the same "Format all" view the user can invoke
    // manually, while the untouched original remains available at all times.
    activeImportedVersion = autoFormatArticle && formattedArticle ? 'format_all' : 'original';
    saveActiveFormatRecord();
    renderImportedVersion(activeImportedVersion);
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
    if (lower.endsWith('.epub') || lower.endsWith('.pdf') || /\.(mobi|azw3?|prc)$/i.test(lower)) {
      // Carry the already-selected File into the legacy importer. Previously
      // Read Anything navigated to Import and opened a second file picker,
      // forcing the user to select the same document twice.
      window.__markSetGoPendingUploadFile = file;

      allowLegacyUpload = true;
      const legacy = document.createElement('button');
      legacy.type = 'button';
      legacy.dataset.read = 'upload';
      legacy.hidden = true;
      document.body.appendChild(legacy);
      legacy.click();
      legacy.remove();
      allowLegacyUpload = false;
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
    return `javascript:(()=>{const e=s=>String(s||'').replace(/\\s+/g,' ').trim(),s=e(window.getSelection?.().toString()),r=document.querySelector('article,main,[role=main]')||document.body,t=e(document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.innerText||document.title),a=e(document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel=author]')?.innerText),B=[],H=[],S=new Set(),wc=v=>e(v).split(/\\s+/).filter(Boolean).length;let w=0;if(!s){[...r.querySelectorAll('h1,h2,h3,p,blockquote,li')].forEach(n=>{let v=e(n.innerText);if(v.length<=20||S.has(v))return;S.add(v);const h=/^H[1-3]$/.test(n.tagName),o=n.tagName==='LI'?'• '+v:v;if(h)H.push({title:v,index:w,type:'section'});B.push(o);w+=wc(o)})}const x=s||B.join('\\n\\n'),k=s?'selection':'page',c=s?e(window.getSelection()?.anchorNode?.parentElement?.closest('p,blockquote,li')?.innerText||''):'',f=document.createElement('form');f.method='POST';f.action='${target}';f.target='_blank';[['title',t],['author',a],['url',location.href],['text',x],['captureType',k],['context',c],['structure',JSON.stringify(s?[]:H)]].forEach(([n,v])=>{const i=document.createElement('textarea');i.name=n;i.value=v;f.appendChild(i)});f.hidden=true;document.body.appendChild(f);f.submit();f.remove()})()`;
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
            <span class="read-anything-icon">⇧</span><h2>Upload a file</h2><p>EPUB, DRM-free MOBI/AZW/AZW3, PDF, Word, Markdown, and plain text.</p>
            <label class="secondary button-link read-anything-file-button">Choose file<input id="read-anything-file" type="file" accept=".epub,.mobi,.azw,.azw3,.prc,.pdf,.docx,.txt,.md,.markdown" hidden></label>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">K</span><h2>Kindle Capture</h2><p>Capture Kindle Cloud Reader pages as searchable PDFs, then import them here.</p>
            <button id="read-anything-kindle" class="secondary" type="button">Set Up Kindle Capture</button>
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
    app.querySelector('#read-anything-kindle').addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      workspace.hidden = false;
      workspace.innerHTML = `
        <h2>Kindle Capture</h2>
        <p>Install the Mark, Set, Go! Kindle Capture Chrome extension once, then use it from Kindle Cloud Reader to create a searchable PDF.</p>
        <div class="source-actions">
          <a class="primary button-link" href="/downloads/mark-set-go-kindle-capture-v0.4.3.zip" download>Download Kindle Capture</a>
          <button id="kindle-copy-extensions" class="secondary" type="button">Copy chrome://extensions</button>
        </div>
        <ol>
          <li>Download and unzip the extension.</li>
          <li>Paste <code>chrome://extensions</code> into Chrome's address bar.</li>
          <li>Turn on <strong>Developer mode</strong>.</li>
          <li>Click <strong>Load unpacked</strong> and select the unzipped <code>mark-set-go-kindle-capture</code> folder.</li>
          <li>Open your book in Kindle Cloud Reader and click the Kindle Capture extension.</li>
          <li>Choose <strong>Current spread</strong>, <strong>Page range</strong>, or <strong>Whole book</strong>.</li>
          <li>Return here and use <strong>Upload a file</strong> to import the generated PDF.</li>
        </ol>
        <p><small>Use only with content you are authorized to copy or export.</small></p>`;
      workspace.querySelector('#kindle-copy-extensions').addEventListener('click', async (event) => {
        try {
          await navigator.clipboard.writeText('chrome://extensions');
          event.currentTarget.textContent = 'Copied';
          window.setTimeout(() => { event.currentTarget.textContent = 'Copy chrome://extensions'; }, 1600);
        } catch {
          event.currentTarget.textContent = 'Copy: chrome://extensions';
        }
      });
      workspace.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    app.querySelector('#read-anything-bookmarklet').addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      const code = bookmarkletCode();
      workspace.hidden = false;
      workspace.innerHTML = `<h2>Install “Read with Mark”</h2><p>Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>${escapeHtml(code)}</textarea></label>`;
      workspace.querySelector('#bookmarklet-code').addEventListener('focus', (event) => event.currentTarget.select());
    });
  }

  async function openPendingCapture(attempt = 0) {
    // Do not fetch/consume the capture until the Reader bridge is actually ready.
    // The previous version fetched the token first and then deliberately waited
    // through several retries, so the capture could disappear before it opened.
    if (typeof window.renderReaderWithText !== 'function') {
      if (attempt < 40) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
      return;
    }

    let payload = null;
    const tokenMatch = location.hash.match(/read-anything-capture=([^&]+)/);

    if (tokenMatch?.[1]) {
      try {
        const token = decodeURIComponent(tokenMatch[1]);
        const response = await fetch(`/api/capture/${encodeURIComponent(token)}`, {
          cache: 'no-store'
        });
        if (response.ok) {
          payload = await response.json();
        } else if (response.status === 404) {
          return;
        } else {
          throw new Error(`Capture returned HTTP ${response.status}.`);
        }
      } catch {
        if (attempt < 40) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
        return;
      }
    }

    // Backward compatibility for captures created by the older localStorage flow.
    if (!payload) {
      try { payload = JSON.parse(CAPTURE_STORAGE.getItem(CAPTURE_KEY) || 'null'); } catch {}
    }

    if (!payload?.text) return;

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
          documentToc: Array.isArray(payload.documentToc) ? payload.documentToc : [],
          importedAt: new Date().toISOString()
        }
      });

      try { CAPTURE_STORAGE.removeItem(CAPTURE_KEY); } catch {}
      if (location.hash.includes('read-anything-capture')) {
        history.replaceState({}, '', `${location.pathname}${location.search}`);
      }
    } catch {
      if (attempt < 40) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
    }
  }

  document.addEventListener('marksetgo:document-available', (event) => {
    const documentId = event?.detail?.documentId;
    if (!documentId) return;
    if (pendingImportedRender && activeImportedDocument) {
      pendingImportedRender = false;
      const key = activeImportedDocument.source?.readAnythingKey || importedDocumentKey(activeImportedDocument);
      activeImportedDocument.source = { ...(activeImportedDocument.source || {}), readerDocumentId: String(documentId) };
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

  function ensureActiveReaderDocument() {
    const current = window.MarkSetGoCurrentReaderDocument?.get?.();
    if (!current?.documentId || !String(current?.text || '').trim()) return Boolean(activeImportedDocument);

    const currentId = String(current.documentId);
    const activeReaderId = String(activeImportedDocument?.source?.readerDocumentId || '');

    if (activeImportedDocument && activeReaderId === currentId) return true;

    // First reuse any existing formatter record for this Reader document.
    if (restoreImportedFormatRecord(currentId, current.title || '')) {
      const restoredReaderId = String(activeImportedDocument?.source?.readerDocumentId || currentId);
      if (restoredReaderId === currentId) return true;
    }

    // The live Reader is the final source of truth. Do not require a matching
    // localStorage document record: some valid Reader loads have not persisted
    // that record yet, but the Reader bridge already exposes the complete text.
    const originalText = String(current.text || '').trim();
    if (!originalText) return false;

    const key = `reader-${currentId}`;
    activeImportedDocument = {
      title: cleanImportedTitle(current.title || 'Untitled'),
      baseTitle: cleanImportedTitle(current.title || 'Untitled'),
      author: current.source?.author || '',
      source: {
        ...(current.source || {}),
        readAnything: true,
        readAnythingKey: key,
        readerDocumentId: currentId,
        formatterAdoptedFromLiveReader: true
      },
      versions: { original: originalText },
      originalText
    };
    activeImportedVersion = 'original';
    rememberFormatDocument(currentId, key);
    saveActiveFormatRecord();
    scheduleFormatControlAttach();
    return true;
  }

  window.MarkSetGoReadAnything = Object.freeze({
    render: renderHub,
    openDocument,
    bookmarkletCode,
    cleanFormatText,
    cleanupTextContent,
    requestAiCleanupText,
    applyCleanup,
    hasActiveDocument: () => ensureActiveReaderDocument(),
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
