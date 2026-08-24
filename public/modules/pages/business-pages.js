'use strict';

function renderAbout() {
  stopReader();
  app.dataset.viewKey='about';
  app.innerHTML = `
    <section class="platform-page business-page">
      <header class="platform-hero business-hero">
        <div>
          <div class="b2curious-about-brand" style="margin:0 0 18px;">
            <img
              src="/assets/b2curious-logo.png?v=1.0.0"
              alt="B2 Curious, LLC"
              style="display:block;width:min(100%,420px);height:auto;max-height:150px;object-fit:contain;object-position:left center;background:#fff;border-radius:12px;padding:10px 14px;box-sizing:border-box;"
            >
          </div>
          <span class="source-category">About Mark, Set, Go! · B2 Curious, LLC</span>
          <h1>Read more. Understand more. Remember more.</h1>
          <p>Mark, Set, Go! is an independent reading and lifelong-learning platform from B2 Curious, LLC, created by Brian Baker.</p>
        </div>
        <div class="business-hero-actions">
          <a class="primary button-link" href="mailto:bakerb39@live.com?subject=Mark%2C%20Set%2C%20Go!%20Inquiry">Contact Brian</a>
          <button class="secondary" type="button" data-action="home">Return Home</button>
        </div>
      </header>

      <div class="business-content-grid">
        <article class="business-card business-card-wide">
          <h2>Project history</h2>
          <p>Created by Brian Baker for a Harvard CS50 final project.</p>
          <p>This browser edition was converted from the original Python and guizero desktop application and has grown into a broader platform for reading acceleration, comprehension, reflection, and personal growth.</p>
        </article>

        <article class="business-card">
          <h2>Mission</h2>
          <p>Help people transform books into understanding, understanding into wisdom, and wisdom into action.</p>
        </article>

        <article class="business-card">
          <h2>Product vision</h2>
          <p>Build a lifelong learning platform centered on reading—one that helps readers read efficiently, understand deeply, remember what matters, connect ideas across books, and apply knowledge in daily life.</p>
        </article>

        <article class="business-card">
          <h2>Independent software</h2>
          <p>Mark, Set, Go! is independently designed and developed. It is not affiliated with Amazon Kindle, Apple Books, Kobo, Project Gutenberg, OpenAI, Harvard University, or any other third-party library, publisher, university, or technology provider unless explicitly stated.</p>
        </article>

        <article class="business-card">
          <h2>Contact</h2>
          <p>All product, business, support, partnership, media, and general inquiries should be directed to:</p>
          <address>
            <strong>Brian Baker</strong><br>
            <a href="mailto:bakerb39@live.com">bakerb39@live.com</a>
          </address>
        </article>
      </div>

      <section class="business-link-panel">
        <h2>Business information</h2>
        <div>
          <button type="button" data-action="contact">Contact & Support</button>
          <button type="button" data-action="privacy">Privacy Notice</button>
          <button type="button" data-action="terms">Terms of Use</button>
          <button type="button" data-action="help">Help Center</button>
        </div>
      </section>

      <p class="business-copyright">© 2026 Brian Baker. All rights reserved.</p>
    </section>`;
}

function renderContact() {
  stopReader();
  app.dataset.viewKey='contact';
  app.innerHTML=`
    <section class="platform-page business-page">
      <header class="platform-hero">
        <div><span class="source-category">Contact & Support</span><h1>Contact Brian Baker</h1><p>Questions, feedback, support requests, partnerships, media inquiries, and other business correspondence are welcome.</p></div>
      </header>
      <div class="business-content-grid">
        <article class="business-card business-card-wide contact-card">
          <h2>Primary contact</h2>
          <address><strong>Brian Baker</strong><br><a href="mailto:bakerb39@live.com">bakerb39@live.com</a></address>
          <a class="primary button-link" href="mailto:bakerb39@live.com?subject=Mark%2C%20Set%2C%20Go!%20Inquiry">Send an Email</a>
        </article>
        <article class="business-card"><h2>Support requests</h2><p>Please include the app version, browser, device, steps taken, and any console error shown. Do not send passwords, API keys, payment information, or sensitive personal data.</p></article>
        <article class="business-card"><h2>Response expectations</h2><p>Messages are reviewed as availability permits. This independent project does not currently provide guaranteed response times or emergency support.</p></article>
      </div>
      <p class="business-copyright">© 2026 Brian Baker. All rights reserved.</p>
    </section>`;
}

