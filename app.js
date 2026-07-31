'use strict';

const app = document.querySelector('#app');


const { BookModel, SessionManager, ReaderEngine, VirtualRenderer } = window.MarkSetGoReader || {};
if (!BookModel || !SessionManager || !ReaderEngine || !VirtualRenderer) {
  throw new Error('Reader Engine modules failed to load.');
}

const readerSessionManager = new SessionManager();
const readerEngine = new ReaderEngine();
const state = readerEngine.state;
const virtualRenderer = new VirtualRenderer({
  getState: () => state,
  setWordContent: (element, word) => setWordContent(element, word),
  savedDefinitionAt: (index) => savedDefinitionAt(index),
  noteAt: (index) => noteAt(index),
  refreshReadingGroups: (mode, groupSize) => refreshReadingGroups(mode, groupSize),
  scheduleIllustrationsForRange: (reader, start, end, mode) => scheduleIllustrationsForRange(reader, start, end, mode),
  updateBookPageStatus: () => updateBookPageStatus()
});
let readerSessionSaveTimer = null;

async function writeReaderSession(snapshot) {
  return readerSessionManager.write(snapshot);
}

async function readReaderSession() {
  return readerSessionManager.read();
}

function captureReaderControls() {
  return {
    mode: app.querySelector('#mode-select')?.value || state.renderedMode || 'highlight',
    wpm: Number(app.querySelector('#speed')?.value || state.wpm || 300),
    wordCount: Number(app.querySelector('#word-count')?.value || 1),
    meaningfulChunks: Boolean(app.querySelector('#meaningful-chunks')?.checked ?? state.meaningfulChunks),
    focusAnchor: Boolean(app.querySelector('#focus-anchor')?.checked ?? state.focusAnchor),
    focusAnchorPosition: state.focusAnchorPosition || null,
    focusAnchorFontSize: Number(app.querySelector('#focus-anchor-font-size')?.value || state.focusAnchorFontSize || 24),
    fontFamily: app.querySelector('#font-family')?.value || 'system',
    fontSize: Number(app.querySelector('#font-size')?.value || 14),
    theme: app.querySelector('#theme-select')?.value || 'dark',
    bionic: Boolean(app.querySelector('#bionic-reading')?.checked ?? state.bionic),
    bookPages: Boolean(app.querySelector('#book-pages')?.checked ?? state.bookPages),
    illustrationMode: app.querySelector('#illustration-mode')?.value || state.illustrationMode || 'off'
  };
}

function buildReaderSessionSnapshot() {
  return readerEngine.snapshot({
    controls: captureReaderControls(),
    wasRunning: isReaderRunning()
  });
}

function persistReaderSession({ immediate = false } = {}) {
  const save = () => {
    readerSessionSaveTimer = null;
    const snapshot = buildReaderSessionSnapshot();
    if (snapshot) writeReaderSession(snapshot);
  };
  window.clearTimeout(readerSessionSaveTimer);
  if (immediate) save();
  else readerSessionSaveTimer = window.setTimeout(save, 250);
}


function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : '';
}

function setCookie(name, value, maxAgeSeconds = 31536000) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

const sources = {
  gatsby: { title: 'The Great Gatsby', path: '/texts/gg.txt' },
  hound: { title: 'The Hound of the Baskervilles', path: '/texts/hb.txt' },
  cities: { title: 'A Tale of Two Cities', path: '/texts/tt.txt' },
  pride: { title: 'Pride and Prejudice', path: '/texts/pp.txt' }
};

const languages = {
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  de: 'German',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese'
};


const musicChoices = [
  { id: 'lofi-study', category: 'Reading moods', title: 'Lofi Study Radio', description: 'Steady instrumental beats for reading and concentration.', type: 'video', youtubeId: 'jfKfPfyJRdk', searchQuery: 'Lofi Girl lofi hip hop radio beats to relax study to' },
  { id: 'sleepy-lofi', category: 'Reading moods', title: 'Sleepy Lofi', description: 'Slower, softer lofi for calm evening reading.', type: 'video', youtubeId: 'rUxyKA_-grg', searchQuery: 'Lofi Girl beats to sleep chill to' },
  { id: 'classical-reading', category: 'Reading moods', title: 'Classical Reading', description: 'A long classical playlist for books and study.', type: 'playlist', youtubeId: 'PLe4JMT6isxp-rx1IRUeEo0puoloL2N9NQ' },
  { id: 'ambient-reading', category: 'Reading moods', title: 'Ambient Reading', description: 'Relaxing ambient instrumentals for concentration.', type: 'playlist', youtubeId: 'OLAK5uy_nCi20x1Eo0ZW2q_cfufw06g2Bvn8a4u-c' },
  { id: 'deep-focus', category: 'Focus', title: 'Deep Focus', description: 'Low-distraction ambient music for sustained focus.', type: 'playlist', youtubeId: 'PLUrnxvhuvpSU0b2YvM4Gf1V3bHnLAcvBj' },
  { id: 'rain-focus', category: 'Focus', title: 'Rain & Focus', description: 'Rain and nature sounds for quiet reading.', type: 'playlist', youtubeId: 'OLAK5uy_lN5SVZjZwWb3XM5BIKUreV5wRCD0VLsqQ' },
  { id: 'anime-lofi', category: 'Lofi', title: 'Anime Lofi', description: 'Relaxed anime-inspired lofi beats.', type: 'playlist', youtubeId: 'PLApjonMF-0Y8uSA_-6ZbX1DIr-muc2nDg' },
  { id: 'classical-piano', category: 'Classical', title: 'Classical Piano', description: 'Familiar piano and orchestral selections.', type: 'playlist', youtubeId: 'PLgW6PU42e5RLa6NENfz5kusVilq58Cojm' }
];


const preferredMusicStorageKey = 'markSetGoPreferredMusic';

function getPreferredMusic() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferredMusicStorageKey) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && item.id && item.title) : [];
  } catch {
    return [];
  }
}

function setPreferredMusic(items) {
  try { localStorage.setItem(preferredMusicStorageKey, JSON.stringify(items.slice(0, 100))); } catch {}
}

function preferredMusicId(item) {
  const source = item.choiceId || item.src || item.title || String(Date.now());
  let hash = 0;
  for (const char of String(source)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `preferred-${Math.abs(hash)}`;
}

function addPreferredMusic(item) {
  if (!item?.title) return false;
  const next = { ...item, id: item.id || preferredMusicId(item) };
  const items = getPreferredMusic();
  const duplicate = items.some((saved) => saved.id === next.id || (next.choiceId && saved.choiceId === next.choiceId) || (next.src && saved.src === next.src));
  if (duplicate) return false;
  items.push(next);
  setPreferredMusic(items);
  return true;
}

function removePreferredMusic(id) {
  setPreferredMusic(getPreferredMusic().filter((item) => item.id !== id));
}

function preferredMusicOptionsMarkup() {
  const items = getPreferredMusic();
  return `
    <option value="">Preferred music…</option>
    ${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('')}
    <option value="__manage__">Manage preferred music…</option>`;
}

function mediaMatchOptionsMarkup() {
  const items = getPreferredMusic();
  return `
    <option value="music">♫ Music score</option>
    ${items.length ? `<optgroup label="Preferred music">${items.map((item) => `<option value="preferred:${escapeHtml(item.id)}">♫ ${escapeHtml(item.title)}</option>`).join('')}</optgroup>` : ''}
    <option value="manage-music">Manage preferred music…</option>
    <option value="news">▶ News video</option>`;
}

function playPreferredMusic(id) {
  const item = getPreferredMusic().find((saved) => saved.id === id);
  if (!item) return;
  if (item.choiceId) {
    const choice = musicChoices.find((candidate) => candidate.id === item.choiceId);
    if (choice) return playMusic(choice);
  }
  if (item.src) return playMusic({ title: item.title, source: item.source || 'Preferred music', src: item.src });
}

function bindPreferredMusicSelectors() {
  const selects = [...app.querySelectorAll('[data-preferred-music-select]')];
  selects.forEach((select) => {
    select.addEventListener('change', () => {
      const value = select.value;
      if (!value) return;
      if (value === '__manage__') {
        renderMusicLibrary();
        return;
      }
      playPreferredMusic(value);
      selects.forEach((other) => { if (other !== select) other.value = value; });
    });
  });
}


const bookMusicProfiles = [
  { match: /pride and prejudice/i, score: 'Pride and Prejudice film soundtrack', mood: 'English countryside classical reading music' },
  { match: /great gatsby/i, score: 'The Great Gatsby movie soundtrack', mood: '1920s jazz reading music' },
  { match: /hound of the baskervilles|sherlock holmes/i, score: 'Sherlock Holmes film soundtrack', mood: 'Victorian mystery ambience reading music' },
  { match: /tale of two cities/i, score: 'A Tale of Two Cities film soundtrack', mood: 'French Revolution classical ambience' },
  { match: /iliad|odyssey|homer/i, score: 'Troy movie soundtrack', mood: 'Ancient Greek epic ambience' },
  { match: /aeneid|virgil/i, score: 'Roman Empire epic film soundtrack', mood: 'Ancient Rome ambience reading music' },
  { match: /divine comedy|dante/i, score: 'Dante Inferno soundtrack', mood: 'medieval sacred ambience reading music' },
  { match: /shakespeare|hamlet|macbeth|romeo and juliet|king lear/i, score: 'Shakespeare film soundtrack', mood: 'Elizabethan instrumental reading music' },
  { match: /don quixote|cervantes/i, score: 'Don Quixote film soundtrack', mood: 'Spanish classical guitar reading music' },
  { match: /paradise lost|milton/i, score: 'Paradise Lost cinematic soundtrack', mood: 'dark sacred choral reading music' },
  { match: /war and peace|anna karenina|tolstoy/i, score: 'War and Peace film soundtrack', mood: 'Russian classical reading music' },
  { match: /crime and punishment|brothers karamazov|dostoevsky/i, score: 'Dostoevsky film soundtrack', mood: 'dark Russian classical reading music' },
  { match: /moby dick|melville/i, score: 'Moby Dick film soundtrack', mood: 'ocean ambience orchestral reading music' },
  { match: /frankenstein|mary shelley/i, score: 'Frankenstein film soundtrack', mood: 'gothic classical reading ambience' },
  { match: /dracula|bram stoker/i, score: 'Dracula film soundtrack', mood: 'gothic horror classical reading music' },
  { match: /alice in wonderland|lewis carroll/i, score: 'Alice in Wonderland film soundtrack', mood: 'whimsical fantasy reading music' },
  { match: /treasure island|robert louis stevenson/i, score: 'Treasure Island film soundtrack', mood: 'pirate adventure ambience reading music' },
  { match: /jane eyre|charlotte bronte/i, score: 'Jane Eyre film soundtrack', mood: 'gothic romantic classical reading music' },
  { match: /wuthering heights|emily bronte/i, score: 'Wuthering Heights film soundtrack', mood: 'windswept moor ambience reading music' },
  { match: /little women|louisa may alcott/i, score: 'Little Women film soundtrack', mood: 'warm period drama reading music' }
];

function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function recommendedBookMusic(title, author = '') {
  const key = `${title || ''} ${author || ''}`.trim();
  const profile = bookMusicProfiles.find((item) => item.match.test(key));
  if (profile) {
    return [
      { label: 'Adaptation score', query: profile.score },
      { label: 'Reading mood', query: profile.mood }
    ];
  }
  const cleanTitle = String(title || 'this book').replace(/\s*[—-].*$/, '').trim();
  return [
    { label: 'Film or TV score', query: `${cleanTitle} movie soundtrack` },
    { label: 'Reading mood', query: `${cleanTitle} instrumental reading ambience` }
  ];
}

function bookMusicMarkup(title, author = '') {
  const recommendations = recommendedBookMusic(title, author);
  return `<div class="book-music-recommendations"><span>Suggested music</span>${recommendations.map((item) => `<a class="book-music-link" href="${youtubeSearchUrl(item.query)}" target="_blank" rel="noopener noreferrer">♫ ${escapeHtml(item.label)}</a>`).join('')}</div>`;
}

function inferReadingMoodQuery(title = '', text = '') {
  const cleanTitle = String(title || 'this book').replace(/\s*[—-].*$/, '').trim();
  const sample = `${cleanTitle} ${String(text || '').slice(0, 12000)}`.toLocaleLowerCase();
  const profile = bookMusicProfiles.find((item) => item.match.test(cleanTitle));
  if (profile?.mood) return profile.mood;

  const signals = [
    { test: /mystery|detective|murder|crime|suspense|noir|sherlock|gothic|haunted|horror|dracula|frankenstein/, query: 'dark Victorian mystery ambience instrumental reading music' },
    { test: /romance|courtship|love|regency|austen|bronte|drawing room|ballroom/, query: 'romantic period drama classical instrumental reading music' },
    { test: /fantasy|magic|wizard|myth|legend|wonderland|fairy|dragon/, query: 'enchanted fantasy ambience instrumental reading music' },
    { test: /adventure|voyage|expedition|pirate|treasure|island|jungle/, query: 'cinematic adventure ambience instrumental reading music' },
    { test: /ocean|sea|ship|whale|sailor|maritime/, query: 'ocean voyage ambience orchestral instrumental reading music' },
    { test: /war|battle|revolution|empire|army|soldier/, query: 'historical epic orchestral ambience reading music' },
    { test: /ancient greek|greece|homer|odyssey|iliad|trojan/, query: 'Ancient Greek lyre epic ambience reading music' },
    { test: /roman|rome|aeneid|virgil|caesar/, query: 'Ancient Rome ambience instrumental reading music' },
    { test: /medieval|monastery|knight|castle|dante|pilgrim/, query: 'medieval sacred instrumental ambience reading music' },
    { test: /nature|forest|river|mountain|outdoor|fishing|rain|storm/, query: 'nature ambience gentle instrumental reading music' },
    { test: /1920|jazz|gatsby|speakeasy|new york city/, query: '1920s jazz ambience instrumental reading music' },
    { test: /science fiction|spaceship|planet|future|robot|alien/, query: 'space ambient science fiction instrumental reading music' },
    { test: /philosoph|theology|ethics|history|science|politic|essay|treatise/, query: 'quiet scholarly classical instrumental deep reading music' },
    { test: /children|childhood|family|little women|warm|home/, query: 'warm nostalgic period drama instrumental reading music' }
  ];
  const match = signals.find((item) => item.test.test(sample));
  return match?.query || `${cleanTitle} atmospheric instrumental reading music`;
}

function recommendedPlayerChoice(title = '', text = '') {
  const searches = recommendedBookMusic(title);
  return {
    scoreQuery: searches.find((item) => /adaptation|film|tv|score/i.test(item.label))?.query || `${title} adaptation soundtrack`,
    moodQuery: inferReadingMoodQuery(title, text),
    searches
  };
}

function grokipediaSearchUrl(title) {
  const cleanTitle = String(title || '').replace(/\s*[—-].*$/, '').trim();
  return `https://grokipedia.com/search?q=${encodeURIComponent(cleanTitle)}`;
}

function bindReaderMusicControls(title, text, source = {}) {
  const mediaSelect = app.querySelector('#media-match-select');
  const mediaButton = app.querySelector('#play-media-match');
  const moodButton = app.querySelector('#play-reading-mood');
  const grokipediaLink = app.querySelector('#grokipedia-book-link');
  const recommendation = recommendedPlayerChoice(title, text);
  const isNewsReading = ['article', 'feed-summary', 'news'].includes(source?.type);
  const newsSource = String(source?.source || '').trim();
  const newsVideoQuery = `${title}${newsSource ? ` ${newsSource}` : ''} news video`;
  if (mediaSelect) {
    mediaSelect.value = isNewsReading ? 'news' : 'music';
    mediaSelect.title = isNewsReading
      ? 'Choose news video coverage or a music score for this reading'
      : 'Choose a music score or search for video coverage related to this text';
  }
  if (mediaButton) {
    const syncMediaButton = () => {
      const choice = mediaSelect?.value || (isNewsReading ? 'news' : 'music');
      mediaButton.textContent = choice === 'news' ? '▶ Watch news video' : '♫ Play music score';
      mediaButton.title = choice === 'news'
        ? `Find video coverage for ${title}`
        : `Play an adaptation or cinematic score for ${title}`;
    };
    syncMediaButton();
    mediaSelect?.addEventListener('change', () => {
      const choice = mediaSelect.value;
      if (choice === 'manage-music') {
        renderMusicLibrary();
        return;
      }
      if (choice.startsWith('preferred:')) {
        playPreferredMusic(choice.slice('preferred:'.length));
        return;
      }
      syncMediaButton();
    });
    mediaButton.addEventListener('click', () => {
      const choice = mediaSelect?.value || (isNewsReading ? 'news' : 'music');
      if (choice === 'news') {
        playYouTubeSearch(newsVideoQuery, `${title} — news video`);
      } else if (choice.startsWith('preferred:')) {
        playPreferredMusic(choice.slice('preferred:'.length));
      } else if (choice === 'manage-music') {
        renderMusicLibrary();
      } else {
        playYouTubeSearch(recommendation.scoreQuery, `${title} — music score`);
      }
    });
  }
  if (moodButton) {
    moodButton.title = `Play a reading mood selected for ${title}`;
    moodButton.addEventListener('click', () => playYouTubeSearch(
      recommendation.moodQuery,
      `${title} — reading mood`
    ));
  }
  if (grokipediaLink) grokipediaLink.href = grokipediaSearchUrl(title);
}

const musicDock = document.querySelector('#music-dock');
const musicPlayer = document.querySelector('#music-player');
const musicPlayerWrap = document.querySelector('#music-player-wrap');
const musicNowTitle = document.querySelector('#music-now-title');
const musicNowSource = document.querySelector('#music-now-source');
const musicNextButton = document.querySelector('#music-next');
let musicSearchState = null;

function musicSearchQuery(choice) {
  return choice.searchQuery || `${choice.title || 'reading music'} YouTube`;
}

function musicWatchUrl(choice) {
  if (choice.type === 'playlist') return `https://www.youtube.com/playlist?list=${encodeURIComponent(choice.youtubeId)}`;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(choice.youtubeId)}`;
}

function youtubeEmbedFromChoice(choice) {
  if (choice.type === 'playlist') {
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(choice.youtubeId)}&playsinline=1&rel=0`;
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(choice.youtubeId)}?playsinline=1&rel=0`;
}

function parseYouTubeInput(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('Paste a YouTube video or playlist link.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Enter a valid YouTube URL.'); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    throw new Error('Only YouTube links can be loaded in the music player.');
  }
  const list = parsed.searchParams.get('list');
  if (list) return { title: 'YouTube playlist', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&playsinline=1&rel=0` };
  let videoId = host === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] : parsed.searchParams.get('v');
  if (!videoId && parsed.pathname.startsWith('/shorts/')) videoId = parsed.pathname.split('/')[2];
  if (!videoId && parsed.pathname.startsWith('/embed/')) videoId = parsed.pathname.split('/')[2];
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) throw new Error('That link does not contain a recognizable YouTube video or playlist.');
  return { title: 'YouTube video', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0` };
}

async function playYouTubeSearch(query, title = 'YouTube search') {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return;
  musicNowTitle.textContent = title;
  musicNowSource.textContent = 'Searching YouTube…';
  musicDock.hidden = false;
  musicDock.classList.remove('minimized');
  musicPlayerWrap.hidden = false;
  musicPlayer.src = '';
  if (musicNextButton) musicNextButton.hidden = true;
  try {
    const payload = await loadApiPayload(`/api/youtube/search?q=${encodeURIComponent(cleanQuery)}`);
    const videoIds = Array.isArray(payload.videoIds) ? payload.videoIds : [];
    if (!videoIds.length) throw new Error('No playable results were found.');
    musicSearchState = { query: cleanQuery, title, videoIds, index: 0 };
    playMusicSearchCandidate(0);
  } catch (error) {
    musicSearchState = null;
    musicNowSource.textContent = error?.message || 'Music search failed';
    musicPlayer.src = '';
  }
}

function playMusicSearchCandidate(index) {
  if (!musicSearchState?.videoIds?.length) return;
  const safeIndex = ((index % musicSearchState.videoIds.length) + musicSearchState.videoIds.length) % musicSearchState.videoIds.length;
  musicSearchState.index = safeIndex;
  const videoId = musicSearchState.videoIds[safeIndex];
  musicNowTitle.textContent = musicSearchState.title;
  musicNowSource.textContent = `YouTube result ${safeIndex + 1} of ${musicSearchState.videoIds.length}`;
  musicPlayer.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`;
  musicDock.hidden = false;
  musicDock.classList.remove('minimized');
  musicPlayerWrap.hidden = false;
  if (musicNextButton) musicNextButton.hidden = musicSearchState.videoIds.length < 2;
  try {
    localStorage.setItem('markSetGoMusic', JSON.stringify({
      title: musicNowTitle.textContent,
      source: musicNowSource.textContent,
      src: musicPlayer.src,
      search: musicSearchState
    }));
  } catch {}
}

function playMusic(choiceOrParsed) {
  musicSearchState = choiceOrParsed?.search || null;
  if (musicNextButton) musicNextButton.hidden = !musicSearchState?.videoIds?.length;
  const isChoice = Boolean(choiceOrParsed?.youtubeId);
  const src = isChoice ? youtubeEmbedFromChoice(choiceOrParsed) : choiceOrParsed.src;
  musicNowTitle.textContent = choiceOrParsed.title || 'Music';
  musicNowSource.textContent = isChoice ? choiceOrParsed.category : (choiceOrParsed.source || 'YouTube');
  musicPlayer.src = src;
  musicDock.hidden = false;
  musicDock.classList.remove('minimized');
  musicPlayerWrap.hidden = false;
  try { localStorage.setItem('markSetGoMusic', JSON.stringify({ title: musicNowTitle.textContent, source: musicNowSource.textContent, src })); } catch {}
}

function stopMusic() {
  musicSearchState = null;
  if (musicNextButton) musicNextButton.hidden = true;
  musicPlayer.src = '';
  musicDock.hidden = true;
  try { localStorage.removeItem('markSetGoMusic'); } catch {}
}

function renderMusicLibrary() {
  stopReader();
  const categories = [...new Set(musicChoices.map((item) => item.category))];
  const preferred = getPreferredMusic();
  app.innerHTML = `
    <section class="panel music-library">
      <div class="library-heading"><div><h1>Music</h1><p>Choose background music from YouTube, save favorites, and switch among them quickly while reading.</p></div></div>
      <section class="music-category preferred-music-library">
        <div class="library-heading"><div><h2>Preferred Music</h2><p>Music saved here appears in the Preferred Music dropdown in both the reader and fullscreen controls.</p></div></div>
        <div id="preferred-music-list" class="preferred-music-list">
          ${preferred.length ? preferred.map((item) => `
            <article class="preferred-music-item">
              <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.source || 'YouTube')}</span></div>
              <div class="preferred-music-actions"><button class="secondary" type="button" data-play-preferred="${escapeHtml(item.id)}">Play</button><button class="secondary" type="button" data-remove-preferred="${escapeHtml(item.id)}">Remove</button></div>
            </article>`).join('') : '<p class="library-note">No preferred music yet. Add selections below.</p>'}
        </div>
      </section>
      <form id="youtube-music-form" class="music-url-form">
        <label>YouTube video or playlist URL<input id="youtube-music-url" type="url" placeholder="https://www.youtube.com/watch?v=…"></label>
        <label>Preferred name (optional)<input id="youtube-music-name" type="text" maxlength="80" placeholder="My reading playlist"></label>
        <div class="music-url-actions"><button class="primary" type="submit">Load player</button><button id="save-youtube-preferred" class="secondary" type="button">Add to Preferred</button></div>
        <span id="youtube-music-status" class="status"></span>
      </form>
      ${categories.map((category) => `
        <section class="music-category"><h2>${escapeHtml(category)}</h2><div class="music-card-grid">
          ${musicChoices.filter((item) => item.category === category).map((item) => `
            <article class="music-card"><div class="music-card-icon" aria-hidden="true">♫</div><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="music-card-links"><a href="${escapeHtml(musicWatchUrl(item))}" target="_blank" rel="noopener noreferrer">Open on YouTube</a><a href="${escapeHtml(youtubeSearchUrl(musicSearchQuery(item)))}" target="_blank" rel="noopener noreferrer">Find alternative</a></div></div><div class="music-card-actions"><button class="primary" type="button" data-play-music="${escapeHtml(item.id)}">Play</button><button class="secondary" type="button" data-save-music="${escapeHtml(item.id)}">Add to Preferred</button></div></article>`).join('')}
        </div></section>`).join('')}
      <section class="music-category billboard-section">
        <div class="library-heading"><div><h2>Billboard Hot 100 — Top 25</h2><p>The current chart is loaded from a public chart page. Choose a song to search for its official version on YouTube.</p></div><a class="secondary button-link" href="https://www.billboard.com/charts/hot-100/" target="_blank" rel="noopener noreferrer">View Billboard</a></div>
        <p id="billboard-status" class="status">Loading chart…</p>
        <ol id="billboard-list" class="billboard-list"></ol>
      </section>
      <p class="library-note">YouTube playback remains subject to YouTube availability, regional restrictions, ads, and the uploader's embedding settings. Playback begins only after user interaction.</p>
    </section>`;

  app.querySelectorAll('[data-play-music]').forEach((button) => button.addEventListener('click', () => {
    const choice = musicChoices.find((item) => item.id === button.dataset.playMusic);
    if (choice) playMusic(choice);
  }));
  app.querySelectorAll('[data-save-music]').forEach((button) => button.addEventListener('click', () => {
    const choice = musicChoices.find((item) => item.id === button.dataset.saveMusic);
    if (!choice) return;
    const added = addPreferredMusic({ title: choice.title, source: choice.category, choiceId: choice.id });
    button.textContent = added ? 'Saved ✓' : 'Already saved';
    button.disabled = true;
  }));
  app.querySelectorAll('[data-play-preferred]').forEach((button) => button.addEventListener('click', () => playPreferredMusic(button.dataset.playPreferred)));
  app.querySelectorAll('[data-remove-preferred]').forEach((button) => button.addEventListener('click', () => {
    removePreferredMusic(button.dataset.removePreferred);
    renderMusicLibrary();
  }));
  app.querySelector('#youtube-music-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = app.querySelector('#youtube-music-status');
    try {
      playMusic(parseYouTubeInput(app.querySelector('#youtube-music-url').value));
      status.className = 'status';
      status.textContent = 'Loaded in the music player.';
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  });
  app.querySelector('#save-youtube-preferred')?.addEventListener('click', () => {
    const status = app.querySelector('#youtube-music-status');
    try {
      const parsed = parseYouTubeInput(app.querySelector('#youtube-music-url').value);
      const customName = app.querySelector('#youtube-music-name')?.value.trim();
      const title = customName || parsed.title;
      const added = addPreferredMusic({ title, source: 'YouTube', src: parsed.src });
      status.className = 'status';
      status.textContent = added ? `Added “${title}” to Preferred Music.` : 'That music is already in Preferred Music.';
      if (added) window.setTimeout(renderMusicLibrary, 450);
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  });
  loadBillboardSongs();
}

async function loadBillboardSongs() {
  const status = app.querySelector('#billboard-status');
  const list = app.querySelector('#billboard-list');
  if (!status || !list) return;
  try {
    const payload = await loadApiPayload('/api/music/billboard');
    const songs = Array.isArray(payload.songs) ? payload.songs.slice(0, 25) : [];
    if (!songs.length) throw new Error('The current chart could not be parsed.');
    status.textContent = payload.chartDate ? `Chart dated ${payload.chartDate}` : 'Current chart';
    list.innerHTML = songs.map((song) => {
      const query = encodeURIComponent(`${song.title} ${song.artist} official audio`);
      return `<li><span class="billboard-rank">${song.rank}</span><div><strong>${escapeHtml(song.title)}</strong><span>${escapeHtml(song.artist)}</span></div><a class="secondary button-link" href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer">Find on YouTube</a></li>`;
    }).join('');
  } catch (error) {
    status.className = 'status error';
    status.textContent = `${error.message} You can still open Billboard or paste any YouTube link above.`;
  }
}


