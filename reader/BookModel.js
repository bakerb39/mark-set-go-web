'use strict';

(function registerBookModel(global) {
  const namespace = global.MarkSetGoReader = global.MarkSetGoReader || {};

  class BookModel {
    constructor({ title = '', text = '', source = null, tokenizer } = {}) {
      this.title = String(title || '');
      this.originalText = String(text || '');
      this.currentText = this.originalText;
      this.source = source || { type: 'text' };
      this.language = 'en';
      this.words = (tokenizer || BookModel.tokenize)(this.currentText);
      this.createdAt = Date.now();
    }

    static tokenize(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    }

    get wordCount() {
      return this.words.length;
    }

    wordAt(index) {
      return this.words[Math.max(0, Math.min(Number(index) || 0, this.words.length - 1))] || '';
    }
  }

  namespace.BookModel = BookModel;
})(window);