function renderPrivacy() {
  stopReader();
  app.dataset.viewKey='privacy';
  app.innerHTML=`
    <section class="platform-page business-page legal-page">
      <header class="platform-hero"><div><span class="source-category">Privacy Notice</span><h1>Privacy</h1><p>Effective August 1, 2026</p></div></header>
      <article class="legal-document">
        <h2>Overview</h2><p>Mark, Set, Go! is designed to keep much of your reading activity in your browser. Books, reading position, notebook entries, preferences, cached guides, and progress information may be stored locally on your device.</p>
        <h2>Information you choose to provide</h2><p>When you contact Brian Baker, your email provider transmits the information included in your message. Do not send passwords, API keys, payment-card information, health information, or other highly sensitive data.</p>
        <h2>AI and external services</h2><p>Features such as Ask Mark, translation, library search, media, and AI-enhanced analysis may send the text or query you explicitly submit to configured third-party services. Highlighting text alone does not submit an AI request.</p>
        <h2>Local storage</h2><p>Clearing browser or site data may remove locally stored books, notes, history, preferences, and reading progress. Export important notebook entries and retain your own backups.</p>
        <h2>Third-party content</h2><p>Public-domain books, embedded media, search results, and external links may be governed by the privacy practices of their respective providers.</p>
        <h2>Contact</h2><p>Privacy questions may be sent to <a href="mailto:bakerb39@live.com?subject=Mark%2C%20Set%2C%20Go!%20Privacy%20Inquiry">bakerb39@live.com</a>.</p>
        <p class="legal-note">This notice describes the current browser edition and may be updated as hosting, accounts, payments, synchronization, or other services are introduced.</p>
      </article>
    </section>`;
}

function renderTerms() {
  stopReader();
  app.dataset.viewKey='terms';
  app.innerHTML=`
    <section class="platform-page business-page legal-page">
      <header class="platform-hero"><div><span class="source-category">Terms of Use</span><h1>Terms</h1><p>Effective August 1, 2026</p></div></header>
      <article class="legal-document">
        <h2>Purpose</h2><p>Mark, Set, Go! is provided as an independent reading, learning, and productivity application. Use the service only for lawful purposes and only with content you are authorized to access or import.</p>
        <h2>No professional advice</h2><p>Reading guides, summaries, translations, AI responses, difficulty profiles, Bible-study tools, and educational recommendations are informational and may contain errors. They are not legal, medical, financial, theological, academic, or other professional advice.</p>
        <h2>AI-generated material</h2><p>AI output should be reviewed against the original text and reliable sources. Do not rely on generated summaries or explanations as a substitute for reading the work or consulting qualified professionals.</p>
        <h2>Content rights</h2><p>You retain responsibility for material you import. Public-domain and third-party materials remain subject to applicable rights, licenses, provider terms, and attribution requirements. The Mark, Set, Go! interface, original code, branding, and original written material are protected by applicable law.</p>
        <h2>Availability</h2><p>The application may change, experience interruptions, or contain defects. Features may be modified or discontinued. No warranty of uninterrupted availability, accuracy, fitness for a particular purpose, or data preservation is provided.</p>
        <h2>Acceptable use</h2><p>Do not misuse the application, interfere with its operation, evade usage limits, access another person’s data, distribute malicious code, or use the service to violate law or third-party rights.</p>
        <h2>Contact</h2><p>Questions about these terms may be sent to <a href="mailto:bakerb39@live.com?subject=Mark%2C%20Set%2C%20Go!%20Terms%20Inquiry">bakerb39@live.com</a>.</p>
        <p class="legal-note">These preliminary terms should be reviewed by qualified legal counsel before commercial launch, subscriptions, payment collection, or broad public distribution.</p>
      </article>
    </section>`;
}

window.MarkSetGoModules = window.MarkSetGoModules || {};
window.MarkSetGoModules["business-pages"] = {
  loaded: true,
  version: '7.2.1-b2curious-about'
};