const greatBooksCatalog = [
  { era: 'Ancient', author: 'Homer', title: 'The Iliad', query: 'Iliad Homer' },
  { era: 'Ancient', author: 'Homer', title: 'The Odyssey', query: 'Odyssey Homer' },
  { era: 'Ancient', author: 'Aeschylus', title: 'The Oresteia / Tragedies', query: 'Aeschylus tragedies' },
  { era: 'Ancient', author: 'Sophocles', title: 'The Tragedies of Sophocles', query: 'Sophocles tragedies' },
  { era: 'Ancient', author: 'Herodotus', title: 'The Histories', query: 'Herodotus history' },
  { era: 'Ancient', author: 'Thucydides', title: 'History of the Peloponnesian War', query: 'Thucydides Peloponnesian War' },
  { era: 'Ancient', author: 'Plato', title: 'The Republic', query: 'Republic Plato' },
  { era: 'Ancient', author: 'Plato', title: 'Dialogues', query: 'Dialogues Plato' },
  { era: 'Ancient', author: 'Aristotle', title: 'Politics', query: 'Politics Aristotle' },
  { era: 'Ancient', author: 'Aristotle', title: 'Poetics', query: 'Poetics Aristotle' },
  { era: 'Roman & Early Christian', author: 'Virgil', title: 'The Aeneid', query: 'Aeneid Virgil' },
  { era: 'Roman & Early Christian', author: 'Plutarch', title: 'Lives', query: 'Plutarch lives' },
  { era: 'Roman & Early Christian', author: 'Marcus Aurelius', title: 'Meditations', query: 'Meditations Marcus Aurelius' },
  { era: 'Roman & Early Christian', author: 'Augustine', title: 'Confessions', query: 'Confessions Augustine' },
  { era: 'Middle Ages & Renaissance', author: 'Dante Alighieri', title: 'The Divine Comedy', query: 'Divine Comedy Dante' },
  { era: 'Middle Ages & Renaissance', author: 'Thomas Aquinas', title: 'Selected Works', query: 'Thomas Aquinas' },
  { era: 'Middle Ages & Renaissance', author: 'Niccolò Machiavelli', title: 'The Prince', query: 'Prince Machiavelli' },
  { era: 'Middle Ages & Renaissance', author: 'Michel de Montaigne', title: 'Essays', query: 'Essays Montaigne' },
  { era: 'Middle Ages & Renaissance', author: 'William Shakespeare', title: 'Complete Works', query: 'Shakespeare complete works' },
  { era: 'Early Modern', author: 'Miguel de Cervantes', title: 'Don Quixote', query: 'Don Quixote Cervantes' },
  { era: 'Early Modern', author: 'Francis Bacon', title: 'Essays', query: 'Essays Francis Bacon' },
  { era: 'Early Modern', author: 'Thomas Hobbes', title: 'Leviathan', query: 'Leviathan Hobbes' },
  { era: 'Early Modern', author: 'René Descartes', title: 'Discourse on Method', query: 'Discourse Method Descartes' },
  { era: 'Early Modern', author: 'John Milton', title: 'Paradise Lost', query: 'Paradise Lost Milton' },
  { era: 'Enlightenment & Modern', author: 'John Locke', title: 'Second Treatise of Government', query: 'Second Treatise Government Locke' },
  { era: 'Enlightenment & Modern', author: 'David Hume', title: 'An Enquiry Concerning Human Understanding', query: 'Enquiry Human Understanding Hume' },
  { era: 'Enlightenment & Modern', author: 'Jean-Jacques Rousseau', title: 'The Social Contract', query: 'Social Contract Rousseau' },
  { era: 'Enlightenment & Modern', author: 'Adam Smith', title: 'The Wealth of Nations', query: 'Wealth Nations Adam Smith' },
  { era: 'Enlightenment & Modern', author: 'Edward Gibbon', title: 'The Decline and Fall of the Roman Empire', query: 'Decline Fall Roman Empire Gibbon' },
  { era: 'Enlightenment & Modern', author: 'Immanuel Kant', title: 'Critique of Pure Reason', query: 'Critique Pure Reason Kant' },
  { era: 'Enlightenment & Modern', author: 'John Stuart Mill', title: 'On Liberty', query: 'On Liberty Mill' },
  { era: 'Science', author: 'Euclid', title: 'The Elements', query: 'Elements Euclid' },
  { era: 'Science', author: 'Galileo Galilei', title: 'Dialogues Concerning Two New Sciences', query: 'Two New Sciences Galileo' },
  { era: 'Science', author: 'Charles Darwin', title: 'On the Origin of Species', query: 'Origin Species Darwin' },
  { era: 'Literature', author: 'Jane Austen', title: 'Pride and Prejudice', query: 'Pride Prejudice Austen' },
  { era: 'Literature', author: 'Johann Wolfgang von Goethe', title: 'Faust', query: 'Faust Goethe' },
  { era: 'Literature', author: 'Herman Melville', title: 'Moby-Dick', query: 'Moby Dick Melville' },
  { era: 'Literature', author: 'Leo Tolstoy', title: 'War and Peace', query: 'War Peace Tolstoy' },
  { era: 'Literature', author: 'Fyodor Dostoevsky', title: 'The Brothers Karamazov', query: 'Brothers Karamazov Dostoevsky' }
];

// Reader state is owned by ReaderEngine (Sprint 1).

function closeMenus() {
  document.querySelectorAll('details[open]').forEach((menu) => menu.removeAttribute('open'));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function splitWords(text) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}


const STRONG_CHUNK_END = /[.!?]["'”’\)\]]*$/u;
const SOFT_CHUNK_END = /[,;:—–]["'”’\)\]]*$/u;
const CHUNK_STARTERS = new Set([
  'and', 'but', 'or', 'yet', 'so', 'because', 'although', 'though', 'while', 'when', 'if',
  'after', 'before', 'since', 'until', 'unless', 'who', 'whom', 'whose', 'which', 'that',
  'in', 'on', 'at', 'by', 'for', 'from', 'of', 'to', 'with', 'without', 'through', 'across',
  'along', 'around', 'behind', 'beneath', 'beside', 'between', 'beyond', 'during', 'into',
  'near', 'over', 'under', 'upon', 'within', 'toward', 'towards'
]);
const DANGLING_CHUNK_ENDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'to', 'of', 'in', 'on',
  'at', 'by', 'from', 'with', 'without', 'into', 'onto', 'as', 'than', 'that', 'which', 'who',
  'whose', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do',
  'does', 'did', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must'
]);

function normalizedChunkWord(word) {
  return cleanLookupWord(word).toLocaleLowerCase();
}

function modeSupportsMeaningfulChunks(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'flash'].includes(mode);
}

function modeSupportsBookPages(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee'].includes(mode);
}

function chooseMeaningfulChunkEnd(startIndex, maximumEnd) {
  if (maximumEnd <= startIndex + 1) return maximumEnd;

  // Sentence endings always complete the current phrase, even when that makes
  // the phrase shorter than the user's selected maximum.
  for (let index = startIndex; index < maximumEnd; index += 1) {
    if (STRONG_CHUNK_END.test(state.words[index])) return index + 1;
  }

  // Commas, semicolons, colons, and dashes are natural breath points. Avoid a
  // one-word fragment unless that is all the selected maximum allows.
  for (let index = startIndex + 1; index < maximumEnd; index += 1) {
    if (SOFT_CHUNK_END.test(state.words[index])) return index + 1;
  }

  // Prefer beginning a new chunk at a conjunction, relative clause, or
  // prepositional phrase instead of splitting indiscriminately in its middle.
  for (let index = startIndex + 2; index < maximumEnd; index += 1) {
    if (CHUNK_STARTERS.has(normalizedChunkWord(state.words[index]))) return index;
  }

  let end = maximumEnd;
  // Do not leave an article, preposition, conjunction, or helping verb hanging
  // at the end when moving it to the next phrase still leaves a useful chunk.
  while (end > startIndex + 1 && DANGLING_CHUNK_ENDS.has(normalizedChunkWord(state.words[end - 1]))) {
    end -= 1;
  }
  return end > startIndex ? end : maximumEnd;
}

function buildReadingGroups(mode, maximumWords) {
  const maxWords = Math.min(10, Math.max(1, Number(maximumWords) || 1));
  const useMeaning = state.meaningfulChunks && modeSupportsMeaningfulChunks(mode) && maxWords > 1;
  const groups = [];
  const starts = state.structureByStart || new Map();
  const boundaries = new Set(state.structure.flatMap((entry) => [entry.start, entry.end]));

  for (let start = 0; start < state.words.length;) {
    const structure = starts.get(start);
    if (structure) {
      const end = Math.min(state.words.length, Math.max(start + 1, structure.end));
      groups.push({ start, end, structure });
      start = end;
      continue;
    }

    let maximumEnd = Math.min(state.words.length, start + maxWords);
    for (let candidate = start + 1; candidate < maximumEnd; candidate += 1) {
      if (boundaries.has(candidate)) { maximumEnd = candidate; break; }
    }
    const end = useMeaning ? chooseMeaningfulChunkEnd(start, maximumEnd) : maximumEnd;
    groups.push({ start, end: Math.max(start + 1, end) });
    start = Math.max(start + 1, end);
  }
  return groups;
}

function refreshReadingGroups(mode, groupSize) {
  state.readingGroups = buildReadingGroups(mode, groupSize);
  state.groupIndexByStart = new Map(state.readingGroups.map((group, index) => [group.start, index]));
  state.renderedMeaningfulChunks = state.meaningfulChunks && modeSupportsMeaningfulChunks(mode);
}

function findReadingGroup(startIndex) {
  const directIndex = state.groupIndexByStart.get(startIndex);
  if (directIndex !== undefined) return state.readingGroups[directIndex];
  // Pointing Guide can stop early at a visual line break, placing the next
  // step inside a semantic phrase. In that case, keep the remainder together.
  return state.readingGroups.find((group) => group.start <= startIndex && group.end > startIndex) || null;
}

function cleanLookupWord(word) {
  return String(word).replace(/^[^\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+$/gu, '').trim();
}

function getBionicParts(word) {
  const value = String(word);
  const match = value.match(/^(?<leading>[^\p{L}\p{N}]*)(?<core>[\p{L}\p{N}'’-]+)(?<trailing>[^\p{L}\p{N}]*)$/u);
  if (!match?.groups?.core) return { leading: '', bold: value, rest: '', trailing: '' };

  const coreCharacters = Array.from(match.groups.core);
  // Bold roughly the first half of the readable portion. Short words retain a
  // single bold character so the line stays readable rather than overly dark.
  const boldLength = Math.max(1, Math.ceil(coreCharacters.length * 0.45));
  return {
    leading: match.groups.leading,
    bold: coreCharacters.slice(0, boldLength).join(''),
    rest: coreCharacters.slice(boldLength).join(''),
    trailing: match.groups.trailing
  };
}

function setWordContent(element, word) {
  element.replaceChildren();
  if (!state.bionic) {
    element.textContent = word;
    return;
  }

  const parts = getBionicParts(word);
  if (parts.leading) element.append(document.createTextNode(parts.leading));
  const strong = document.createElement('strong');
  strong.className = 'bionic-prefix';
  strong.textContent = parts.bold;
  element.append(strong);
  if (parts.rest) element.append(document.createTextNode(parts.rest));
  if (parts.trailing) element.append(document.createTextNode(parts.trailing));
}

function renderPhrase(element, words) {
  element.replaceChildren();
  words.forEach((word, index) => {
    const span = document.createElement('span');
    span.className = 'reader-word';
    setWordContent(span, word);

    // Keep the separator inside the word element. Plain text-node spaces can
    // disappear when the Flash reader is a flex container.
    if (index < words.length - 1) {
      span.append(document.createTextNode('\u00A0'));
    }

    element.append(span);
  });
}

function focusAnchorIndex(word) {
  const match = String(word || '').match(/^(?<leading>[^\p{L}\p{N}]*)(?<core>[\p{L}\p{N}][\p{L}\p{N}'’’-]*)(?<trailing>[^\p{L}\p{N}]*)$/u);
  const core = Array.from(match?.groups?.core || String(word || ''));
  if (!core.length) return 0;
  // Place the fixation point slightly left of center for longer words.
  if (core.length <= 1) return 0;
  if (core.length <= 5) return 1;
  if (core.length <= 9) return 2;
  if (core.length <= 13) return 3;
  return 4;
}

function renderFocusAnchorPhrase(element, words) {
  const phrase = words.join(' ');
  const chars = Array.from(phrase);
  const anchor = Math.min(chars.length - 1, focusAnchorIndex(phrase));
  const stage = document.createElement('span');
  stage.className = 'focus-anchor-stage';

  const left = document.createElement('span');
  left.className = 'focus-anchor-left';
  left.textContent = chars.slice(0, anchor).join('');

  const pivot = document.createElement('span');
  pivot.className = 'focus-anchor-letter';
  pivot.textContent = chars[anchor] || '';

  const right = document.createElement('span');
  right.className = 'focus-anchor-right';
  right.textContent = chars.slice(anchor + 1).join('');

  stage.append(left, pivot, right);
  element.replaceChildren(stage);
}

function modeSupportsFocusAnchorOverlay(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'flash'].includes(mode);
}

function applyFocusAnchorReaderClearance() {
  const overlay = app.querySelector('#focus-anchor-overlay');
  const frame = overlay?.closest('.reader-frame');
  const reader = frame?.querySelector('.interactive-reader');
  if (!overlay || !frame || !reader || overlay.hidden) {
    if (reader) {
      reader.classList.remove('focus-anchor-clearance');
      reader.style.removeProperty('--focus-anchor-clearance');
    }
    return;
  }

  // Only reserve top space while the anchor is in the upper portion of the viewer.
  // If the reader intentionally drags it lower, do not push half the book off screen.
  const frameRect = frame.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const overlayCenterY = overlayRect.top + (overlayRect.height / 2);
  const relativeCenter = overlayCenterY - frameRect.top;
  if (relativeCenter > frameRect.height * 0.38) {
    reader.classList.remove('focus-anchor-clearance');
    reader.style.removeProperty('--focus-anchor-clearance');
    return;
  }

  const clearance = Math.max(72, Math.ceil(overlayRect.bottom - frameRect.top + 14));
  reader.classList.add('focus-anchor-clearance');
  reader.style.setProperty('--focus-anchor-clearance', `${clearance}px`);
}

function applyFocusAnchorPosition(overlay) {
  const position = state.focusAnchorPosition;
  if (overlay && position) {
    overlay.style.left = `${Math.max(0, Math.min(100, position.x))}%`;
    overlay.style.top = `${Math.max(0, Math.min(100, position.y))}%`;
    overlay.style.transform = 'translate(-50%, -50%)';
  }
  requestAnimationFrame(applyFocusAnchorReaderClearance);
}

function bindDraggableFocusAnchor(overlay) {
  if (!overlay || overlay.dataset.dragBound === 'true') return;
  overlay.dataset.dragBound = 'true';
  overlay.addEventListener('pointerdown', (event) => {
    if (overlay.hidden) return;
    const frame = overlay.closest('.reader-frame');
    if (!frame) return;
    event.preventDefault();
    overlay.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      const rect = frame.getBoundingClientRect();
      const x = ((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((moveEvent.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      state.focusAnchorPosition = { x: Math.max(3, Math.min(97, x)), y: Math.max(5, Math.min(95, y)) };
      applyFocusAnchorPosition(overlay);
    };
    const stop = () => {
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerup', stop);
      overlay.removeEventListener('pointercancel', stop);
      persistReaderSession({ immediate: true });
    };
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', stop);
    overlay.addEventListener('pointercancel', stop);
  });
}

function updateFocusAnchorOverlay(words = []) {
  const overlay = app.querySelector('#focus-anchor-overlay');
  const mode = getSelectedMode();
  if (!overlay) return;
  const enabled = Boolean(state.focusAnchor) && modeSupportsFocusAnchorOverlay(mode) && mode !== 'flash';
  overlay.hidden = !enabled;
  if (!enabled) {
    overlay.replaceChildren();
    applyFocusAnchorReaderClearance();
    return;
  }
  const fontSize = Math.max(10, Number(app.querySelector('#focus-anchor-font-size')?.value || state.focusAnchorFontSize || 24));
  overlay.style.fontSize = `${fontSize}px`;
  bindDraggableFocusAnchor(overlay);
  applyFocusAnchorPosition(overlay);
  if (words.length) renderFocusAnchorPhrase(overlay, words);
  requestAnimationFrame(applyFocusAnchorReaderClearance);
}

async function loadLocalText(key) {
  const source = sources[key];
  if (!source) throw new Error('Unknown reading selection.');
  const response = await fetch(source.path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${source.path}. Copy the matching book text file into public/texts/.`);
  }
  return { title: source.title, text: await response.text() };
}

async function loadApiPayload(endpoint, options) {
  const response = await fetch(endpoint, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

async function loadApiText(endpoint, options) {
  return (await loadApiPayload(endpoint, options)).text;
}

function rememberReaderForReturn() {
  if (!state.words.length || !state.title) return;
  state.returnIndex = Math.max(0, state.index || 0);
  state.returnMode = getSelectedMode?.() || state.renderedMode || 'highlight';
  state.returnWasRunning = isReaderRunning();
  persistReaderSession({ immediate: true });
}

function applyReaderSessionSnapshot(snapshot, { resumePlayback = true } = {}) {
  if (!snapshot?.title || !snapshot?.currentText) return false;
  const controls = snapshot.controls || {};
  renderReaderWithText(snapshot.title, snapshot.currentText, snapshot.source || { type: 'restored' });
  state.originalText = snapshot.originalText || snapshot.currentText;
  state.language = snapshot.language || 'en';
  readerEngine.setPosition(snapshot.index || 0);
  state.wpm = Number(controls.wpm || snapshot.wpm || 300);
  state.bionic = Boolean(controls.bionic ?? snapshot.bionic);
  state.meaningfulChunks = Boolean(controls.meaningfulChunks ?? snapshot.meaningfulChunks);
  state.focusAnchor = Boolean(controls.focusAnchor ?? snapshot.focusAnchor);
  state.focusAnchorPosition = controls.focusAnchorPosition || snapshot.focusAnchorPosition || null;
  state.focusAnchorFontSize = Number(controls.focusAnchorFontSize || snapshot.focusAnchorFontSize || 24);
  state.bookPages = Boolean(controls.bookPages ?? snapshot.bookPages);
  state.illustrationMode = controls.illustrationMode || snapshot.illustrationMode || 'off';
  state.returnIndex = state.index;
  state.returnMode = controls.mode || snapshot.mode || 'highlight';
  state.returnWasRunning = Boolean(snapshot.wasRunning);

  const values = {
    '#mode-select': state.returnMode,
    '#speed': state.wpm,
    '#word-count': Number(controls.wordCount || 1),
    '#font-family': controls.fontFamily || 'system',
    '#font-size': Number(controls.fontSize || 14),
    '#theme-select': controls.theme || 'dark',
    '#illustration-mode': state.illustrationMode
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = app.querySelector(selector);
    if (element) element.value = String(value);
  });
  const checks = {
    '#bionic-reading': state.bionic,
    '#meaningful-chunks': state.meaningfulChunks,
    '#focus-anchor': state.focusAnchor,
    '#book-pages': state.bookPages
  };
  Object.entries(checks).forEach(([selector, checked]) => {
    const element = app.querySelector(selector);
    if (element) element.checked = Boolean(checked);
  });

  const reader = app.querySelector('#reader');
  if (reader) {
    reader.style.fontSize = `${Number(controls.fontSize || 14)}px`;
    reader.classList.toggle('light', (controls.theme || 'dark') === 'light');
  }
  prepareReaderView(state.returnMode, Number(controls.wordCount || 1));
  updateModeControls(state.returnMode);
  window.setTimeout(() => {
    const activeReader = app.querySelector('#reader');
    if (activeReader) {
      ensureWordsRendered(activeReader, state.returnMode, Number(controls.wordCount || 1), state.index + 100);
      const target = activeReader.querySelector(`.reader-word[data-index="${state.index}"]`) || activeReader.querySelector(`.reader-group[data-start-index="${state.index}"]`);
      target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    updateReaderStatus(`Resumed at word ${(state.index + 1).toLocaleString()}.`);
    if (resumePlayback && snapshot.wasRunning) startReader();
  }, 0);
  return true;
}

function renderCurrentReader() {
  if (!state.words.length || !state.title || !state.currentText) {
    readReaderSession().then((saved) => {
      if (!applyReaderSessionSnapshot(saved)) renderError('No reading session', 'Load a book, article, or text file first.');
    });
    return;
  }
  const snapshot = buildReaderSessionSnapshot() || {
    title: state.title,
    currentText: state.currentText,
    originalText: state.originalText,
    source: state.source,
    language: state.language,
    index: state.returnIndex ?? state.index,
    wasRunning: state.returnWasRunning,
    controls: captureReaderControls()
  };
  snapshot.index = Math.max(0, state.returnIndex ?? state.index ?? 0);
  snapshot.wasRunning = Boolean(state.returnWasRunning);
  snapshot.controls.mode = state.returnMode || snapshot.controls.mode;
  applyReaderSessionSnapshot(snapshot);
}

function renderHome() {
  stopReader();
  app.innerHTML = `
    <section class="hero">
      <div>
        <div class="hero-mark" aria-hidden="true">📖</div>
        <h1>Mark, Set, Go!</h1>
        <p>Measure your reading speed, then practice with flash, marquee, digital-sign scrolling, guided highlighting, two-column reading, or automatic scrolling at a controlled words-per-minute rate.</p>
        <button class="primary" data-start-home>Start a WPM test</button>
      </div>
    </section>`;
  app.querySelector('[data-start-home]').addEventListener('click', () => renderWpmTest('gatsby'));
}

async function renderWpmTest(key) {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>Loading…</h1><p class="status">Preparing the reading test.</p></section>`;
  try {
    const { title, text } = await loadLocalText(key);
    const words = splitWords(text).slice(0, 250);
    if (words.length < 250) throw new Error('This WPM test requires a text file containing at least 250 words.');

    app.innerHTML = `
      <section class="panel">
        <h1>WPM Test: ${escapeHtml(title)}</h1>
        <div class="controls">
          <div class="control">
            <span class="label">Theme</span>
            <div class="segmented">
              <label><input type="radio" name="theme" value="light">Light</label>
              <label><input type="radio" name="theme" value="dark" checked>Dark</label>
            </div>
          </div>
          <div class="control">
            <label for="font-size">Font size</label>
            <select id="font-size">${fontOptions(14)}</select>
          </div>
        </div>
        <article id="reader" class="reader" style="font-size:14px">${escapeHtml(words.join(' '))}</article>
        <div class="controls">
          <button id="start-test" class="primary">GO!</button>
          <button id="stop-test" class="danger" disabled>Stop</button>
          <span id="test-status" class="status">Press GO!, read the passage, then press Stop.</span>
        </div>
      </section>`;

    const reader = app.querySelector('#reader');
    bindAppearance(reader);
    const start = app.querySelector('#start-test');
    const stop = app.querySelector('#stop-test');
    const status = app.querySelector('#test-status');
    let startedAt = 0;

    start.addEventListener('click', () => {
      startedAt = performance.now();
      start.disabled = true;
      stop.disabled = false;
      status.textContent = 'Begin reading…';
    });

    stop.addEventListener('click', () => {
      if (!startedAt) return;
      const elapsedMinutes = (performance.now() - startedAt) / 60000;
      const measured = Math.max(1, Math.round(words.length / elapsedMinutes));
      state.wpm = measured;
      start.disabled = false;
      stop.disabled = true;
      startedAt = 0;
      status.innerHTML = `<span class="wpm-result">Your speed: ${measured.toLocaleString()} WPM</span>`;
    });
  } catch (error) {
    renderError('WPM test unavailable', error.message);
  }
}

function fontOptions(selected) {
  return Array.from({ length: 14 }, (_, i) => 10 + i * 2)
    .map((size) => `<option value="${size}" ${size === selected ? 'selected' : ''}>${size}px</option>`)
    .join('');
}

function bindAppearance(reader) {
  const font = app.querySelector('#font-size');
  font?.addEventListener('change', () => {
    const snapshot = captureReaderLocation();
    reader.style.fontSize = `${font.value}px`;
    restoreCapturedReaderLocation(snapshot);
  });

  const fontFamily = app.querySelector('#font-family');
  const fontFamilies = {
    system: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
    georgia: 'Georgia, "Times New Roman", serif',
    verdana: 'Verdana, Geneva, sans-serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif',
    monospace: 'Consolas, "Courier New", monospace',
    dyslexic: '"Arial", "Verdana", sans-serif'
  };
  const applyFontFamily = () => {
    if (!fontFamily) return;
    reader.style.fontFamily = fontFamilies[fontFamily.value] || fontFamilies.system;
    reader.classList.toggle('dyslexia-friendly-font', fontFamily.value === 'dyslexic');
  };
  fontFamily?.addEventListener('change', () => {
    const snapshot = captureReaderLocation();
    applyFontFamily();
    restoreCapturedReaderLocation(snapshot);
  });
  applyFontFamily();

  const bookPages = app.querySelector('#book-pages');
  const applyBookPages = () => {
    const mode = getSelectedMode();
    state.bookPages = Boolean(bookPages?.checked) && modeSupportsBookPages(mode);
    reader.classList.toggle('book-pages-layout', state.bookPages);
    updateBookPageControls();
    window.requestAnimationFrame(() => updateBookPageStatus());
  };
  bookPages?.addEventListener('change', () => {
    const snapshot = captureReaderLocation();
    stopReader();
    applyBookPages();
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    state.index = snapshot.anchorIndex;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  applyBookPages();

  const themeSelect = app.querySelector('#theme-select');
  if (themeSelect) {
    const applyTheme = () => reader.classList.toggle('light', themeSelect.value === 'light');
    themeSelect.addEventListener('change', applyTheme);
    applyTheme();
    return;
  }

  app.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => reader.classList.toggle('light', input.value === 'light'));
  });
}

function getSelectedMode() {
  return app.querySelector('#mode-select')?.value
    || app.querySelector('input[name="mode"]:checked')?.value
    || 'highlight';
}

function isReaderRunning() {
  if (state.renderedMode === 'digital-sign') {
    return Boolean(state.tickerFrame) && !state.tickerPaused;
  }
  return Boolean(state.interval);
}


const BOOKMARK_STORAGE_KEY = 'markSetGoBookmarksV1';
const NOTE_STORAGE_KEY = 'markSetGoNotesV1';
const READING_LIST_STORAGE_KEY = 'markSetGoReadingListV1';
const DOCUMENT_STORAGE_PREFIX = 'markSetGoDocumentV1:';
const SAVED_DEFINITIONS_KEY = 'markSetGoDefinitionsV1';

const READING_PROGRESS_KEY = 'markSetGoReadingProgressV1';
const READING_ACTIVITY_KEY = 'markSetGoReadingActivityV1';

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function readStoredObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function beginReadingSession() {
  if (state.sessionActive || !state.documentId || !state.words.length) return;
  state.sessionActive = true;
  state.sessionStartedAt = Date.now();
  state.sessionStartIndex = Math.max(0, state.index || 0);
}

function finalizeReadingSession() {
  if (!state.sessionActive) return;
  const endedAt = Date.now();
  const seconds = Math.max(0, Math.round((endedAt - state.sessionStartedAt) / 1000));
  const endIndex = Math.max(0, Math.min(state.words.length, state.index || 0));
  const wordsRead = Math.max(0, endIndex - state.sessionStartIndex);
  state.sessionActive = false;
  if (seconds < 2 && wordsRead < 1) return;

  const activity = readStoredArray(READING_ACTIVITY_KEY);
  activity.unshift({
    id: `session-${endedAt}-${Math.random().toString(36).slice(2, 7)}`,
    documentId: state.documentId,
    title: state.title,
    startedAt: new Date(state.sessionStartedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    seconds,
    wordsRead,
    startIndex: state.sessionStartIndex,
    endIndex,
    totalWords: state.words.length,
    mode: state.renderedMode || getSelectedMode()
  });
  localStorage.setItem(READING_ACTIVITY_KEY, JSON.stringify(activity.slice(0, 500)));

  const progress = readStoredObject(READING_PROGRESS_KEY);
  const existing = progress[state.documentId] || {};
  progress[state.documentId] = {
    documentId: state.documentId,
    title: state.title,
    totalWords: state.words.length,
    furthestWord: Math.max(Number(existing.furthestWord) || 0, endIndex),
    lastWord: endIndex,
    totalSeconds: (Number(existing.totalSeconds) || 0) + seconds,
    totalWordsRead: (Number(existing.totalWordsRead) || 0) + wordsRead,
    sessions: (Number(existing.sessions) || 0) + 1,
    lastReadAt: new Date(endedAt).toISOString(),
    source: state.source
  };
  localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${total}s`;
}

function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function readingStreak(activity) {
  const days = new Set(activity.filter((item) => Number(item.wordsRead) > 0 || Number(item.seconds) >= 60).map((item) => dateKey(item.endedAt)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderProgressDashboard() {
  finalizeReadingSession();
  stopReader();
  const activity = readStoredArray(READING_ACTIVITY_KEY);
  const progress = Object.values(readStoredObject(READING_PROGRESS_KEY));
  const today = dateKey(new Date());
  const todaySessions = activity.filter((item) => dateKey(item.endedAt) === today);
  const totalWords = todaySessions.reduce((sum, item) => sum + (Number(item.wordsRead) || 0), 0);
  const totalSeconds = todaySessions.reduce((sum, item) => sum + (Number(item.seconds) || 0), 0);
  const averageWpm = totalSeconds ? Math.round(totalWords / (totalSeconds / 60)) : 0;
  const streak = readingStreak(activity);
  const recentBooks = progress.sort((a,b) => new Date(b.lastReadAt || 0) - new Date(a.lastReadAt || 0)).slice(0, 8);

  app.innerHTML = `<section class="panel progress-dashboard">
    <div class="library-heading"><div><h1>Reading Progress</h1><p>Your reading activity is stored privately in this browser.</p></div><button id="clear-reading-progress" class="secondary" type="button">Clear history</button></div>
    <div class="dashboard-stats">
      <article><span>Today</span><strong>${totalWords.toLocaleString()}</strong><small>words</small></article>
      <article><span>Reading time</span><strong>${formatDuration(totalSeconds)}</strong><small>today</small></article>
      <article><span>Average pace</span><strong>${averageWpm || '—'}</strong><small>WPM today</small></article>
      <article><span>Current streak</span><strong>${streak}</strong><small>${streak === 1 ? 'day' : 'days'}</small></article>
    </div>
    <section class="dashboard-section"><h2>Books and documents</h2>
      <div class="progress-book-list">${recentBooks.length ? recentBooks.map((item) => {
        const percent = item.totalWords ? Math.min(100, Math.round((Number(item.furthestWord)||0) / item.totalWords * 100)) : 0;
        const wpm = item.totalSeconds ? Math.round((Number(item.totalWordsRead)||0) / (item.totalSeconds / 60)) : 0;
        return `<article class="progress-book-card"><div><h3>${escapeHtml(item.title || 'Untitled')}</h3><p>${percent}% complete · ${formatDuration(item.totalSeconds)} · ${Number(item.sessions)||0} sessions${wpm ? ` · ${wpm} WPM` : ''}</p></div><div class="progress-meter"><span style="width:${percent}%"></span></div><button class="secondary" type="button" data-progress-open="${escapeHtml(item.documentId)}">Open saved text</button></article>`;
      }).join('') : '<p class="navigation-empty">Complete a reading session to begin tracking progress.</p>'}</div>
    </section>
    <section class="dashboard-section"><h2>Recent sessions</h2>
      <div class="activity-list">${activity.slice(0,12).map((item) => `<article><div><strong>${escapeHtml(item.title || 'Untitled')}</strong><span>${new Date(item.endedAt).toLocaleString()}</span></div><p>${Number(item.wordsRead).toLocaleString()} words · ${formatDuration(item.seconds)}${item.seconds ? ` · ${Math.round(item.wordsRead/(item.seconds/60))} WPM` : ''}</p></article>`).join('') || '<p class="navigation-empty">No sessions recorded yet.</p>'}</div>
    </section>
  </section>`;
  app.querySelector('#clear-reading-progress')?.addEventListener('click', () => {
    if (!window.confirm('Clear all reading progress and session history from this browser?')) return;
    localStorage.removeItem(READING_PROGRESS_KEY); localStorage.removeItem(READING_ACTIVITY_KEY); renderProgressDashboard();
  });
  app.querySelectorAll('[data-progress-open]').forEach((button) => button.addEventListener('click', async () => {
    const documentId = button.dataset.progressOpen;
    let data = null;
    try { data = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`) || 'null'); } catch {}
    if (!data?.text) return window.alert('That text is not stored in this browser. Open it again from its original library.');
    renderReaderWithText(data.title, data.text, data.source || {type:'saved'});
    const record = readStoredObject(READING_PROGRESS_KEY)[documentId];
    requestAnimationFrame(() => jumpToWordIndex(record?.lastWord || 0));
  }));
}

function vocabularyDue(item) {
  return !item.nextReviewAt || new Date(item.nextReviewAt).getTime() <= Date.now();
}

function updateVocabularyRating(id, rating) {
  const items = getSavedDefinitions();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  const intervals = { again: 0, hard: 1, good: Math.max(3, (Number(item.intervalDays)||0) * 2 || 3), easy: Math.max(7, (Number(item.intervalDays)||0) * 3 || 7) };
  const days = intervals[rating] ?? 1;
  item.reviewCount = (Number(item.reviewCount) || 0) + 1;
  item.lastRating = rating;
  item.intervalDays = days;
  item.lastReviewedAt = new Date().toISOString();
  item.nextReviewAt = new Date(Date.now() + days * 86400000).toISOString();
  item.mastery = rating === 'again' ? 'learning' : rating === 'hard' ? 'familiar' : rating === 'easy' && item.reviewCount >= 3 ? 'mastered' : 'learning';
  saveDefinitions(items);
  renderVocabularyBuilder();
}

function renderVocabularyBuilder() {
  finalizeReadingSession();
  stopReader();
  const items = getSavedDefinitions().sort((a,b) => (vocabularyDue(b)?1:0) - (vocabularyDue(a)?1:0) || new Date(b.createdAt||0)-new Date(a.createdAt||0));
  const due = items.filter(vocabularyDue);
  const mastered = items.filter((item) => item.mastery === 'mastered').length;
  app.innerHTML = `<section class="panel vocabulary-builder">
    <div class="library-heading"><div><h1>Vocabulary Builder</h1><p>Review words you saved while reading. Rate each card to schedule its next review.</p></div></div>
    <div class="dashboard-stats vocabulary-stats"><article><span>Saved</span><strong>${items.length}</strong><small>words</small></article><article><span>Due now</span><strong>${due.length}</strong><small>reviews</small></article><article><span>Mastered</span><strong>${mastered}</strong><small>words</small></article></div>
    <div class="vocabulary-toolbar"><input id="vocabulary-search" type="search" placeholder="Search saved words or definitions"><select id="vocabulary-filter"><option value="all">All words</option><option value="due">Due now</option><option value="learning">Learning</option><option value="familiar">Familiar</option><option value="mastered">Mastered</option></select></div>
    <div id="vocabulary-list" class="vocabulary-list"></div>
  </section>`;
  const list = app.querySelector('#vocabulary-list');
  const renderList = () => {
    const query = (app.querySelector('#vocabulary-search')?.value || '').trim().toLowerCase();
    const filter = app.querySelector('#vocabulary-filter')?.value || 'all';
    const filtered = items.filter((item) => {
      const matches = !query || `${item.word} ${item.definition} ${item.title}`.toLowerCase().includes(query);
      const status = item.mastery || 'learning';
      return matches && (filter === 'all' || (filter === 'due' ? vocabularyDue(item) : status === filter));
    });
    list.innerHTML = filtered.length ? filtered.map((item) => `<article class="vocabulary-card ${vocabularyDue(item)?'due':''}">
      <div class="vocabulary-card-head"><div><h2>${escapeHtml(item.word)}</h2><span>${escapeHtml(item.partOfSpeech || item.mastery || 'learning')}</span></div><button type="button" class="bookmark-remove" data-vocab-delete="${escapeHtml(item.id)}" aria-label="Delete word">×</button></div>
      <p>${escapeHtml(item.definition)}</p>${item.example ? `<blockquote>${escapeHtml(item.example)}</blockquote>` : ''}<small>From ${escapeHtml(item.title || 'a reading')} · ${vocabularyDue(item) ? 'Due now' : `Next review ${new Date(item.nextReviewAt).toLocaleDateString()}`}</small>
      <div class="vocabulary-rating"><button data-vocab-rate="again" data-vocab-id="${escapeHtml(item.id)}">Again</button><button data-vocab-rate="hard" data-vocab-id="${escapeHtml(item.id)}">Hard</button><button data-vocab-rate="good" data-vocab-id="${escapeHtml(item.id)}">Good</button><button data-vocab-rate="easy" data-vocab-id="${escapeHtml(item.id)}">Easy</button></div>
    </article>`).join('') : '<p class="navigation-empty">No saved words match this view. Right-click a word while reading and choose Save definition.</p>';
    list.querySelectorAll('[data-vocab-rate]').forEach((button) => button.addEventListener('click', () => updateVocabularyRating(button.dataset.vocabId, button.dataset.vocabRate)));
    list.querySelectorAll('[data-vocab-delete]').forEach((button) => button.addEventListener('click', () => { removeSavedDefinition(button.dataset.vocabDelete); renderVocabularyBuilder(); }));
  };
  app.querySelector('#vocabulary-search')?.addEventListener('input', renderList);
  app.querySelector('#vocabulary-filter')?.addEventListener('change', renderList);
  renderList();
}

function normalizeLookupWord(value) {
  return String(value || '').replace(/^[^\p{L}'’-]+|[^\p{L}'’-]+$/gu, '').toLocaleLowerCase();
}

function getSavedDefinitions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_DEFINITIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDefinitions(items) {
  localStorage.setItem(SAVED_DEFINITIONS_KEY, JSON.stringify(items.slice(0, 100)));
}

function definitionsForCurrentDocument() {
  return getSavedDefinitions().filter((item) => item.documentId === state.documentId);
}

function savedDefinitionAt(index) {
  return definitionsForCurrentDocument().find((item) => Number(item.wordIndex) === Number(index));
}

function applySavedDefinitionHighlights() {
  if (!state.documentId) return;
  const indexes = new Set(definitionsForCurrentDocument().map((item) => String(item.wordIndex)));
  app.querySelectorAll('.reader-word[data-index]').forEach((element) => {
    element.classList.toggle('saved-definition-word', indexes.has(element.dataset.index));
  });
}

function removeSavedDefinition(id) {
  saveDefinitions(getSavedDefinitions().filter((item) => item.id !== id));
  renderNavigationPane();
  applySavedDefinitionHighlights();
}

function openSavedDefinition(id) {
  const item = getSavedDefinitions().find((entry) => entry.id === id);
  if (!item) return;
  if (item.documentId === state.documentId) jumpToWordIndex(item.wordIndex);
  showDictionaryResult(item.word, item.definition, item.partOfSpeech, item.example, true);
}



function getNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveNotes(notes) {
  const trimmed = notes.slice(0, 200);
  localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(trimmed));
  const ids = trimmed.slice(0, 30).map((item) => item.id).join(',');
  document.cookie = `markSetGoNotes=${encodeURIComponent(ids)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function notesForCurrentDocument() {
  return getNotes().filter((item) => item.documentId === state.documentId);
}

function noteAt(index) {
  return notesForCurrentDocument().some((item) => Number(item.wordIndex) === Number(index));
}

function ensureNoteDialog() {
  let dialog = document.querySelector('#reader-note-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'reader-note-dialog';
  dialog.className = 'reader-note-dialog';
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function showNoteEditor(context = state.contextWord, existing = null) {
  if (!context) return;
  const dialog = ensureNoteDialog();
  state.activeNoteId = existing?.id || null;
  dialog.innerHTML = `
    <form method="dialog" class="note-dialog-card">
      <div class="note-dialog-heading">
        <div><h2>${existing ? 'Edit note' : 'Add note'}</h2><p>At “${escapeHtml(context.word)}” · word ${Number(context.index).toLocaleString()}</p></div>
        <button class="note-dialog-close" value="cancel" aria-label="Close note editor">×</button>
      </div>
      <label for="reader-note-text">Your note</label>
      <textarea id="reader-note-text" rows="8" placeholder="Write an observation, question, quotation, or reminder…">${escapeHtml(existing?.note || '')}</textarea>
      <p id="note-editor-status" class="status"></p>
      <div class="note-dialog-actions">
        ${existing ? '<button id="delete-reader-note" class="danger" type="button">Delete</button>' : ''}
        <span></span>
        <button class="secondary" value="cancel">Cancel</button>
        <button id="save-reader-note" class="primary" type="button">Save note</button>
      </div>
    </form>`;
  dialog.querySelector('#save-reader-note')?.addEventListener('click', () => saveReaderNote(context, dialog));
  dialog.querySelector('#delete-reader-note')?.addEventListener('click', () => {
    if (state.activeNoteId) removeNote(state.activeNoteId);
    dialog.close();
  });
  if (!dialog.open) dialog.showModal();
  window.setTimeout(() => dialog.querySelector('#reader-note-text')?.focus(), 0);
}

function saveReaderNote(context, dialog = ensureNoteDialog()) {
  if (!state.documentId) return;
  const textarea = dialog.querySelector('#reader-note-text');
  const note = textarea?.value.trim();
  const status = dialog.querySelector('#note-editor-status');
  if (!note) {
    if (status) { status.className = 'status error'; status.textContent = 'Enter a note before saving.'; }
    return;
  }
  persistCurrentDocument();
  const notes = getNotes();
  const existing = notes.find((item) => item.id === state.activeNoteId);
  const item = {
    id: existing?.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentId: state.documentId,
    title: state.title,
    word: context.word,
    wordIndex: Number(context.index),
    note,
    source: state.source,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveNotes([item, ...notes.filter((entry) => entry.id !== item.id)]);
  const renderedWord = app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`);
  renderedWord?.classList.add('saved-note-word');
  renderNavigationPane();
  state.activeNoteId = item.id;
  if (status) { status.className = 'status'; status.textContent = 'Note saved.'; }
  window.setTimeout(() => dialog.close(), 250);
}

function removeNote(id) {
  const item = getNotes().find((entry) => entry.id === id);
  saveNotes(getNotes().filter((entry) => entry.id !== id));
  if (item?.documentId === state.documentId) {
    app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`)?.classList.remove('saved-note-word');
  }
  renderNavigationPane();
}

function openSavedNote(id) {
  const item = getNotes().find((entry) => entry.id === id);
  if (!item) return;
  if (item.documentId === state.documentId) {
    jumpToWordIndex(item.wordIndex);
    requestAnimationFrame(() => {
      const element = app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`);
      showNoteEditor({ word: item.word, index: item.wordIndex, element }, item);
    });
  } else {
    const dialog = ensureNoteDialog();
    dialog.innerHTML = `<form method="dialog" class="note-dialog-card"><div class="note-dialog-heading"><div><h2>${escapeHtml(item.title)}</h2><p>At “${escapeHtml(item.word)}” · word ${Number(item.wordIndex).toLocaleString()}</p></div><button class="note-dialog-close" value="cancel">×</button></div><div class="saved-note-body">${escapeHtml(item.note)}</div><p class="status">Open the related bookmark or text to return to this location.</p><div class="note-dialog-actions"><span></span><button class="primary" value="cancel">Close</button></div></form>`;
    if (!dialog.open) dialog.showModal();
  }
}

