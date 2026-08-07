'use strict';

function renderHelp() {
  try {
    stopReader();
  } catch (error) {
    console.warn('Reader cleanup skipped while opening Help:', error);
  }
  app.dataset.viewKey='help';
  const sections=[
    ['start','Quick Start'],['mark','Ask Mark Reading Companion'],['notebook','Notebook'],
    ['reader','Reader & Position'],['fullscreen','Fullscreen'],['imports','PDF, EPUB & Text'],
    ['profiles','Reading Profiles'],['library','Library & Browse'],['shortcuts','Shortcuts'],
    ['storage','Storage & Privacy'],['about','About'],['troubleshooting','Troubleshooting']
  ];
  const helpTocHtml = sections
    .map(([id,label]) => `<a href="#help-${id}">${label}</a>`)
    .join('');
  app.innerHTML=`<section class="panel help-page">
    <div class="help-hero"><div><span class="help-eyebrow">Mark, Set, Go! Guide</span><h1>Help</h1><p>Current guidance for reading, selecting passages, asking Mark, saving insights, importing books, and protecting your place.</p><button class="primary help-walkthrough-launch" id="start-app-walkthrough" type="button"><span aria-hidden="true">▶</span> Start App Walkthrough</button></div>
    <label class="help-search"><span>Search Help</span><input id="help-search-input" type="search" placeholder="Try “Mark”, “notebook”, “PDF”, “fullscreen”…"></label></div>
    <div class="help-layout">
      <aside class="help-toc"><strong>On this page</strong>${helpTocHtml}</aside>
      <div class="help-content" id="help-content">
        <section class="help-section" id="help-start" data-help-section><h2>Quick Start</h2><ol class="help-steps">
          <li>Use <strong>Browse</strong> to search public libraries or <strong>Import Book</strong> for PDF, EPUB, or TXT.</li>
          <li>Open <strong>Reader Tools</strong> to choose a mode, speed, pointer, typography, Book Pages, and Focus Anchor.</li>
          <li>Press Start or Space to read. The app saves the canonical word so layout and navigation changes should not lose your place.</li>
          <li>Highlight any passage to pause reading and open the yellow text selection toolbar.</li>
          <li>Choose Explain, Summarize, Analyze, or open <strong>Ask Mark</strong> for additional help.</li>
        </ol></section>

        <section class="help-section" id="help-mark" data-help-section><h2>Ask Mark Reading Companion</h2>
          <p>Mark is the app’s contextual reading companion. Highlight any arbitrary text—even when paragraph formatting is poor. Reading pauses automatically, and selected text appears yellow with black characters.</p>
          <div class="help-card-grid"><article><h3>Selection</h3><p>Explain, summarize, analyze, simplify, translate, request context, find related ideas, or ask a custom question.</p></article><article><h3>Bounded context</h3><p>Mark receives the selected passage plus a limited surrounding window rather than the entire book.</p></article><article><h3>No automatic charge</h3><p>Highlighting alone does not call AI. A request occurs only after you choose an action.</p></article></div>
          <div class="help-tip"><strong>Optional paragraph shortcut:</strong> Alt + double-click a well-formatted paragraph. Ordinary drag selection remains the recommended method.</div>
        </section>

        <section class="help-section" id="help-notebook" data-help-section><h2>Notebook</h2>
          <p>The notebook now stores the complete selected passage, the full response from Ask Mark, key points, cautions, your own note, book title, chapter, date, and reading location.</p>
          <ul><li>Open a book’s notebook from the Ask Mark panel.</li><li>Open the global notebook from the top <strong>Mark</strong> menu.</li><li>Add or edit personal thoughts on any saved entry.</li><li>Use <strong>Save as text</strong> for one entry or export the entire notebook as a <code>.txt</code> file.</li><li>Use Return to passage when the original book is still stored locally.</li></ul>
        </section>

        <section class="help-section" id="help-reader" data-help-section><h2>Reader & Position</h2>
          <p>Reader position is based on the current word, not a fragile page number. Font changes, panel changes, fullscreen, Focus Anchor, reading modes, and page reflow should restore that word.</p>
          <p><strong>Reader Tools</strong> and <strong>Ask Mark</strong> are separate buttons. Reader Tools opens settings; Mark opens the current passage and notebook.</p>
        </section>

        <section class="help-section" id="help-fullscreen" data-help-section><h2>Fullscreen</h2>
          <p>Fullscreen has separate <strong>Options</strong> and <strong>Ask Mark</strong> controls. Opening one closes the other. Highlighting still pauses reading and the fullscreen Mark drawer shares the same notebook and history.</p>
          <p>Press <kbd>O</kbd> for Options and <kbd>M</kbd> for Ask Mark.</p>
        </section>

        <section class="help-section" id="help-imports" data-help-section><h2>PDF, EPUB & Text</h2>
          <ul><li><strong>EPUB:</strong> imports text, navigation, structure, and supported embedded images.</li><li><strong>PDF:</strong> extracts text locally with page markers. Password-protected PDFs are supported.</li><li><strong>Scanned PDF:</strong> image-only documents require OCR and are detected rather than opened as blank text.</li><li><strong>TXT:</strong> imports UTF-8 plain text.</li></ul>
        </section>

        <section class="help-section" id="help-profiles" data-help-section><h2>Reading Profiles</h2>
          <p>Profiles separate textual difficulty, interpretive difficulty, contextual knowledge, and literary structure. A book can therefore be accessible to read but challenging to interpret.</p>
          <p>Local linguistic measurements are available without AI. AI enhancement and Quick Book Guides run only when requested.</p>
        </section>

        <section class="help-section" id="help-library" data-help-section><h2>Library & Browse</h2>
          <p><strong>My Library</strong> contains saved books and reading activity. <strong>Browse</strong> searches connected public sources, Great Books, Bible Study, imports, and Mark.</p>
        </section>

        <section class="help-section" id="help-shortcuts" data-help-section><h2>Shortcuts</h2>
          <div class="help-shortcut-grid"><span><kbd>Space</kbd> Start or pause</span><span><kbd>O</kbd> Fullscreen Options</span><span><kbd>M</kbd> Fullscreen Ask Mark</span><span><kbd>Alt</kbd> + double-click Select paragraph</span></div>
        </section>

        <section class="help-section" id="help-storage" data-help-section><h2>Storage & Privacy</h2>
          <p>Books, reading position, notebook entries, history, and cached guides are primarily stored in the current browser. Export notebook text for an independent backup. Clearing site data can remove locally stored material.</p>
        </section>

        <section class="help-section" id="help-about" data-help-section><h2>About Mark, Set, Go!</h2>
          <p>Mark, Set, Go! is a reading and learning platform created by Brian Baker. It combines configurable reading tools, comprehension practice, reading analytics, public-domain library search, book imports, Reading Profiles, and Mark—the contextual reading companion.</p>
        </section>

        <section class="help-section" id="help-troubleshooting" data-help-section><h2>Troubleshooting</h2>
          <details><summary>A selection does not appear</summary><p>Ensure the selection begins and ends inside the Reader. Flash and Digital Sign modes may not expose continuous selectable text.</p></details>
          <details><summary>Mark does not answer</summary><p>Confirm the server has an OPENAI_API_KEY and that the request limit has not been reached.</p></details>
          <details><summary>A book loses its place</summary><p>Pause, return to the exact word, and refresh once. Report which control caused the movement so that transition can be corrected.</p></details>
          <details><summary>A PDF has no readable text</summary><p>It may be scanned or image-only. OCR is not yet included.</p></details>
        </section>
      </div>
    </div>
  </section>`;

  const search=app.querySelector('#help-search-input');
  search?.addEventListener('input',()=>{
    const query=search.value.trim().toLowerCase();
    app.querySelectorAll('[data-help-section]').forEach(section=>section.hidden=Boolean(query&&!section.textContent.toLowerCase().includes(query)));
  });
  app.querySelector('#start-app-walkthrough')?.addEventListener('click',()=>window.MarkSetGoWalkthrough?.start?.());
}

window.MarkSetGoModules = window.MarkSetGoModules || {};
window.MarkSetGoModules["help-page"] = {
  loaded: true,
  version: '7.2.0'
};
