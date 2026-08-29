(() => {
  'use strict';
  if (window.MSGReadingSideFrame) return;

  const state = {
    mode: '',
    frame: null,
    body: null,
    askShell: null,
    askParent: null,
    askNext: null
  };

  const $ = (s, r=document) => r.querySelector(s);

  function ensureFrame() {
    const layout = $('#reader-layout') || $('.reader-layout');
    if (!layout) return null;

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

      const wordPanel = $('#word-panel', layout);
      if (wordPanel) layout.insertBefore(frame, wordPanel);
      else layout.appendChild(frame);

      frame.querySelector('[data-learning-frame-close]')?.addEventListener('click', close);
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
    const layout = $('#reader-layout') || $('.reader-layout');
    const frame = ensureFrame();
    if (!layout || !frame) return false;

    if (state.mode && state.mode !== mode) restoreMode();

    state.mode = mode;
    layout.classList.add('msg-learning-side-frame-open');
    frame.hidden = false;
    frame.dataset.learningFrameMode = mode;
    if (state.body) state.body.replaceChildren();
    return true;
  }

  function restoreAskBeth() {
    if (!state.askShell) return;
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
    try {
      delete window.MSGTrainingLabFrameHost;
    } catch {
      window.MSGTrainingLabFrameHost = null;
    }
    // Return the Lab to its normal Ask Beth integration host when available.
    const host = document.querySelector('[data-training-lab-askbeth-host]');
    if (host && lab.parentElement !== host) host.appendChild(lab);
  }

  function restoreMode() {
    if (state.mode === 'askbeth') restoreAskBeth();
    if (state.mode === 'training') restoreTraining();
  }

  function close() {
    restoreMode();
    const layout = $('#reader-layout') || $('.reader-layout');
    layout?.classList.remove('msg-learning-side-frame-open');
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
    const labApi = window.MarkSetGoTrainingLab;
    if (!labApi?.open) {
      state.body.innerHTML = '<p class="msg-learning-frame-status">Training Lab is still loading…</p>';
      let tries = 0;
      const retry = () => {
        tries += 1;
        if (window.MarkSetGoTrainingLab?.open) {
          state.body.replaceChildren();
          window.MarkSetGoTrainingLab.open('today');
          return;
        }
        if (tries < 90) requestAnimationFrame(retry);
      };
      requestAnimationFrame(retry);
      return true;
    }
    labApi.open('today');
    return true;
  }

  function openAskBeth() {
    if (!openFrame('askbeth')) return false;
    setTitle('Ask Beth', '✦');

    // Ensure the existing companion shell has been built before moving it.
    const toggle = $('#toggle-mark-panel');
    let shell = $('.reader-control-shell.mark-shell');
    if (!shell && toggle) {
      toggle.click();
      shell = $('.reader-control-shell.mark-shell');
    }

    const mount = () => {
      shell = $('.reader-control-shell.mark-shell');
      if (!shell || !state.body) return false;

      state.askShell = shell;
      state.askParent = shell.parentNode;
      state.askNext = shell.nextSibling;
      state.body.appendChild(shell);

      // The frame itself owns width/scroll. Avoid the old side-panel dimensions.
      shell.classList.add('msg-askbeth-frame-hosted');
      return true;
    };

    if (mount()) return true;

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