function getReadingList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READING_LIST_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveReadingList(items) {
  const trimmed = items.slice(0, 500);
  localStorage.setItem(READING_LIST_STORAGE_KEY, JSON.stringify(trimmed));
  const ids = trimmed.slice(0, 40).map((item) => item.id).join(',');
  document.cookie = `markSetGoReadingList=${encodeURIComponent(ids)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function renderReadingList() {
  stopReader();
  const items = getReadingList();
  const groups = [
    ['want-to-read', 'Want to Read'],
    ['reading', 'Currently Reading'],
    ['finished', 'Finished']
  ];
  app.innerHTML = `
    <section class="panel reading-list-page">
      <div class="library-heading"><div><h1>My Reading List</h1><p>Keep track of books you want to read, are reading now, or have finished.</p></div></div>
      <blockquote class="reading-list-quote">“I cannot live without books.” <cite>— Thomas Jefferson</cite></blockquote>
      <form id="reading-list-form" class="reading-list-form">
        <label>Title<input id="reading-list-title" required placeholder="Book title"></label>
        <label>Author<input id="reading-list-author" placeholder="Author"></label>
        <label>Status<select id="reading-list-status"><option value="want-to-read">Want to Read</option><option value="reading">Currently Reading</option><option value="finished">Finished</option></select></label>
        <label class="reading-list-note-field">Notes<input id="reading-list-note" placeholder="Optional note"></label>
        <button class="primary" type="submit">Add book</button>
        ${state.title && state.words.length ? '<button id="add-current-reading" class="secondary" type="button">Add current text</button>' : ''}
      </form>
      <p id="reading-list-status-message" class="status"></p>
      <div class="reading-list-groups">
        ${groups.map(([key, label]) => {
          const groupItems = items.filter((item) => item.status === key);
          return `<section class="reading-list-group"><h2>${label} <span>${groupItems.length}</span></h2><div class="reading-list-items">${groupItems.length ? groupItems.map((item) => `
            <article class="reading-list-item" data-reading-item="${escapeHtml(item.id)}">
              <div><h3><button class="reading-title-link" type="button" data-free-text-item="${escapeHtml(item.id)}" data-free-text-title="${escapeHtml(item.title)}" data-free-text-author="${escapeHtml(item.author || '')}">${escapeHtml(item.title)}</button></h3><p>${escapeHtml(item.author || 'Author not entered')}</p><div class="free-text-links" data-free-text-links="${escapeHtml(item.id)}"><span>Checking free editions…</span></div>${item.note ? `<p class="reading-list-item-note">${escapeHtml(item.note)}</p>` : ''}${bookMusicMarkup(item.title, item.author || '')}</div>
              <label>Status<select data-reading-status="${escapeHtml(item.id)}"><option value="want-to-read" ${item.status === 'want-to-read' ? 'selected' : ''}>Want to Read</option><option value="reading" ${item.status === 'reading' ? 'selected' : ''}>Currently Reading</option><option value="finished" ${item.status === 'finished' ? 'selected' : ''}>Finished</option></select></label>
              <button class="bookmark-remove" type="button" data-remove-reading="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}">×</button>
            </article>`).join('') : '<p class="navigation-empty">No books in this section.</p>'}</div></section>`;
        }).join('')}
      </div>
    </section>`;

  async function resolveFreeTextForItem(item) {
    const container = app.querySelector(`[data-free-text-links="${CSS.escape(item.id)}"]`);
    const titleButton = app.querySelector(`[data-free-text-item="${CSS.escape(item.id)}"]`);
    if (!container) return;
    try {
      const payload = await loadApiPayload(`/api/free-text/search?title=${encodeURIComponent(item.title)}&author=${encodeURIComponent(item.author || '')}`);
      if (payload.found && payload.book?.id) {
        container.innerHTML = `<button class="free-text-open" type="button" data-free-gutenberg-id="${Number(payload.book.id)}">Read free on Project Gutenberg</button><a href="${escapeHtml(payload.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`;
        titleButton?.setAttribute('data-free-gutenberg-id', String(payload.book.id));
        titleButton?.setAttribute('title', 'Open the free Project Gutenberg text');
      } else {
        const alternatives = Array.isArray(payload.alternatives) ? payload.alternatives : [];
        container.innerHTML = alternatives.length
          ? alternatives.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">Search ${escapeHtml(link.provider)}</a>`).join('')
          : '<span>No free edition was found.</span>';
        titleButton?.setAttribute('title', 'No direct Gutenberg edition found; use the free-source links below');
      }
    } catch {
      container.innerHTML = '<button class="free-text-retry" type="button">Retry free-text search</button>';
      container.querySelector('.free-text-retry')?.addEventListener('click', () => resolveFreeTextForItem(item));
    }
  }

  async function openGutenbergFromReadingList(id) {
    const status = app.querySelector('#reading-list-status-message');
    if (status) { status.className = 'status'; status.textContent = 'Loading the free text…'; }
    try {
      const loaded = await loadApiPayload(`/api/gutenberg/books/${Number(id)}/text`);
      const author = loaded.authors?.length ? ` — ${loaded.authors.join(', ')}` : '';
      renderReaderWithText(`${loaded.title}${author}`, loaded.text, { type: 'gutenberg', id: loaded.id, sourceUrl: loaded.sourceUrl });
    } catch (error) {
      if (status) { status.className = 'status error'; status.textContent = error?.message || 'The free text could not be loaded.'; }
    }
  }

  items.forEach((item) => resolveFreeTextForItem(item));
  app.querySelector('.reading-list-page')?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-free-gutenberg-id]');
    if (target) openGutenbergFromReadingList(target.dataset.freeGutenbergId);
  });

  const addItem = (title, author = '', status = 'want-to-read', note = '', source = null) => {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return;
    const current = getReadingList();
    const item = { id: `reading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: cleanTitle, author: String(author || '').trim(), status, note: String(note || '').trim(), source, addedAt: new Date().toISOString() };
    saveReadingList([item, ...current]);
    renderReadingList();
  };
  app.querySelector('#reading-list-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addItem(app.querySelector('#reading-list-title').value, app.querySelector('#reading-list-author').value, app.querySelector('#reading-list-status').value, app.querySelector('#reading-list-note').value);
  });
  app.querySelector('#add-current-reading')?.addEventListener('click', () => addItem(state.title, state.source?.author || '', 'reading', '', state.source));
  app.querySelectorAll('[data-reading-status]').forEach((select) => select.addEventListener('change', () => {
    const updated = getReadingList().map((item) => item.id === select.dataset.readingStatus ? { ...item, status: select.value, updatedAt: new Date().toISOString() } : item);
    saveReadingList(updated); renderReadingList();
  }));
  app.querySelectorAll('[data-remove-reading]').forEach((button) => button.addEventListener('click', () => {
    saveReadingList(getReadingList().filter((item) => item.id !== button.dataset.removeReading)); renderReadingList();
  }));
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function documentIdFor(title, text) {
  return simpleHash(`${title}|${text.length}|${text.slice(0, 1000)}`);
}

function setBookmarkCookie(bookmarks) {
  const ids = bookmarks.slice(0, 20).map((item) => item.id).join(',');
  document.cookie = `markSetGoBookmarks=${encodeURIComponent(ids)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function getBookmarks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  const trimmed = bookmarks.slice(0, 20);
  localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(trimmed));
  setBookmarkCookie(trimmed);
}

function persistCurrentDocument() {
  if (!state.documentId || !state.currentText) return false;
  const key = `${DOCUMENT_STORAGE_PREFIX}${state.documentId}`;
  try {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({
        title: state.title,
        text: state.currentText,
        source: state.source
      }));
    }
    return true;
  } catch (error) {
    console.warn('Document could not be stored for bookmarks.', error);
    return false;
  }
}

function classifyStructureLine(line, wordCount) {
  const clean = line.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 150 || wordCount > 22) return null;

  const lower = clean.toLowerCase().replace(/[.:]+$/, '').trim();
  const exactTypes = new Map([
    ['table of contents', 'contents'], ['contents', 'contents'],
    ['appendix', 'appendix'], ['appendices', 'appendix'],
    ['notes', 'notes'], ['endnotes', 'notes'], ['footnotes', 'notes'],
    ['index', 'index'], ['general index', 'index'],
    ['bibliography', 'bibliography'], ['references', 'bibliography'], ['works cited', 'bibliography'],
    ['preface', 'frontmatter'], ['foreword', 'frontmatter'], ['introduction', 'frontmatter'],
    ['prologue', 'frontmatter'], ['epilogue', 'backmatter'], ['afterword', 'backmatter'],
    ['conclusion', 'backmatter'], ['acknowledgments', 'backmatter'], ['acknowledgements', 'backmatter'],
    ['glossary', 'glossary']
  ]);
  if (exactTypes.has(lower)) return exactTypes.get(lower);

  if (/^(?:chapter|chap\.?)(?:\s+|\s*[ivxlcdm\d]+\b)/i.test(clean)) return 'chapter';
  if (/^(?:book|part)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(clean)) return 'part';
  if (/^(?:section|article)\s+(?:[ivxlcdm]+|\d+|[a-z])\b/i.test(clean)) return 'section';
  if (/^appendix(?:\s+[a-z0-9ivxlcdm]+)?\b/i.test(clean)) return 'appendix';
  if (/^(?:notes?|endnotes?|footnotes?)\s+(?:to|on|for)\b/i.test(clean)) return 'notes';
  if (/^index\s+(?:of|to)\b/i.test(clean)) return 'index';
  if (/^(?:\d+|[ivxlcdm]+)\s*[.):-]\s+\S/i.test(clean) && wordCount <= 14) return 'section';

  const allCaps = clean.length >= 4 && clean.length <= 90
    && /[A-Z]/.test(clean)
    && clean === clean.toUpperCase()
    && !/[.!?]$/.test(clean)
    && wordCount <= 12;
  if (allCaps) return 'section';
  return null;
}

function detectDocumentStructure(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const structures = [];
  let wordIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    const count = splitWords(line).length;
    const type = classifyStructureLine(line, count);
    if (type && count) {
      structures.push({
        title: line,
        type,
        start: wordIndex,
        end: wordIndex + count
      });
    }
    wordIndex += count;
  }

  // Gutenberg texts often repeat chapter titles in an early contents list.
  // Keep all structural markers for formatting, but make body occurrences the
  // preferred TOC target by marking the last repeated normalized title.
  const lastByTitle = new Map();
  structures.forEach((entry, index) => {
    const key = entry.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    lastByTitle.set(key, index);
  });
  structures.forEach((entry, index) => {
    const key = entry.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    entry.preferredToc = lastByTitle.get(key) === index;
  });
  return structures.slice(0, 1000);
}

function normalizeTocTitle(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[.·•…]+\s*\d+\s*$/u, '')
    .replace(/^\s*(?:chapter|chap\.?|part|book|section)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*[:.\-–—]?\s*/iu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function detectTableOfContents(text) {
  const structures = detectDocumentStructure(text);
  const tocTypes = new Set(['chapter', 'part', 'section', 'appendix', 'notes', 'index', 'frontmatter', 'backmatter', 'bibliography', 'glossary']);
  const contentsMarker = structures.find((entry) => entry.type === 'contents' && entry.start < 5000);

  // If the book contains a printed Contents section, use it as a guide but
  // always link each entry to a later, real heading in the body. This prevents
  // the navigation pane from becoming a copy of the printed contents pages.
  if (contentsMarker) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    let running = 0, inContents = false;
    const printed = [];
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, ' ').trim();
      const count = splitWords(line).length;
      if (!inContents && running <= contentsMarker.start + 10 && /^(?:table of contents|contents)$/i.test(line)) {
        inContents = true; running += count; continue;
      }
      if (inContents) {
        if (running > contentsMarker.start + 4500) break;
        if (line && line.length <= 160 && count <= 24) {
          const cleaned = line.replace(/(?:\.{2,}|\s{2,})\s*\d+\s*$/u, '').replace(/\s+\d+\s*$/u, '').trim();
          if (cleaned && !/^(?:contents|table of contents)$/i.test(cleaned)) printed.push(cleaned);
        }
      }
      running += count;
    }

    const bodyCandidates = structures.filter((e) => tocTypes.has(e.type) && e.start > contentsMarker.start + 30);
    const used = new Set();
    const matched = [];
    for (const label of printed) {
      const key = normalizeTocTitle(label);
      if (!key || key.length < 2) continue;
      let candidate = bodyCandidates.find((e) => !used.has(e.start) && normalizeTocTitle(e.title) === key);
      if (!candidate) candidate = bodyCandidates.find((e) => {
        if (used.has(e.start)) return false;
        const bodyKey = normalizeTocTitle(e.title);
        return key.length >= 5 && bodyKey.length >= 5 && (bodyKey.includes(key) || key.includes(bodyKey));
      });
      if (candidate) {
        used.add(candidate.start);
        matched.push({ title: candidate.title, index: candidate.start, type: candidate.type });
      }
    }
    if (matched.length >= 2) return matched.slice(0, 300);
  }

  // Fallback for books without a usable printed Contents section: keep only
  // unique structural headings and prefer their body occurrence.
  const seen = new Set();
  return structures
    .filter((entry) => tocTypes.has(entry.type) && entry.preferredToc)
    .filter((entry) => {
      const key = normalizeTocTitle(entry.title);
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    })
    .map((entry) => ({ title: entry.title, index: entry.start, type: entry.type }))
    .slice(0, 300);
}

function currentReadingPosition() {
  const reader = app.querySelector('#reader');
  if (!reader || !state.words.length) return Math.max(0, state.index || 0);
  if (state.index > 0 && getSelectedMode() !== 'two-column') {
    return Math.min(state.words.length - 1, state.index);
  }
  const scrollRange = Math.max(1, reader.scrollHeight - reader.clientHeight);
  const ratio = Math.max(0, Math.min(1, reader.scrollTop / scrollRange));
  return Math.min(state.words.length - 1, Math.round(ratio * (state.words.length - 1)));
}

function addBookmark() {
  if (!state.words.length) return;
  const stored = persistCurrentDocument();
  const position = currentReadingPosition();
  const bookmarks = getBookmarks();
  const item = {
    id: `${state.documentId}-${Date.now().toString(36)}`,
    documentId: state.documentId,
    title: state.title,
    wordIndex: position,
    mode: getSelectedMode(),
    createdAt: new Date().toISOString(),
    documentStored: stored,
    source: state.source
  };
  bookmarks.unshift(item);
  saveBookmarks(bookmarks);
  renderNavigationPane();
  const status = app.querySelector('#reader-status');
  if (status) status.textContent = stored
    ? `Bookmark saved at word ${position.toLocaleString()}.`
    : 'Bookmark position saved, but this large document could not be stored in this browser.';
}

function removeBookmark(id) {
  saveBookmarks(getBookmarks().filter((bookmark) => bookmark.id !== id));
  renderNavigationPane();
}

function jumpToWordIndex(wordIndex) {
  const index = Math.max(0, Math.min(state.words.length - 1, Number(wordIndex) || 0));
  stopReader();
  state.index = index;
  const mode = getSelectedMode();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;
  prepareReaderView(mode, groupSize);

  requestAnimationFrame(() => {
    const reader = app.querySelector('#reader');
    if (!reader) return;
    if (!['flash', 'digital-sign'].includes(mode)) {
      ensureWordsRendered(reader, mode, groupSize, index + 100);
      const target = reader.querySelector(`.reader-word[data-index="${index}"]`)
        || reader.querySelector(`.reader-group[data-start-index="${index}"]`);
      if (target) {
        if (state.bookPages) {
          const readerRect = reader.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const metrics = applyBookPageMetrics(reader);
          const absoluteLeft = targetRect.left - readerRect.left + reader.scrollLeft - metrics.paddingLeft;
          const pageIndex = Math.max(0, Math.floor((absoluteLeft + Math.min(targetRect.width / 2, metrics.pageWidth / 4)) / metrics.pagePitch));
          goToBookSpread(Math.floor(pageIndex / 2), { behavior: 'auto', ensureRendered: true });
        } else {
          const readerRect = reader.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          reader.scrollTop = Math.max(0, reader.scrollTop + targetRect.top - readerRect.top - 20);
        }
      }
    }
    updateReaderStatus();
    const start = app.querySelector('#start-reader');
    if (start) start.textContent = 'Resume';
  });
}

