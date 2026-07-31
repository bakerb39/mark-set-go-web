'use strict';

(function registerVirtualRenderer(global) {
  const namespace = global.MarkSetGoReader = global.MarkSetGoReader || {};

  class VirtualRenderer {
    constructor({
      getState,
      setWordContent,
      savedDefinitionAt,
      noteAt,
      refreshReadingGroups,
      scheduleIllustrationsForRange,
      updateBookPageStatus
    } = {}) {
      this.getState = getState;
      this.setWordContent = setWordContent;
      this.savedDefinitionAt = savedDefinitionAt;
      this.noteAt = noteAt;
      this.refreshReadingGroups = refreshReadingGroups;
      this.scheduleIllustrationsForRange = scheduleIllustrationsForRange;
      this.updateBookPageStatus = updateBookPageStatus;
      this.scrollHandlers = new WeakMap();
      this.renderFrames = new WeakMap();

      // Stable incremental rendering: keep rendered content in the DOM and
      // append additional chunks near the end. This intentionally avoids
      // spacer-based viewport virtualization and DOM recycling.
      this.chunkWords = 800;
    }

    state() {
      const state = this.getState?.();
      if (!state) throw new Error('VirtualRenderer requires reader state.');
      return state;
    }

    createWordSpan(word, index, extraClass = '') {
      const state = this.state();
      const span = document.createElement('span');
      span.className = `reader-word ${extraClass}`.trim();
      span.dataset.index = String(index);
      if (this.savedDefinitionAt?.(index)) span.classList.add('saved-definition-word');
      if (this.noteAt?.(index)) span.classList.add('saved-note-word');
      this.setWordContent(span, word, index);
      span.tabIndex = state.language === 'en' ? -1 : 0;
      if (state.language !== 'en') {
        span.classList.add('translated-word');
        span.title = 'Click for English translation';
      }
      return span;
    }

    createSpacer(kind, wordCount) {
      const spacer = document.createElement('div');
      spacer.className = `virtual-reader-spacer virtual-reader-spacer-${kind}`;
      spacer.dataset.virtualSpacer = kind;
      spacer.setAttribute('aria-hidden', 'true');
      const height = Math.max(0, wordCount * this.averagePixelsPerWord);
      spacer.style.height = `${height}px`;
      return spacer;
    }

    buildGroupsForRange(mode, startWord, endWord) {
      const state = this.state();
      const fragment = document.createDocumentFragment();
      const sparseGroups = [];
      let actualStart = endWord;
      let actualEnd = startWord;

      for (let groupIndex = 0; groupIndex < state.readingGroups.length; groupIndex += 1) {
        const definition = state.readingGroups[groupIndex];
        if (definition.end <= startWord) continue;
        if (definition.start >= endWord) break;

        const visibleStart = Math.max(definition.start, startWord);
        const visibleEnd = Math.min(definition.end, endWord);
        if (visibleEnd <= visibleStart) continue;

        if (state.paragraphBreaks?.has(definition.start) && definition.start > 0) {
          const paragraphBreak = document.createElement('span');
          paragraphBreak.className = 'reader-paragraph-break';
          paragraphBreak.setAttribute('aria-hidden', 'true');
          fragment.appendChild(paragraphBreak);
        }

        const group = document.createElement('span');
        group.className = 'reader-group';
        group.dataset.startIndex = String(definition.start);
        group.dataset.endIndex = String(definition.end);
        group.dataset.visibleStartIndex = String(visibleStart);
        group.dataset.visibleEndIndex = String(visibleEnd);

        const structure = definition.structure || state.structureByStart.get(definition.start);
        if (structure) {
          group.classList.add('document-structure', `structure-${structure.type}`);
          group.dataset.structureType = structure.type;
          if (structure.type !== 'paragraph') {
            group.setAttribute('role', 'heading');
            const headingLevel = structure.type === 'part' ? '1' : structure.type === 'chapter' ? '2' : '3';
            group.setAttribute('aria-level', headingLevel);
          }
        }
        if (mode === 'marquee') group.classList.add('pending-group');

        for (let index = visibleStart; index < visibleEnd; index += 1) {
          const span = this.createWordSpan(state.words[index], index);
          span.appendChild(document.createTextNode(index < state.words.length - 1 ? ' ' : ''));
          group.appendChild(span);
        }

        fragment.appendChild(group);
        sparseGroups[groupIndex] = group;
        actualStart = Math.min(actualStart, visibleStart);
        actualEnd = Math.max(actualEnd, visibleEnd);
      }

      return { fragment, sparseGroups, actualStart, actualEnd };
    }

    alignRange(startWord, endWord) {
      const state = this.state();
      let start = Math.max(0, startWord);
      let end = Math.min(state.words.length, Math.max(start + 1, endWord));

      const startGroup = state.readingGroups.find((group) => group.start <= start && group.end > start);
      if (startGroup) start = startGroup.start;
      const endGroup = state.readingGroups.find((group) => group.start < end && group.end >= end);
      if (endGroup) end = endGroup.end;
      return { start, end };
    }

    renderVirtualRange(reader, mode, groupSize, requestedStart, requestedEnd, anchorIndex = null) {
      const state = this.state();
      const { start, end } = this.alignRange(requestedStart, requestedEnd);
      const oldAnchor = Number.isFinite(anchorIndex)
        ? anchorIndex
        : this.visibleReadingAnchor(reader, state.index);

      const { fragment, sparseGroups, actualStart, actualEnd } = this.buildGroupsForRange(mode, start, end);
      const topSpacer = this.createSpacer('top', actualStart);
      const bottomSpacer = this.createSpacer('bottom', Math.max(0, state.words.length - actualEnd));
      reader.replaceChildren(topSpacer, fragment, bottomSpacer);

      state.renderedWordStart = actualStart;
      state.renderedWordEnd = actualEnd;
      state.wordElements = Array.from(reader.querySelectorAll('.reader-word'));
      state.groupElements = sparseGroups;
      state.activeElements = [];
      state.virtualized = true;

      // Refine the spacer estimate from the real rendered window. This keeps
      // the scrollbar stable without materializing the whole document.
      const renderedWords = Math.max(1, actualEnd - actualStart);
      const contentHeight = Math.max(1, reader.scrollHeight - topSpacer.offsetHeight - bottomSpacer.offsetHeight);
      const measured = contentHeight / renderedWords;
      if (Number.isFinite(measured) && measured > 0.25 && measured < 20) {
        this.averagePixelsPerWord = (this.averagePixelsPerWord * 0.7) + (measured * 0.3);
        topSpacer.style.height = `${actualStart * this.averagePixelsPerWord}px`;
        bottomSpacer.style.height = `${Math.max(0, state.words.length - actualEnd) * this.averagePixelsPerWord}px`;
      }

      this.scheduleIllustrationsForRange?.(reader, actualStart, actualEnd, mode);
      this.restoreReadingAnchor(reader, mode, groupSize, oldAnchor, { allowRerender: false });
    }

    renderWindowAround(reader, mode, groupSize, wordIndex) {
      const state = this.state();
      const safeIndex = Math.max(0, Math.min(state.words.length - 1, Number(wordIndex) || 0));
      const half = Math.floor(this.windowWords / 2);
      let start = Math.max(0, safeIndex - half);
      let end = Math.min(state.words.length, start + this.windowWords);
      if (end - start < this.windowWords) start = Math.max(0, end - this.windowWords);
      this.renderVirtualRange(reader, mode, groupSize, start, end, safeIndex);
    }

    scheduleWindowShift(reader, mode, groupSize) {
      if (this.renderFrames.has(reader)) return;
      const frame = requestAnimationFrame(() => {
        this.renderFrames.delete(reader);
        const state = this.state();
        if (!state.virtualized || state.bookPages || mode === 'auto-scroll') return;

        const nearTop = reader.scrollTop < this.edgePixels && state.renderedWordStart > 0;
        const nearBottom = reader.scrollTop + reader.clientHeight > reader.scrollHeight - this.edgePixels
          && state.renderedWordEnd < state.words.length;
        if (!nearTop && !nearBottom) return;

        const anchor = this.visibleReadingAnchor(reader, state.index);
        const shiftedAnchor = nearBottom
          ? Math.min(state.words.length - 1, anchor + this.windowShiftWords)
          : Math.max(0, anchor - this.windowShiftWords);
        this.renderWindowAround(reader, mode, groupSize, shiftedAnchor);
      });
      this.renderFrames.set(reader, frame);
    }

    appendWordDocumentChunk(reader, mode, groupSize, targetWordEnd) {
      const state = this.state();
      const startWord = state.renderedWordEnd;
      const desiredEnd = Math.min(state.words.length, Math.max(startWord, targetWordEnd));
      if (desiredEnd <= startWord) return;

      const { fragment, sparseGroups, actualEnd } = this.buildGroupsForRange(mode, startWord, desiredEnd);
      reader.appendChild(fragment);
      state.renderedWordEnd = Math.max(startWord, actualEnd);
      state.wordElements = Array.from(reader.querySelectorAll('.reader-word'));
      for (let index = 0; index < sparseGroups.length; index += 1) {
        if (sparseGroups[index]) state.groupElements[index] = sparseGroups[index];
      }
      this.scheduleIllustrationsForRange?.(reader, startWord, actualEnd, mode);
    }

    ensureWordsRendered(reader, mode, groupSize, requiredWordEnd) {
      const state = this.state();
      if (requiredWordEnd <= state.renderedWordEnd) return;
      const target = Math.min(state.words.length, Math.max(requiredWordEnd, state.renderedWordEnd + this.chunkWords));
      this.appendWordDocumentChunk(reader, mode, groupSize, target);
    }

    renderWordDocument(reader, mode, groupSize = 1) {
      const state = this.state();
      const safeGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
      reader.replaceChildren();
      state.wordElements = [];
      state.groupElements = [];
      state.activeElements = [];
      state.renderedGroupSize = safeGroupSize;
      state.renderedWordStart = 0;
      state.renderedWordEnd = 0;
      state.virtualized = false;
      this.refreshReadingGroups(mode, safeGroupSize);

      this.ensureWordsRendered(
        reader,
        mode,
        safeGroupSize,
        Math.min(state.words.length, this.chunkWords)
      );

      if (state.bookPages) {
        reader.scrollLeft = 0;
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => this.updateBookPageStatus?.()));
      }

      const previousHandler = this.scrollHandlers.get(reader);
      if (previousHandler) reader.removeEventListener('scroll', previousHandler);
      const handler = () => {
        const nearEnd = state.bookPages
          ? reader.scrollLeft + reader.clientWidth >= reader.scrollWidth - Math.max(600, reader.clientWidth)
          : reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 600;
        if (nearEnd && state.renderedWordEnd < state.words.length) {
          this.ensureWordsRendered(reader, mode, safeGroupSize, state.renderedWordEnd + this.chunkWords);
        }
        if (state.bookPages) this.updateBookPageStatus?.();
      };
      this.scrollHandlers.set(reader, handler);
      reader.addEventListener('scroll', handler, { passive: true });
    }

    visibleReadingAnchor(reader, fallbackIndex = 0) {
      const state = this.state();
      if (!reader || !state.words.length) return Math.max(0, Number(fallbackIndex) || 0);

      const readerRect = reader.getBoundingClientRect();
      const words = reader.querySelectorAll('.reader-word[data-index]');
      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const word of words) {
        const rect = word.getBoundingClientRect();
        if (rect.bottom < readerRect.top || rect.top > readerRect.bottom) continue;
        const distance = Math.abs(rect.top - readerRect.top - 24);
        if (distance < nearestDistance) {
          nearest = word;
          nearestDistance = distance;
        }
      }

      const visibleIndex = Number(nearest?.dataset.index);
      if (Number.isFinite(visibleIndex)) return visibleIndex;
      return Math.max(0, Math.min(state.words.length - 1, Number(fallbackIndex) || 0));
    }

    restoreReadingAnchor(reader, mode, groupSize, wordIndex, { allowRerender = true } = {}) {
      const state = this.state();
      if (!reader || !state.words.length || ['flash', 'digital-sign'].includes(mode)) return;

      const safeIndex = Math.max(0, Math.min(state.words.length - 1, Number(wordIndex) || 0));
      if (mode !== 'two-column') {
        this.ensureWordsRendered(reader, mode, groupSize, safeIndex + 250);
      }

      const target = reader.querySelector(`.reader-word[data-index="${safeIndex}"]`)
        || reader.querySelector(`.reader-group[data-start-index="${safeIndex}"]`);
      if (!target) return;

      const readerRect = reader.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      reader.scrollTop = Math.max(0, reader.scrollTop + targetRect.top - readerRect.top - 24);
    }
  }

  namespace.VirtualRenderer = VirtualRenderer;
})(window);
