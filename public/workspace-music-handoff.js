/* Mark, Set, Go! Workspace main music dock bridge v0.11.2 */
(() => {
  'use strict';

  if (window.parent !== window) return;

  function playInMainDock(choice = {}) {
    const dock = document.querySelector('#music-dock');
    const player = document.querySelector('#music-player');
    const wrap = document.querySelector('#music-player-wrap');
    const title = document.querySelector('#music-now-title');
    const source = document.querySelector('#music-now-source');
    const next = document.querySelector('#music-next');

    if (!dock || !player || !wrap || !title || !source) return false;

    const youtubeId = String(choice.youtubeId || '').trim();
    const isPlaylist = choice.type === 'playlist';
    const suppliedSrc = String(choice.src || '').trim();

    let src = suppliedSrc;
    if (youtubeId) {
      src = isPlaylist
        ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(youtubeId)}&playsinline=1&rel=0`
        : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?playsinline=1&rel=0`;
    }
    if (!src) return false;

    title.textContent = String(choice.title || 'Music');
    source.textContent = String(
      choice.category ||
      choice.source ||
      (choice.provider === 'spotify' ? 'Spotify' : 'YouTube')
    );
    player.src = src;
    dock.hidden = false;
    dock.classList.remove('minimized');
    wrap.hidden = false;
    if (next) next.hidden = true;

    try {
      localStorage.setItem('markSetGoMusic', JSON.stringify({
        title:title.textContent,
        source:source.textContent,
        provider:choice.provider || (youtubeId ? 'youtube' : ''),
        src
      }));
    } catch {}

    return true;
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'msg-workspace-music-play') return;
    playInMainDock(event.data.choice || {});
  });
})();