async function openBookmark(id) {
  const bookmark = getBookmarks().find((item) => item.id === id);
  if (!bookmark) return;
  let documentData = null;
  try {
    documentData = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${bookmark.documentId}`) || 'null');
  } catch {
    documentData = null;
  }

  try {
    if (!documentData?.text && bookmark.source?.type === 'gutenberg' && bookmark.source.id) {
      const book = await loadApiPayload(`/api/gutenberg/books/${bookmark.source.id}/text`);
      const author = book.authors?.length ? ` — ${book.authors.join(', ')}` : '';
      documentData = { title: `${book.title}${author}`, text: book.text, source: bookmark.source };
    }
    if (!documentData?.text && bookmark.source?.type === 'built-in' && bookmark.source.key) {
      const loaded = await loadLocalText(bookmark.source.key);
      documentData = { ...loaded, source: bookmark.source };
    }
    if (!documentData?.text) throw new Error('The source text is no longer stored in this browser.');

    renderReaderWithText(documentData.title, documentData.text, documentData.source || bookmark.source || { type: 'bookmark' });
    requestAnimationFrame(() => {
      app.querySelector('#font-size')?.addEventListener('change', () => updateFocusAnchorOverlay());

  const modeSelect = app.querySelector('#mode-select');
      if (modeSelect && bookmark.mode) {
        modeSelect.value = bookmark.mode;
        prepareReaderView(bookmark.mode);
        updateModeControls(bookmark.mode);
      }
      jumpToWordIndex(bookmark.wordIndex);
    });
  } catch (error) {
    const status = app.querySelector('#reader-status');
    if (status) status.textContent = error.message;
  }
}

function renderNavigationPane() {
  const pane = app.querySelector('#navigation-pane');
  if (!pane) return;
  const bookmarks = getBookmarks();
  const tocMarkup = state.toc.length
    ? state.toc.map((entry, index) => `<button type="button" class="toc-link" data-toc-index="${entry.index}" title="Go to ${escapeHtml(entry.title)}"><span>${index + 1}</span>${escapeHtml(entry.title)}</button>`).join('')
    : '<p class="navigation-empty">No chapter headings were detected.</p>';
  const bookmarkMarkup = bookmarks.length
    ? bookmarks.map((bookmark) => `<div class="bookmark-item"><button type="button" class="bookmark-open" data-open-bookmark="${escapeHtml(bookmark.id)}"><strong>${escapeHtml(bookmark.title)}</strong><span>Word ${Number(bookmark.wordIndex).toLocaleString()}</span></button><button type="button" class="bookmark-remove" data-remove-bookmark="${escapeHtml(bookmark.id)}" aria-label="Delete bookmark">×</button></div>`).join('')
    : '<p class="navigation-empty">No bookmarks saved yet.</p>';
  const definitions = definitionsForCurrentDocument();
  const definitionMarkup = definitions.length
    ? definitions.map((item) => `<div class="definition-item"><button type="button" class="definition-open" data-open-definition="${escapeHtml(item.id)}"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.definition)}</span></button><button type="button" class="bookmark-remove" data-remove-definition="${escapeHtml(item.id)}" aria-label="Delete saved definition">×</button></div>`).join('')
    : '<p class="navigation-empty">No saved definitions for this text.</p>';
  const notes = notesForCurrentDocument();
  const noteMarkup = notes.length
    ? notes.map((item) => `<div class="note-item"><button type="button" class="note-open" data-open-note="${escapeHtml(item.id)}"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.note)}</span></button><button type="button" class="bookmark-remove" data-remove-note="${escapeHtml(item.id)}" aria-label="Delete note">×</button></div>`).join('')
    : '<p class="navigation-empty">No notes saved for this text.</p>';

  pane.innerHTML = `
    <section class="navigation-section">
      <div class="navigation-heading"><h2>Contents</h2><button id="add-bookmark" class="bookmark-add" type="button">＋ Bookmark</button></div>
      <div class="toc-list">${tocMarkup}</div>
    </section>
    <details class="navigation-section bookmark-section" open>
      <summary>Bookmarks</summary>
      <div class="bookmark-list">${bookmarkMarkup}</div>
    </details>
    <details class="navigation-section definition-section" open>
      <summary>Saved definitions</summary>
      <div class="definition-list">${definitionMarkup}</div>
    </details>
    <details class="navigation-section note-section" open>
      <summary>Notes</summary>
      <div class="note-list">${noteMarkup}</div>
    </details>`;

  pane.querySelectorAll('[data-toc-index]').forEach((button) => {
    button.addEventListener('click', () => jumpToWordIndex(button.dataset.tocIndex));
  });
  pane.querySelector('#add-bookmark')?.addEventListener('click', addBookmark);
  pane.querySelectorAll('[data-open-bookmark]').forEach((button) => {
    button.addEventListener('click', () => openBookmark(button.dataset.openBookmark));
  });
  pane.querySelectorAll('[data-remove-bookmark]').forEach((button) => {
    button.addEventListener('click', () => removeBookmark(button.dataset.removeBookmark));
  });
  pane.querySelectorAll('[data-open-definition]').forEach((button) => {
    button.addEventListener('click', () => openSavedDefinition(button.dataset.openDefinition));
  });
  pane.querySelectorAll('[data-remove-definition]').forEach((button) => {
    button.addEventListener('click', () => removeSavedDefinition(button.dataset.removeDefinition));
  });
  pane.querySelectorAll('[data-open-note]').forEach((button) => {
    button.addEventListener('click', () => openSavedNote(button.dataset.openNote));
  });
  pane.querySelectorAll('[data-remove-note]').forEach((button) => {
    button.addEventListener('click', () => removeNote(button.dataset.removeNote));
  });
}


function weatherPeriodMarkup(period) {
  const precipitation = Number.isFinite(period.precipitation)
    ? `<span><strong>Precipitation:</strong> ${period.precipitation}%</span>`
    : '';
  return `
    <article class="weather-period ${period.isDaytime ? 'daytime' : 'nighttime'}">
      <div class="weather-period-heading">
        <h3>${escapeHtml(period.name)}</h3>
        <strong class="weather-temperature">${escapeHtml(period.temperature)}°${escapeHtml(period.temperatureUnit)}</strong>
      </div>
      <p class="weather-short">${escapeHtml(period.shortForecast)}</p>
      <p>${escapeHtml(period.detailedForecast)}</p>
      <div class="weather-details">
        ${precipitation}
        <span><strong>Wind:</strong> ${escapeHtml(period.windSpeed)} ${escapeHtml(period.windDirection)}</span>
      </div>
    </article>`;
}

function renderWeatherResults(data) {
  const result = app.querySelector('#weather-results');
  if (!result) return;
  const days = Array.isArray(data.days) ? data.days : [];
  result.innerHTML = `
    <div class="weather-results-heading">
      <div><h2>${escapeHtml(data.location || data.zip)}</h2><p>Forecast separated by day and time period.</p></div>
      <button class="primary" id="weather-read-forecast" type="button">Load forecast into Reader</button>
    </div>
    <div class="weather-days">
      ${days.map((day) => `
        <section class="weather-day">
          <h2>${escapeHtml(day.label)}</h2>
          <div class="weather-periods">${day.periods.map(weatherPeriodMarkup).join('')}</div>
        </section>`).join('') || '<p class="status error">No forecast periods were returned.</p>'}
    </div>`;
  result.querySelector('#weather-read-forecast')?.addEventListener('click', () => {
    renderReaderWithText(`Weather for ${data.location || data.zip}`, data.text || '', {
      type: 'weather', key: data.zip, zip: data.zip
    });
  });
}

async function loadWeatherForZip(zip) {
  const status = app.querySelector('#weather-status');
  const result = app.querySelector('#weather-results');
  if (status) {
    status.className = 'status';
    status.textContent = 'Loading forecast…';
  }
  if (result) result.innerHTML = '';
  try {
    const response = await fetch(`/api/weather?zip=${encodeURIComponent(zip)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Weather could not be loaded.');
    setCookie('markSetGoWeatherZip', zip);
    if (status) status.textContent = `ZIP code ${zip} saved for future visits.`;
    renderWeatherResults(data);
  } catch (error) {
    if (status) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  }
}

function renderWeather() {
  stopReader();
  const savedZip = getCookie('markSetGoWeatherZip');
  app.innerHTML = `
    <section class="panel weather-screen">
      <div class="library-heading">
        <div><h1>Local Weather</h1><p>Enter a U.S. ZIP code to display each forecast day separately.</p></div>
      </div>
      <form class="weather-zip-form" id="weather-zip-form">
        <label for="weather-zip">ZIP code</label>
        <input id="weather-zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" value="${escapeHtml(savedZip)}" placeholder="06019" required />
        <button class="primary" type="submit">Get weather</button>
      </form>
      <p class="status" id="weather-status">${savedZip ? 'Loading your saved location…' : 'Your ZIP code is saved in a browser cookie on this device.'}</p>
      <div id="weather-results"></div>
    </section>`;
  const form = app.querySelector('#weather-zip-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const zip = String(new FormData(form).get('zip') || '').trim();
    if (!/^\d{5}$/.test(zip)) {
      const status = app.querySelector('#weather-status');
      status.className = 'status error';
      status.textContent = 'Enter a valid five-digit U.S. ZIP code.';
      return;
    }
    loadWeatherForZip(zip);
  });
  if (savedZip) loadWeatherForZip(savedZip);
}


const LIBRARY_PROVIDERS = {
  standardebooks: { label: 'Standard Ebooks', icon: 'S', note: 'Carefully produced public-domain EPUB editions.' },
  internetarchive: { label: 'Internet Archive', icon: 'IA', note: 'Digitized books in EPUB, text, and OCR formats.' },
  openlibrary: { label: 'Open Library', icon: 'OL', note: 'Book discovery, editions, covers, and lending links.' },
  wikisource: { label: 'Wikisource', icon: 'W', note: 'Proofread public-domain texts from Wikimedia.' },
  gutenberg: { label: 'Project Gutenberg', icon: 'G', note: 'Public-domain ebooks with mirror fallback.' }
};

function unifiedBookCard(book) {
  const provider = LIBRARY_PROVIDERS[book.provider] || { label: book.provider || 'Library', icon: '◫' };
  const canRead = Boolean(book.readable);
  const author = book.author || 'Unknown author';
  const details = [book.year, book.language, book.format].filter(Boolean).join(' · ');
  return `
    <article class="unified-book-card">
      <div class="unified-cover-wrap">
        ${book.cover ? `<img class="unified-cover" src="${escapeHtml(book.cover)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="unified-cover-placeholder" aria-hidden="true">${escapeHtml(provider.icon)}</div>`}
        <span class="provider-badge">${escapeHtml(provider.icon)} ${escapeHtml(provider.label)}</span>
      </div>
      <div class="unified-book-body">
        <h2>${escapeHtml(book.title || 'Untitled')}</h2>
        <p class="unified-author">${escapeHtml(author)}</p>
        ${details ? `<p class="unified-meta">${escapeHtml(details)}</p>` : ''}
        ${book.description ? `<p class="unified-description">${escapeHtml(book.description)}</p>` : ''}
        <div class="unified-actions">
          ${canRead ? `<button class="primary" type="button" data-library-read="${escapeHtml(book.provider)}" data-library-id="${escapeHtml(book.id)}">▸ Read now</button>` : ''}
          ${book.externalUrl ? `<a class="secondary button-link" href="${escapeHtml(book.externalUrl)}" target="_blank" rel="noopener noreferrer">↗ Book page</a>` : ''}
          <button class="secondary" type="button" data-library-save='${escapeHtml(JSON.stringify({title: book.title, author, sourceUrl: book.externalUrl || '', provider: book.provider}))}'>＋ Reading list</button>
        </div>
      </div>
    </article>`;
}

async function renderUnifiedLibrary(initial = {}) {
  stopReader();
  const query = initial.query || '';
  const provider = initial.provider || 'all';
  app.innerHTML = `
    <section class="panel unified-library">
      <div class="library-heading unified-library-heading">
        <div><h1><span class="title-icon">⌕</span> Library</h1><p>Search several public book collections from one place, then open readable editions directly in Mark, Set, Go!</p></div>
        <button class="secondary" type="button" data-read="upload">⇧ Import my own text</button>
      </div>
      <div class="provider-strip" aria-label="Library sources">
        ${Object.entries(LIBRARY_PROVIDERS).map(([key, item]) => `<button class="provider-tile ${provider === key ? 'active' : ''}" type="button" data-provider-filter="${key}"><span>${escapeHtml(item.icon)}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></button>`).join('')}
      </div>
      <form id="unified-library-search" class="unified-search-form">
        <label class="unified-search-box"><span aria-hidden="true">⌕</span><input id="unified-library-query" type="search" value="${escapeHtml(query)}" placeholder="Search title or author…" autocomplete="off"></label>
        <select id="unified-library-provider" aria-label="Library source">
          <option value="all" ${provider === 'all' ? 'selected' : ''}>All libraries</option>
          ${Object.entries(LIBRARY_PROVIDERS).map(([key, item]) => `<option value="${key}" ${provider === key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
        </select>
        <button class="primary" type="submit">Search</button>
      </form>
      <p id="unified-library-status" class="status">Enter a title or author to search all libraries.</p>
      <div id="unified-library-results" class="unified-results" aria-live="polite"></div>
      <p class="library-note">Availability differs by source and country. Open Library may link to borrowing or preview pages rather than provide downloadable text.</p>
    </section>`;

  const form = app.querySelector('#unified-library-search');
  const status = app.querySelector('#unified-library-status');
  const results = app.querySelector('#unified-library-results');
  const search = async () => {
    const q = app.querySelector('#unified-library-query').value.trim();
    const source = app.querySelector('#unified-library-provider').value;
    if (!q) { status.textContent = 'Enter a title or author.'; results.innerHTML = ''; return; }
    status.className = 'status';
    status.textContent = `Searching ${source === 'all' ? 'all libraries' : LIBRARY_PROVIDERS[source]?.label || source}…`;
    results.innerHTML = '<div class="library-loading"><span class="loading-book">◫</span><p>Gathering editions…</p></div>';
    try {
      const payload = await loadApiPayload(`/api/library/search?q=${encodeURIComponent(q)}&provider=${encodeURIComponent(source)}`);
      const books = Array.isArray(payload.books) ? payload.books : [];
      status.textContent = books.length ? `${books.length} result${books.length === 1 ? '' : 's'} found.` : 'No books found. Try a broader search.';
      results.innerHTML = books.length ? books.map(unifiedBookCard).join('') : '<div class="empty-library"><h2>No results</h2><p>Try another title, author, or source.</p></div>';
      bindUnifiedLibraryActions(results);
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
      results.innerHTML = '<div class="empty-library"><h2>Search unavailable</h2><p>One or more libraries may be temporarily unavailable.</p></div>';
    }
  };
  form?.addEventListener('submit', (event) => { event.preventDefault(); search(); });
  app.querySelectorAll('[data-provider-filter]').forEach((button) => button.addEventListener('click', () => {
    app.querySelector('#unified-library-provider').value = button.dataset.providerFilter;
    app.querySelectorAll('[data-provider-filter]').forEach((item) => item.classList.toggle('active', item === button));
    if (app.querySelector('#unified-library-query').value.trim()) search();
  }));
  if (query) search();
}

function bindUnifiedLibraryActions(container) {
  container.querySelectorAll('[data-library-read]').forEach((button) => button.addEventListener('click', async () => {
    const provider = button.dataset.libraryRead;
    const id = button.dataset.libraryId;
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Loading…';
    try {
      const book = await loadApiPayload(`/api/library/read?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`);
      renderReaderWithText(`${book.title}${book.author ? ` — ${book.author}` : ''}`, book.text, { type: provider, id, sourceUrl: book.sourceUrl });
    } catch (error) {
      window.alert(error.message);
      button.disabled = false; button.textContent = original;
    }
  }));
  container.querySelectorAll('[data-library-save]').forEach((button) => button.addEventListener('click', () => {
    try {
      const item = JSON.parse(button.dataset.librarySave);
      const list = getReadingList();
      list.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: item.title, author: item.author, sourceUrl: item.sourceUrl, status: 'want-to-read', addedAt: new Date().toISOString() });
      saveReadingList(list);
      button.textContent = '✓ Added'; button.disabled = true;
    } catch { window.alert('This book could not be added to the reading list.'); }
  }));
}

async function renderReader(kind) {
  stopReader();
  if (kind === 'frankenstein-demo') return loadBuiltInIllustratedDemo();
  if (kind === 'url') return renderUrlImporter();
  if (kind === 'upload') return renderUpload();
  if (kind === 'illustrated-upload') return renderIllustratedUpload();
  if (kind === 'unified-library') return renderUnifiedLibrary();
  if (kind === 'gutenberg') return renderGutenbergLibrary();
  if (kind === 'great-books') return renderGreatBooksLibrary();
  if (kind === 'current-reading') return renderCurrentReading();
  if (kind === 'weather') return renderWeather();

  app.innerHTML = `<section class="panel"><h1>Loading…</h1><p class="status">Preparing your text.</p></section>`;
  try {
    let title;
    let text;
    if (sources[kind]) {
      ({ title, text } = await loadLocalText(kind));
    } else if (kind === 'news') {
      title = "Today's News";
      text = await loadApiText('/api/news');
    } else {
      throw new Error('Unknown reading selection.');
    }
    renderReaderWithText(title, text, { type: sources[kind] ? 'built-in' : kind, key: kind });
  } catch (error) {
    renderError('Reading unavailable', error.message);
  }
}

