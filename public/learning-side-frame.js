(() => {
  'use strict';
  if (window.MSGReadingSideFrame) return;

  const state = {
    mode: '',
    frame: null,
    body: null,
    desktopContent: null,
    fallbackHost: null,
    askShell: null,
    askParent: null,
    askNext: null
  };

  const $ = (s, r=document) => r.querySelector(s);

  function currentReaderDesktopContent() {
    const readerWindow =
      $('.msg-desktop-window.msg-desktop-reader-one-window') ||
      $('.msg-desktop-window[data-msg-desktop-window-key="reader:1"]');

    return readerWindow?.querySelector(':scope > .msg-desktop-window-content') || null;
  }

  function currentReaderPrimary(content) {
    return content?.querySelector(':scope > .msg-workspace-primary') ||
      content?.querySelector('.msg-workspace-primary') || null;
  }

  function ensureFrame() {
    let frame = $('#msg-learning-side-frame');
    if (!frame) {
      frame = document.createElement('aside');
      frame.id = 'msg-learning-side-frame';
      frame.className = 'msg-learning-side-frame';
      frame.hidden = true;
      frame.innerHTML = `
        <header class="msg-learning-frame-head">
          <div class="msg-learning-frame-title">
            <span aria-hidden="true">◈</span>
            <strong data-learning-frame-title>Learning</strong>
          </div>
          <button type="button" data-learning-frame-close aria-label="Close side frame" title="Close">×</button>
        </header>
        <div class="msg-learning-frame-body" data-learning-frame-body></div>
      `;
      frame.querySelector('[data-learning-frame-close]')?.addEventListener('click', close);
    }

    const desktopContent = currentReaderDesktopContent();
    if (desktopContent) {
      if (frame.parentElement !== desktopContent) desktopContent.appendChild(frame);
      desktopContent.classList.add('msg-learning-frame-open');
      currentReaderPrimary(desktopContent)?.classList.add('msg-learning-primary');
      state.desktopContent = desktopContent;
      state.fallbackHost = null;
    } else {
      // Non-desktop fallback: dock beside the Reader shell, but do not rewrite
      // its internal reader-layout grid.
      const readerPage = $('.reader-page-panel');
      const host = readerPage?.parentElement || $('#app');
      if (!host) return null;
      if (frame.parentElement !== host) host.appendChild(frame);
      host.classList.add('msg-learning-fallback-host-open');
      state.fallbackHost = host;
      state.desktopContent = null;
    }

    state.frame = frame;
    state.body = frame.querySelector('[data-learning-frame-body]');
    return frame;
  }

  function setTitle(text, icon='◈') {
    const title = state.frame?.querySelector('[data-learning-frame-title]');
    const iconNode = state.frame?.querySelector('.msg-learning-frame-title > span');
    if (title) title.textContent = text;
    if (iconNode) iconNode.textContent = icon;
  }

  function openFrame(mode) {
    const frame = ensureFrame();
    if (!frame) return false;

    // Side-frame width belongs to the learning-frame grid slot, not Ask Beth's
    // normal word-panel width mode.
    const layout = $('#reader-layout') || $('.reader-layout');
    layout?.classList.remove('training-lab-wide-open');
    $('#word-panel')?.classList.remove('training-lab-wide-open');

    if (state.mode && state.mode !== mode) restoreMode();

    state.mode = mode;
    frame.hidden = false;
    frame.dataset.learningFrameMode = mode;
    if (state.body) state.body.replaceChildren();
    return true;
  }

  function restoreAskBeth() {
    if (!state.askShell) return;
    state.askShell.classList.remove('msg-askbeth-frame-hosted');
    try {
      if (state.askNext?.parentNode === state.askParent) {
        state.askParent.insertBefore(state.askShell, state.askNext);
      } else {
        state.askParent?.appendChild(state.askShell);
      }
    } catch {}
    state.askShell = null;
    state.askParent = null;
    state.askNext = null;
  }

  function restoreTraining() {
    const lab = $('#training-lab-shell');
    if (!lab) return;
    lab.classList.remove('training-lab-frame-hosted');
    try { delete window.MSGTrainingLabFrameHost; }
    catch { window.MSGTrainingLabFrameHost = null; }

    const host = document.querySelector('[data-training-lab-askbeth-host]');
    if (host && lab.parentElement !== host) host.appendChild(lab);
  }

  function restoreMode() {
    if (state.mode === 'askbeth') restoreAskBeth();
    if (state.mode === 'training') restoreTraining();
  }

  function releaseDock() {
    if (state.desktopContent) {
      state.desktopContent.classList.remove('msg-learning-frame-open');
      currentReaderPrimary(state.desktopContent)?.classList.remove('msg-learning-primary');
    }
    if (state.fallbackHost) {
      state.fallbackHost.classList.remove('msg-learning-fallback-host-open');
    }
    state.desktopContent = null;
    state.fallbackHost = null;
  }

  function close() {
    restoreMode();
    releaseDock();

    if (state.frame) {
      state.frame.hidden = true;
      state.frame.removeAttribute('data-learning-frame-mode');
    }
    if (state.body) state.body.replaceChildren();
    state.mode = '';
  }

  function openTraining() {
    if (!openFrame('training')) return false;
    setTitle('Training Lab', '◈');

    window.MSGTrainingLabFrameHost = state.body;

    const start = () => {
      if (!window.MarkSetGoTrainingLab?.open) return false;
      window.MarkSetGoTrainingLab.open('today');
      return true;
    };

    if (start()) return true;

    state.body.innerHTML =
      '<p class="msg-learning-frame-status">Training Lab is still loading…</p>';

    let tries = 0;
    const retry = () => {
      tries += 1;
      if (start()) {
        state.body.replaceChildren();
        window.MarkSetGoTrainingLab.open('today');
        return;
      }
      if (tries < 90) requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
    return true;
  }

  function openAskBeth() {
    if (!openFrame('askbeth')) return false;
    setTitle('Ask Beth', '✦');

    const mount = () => {
      const shell = $('.reader-control-shell.mark-shell');
      if (!shell || !state.body) return false;

      state.askShell = shell;
      state.askParent = shell.parentNode;
      state.askNext = shell.nextSibling;

      shell.classList.add('msg-askbeth-frame-hosted');
      state.body.appendChild(shell);
      return true;
    };

    if (mount()) return true;

    // Ask Beth may not be built until its normal button has been opened once.
    $('#toggle-mark-panel')?.click();

    let tries = 0;
    const retry = () => {
      tries += 1;
      if (mount() || tries >= 90) return;
      requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
    return true;
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-learning-side-frame]');
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();

    const mode = trigger.dataset.learningSideFrame;
    if (mode === 'training') openTraining();
    if (mode === 'askbeth') openAskBeth();

    const menu = trigger.closest('details.top-nav-menu');
    if (menu) menu.open = false;
  }, true);

  document.addEventListener('marksetgo:learning-frame-close-request', close);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.mode) close();
  });

  window.MSGReadingSideFrame = Object.freeze({
    openTraining,
    openAskBeth,
    close,
    active: () => state.mode
  });
})();
