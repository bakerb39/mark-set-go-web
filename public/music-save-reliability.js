'use strict';

(() => {
  const PREFERRED_KEY = 'markSetGoPreferredMusic';

  function readPreferred() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERRED_KEY) || '[]');
      return Array.isArray(saved)
        ? saved.filter((item) => item && item.id && item.title)
        : [];
    } catch {
      return [];
    }
  }

  function preferredId(item) {
    const source = item.choiceId || item.src || item.originalUrl || item.title || String(Date.now());
    let hash = 0;
    for (const char of String(source)) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }
    return `preferred-${Math.abs(hash)}`;
  }

  function writePreferred(items) {
    const limited = items.slice(0, 100);
    localStorage.setItem(PREFERRED_KEY, JSON.stringify(limited));

    // Verify the browser actually accepted the write. The old app helper
    // silently swallowed localStorage failures.
    const verify = readPreferred();
    if (verify.length !== limited.length) {
      throw new Error('The playlist could not be saved in this browser.');
    }
    return verify;
  }

  function parseSpotify(raw) {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'open.spotify.com') {
      throw new Error('Use an open.spotify.com playlist, album, track, artist, show, or episode link.');
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
    const type = parts[offset];
    const id = parts[offset + 1];

    const allowed = new Set(['playlist', 'album', 'track', 'artist', 'show', 'episode']);
    if (!allowed.has(type) || !id || !/^[A-Za-z0-9]+$/.test(id)) {
      throw new Error('That Spotify link is not a supported playlist, album, track, artist, show, or episode.');
    }

    const labels = {
      playlist: 'Spotify playlist',
      album: 'Spotify album',
      track: 'Spotify track',
      artist: 'Spotify artist',
      show: 'Spotify show',
      episode: 'Spotify episode'
    };

    return {
      title: labels[type],
      provider: 'spotify',
      source: 'Spotify',
      originalUrl: `https://open.spotify.com/${type}/${id}`,
      src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
    };
  }

  function parseYouTube(raw) {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      throw new Error('Use a Spotify or YouTube link.');
    }

    const list = url.searchParams.get('list');
    if (list) {
      return {
        title: 'YouTube playlist',
        provider: 'youtube',
        source: 'YouTube',
        originalUrl: raw,
        src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&playsinline=1&rel=0`
      };
    }

    let videoId =
      host === 'youtu.be'
        ? url.pathname.split('/').filter(Boolean)[0]
        : url.searchParams.get('v');

    if (!videoId && url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/')[2];
    }
    if (!videoId && url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/')[2];
    }

    if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
      throw new Error('That link does not contain a recognizable YouTube video or playlist.');
    }

    return {
      title: 'YouTube video',
      provider: 'youtube',
      source: 'YouTube',
      originalUrl: raw,
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0`
    };
  }

  function parseForm() {
    const raw = String(document.querySelector('#music-service-url')?.value || '').trim();
    if (!raw) throw new Error('Paste a Spotify or YouTube link first.');

    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('Enter a valid Spotify or YouTube URL.');
    }

    const host = url.hostname.toLowerCase();
    const parsed = host.includes('spotify.com')
      ? parseSpotify(raw)
      : parseYouTube(raw);

    const customName = String(
      document.querySelector('#music-service-name')?.value || ''
    ).trim();

    if (customName) parsed.title = customName;
    return parsed;
  }

  function saveToMyMusic() {
    const status = document.querySelector('#music-service-status');
    const button = document.querySelector('#save-music-preferred');

    try {
      const parsed = parseForm();
      const current = readPreferred();
      const next = {
        ...parsed,
        id: preferredId(parsed)
      };

      const duplicate = current.find((item) =>
        item.id === next.id ||
        (item.src && next.src && item.src === next.src) ||
        (item.originalUrl && next.originalUrl && item.originalUrl === next.originalUrl)
      );

      let savedItem = duplicate;

      if (!duplicate) {
        const updated = writePreferred([...current, next]);
        savedItem = updated.find((item) => item.id === next.id);
        if (!savedItem) {
          throw new Error('The playlist could not be verified after saving.');
        }
      }

      if (status) {
        status.className = 'status';
        status.textContent = duplicate
          ? `“${next.title}” is already in My Music.`
          : `Saved “${next.title}” to My Music.`;
      }

      if (button) {
        const original = button.dataset.originalLabel || button.textContent || 'Save to My Music';
        button.dataset.originalLabel = original;
        button.textContent = duplicate ? 'Already saved ✓' : 'Saved ✓';
        button.disabled = true;
      }

      document.dispatchEvent(new CustomEvent('marksetgo:preferred-music-changed', {
        detail: {
          item: savedItem || next,
          duplicate: Boolean(duplicate),
          count: readPreferred().length
        }
      }));

      // Re-render the Music page through its existing top-level navigation
      // after the success message has been visible briefly. This refreshes the
      // "Your saved music" list without depending on app.js private functions.
      window.setTimeout(() => {
        const musicNav = document.querySelector('[data-action="music"]');
        if (musicNav && document.querySelector('.music-library')) {
          musicNav.click();
        }
      }, 550);

    } catch (error) {
      if (status) {
        status.className = 'status error';
        status.textContent = error?.message || 'The playlist could not be saved.';
      }
      if (button) button.disabled = false;
    }
  }

  // Capture phase deliberately wins over the old per-render button listener.
  // Because this listener lives on document, it survives every Music-page
  // innerHTML replacement.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#save-music-preferred');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    saveToMyMusic();
  }, true);
})();