function renderReaderWithText(title, text, source = { type: 'text' }) {
  const bookModel = new BookModel({ title, text, source, tokenizer: splitWords });
  let structure = detectDocumentStructure(text);

  // EPUBs carry an authoritative navigation document. Prefer that TOC over
  // heuristic heading detection, while still keeping detected structure for
  // reader formatting and illustration placement.
  const suppliedToc = Array.isArray(source?.epubToc)
    ? source.epubToc
        .filter((entry) => entry && Number.isFinite(Number(entry.index)) && String(entry.title || '').trim())
        .map((entry) => ({
          title: String(entry.title).replace(/\s+/g, ' ').trim(),
          index: Math.max(0, Number(entry.index) || 0),
          type: entry.type || 'chapter'
        }))
        .sort((a, b) => a.index - b.index)
        .filter((entry, index, all) => index === 0 || entry.index !== all[index - 1].index || normalizeTocTitle(entry.title) !== normalizeTocTitle(all[index - 1].title))
        .slice(0, 500)
    : [];

  if (suppliedToc.length) {
    const suppliedStructure = suppliedToc.map((entry) => ({
      title: entry.title,
      type: entry.type,
      start: entry.index,
      end: entry.index + Math.max(1, splitWords(entry.title).length),
      preferredToc: true,
      epubNavigation: true
    }));
    const seen = new Set();
    structure = [...structure, ...suppliedStructure]
      .sort((a, b) => a.start - b.start || (a.epubNavigation ? -1 : 1))
      .filter((entry) => {
        const key = `${entry.start}|${normalizeTocTitle(entry.title)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const toc = suppliedToc.length
    ? suppliedToc
    : detectTableOfContents(text);

  readerEngine.loadBook(bookModel, {
    documentId: documentIdFor(title, String(text)),
    structure,
    toc
  });
  state.bionic = false;
  state.meaningfulChunks = false;
  state.uploadedIllustrations = Array.isArray(source?.illustrations) ? source.illustrations : [];
  state.illustrationMode = state.uploadedIllustrations.length ? 'chapter' : 'off';
  if (!state.words.length) return renderError('No readable text', 'The selected source did not contain readable words.');

  app.innerHTML = `
    <section class="panel">
      <div class="reader-title-row">
        <div class="reader-title-copy">
          <h1>${escapeHtml(title)}</h1>
          <div class="reader-title-links"><a id="grokipedia-book-link" href="${grokipediaSearchUrl(title)}" target="_blank" rel="noopener noreferrer">Read about this book on Grokipedia</a></div>
        </div>
        <div class="reader-music-actions" aria-label="Music for this reading">
          <label class="preferred-music-control media-match-control"><span>Media match</span><select id="media-match-select">${mediaMatchOptionsMarkup()}</select></label>
          <button id="play-media-match" class="secondary reader-music-button" type="button">♫ Play music score</button>
          <button id="play-reading-mood" class="secondary reader-music-button" type="button">♫ Reading mood</button>
        </div>
      </div>
      <section class="reader-toolbar" aria-label="Reading settings">
        <details class="settings-panel">
          <summary><span>Reading</span><span class="settings-summary">Mode, speed, words</span></summary>
          <div class="toolbar-fields settings-content">
            <div class="control mode-control">
              <label for="mode-select">Mode</label>
              <select id="mode-select">
                <option value="highlight" selected>Highlight</option>
                <option value="bold-focus">Bold Focus</option>
                <option value="smooth-glide">Smooth Glide</option>
                <option value="pointing-guide">Pointing Guide</option>
                <option value="marquee">Marquee</option>
                <option value="flash">Flash</option>
                <option value="digital-sign">Digital Sign</option>
                <option value="auto-scroll">Auto Scroll</option>
                <option value="two-column">Two Columns</option>
              </select>
            </div>
            <div class="control"><label for="speed">Speed</label><div class="input-suffix"><input id="speed" type="number" min="30" max="900" value="${Math.min(900, state.wpm)}"><span>WPM</span></div></div>
            <div class="control"><label for="word-count">Words shown</label><input id="word-count" type="number" min="1" max="10" value="1"></div>
            <label class="compact-toggle meaningful-toggle" title="Group words into punctuation- and phrase-aware chunks up to the selected maximum."><input id="meaningful-chunks" type="checkbox"><span>Meaningful chunks</span></label>
          </div>
        </details>
        <details class="settings-panel">
          <summary><span>Display</span><span class="settings-summary">Font, size, theme, bionic</span></summary>
          <div class="toolbar-fields display-fields settings-content">
            <div class="control"><label for="font-family">Font</label><select id="font-family">
              <option value="system" selected>System Sans</option>
              <option value="serif">Book Serif</option>
              <option value="georgia">Georgia</option>
              <option value="verdana">Verdana</option>
              <option value="trebuchet">Trebuchet</option>
              <option value="monospace">Monospace</option>
              <option value="dyslexic">Dyslexia-friendly</option>
            </select></div>
            <div class="control"><label for="font-size">Text size</label><select id="font-size">${fontOptions(14)}</select></div>
            <div class="control"><label for="theme-select">Theme</label><select id="theme-select"><option value="dark" selected>Dark</option><option value="light">Light</option></select></div>
            <label class="compact-toggle"><input id="bionic-reading" type="checkbox"><span>Bionic text</span></label>
            <label class="compact-toggle" title="Show the current word or phrase at a fixed center point while using Flash or another guided mode."><input id="focus-anchor" type="checkbox"><span>Center focus anchor overlay</span></label>
            <div class="control"><label for="focus-anchor-font-size">Focus anchor size</label><select id="focus-anchor-font-size">${fontOptions(24)}</select></div>
            <label class="compact-toggle" title="Show the text as two facing book pages."><input id="book-pages" type="checkbox"><span>Book pages</span></label>
            <div class="control illustration-control"><label for="illustration-mode">Illustrations</label><select id="illustration-mode">
              <option value="off" selected>Off</option>
              <option value="chapter">Chapter openings</option>
              <option value="automatic">Automatic</option>
            </select></div>
            <button id="show-hidden-illustrations" class="secondary illustration-restore-button" type="button" disabled>Show hidden illustrations</button>
          </div>
        </details>
      </section>

      <div class="reader-pane-controls" aria-label="Reading area layout controls">
        <button id="toggle-navigation-pane" class="secondary pane-toggle" type="button" aria-pressed="true" aria-controls="navigation-pane"><span aria-hidden="true">☰</span> Contents</button>
        <button id="toggle-word-panel" class="secondary pane-toggle" type="button" aria-pressed="true" aria-controls="word-panel"><span aria-hidden="true">▥</span> Right pane</button>
        <span class="reader-resize-hint">Drag either divider to resize the reading area.</span>
      </div>
      <div class="reader-layout" id="reader-layout">
        <aside id="navigation-pane" class="navigation-pane" aria-label="Contents and bookmarks"></aside>
        <div id="left-pane-splitter" class="pane-splitter" role="separator" aria-orientation="vertical" aria-label="Resize contents pane" tabindex="0"></div>
        <div class="reader-center-column">
          <div class="reader-frame-toolbar">
            <button id="toggle-reader-fullscreen" class="viewer-fullscreen-button" type="button" aria-label="Enter text viewer fullscreen" title="Full screen text viewer">
              <span class="fullscreen-icon" aria-hidden="true">⛶</span>
              <span class="fullscreen-label">Full screen</span>
            </button>
          </div>
          <div id="reader-frame" class="reader-frame">
          <div id="fullscreen-control-strip" class="fullscreen-control-strip" aria-label="Fullscreen reader controls">
            <button id="fullscreen-options-toggle" class="fullscreen-options-toggle" type="button" aria-expanded="false" aria-controls="fullscreen-options-menu">Options ▾</button>
            <button id="fullscreen-controls-close" class="fullscreen-controls-close" type="button" aria-label="Hide fullscreen controls" title="Hide controls">×</button>
            <section id="fullscreen-options-menu" class="fullscreen-options-menu" hidden>
              <div class="fullscreen-options-header">
                <strong>Reader controls</strong>
                <span>Compact fullscreen settings</span>
              </div>

              <details class="fullscreen-option-group" open>
                <summary>Reading</summary>
                <div class="fullscreen-options-grid fullscreen-options-grid-reading">
                  <label>Mode<select id="fs-mode-select">
                    <option value="highlight">Highlight</option><option value="bold-focus">Bold Focus</option><option value="smooth-glide">Smooth Glide</option><option value="pointing-guide">Pointing Guide</option><option value="marquee">Marquee</option><option value="flash">Flash</option>
                    <option value="digital-sign">Digital Sign</option><option value="auto-scroll">Auto Scroll</option><option value="two-column">Two Columns</option>
                  </select></label>
                  <label>Speed<div class="input-suffix"><input id="fs-speed" type="number" min="30" max="900"><span>WPM</span></div></label>
                  <label>Words shown<input id="fs-word-count" type="number" min="1" max="10"></label>
                </div>
                <div class="fullscreen-option-actions fullscreen-reading-actions">
                  <button id="fs-start" class="primary" type="button">Start</button>
                  <button id="fs-pause" class="secondary" type="button">Pause</button>
                  <button id="fs-reset" class="secondary" type="button">Reset</button>
                </div>
              </details>

              <details class="fullscreen-option-group" open>
                <summary>Focus</summary>
                <div class="fullscreen-options-grid">
                  <label class="fullscreen-checkbox"><input id="fs-focus-anchor" type="checkbox"> Focus anchor</label>
                  <label>Anchor size<select id="fs-focus-anchor-font-size">${fontOptions(24)}</select></label>
                  <label class="fullscreen-checkbox"><input id="fs-meaningful-chunks" type="checkbox"> Meaningful chunks</label>
                  <label class="fullscreen-checkbox"><input id="fs-bionic-reading" type="checkbox"> Bionic text</label>
                </div>
              </details>

              <details class="fullscreen-option-group">
                <summary>Display</summary>
                <div class="fullscreen-options-grid">
                  <label>Font<select id="fs-font-family">
                    <option value="system">System Sans</option><option value="serif">Book Serif</option><option value="georgia">Georgia</option>
                    <option value="verdana">Verdana</option><option value="trebuchet">Trebuchet</option><option value="monospace">Monospace</option><option value="dyslexic">Dyslexia-friendly</option>
                  </select></label>
                  <label>Text size<select id="fs-font-size">${fontOptions(14)}</select></label>
                  <label>Theme<select id="fs-theme-select"><option value="dark">Dark</option><option value="light">Light</option></select></label>
                  <label class="fullscreen-checkbox"><input id="fs-book-pages" type="checkbox"> Book pages</label>
                  <label>Illustrations<select id="fs-illustration-mode"><option value="off">Off</option><option value="chapter">Chapter openings</option><option value="automatic">Automatic</option></select></label>
                  <button id="fs-show-hidden-illustrations" class="secondary fullscreen-inline-button" type="button" disabled>Show hidden illustrations</button>
                </div>
              </details>

              <details class="fullscreen-option-group">
                <summary>Media</summary>
                <div class="fullscreen-options-grid fullscreen-options-grid-media">
                  <label>Media match<select id="fs-media-match-select">${mediaMatchOptionsMarkup()}</select></label>
                  <button id="fs-media-match" class="secondary fullscreen-inline-button" type="button">Play media match</button>
                  <button id="fs-reading-mood" class="secondary fullscreen-inline-button" type="button">♫ Reading mood</button>
                </div>
              </details>

              <details class="fullscreen-option-group">
                <summary>Translation</summary>
                <div class="fullscreen-options-grid fullscreen-options-grid-translation">
                  <label>Language<select id="fs-translation-language">
                    <option value="">Choose language…</option>
                    ${Object.entries(languages).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
                  </select></label>
                  <div class="fullscreen-translation-actions">
                    <button id="fs-translate" class="secondary" type="button">Translate</button>
                    <button id="fs-restore" class="secondary" type="button">Restore English</button>
                  </div>
                </div>
              </details>

              <p class="fullscreen-options-hint">Click text or press <kbd>Space</kbd> to pause/resume. Press <kbd>O</kbd> to restore hidden controls.</p>
            </section>
          </div>
          <div id="book-page-controls" class="book-page-controls" hidden>
            <button id="book-page-prev" type="button" aria-label="Previous page spread">‹</button>
            <span id="book-page-status">Pages 1–2</span>
            <button id="book-page-next" type="button" aria-label="Next page spread">›</button>
          </div>
          <div id="focus-anchor-overlay" class="focus-anchor-overlay" hidden aria-live="off"></div>
          <article id="reader" class="reader interactive-reader" style="font-size:14px" aria-label="Reading text" title="Click a word to move the reading position; click empty space to pause or resume"></article>
          </div>
        </div>
        <div id="right-pane-splitter" class="pane-splitter" role="separator" aria-orientation="vertical" aria-label="Resize right pane" tabindex="0"></div>
        <aside id="word-panel" class="word-panel" aria-live="polite">
          <section class="translation-tools" aria-label="Translation controls">
            <h2>Translate</h2>
            <div class="control">
              <label for="translation-language">Language</label>
              <select id="translation-language">
                <option value="">Choose language…</option>
                ${Object.entries(languages).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
              </select>
            </div>
            <div class="translation-actions">
              <button id="translate-text" class="secondary">Translate</button>
              <button id="restore-english" class="secondary" disabled>Restore English</button>
            </div>
            <span id="translation-status" class="status"></span>
          </section>
          <section id="word-result" class="word-result">
            <h2>Word translation</h2>
            <p>After translating the passage, click a word to see its English meaning here.</p>
          </section>
        </aside>
      </div>

      <div id="word-context-menu" class="word-context-menu" hidden role="menu" aria-label="Word actions">
        <button type="button" data-dictionary-action="lookup" role="menuitem">Look up word</button>
        <button type="button" data-dictionary-action="save" role="menuitem">Save definition</button>
        <button type="button" data-dictionary-action="note" role="menuitem">Add note</button>
      </div>

      <div class="controls playback-controls">
        <button id="start-reader" class="primary">Start</button>
        <button id="pause-reader" class="secondary" disabled>Pause</button>
        <button id="reset-reader" class="secondary">Reset</button>
        <span id="reader-status" class="status">${state.words.length.toLocaleString()} words loaded. Click a word to continue from there; click empty space or press Space to pause or resume.</span>
      </div>
    </section>`;

  const reader = app.querySelector('#reader');
  const readerFrame = app.querySelector('#reader-frame');
  const fullscreenButton = app.querySelector('#toggle-reader-fullscreen');
  bindAppearance(reader);
  bindReaderMusicControls(title, text, source);
  bindReaderFullscreen(readerFrame, fullscreenButton);
  bindFullscreenOptions(readerFrame);
  bindReaderPaneControls();
  bindReaderResize(readerFrame, reader);
  observeBookPageReader();
  renderNavigationPane();
  prepareReaderView('highlight');
  updateModeControls('highlight');
  app.querySelector('#book-page-prev')?.addEventListener('click', () => turnBookPages(-1));
  app.querySelector('#book-page-next')?.addEventListener('click', () => turnBookPages(1));
  app.querySelector('#book-page-status')?.addEventListener('click', () => turnBookPages(1));
  app.querySelector('#book-page-status')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      turnBookPages(1);
    }
  });
  app.querySelector('#reader')?.addEventListener('scroll', () => {
    if (state.bookPages) window.requestAnimationFrame(updateBookPageStatus);
  });
  // Book Pages treats one physical wheel gesture as exactly one two-page
  // spread.  While a gesture is being consumed we intentionally discard the
  // trailing wheel events (especially important for trackpads/inertial mice),
  // so one flick can never skip several spreads.
  let bookPageWheelLocked = false;
  let bookPageWheelDelta = 0;
  let bookPageWheelResetTimer = null;
  app.querySelector('#reader')?.addEventListener('wheel', (event) => {
    if (!state.bookPages || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();

    if (bookPageWheelLocked) {
      bookPageWheelDelta = 0;
      return;
    }

    bookPageWheelDelta += event.deltaY;
    window.clearTimeout(bookPageWheelResetTimer);
    bookPageWheelResetTimer = window.setTimeout(() => { bookPageWheelDelta = 0; }, 140);
    if (Math.abs(bookPageWheelDelta) < 24) return;

    // Match the user's physical wheel convention on this system:
    // wheel/scroll UP -> next spread; wheel/scroll DOWN -> previous spread.
    // The browser reports this device's wheel polarity opposite the earlier
    // assumption, so positive deltaY advances and negative deltaY goes back.
    const direction = bookPageWheelDelta > 0 ? 1 : -1;
    bookPageWheelDelta = 0;
    bookPageWheelLocked = true;
    turnBookPages(direction);
    window.setTimeout(() => { bookPageWheelLocked = false; }, 380);
  }, { passive: false });

  const modeSelect = app.querySelector('#mode-select');
  modeSelect.addEventListener('change', () => {
    switchReadingMode(modeSelect.value);
  });

  // Spacebar acts as a simple play/pause toggle while the reader is open.
  // Remove the previous handler first because loading another book rebuilds this view.
  if (state.spacebarHandler) document.removeEventListener('keydown', state.spacebarHandler);
  state.spacebarHandler = (event) => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="textbox"]')) return;
    if (!app.querySelector('#reader') || getSelectedMode() === 'two-column') return;

    event.preventDefault();
    if (isReaderRunning()) pauseReader();
    else startReader();
    persistReaderSession();
  };
  document.addEventListener('keydown', state.spacebarHandler);

  reader.addEventListener('click', (event) => {
    const translatedWord = event.target.closest('.translated-word');
    if (translatedWord && state.language !== 'en') {
      handleTranslatedWordClick(event);
      return;
    }

    const clickedWord = event.target.closest('.reader-word[data-index]');
    const mode = getSelectedMode();
    const seekableModes = new Set(['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'auto-scroll']);

    // In full-text modes, clicking a specific word changes the reading position
    // instead of merely toggling pause. Snap to the beginning of that word's
    // current reading group so Highlight/Bold/Meaningful Chunks remain aligned.
    if (clickedWord && seekableModes.has(mode)) {
      event.preventDefault();
      event.stopPropagation();
      const clickedIndex = Number(clickedWord.dataset.index);
      if (Number.isFinite(clickedIndex)) {
        const wasRunning = isReaderRunning();
        const group = findReadingGroup(clickedIndex);
        stopReader();
        state.index = group?.start ?? clickedIndex;
        updateReaderStatus(`Reading position moved to word ${(state.index + 1).toLocaleString()}.`);
        startReader();
        if (!wasRunning) window.setTimeout(pauseReader, 0);
      }
      return;
    }

    if (mode === 'two-column') return;
    if (isReaderRunning()) pauseReader();
    else startReader();
  });
  bindDictionaryMenu(reader);
  app.querySelector('#start-reader').addEventListener('click', () => { startReader(); persistReaderSession(); });
  app.querySelector('#pause-reader').addEventListener('click', () => { pauseReader(); persistReaderSession(); });
  app.querySelector('#reset-reader').addEventListener('click', () => { resetReader(); persistReaderSession(); });
  app.querySelector('#bionic-reading').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.bionic = event.target.checked;
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#focus-anchor-font-size')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.focusAnchorFontSize = Number(event.target.value) || 24;
    updateFocusAnchorOverlay();
    requestAnimationFrame(() => restoreCapturedReaderLocation(snapshot, { rerendered: false }));
    persistReaderSession({ immediate: true });
  });

  app.querySelector('#focus-anchor').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.focusAnchor = event.target.checked;
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    updateFocusAnchorOverlay();
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#meaningful-chunks').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.meaningfulChunks = event.target.checked;
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#illustration-mode').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.illustrationMode = event.target.value;
    state.illustrationAnchors.clear();
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#show-hidden-illustrations')?.addEventListener('click', restoreHiddenIllustrations);
  app.querySelector('#fs-show-hidden-illustrations')?.addEventListener('click', restoreHiddenIllustrations);
  updateHiddenIllustrationControls();
  app.querySelector('#translate-text').addEventListener('click', translateCurrentText);
  app.querySelector('#restore-english').addEventListener('click', restoreEnglish);
  app.querySelectorAll('#mode-select, #speed, #word-count, #meaningful-chunks, #focus-anchor, #focus-anchor-font-size, #font-family, #font-size, #theme-select, #bionic-reading, #book-pages, #illustration-mode').forEach((control) => {
    control.addEventListener('change', () => persistReaderSession());
    control.addEventListener('input', () => persistReaderSession());
  });
  persistReaderSession();
}


function bindFullscreenOptions(readerFrame) {
  const strip = app.querySelector('#fullscreen-control-strip');
  const toggle = app.querySelector('#fullscreen-options-toggle');
  const close = app.querySelector('#fullscreen-controls-close');
  const menu = app.querySelector('#fullscreen-options-menu');
  if (!readerFrame || !strip || !toggle || !close || !menu) return;

  const pairs = [
    ['#fs-mode-select', '#mode-select'],
    ['#fs-speed', '#speed'],
    ['#fs-word-count', '#word-count'],
    ['#fs-font-family', '#font-family'],
    ['#fs-font-size', '#font-size'],
    ['#fs-theme-select', '#theme-select'],
    ['#fs-bionic-reading', '#bionic-reading'],
    ['#fs-focus-anchor', '#focus-anchor'],
    ['#fs-focus-anchor-font-size', '#focus-anchor-font-size'],
    ['#fs-book-pages', '#book-pages'],
    ['#fs-illustration-mode', '#illustration-mode'],
    ['#fs-meaningful-chunks', '#meaningful-chunks'],
    ['#fs-translation-language', '#translation-language']
  ];

  const isFullscreen = () => document.fullscreenElement === readerFrame
    || readerFrame.classList.contains('fullscreen-fallback');

  const syncFromMain = () => {
    pairs.forEach(([mirrorSelector, mainSelector]) => {
      const mirror = app.querySelector(mirrorSelector);
      const main = app.querySelector(mainSelector);
      if (!mirror || !main) return;
      if (mirror.type === 'checkbox') mirror.checked = main.checked;
      else mirror.value = main.value;
      mirror.disabled = main.disabled;
    });
    const restore = app.querySelector('#fs-restore');
    const mainRestore = app.querySelector('#restore-english');
    if (restore && mainRestore) restore.disabled = mainRestore.disabled;
    const pause = app.querySelector('#fs-pause');
    if (pause) pause.disabled = !isReaderRunning();
    const start = app.querySelector('#fs-start');
    const mainStart = app.querySelector('#start-reader');
    if (start && mainStart) {
      start.disabled = mainStart.disabled;
      start.textContent = mainStart.textContent;
    }
  };

  const openMenu = () => {
    strip.classList.remove('controls-hidden');
    readerFrame.classList.remove('fullscreen-controls-hidden');
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = 'Options ▴';
    syncFromMain();
  };

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Options ▾';
  };

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  close.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    strip.classList.add('controls-hidden');
    readerFrame.classList.add('fullscreen-controls-hidden');
  });

  pairs.forEach(([mirrorSelector, mainSelector]) => {
    const mirror = app.querySelector(mirrorSelector);
    const main = app.querySelector(mainSelector);
    if (!mirror || !main) return;
    mirror.addEventListener('change', () => {
      if (main.type === 'checkbox') main.checked = mirror.checked;
      else main.value = mirror.value;
      main.dispatchEvent(new Event('change', { bubbles: true }));
      window.setTimeout(syncFromMain, 0);
    });
    main.addEventListener('change', syncFromMain);
  });

  const proxyClick = (mirrorSelector, mainSelector) => {
    app.querySelector(mirrorSelector)?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      app.querySelector(mainSelector)?.click();
      window.setTimeout(syncFromMain, 0);
    });
  };
  const fsMediaMatchSelect = app.querySelector('#fs-media-match-select');
  const mediaMatchSelect = app.querySelector('#media-match-select');
  if (fsMediaMatchSelect && mediaMatchSelect) {
    const syncFsMedia = () => { fsMediaMatchSelect.value = mediaMatchSelect.value; };
    syncFsMedia();
    fsMediaMatchSelect.addEventListener('change', () => {
      mediaMatchSelect.value = fsMediaMatchSelect.value;
      mediaMatchSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const mainButton = app.querySelector('#play-media-match');
      const fsButton = app.querySelector('#fs-media-match');
      if (mainButton && fsButton) fsButton.textContent = mainButton.textContent;
    });
    mediaMatchSelect.addEventListener('change', () => {
      syncFsMedia();
      const mainButton = app.querySelector('#play-media-match');
      const fsButton = app.querySelector('#fs-media-match');
      if (mainButton && fsButton) fsButton.textContent = mainButton.textContent;
    });
    const mainButton = app.querySelector('#play-media-match');
    const fsButton = app.querySelector('#fs-media-match');
    if (mainButton && fsButton) fsButton.textContent = mainButton.textContent;
  }

  proxyClick('#fs-start', '#start-reader');
  proxyClick('#fs-pause', '#pause-reader');
  proxyClick('#fs-reset', '#reset-reader');
  proxyClick('#fs-translate', '#translate-text');
  proxyClick('#fs-restore', '#restore-english');
  proxyClick('#fs-media-match', '#play-media-match');
  proxyClick('#fs-reading-mood', '#play-reading-mood');

  readerFrame.addEventListener('pointermove', (event) => {
    if (!isFullscreen() || !strip.classList.contains('controls-hidden')) return;
    const rect = readerFrame.getBoundingClientRect();
    const nearTopRight = event.clientX >= rect.right - 85 && event.clientY <= rect.top + 75;
    if (nearTopRight) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!isFullscreen() || event.key.toLowerCase() !== 'o') return;
    event.preventDefault();
    strip.classList.remove('controls-hidden');
    readerFrame.classList.remove('fullscreen-controls-hidden');
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === readerFrame) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      syncFromMain();
    } else if (!readerFrame.classList.contains('fullscreen-fallback')) {
      closeMenu();
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
    }
  });

  const observer = new MutationObserver(() => {
    if (readerFrame.classList.contains('fullscreen-fallback')) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      syncFromMain();
    }
  });
  observer.observe(readerFrame, { attributes: true, attributeFilter: ['class'] });

  closeMenu();
  syncFromMain();
}



function bindReaderPaneControls() {
  const layout = app.querySelector('#reader-layout');
  const navigationButton = app.querySelector('#toggle-navigation-pane');
  const wordButton = app.querySelector('#toggle-word-panel');
  if (!layout || !navigationButton || !wordButton) return;

  const setPane = (pane, visible) => {
    const hiddenClass = pane === 'navigation' ? 'navigation-hidden' : 'word-panel-hidden';
    const button = pane === 'navigation' ? navigationButton : wordButton;
    layout.classList.toggle(hiddenClass, !visible);
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('pane-closed', !visible);
    const label = pane === 'navigation' ? 'Contents' : 'Right pane';
    button.title = `${visible ? 'Close' : 'Open'} ${label.toLowerCase()}`;
  };

  setPane('navigation', true);
  setPane('word', true);
  navigationButton.addEventListener('click', () => {
    setPane('navigation', layout.classList.contains('navigation-hidden'));
  });
  wordButton.addEventListener('click', () => {
    setPane('word', layout.classList.contains('word-panel-hidden'));
  });
}

function bindReaderResize(readerFrame, reader) {
  const layout = app.querySelector('#reader-layout');
  const leftSplitter = app.querySelector('#left-pane-splitter');
  const rightSplitter = app.querySelector('#right-pane-splitter');
  if (!layout || !readerFrame || !reader) return;

  const savedLeft = Number(localStorage.getItem('msg-navigation-width'));
  const savedRight = Number(localStorage.getItem('msg-word-panel-width'));
  if (Number.isFinite(savedLeft)) layout.style.setProperty('--navigation-width', `${Math.max(150, Math.min(420, savedLeft))}px`);
  if (Number.isFinite(savedRight)) layout.style.setProperty('--word-panel-width', `${Math.max(180, Math.min(480, savedRight))}px`);

  const bindSplitter = (splitter, side) => {
    if (!splitter) return;
    let startX = 0;
    let startWidth = 0;
    const pane = side === 'left' ? app.querySelector('#navigation-pane') : app.querySelector('#word-panel');
    const property = side === 'left' ? '--navigation-width' : '--word-panel-width';
    const storageKey = side === 'left' ? 'msg-navigation-width' : 'msg-word-panel-width';

    const move = (event) => {
      const delta = event.clientX - startX;
      const next = side === 'left' ? startWidth + delta : startWidth - delta;
      const width = Math.max(side === 'left' ? 150 : 180, Math.min(side === 'left' ? 420 : 480, next));
      layout.style.setProperty(property, `${width}px`);
      localStorage.setItem(storageKey, String(Math.round(width)));
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.body.classList.remove('resizing-reader-panes');
    };
    splitter.addEventListener('pointerdown', (event) => {
      if (!pane || layout.classList.contains(side === 'left' ? 'navigation-hidden' : 'word-panel-hidden')) return;
      startX = event.clientX;
      startWidth = pane.getBoundingClientRect().width;
      splitter.setPointerCapture?.(event.pointerId);
      document.body.classList.add('resizing-reader-panes');
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop, { once: true });
      event.preventDefault();
    });
    splitter.addEventListener('dblclick', () => {
      layout.style.removeProperty(property);
      localStorage.removeItem(storageKey);
    });
  };

  bindSplitter(leftSplitter, 'left');
  bindSplitter(rightSplitter, 'right');
}
function scheduleBookPageReflow({ delay = 0 } = {}) {
  if (!state.bookPages) return;
  const preservedSpread = Math.max(0, Number(state.bookSpreadIndex) || 0);
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reader = app.querySelector('#reader');
        if (!reader || !state.bookPages) return;
        applyBookPageMetrics(reader);
        goToBookSpread(preservedSpread, { behavior: 'auto', ensureRendered: false });
      });
    });
  }, delay);
}

function bindReaderFullscreen(readerFrame, button) {
  if (!readerFrame || !button) return;

  const label = button.querySelector('.fullscreen-label');
  const icon = button.querySelector('.fullscreen-icon');

  const isViewerFullscreen = () => document.fullscreenElement === readerFrame
    || readerFrame.classList.contains('fullscreen-fallback');

  const updateButton = () => {
    const active = isViewerFullscreen();
    button.setAttribute('aria-label', active ? 'Exit text viewer fullscreen' : 'Enter text viewer fullscreen');
    button.title = active ? 'Minimize text viewer' : 'Full screen text viewer';
    if (label) label.textContent = active ? 'Minimize' : 'Full screen';
    if (icon) icon.textContent = active ? '🗗' : '⛶';
  };

  const enterFullscreen = async () => {
    if (readerFrame.requestFullscreen) {
      try {
        await readerFrame.requestFullscreen();
        return;
      } catch (error) {
        console.warn('Browser fullscreen was unavailable; using expanded viewer mode.', error);
      }
    }
    readerFrame.classList.add('fullscreen-fallback');
    document.body.classList.add('viewer-fullscreen-open');
    updateButton();
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement === readerFrame && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    readerFrame.classList.remove('fullscreen-fallback');
    document.body.classList.remove('viewer-fullscreen-open');
    updateButton();
  };

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isViewerFullscreen()) await exitFullscreen();
    else await enterFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== readerFrame) {
      readerFrame.classList.remove('fullscreen-fallback');
      document.body.classList.remove('viewer-fullscreen-open');
    }
    updateButton();
    scheduleBookPageReflow({ delay: 60 });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && readerFrame.classList.contains('fullscreen-fallback')) {
      exitFullscreen();
    }
  });

  updateButton();
}

function getBookPageMetrics(reader) {
  const styles = window.getComputedStyle(reader);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const viewportWidth = Math.max(1, reader.clientWidth - paddingLeft - paddingRight);
  const pageWidth = Math.max(1, (viewportWidth - columnGap) / 2);
  const pagePitch = pageWidth + columnGap;
  const spreadWidth = pagePitch * 2;
  return { paddingLeft, paddingRight, columnGap, viewportWidth, pageWidth, pagePitch, spreadWidth };
}

function applyBookPageMetrics(reader) {
  if (!reader || !state.bookPages) return getBookPageMetrics(reader);
  const metrics = getBookPageMetrics(reader);
  reader.style.setProperty('--book-page-width', `${metrics.pageWidth}px`);
  reader.style.setProperty('--book-spread-width', `${metrics.spreadWidth}px`);
  return metrics;
}

function getBookSpreadWidth(reader) {
  return applyBookPageMetrics(reader).spreadWidth;
}

function getBookSpreadCount(reader) {
  const metrics = applyBookPageMetrics(reader);
  // scrollWidth includes the reader padding. Subtract it before counting the
  // exact two-page spread strides created by the fixed column width.
  const laidOutWidth = Math.max(metrics.viewportWidth, reader.scrollWidth - metrics.paddingLeft - metrics.paddingRight);
  return Math.max(1, Math.ceil((laidOutWidth - metrics.viewportWidth) / metrics.spreadWidth) + 1);
}

function getEstimatedBookPageCount(reader) {
  const renderedWords = Math.max(1, state.renderedWordEnd || 0);
  const renderedPages = Math.max(2, getBookSpreadCount(reader) * 2);
  const wordsPerPage = Math.max(1, renderedWords / renderedPages);
  return Math.max(renderedPages, Math.ceil(state.words.length / wordsPerPage));
}

function getCurrentBookSpread(reader) {
  // Book Pages uses one logical spread index everywhere (buttons, wheel,
  // highlighter, TOC and fullscreen).  Do not infer it from scrollLeft during
  // animations/reflow because that creates off-by-one and multi-spread jumps.
  if (Number.isInteger(state.bookSpreadIndex) && state.bookSpreadIndex >= 0) {
    return state.bookSpreadIndex;
  }
  const spreadWidth = getBookSpreadWidth(reader);
  state.bookSpreadIndex = Math.max(0, Math.round(reader.scrollLeft / spreadWidth));
  return state.bookSpreadIndex;
}

function firstReadingIndexInVisibleBookSpread(reader) {
  if (!reader) return Math.max(0, state.index || 0);
  const readerRect = reader.getBoundingClientRect();
  let firstIndex = Number.POSITIVE_INFINITY;

  for (const group of reader.querySelectorAll('.reader-group[data-start-index]')) {
    const rect = group.getBoundingClientRect();
    if (rect.right <= readerRect.left + 1 || rect.left >= readerRect.right - 1) continue;
    const index = Number(group.dataset.visibleStartIndex ?? group.dataset.startIndex);
    if (Number.isFinite(index)) firstIndex = Math.min(firstIndex, index);
  }

  if (!Number.isFinite(firstIndex)) {
    for (const word of reader.querySelectorAll('.reader-word[data-index]')) {
      const rect = word.getBoundingClientRect();
      if (rect.right <= readerRect.left + 1 || rect.left >= readerRect.right - 1) continue;
      const index = Number(word.dataset.index);
      if (Number.isFinite(index)) firstIndex = Math.min(firstIndex, index);
    }
  }

  return Number.isFinite(firstIndex) ? firstIndex : Math.max(0, state.index || 0);
}

function syncReaderToVisibleBookSpread(reader) {
  const nextIndex = firstReadingIndexInVisibleBookSpread(reader);
  state.index = Math.max(0, Math.min(state.words.length - 1, nextIndex));
  for (const active of state.activeElements || []) {
    active.classList.remove('active-group', 'active-bold-group');
  }
  state.activeElements = [];
  updateReaderStatus();
}

function goToBookSpread(targetSpread, { behavior = 'smooth', ensureRendered = true, syncReaderPosition = false } = {}) {
  const reader = app.querySelector('#reader');
  if (!reader || !state.bookPages) return;

  applyBookPageMetrics(reader);
  let target = Math.max(0, Math.trunc(Number(targetSpread) || 0));

  if (ensureRendered && target >= getBookSpreadCount(reader) - 1 && state.renderedWordEnd < state.words.length) {
    ensureWordsRendered(
      reader,
      state.renderedMode || getSelectedMode(),
      state.renderedGroupSize || 1,
      Math.min(state.words.length, state.renderedWordEnd + 800)
    );
    applyBookPageMetrics(reader);
  }

  const maxSpread = Math.max(0, getBookSpreadCount(reader) - 1);
  target = Math.min(target, maxSpread);
  state.bookSpreadIndex = target;

  // Book Pages has one canonical horizontal position. The highlighter never
  // nudges the viewport within a spread; it only requests an exact spread.
  reader.scrollTop = 0;
  const exactLeft = target * getBookSpreadWidth(reader);
  reader.scrollTo({ left: exactLeft, top: 0, behavior: 'auto' });

  // A manual page turn must move the logical reading position as well as the
  // viewport. Otherwise the running highlighter immediately snaps the reader
  // back to the old (later) spread, making Previous and wheel-down appear to
  // move forward.
  if (syncReaderPosition) syncReaderToVisibleBookSpread(reader);
  updateBookPageStatus(target);
}

function updateBookPageStatus(forcedSpread = null) {
  const reader = app.querySelector('#reader');
  const status = app.querySelector('#book-page-status');
  if (!reader || !status || !state.bookPages) return;

  const spreadCount = getBookSpreadCount(reader);
  const spreadIndex = Math.min(
    spreadCount - 1,
    Math.max(0, forcedSpread == null ? getCurrentBookSpread(reader) : forcedSpread)
  );
  state.bookSpreadIndex = spreadIndex;

  const firstPage = spreadIndex * 2 + 1;
  const totalPages = getEstimatedBookPageCount(reader);
  const lastPage = Math.min(totalPages, firstPage + 1);
  status.textContent = firstPage === lastPage
    ? `Page ${firstPage} of ${totalPages}`
    : `Pages ${firstPage}–${lastPage} of ${totalPages}`;
  status.title = 'Click to turn to the next page spread';
  status.setAttribute('role', 'button');
  status.setAttribute('tabindex', '0');

  const previous = app.querySelector('#book-page-prev');
  const next = app.querySelector('#book-page-next');
  if (previous) previous.disabled = spreadIndex <= 0;
  if (next) next.disabled = firstPage >= totalPages;
}

function updateBookPageControls() {
  const controls = app.querySelector('#book-page-controls');
  const reader = app.querySelector('#reader');
  if (!controls || !reader) return;
  const enabled = state.bookPages && modeSupportsBookPages(getSelectedMode());
  controls.hidden = !enabled;
  reader.classList.toggle('book-pages-layout', enabled);
  if (enabled) {
    state.bookSpreadIndex = Math.max(0, Number(state.bookSpreadIndex) || 0);
    window.requestAnimationFrame(() => {
      applyBookPageMetrics(reader);
      goToBookSpread(state.bookSpreadIndex, { behavior: 'auto', ensureRendered: false });
    });
  } else {
    state.bookSpreadIndex = 0;
    reader.scrollLeft = 0;
    reader.scrollTop = 0;
    reader.style.removeProperty('--book-page-width');
    reader.style.removeProperty('--book-spread-width');
  }
}

function turnBookPages(direction) {
  const reader = app.querySelector('#reader');
  if (!reader || !state.bookPages) return;

  const step = Math.sign(direction || 1);
  const currentSpread = getCurrentBookSpread(reader);
  const targetSpread = Math.max(0, currentSpread + step);

  // A running reading tick can fire during a manual page turn and immediately
  // send the viewport back to the active word. Temporarily stop that tick,
  // move the spread, then derive the new logical word position only after the
  // browser has committed the new column geometry.
  const wasRunning = Boolean(state.interval);
  if (wasRunning) {
    state.runToken += 1;
    window.clearTimeout(state.interval);
    state.interval = null;
    state.nextTickAt = 0;
  }

  goToBookSpread(targetSpread, {
    behavior: 'auto',
    ensureRendered: true,
    syncReaderPosition: false
  });

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      // Reassert the exact spread after any reflow caused by rendering.
      state.bookSpreadIndex = targetSpread;
      reader.scrollTop = 0;
      reader.scrollLeft = targetSpread * getBookSpreadWidth(reader);
      syncReaderToVisibleBookSpread(reader);
      updateBookPageStatus(targetSpread);
      if (wasRunning) startReader();
    });
  });
}

function updateModeControls(mode) {
  const countInput = app.querySelector('#word-count');
  const speedInput = app.querySelector('#speed');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  const staticMode = mode === 'two-column';
  const countUnused = mode === 'digital-sign' || mode === 'two-column' || mode === 'auto-scroll';
  const meaningfulInput = app.querySelector('#meaningful-chunks');
  const meaningfulSupported = modeSupportsMeaningfulChunks(mode);
  const bookPagesInput = app.querySelector('#book-pages');
  const bookPagesSupported = modeSupportsBookPages(mode);
  const focusAnchorInput = app.querySelector('#focus-anchor');
  const focusAnchorSupported = modeSupportsFocusAnchorOverlay(mode);
  if (bookPagesInput) {
    bookPagesInput.disabled = !bookPagesSupported;
    if (!bookPagesSupported && bookPagesInput.checked) {
      bookPagesInput.checked = false;
      state.bookPages = false;
    }
    bookPagesInput.title = bookPagesSupported
      ? 'Show the full text as two facing book pages.'
      : 'Book pages is available for full-text guided modes.';
  }
  updateBookPageControls();

  if (focusAnchorInput) {
    focusAnchorInput.disabled = !focusAnchorSupported;
    focusAnchorInput.title = focusAnchorSupported
      ? (mode === 'flash'
        ? 'Hold the optimal recognition letter at the center of the reader.'
        : 'Show the current guided word or phrase in a centered overlay while this mode continues below.')
      : 'The focus anchor overlay is available in Flash and timed guided modes.';
  }

  if (meaningfulInput) {
    meaningfulInput.disabled = !meaningfulSupported;
    meaningfulInput.title = meaningfulSupported
      ? 'Uses punctuation and common phrase boundaries. Words shown becomes the maximum chunk size.'
      : 'Meaningful chunks is not used in this continuous or self-paced mode.';
  }

  if (countInput) {
    countInput.disabled = countUnused;
    countInput.title = countUnused
      ? 'Words shown is not used in this continuous reading mode.'
      : '';
  }
  if (speedInput) {
    speedInput.disabled = staticMode;
    speedInput.title = staticMode ? 'Two Columns is intended for self-paced reading.' : '';
  }
  if (start) {
    start.disabled = staticMode;
    start.textContent = staticMode ? 'Self-paced' : 'Start';
  }
  if (pause) pause.disabled = true;
}

function appendStaticWords(container, words, startIndex = 0) {
  // Plain English text can be rendered as one text node, which keeps very large
  // books responsive. Bionic and translated text still use word spans because
  // they need per-word formatting or click handling.
  if (!state.bionic && state.language === 'en') {
    container.textContent = words.join(' ');
    return;
  }

  const fragment = document.createDocumentFragment();
  words.forEach((word, offset) => {
    const span = createWordSpan(word, startIndex + offset);
    fragment.appendChild(span);
    if (offset < words.length - 1) fragment.appendChild(document.createTextNode(' '));
  });
  container.appendChild(fragment);
}

function renderTwoColumnDocument(reader) {
  reader.replaceChildren();
  const grid = document.createElement('div');
  grid.className = 'two-column-grid';
  const left = document.createElement('div');
  const right = document.createElement('div');
  left.className = 'reading-column';
  right.className = 'reading-column';
  const midpoint = Math.ceil(state.words.length / 2);
  appendStaticWords(left, state.words.slice(0, midpoint), 0);
  appendStaticWords(right, state.words.slice(midpoint), midpoint);
  grid.append(left, right);
  reader.appendChild(grid);
  state.wordElements = state.bionic || state.language !== 'en'
    ? Array.from(reader.querySelectorAll('.reader-word'))
    : [];
  state.groupElements = [];
  state.activeElements = [];
  state.renderedWordEnd = state.words.length;
}


function showDictionaryResult(word, definition, partOfSpeech = '', example = '', saved = false) {
  const panel = app.querySelector('#word-result');
  if (!panel) return;
  panel.innerHTML = `
    <h2>${escapeHtml(word)}</h2>
    ${partOfSpeech ? `<p class="dictionary-part">${escapeHtml(partOfSpeech)}</p>` : ''}
    <p class="word-meaning">${escapeHtml(definition)}</p>
    ${example ? `<p class="dictionary-example">“${escapeHtml(example)}”</p>` : ''}
    ${saved ? '<p class="dictionary-saved-note">Saved under Saved definitions.</p>' : ''}`;
}

async function lookupDictionaryWord(word) {
  const normalized = normalizeLookupWord(word);
  if (!normalized) throw new Error('Select a word containing letters.');
  if (state.dictionaryCache.has(normalized)) return state.dictionaryCache.get(normalized);
  const payload = await loadApiPayload(`/api/dictionary/${encodeURIComponent(normalized)}`);
  state.dictionaryCache.set(normalized, payload);
  return payload;
}

function openWordPanelForDictionary() {
  const layout = app.querySelector('#reader-layout');
  const button = app.querySelector('#toggle-word-panel');
  if (!layout) return;
  layout.classList.remove('word-panel-hidden');
  if (button) {
    button.setAttribute('aria-pressed', 'true');
    button.classList.remove('pane-closed');
    button.title = 'Close right pane';
  }
}

async function performDictionaryLookup(saveAfter = false) {
  const context = state.contextWord;
  if (!context) return;
  openWordPanelForDictionary();
  const panel = app.querySelector('#word-result');
  if (panel) panel.innerHTML = `<h2>${escapeHtml(context.word)}</h2><p class="status">Looking up definition…</p>`;
  try {
    const result = await lookupDictionaryWord(context.word);
    showDictionaryResult(result.word, result.definition, result.partOfSpeech, result.example, false);
    if (saveAfter) saveCurrentDefinition(result);
  } catch (error) {
    if (panel) panel.innerHTML = `<h2>${escapeHtml(context.word)}</h2><p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

function saveCurrentDefinition(result) {
  const context = state.contextWord;
  if (!context || !state.documentId) return;
  const items = getSavedDefinitions();
  const existing = items.find((item) => item.documentId === state.documentId && Number(item.wordIndex) === context.index);
  const item = {
    id: existing?.id || `definition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentId: state.documentId,
    title: state.title,
    word: result.word || normalizeLookupWord(context.word),
    definition: result.definition,
    partOfSpeech: result.partOfSpeech || '',
    example: result.example || '',
    wordIndex: context.index,
    createdAt: existing?.createdAt || new Date().toISOString(),
    reviewCount: existing?.reviewCount || 0,
    mastery: existing?.mastery || 'learning',
    intervalDays: existing?.intervalDays || 0,
    nextReviewAt: existing?.nextReviewAt || new Date().toISOString(),
    lastReviewedAt: existing?.lastReviewedAt || null,
    lastRating: existing?.lastRating || null
  };
  const updated = [item, ...items.filter((entry) => entry.id !== item.id)];
  saveDefinitions(updated);
  context.element.classList.add('saved-definition-word');
  renderNavigationPane();
  showDictionaryResult(item.word, item.definition, item.partOfSpeech, item.example, true);
}

function closeDictionaryMenu() {
  const menu = app.querySelector('#word-context-menu');
  if (menu) menu.hidden = true;
}

function bindDictionaryMenu(reader) {
  const menu = app.querySelector('#word-context-menu');
  if (!menu) return;
  reader.addEventListener('contextmenu', (event) => {
    const wordElement = event.target.closest('.reader-word[data-index]');
    if (!wordElement) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(wordElement.dataset.index);
    state.contextWord = { word: state.words[index] || wordElement.textContent, index, element: wordElement };
    const existingNote = notesForCurrentDocument().find((item) => Number(item.wordIndex) === index);
    const noteButton = menu.querySelector('[data-dictionary-action="note"]');
    if (noteButton) noteButton.textContent = existingNote ? 'Edit note' : 'Add note';
    const maxLeft = window.innerWidth - menu.offsetWidth - 12;
    const maxTop = window.innerHeight - menu.offsetHeight - 12;
    menu.style.left = `${Math.max(8, Math.min(event.clientX, maxLeft))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, maxTop))}px`;
    menu.hidden = false;
  });
  menu.querySelector('[data-dictionary-action="lookup"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    performDictionaryLookup(false);
  });
  menu.querySelector('[data-dictionary-action="save"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    performDictionaryLookup(true);
  });
  menu.querySelector('[data-dictionary-action="note"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    const existing = notesForCurrentDocument().find((item) => Number(item.wordIndex) === Number(state.contextWord?.index));
    showNoteEditor(state.contextWord, existing || null);
  });
  document.addEventListener('click', closeDictionaryMenu);
  window.addEventListener('blur', closeDictionaryMenu);
  reader.addEventListener('scroll', closeDictionaryMenu, { passive: true });
}




function updateHiddenIllustrationControls() {
  const count = state.illustrationHidden.size;
  const label = count === 1 ? 'Show hidden illustration' : `Show hidden illustrations (${count})`;
  ['#show-hidden-illustrations', '#fs-show-hidden-illustrations'].forEach((selector) => {
    const button = app.querySelector(selector);
    if (!button) return;
    button.disabled = count === 0;
    button.textContent = count ? label : 'Show hidden illustrations';
  });
}

function restoreHiddenIllustrations() {
  if (!state.illustrationHidden.size) return;
  stopReader();
  state.illustrationHidden.clear();
  state.illustrationAnchors.clear();
  const mode = getSelectedMode();
  const count = Number(app.querySelector('#word-count')?.value) || 1;
  prepareReaderView(mode, count);
  updateModeControls(mode);
  updateHiddenIllustrationControls();
  updateReaderStatus('Hidden illustrations are visible again.');
  persistReaderSession();
}

function normalizedIllustrationHeading(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/\b(chapter|book|part|section)\b/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function uploadedIllustrationFor(structure) {
  if (!structure || !state.uploadedIllustrations.length) return null;
  const target = normalizedIllustrationHeading(structure.title);
  if (!target) return null;
  return state.uploadedIllustrations.find((item) => {
    const candidate = normalizedIllustrationHeading(item.heading);
    return candidate === target || candidate.endsWith(` ${target}`) || target.endsWith(` ${candidate}`);
  }) || null;
}

function renderUploadedIllustration(figure, item) {
  if (!figure || !item?.image) { figure?.remove(); return; }
  figure.classList.remove('illustration-loading');
  figure.classList.add('illustration-ready', 'uploaded-reader-illustration');
  figure.innerHTML = `
    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt || item.caption || item.heading || 'Book illustration')}" decoding="async">
    <figcaption>
      <span class="illustration-caption">${escapeHtml(item.caption || item.heading || 'Chapter illustration')}</span>
      <span class="illustration-credit">Uploaded with this illustrated book</span>
      <span class="illustration-actions"><button type="button" data-illustration-action="hide">Hide</button></span>
    </figcaption>`;
  figure.querySelector('img')?.addEventListener('error', () => figure.remove(), { once: true });
  figure.querySelector('[data-illustration-action="hide"]')?.addEventListener('click', () => {
    const key = figure.dataset.illustrationKey;
    if (key) state.illustrationHidden.add(key);
    figure.remove();
    updateHiddenIllustrationControls();
    persistReaderSession();
  });
}

function modeSupportsIllustrations(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'auto-scroll'].includes(mode);
}

function illustrationCandidateQuery(structure, wordIndex) {
  const title = state.title.replace(/\s+/g, ' ').trim();
  let heading = structure?.title?.replace(/\s+/g, ' ').trim() || '';
  const genericHeading = /^(chapter|book|part|section)\s+[\divxlcdmonewtyhrfusa-]+$/i.test(heading);
  if (genericHeading) heading = '';

  const contextStart = Math.min(state.words.length, Math.max(0, Number(wordIndex) || 0));
  const context = state.words.slice(contextStart, contextStart + 60).join(' ')
    .replace(/[“”"'()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const stopwords = new Set([
    'the','and','that','with','from','this','there','their','have','were','which','would','could','should','into','about','after','before','through','because','while','where','when','upon','your','them','then','than','been','being','also','very','what','such','some','more','most','over','under','only','much','many','each','other','another','between','within','without','against','during','toward','towards','shall','will','might','must','cannot','cant','ours','ourselves','herself','himself','itself','they','those','these','said','says','made','make','like','just','unto','thou','thee','thy','unto','into','ever','still','well','here','there','again','chapter','book','part','section'
  ]);
  const cleaned = context.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  const counts = new Map();
  for (const token of cleaned.split(/\s+/)) {
    if (!token || token.length < 4 || stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const titleWords = new Set(String(title).toLocaleLowerCase().split(/\s+/).filter(Boolean));
  const headingWords = new Set(String(heading).toLocaleLowerCase().split(/\s+/).filter(Boolean));
  const properNouns = [...new Set(context.match(/\b[A-Z][a-z]{3,}\b/g) || [])]
    .map((word) => word.toLocaleLowerCase())
    .filter((word) => !stopwords.has(word) && !titleWords.has(word));
  const keywords = [...new Set([
    ...properNouns.slice(0, 5),
    ...[...counts.entries()]
      .filter(([word]) => !titleWords.has(word) || headingWords.has(word))
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map(([word]) => word)
  ])].slice(0, 10);

  return {
    title,
    heading,
    context,
    keywords,
    structureType: structure?.type || '',
    anchorWordIndex: contextStart
  };
}

function nearestIllustrationAnchor(reader, wordIndex) {
  return reader.querySelector(`.reader-group[data-start-index="${wordIndex}"]`)
    || Array.from(reader.querySelectorAll('.reader-group')).find((group) => Number(group.dataset.startIndex) >= wordIndex)
    || reader.querySelector('.reader-group:last-of-type');
}

function renderIllustrationResult(figure, query, results, selectedIndex) {
  if (!figure?.isConnected || !results.length) {
    figure?.remove();
    return;
  }
  const index = ((selectedIndex % results.length) + results.length) % results.length;
  const item = results[index];
  figure.dataset.resultIndex = String(index);
  figure.classList.remove('illustration-loading');
  figure.innerHTML = `
    <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.description || item.title || query)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
    <figcaption>
      <span class="illustration-caption">${escapeHtml(item.description || item.title || query)}</span>
      <span class="illustration-credit">${escapeHtml(item.artist || 'Wikimedia Commons contributor')} · ${escapeHtml(item.license || 'See source for license')}</span>
      <span class="illustration-actions">
        <button type="button" data-illustration-action="replace">Replace</button>
        <button type="button" data-illustration-action="hide">Hide</button>
        <a href="${escapeHtml(item.originalUrl)}" target="_blank" rel="noopener noreferrer">Source</a>
      </span>
    </figcaption>`;
  const image = figure.querySelector('img');
  let settled = false;
  const fail = () => {
    if (settled || !figure.isConnected) return;
    settled = true;
    if (index + 1 < results.length) renderIllustrationResult(figure, query, results, index + 1);
    else figure.remove();
  };
  image?.addEventListener('load', () => { settled = true; figure.classList.add('illustration-ready'); }, { once: true });
  image?.addEventListener('error', fail, { once: true });
  window.setTimeout(() => { if (!settled) fail(); }, 12000);
  figure.querySelector('[data-illustration-action="replace"]')?.addEventListener('click', () => {
    renderIllustrationResult(figure, query, results, index + 1);
  });
  figure.querySelector('[data-illustration-action="hide"]')?.addEventListener('click', () => {
    const key = figure.dataset.illustrationKey;
    if (key) state.illustrationHidden.add(key);
    figure.remove();
    updateHiddenIllustrationControls();
    persistReaderSession();
  });
}

async function loadIllustration(figure, queryPayload) {
  const cacheKey = JSON.stringify({
    title: queryPayload?.title || '',
    heading: queryPayload?.heading || '',
    keywords: queryPayload?.keywords || [],
    structureType: queryPayload?.structureType || ''
  });
  try {
    let results = state.illustrationCache.get(cacheKey) || [];
    if (!results.length) {
      const response = await fetch('/api/illustrations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryPayload)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Illustration search failed.');
      results = Array.isArray(payload.results) ? payload.results : [];
      state.illustrationCache.set(cacheKey, results);
    }
    if (!results.length) {
      figure?.remove();
      return;
    }
    renderIllustrationResult(figure, queryPayload?.heading || queryPayload?.title || 'Illustration', results, 0);
  } catch (_error) {
    figure?.remove();
  }
}

function createDynamicIllustration(reader, wordIndex, structure = null) {
  if (state.illustrationMode === 'off' || state.illustrationAnchors.size >= 30) return;
  const key = `${state.documentId}:${wordIndex}`;
  if (state.illustrationAnchors.has(key) || state.illustrationHidden.has(key)) return;
  const anchor = nearestIllustrationAnchor(reader, wordIndex);
  if (!anchor) return;
  state.illustrationAnchors.add(key);
  const uploaded = uploadedIllustrationFor(structure);
  const figure = document.createElement('figure');
  figure.className = 'reader-illustration illustration-loading';
  figure.dataset.illustrationKey = key;
  anchor.insertAdjacentElement('afterend', figure);
  if (uploaded) {
    renderUploadedIllustration(figure, uploaded);
    return;
  }
  const query = illustrationCandidateQuery(structure, wordIndex);
  if (!query || (!query.title && !query.heading && !(query.keywords || []).length)) { figure.remove(); return; }
  figure.dataset.query = JSON.stringify(query);
  figure.innerHTML = `<div class="illustration-placeholder" aria-label="Loading illustration"></div><figcaption>Finding a relevant open-license illustration…</figcaption>`;
  loadIllustration(figure, query);
}

function scheduleIllustrationsForRange(reader, startWord, endWord, mode) {
  if (!reader || state.illustrationMode === 'off' || !modeSupportsIllustrations(mode)) return;
  const structuralTypes = state.illustrationMode === 'chapter'
    ? new Set(['part', 'chapter', 'prologue', 'introduction', 'preface', 'epilogue', 'appendix'])
    : new Set(['part', 'chapter', 'prologue', 'introduction', 'preface', 'epilogue', 'appendix', 'section']);
  const structures = state.structure.filter((entry) => entry.start >= startWord && entry.start < endWord && structuralTypes.has(entry.type));
  structures.forEach((entry) => createDynamicIllustration(reader, entry.start, entry));

  if (state.illustrationMode !== 'automatic') return;
  const interval = 2200;
  let marker = Math.max(interval, Math.ceil(startWord / interval) * interval);
  while (marker < endWord && state.illustrationAnchors.size < 30) {
    const nearbyStructure = state.structure.find((entry) => Math.abs(entry.start - marker) < 250);
    if (!nearbyStructure) createDynamicIllustration(reader, marker, null);
    marker += interval;
  }
}

function createWordSpan(word, index, extraClass = '') {
  return virtualRenderer.createWordSpan(word, index, extraClass);
}

function appendWordDocumentChunk(reader, mode, groupSize, targetWordEnd) {
  return virtualRenderer.appendWordDocumentChunk(reader, mode, groupSize, targetWordEnd);
}

function ensureWordsRendered(reader, mode, groupSize, requiredWordEnd) {
  return virtualRenderer.ensureWordsRendered(reader, mode, groupSize, requiredWordEnd);
}

function renderWordDocument(reader, mode, groupSize = 1) {
  return virtualRenderer.renderWordDocument(reader, mode, groupSize);
}

function visibleReadingAnchor(reader, fallbackIndex = state.index) {
  return virtualRenderer.visibleReadingAnchor(reader, fallbackIndex);
}

function restoreReadingAnchor(reader, mode, groupSize, wordIndex) {
  return virtualRenderer.restoreReadingAnchor(reader, mode, groupSize, wordIndex);
}

function captureReaderLocation() {
  const reader = app.querySelector('#reader');
  const mode = state.renderedMode || getSelectedMode();

  // The reader engine's word index is the canonical reading position for all
  // timed/guided modes.  Earlier builds tried to infer the position from the
  // first visible DOM word during option/mode changes.  That is unreliable
  // while a virtualized document is being rebuilt and can resolve to word 0,
  // which is why toggling Focus Anchor or changing modes jumped to the start.
  let anchorIndex;
  if (mode === 'two-column') {
    // Two-column is self-paced, so there is no continuously maintained engine
    // index. Estimate from the visible scroll position when leaving that mode.
    anchorIndex = currentReadingPosition();
  } else {
    anchorIndex = Number(state.index);
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0) {
      anchorIndex = reader ? visibleReadingAnchor(reader, 0) : 0;
    }
  }

  return {
    anchorIndex: Math.max(0, Math.min(Math.max(0, state.words.length - 1), Number(anchorIndex) || 0)),
    wasRunning: isReaderRunning()
  };
}

function bookSpreadForWordIndex(reader, wordIndex) {
  if (!reader || !state.bookPages) return null;
  const mode = state.renderedMode || getSelectedMode();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;
  ensureWordsRendered(reader, mode, groupSize, Math.min(state.words.length, Number(wordIndex) + 250));
  applyBookPageMetrics(reader);
  const target = reader.querySelector(`.reader-word[data-index="${Number(wordIndex)}"]`)
    || Array.from(reader.querySelectorAll('.reader-group[data-start-index]'))
      .find((group) => Number(group.dataset.startIndex) <= Number(wordIndex)
        && Number(group.dataset.endIndex) > Number(wordIndex));
  if (!target) return null;
  const readerRect = reader.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const metrics = applyBookPageMetrics(reader);
  const absoluteLeft = targetRect.left - readerRect.left + reader.scrollLeft - metrics.paddingLeft;
  const pageIndex = Math.max(0, Math.floor((absoluteLeft + Math.min(targetRect.width / 2, metrics.pageWidth / 4)) / metrics.pagePitch));
  return Math.floor(pageIndex / 2);
}

function restoreCapturedReaderLocation(snapshot, { rerendered = false } = {}) {
  if (!snapshot) return;
  const anchorIndex = Math.max(0, Math.min(state.words.length - 1, Number(snapshot.anchorIndex) || 0));
  state.index = anchorIndex;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const reader = app.querySelector('#reader');
      if (!reader) return;
      const mode = state.renderedMode || getSelectedMode();
      const groupSize = Number(app.querySelector('#word-count')?.value) || 1;

      // If a long document is virtualized and the saved word is outside the
      // current render window, render a window around that word first. This
      // preserves position without materializing tens of thousands of words.
      if (!state.bookPages
          && !['flash', 'digital-sign', 'two-column'].includes(mode)
          && state.virtualized
          && (anchorIndex < state.renderedWordStart || anchorIndex >= state.renderedWordEnd)) {
        virtualRenderer.renderWindowAround(reader, mode, groupSize, anchorIndex);
      }
      restoreReadingAnchor(reader, mode, groupSize, anchorIndex);
      if (state.bookPages) {
        const spread = bookSpreadForWordIndex(reader, anchorIndex);
        if (spread != null) goToBookSpread(spread, { behavior: 'auto', ensureRendered: true, syncReaderPosition: false });
      }
      state.index = anchorIndex;
      updateReaderStatus();
      const start = app.querySelector('#start-reader');
      if (start && mode !== 'two-column') start.textContent = anchorIndex ? 'Resume' : 'Start';
      if (snapshot.wasRunning && mode !== 'two-column') startReader();
      persistReaderSession();
    });
  });
}

function switchReadingMode(nextMode) {
  const reader = app.querySelector('#reader');
  if (!reader) return;

  // Capture the logical reading position BEFORE the renderer is replaced.
  // This is intentionally shared with every other layout-changing option so
  // mode changes cannot fall back to the first DOM word.
  const snapshot = captureReaderLocation();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;

  stopReader();
  state.index = snapshot.anchorIndex;
  prepareReaderView(nextMode, groupSize);
  updateModeControls(nextMode);
  restoreCapturedReaderLocation(snapshot, { rerendered: true });
}

function prepareReaderView(mode, groupSize = Number(app.querySelector('#word-count')?.value) || 1) {
  const reader = app.querySelector('#reader');
  if (!reader) return;
  reader.classList.remove('flash', 'highlight-mode', 'bold-focus-mode', 'smooth-glide-mode', 'pointing-guide-mode', 'marquee-mode', 'digital-sign-mode', 'two-column-mode', 'auto-scroll-mode', 'reading-guide-enabled', 'book-pages-layout', 'illustrated-reading');
  state.renderedMode = mode;
  updateFocusAnchorOverlay();
  state.bookPages = Boolean(app.querySelector('#book-pages')?.checked) && modeSupportsBookPages(mode);
  reader.classList.toggle('book-pages-layout', state.bookPages);
  reader.classList.toggle('illustrated-reading', state.illustrationMode !== 'off' && modeSupportsIllustrations(mode));
  updateBookPageControls();

  if (mode === 'flash') {
    reader.classList.add('flash');
    state.renderedGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
    refreshReadingGroups(mode, state.renderedGroupSize);
    reader.textContent = 'Press Start to begin.';
    return;
  }

  if (mode === 'digital-sign') {
    reader.classList.add('digital-sign-mode');
    reader.innerHTML = '<div class="digital-sign-stage">Press Start to begin.</div>';
    state.wordElements = [];
    state.groupElements = [];
    state.activeElements = [];
    state.renderedGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
    return;
  }

  if (mode === 'two-column') {
    reader.classList.add('two-column-mode');
    renderTwoColumnDocument(reader);
    return;
  }

  if (mode === 'auto-scroll') {
    reader.classList.add('auto-scroll-mode');
    renderWordDocument(reader, mode, 1);
    return;
  }

  if (mode === 'highlight') reader.classList.add('highlight-mode');
  else if (mode === 'bold-focus') reader.classList.add('bold-focus-mode');
  else if (mode === 'smooth-glide') reader.classList.add('smooth-glide-mode');
  else if (mode === 'pointing-guide') reader.classList.add('pointing-guide-mode', 'reading-guide-enabled');
  else reader.classList.add('marquee-mode');
  renderWordDocument(reader, mode, groupSize);
  if (mode === 'smooth-glide') {
    const marker = document.createElement('span');
    marker.className = 'smooth-focus-marker';
    marker.setAttribute('aria-hidden', 'true');
    reader.prepend(marker);
  }
  if (mode === 'pointing-guide') {
    const guide = document.createElement('span');
    guide.className = 'reading-guide-marker';
    guide.setAttribute('aria-hidden', 'true');
    guide.textContent = '☝';
    reader.prepend(guide);
  }
}

function scrollActiveGroup(reader, groupIndex) {
  const active = state.groupElements[groupIndex];
  if (!active) return;

  // Measure the phrase relative to the visible reader pane. offsetTop can be
  // relative to an ancestor outside the pane, which caused an immediate jump.
  const readerRect = reader.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const topInsidePane = activeRect.top - readerRect.top;
  const bottomInsidePane = activeRect.bottom - readerRect.top;
  // Let the highlight travel almost to the bottom of the pane. Once it reaches
  // that edge, advance the text just enough to place the same active phrase
  // near the top, creating a page-like reading rhythm.
  if (state.bookPages) {
    const metrics = applyBookPageMetrics(reader);
    const absoluteLeft = activeRect.left - readerRect.left + reader.scrollLeft - metrics.paddingLeft;
    const pageIndex = Math.max(0, Math.floor((absoluteLeft + Math.min(activeRect.width / 2, metrics.pageWidth / 4)) / metrics.pagePitch));
    const targetSpread = Math.floor(pageIndex / 2);
    const currentSpread = getCurrentBookSpread(reader);
    if (targetSpread !== currentSpread) {
      // The reading helper may advance only to the spread that actually owns
      // the active group; never animate through intermediate horizontal states.
      goToBookSpread(targetSpread, { behavior: 'auto', ensureRendered: true });
    }
    return;
  }

  const lowerThreshold = reader.clientHeight - 18;
  if (bottomInsidePane > lowerThreshold) {
    const desiredTop = 18;
    reader.scrollTop = Math.max(0, reader.scrollTop + topInsidePane - desiredTop);
  }
}

function moveSmoothFocusMarker(reader, group, tickMs) {
  const marker = reader.querySelector('.smooth-focus-marker');
  if (!marker || !group) return;

  const readerRect = reader.getBoundingClientRect();
  const groupRect = group.getBoundingClientRect();
  const left = groupRect.left - readerRect.left + reader.scrollLeft;
  const top = groupRect.top - readerRect.top + reader.scrollTop;

  // The first position appears immediately. Later positions glide for most of
  // the reading interval, leaving a brief settling moment before the next move.
  if (marker.dataset.ready === 'true') {
    marker.style.transitionDuration = `${Math.max(90, tickMs * 0.82)}ms`;
  } else {
    marker.style.transitionDuration = '0ms';
    marker.dataset.ready = 'true';
  }

  marker.style.width = `${Math.max(2, groupRect.width)}px`;
  marker.style.height = `${Math.max(2, groupRect.height)}px`;
  marker.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  marker.classList.add('visible');
}


function getPointingLineStep(reader, startIndex, requestedCount) {
  const first = reader.querySelector(`.reader-word[data-index="${startIndex}"]`);
  if (!first) return null;

  const firstRect = first.getBoundingClientRect();
  const lineTolerance = Math.max(3, firstRect.height * 0.35);
  const elements = [first];

  // Respect the selected word count, but never let one pointer step cross a
  // visual line. If the next word wraps, it becomes the first word of the next
  // step, so the hand returns to the beginning of that new line.
  for (let offset = 1; offset < requestedCount; offset += 1) {
    const index = startIndex + offset;
    const element = reader.querySelector(`.reader-word[data-index="${index}"]`);
    if (!element) break;
    const rect = element.getBoundingClientRect();
    if (Math.abs(rect.top - firstRect.top) > lineTolerance) break;
    elements.push(element);
  }

  return {
    elements,
    first: elements[0],
    last: elements[elements.length - 1],
    nextIndex: startIndex + elements.length
  };
}

function scrollPointingStep(reader, step) {
  if (!step?.first || !step?.last) return;
  const readerRect = reader.getBoundingClientRect();
  const firstRect = step.first.getBoundingClientRect();
  const lastRect = step.last.getBoundingClientRect();
  const topInsidePane = firstRect.top - readerRect.top;
  const bottomInsidePane = lastRect.bottom - readerRect.top;
  const lowerThreshold = reader.clientHeight - 22;

  if (bottomInsidePane > lowerThreshold) {
    reader.scrollTop = Math.max(0, reader.scrollTop + topInsidePane - 18);
  }
}

function moveReadingGuide(reader, step, tickMs) {
  const guide = reader.querySelector('.reading-guide-marker');
  if (!guide || !step?.first || !step?.last) return;

  const readerRect = reader.getBoundingClientRect();
  const firstRect = step.first.getBoundingClientRect();
  const lastRect = step.last.getBoundingClientRect();
  const guideWidth = guide.offsetWidth || 22;
  const phraseLeft = firstRect.left;
  const phraseRight = lastRect.right;
  const phraseCenter = phraseLeft + ((phraseRight - phraseLeft) / 2);
  const left = phraseCenter - readerRect.left + reader.scrollLeft - (guideWidth / 2);
  const top = Math.max(firstRect.bottom, lastRect.bottom) - readerRect.top + reader.scrollTop + 2;

  if (guide.dataset.ready === 'true') {
    guide.style.transitionDuration = `${Math.max(100, tickMs * 0.86)}ms`;
  } else {
    guide.style.transitionDuration = '0ms';
    guide.dataset.ready = 'true';
  }

  guide.style.transform = `translate3d(${Math.max(0, left)}px, ${Math.max(0, top)}px, 0)`;
  guide.classList.add('visible');
}

function updateReaderStatus(message) {
  const status = app.querySelector('#reader-status');
  if (!status) return;
  status.textContent = message || `${state.index.toLocaleString()} of ${state.words.length.toLocaleString()} words`;
}


function createTickerChunk(startIndex, chunkSize = 80) {
  const endIndex = Math.min(state.words.length, startIndex + chunkSize);
  if (endIndex <= startIndex) return null;

  const chunk = document.createElement('span');
  chunk.className = 'digital-sign-chunk';
  chunk.dataset.start = String(startIndex);
  chunk.dataset.end = String(endIndex);
  renderPhrase(chunk, state.words.slice(startIndex, endIndex));
  return { chunk, endIndex, wordCount: endIndex - startIndex };
}

function fillTickerBuffer(stage, reader) {
  // Keep only a few hundred words in the DOM. The previous implementation put
  // the entire remaining book into one animated element, which could lock the
  // browser in fullscreen because every frame repainted an enormous layer.
  const targetWidth = Math.max(reader.clientWidth * 2.5, 1800);
  let guard = 0;
  while (state.tickerNextWordIndex < state.words.length
      && (stage.scrollWidth < targetWidth || stage.children.length < 3)
      && guard < 8) {
    const result = createTickerChunk(state.tickerNextWordIndex);
    if (!result) break;
    stage.append(result.chunk);
    state.tickerNextWordIndex = result.endIndex;
    state.tickerLoadedWords += result.wordCount;
    guard += 1;
  }
}

function startDigitalSignReader({ reader, speed, start, pause }) {
  const stage = reader.querySelector('.digital-sign-stage');
  if (!stage || state.index >= state.words.length) return;

  const token = ++state.runToken;
  const isResume = state.tickerPaused && stage.children.length > 0;

  if (!isResume) {
    stage.replaceChildren();
    state.tickerStartIndex = state.index;
    state.tickerNextWordIndex = state.index;
    state.tickerLoadedWords = 0;
    state.tickerOffset = Math.max(1, reader.clientWidth);
    fillTickerBuffer(stage, reader);
  }

  state.tickerPaused = false;
  state.tickerLastAt = performance.now();

  const frame = (now) => {
    if (token !== state.runToken || state.tickerPaused) {
      state.tickerFrame = null;
      return;
    }

    const elapsedSeconds = Math.min(0.05, Math.max(0, (now - state.tickerLastAt) / 1000));
    state.tickerLastAt = now;

    const loadedWords = Math.max(1, state.tickerLoadedWords);
    const averagePixelsPerWord = Math.max(4, stage.scrollWidth / loadedWords);
    const pixelsPerSecond = Math.max(8, averagePixelsPerWord * speed / 60);
    state.tickerOffset -= pixelsPerSecond * elapsedSeconds;

    // Recycle chunks only after they have completely passed the left edge.
    // Correcting the offset by the removed width keeps the remaining text in
    // exactly the same visual position, so there is no jump or phrase break.
    let first = stage.firstElementChild;
    while (first) {
      const style = getComputedStyle(first);
      const removedWidth = first.getBoundingClientRect().width
        + parseFloat(style.marginRight || '0');
      if (state.tickerOffset + removedWidth > 0) break;

      const passedEnd = Number(first.dataset.end) || state.index;
      state.index = Math.max(state.index, passedEnd);
      state.tickerOffset += removedWidth;
      state.tickerLoadedWords -= Math.max(0, passedEnd - (Number(first.dataset.start) || passedEnd));
      first.remove();
      fillTickerBuffer(stage, reader);
      first = stage.firstElementChild;
      updateReaderStatus();
    }

    stage.style.transform = `translate3d(${state.tickerOffset}px, 0, 0)`;

    if (!stage.firstElementChild && state.tickerNextWordIndex >= state.words.length) {
      state.tickerFrame = null;
      state.index = state.words.length;
      state.tickerPaused = false;
      if (start) { start.disabled = false; start.textContent = 'Start'; }
      if (pause) pause.disabled = true;
      updateReaderStatus('Finished.');
      return;
    }

    fillTickerBuffer(stage, reader);
    state.tickerFrame = requestAnimationFrame(frame);
  };

  stage.style.transform = `translate3d(${state.tickerOffset}px, 0, 0)`;
  state.tickerFrame = requestAnimationFrame(frame);
  start.disabled = true;
  pause.disabled = false;
}

function startAutoScrollReader({ reader, speed, start, pause }) {
  const token = ++state.runToken;
  state.autoScrollLastAt = performance.now();
  state.autoScrollCarry = 0;

  const step = (now) => {
    if (token !== state.runToken) return;
    const elapsedSeconds = Math.min(.1, Math.max(0, (now - state.autoScrollLastAt) / 1000));
    state.autoScrollLastAt = now;

    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 900 && state.renderedWordEnd < state.words.length) {
      ensureWordsRendered(reader, 'auto-scroll', 1, state.renderedWordEnd + 800);
    }

    const measuredWords = Math.max(1, state.renderedWordEnd);
    const pixelsPerWord = Math.max(.2, reader.scrollHeight / measuredWords);
    const pixelsPerSecond = pixelsPerWord * speed / 60;
    state.autoScrollCarry += pixelsPerSecond * elapsedSeconds;
    const wholePixels = Math.floor(state.autoScrollCarry);
    if (wholePixels > 0) {
      reader.scrollTop += wholePixels;
      state.autoScrollCarry -= wholePixels;
    }

    state.index = Math.min(state.words.length, Math.round(reader.scrollTop / pixelsPerWord));
    updateReaderStatus();

    const atDocumentEnd = state.renderedWordEnd >= state.words.length
      && reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 2;
    if (atDocumentEnd) {
      stopReader();
      if (start) { start.disabled = false; start.textContent = 'Start'; }
      if (pause) pause.disabled = true;
      updateReaderStatus('Finished.');
      return;
    }
    state.interval = window.setTimeout(() => step(performance.now()), 16);
  };

  step(performance.now());
}

function startReader() {
  const selectedMode = getSelectedMode();
  if (selectedMode === 'two-column') return;
  const currentTickerStage = app.querySelector('.digital-sign-stage');
  const canResumeTicker = selectedMode === 'digital-sign'
    && state.tickerPaused
    && currentTickerStage
    && currentTickerStage.isConnected
    && currentTickerStage.children.length > 0;

  if (!canResumeTicker) stopReader();
  const speedInput = app.querySelector('#speed');
  const countInput = app.querySelector('#word-count');
  const reader = app.querySelector('#reader');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  const mode = getSelectedMode();

  const speed = Math.min(900, Math.max(30, Number(speedInput.value) || 300));
  const count = (mode === 'digital-sign' || mode === 'auto-scroll')
    ? 1
    : Math.min(10, Math.max(1, Number(countInput.value) || 1));
  speedInput.value = speed;
  countInput.value = count;
  state.wpm = speed;
  speedInput.disabled = true;
  countInput.disabled = true;
  start.disabled = true;
  pause.disabled = false;
  beginReadingSession();

  const expectedMeaningful = state.meaningfulChunks && modeSupportsMeaningfulChunks(mode);
  if (state.renderedMode !== mode
      || state.renderedGroupSize !== count
      || state.renderedMeaningfulChunks !== expectedMeaningful) {
    prepareReaderView(mode, count);
  }

  if (mode === 'digital-sign') {
    startDigitalSignReader({ reader, speed, start, pause });
    return;
  }

  if (mode === 'auto-scroll') {
    startAutoScrollReader({ reader, speed, start, pause });
    return;
  }

  // This is the time for one complete group. For example, 2 words at 300 WPM
  // should advance every 400 ms.
  const tickMs = Math.max(40, (60000 * count) / speed);
  const token = ++state.runToken;
  state.nextTickAt = performance.now();

  const paintStep = () => {
    if (token !== state.runToken) return;
    if (state.index >= state.words.length) {
      pauseReader();
      updateReaderStatus('Finished.');
      return;
    }

    const startIndex = state.index;
    const semanticGroup = findReadingGroup(startIndex);
    let nextIndex = semanticGroup
      ? semanticGroup.end
      : Math.min(startIndex + count, state.words.length);
    let pointingStep = null;

    if (mode === 'flash') {
      const flashWords = state.words.slice(startIndex, nextIndex);
      reader.style.fontSize = `${Math.max(10, Number(app.querySelector('#font-size')?.value) || 14)}px`;
      if (state.focusAnchor) renderFocusAnchorPhrase(reader, flashWords);
      else renderPhrase(reader, flashWords);
    } else {
      updateFocusAnchorOverlay(state.words.slice(startIndex, nextIndex));
      ensureWordsRendered(reader, mode, count, nextIndex + 1000);

      if (mode === 'pointing-guide') {
        const semanticLimit = Math.max(1, nextIndex - startIndex);
        pointingStep = getPointingLineStep(reader, startIndex, Math.min(count, semanticLimit));
        if (pointingStep) nextIndex = pointingStep.nextIndex;
      }

      const groupIndex = state.groupIndexByStart.get(startIndex);
      const group = groupIndex === undefined ? null : state.groupElements[groupIndex];

      for (const activeGroup of state.activeElements) {
        activeGroup.classList.remove('active-group', 'active-bold-group');
      }
      state.activeElements = [];

      if (group) {
        if (mode === 'highlight') {
          group.classList.add('active-group');
          state.activeElements.push(group);
        }
        if (mode === 'bold-focus') {
          group.classList.add('active-bold-group');
          state.activeElements.push(group);
        }
        if (mode === 'marquee') group.classList.remove('pending-group');
      }
      if (mode === 'pointing-guide' && pointingStep) {
        scrollPointingStep(reader, pointingStep);
        const stepStart = startIndex;
        const stepEnd = nextIndex;
        window.requestAnimationFrame(() => {
          // Re-read the element positions after any automatic scroll so the
          // hand lands beneath the visible words rather than their old screen
          // coordinates.
          const refreshed = getPointingLineStep(reader, stepStart, stepEnd - stepStart);
          moveReadingGuide(reader, refreshed, Math.max(40, (60000 * (stepEnd - stepStart)) / speed));
        });
      } else {
        scrollActiveGroup(reader, groupIndex);
      }
      if (mode === 'smooth-glide' && group) {
        const glideMs = expectedMeaningful
          ? Math.max(40, (60000 * Math.max(1, nextIndex - startIndex)) / speed)
          : tickMs;
        window.requestAnimationFrame(() => moveSmoothFocusMarker(reader, group, glideMs));
      }
    }

    state.index = nextIndex;
    updateReaderStatus();

    // Advance from the planned deadline, not from the end of this DOM update.
    // That prevents layout and scrolling time from accumulating into periodic
    // pauses. If one frame is late, the following delay becomes shorter rather
    // than permanently shifting the reading rhythm.
    const scheduledTickMs = (mode === 'pointing-guide' || expectedMeaningful)
      ? Math.max(40, (60000 * Math.max(1, nextIndex - startIndex)) / speed)
      : tickMs;
    state.nextTickAt += scheduledTickMs;
    const delay = Math.max(0, state.nextTickAt - performance.now());
    state.interval = window.setTimeout(paintStep, delay);
  };

  paintStep();
}

function stopReader() {
  finalizeReadingSession();
  state.runToken += 1;
  if (state.interval) window.clearTimeout(state.interval);
  state.interval = null;
  state.nextTickAt = 0;
  if (state.tickerStatusTimer) {
    window.clearInterval(state.tickerStatusTimer);
    state.tickerStatusTimer = null;
  }
  if (state.tickerAnimation) {
    state.tickerAnimation.cancel();
    state.tickerAnimation = null;
  }
  if (state.tickerFrame) {
    cancelAnimationFrame(state.tickerFrame);
    state.tickerFrame = null;
  }
  state.tickerPaused = false;
  state.tickerLastAt = 0;
}

function pauseReader() {
  if (state.renderedMode === 'digital-sign' && state.tickerFrame) {
    cancelAnimationFrame(state.tickerFrame);
    state.tickerFrame = null;
    state.runToken += 1;
    state.tickerPaused = true;
  } else if (!(state.renderedMode === 'digital-sign' && state.tickerPaused)) {
    stopReader();
  }
  const speed = app.querySelector('#speed');
  const count = app.querySelector('#word-count');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  if (speed) speed.disabled = false;
  if (count) count.disabled = ['digital-sign', 'two-column', 'auto-scroll'].includes(state.renderedMode);
  if (speed) speed.disabled = state.renderedMode === 'two-column';
  if (start) {
    start.disabled = false;
    start.textContent = state.index ? 'Resume' : 'Start';
  }
  if (pause) pause.disabled = true;
}

function resetReader() {
  // Reset is a full restart, not a pause. Cancel the animation and its status
  // timer before replacing the Digital Sign stage so Start cannot accidentally
  // resume an animation whose element is no longer in the document.
  stopReader();
  state.index = 0;
  state.tickerStartIndex = 0;
  state.tickerWordCount = 0;
  state.tickerOffset = 0;
  state.tickerNextWordIndex = 0;
  state.tickerLoadedWords = 0;
  const mode = getSelectedMode();
  prepareReaderView(mode, Number(app.querySelector('#word-count')?.value) || 1);
  updateModeControls(mode);
  updateReaderStatus(`${state.words.length.toLocaleString()} words loaded.`);
  const start = app.querySelector('#start-reader');
  if (start) start.textContent = 'Start';
}

function splitTranslationChunks(text, maxChars = 3500) {
  const source = String(text || '');
  if (!source) return [];

  const chunks = [];
  let current = '';
  const paragraphs = source.split(/(\n\s*\n)/);

  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const part of paragraphs) {
    if (!part) continue;
    if (part.length <= maxChars) {
      if (current.length + part.length <= maxChars) current += part;
      else {
        flush();
        current = part;
      }
      continue;
    }

    flush();
    // Very long paragraphs are split on sentence/word boundaries so the
    // browser translator is never handed an unnecessarily huge request.
    let remaining = part;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf('. ', maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = remaining.lastIndexOf(' ', maxChars);
      if (cut < Math.floor(maxChars * 0.35)) cut = maxChars;
      else cut += 1;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    current = remaining;
  }
  flush();
  return chunks;
}

async function translateWithBrowser(text, sourceLanguage, targetLanguage, onProgress) {
  const BrowserTranslator = globalThis.Translator;
  if (!BrowserTranslator || typeof BrowserTranslator.create !== 'function') throw new Error('Browser translation is not available in this Chrome installation.');

  const availability = typeof BrowserTranslator.availability === 'function'
    ? await BrowserTranslator.availability({ sourceLanguage, targetLanguage })
    : 'available';
  if (availability === 'unavailable' || availability === 'no') {
    throw new Error(`Browser translation does not support ${sourceLanguage} → ${targetLanguage} on this device.`);
  }

  const translator = await BrowserTranslator.create({
    sourceLanguage,
    targetLanguage,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        if (onProgress) onProgress({ type: 'download', value: event.loaded || 0 });
      });
    }
  });

  try {
    const chunks = splitTranslationChunks(text);
    const translated = [];
    for (let i = 0; i < chunks.length; i += 1) {
      if (onProgress) onProgress({ type: 'translate', current: i + 1, total: chunks.length });
      translated.push(await translator.translate(chunks[i]));
    }
    return translated.join('');
  } finally {
    if (typeof translator.destroy === 'function') translator.destroy();
  }
}

async function translateTextPreferBrowser(text, sourceLanguage, targetLanguage, onProgress) {
  try {
    const translated = await translateWithBrowser(text, sourceLanguage, targetLanguage, onProgress);
    return { text: translated, provider: 'browser' };
  } catch (browserError) {
    // Preserve the existing server/API path as a fallback for browsers that do
    // not expose Chrome's Translator API or for unsupported language pairs.
    const payload = await loadApiPayload('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, to: targetLanguage, from: sourceLanguage })
    });
    return { text: payload.text, provider: 'server', browserError };
  }
}

async function translateCurrentText() {
  const language = app.querySelector('#translation-language')?.value;
  const status = app.querySelector('#translation-status');
  const button = app.querySelector('#translate-text');
  if (!language) {
    status.textContent = 'Choose a language first.';
    status.className = 'status error';
    return;
  }

  pauseReader();
  button.disabled = true;
  status.className = 'status';
  status.textContent = `Preparing ${languages[language]} translation…`;

  try {
    const result = await translateTextPreferBrowser(state.originalText, 'en', language, (progress) => {
      if (progress.type === 'download') {
        status.textContent = `Downloading browser language pack… ${Math.round(progress.value * 100)}%`;
      } else if (progress.type === 'translate') {
        status.textContent = `Translating in browser… ${progress.current} of ${progress.total}`;
      }
    });
    state.currentText = result.text;
    state.language = language;
    state.words = splitWords(result.text);
    state.index = 0;
    state.translationCache.clear();
    const mode = getSelectedMode();
    prepareReaderView(mode);
    updateReaderStatus(`${state.words.length.toLocaleString()} translated words loaded.`);
    app.querySelector('#restore-english').disabled = false;
    app.querySelector('#word-result').innerHTML = `<h2>Word translation</h2><p>Click any translated word to see its English meaning.</p>`;
    status.textContent = result.provider === 'browser'
      ? `Translated to ${languages[language]} in your browser.`
      : `Translated to ${languages[language]} using the server fallback.`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function restoreEnglish() {
  pauseReader();
  state.currentText = state.originalText;
  state.language = 'en';
  state.words = splitWords(state.originalText);
  state.index = 0;
  state.translationCache.clear();
  const mode = getSelectedMode();
  prepareReaderView(mode);
  updateReaderStatus(`${state.words.length.toLocaleString()} words loaded.`);
  app.querySelector('#restore-english').disabled = true;
  app.querySelector('#translation-status').textContent = 'Restored original English text.';
  app.querySelector('#word-result').innerHTML = `<h2>Word translation</h2><p>Translate the passage, then click a word to see its English meaning here.</p>`;
}

async function handleTranslatedWordClick(event) {
  const wordElement = event.target.closest('.translated-word');
  if (!wordElement || state.language === 'en') return;
  const word = cleanLookupWord(wordElement.textContent);
  if (!word) return;

  const panel = app.querySelector('#word-result');
  const cacheKey = `${state.language}:${word.toLocaleLowerCase()}`;
  panel.innerHTML = `<h2>${escapeHtml(word)}</h2><p class="status">Looking up English translation…</p>`;

  try {
    let translation = state.translationCache.get(cacheKey);
    if (!translation) {
      try {
        translation = await translateWithBrowser(word, state.language, 'en');
      } catch {
        const payload = await loadApiPayload('/api/translate-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: word, from: state.language })
        });
        translation = payload.text;
      }
      state.translationCache.set(cacheKey, translation);
    }
    panel.innerHTML = `
      <h2>${escapeHtml(word)}</h2>
      <p class="word-meaning">${escapeHtml(translation)}</p>
      <p class="word-note">Individual words can have different meanings depending on sentence context.</p>`;
  } catch (error) {
    panel.innerHTML = `<h2>${escapeHtml(word)}</h2><p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

function renderUrlImporter() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>Read a Web Page</h1>
      <p>Enter a public HTTP or HTTPS page. The server will extract its readable text.</p>
      <form id="url-form" class="controls">
        <div class="control"><label for="page-url">Page URL</label><input id="page-url" type="url" required placeholder="https://example.com/article"></div>
        <button class="primary" type="submit">Get URL</button>
      </form>
      <p id="url-status" class="status"></p>
    </section>`;
  app.querySelector('#url-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = app.querySelector('#url-status');
    const url = app.querySelector('#page-url').value.trim();
    status.className = 'status';
    status.textContent = 'Importing page…';
    try {
      const text = await loadApiText('/api/fetch-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      renderReaderWithText(new URL(url).hostname, text, { type: 'url', url });
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  });
}


function gutenbergAuthorText(book) {
  return Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : 'Unknown author';
}

function gutenbergLanguageName(code) {
  const names = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', fi: 'Finnish', sv: 'Swedish', la: 'Latin', zh: 'Chinese' };
  return names[code] || String(code || '').toUpperCase();
}

async function renderGutenbergLibrary(options = {}) {
  stopReader();
  const search = String(options.search || '');
  const language = String(options.language || 'en');
  const page = Math.max(1, Number(options.page) || 1);
  app.innerHTML = `
    <section class="panel gutenberg-library">
      <div class="library-heading">
        <div><h1>Project Gutenberg Library</h1><p>Search public-domain books and load a plain-text edition directly into the reader.</p></div>
        <a class="secondary button-link" href="https://www.gutenberg.org/" target="_blank" rel="noopener noreferrer">Visit Gutenberg</a>
      </div>
      <form id="gutenberg-search-form" class="library-search">
        <label class="library-search-box">Search title or author<input id="gutenberg-search" type="search" value="${escapeHtml(search)}" placeholder="Sherlock Holmes, Jane Austen…"></label>
        <label>Language<select id="gutenberg-language">
          <option value="en" ${language === 'en' ? 'selected' : ''}>English</option>
          <option value="es" ${language === 'es' ? 'selected' : ''}>Spanish</option>
          <option value="fr" ${language === 'fr' ? 'selected' : ''}>French</option>
          <option value="de" ${language === 'de' ? 'selected' : ''}>German</option>
          <option value="it" ${language === 'it' ? 'selected' : ''}>Italian</option>
          <option value="pt" ${language === 'pt' ? 'selected' : ''}>Portuguese</option>
          <option value="" ${language === '' ? 'selected' : ''}>All languages</option>
        </select></label>
        <button class="primary" type="submit">Search</button>
      </form>
      <p id="gutenberg-status" class="status">Loading books…</p>
      <div id="gutenberg-results" class="gutenberg-results" aria-live="polite"></div>
      <nav id="gutenberg-pagination" class="library-pagination" aria-label="Book results pages"></nav>
      <p class="library-note">Catalog metadata is supplied by Gutendex. Book text is downloaded only when you choose “Load into Reader.” Public-domain status can vary outside the United States.</p>
    </section>`;

  const form = app.querySelector('#gutenberg-search-form');
  const status = app.querySelector('#gutenberg-status');
  const results = app.querySelector('#gutenberg-results');
  const pagination = app.querySelector('#gutenberg-pagination');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderGutenbergLibrary({
      search: app.querySelector('#gutenberg-search').value.trim(),
      language: app.querySelector('#gutenberg-language').value,
      page: 1
    });
  });

  try {
    const params = new URLSearchParams({ page: String(page), language });
    if (search) params.set('search', search);
    const payload = await loadApiPayload(`/api/gutenberg/books?${params}`);
    status.textContent = `${Number(payload.count || 0).toLocaleString()} matching books${search ? ` for “${search}”` : ''}. Page ${page}.`;
    if (!payload.books?.length) {
      results.innerHTML = '<div class="empty-library"><h2>No books found</h2><p>Try a broader title, author, or language.</p></div>';
    } else {
      results.innerHTML = payload.books.map((book) => `
        <article class="gutenberg-card">
          <div class="gutenberg-cover-wrap">
            ${book.cover ? `<img class="gutenberg-cover" src="${escapeHtml(book.cover)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="gutenberg-cover-placeholder" aria-hidden="true">📖</div>'}
          </div>
          <div class="gutenberg-card-body">
            <h2>${escapeHtml(book.title)}</h2>
            <p class="gutenberg-author">${escapeHtml(gutenbergAuthorText(book))}</p>
            <p class="gutenberg-meta">${book.languages.map(gutenbergLanguageName).join(', ') || 'Language not listed'} · ${Number(book.downloadCount || 0).toLocaleString()} downloads</p>
            ${book.subjects?.length ? `<p class="gutenberg-subjects">${escapeHtml(book.subjects.slice(0, 2).join(' · '))}</p>` : ''}
            ${bookMusicMarkup(book.title, gutenbergAuthorText(book))}
            <div class="gutenberg-actions">
              <button class="primary" type="button" data-load-gutenberg="${book.id}">Load into Reader</button>
              <a class="secondary button-link" href="${escapeHtml(book.gutenbergUrl)}" target="_blank" rel="noopener noreferrer">Book page</a>
            </div>
            <p class="status book-load-status" data-book-status="${book.id}"></p>
          </div>
        </article>`).join('');
    }

    pagination.innerHTML = `
      <button class="secondary" type="button" data-library-page="${page - 1}" ${payload.hasPrevious ? '' : 'disabled'}>← Previous</button>
      <span>Page ${page}</span>
      <button class="secondary" type="button" data-library-page="${page + 1}" ${payload.hasNext ? '' : 'disabled'}>Next →</button>`;

    pagination.querySelectorAll('[data-library-page]').forEach((button) => {
      button.addEventListener('click', () => renderGutenbergLibrary({ search, language, page: Number(button.dataset.libraryPage) }));
    });

    results.querySelectorAll('[data-load-gutenberg]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.loadGutenberg);
        const bookStatus = results.querySelector(`[data-book-status="${id}"]`);
        button.disabled = true;
        button.textContent = 'Loading…';
        bookStatus.textContent = 'Downloading the plain-text edition…';
        try {
          const book = await loadApiPayload(`/api/gutenberg/books/${id}/text`);
          const author = book.authors?.length ? ` — ${book.authors.join(', ')}` : '';
          renderReaderWithText(`${book.title}${author}`, book.text, { type: 'gutenberg', id: book.id });
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Load into Reader';
          bookStatus.className = 'status error book-load-status';
          bookStatus.textContent = error.message;
        }
      });
    });
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
    results.innerHTML = '<div class="empty-library"><h2>Catalog unavailable</h2><p>The catalog may be waking up or temporarily busy.</p><button class="secondary" type="button" id="retry-gutenberg">Try again</button></div>';
    app.querySelector('#retry-gutenberg')?.addEventListener('click', () => renderGutenbergLibrary({ search, language, page }));
  }
}


