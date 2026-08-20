/* Mark, Set, Go! Workspace Reader handoff v0.11.0
   The main application owns the one real Reader. Workspace pages send fully
   prepared text/documents here rather than creating a Reader inside the frame.
*/
(() => {
  'use strict';

  if (window.parent !== window) return;

  window.MSGWorkspaceReaderHandoff = Object.freeze({
    openText(title, text, source = { type: 'text' }) {
      const readableText = String(text || '');
      if (!readableText.trim()) return false;

      if (typeof window.renderReaderWithText !== 'function') {
        console.warn('Main Reader renderer is not ready.');
        return false;
      }

      window.renderReaderWithText(
        String(title || 'Untitled'),
        readableText,
        source && typeof source === 'object' ? source : { type: 'text' }
      );
      return true;
    },

    openDocument(documentRecord) {
      const importer = window.MarkSetGoReadAnything?.openDocument;
      if (typeof importer !== 'function') {
        console.warn('Main Read Anything importer is not ready.');
        return false;
      }
      return importer(documentRecord);
    },

    playMusic(choiceOrParsed) {
      if (typeof window.playMusic !== 'function') {
        console.warn('Main music player is not ready.');
        return false;
      }
      window.playMusic(choiceOrParsed);
      return true;
    },

    playYouTubeSearch(query, title = 'YouTube search') {
      if (typeof window.playYouTubeSearch !== 'function') {
        console.warn('Main music search is not ready.');
        return false;
      }
      window.playYouTubeSearch(String(query || ''), String(title || 'YouTube search'));
      return true;
    }
  });
})();
