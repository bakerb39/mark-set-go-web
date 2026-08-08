'use strict';

function renderHelp() {
  try { stopReader(); } catch (error) { console.warn('Reader cleanup skipped while opening Help:', error); }
  app.dataset.viewKey='help';

  const sections=[
    ['start','Quick Start'],
    ['walkthrough','Walkthroughs'],
    ['library','My Library & Browse'],
    ['reader','Reader Basics'],
    ['controls','Reading & Display Controls'],
    ['position','Position, Scrubbing & Book Pages'],
    ['selection','Highlighting & Selection Actions'],
    ['words','Word Tools, Bookmarks & Definitions'],
    ['mark','Ask Mark Reading Companion'],
    ['mark-more','Ask Mark + Study Tools'],
    ['format','Formatting & Text Cleanup'],
    ['notebook','My Notebook & Saved Insights'],
    ['learn','Learn & Reading Skills'],
    ['goals','Goals, Progress & Action Center'],
    ['music','Music & Focus'],
    ['imports','Importing EPUB, Kindle, PDF, TXT & URLs'],
    ['guides','Modern Guides'],
    ['fullscreen','Fullscreen'],
    ['profile','Profile & Experience Presets'],
    ['shortcuts','Shortcuts'],
    ['storage','Storage, Sync & Privacy'],
    ['troubleshooting','Troubleshooting']
  ];

  const toc=sections.map(([id,label])=>`<a href="#help-${id}">${label}</a>`).join('');

  app.innerHTML=`<section class="panel help-page">
    <div class="help-hero">
      <div>
        <span class="help-eyebrow">Mark, Set, Go! Guide</span>
        <h1>Help</h1>
        <p>A complete guide to the current reading, learning, library, Ask Mark, and productivity experience.</p>
        <div class="help-walkthrough-actions">
          <button class="secondary help-walkthrough-launch" id="start-simple-walkthrough" type="button"><span aria-hidden="true">▶</span> Simple Overview</button>
          <button class="primary help-walkthrough-launch" id="start-full-walkthrough" type="button"><span aria-hidden="true">▶</span> Full Experience</button>
        </div>
      </div>
      <label class="help-search"><span>Search Help</span><input id="help-search-input" type="search" placeholder="Try “highlight”, “flash cards”, “scrub”, “bookmark”, “PDF”…"></label>
    </div>

    <div class="help-layout">
      <aside class="help-toc"><strong>On this page</strong>${toc}</aside>
      <div class="help-content" id="help-content">

        <section class="help-section" id="help-start" data-help-section>
          <h2>Quick Start</h2>
          <ol class="help-steps">
            <li>Open <strong>My Library</strong> to continue a saved book, browse for something new, or choose <strong>Read Anything</strong>.</li>
            <li>In the Reader, open <strong>Reading</strong> to choose a mode, WPM, words shown, and meaningful chunks.</li>
            <li>Open <strong>Display</strong> for typography, theme, bionic text, Focus Anchor, Book Pages, and illustrations.</li>
            <li>Press <strong>Start</strong> or <kbd>Space</kbd>. Click a word to move the reading position; click blank Reader space or press Space to pause/resume.</li>
            <li>Highlight text for instant passage actions, or open <strong>Ask Mark</strong> for conversation and study tools.</li>
          </ol>
        </section>

        <section class="help-section" id="help-walkthrough" data-help-section>
          <h2>Walkthroughs</h2>
          <div class="help-card-grid">
            <article><h3>Simple Overview</h3><p>A shorter orientation to the core navigation, Reader, highlighting, Ask Mark, and the most important controls.</p><button class="secondary" type="button" data-help-tour="simple">Start Simple Overview</button></article>
            <article><h3>Full Experience</h3><p>A detailed guided tour of menus, nested collections, Reader settings, selection workflows, Ask Mark’s + menu, learning tools, goals, and advanced features.</p><button class="primary" type="button" data-help-tour="full">Start Full Experience</button></article>
          </div>
        </section>

        <section class="help-section" id="help-library" data-help-section>
          <h2>My Library & Browse</h2>
          <p><strong>My Library</strong> is the main home for your reading life.</p>
          <ul>
            <li><strong>Library Home:</strong> continue reading and manage saved books.</li>
            <li><strong>My Reading:</strong> active reading list, statuses, saved editions, and direct intake actions.</li>
            <li><strong>Browse:</strong> Browse Home, Great Books, Bible Study, and Read Anything.</li>
            <li><strong>Collections:</strong> Bookmarks, Book Notes, Random Notes, Definitions, and My Links.</li>
            <li><strong>Progress & Awards:</strong> reading and learning metrics, goals, streaks, and achievements.</li>
            <li><strong>Action Center:</strong> convert reading insights into actions, reminders, or scheduled follow-up.</li>
          </ul>
        </section>

        <section class="help-section" id="help-reader" data-help-section>
          <h2>Reader Basics</h2>
          <p>The Reader tracks a <strong>canonical word position</strong>, rather than relying only on visual pages. Changes in font, panels, display mode, fullscreen, or Book Pages should preserve that reading position.</p>
          <div class="help-card-grid">
            <article><h3>Start / Pause</h3><p>Use Start and Pause, press Space, or click blank Reader space to pause or resume.</p></article>
            <article><h3>Move directly</h3><p>Click a word to move the Reader to that location and continue from there.</p></article>
            <article><h3>Side panes</h3><p>Marks & Contents opens the left navigation pane. Ask Mark opens the companion pane without replacing the Reader.</p></article>
          </div>
        </section>

        <section class="help-section" id="help-controls" data-help-section>
          <h2>Reading & Display Controls</h2>
          <h3>Reading</h3>
          <ul>
            <li><strong>Mode:</strong> Highlight, Bold Focus, Smooth Glide, Pointing Guide, Marquee, Flash, Digital Sign, Auto Scroll, or Pac-Man Chomp.</li>
            <li><strong>Pointer style:</strong> Hand, underline, caret, reading bar, or Mark pointing.</li>
            <li><strong>Speed:</strong> set words per minute.</li>
            <li><strong>Words shown:</strong> control how many words are emphasized at a time.</li>
            <li><strong>Meaningful chunks:</strong> group words around punctuation and phrase boundaries.</li>
          </ul>
          <h3>Display</h3>
          <ul>
            <li>Font family and text size.</li>
            <li>Reader theme.</li>
            <li>Bionic text.</li>
            <li>Center Focus Anchor overlay, anchor size/color, and bold anchor letter.</li>
            <li>Book Pages.</li>
            <li>Illustration display controls.</li>
          </ul>
          <p>The supplemental <strong>Media</strong> and <strong>Translation & Word Tools</strong> sections use the same Reader Tools panel and can stay collapsed until needed.</p>
        </section>

        <section class="help-section" id="help-position" data-help-section>
          <h2>Position, Scrubbing & Book Pages</h2>
          <p>You do not need to replay the entire book to move around. Clicking a word changes the canonical reading position immediately. Contents entries and bookmarks also jump directly to their saved position.</p>
          <ul>
            <li>In continuous Reader layouts, scroll normally and click where you want to continue.</li>
            <li>In Book Pages, use page navigation or enter a page directly when available.</li>
            <li>Changing layout should preserve the current word even when the visible page number changes.</li>
            <li>Focus Anchor may be moved over text without changing the canonical reading position.</li>
          </ul>
        </section>

        <section class="help-section" id="help-selection" data-help-section>
          <h2>Highlighting & Selection Actions</h2>
          <p>Drag across text in the Reader to create a passage selection. Reading pauses, the passage remains visibly highlighted, and the selection toolbar appears.</p>
          <div class="help-card-grid">
            <article><h3>Explain</h3><p>Ask for a direct explanation of the selected passage.</p></article>
            <article><h3>Summarize</h3><p>Condense the selected passage while preserving its main point.</p></article>
            <article><h3>Simplify</h3><p>Rewrite the idea at a simpler reading level.</p></article>
            <article><h3>Context</h3><p>Add historical, conceptual, or surrounding context.</p></article>
            <article><h3>Compare</h3><p>Connect the selected idea with related ideas or texts.</p></article>
            <article><h3>Save</h3><p>Save the passage or insight for later review.</p></article>
            <article><h3>Ask Mark</h3><p>Open the full Ask Mark conversation with that selection already attached.</p></article>
          </div>
          <div class="help-tip"><strong>Paragraph shortcut:</strong> Alt + double-click can select a well-formed paragraph. Normal drag-selection is still the most flexible method.</div>
        </section>

        <section class="help-section" id="help-words" data-help-section>
          <h2>Word Tools, Bookmarks & Definitions</h2>
          <p>Right-click a Reader word to open its contextual actions:</p>
          <ul>
            <li><strong>Look up word</strong> — retrieve a definition.</li>
            <li><strong>Save definition</strong> — add it to Definitions.</li>
            <li><strong>Add note</strong> — attach a note to the reading location.</li>
            <li><strong>Add bookmark</strong> — save the position and show the bookmark marker.</li>
          </ul>
          <p>Saved bookmarks are also available from <strong>Marks & Contents</strong> and the Library’s Collections area.</p>
        </section>

        <section class="help-section" id="help-mark" data-help-section>
          <h2>Ask Mark Reading Companion</h2>
          <p>Ask Mark is designed to remain beside the Reader. He can work with a highlighted passage or answer a custom question while keeping the current reading context.</p>
          <ul>
            <li>Highlighting itself does <strong>not</strong> call AI. A request is made only when you choose an action or submit a question.</li>
            <li>Mark receives bounded reading context rather than automatically sending an entire large book.</li>
            <li>Guide sections can use <strong>Discuss with Mark</strong> to pass the entire current guide section into the same Ask Mark conversation.</li>
            <li>Save useful responses to My Notebook for later retrieval.</li>
          </ul>
        </section>

        <section class="help-section" id="help-mark-more" data-help-section>
          <h2>Ask Mark + Study Tools</h2>
          <p>Use the <strong>+</strong> button beside the Ask Mark input to open additional study actions.</p>
          <div class="help-card-grid">
            <article><h3>Study guide</h3><p>Create a structured review of the current passage or reading.</p></article>
            <article><h3>Flash cards</h3><p>Generate visual cards that can be flipped between retrieval prompts and answers.</p></article>
            <article><h3>Historical context</h3><p>Ask for background needed to understand the reading in its setting.</p></article>
            <article><h3>Key ideas</h3><p>Identify the most important arguments, concepts, or relationships.</p></article>
            <article><h3>Memory tools</h3><p>Create practical recall anchors with an explanation of why each anchor maps to the reading and a self-test prompt.</p></article>
            <article><h3>Comprehension</h3><p>Generate a quiz based on the current reading and score your understanding.</p></article>
          </div>
        </section>

        <section class="help-section" id="help-format" data-help-section>
          <h2>Formatting & Text Cleanup</h2>
          <p>The Format view cleans difficult imported text without requiring you to rewrite the source manually.</p>
          <ul>
            <li><strong>Clean spacing</strong> repairs spacing and OCR-like artifacts.</li>
            <li><strong>Paragraphs</strong> improves readable paragraph structure.</li>
            <li><strong>Sections</strong> detects and separates document structure such as chapter/section headings and compressed tables of contents.</li>
            <li><strong>Format all</strong> applies the selected cleanup across the active document.</li>
            <li><strong>Original</strong> restores the preserved original text.</li>
          </ul>
        </section>

        <section class="help-section" id="help-notebook" data-help-section>
          <h2>My Notebook & Saved Insights</h2>
          <p>My Notebook stores selected passages, Ask Mark responses, key points, cautions, personal notes, book context, dates, and reading locations.</p>
          <ul>
            <li>Use <strong>Save to Notebook</strong> from Ask Mark responses.</li>
            <li>Open My Notebook from the top navigation.</li>
            <li>Return to the source passage when that document is still available.</li>
            <li>Export notebook text for an independent backup when available.</li>
          </ul>
        </section>

        <section class="help-section" id="help-learn" data-help-section>
          <h2>Learn & Reading Skills</h2>
          <p>The Learn area separates skill-building from the Reader while keeping it connected to your books.</p>
          <ul>
            <li><strong>WPM Test:</strong> measure natural reading speed.</li>
            <li><strong>Comprehension Quizzes:</strong> quiz yourself on current and past books.</li>
            <li><strong>Great Ideas / Syntopicon:</strong> compare important ideas across works.</li>
            <li><strong>Mnemonics:</strong> create memory aids tied to books you are reading.</li>
            <li><strong>Language Learning:</strong> practice a language using reading-based material.</li>
            <li><strong>Courses & Learning Modules:</strong> discover relevant external learning resources.</li>
          </ul>
        </section>

        <section class="help-section" id="help-goals" data-help-section>
          <h2>Goals, Progress & Action Center</h2>
          <ul>
            <li><strong>Reading Goals:</strong> set targets such as deadlines, WPM, comprehension, or reading volume.</li>
            <li><strong>Progress & Awards:</strong> track words, time, pace, comprehension, learning activity, streaks, and detailed learning metrics.</li>
            <li><strong>Action Center:</strong> turn reading insights into follow-up actions and reminders.</li>
            <li><strong>Mark coaching:</strong> Mark can use enabled goal/learning information for encouragement and next-step suggestions.</li>
          </ul>
        </section>

        <section class="help-section" id="help-music" data-help-section>
          <h2>Music & Focus</h2>
          <p>Use Music & Focus for embedded listening, reading moods, and focus support. Reader-level Media controls can also be used without leaving the current book.</p>
        </section>

        <section class="help-section" id="help-imports" data-help-section>
          <h2>Importing EPUB, Kindle, PDF, TXT & URLs</h2>
          <ul>
            <li><strong>EPUB:</strong> import book text, structure, navigation, and supported embedded images.</li>
            <li><strong>MOBI / AZW / AZW3:</strong> import DRM-free Kindle-format eBooks you are legally able to use. The file is parsed locally; DRM/encrypted books are rejected rather than decrypted. KFX is not supported.</li>
            <li><strong>PDF:</strong> extract readable text and page markers. Image-only/scanned PDFs require OCR.</li>
            <li><strong>TXT:</strong> import plain text.</li>
            <li><strong>URL:</strong> bring supported web articles or pages into the reading workflow.</li>
            <li><strong>Create Book / Guide:</strong> build a structured reading document or an original educational guide from supplied material.</li>
          </ul>
        </section>

        <section class="help-section" id="help-guides" data-help-section>
          <h2>Modern Guides</h2>
          <p>Modern Guides are independent educational guides rather than reproductions of copyrighted books. They behave like normal books in My Library and can include interactive reading actions.</p>
          <ul>
            <li><strong>Discuss with Mark:</strong> highlights the entire guide section and opens the existing Ask Mark conversation.</li>
            <li><strong>Quiz:</strong> launches the existing comprehension workflow.</li>
            <li><strong>Action:</strong> adds a reading-driven action to Action Center.</li>
            <li><strong>Great Ideas:</strong> connects the guide to Syntopicon study.</li>
            <li><strong>Buy original:</strong> provides a route to the original book when applicable.</li>
          </ul>
        </section>

        <section class="help-section" id="help-fullscreen" data-help-section>
          <h2>Fullscreen</h2>
          <p>Fullscreen enlarges the reading surface while preserving Reader controls and Ask Mark access.</p>
          <ul>
            <li><kbd>O</kbd> opens fullscreen Options.</li>
            <li><kbd>M</kbd> opens fullscreen Ask Mark.</li>
            <li>The fullscreen X returns to the regular Reader.</li>
            <li>Selections and notebook/history remain shared with the normal Reader.</li>
          </ul>
        </section>

        <section class="help-section" id="help-profile" data-help-section>
          <h2>Profile & Experience Presets</h2>
          <p>Profile → Customize My Experience lets you simplify the interface without deleting data.</p>
          <ul>
            <li><strong>Simple Reader:</strong> focused reading experience with Music & Focus.</li>
            <li><strong>Reading Improvement:</strong> reading skills, progress, goals, and coaching.</li>
            <li><strong>Student / Scholar:</strong> deeper learning, languages, Great Ideas, courses, and study tools.</li>
            <li><strong>Full Experience:</strong> exposes the complete feature set.</li>
          </ul>
          <p>Individual feature groups can also be toggled. Hidden features keep their saved data.</p>
        </section>

        <section class="help-section" id="help-shortcuts" data-help-section>
          <h2>Shortcuts</h2>
          <div class="help-shortcut-grid">
            <span><kbd>Space</kbd> Start / pause</span>
            <span><kbd>O</kbd> Fullscreen Options</span>
            <span><kbd>M</kbd> Fullscreen Ask Mark</span>
            <span><kbd>Alt</kbd> + double-click Select paragraph</span>
            <span><strong>Click a word</strong> Move reading position</span>
            <span><strong>Click blank Reader space</strong> Pause / resume</span>
            <span><strong>Right-click word</strong> Word tools</span>
          </div>
        </section>

        <section class="help-section" id="help-storage" data-help-section>
          <h2>Storage, Sync & Privacy</h2>
          <p>Reading state may combine cloud account data and browser-local state depending on the feature. Large imported documents and some cached guide content can still depend on browser storage.</p>
          <ul>
            <li>Do not assume clearing browser/site storage is harmless.</li>
            <li>Cloud-synced library items should remain associated with the signed-in account when cloud sync succeeds.</li>
            <li>Notebook saves verify persistence before showing a successful Saved state.</li>
            <li>Highlighting alone does not send an AI request.</li>
          </ul>
        </section>

        <section class="help-section" id="help-troubleshooting" data-help-section>
          <h2>Troubleshooting</h2>
          <details><summary>A selection does not appear</summary><p>Make sure the selection begins and ends inside selectable Reader text. Flash/Digital Sign style modes may not expose continuous text in the same way as the normal Reader.</p></details>
          <details><summary>Ask Mark does not open with a guide section</summary><p>Reload the guide and try Discuss with Mark again. The guide should highlight the complete section and pass its exact Reader range into Ask Mark.</p></details>
          <details><summary>Save to Notebook does not save</summary><p>The button should only report Saved after persistence is verified. If it reports failure, browser storage may be full or unavailable.</p></details>
          <details><summary>Mnemonics or Language Learning returns 404</summary><p>Confirm the deployed server includes the matching API routes and that the server was redeployed with the frontend.</p></details>
          <details><summary>A book loses its place</summary><p>Return to the exact word, pause, and refresh once. Note which transition caused movement so the canonical-position handoff can be checked.</p></details>
          <details><summary>A PDF has no readable text</summary><p>The PDF may be scanned/image-only and require OCR.</p></details>
          <details><summary>The walkthrough highlights the wrong menu item</summary><p>Exit and restart the walkthrough after a hard refresh. The current walkthrough opens and mirrors nested menus before placing the spotlight.</p></details>
        </section>

      </div>
    </div>
  </section>`;

  const search=app.querySelector('#help-search-input');
  search?.addEventListener('input',()=>{
    const query=search.value.trim().toLowerCase();
    app.querySelectorAll('[data-help-section]').forEach(section=>{
      section.hidden=Boolean(query&&!section.textContent.toLowerCase().includes(query));
    });
  });

  app.querySelector('#start-simple-walkthrough')?.addEventListener('click',()=>window.MarkSetGoWalkthrough?.startSimple?.());
  app.querySelector('#start-full-walkthrough')?.addEventListener('click',()=>window.MarkSetGoWalkthrough?.startFull?.());
  app.querySelectorAll('[data-help-tour]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.helpTour==='simple') window.MarkSetGoWalkthrough?.startSimple?.();
    else window.MarkSetGoWalkthrough?.startFull?.();
  }));
}

window.MarkSetGoModules = window.MarkSetGoModules || {};
window.MarkSetGoModules["help-page"] = {
  loaded: true,
  version: '9.3.0'
};