function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || 'Other';
    (groups[value] ||= []).push(item);
    return groups;
  }, {});
}

async function loadGreatBookEdition(item, status, button) {
  button.disabled = true;
  button.textContent = 'Finding edition…';
  status.textContent = 'Searching Project Gutenberg…';
  try {
    const params = new URLSearchParams({ search: item.query, language: 'en', page: '1' });
    const payload = await loadApiPayload(`/api/gutenberg/books?${params}`);
    const book = payload.books?.[0];
    if (!book) throw new Error('No public-domain plain-text edition was found.');
    button.textContent = 'Loading text…';
    const loaded = await loadApiPayload(`/api/gutenberg/books/${book.id}/text`);
    const author = loaded.authors?.length ? ` — ${loaded.authors.join(', ')}` : '';
    renderReaderWithText(`${loaded.title}${author}`, loaded.text, { type: 'gutenberg', id: loaded.id, collection: 'great-books' });
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Load into Reader';
    status.className = 'status error book-load-status';
    status.textContent = error.message;
  }
}

function renderGreatBooksLibrary() {
  stopReader();
  const grouped = groupBy(greatBooksCatalog, 'era');
  app.innerHTML = `
    <section class="panel curated-library">
      <div class="library-heading">
        <div><h1>Great Books Library</h1><p>A curated path through major works of the Western tradition using lawful public-domain editions.</p></div>
        <button class="secondary" type="button" data-read="gutenberg">Search all Gutenberg</button>
      </div>
      <label class="curated-filter">Filter works<input id="great-books-filter" type="search" placeholder="Plato, Shakespeare, science…"></label>
      <div id="great-books-groups" class="curated-groups">
        ${Object.entries(grouped).map(([era, books]) => `
          <details class="curated-era" open>
            <summary>${escapeHtml(era)} <span>${books.length}</span></summary>
            <div class="curated-grid">
              ${books.map((book) => `<article class="curated-card" data-great-book-card data-search-text="${escapeHtml(`${book.title} ${book.author} ${book.era}`.toLowerCase())}">
                <div><h2>${escapeHtml(book.title)}</h2><p>${escapeHtml(book.author)}</p></div>
                ${bookMusicMarkup(book.title, book.author)}
                <button class="primary" type="button" data-load-great-book="${escapeHtml(book.query)}">Load into Reader</button>
                <p class="status book-load-status"></p>
              </article>`).join('')}
            </div>
          </details>`).join('')}
      </div>
      <p class="library-note">This is a curated public-domain reading list, not a reproduction of Britannica’s copyrighted anthology or its editorial material. Edition availability and public-domain status can vary by country.</p>
    </section>`;

  const filter = app.querySelector('#great-books-filter');
  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    app.querySelectorAll('[data-great-book-card]').forEach((card) => {
      card.hidden = query && !card.dataset.searchText.includes(query);
    });
    app.querySelectorAll('.curated-era').forEach((era) => {
      era.hidden = !Array.from(era.querySelectorAll('[data-great-book-card]')).some((card) => !card.hidden);
    });
  });
  app.querySelectorAll('[data-load-great-book]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = greatBooksCatalog.find((book) => book.query === button.dataset.loadGreatBook);
      loadGreatBookEdition(item, button.parentElement.querySelector('.book-load-status'), button);
    });
  });
}

function formatFeedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadFeedArticleText(item, source, button, status) {
  button.disabled = true;
  button.textContent = 'Importing…';
  status.className = 'status article-status';
  status.textContent = 'Requesting this specific article from the publisher…';
  try {
    const payload = await loadApiPayload('/api/current/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: item.link,
        title: item.title,
        summary: item.summary || '',
        source: source.name
      })
    });
    renderReaderWithText(payload.title || item.title, payload.text, {
      type: payload.fullArticle ? 'article' : 'feed-summary',
      url: item.link,
      source: source.name
    });
  } catch (error) {
    // Never substitute another publisher's page. Fall back to this card's own feed text.
    const fallback = `${item.title}\n\n${item.summary || 'No summary was supplied by this feed.'}\n\nSource: ${source.name}\n${item.link}`;
    renderReaderWithText(item.title, fallback, { type: 'feed-summary', url: item.link, source: source.name });
  }
}

async function renderCurrentFeed(sourceId) {
  stopReader();
  app.innerHTML = '<section class="panel"><h1>Loading feed…</h1><p class="status">Retrieving recent items.</p></section>';
  try {
    const payload = await loadApiPayload(`/api/current/feed/${encodeURIComponent(sourceId)}`);
    const { source, items } = payload;
    app.innerHTML = `
      <section class="panel current-feed">
        <div class="library-heading"><div><h1>${escapeHtml(source.name)}</h1><p>${escapeHtml(source.description)}</p></div><div class="feed-heading-actions"><button class="secondary" type="button" data-read="current-reading">All sources</button><a class="secondary button-link" href="${escapeHtml(source.siteUrl)}" target="_blank" rel="noopener noreferrer">Visit source</a></div></div>
        <div class="feed-items">${items?.length ? items.map((item, index) => `
          <article class="feed-item">
            <h2>${escapeHtml(item.title)}</h2>
            ${item.published ? `<p class="feed-date">${escapeHtml(formatFeedDate(item.published))}</p>` : ''}
            ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : '<p class="status">No summary was supplied by this feed.</p>'}
            <div class="feed-actions">
              <button class="primary" type="button" data-read-summary="${index}">Read summary</button>
              <button class="secondary" type="button" data-watch-news="${index}">Watch news</button>
              <button class="secondary" type="button" data-load-article="${index}">Try article text</button>
              <a class="secondary button-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Open original</a>
            </div><p class="status article-status" data-article-status="${index}"></p>
          </article>`).join('') : '<div class="empty-library"><h2>No items found</h2><p>This source did not return any recent entries.</p></div>'}</div>
        <p class="library-note">Headlines and summaries are supplied by each feed. Full article text is imported only when you request it and when the publisher permits automated access.</p>
      </section>`;
    app.querySelectorAll('[data-read-summary]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number(button.dataset.readSummary)];
        const text = `${item.title}\n\n${item.summary || 'No summary was supplied.'}\n\nSource: ${source.name}\n${item.link}`;
        renderReaderWithText(item.title, text, { type: 'feed-summary', url: item.link, source: source.name });
      });
    });
    app.querySelectorAll('[data-watch-news]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number(button.dataset.watchNews)];
        if (!item?.title) return;
        const query = encodeURIComponent(`"${item.title}" ${source?.name || ''}`.trim());
        const url = `https://news.google.com/search?q=${query}&hl=en-US&gl=US&ceid=US%3Aen`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    });
    app.querySelectorAll('[data-load-article]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.loadArticle);
        loadFeedArticleText(items[index], source, button, app.querySelector(`[data-article-status="${index}"]`));
      });
    });
  } catch (error) {
    renderError('Feed unavailable', error.message);
  }
}

