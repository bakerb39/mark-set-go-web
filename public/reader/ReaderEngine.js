'use strict';

(function registerReaderEngine(global) {
  const namespace = global.MarkSetGoReader = global.MarkSetGoReader || {};

  class ReaderEngine {
    constructor(initialState = {}) {
      this.book = null;
      this.state = Object.assign({
        words: [], originalText: '', currentText: '', title: '', language: 'en', index: 0,
        interval: null, runToken: 0, nextTickAt: 0, wordElements: [], activeElements: [], groupElements: [],
        renderedGroupSize: 1, wpm: 300, renderedMode: null, translationCache: new Map(), renderedWordStart: 0, renderedWordEnd: 0, virtualized: false,
        tickerAnimation: null, tickerPaused: false, tickerStatusTimer: null, tickerStartIndex: 0,
        tickerWordCount: 0, tickerFrame: null, tickerLastAt: 0, tickerOffset: 0, tickerNextWordIndex: 0,
        tickerLoadedWords: 0, bionic: false, meaningfulChunks: false, focusAnchor: false, bookPages: false, illustrationMode: 'off',
        illustrationCache: new Map(), illustrationAnchors: new Set(), illustrationHidden: new Set(),
        uploadedIllustrations: [], readingGroups: [], groupIndexByStart: new Map(), renderedMeaningfulChunks: false,
        autoScrollLastAt: 0, autoScrollCarry: 0, toc: [], structure: [], structureByStart: new Map(), source: null,
        documentId: null, dictionaryCache: new Map(), contextWord: null, activeNoteId: null, sessionActive: false,
        sessionStartedAt: 0, sessionStartIndex: 0, returnIndex: 0, returnMode: 'highlight',
        returnWasRunning: false, spacebarHandler: null
      }, initialState);
    }

    loadBook(model, { documentId = null, structure = [], toc = [] } = {}) {
      if (!model) throw new Error('A BookModel is required.');
      this.book = model;
      Object.assign(this.state, {
        originalText: model.originalText,
        currentText: model.currentText,
        title: model.title,
        language: model.language,
        source: model.source,
        words: model.words,
        index: 0,
        renderedMode: null,
        renderedWordStart: 0,
        renderedWordEnd: 0,
        virtualized: false,
        documentId,
        structure,
        structureByStart: new Map(structure.map((entry) => [entry.start, entry])),
        toc
      });
      this.clearDocumentCaches();
      return this.state;
    }

    clearDocumentCaches() {
      this.state.translationCache.clear();
      this.state.illustrationCache.clear();
      this.state.illustrationAnchors.clear();
      this.state.illustrationHidden.clear();
      this.state.wordElements = [];
      this.state.activeElements = [];
      this.state.groupElements = [];
      this.state.readingGroups = [];
      this.state.groupIndexByStart = new Map();
    }

    setPosition(index) {
      const max = Math.max(0, this.state.words.length - 1);
      this.state.index = Math.max(0, Math.min(Number(index) || 0, max));
      return this.state.index;
    }

    snapshot({ controls = {}, wasRunning = false } = {}) {
      if (!this.state.title || !this.state.currentText || !this.state.words.length) return null;
      return {
        version: 3,
        savedAt: new Date().toISOString(),
        title: this.state.title,
        currentText: this.state.currentText,
        originalText: this.state.originalText,
        source: this.state.source,
        language: this.state.language,
        index: this.state.index,
        wasRunning,
        controls
      };
    }
  }

  namespace.ReaderEngine = ReaderEngine;
})(window);