async function renderCurrentReading(category = 'all') {
  stopReader();
  app.innerHTML = '<section class="panel"><h1>News, Sports & Interests</h1><p class="status">Loading sources…</p></section>';
  try {
    const payload = await loadApiPayload('/api/current/sources');
    const sources = payload.sources || [];
    const categories = { all: 'All', news: 'News', sports: 'Sports', interests: 'Interests & Hobbies' };
    app.innerHTML = `
      <section class="panel current-reading-library">
        <div class="library-heading"><div><h1>News, Sports & Interests</h1><p>Browse recent headlines and topic feeds, then read a feed summary or request a readable article.</p></div></div>
        <div class="category-tabs" role="tablist">${Object.entries(categories).map(([key, label]) => `<button type="button" class="${key === category ? 'active' : ''}" data-current-category="${key}">${label}</button>`).join('')}</div>
        <div class="source-grid">${sources.filter((source) => category === 'all' || source.category === category).map((source) => `
          <article class="source-card">
            <div><span class="source-category">${escapeHtml(categories[source.category] || source.category)}</span><h2>${escapeHtml(source.name)}</h2><p>${escapeHtml(source.description)}</p></div>
            <div class="source-actions"><button class="primary" type="button" data-open-feed="${escapeHtml(source.id)}">Browse headlines</button><a class="secondary button-link" href="${escapeHtml(source.siteUrl)}" target="_blank" rel="noopener noreferrer">Visit site</a></div>
          </article>`).join('')}</div>
        <p class="library-note">Some hobby feeds use Google News topic searches. Publisher terms, paywalls, and automated-access rules still apply to individual articles.</p>
      </section>`;
    app.querySelectorAll('[data-current-category]').forEach((button) => button.addEventListener('click', () => renderCurrentReading(button.dataset.currentCategory)));
    app.querySelectorAll('[data-open-feed]').forEach((button) => button.addEventListener('click', () => renderCurrentFeed(button.dataset.openFeed)));
  } catch (error) {
    renderError('Sources unavailable', error.message);
  }
}



async function loadBuiltInIllustratedDemo() {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>Loading Frankenstein Illustrated Demo…</h1><p class="status">Preparing the first five chapters and their illustrations.</p></section>`;
  try {
    const basePath = '/demos/frankenstein';
    const [manifestResponse, textResponse] = await Promise.all([
      fetch(`${basePath}/manifest.json`, { cache: 'no-store' }),
      fetch(`${basePath}/book.txt`, { cache: 'no-store' })
    ]);
    if (!manifestResponse.ok) throw new Error('The demo manifest could not be loaded.');
    if (!textResponse.ok) throw new Error('The demo text could not be loaded.');
    const manifest = await manifestResponse.json();
    const text = await textResponse.text();
    const illustrations = (Array.isArray(manifest.illustrations) ? manifest.illustrations : []).map((item) => ({
      ...item,
      image: new URL(String(item.image || ''), `${window.location.origin}${basePath}/`).href
    }));
    const displayTitle = manifest.author ? `${manifest.title} — ${manifest.author}` : manifest.title;
    renderReaderWithText(displayTitle || 'Frankenstein Illustrated Demo', text, {
      type: 'built-in-illustrated-demo',
      key: 'frankenstein-demo',
      title: manifest.title || 'Frankenstein Illustrated Demo',
      author: manifest.author || 'Mary Wollstonecraft Shelley',
      illustrations,
      demoPath: basePath
    });
    persistReaderSession({ immediate: true });
  } catch (error) {
    renderError('Demo unavailable', error.message || 'The illustrated demo could not be loaded.');
  }
}

function renderIllustratedUpload() {
  stopReader();
  app.innerHTML = `
    <section class="panel illustrated-upload-panel">
      <h1>Upload Illustrated Book</h1>
      <p>Upload a ZIP containing <code>manifest.json</code>, the book text, and chapter images. The imported book and its images are retained with your saved reader session in this browser.</p>
      <div class="illustrated-upload-example">
        <strong>Expected ZIP contents</strong>
        <pre>book.txt
manifest.json
images/chapter-01.png
images/chapter-02.png</pre>
      </div>
      <details>
        <summary>Example manifest.json</summary>
        <pre>{
  "title": "Frankenstein",
  "author": "Mary Shelley",
  "textFile": "book.txt",
  "illustrations": [
    {
      "heading": "Chapter 1",
      "image": "images/chapter-01.png",
      "caption": "Victor's childhood near Geneva."
    }
  ]
}</pre>
      </details>
      <div class="controls">
        <input id="illustrated-book-file" type="file" accept=".zip,application/zip,application/x-zip-compressed">
        <span id="illustrated-upload-status" class="status"></span>
      </div>
    </section>`;

  app.querySelector('#illustrated-book-file')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = app.querySelector('#illustrated-upload-status');
    if (status) { status.className = 'status'; status.textContent = 'Importing illustrated book…'; }
    try {
      const response = await fetch('/api/illustrated-book/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The illustrated book could not be imported.');
      const displayTitle = payload.author ? `${payload.title} — ${payload.author}` : payload.title;
      renderReaderWithText(displayTitle, payload.text, {
        type: 'illustrated-upload',
        name: file.name,
        title: payload.title,
        author: payload.author,
        illustrations: payload.illustrations
      });
      persistReaderSession({ immediate: true });
    } catch (error) {
      if (status) { status.className = 'status error'; status.textContent = error.message; }
    }
  });
}

function normalizeArchivePath(value) {
  const parts = String(value || '').replace(/\\/g, '/').split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function resolveArchivePath(baseFile, relativePath) {
  const clean = String(relativePath || '').split('#')[0].split('?')[0];
  if (!clean) return normalizeArchivePath(baseFile);
  if (clean.startsWith('/')) return normalizeArchivePath(clean.slice(1));
  const base = normalizeArchivePath(baseFile).split('/');
  base.pop();
  return normalizeArchivePath([...base, ...clean.split('/')].join('/'));
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not provide the decompression support needed for EPUB files. Try a current version of Chrome or Edge.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEpub(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const u16 = (offset) => view.getUint16(offset, true);
  const u32 = (offset) => view.getUint32(offset, true);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This does not appear to be a valid EPUB/ZIP file.');

  const entryCount = u16(eocd + 10);
  const centralOffset = u32(eocd + 16);
  const entries = new Map();
  let cursor = centralOffset;

  for (let n = 0; n < entryCount; n += 1) {
    if (u32(cursor) !== 0x02014b50) throw new Error('The EPUB ZIP directory is malformed.');
    const method = u16(cursor + 10);
    const compressedSize = u32(cursor + 20);
    const uncompressedSize = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const localOffset = u32(cursor + 42);
    const name = normalizeArchivePath(decodeUtf8(bytes.slice(cursor + 46, cursor + 46 + nameLength)));
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const cache = new Map();
  async function read(path) {
    const normalized = normalizeArchivePath(path);
    if (cache.has(normalized)) return cache.get(normalized);
    const entry = entries.get(normalized);
    if (!entry) throw new Error(`EPUB file is missing ${normalized}.`);
    const local = entry.localOffset;
    if (u32(local) !== 0x04034b50) throw new Error(`EPUB entry ${normalized} has an invalid ZIP header.`);
    const nameLength = u16(local + 26);
    const extraLength = u16(local + 28);
    const start = local + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + entry.compressedSize);
    let result;
    if (entry.method === 0) result = compressed;
    else if (entry.method === 8) result = await inflateRaw(compressed);
    else throw new Error(`EPUB uses unsupported ZIP compression method ${entry.method}.`);
    cache.set(normalized, result);
    return result;
  }

  return { entries, read, readText: async (path) => decodeUtf8(await read(path)) };
}

function xmlLocalElements(root, name) {
  return Array.from(root.getElementsByTagNameNS?.('*', name) || root.getElementsByTagName(name) || []);
}

function firstXmlLocal(root, name) {
  return xmlLocalElements(root, name)[0] || null;
}

function cleanEpubText(value) {
  return String(value || '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
}

function epubContentLines(doc) {
  const body = doc.body || firstXmlLocal(doc, 'body') || doc.documentElement;
  const candidates = Array.from(body.querySelectorAll?.('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption') || []);
  const raw = [];
  const seen = new Set();

  for (const el of candidates) {
    // Do not duplicate text already represented by a nested paragraph.
    if (el.matches?.('li,blockquote') && el.querySelector?.('p')) continue;
    const text = cleanEpubText(el.textContent);
    if (!text) continue;

    const tag = String(el.tagName || '').toLowerCase();
    const kind = /^h[1-6]$/.test(tag) ? 'heading' : 'paragraph';
    const signature = `${kind}|${text}|${raw.length ? raw[raw.length - 1].text : ''}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const ids = [];
    let node = el;
    while (node && node !== body.parentElement) {
      if (node.id) ids.push(node.id);
      node = node.parentElement;
    }
    raw.push({ text, ids, kind });
  }

  if (!raw.length) {
    const fallback = cleanEpubText(body.textContent);
    if (fallback) raw.push({ text: fallback, ids: [], kind: 'paragraph' });
  }

  // Some EPUB producers split a single prose sentence across adjacent <p> or
  // wrapper elements. Joining obvious continuations prevents fragments such as
  // "We returned" / "to our college..." from becoming artificial paragraphs.
  const lines = [];
  for (const item of raw) {
    const previous = lines[lines.length - 1];
    const previousEndsSentence = previous ? /[.!?][\"'’”)]?$/.test(previous.text) : true;
    const startsLikeContinuation = /^[a-zà-öø-ÿ0-9,;:—–)\]}'’”]/.test(item.text);
    const previousLooksFragmentary = previous && previous.kind !== 'heading' && previous.text.length < 120 && !previousEndsSentence;

    if (previous && item.kind !== 'heading' && previous.kind !== 'heading' &&
        (startsLikeContinuation || previousLooksFragmentary)) {
      previous.text = cleanEpubText(`${previous.text} ${item.text}`);
      for (const id of item.ids) if (!previous.ids.includes(id)) previous.ids.push(id);
      continue;
    }
    lines.push({ ...item });
  }
  return lines;
}

function parseEpubNavigation(navText, navPath) {
  const doc = new DOMParser().parseFromString(navText, 'text/html');
  const navs = Array.from(doc.querySelectorAll('nav'));
  const tocNav = navs.find((nav) => {
    const epubType = nav.getAttribute('epub:type') || nav.getAttribute('type') || '';
    const role = nav.getAttribute('role') || '';
    return /toc/i.test(epubType) || /doc-toc/i.test(role);
  }) || navs[0];
  if (!tocNav) return [];
  return Array.from(tocNav.querySelectorAll('a[href]')).map((a) => {
    const rawHref = a.getAttribute('href') || '';
    const [filePart, fragment = ''] = rawHref.split('#');
    return {
      title: cleanEpubText(a.textContent),
      path: resolveArchivePath(navPath, filePart || navPath),
      fragment: decodeURIComponent(fragment || '')
    };
  }).filter((entry) => entry.title && entry.path);
}

function parseNcxNavigation(ncxText, ncxPath) {
  const doc = new DOMParser().parseFromString(ncxText, 'application/xml');
  return xmlLocalElements(doc, 'navPoint').map((point) => {
    const label = firstXmlLocal(point, 'navLabel');
    const content = firstXmlLocal(point, 'content');
    const src = content?.getAttribute('src') || '';
    const [filePart, fragment = ''] = src.split('#');
    return {
      title: cleanEpubText(label?.textContent),
      path: resolveArchivePath(ncxPath, filePart),
      fragment: decodeURIComponent(fragment || '')
    };
  }).filter((entry) => entry.title && entry.path);
}

async function parseEpubFile(file) {
  const archive = await unzipEpub(await file.arrayBuffer());
  const containerText = await archive.readText('META-INF/container.xml');
  const containerDoc = new DOMParser().parseFromString(containerText, 'application/xml');
  const rootfile = firstXmlLocal(containerDoc, 'rootfile');
  const opfPath = normalizeArchivePath(rootfile?.getAttribute('full-path') || '');
  if (!opfPath) throw new Error('The EPUB package file could not be located.');

  const opfText = await archive.readText(opfPath);
  const opfDoc = new DOMParser().parseFromString(opfText, 'application/xml');
  const title = cleanEpubText(firstXmlLocal(opfDoc, 'title')?.textContent) || file.name.replace(/\.epub$/i, '');
  const creator = cleanEpubText(firstXmlLocal(opfDoc, 'creator')?.textContent);

  const manifest = new Map();
  for (const item of xmlLocalElements(opfDoc, 'item')) {
    const id = item.getAttribute('id');
    if (!id) continue;
    manifest.set(id, {
      id,
      href: item.getAttribute('href') || '',
      mediaType: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || ''
    });
  }

  const spine = firstXmlLocal(opfDoc, 'spine');
  const spineIds = xmlLocalElements(spine || opfDoc, 'itemref').map((item) => item.getAttribute('idref')).filter(Boolean);
  if (!spineIds.length) throw new Error('The EPUB does not contain a readable spine.');

  let navEntries = [];
  const navItem = Array.from(manifest.values()).find((item) => /(^|\s)nav(\s|$)/i.test(item.properties));
  if (navItem) {
    const navPath = resolveArchivePath(opfPath, navItem.href);
    try { navEntries = parseEpubNavigation(await archive.readText(navPath), navPath); } catch (error) { console.warn('EPUB nav document could not be read.', error); }
  }
  if (!navEntries.length) {
    const tocId = spine?.getAttribute('toc');
    const ncxItem = (tocId && manifest.get(tocId)) || Array.from(manifest.values()).find((item) => /ncx/i.test(item.mediaType));
    if (ncxItem) {
      const ncxPath = resolveArchivePath(opfPath, ncxItem.href);
      try { navEntries = parseNcxNavigation(await archive.readText(ncxPath), ncxPath); } catch (error) { console.warn('EPUB NCX could not be read.', error); }
    }
  }

  const bookLines = [];
  const fileStart = new Map();
  const anchorStart = new Map();
  const headingStart = new Map();
  let wordIndex = 0;

  for (const idref of spineIds) {
    const item = manifest.get(idref);
    if (!item?.href) continue;
    const chapterPath = resolveArchivePath(opfPath, item.href);
    if (!archive.entries.has(chapterPath)) continue;
    const chapterText = await archive.readText(chapterPath);
    const chapterDoc = new DOMParser().parseFromString(chapterText, 'text/html');
    const lines = epubContentLines(chapterDoc);
    fileStart.set(chapterPath, wordIndex);
    for (const line of lines) {
      for (const id of line.ids) anchorStart.set(`${chapterPath}#${id}`, wordIndex);
      if (line.kind === 'heading') {
        const headingKey = `${chapterPath}|${normalizeTocTitle(line.text)}`;
        if (!headingStart.has(headingKey)) headingStart.set(headingKey, wordIndex);
      }
      bookLines.push(line.text);
      wordIndex += splitWords(line.text).length;
    }
    if (lines.length) bookLines.push('');
  }

  const text = bookLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || splitWords(text).length < 5) throw new Error('No readable text could be extracted from this EPUB.');

  const seen = new Set();
  const epubToc = navEntries.map((entry) => {
    // Prefer a real heading whose text matches the EPUB navigation label.
    // This avoids TOC links landing on incidental paragraph anchors inserted
    // by the publisher for page breaks or formatting.
    const headingKey = `${entry.path}|${normalizeTocTitle(entry.title)}`;
    const matchedHeadingIndex = headingStart.get(headingKey);
    const anchorKey = entry.fragment ? `${entry.path}#${entry.fragment}` : '';
    const anchoredIndex = anchorKey ? anchorStart.get(anchorKey) : undefined;
    const index = matchedHeadingIndex ?? anchoredIndex ?? fileStart.get(entry.path);
    if (!Number.isFinite(index)) return null;
    return { title: entry.title, index, type: 'chapter' };
  }).filter(Boolean).filter((entry) => {
    const key = `${entry.index}|${normalizeTocTitle(entry.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);

  // If the EPUB has no usable nav document, its chapter files still provide
  // reliable boundaries that are cleaner than guessing from a printed TOC.
  if (!epubToc.length) {
    for (const idref of spineIds) {
      const item = manifest.get(idref);
      if (!item?.href) continue;
      const chapterPath = resolveArchivePath(opfPath, item.href);
      const index = fileStart.get(chapterPath);
      if (!Number.isFinite(index)) continue;
      epubToc.push({ title: `Section ${epubToc.length + 1}`, index, type: 'chapter' });
    }
  }

  return {
    title: creator ? `${title} — ${creator}` : title,
    text,
    source: {
      type: 'epub-upload',
      name: file.name,
      epubTitle: title,
      author: creator,
      epubToc
    }
  };
}

function renderUpload() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>Upload Book or Text</h1>
      <p>Select an EPUB/EPUB3 or UTF-8 text file. EPUB books are unpacked and parsed locally in your browser; the EPUB itself is not uploaded to the server. Mark, Set, Go! uses the EPUB's built-in reading order and table of contents when available.</p>
      <div class="controls"><input id="text-file" type="file" accept=".epub,application/epub+zip,.txt,text/plain"><span id="upload-status" class="status"></span></div>
    </section>`;
  app.querySelector('#text-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = app.querySelector('#upload-status');
    try {
      const isEpub = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
      if (isEpub) {
        status.className = 'status';
        status.textContent = 'Opening EPUB…';
        const book = await parseEpubFile(file);
        renderReaderWithText(book.title, book.text, book.source);
      } else {
        const text = await file.text();
        renderReaderWithText(file.name, text, { type: 'upload', name: file.name });
      }
    } catch (error) {
      console.error('Book import failed.', error);
      status.className = 'status error';
      status.textContent = error?.message || 'The file could not be read.';
    }
  });
}

function renderHelp() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>How to Use Mark, Set, Go!</h1>
      <div class="help-grid">
        <article class="help-card"><h2>Test</h2><p>Choose a title under WPM Test, press GO!, read all 250 words, then press Stop.</p></article>
        <article class="help-card"><h2>Highlight</h2><p>The complete passage stays visible while the current word group is highlighted and the pane follows it automatically.</p></article>
        <article class="help-card"><h2>Bold Focus</h2><p>The full passage remains visible while the current word group becomes bold and one size larger, without a colored highlight.</p></article>
        <article class="help-card"><h2>Pointing Guide</h2><p>A standalone reading mode that keeps the full passage visible while a pointing hand glides beneath the active word group.</p></article>
        <article class="help-card"><h2>Smooth Glide</h2><p>A soft focus band glides continuously from one word group to the next while the complete passage stays visible.</p></article>
        <article class="help-card"><h2>Marquee</h2><p>Words appear progressively, and the pane follows your reading position automatically.</p></article>
        <article class="help-card"><h2>Bionic text</h2><p>Turn on Bionic text to bold the opening portion of each word in any reading mode.</p></article>
        <article class="help-card"><h2>Translate</h2><p>Choose a language and translate the passage. Click any translated word to display an English meaning in the side panel.</p></article>
      </div>
    </section>`;
}

function renderAbout() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>About</h1>
      <p>Created by Brian Baker for a Harvard CS50 final project.</p>
      <p>This browser edition was converted from the original Python and guizero desktop application.</p>
    </section>`;
}

function renderError(title, message) {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>${escapeHtml(title)}</h1><p class="status error">${escapeHtml(message)}</p><button class="secondary" data-action="home">Return home</button></section>`;
  app.querySelector('[data-action="home"]')?.addEventListener('click', renderHome);
}

document.addEventListener('click', (event) => {
  const test = event.target.closest('[data-test]');
  const read = event.target.closest('[data-read]');
  const action = event.target.closest('[data-action]');
  const quickMusic = event.target.closest('[data-music-quick]');
  if (test) { rememberReaderForReturn(); closeMenus(); renderWpmTest(test.dataset.test); }
  if (read) { rememberReaderForReturn(); closeMenus(); renderReader(read.dataset.read); }
  if (quickMusic) {
    closeMenus();
    const choice = musicChoices.find((item) => item.id === quickMusic.dataset.musicQuick);
    if (choice) playMusic(choice);
  }
  if (action) {
    if (action.dataset.action !== 'reader') rememberReaderForReturn();
    closeMenus();
    if (action.dataset.action === 'reader') renderCurrentReader();
    if (action.dataset.action === 'home') renderHome();
    if (action.dataset.action === 'help') renderHelp();
    if (action.dataset.action === 'about') renderAbout();
    if (action.dataset.action === 'music') renderMusicLibrary();
    if (action.dataset.action === 'reading-list') renderReadingList();
    if (action.dataset.action === 'progress-dashboard') renderProgressDashboard();
    if (action.dataset.action === 'vocabulary-builder') renderVocabularyBuilder();
  }
});

musicNextButton?.addEventListener('click', () => {
  if (musicSearchState) playMusicSearchCandidate(musicSearchState.index + 1);
});
document.querySelector('#music-close')?.addEventListener('click', stopMusic);
document.querySelector('#music-minimize')?.addEventListener('click', () => {
  const minimized = musicDock.classList.toggle('minimized');
  musicPlayerWrap.hidden = minimized;
  document.querySelector('#music-minimize').textContent = minimized ? '□' : '—';
  document.querySelector('#music-minimize').setAttribute('aria-label', minimized ? 'Restore music player' : 'Minimize music player');
});
try {
  const savedMusic = JSON.parse(localStorage.getItem('markSetGoMusic') || 'null');
  if (savedMusic?.src) {
    const retiredIds = ['5qap5aO4i9A', 'EcEMX-63PKY'];
    if (retiredIds.some((id) => savedMusic.src.includes(id))) {
      localStorage.removeItem('markSetGoMusic');
    } else {
      if (savedMusic.search?.videoIds?.length) {
        musicSearchState = savedMusic.search;
        playMusicSearchCandidate(Number(savedMusic.search.index || 0));
      } else {
        playMusic(savedMusic);
      }
    }
  }
} catch {}

window.setInterval(() => { if (state.words.length) persistReaderSession(); }, 10000);
let bookPageResizeTimer = null;
window.addEventListener('resize', () => {
  if (!state.bookPages) return;
  window.clearTimeout(bookPageResizeTimer);
  bookPageResizeTimer = window.setTimeout(() => scheduleBookPageReflow(), 90);
});

// Fullscreen and pane changes can alter the reader width without producing a
// useful window resize event. Observe the actual reader box and rebuild the
// two-page geometry while preserving the same logical spread.
let observedBookReader = null;
const bookPageResizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver(() => {
      if (!state.bookPages) return;
      window.clearTimeout(bookPageResizeTimer);
      bookPageResizeTimer = window.setTimeout(() => scheduleBookPageReflow(), 70);
    })
  : null;
function observeBookPageReader() {
  const reader = app.querySelector('#reader');
  if (!bookPageResizeObserver || !reader || reader === observedBookReader) return;
  if (observedBookReader) bookPageResizeObserver.unobserve(observedBookReader);
  observedBookReader = reader;
  bookPageResizeObserver.observe(reader);
}

window.addEventListener('pagehide', () => persistReaderSession({ immediate: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistReaderSession({ immediate: true }); });

(async function restorePreviousReaderOnLaunch() {
  const saved = await readReaderSession();
  if (!applyReaderSessionSnapshot(saved, { resumePlayback: false })) renderHome();
})();

// Keep top navigation popovers over the page rather than in document flow.
(function initializeOverlayNavigation() {
  const header = document.querySelector('.site-header');
  const topMenus = Array.from(document.querySelectorAll('.site-header nav > details'));
  if (!header || !topMenus.length) return;

  const updateMenuTop = () => {
    document.documentElement.style.setProperty('--mobile-menu-top', `${Math.ceil(header.getBoundingClientRect().bottom + 4)}px`);
  };
  updateMenuTop();
  window.addEventListener('resize', updateMenuTop, { passive: true });

  topMenus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      updateMenuTop();
      topMenus.forEach((other) => {
        if (other !== menu) other.removeAttribute('open');
      });
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.site-header nav')) {
      topMenus.forEach((menu) => menu.removeAttribute('open'));
    }
  });
})();
