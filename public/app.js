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
const READER_SESSION_META_KEY = 'markSetGoReaderSessionMetaV1';
// The top Reader button must return only to a reader explicitly opened during
// this browser/app session. Persistent IndexedDB is reserved for Home > Resume.
let activeReaderSnapshot = null;

async function writeReaderSession(snapshot) {
  return readerSessionManager.write(snapshot);
}

async function readReaderSession() {
  return readerSessionManager.read();
}

async function clearReaderSession() {
  await readerSessionManager.clear();
  try { localStorage.removeItem(READER_SESSION_META_KEY); } catch {}
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
    focusAnchorColor: app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866',
    focusAnchorBold: Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold),
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
    if (snapshot) {
      try {
        const totalWords = Array.isArray(state.words) ? state.words.length : splitWords(snapshot.currentText || '').length;
        localStorage.setItem(READER_SESSION_META_KEY, JSON.stringify({
          documentId: snapshot.documentId || state.documentId || '',
          title: snapshot.title || state.title || 'Untitled',
          index: Math.max(0, Number(snapshot.index) || 0),
          totalWords: Math.max(0, Number(totalWords) || 0),
          savedAt: new Date().toISOString()
        }));
      } catch {}
      writeReaderSession(snapshot);
    }
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

function grokipediaSearchUrl(title, author = '') {
  const cleanTitle = String(title || '').replace(/\s*[—-].*$/, '').trim();
  const query = `${cleanTitle}${author ? ` ${author}` : ''}`.trim();
  return `https://grokipedia.com/search?q=${encodeURIComponent(query)}`;
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
  if (grokipediaLink) grokipediaLink.href = grokipediaSearchUrl(title, source?.author || '');
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
  {"volume": 3, "era": "Ancient", "author": "Homer", "title": "The Iliad", "query": "Iliad Homer"},
  {"volume": 3, "era": "Ancient", "author": "Homer", "title": "The Odyssey", "query": "Odyssey Homer"},
  {"volume": 4, "era": "Ancient Drama", "author": "Aeschylus", "title": "Plays", "query": "Aeschylus plays"},
  {"volume": 4, "era": "Ancient Drama", "author": "Sophocles", "title": "Plays", "query": "Sophocles plays"},
  {"volume": 4, "era": "Ancient Drama", "author": "Euripides", "title": "Plays", "query": "Euripides plays"},
  {"volume": 4, "era": "Ancient Drama", "author": "Aristophanes", "title": "Plays", "query": "Aristophanes plays"},
  {"volume": 5, "era": "Ancient History", "author": "Herodotus", "title": "The History of the Persian Wars", "query": "Herodotus Persian Wars"},
  {"volume": 5, "era": "Ancient History", "author": "Thucydides", "title": "The History of the Peloponnesian War", "query": "Thucydides Peloponnesian War"},
  {"volume": 6, "era": "Ancient Philosophy", "author": "Plato", "title": "Dialogues and The Seventh Letter", "query": "Plato Dialogues"},
  {"volume": 7, "era": "Ancient Philosophy", "author": "Aristotle", "title": "Works, Volume I", "query": "Aristotle works"},
  {"volume": 8, "era": "Ancient Philosophy", "author": "Aristotle", "title": "Works, Volume II", "query": "Aristotle works"},
  {"volume": 9, "era": "Ancient Science & Medicine", "author": "Hippocrates", "title": "Works", "query": "Hippocrates works"},
  {"volume": 9, "era": "Ancient Science & Medicine", "author": "Galen", "title": "On the Natural Faculties", "query": "Galen Natural Faculties"},
  {"volume": 10, "era": "Ancient Mathematics", "author": "Euclid", "title": "Elements", "query": "Euclid Elements"},
  {"volume": 10, "era": "Ancient Mathematics", "author": "Archimedes", "title": "Works", "query": "Archimedes works"},
  {"volume": 10, "era": "Ancient Mathematics", "author": "Nicomachus", "title": "Introduction to Arithmetic", "query": "Nicomachus Introduction Arithmetic"},
  {"volume": 11, "era": "Ancient Philosophy", "author": "Lucretius", "title": "The Way Things Are", "query": "Lucretius Nature Things"},
  {"volume": 11, "era": "Ancient Philosophy", "author": "Epictetus", "title": "Discourses", "query": "Epictetus Discourses"},
  {"volume": 11, "era": "Ancient Philosophy", "author": "Marcus Aurelius", "title": "Meditations", "query": "Marcus Aurelius Meditations"},
  {"volume": 11, "era": "Ancient Philosophy", "author": "Plotinus", "title": "The Six Enneads", "query": "Plotinus Enneads"},
  {"volume": 12, "era": "Roman Literature", "author": "Virgil", "title": "Eclogues, Georgics, and The Aeneid", "query": "Virgil Aeneid"},
  {"volume": 13, "era": "Roman History", "author": "Plutarch", "title": "The Lives of the Noble Grecians and Romans", "query": "Plutarch Lives"},
  {"volume": 14, "era": "Roman History", "author": "Tacitus", "title": "The Annals and The Histories", "query": "Tacitus Annals Histories"},
  {"volume": 15, "era": "Astronomy", "author": "Ptolemy", "title": "The Almagest", "query": "Ptolemy Almagest"},
  {"volume": 15, "era": "Astronomy", "author": "Nicolaus Copernicus", "title": "On the Revolutions of the Heavenly Spheres", "query": "Copernicus Revolutions Heavenly Spheres"},
  {"volume": 15, "era": "Astronomy", "author": "Johannes Kepler", "title": "Epitome of Copernican Astronomy and Harmonies of the World", "query": "Kepler Copernican Astronomy Harmonies World"},
  {"volume": 16, "era": "Christian Thought", "author": "Saint Augustine", "title": "The Confessions", "query": "Augustine Confessions"},
  {"volume": 16, "era": "Christian Thought", "author": "Saint Augustine", "title": "The City of God", "query": "Augustine City of God"},
  {"volume": 16, "era": "Christian Thought", "author": "Saint Augustine", "title": "On Christian Doctrine", "query": "Augustine Christian Doctrine"},
  {"volume": 17, "era": "Medieval Philosophy & Theology", "author": "Thomas Aquinas", "title": "Summa Theologica, Part I", "query": "Aquinas Summa Theologica"},
  {"volume": 18, "era": "Medieval Philosophy & Theology", "author": "Thomas Aquinas", "title": "Summa Theologica, Part II", "query": "Aquinas Summa Theologica"},
  {"volume": 19, "era": "Medieval Literature", "author": "Dante Alighieri", "title": "The Divine Comedy", "query": "Dante Divine Comedy"},
  {"volume": 19, "era": "Medieval Literature", "author": "Geoffrey Chaucer", "title": "Troilus and Criseyde", "query": "Chaucer Troilus Criseyde"},
  {"volume": 19, "era": "Medieval Literature", "author": "Geoffrey Chaucer", "title": "The Canterbury Tales", "query": "Chaucer Canterbury Tales"},
  {"volume": 20, "era": "Reformation", "author": "John Calvin", "title": "Institutes of the Christian Religion", "query": "Calvin Institutes Christian Religion"},
  {"volume": 21, "era": "Political Philosophy", "author": "Niccolò Machiavelli", "title": "The Prince", "query": "Machiavelli Prince"},
  {"volume": 21, "era": "Political Philosophy", "author": "Thomas Hobbes", "title": "Leviathan", "query": "Hobbes Leviathan"},
  {"volume": 22, "era": "Renaissance Literature", "author": "François Rabelais", "title": "Gargantua and Pantagruel", "query": "Rabelais Gargantua Pantagruel"},
  {"volume": 23, "era": "Renaissance Thought", "author": "Desiderius Erasmus", "title": "Praise of Folly", "query": "Erasmus Praise Folly"},
  {"volume": 23, "era": "Renaissance Thought", "author": "Michel de Montaigne", "title": "Essays", "query": "Montaigne Essays"},
  {"volume": 24, "era": "Shakespeare", "author": "William Shakespeare", "title": "Plays, Volume I", "query": "Shakespeare plays"},
  {"volume": 25, "era": "Shakespeare", "author": "William Shakespeare", "title": "Plays, Volume II and Sonnets", "query": "Shakespeare Sonnets plays"},
  {"volume": 26, "era": "Early Modern Science", "author": "William Gilbert", "title": "On the Loadstone and Magnetic Bodies", "query": "William Gilbert Loadstone"},
  {"volume": 26, "era": "Early Modern Science", "author": "Galileo Galilei", "title": "Dialogues Concerning the Two New Sciences", "query": "Galileo Two New Sciences"},
  {"volume": 26, "era": "Early Modern Science", "author": "William Harvey", "title": "Works on the Heart, Blood, and Generation", "query": "William Harvey heart blood animals"},
  {"volume": 27, "era": "Early Modern Literature", "author": "Miguel de Cervantes", "title": "Don Quixote", "query": "Cervantes Don Quixote"},
  {"volume": 28, "era": "Early Modern Philosophy", "author": "Francis Bacon", "title": "Advancement of Learning, Novum Organum, and New Atlantis", "query": "Francis Bacon Novum Organum"},
  {"volume": 28, "era": "Early Modern Philosophy", "author": "René Descartes", "title": "Major Philosophical Works", "query": "Descartes Discourse Method Meditations"},
  {"volume": 28, "era": "Early Modern Philosophy", "author": "Benedict de Spinoza", "title": "Ethics", "query": "Spinoza Ethics"},
  {"volume": 29, "era": "Early Modern Literature", "author": "John Milton", "title": "Paradise Lost and Other Works", "query": "Milton Paradise Lost"},
  {"volume": 30, "era": "Early Modern Thought", "author": "Blaise Pascal", "title": "Provincial Letters, Pensées, and Scientific Treatises", "query": "Pascal Pensees"},
  {"volume": 31, "era": "French Drama", "author": "Molière", "title": "Major Plays", "query": "Moliere plays"},
  {"volume": 31, "era": "French Drama", "author": "Jean Racine", "title": "Berenice and Phaedra", "query": "Racine Phaedra Berenice"},
  {"volume": 32, "era": "Science", "author": "Isaac Newton", "title": "Mathematical Principles of Natural Philosophy and Optics", "query": "Newton Principia Opticks"},
  {"volume": 32, "era": "Science", "author": "Christiaan Huygens", "title": "Treatise on Light", "query": "Huygens Treatise Light"},
  {"volume": 33, "era": "Enlightenment Philosophy", "author": "John Locke", "title": "A Letter Concerning Toleration, Civil Government, and Human Understanding", "query": "Locke Human Understanding Government"},
  {"volume": 33, "era": "Enlightenment Philosophy", "author": "George Berkeley", "title": "The Principles of Human Knowledge", "query": "Berkeley Human Knowledge"},
  {"volume": 33, "era": "Enlightenment Philosophy", "author": "David Hume", "title": "An Enquiry Concerning Human Understanding", "query": "Hume Enquiry Human Understanding"},
  {"volume": 34, "era": "Enlightenment Literature", "author": "Jonathan Swift", "title": "Gulliver’s Travels", "query": "Swift Gulliver Travels"},
  {"volume": 34, "era": "Enlightenment Literature", "author": "Voltaire", "title": "Candide", "query": "Voltaire Candide"},
  {"volume": 34, "era": "Enlightenment Literature", "author": "Denis Diderot", "title": "Rameau’s Nephew", "query": "Diderot Rameau Nephew"},
  {"volume": 35, "era": "Political Philosophy", "author": "Montesquieu", "title": "The Spirit of Laws", "query": "Montesquieu Spirit Laws"},
  {"volume": 35, "era": "Political Philosophy", "author": "Jean-Jacques Rousseau", "title": "Political Writings including The Social Contract", "query": "Rousseau Social Contract"},
  {"volume": 36, "era": "Economics", "author": "Adam Smith", "title": "The Wealth of Nations", "query": "Adam Smith Wealth Nations"},
  {"volume": 37, "era": "History", "author": "Edward Gibbon", "title": "The Decline and Fall of the Roman Empire, Volume I", "query": "Gibbon Decline Fall Roman Empire"},
  {"volume": 38, "era": "History", "author": "Edward Gibbon", "title": "The Decline and Fall of the Roman Empire, Volume II", "query": "Gibbon Decline Fall Roman Empire"},
  {"volume": 39, "era": "Modern Philosophy", "author": "Immanuel Kant", "title": "Major Critical and Moral Works", "query": "Kant Critique Pure Reason"},
  {"volume": 40, "era": "American Political Thought", "author": "United States", "title": "Declaration, Articles of Confederation, and Constitution", "query": "United States Constitution Declaration Independence"},
  {"volume": 40, "era": "American Political Thought", "author": "Alexander Hamilton, James Madison, John Jay", "title": "The Federalist Papers", "query": "Federalist Papers"},
  {"volume": 40, "era": "Liberal Political Thought", "author": "John Stuart Mill", "title": "On Liberty, Representative Government, and Utilitarianism", "query": "John Stuart Mill On Liberty"},
  {"volume": 41, "era": "Biography", "author": "James Boswell", "title": "The Life of Samuel Johnson", "query": "Boswell Life Samuel Johnson"},
  {"volume": 42, "era": "Science", "author": "Antoine Lavoisier", "title": "Elements of Chemistry", "query": "Lavoisier Elements Chemistry"},
  {"volume": 42, "era": "Science", "author": "Michael Faraday", "title": "Experimental Researches in Electricity", "query": "Faraday Experimental Researches Electricity"},
  {"volume": 43, "era": "Modern Philosophy", "author": "G. W. F. Hegel", "title": "The Philosophy of Right and The Philosophy of History", "query": "Hegel Philosophy Right History"},
  {"volume": 43, "era": "Modern Philosophy", "author": "Søren Kierkegaard", "title": "Fear and Trembling", "query": "Kierkegaard Fear Trembling"},
  {"volume": 43, "era": "Modern Philosophy", "author": "Friedrich Nietzsche", "title": "Beyond Good and Evil", "query": "Nietzsche Beyond Good Evil"},
  {"volume": 44, "era": "Political Thought", "author": "Alexis de Tocqueville", "title": "Democracy in America", "query": "Tocqueville Democracy America"},
  {"volume": 45, "era": "Literature", "author": "Johann Wolfgang von Goethe", "title": "Faust", "query": "Goethe Faust"},
  {"volume": 45, "era": "Literature", "author": "Honoré de Balzac", "title": "Cousin Bette", "query": "Balzac Cousin Bette"},
  {"volume": 46, "era": "Literature", "author": "Jane Austen", "title": "Emma", "query": "Jane Austen Emma"},
  {"volume": 46, "era": "Literature", "author": "George Eliot", "title": "Middlemarch", "query": "George Eliot Middlemarch"},
  {"volume": 47, "era": "Literature", "author": "Charles Dickens", "title": "Little Dorrit", "query": "Dickens Little Dorrit"},
  {"volume": 48, "era": "Literature", "author": "Herman Melville", "title": "Moby-Dick", "query": "Melville Moby Dick"},
  {"volume": 48, "era": "Literature", "author": "Mark Twain", "title": "Adventures of Huckleberry Finn", "query": "Mark Twain Huckleberry Finn"},
  {"volume": 49, "era": "Science", "author": "Charles Darwin", "title": "The Origin of Species", "query": "Darwin Origin Species"},
  {"volume": 49, "era": "Science", "author": "Charles Darwin", "title": "The Descent of Man", "query": "Darwin Descent Man"},
  {"volume": 50, "era": "Political Economy", "author": "Karl Marx and Friedrich Engels", "title": "Manifesto of the Communist Party", "query": "Communist Manifesto Marx Engels"},
  {"volume": 50, "era": "Political Economy", "author": "Karl Marx", "title": "Capital, Volume I", "query": "Marx Capital Volume 1"},
  {"volume": 51, "era": "Literature", "author": "Leo Tolstoy", "title": "War and Peace", "query": "Tolstoy War Peace"},
  {"volume": 52, "era": "Literature", "author": "Fyodor Dostoevsky", "title": "The Brothers Karamazov", "query": "Dostoevsky Brothers Karamazov"},
  {"volume": 52, "era": "Literature", "author": "Henrik Ibsen", "title": "A Doll’s House, The Wild Duck, Hedda Gabler, and The Master Builder", "query": "Ibsen plays"},
  {"volume": 53, "era": "Psychology", "author": "William James", "title": "The Principles of Psychology", "query": "William James Principles Psychology"},
  {"volume": 54, "era": "Psychology", "author": "Sigmund Freud", "title": "Major Works", "query": "Freud Interpretation Dreams Psychoanalysis"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "William James", "title": "Pragmatism", "query": "William James Pragmatism"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "Henri Bergson", "title": "An Introduction to Metaphysics", "query": "Bergson Introduction Metaphysics"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "John Dewey", "title": "Experience and Education", "query": "Dewey Experience Education"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "Alfred North Whitehead", "title": "Science and the Modern World", "query": "Whitehead Science Modern World"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "Bertrand Russell", "title": "The Problems of Philosophy", "query": "Russell Problems Philosophy"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "Martin Heidegger", "title": "What Is Metaphysics?", "query": "Heidegger What Is Metaphysics"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "Ludwig Wittgenstein", "title": "Philosophical Investigations", "query": "Wittgenstein Philosophical Investigations"},
  {"volume": 55, "era": "20th Century Philosophy & Religion", "author": "Karl Barth", "title": "The Word of God and the Word of Man", "query": "Karl Barth Word God Word Man"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Henri Poincaré", "title": "Science and Hypothesis", "query": "Poincare Science Hypothesis"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Max Planck", "title": "Scientific Autobiography and Other Papers", "query": "Planck Scientific Autobiography"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Alfred North Whitehead", "title": "An Introduction to Mathematics", "query": "Whitehead Introduction Mathematics"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Albert Einstein", "title": "Relativity: The Special and the General Theory", "query": "Einstein Relativity"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Arthur Eddington", "title": "The Expanding Universe", "query": "Eddington Expanding Universe"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Niels Bohr", "title": "Atomic Theory and Selected Essays", "query": "Bohr Atomic Theory"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "G. H. Hardy", "title": "A Mathematician’s Apology", "query": "Hardy Mathematician Apology"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Werner Heisenberg", "title": "Physics and Philosophy", "query": "Heisenberg Physics Philosophy"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Erwin Schrödinger", "title": "What Is Life?", "query": "Schrodinger What Is Life"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "Theodosius Dobzhansky", "title": "Genetics and the Origin of Species", "query": "Dobzhansky Genetics Origin Species"},
  {"volume": 56, "era": "20th Century Natural Science", "author": "C. H. Waddington", "title": "The Nature of Life", "query": "Waddington Nature Life"},
  {"volume": 57, "era": "20th Century Social Science", "author": "Thorstein Veblen", "title": "The Theory of the Leisure Class", "query": "Veblen Theory Leisure Class"},
  {"volume": 57, "era": "20th Century Social Science", "author": "R. H. Tawney", "title": "The Acquisitive Society", "query": "Tawney Acquisitive Society"},
  {"volume": 57, "era": "20th Century Social Science", "author": "John Maynard Keynes", "title": "The General Theory of Employment, Interest and Money", "query": "Keynes General Theory Employment Interest Money"},
  {"volume": 58, "era": "20th Century Social Science", "author": "James George Frazer", "title": "The Golden Bough (selections)", "query": "Frazer Golden Bough"},
  {"volume": 58, "era": "20th Century Social Science", "author": "Max Weber", "title": "Essays in Sociology (selections)", "query": "Max Weber Sociology Essays"},
  {"volume": 58, "era": "20th Century Social Science", "author": "Johan Huizinga", "title": "The Waning of the Middle Ages", "query": "Huizinga Waning Middle Ages"},
  {"volume": 58, "era": "20th Century Social Science", "author": "Claude Lévi-Strauss", "title": "Structural Anthropology (selections)", "query": "Levi Strauss Structural Anthropology"},
  {"volume": 59, "era": "20th Century Literature", "author": "Henry James", "title": "The Beast in the Jungle", "query": "Henry James Beast Jungle"},
  {"volume": 59, "era": "20th Century Literature", "author": "George Bernard Shaw", "title": "Saint Joan", "query": "Shaw Saint Joan"},
  {"volume": 59, "era": "20th Century Literature", "author": "Joseph Conrad", "title": "Heart of Darkness", "query": "Conrad Heart Darkness"},
  {"volume": 59, "era": "20th Century Literature", "author": "Anton Chekhov", "title": "Uncle Vanya", "query": "Chekhov Uncle Vanya"},
  {"volume": 59, "era": "20th Century Literature", "author": "Luigi Pirandello", "title": "Six Characters in Search of an Author", "query": "Pirandello Six Characters"},
  {"volume": 59, "era": "20th Century Literature", "author": "Marcel Proust", "title": "Swann in Love", "query": "Proust Swann in Love"},
  {"volume": 59, "era": "20th Century Literature", "author": "Willa Cather", "title": "A Lost Lady", "query": "Willa Cather Lost Lady"},
  {"volume": 59, "era": "20th Century Literature", "author": "Thomas Mann", "title": "Death in Venice", "query": "Thomas Mann Death Venice"},
  {"volume": 59, "era": "20th Century Literature", "author": "James Joyce", "title": "A Portrait of the Artist as a Young Man", "query": "Joyce Portrait Artist Young Man"},
  {"volume": 60, "era": "20th Century Literature", "author": "Virginia Woolf", "title": "To the Lighthouse", "query": "Woolf To Lighthouse"},
  {"volume": 60, "era": "20th Century Literature", "author": "Franz Kafka", "title": "The Metamorphosis", "query": "Kafka Metamorphosis"},
  {"volume": 60, "era": "20th Century Literature", "author": "D. H. Lawrence", "title": "The Prussian Officer", "query": "Lawrence Prussian Officer"},
  {"volume": 60, "era": "20th Century Literature", "author": "T. S. Eliot", "title": "The Waste Land", "query": "Eliot Waste Land"},
  {"volume": 60, "era": "20th Century Literature", "author": "Eugene O’Neill", "title": "Mourning Becomes Electra", "query": "O'Neill Mourning Becomes Electra"},
  {"volume": 60, "era": "20th Century Literature", "author": "F. Scott Fitzgerald", "title": "The Great Gatsby", "query": "Fitzgerald Great Gatsby"},
  {"volume": 60, "era": "20th Century Literature", "author": "William Faulkner", "title": "A Rose for Emily", "query": "Faulkner Rose Emily"},
  {"volume": 60, "era": "20th Century Literature", "author": "Bertolt Brecht", "title": "Mother Courage and Her Children", "query": "Brecht Mother Courage"},
  {"volume": 60, "era": "20th Century Literature", "author": "Ernest Hemingway", "title": "The Short Happy Life of Francis Macomber", "query": "Hemingway Francis Macomber"},
  {"volume": 60, "era": "20th Century Literature", "author": "George Orwell", "title": "Animal Farm", "query": "Orwell Animal Farm"},
  {"volume": 60, "era": "20th Century Literature", "author": "Samuel Beckett", "title": "Waiting for Godot", "query": "Beckett Waiting Godot"}
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
  const anchorColor = app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866';
  const anchorBold = Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold);
  stage.style.setProperty('--focus-anchor-color', anchorColor);
  stage.classList.toggle('focus-anchor-bold', anchorBold);
  element.replaceChildren(stage);
}

function modeSupportsFocusAnchorOverlay(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'flash'].includes(mode);
}

function refreshFocusAnchorStyle() {
  const color = app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866';
  const bold = Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold);
  state.focusAnchorColor = color;
  state.focusAnchorBold = bold;
  app.querySelectorAll('.focus-anchor-stage, #focus-anchor-overlay').forEach((element) => {
    element.style.setProperty('--focus-anchor-color', color);
    element.classList.toggle('focus-anchor-bold', bold);
  });
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

function focusAnchorIsFullscreen(overlay) {
  const frame = overlay?.closest('.reader-frame');
  return Boolean(frame && (document.fullscreenElement === frame || frame.classList.contains('fullscreen-fallback')));
}

function applyFocusAnchorPosition(overlay) {
  if (!overlay) return;
  if (focusAnchorIsFullscreen(overlay)) {
    // Fullscreen uses a dedicated, stable top band so the reading text always begins below it.
    overlay.classList.add('focus-anchor-fullscreen-band');
    overlay.style.left = '50%';
    overlay.style.top = '0.75rem';
    overlay.style.transform = 'translateX(-50%)';
  } else {
    overlay.classList.remove('focus-anchor-fullscreen-band');
    const position = state.focusAnchorPosition;
    if (position) {
      overlay.style.left = `${Math.max(0, Math.min(100, position.x))}%`;
      overlay.style.top = `${Math.max(0, Math.min(100, position.y))}%`;
      overlay.style.transform = 'translate(-50%, -50%)';
    } else {
      overlay.style.left = '50%';
      overlay.style.top = '3.2rem';
      overlay.style.transform = 'translateX(-50%)';
    }
  }
  requestAnimationFrame(applyFocusAnchorReaderClearance);
}

function refreshFocusAnchorFullscreenLayout() {
  const overlay = app.querySelector('#focus-anchor-overlay');
  if (!overlay || overlay.hidden) return;
  applyFocusAnchorPosition(overlay);
  refreshFocusAnchorStyle();
}

function bindDraggableFocusAnchor(overlay) {
  if (!overlay || overlay.dataset.dragBound === 'true') return;
  overlay.dataset.dragBound = 'true';
  overlay.title = 'Drag the Focus Anchor to reposition it';

  overlay.addEventListener('pointerdown', (event) => {
    if (overlay.hidden || focusAnchorIsFullscreen(overlay)) return;
    if (event.button !== undefined && event.button !== 0) return;

    const frame = overlay.closest('.reader-frame');
    if (!frame) return;

    event.preventDefault();
    event.stopPropagation();
    overlay.classList.add('focus-anchor-dragging');

    const move = (moveEvent) => {
      const rect = frame.getBoundingClientRect();
      const x = ((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((moveEvent.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      state.focusAnchorPosition = {
        x: Math.max(3, Math.min(97, x)),
        y: Math.max(5, Math.min(95, y))
      };
      applyFocusAnchorPosition(overlay);
    };

    const stop = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
      overlay.classList.remove('focus-anchor-dragging');
      persistReaderSession({ immediate: true });
    };

    // Track at window level. This remains reliable even when the pointer leaves
    // the overlay or crosses the reading text while dragging.
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);

    move(event);
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
  overlay.style.setProperty('--focus-anchor-color', app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866');
  overlay.classList.toggle('focus-anchor-bold', Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold));
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
  if (!state.words.length || !state.title || !app.querySelector('#reader')) return;

  state.returnIndex = Math.max(0, state.index || 0);
  state.returnMode = getSelectedMode?.() || state.renderedMode || 'highlight';
  state.returnWasRunning = isReaderRunning();
  state.returnControls = captureReaderControls();

  activeReaderSnapshot = buildReaderSessionSnapshot() || {
    title: state.title,
    currentText: state.currentText,
    originalText: state.originalText,
    source: state.source,
    language: state.language,
    index: state.returnIndex,
    wasRunning: state.returnWasRunning,
    controls: state.returnControls
  };
  if (activeReaderSnapshot) {
    activeReaderSnapshot.index = state.returnIndex;
    activeReaderSnapshot.wasRunning = state.returnWasRunning;
    activeReaderSnapshot.controls = { ...(activeReaderSnapshot.controls || {}), ...state.returnControls };
    activeReaderSnapshot.controls.mode = state.returnMode;
  }

  persistReaderSession({ immediate: true });
}


function applyReaderSessionSnapshot(snapshot, { resumePlayback = true } = {}) {
  if (!snapshot?.title || !snapshot?.currentText) return false;
  const controls = snapshot.controls || {};

  renderReaderWithText(snapshot.title, snapshot.currentText, snapshot.source || { type: 'restored' });

  state.originalText = snapshot.originalText || snapshot.currentText;
  state.currentText = snapshot.currentText;
  state.language = snapshot.language || 'en';
  state.wpm = Number(controls.wpm ?? snapshot.wpm ?? 300);
  state.bionic = Boolean(controls.bionic ?? snapshot.bionic);
  state.meaningfulChunks = Boolean(controls.meaningfulChunks ?? snapshot.meaningfulChunks);
  state.focusAnchor = Boolean(controls.focusAnchor ?? snapshot.focusAnchor);
  state.focusAnchorPosition = controls.focusAnchorPosition || snapshot.focusAnchorPosition || null;
  state.focusAnchorFontSize = Number(controls.focusAnchorFontSize ?? snapshot.focusAnchorFontSize ?? 24);
  state.focusAnchorColor = controls.focusAnchorColor || snapshot.focusAnchorColor || '#20a866';
  state.focusAnchorBold = Boolean(controls.focusAnchorBold ?? snapshot.focusAnchorBold);
  state.bookPages = Boolean(controls.bookPages ?? snapshot.bookPages);
  state.illustrationMode = controls.illustrationMode || snapshot.illustrationMode || 'off';

  const mode = controls.mode || snapshot.mode || 'highlight';
  const wordCount = Math.max(1, Number(controls.wordCount ?? 1));
  const fontSize = Math.max(10, Number(controls.fontSize ?? 14));
  const fontFamily = controls.fontFamily || 'system';
  const theme = controls.theme || 'dark';
  const savedIndex = Math.max(0, Number(snapshot.index) || 0);

  state.returnIndex = savedIndex;
  state.returnMode = mode;
  state.returnWasRunning = Boolean(snapshot.wasRunning);
  state.returnControls = {
    mode,
    wpm: state.wpm,
    wordCount,
    meaningfulChunks: state.meaningfulChunks,
    focusAnchor: state.focusAnchor,
    focusAnchorPosition: state.focusAnchorPosition,
    focusAnchorFontSize: state.focusAnchorFontSize,
    focusAnchorColor: state.focusAnchorColor,
    focusAnchorBold: state.focusAnchorBold,
    fontFamily,
    fontSize,
    theme,
    bionic: state.bionic,
    bookPages: state.bookPages,
    illustrationMode: state.illustrationMode
  };

  const values = {
    '#mode-select': mode,
    '#fs-mode-select': mode,
    '#speed': state.wpm,
    '#fs-speed': state.wpm,
    '#word-count': wordCount,
    '#fs-word-count': wordCount,
    '#font-family': fontFamily,
    '#fs-font-family': fontFamily,
    '#font-size': fontSize,
    '#fs-font-size': fontSize,
    '#theme-select': theme,
    '#fs-theme-select': theme,
    '#illustration-mode': state.illustrationMode,
    '#fs-illustration-mode': state.illustrationMode,
    '#focus-anchor-font-size': state.focusAnchorFontSize,
    '#fs-focus-anchor-font-size': state.focusAnchorFontSize,
    '#focus-anchor-color': state.focusAnchorColor,
    '#fs-focus-anchor-color': state.focusAnchorColor
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = app.querySelector(selector);
    if (element && value !== undefined && value !== null) element.value = String(value);
  });

  const checks = {
    '#bionic-reading': state.bionic,
    '#fs-bionic-reading': state.bionic,
    '#meaningful-chunks': state.meaningfulChunks,
    '#fs-meaningful-chunks': state.meaningfulChunks,
    '#focus-anchor': state.focusAnchor,
    '#fs-focus-anchor': state.focusAnchor,
    '#focus-anchor-bold': state.focusAnchorBold,
    '#fs-focus-anchor-bold': state.focusAnchorBold,
    '#book-pages': state.bookPages,
    '#fs-book-pages': state.bookPages
  };
  Object.entries(checks).forEach(([selector, checked]) => {
    const element = app.querySelector(selector);
    if (element) element.checked = Boolean(checked);
  });

  const reader = app.querySelector('#reader');
  if (reader) {
    const fontFamilies = {
      system: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
      georgia: 'Georgia, "Times New Roman", serif',
      verdana: 'Verdana, Geneva, sans-serif',
      trebuchet: '"Trebuchet MS", Arial, sans-serif',
      monospace: 'Consolas, "Courier New", monospace',
      dyslexic: '"Arial", "Verdana", sans-serif'
    };
    reader.style.fontSize = `${fontSize}px`;
    reader.style.fontFamily = fontFamilies[fontFamily] || fontFamilies.system;
    reader.classList.toggle('dyslexia-friendly-font', fontFamily === 'dyslexic');
    reader.classList.toggle('light', theme === 'light');
  }

  // Set the position only after the new reader has been constructed, then
  // rebuild the active renderer using the restored settings.
  readerEngine.setPosition(savedIndex);
  state.index = savedIndex;
  prepareReaderView(mode, wordCount);
  updateModeControls(mode);
  refreshFocusAnchorStyle();
  updateFocusAnchorOverlay();

  // Book Pages needs a geometry pass after the DOM has its final font, width,
  // mode and page setting. Merely checking the checkbox is not sufficient.
  requestAnimationFrame(() => {
    if (state.bookPages) {
      scheduleBookPageReflow();
      requestAnimationFrame(() => {
        const activeReader = app.querySelector('#reader');
        if (activeReader) {
          ensureWordsRendered(activeReader, mode, wordCount, state.index + 100);
          const target =
            activeReader.querySelector(`.reader-word[data-index="${state.index}"]`) ||
            activeReader.querySelector(`.reader-group[data-start-index="${state.index}"]`);
          if (target) {
            const readerRect = activeReader.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const metrics = applyBookPageMetrics(activeReader);
            const absoluteLeft = targetRect.left - readerRect.left + activeReader.scrollLeft - metrics.paddingLeft;
            const pageIndex = Math.max(0, Math.floor(absoluteLeft / Math.max(1, metrics.pagePitch)));
            goToBookSpread(Math.floor(pageIndex / 2), { behavior: 'auto', ensureRendered: true });
          } else {
            updateBookPageStatus();
          }
        }
      });
    }
  });

  window.setTimeout(() => {
    const activeReader = app.querySelector('#reader');
    if (activeReader && !state.bookPages) {
      ensureWordsRendered(activeReader, mode, wordCount, state.index + 100);
      const target =
        activeReader.querySelector(`.reader-word[data-index="${state.index}"]`) ||
        activeReader.querySelector(`.reader-group[data-start-index="${state.index}"]`);
      target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    updateReaderStatus(`Resumed at word ${(state.index + 1).toLocaleString()}.`);
    if (resumePlayback && snapshot.wasRunning) startReader();
  }, 0);

  activeReaderSnapshot = {
    ...snapshot,
    index: state.index,
    wasRunning: Boolean(snapshot.wasRunning),
    controls: { ...(snapshot.controls || {}), ...(state.returnControls || {}) }
  };
  return true;
}

function renderCurrentReader() {
  if (!activeReaderSnapshot?.title || !activeReaderSnapshot?.currentText) {
    // No document has been explicitly opened in this app session. Do not read
    // IndexedDB here; that is what Home > Resume Last Reading is for.
    renderHome();
    return;
  }

  const snapshot = {
    ...activeReaderSnapshot,
    index: Math.max(0, Number(activeReaderSnapshot.index) || 0),
    controls: { ...(activeReaderSnapshot.controls || {}) }
  };
  applyReaderSessionSnapshot(snapshot);
}


function renderHome() {
  stopReader();

  let resumeMeta = null;
  try { resumeMeta = JSON.parse(localStorage.getItem(READER_SESSION_META_KEY) || 'null'); } catch {}
  const resumePercent = resumeMeta?.totalWords
    ? Math.min(100, Math.max(0, Math.round((Number(resumeMeta.index) || 0) / Number(resumeMeta.totalWords) * 100)))
    : null;

  app.innerHTML = `
    <section class="home-simple">
      <header class="home-simple-brand">
        <h1><span class="home-speed-mark" aria-hidden="true">≡</span>Mark, Set, Go!</h1>
        <p class="home-simple-tagline">Read Faster. Understand Deeper. Remember Longer. Apply Daily.</p>
        <p class="home-simple-subtitle">The all-in-one reading accelerator for lifelong learning and personal growth.</p>
      </header>

      <div class="home-reader-launch">
        <figure class="home-mark-card">
          <img
            class="home-reading-gif"
            src="/assets/home/mark-reading.gif"
            alt="Mark reading a book with animated eye movement."
          >
          <figcaption>
            <strong>Meet Mark.</strong>
            <span>Practice smoother eye movement, stronger focus, faster reading, and better comprehension.</span>
          </figcaption>
        </figure>

        <section class="home-launch-panel" aria-label="Reading actions">
          <div class="home-launch-copy">
            <span class="source-category">Ready to read?</span>
            <h2>Start reading or continue where you left off.</h2>
            <p>Open the reader, measure your natural reading speed, or return to your saved book without loading anything automatically.</p>
          </div>

          <div class="home-launch-actions">
            <button class="primary home-large-action" data-action="reader" type="button">
              <span aria-hidden="true">📖</span>
              <span><strong>Open Reader</strong><small>Start or return to the active reader</small></span>
            </button>

            <button class="secondary home-large-action" data-start-home type="button">
              <span aria-hidden="true">⏱</span>
              <span><strong>WPM Test</strong><small>Measure your natural reading speed</small></span>
            </button>

            <button class="secondary home-large-action" id="resume-last-reading" type="button">
              <span aria-hidden="true">↩</span>
              <span><strong>Resume Last Reading</strong><small>${resumeMeta?.title ? escapeHtml(resumeMeta.title) : 'No saved reading yet'}</small></span>
            </button>
          </div>

          ${resumeMeta?.title ? `<article class="resume-reading-card home-simple-resume">
            <div>
              <span class="resume-reading-kicker">Last reading</span>
              <strong>${escapeHtml(resumeMeta.title)}</strong>
              <small>${resumePercent === null ? 'Saved reading position' : `${resumePercent}% complete`} · opens only when you choose Resume</small>
            </div>
            ${resumePercent === null ? '' : `<div class="progress-meter"><span style="width:${resumePercent}%"></span></div>`}
          </article>
          <button class="secondary subtle home-forget-reading" id="forget-last-reading" type="button">Forget Saved Reading</button>` : ''}
        </section>
      </div>
    </section>`;

  app.querySelector('[data-start-home]')?.addEventListener('click', () => renderWpmTest('gatsby'));
  app.querySelector('#resume-last-reading')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Loading saved reading…';
    try {
      const saved = await readReaderSession();
      if (!applyReaderSessionSnapshot(saved, { resumePlayback: false })) {
        window.alert('No resumable reading session was found. Open a book from Library or Reading Progress first.');
        button.disabled = false;
        button.textContent = original;
      }
    } catch (error) {
      console.error('Resume reading failed:', error);
      window.alert('The saved reading session could not be opened. You can still reopen the book from Library or Reading Progress.');
      button.disabled = false;
      button.textContent = original;
    }
  });
  app.querySelector('#forget-last-reading')?.addEventListener('click', async () => {
    await clearReaderSession();
    activeReaderSnapshot = null;
    renderHome();
  });

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
const COMPREHENSION_RESULTS_KEY = 'markSetGoComprehensionV1';
const COMPREHENSION_POSITION_KEY = 'markSetGoComprehensionPositionV1';


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
  const comprehensionResults = getComprehensionResults();
  const recentComprehension = comprehensionResults.slice(0, 8);
  const averageComprehension = comprehensionResults.length
    ? Math.round(comprehensionResults.reduce((sum, item) => sum + (Number(item.scorePercent) || 0), 0) / comprehensionResults.length)
    : 0;

  app.innerHTML = `<section class="panel progress-dashboard">
    <div class="library-heading"><div><h1>Reading Progress</h1><p>Your reading activity is stored privately in this browser.</p></div><button id="clear-reading-progress" class="secondary" type="button">Clear history</button></div>
    <div class="dashboard-stats">
      <article><span>Today</span><strong>${totalWords.toLocaleString()}</strong><small>words</small></article>
      <article><span>Reading time</span><strong>${formatDuration(totalSeconds)}</strong><small>today</small></article>
      <article><span>Average pace</span><strong>${averageWpm || '—'}</strong><small>WPM today</small></article>
      <article><span>Current streak</span><strong>${streak}</strong><small>${streak === 1 ? 'day' : 'days'}</small></article>
      <article><span>Comprehension</span><strong>${averageComprehension || '—'}</strong><small>${averageComprehension ? '% average' : 'no checks yet'}</small></article>
    </div>
    <section class="dashboard-section"><h2>Books and documents</h2>
      <div class="progress-book-list">${recentBooks.length ? recentBooks.map((item) => {
        const percent = item.totalWords ? Math.min(100, Math.round((Number(item.furthestWord)||0) / item.totalWords * 100)) : 0;
        const wpm = item.totalSeconds ? Math.round((Number(item.totalWordsRead)||0) / (item.totalSeconds / 60)) : 0;
        return `<article class="progress-book-card"><div><h3>${escapeHtml(item.title || 'Untitled')}</h3><p>${percent}% complete · ${formatDuration(item.totalSeconds)} · ${Number(item.sessions)||0} sessions${wpm ? ` · ${wpm} WPM` : ''}</p></div><div class="progress-meter"><span style="width:${percent}%"></span></div><button class="secondary" type="button" data-progress-open="${escapeHtml(item.documentId)}">Open saved text</button></article>`;
      }).join('') : '<p class="navigation-empty">Complete a reading session to begin tracking progress.</p>'}</div>
    </section>
    <section class="dashboard-section"><h2>Comprehension checks</h2>
      <div class="activity-list">${recentComprehension.map((item) => `<article><div><strong>${escapeHtml(item.title || 'Untitled')}</strong><span>${new Date(item.createdAt).toLocaleString()}</span></div><p>${Number(item.scorePercent)}% comprehension${item.wpm ? ` · ${Number(item.wpm)} WPM · ${Number(item.effectiveWpm)} effective WPM` : ''} · ${Number(item.wordsTested).toLocaleString()} words tested</p></article>`).join('') || '<p class="navigation-empty">No comprehension checks yet. Use Check Comprehension while reading.</p>'}</div>
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


function getComprehensionResults() {
  return readStoredArray(COMPREHENSION_RESULTS_KEY);
}

function getComprehensionPositions() {
  return readStoredObject(COMPREHENSION_POSITION_KEY);
}

function setLastComprehensionPosition(documentId, index) {
  const positions = getComprehensionPositions();
  positions[documentId] = Math.max(0, Number(index) || 0);
  localStorage.setItem(COMPREHENSION_POSITION_KEY, JSON.stringify(positions));
}

function comprehensionPassage() {
  const endIndex = Math.max(0, Math.min(state.words.length, Number(state.index) || 0));
  const positions = getComprehensionPositions();
  const previous = Math.max(0, Math.min(endIndex, Number(positions[state.documentId]) || 0));
  let startIndex = previous;

  // Avoid huge requests when a reader has gone a long time between checks.
  if (endIndex - startIndex > 900) startIndex = Math.max(0, endIndex - 900);

  // On the first check, use up to the last 750 words.
  if (!previous) startIndex = Math.max(0, endIndex - 750);

  return {
    startIndex,
    endIndex,
    words: Math.max(0, endIndex - startIndex),
    passage: state.words.slice(startIndex, endIndex).join(' ')
  };
}

function closeComprehensionDialog() {
  app.querySelector('#comprehension-dialog')?.close();
}

function renderComprehensionQuiz(quiz, context) {
  const dialog = app.querySelector('#comprehension-dialog');
  if (!dialog) return;
  const typeNames = {
    recall: 'Recall',
    main_idea: 'Main idea',
    inference: 'Inference',
    deeper_understanding: 'Deeper understanding'
  };

  dialog.innerHTML = `<form method="dialog" class="comprehension-card" id="comprehension-form">
    <div class="comprehension-heading">
      <div><span class="comprehension-kicker">Learning check</span><h2>Comprehension Check</h2><p>${context.words.toLocaleString()} words · ${escapeHtml(state.title)}</p></div>
      <button class="comprehension-close" value="cancel" type="submit" aria-label="Close">×</button>
    </div>
    <div class="comprehension-questions">
      ${quiz.questions.map((item, qIndex) => `<fieldset class="comprehension-question">
        <legend><span>${qIndex + 1}</span><div><small>${escapeHtml(typeNames[item.type] || item.type)}</small>${escapeHtml(item.question)}</div></legend>
        <div class="comprehension-choices">${item.choices.map((choice, cIndex) =>
          `<label><input type="radio" name="question-${qIndex}" value="${cIndex}"><span>${escapeHtml(choice)}</span></label>`
        ).join('')}</div>
        <div class="comprehension-explanation" id="explanation-${qIndex}" hidden></div>
      </fieldset>`).join('')}
    </div>
    <div class="comprehension-actions">
      <span id="comprehension-status" class="status"></span>
      <button id="score-comprehension" class="primary" type="button">Score Check</button>
      <button class="secondary" value="cancel" type="submit">Close</button>
    </div>
  </form>`;
  dialog.showModal();

  dialog.querySelector('#score-comprehension')?.addEventListener('click', () => {
    const unanswered = quiz.questions.some((_, index) => !dialog.querySelector(`input[name="question-${index}"]:checked`));
    if (unanswered) {
      dialog.querySelector('#comprehension-status').textContent = 'Answer all four questions first.';
      return;
    }

    let correct = 0;
    quiz.questions.forEach((item, index) => {
      const chosen = Number(dialog.querySelector(`input[name="question-${index}"]:checked`)?.value);
      const isCorrect = chosen === Number(item.correctIndex);
      if (isCorrect) correct += 1;
      dialog.querySelectorAll(`input[name="question-${index}"]`).forEach((input) => {
        input.disabled = true;
        const label = input.closest('label');
        label?.classList.toggle('answer-correct', Number(input.value) === Number(item.correctIndex));
        label?.classList.toggle('answer-wrong', input.checked && !isCorrect);
      });
      const explanation = dialog.querySelector(`#explanation-${index}`);
      explanation.hidden = false;
      explanation.innerHTML = `<strong>${isCorrect ? 'Correct.' : 'Not quite.'}</strong> ${escapeHtml(item.explanation)}`;
    });

    const percent = Math.round((correct / quiz.questions.length) * 100);
    const currentWpm = Math.max(0, Number(app.querySelector('#speed')?.value) || Number(state.wpm) || 0);
    const effectiveWpm = Math.round(currentWpm * (percent / 100));
    const result = {
      id: `comprehension-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      documentId: state.documentId,
      title: state.title,
      startIndex: context.startIndex,
      endIndex: context.endIndex,
      wordsTested: context.words,
      correct,
      total: quiz.questions.length,
      scorePercent: percent,
      wpm: currentWpm,
      effectiveWpm,
      createdAt: new Date().toISOString()
    };
    const results = getComprehensionResults();
    results.unshift(result);
    localStorage.setItem(COMPREHENSION_RESULTS_KEY, JSON.stringify(results.slice(0, 500)));
    setLastComprehensionPosition(state.documentId, context.endIndex);

    const status = dialog.querySelector('#comprehension-status');
    status.innerHTML = `<strong>${percent}% comprehension</strong>${currentWpm ? ` · ${effectiveWpm} effective WPM` : ''}`;
    const scoreButton = dialog.querySelector('#score-comprehension');
    scoreButton.disabled = true;
    scoreButton.textContent = `${correct} of ${quiz.questions.length} correct`;
  });
}

async function startComprehensionCheck() {
  if (!state.documentId || !state.words.length) return;
  const context = comprehensionPassage();
  if (context.words < 120) {
    window.alert(`Read a little farther first. You currently have ${context.words} new words available; a comprehension check needs at least 120.`);
    return;
  }

  const button = app.querySelector('#check-comprehension');
  const fsButton = app.querySelector('#fs-check-comprehension');
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Generating…'; }
  if (fsButton) { fsButton.disabled = true; fsButton.textContent = 'Generating…'; }

  const wasRunning = isReaderRunning();
  if (wasRunning) pauseReader();

  try {
    const response = await fetch('/api/comprehension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: state.title,
        passage: context.passage
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);
    if (!Array.isArray(payload.questions) || payload.questions.length !== 4) throw new Error('The quiz response was incomplete.');
    renderComprehensionQuiz(payload, context);
  } catch (error) {
    window.alert(`Comprehension check unavailable: ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = original || '🧠 Comprehension'; }
    if (fsButton) { fsButton.disabled = false; fsButton.textContent = 'Check comprehension'; }
  }
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
    <div class="reader-library-header">
      <div><span>Reading tools</span><strong>Marks &amp; Contents</strong></div>
      <button id="close-navigation-pane" class="reader-panel-close" type="button" aria-label="Close marks and contents">×</button>
    </div>
    <div class="reader-library-tabs" role="tablist" aria-label="Reading tools">
      <button class="reader-library-tab active" type="button" role="tab" data-reader-tab="contents" aria-selected="true">Contents</button>
      <button class="reader-library-tab" type="button" role="tab" data-reader-tab="bookmarks" aria-selected="false">Bookmarks <span>${bookmarks.length}</span></button>
      <button class="reader-library-tab" type="button" role="tab" data-reader-tab="definitions" aria-selected="false">Definitions <span>${definitions.length}</span></button>
      <button class="reader-library-tab" type="button" role="tab" data-reader-tab="notes" aria-selected="false">Notes <span>${notes.length}</span></button>
    </div>
    <section class="navigation-section reader-library-view active" data-reader-view="contents">
      <div class="navigation-heading"><h2>Contents</h2><button id="add-bookmark" class="bookmark-add" type="button">＋ Bookmark</button></div>
      <div class="toc-list">${tocMarkup}</div>
    </section>
    <section class="navigation-section reader-library-view" data-reader-view="bookmarks">
      <div class="bookmark-list">${bookmarkMarkup}</div>
    </section>
    <section class="navigation-section reader-library-view" data-reader-view="definitions">
      <div class="definition-list">${definitionMarkup}</div>
    </section>
    <section class="navigation-section reader-library-view" data-reader-view="notes">
      <div class="note-list">${noteMarkup}</div>
    </section>`;

  pane.querySelectorAll('[data-reader-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.readerTab;
      pane.querySelectorAll('[data-reader-tab]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-selected', String(selected));
      });
      pane.querySelectorAll('[data-reader-view]').forEach((view) => {
        view.classList.toggle('active', view.dataset.readerView === tab);
      });
    });
  });
  pane.querySelector('#close-navigation-pane')?.addEventListener('click', () => {
    app.querySelector('#toggle-navigation-pane')?.click();
  });

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
  if (kind === 'syntopicon') return renderSyntopicon();
  if (kind === 'bible') return renderBibleStudy();
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
            <div class="control"><label for="focus-anchor-color">Anchor color</label><select id="focus-anchor-color">
              <option value="#20a866" selected>Green</option><option value="#2f7de1">Blue</option><option value="#d28a00">Amber</option><option value="#d94b4b">Red</option><option value="#8a63d2">Purple</option>
            </select></div>
            <label class="compact-toggle"><input id="focus-anchor-bold" type="checkbox"><span>Bold anchor letter</span></label>
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
        <div class="reader-pane-buttons">
          <button id="toggle-navigation-pane" class="secondary pane-toggle reader-side-toggle" type="button" aria-pressed="false" aria-controls="navigation-pane"><span aria-hidden="true">☰</span> Marks &amp; Contents</button>
          <button id="toggle-word-panel" class="secondary pane-toggle reader-side-toggle" type="button" aria-pressed="false" aria-controls="word-panel"><span aria-hidden="true">⚙</span> Reader Controls</button>
        </div>
        <button id="toggle-reader-fullscreen" class="viewer-fullscreen-button" type="button" aria-label="Enter text viewer fullscreen" title="Full screen text viewer">
          <span class="fullscreen-icon" aria-hidden="true">⛶</span>
          <span class="fullscreen-label">Full screen</span>
        </button>
      </div>
      <div class="reader-layout" id="reader-layout">
        <aside id="navigation-pane" class="navigation-pane" aria-label="Contents and bookmarks"></aside>
        <div id="left-pane-splitter" class="pane-splitter" role="separator" aria-orientation="vertical" aria-label="Resize contents pane" tabindex="0"></div>
        <div class="reader-center-column">
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
                  <button id="fs-check-comprehension" class="secondary" type="button">Check comprehension</button>
                </div>
              </details>

              <details class="fullscreen-option-group" open>
                <summary>Focus</summary>
                <div class="fullscreen-options-grid">
                  <label class="fullscreen-checkbox"><input id="fs-focus-anchor" type="checkbox"> Focus anchor</label>
                  <label>Anchor size<select id="fs-focus-anchor-font-size">${fontOptions(24)}</select></label>
                  <label>Anchor color<select id="fs-focus-anchor-color"><option value="#20a866">Green</option><option value="#2f7de1">Blue</option><option value="#d28a00">Amber</option><option value="#d94b4b">Red</option><option value="#8a63d2">Purple</option></select></label>
                  <label class="fullscreen-checkbox"><input id="fs-focus-anchor-bold" type="checkbox"> Bold anchor letter</label>
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
            <label class="book-page-jump" for="book-page-input">
              <span>Page</span>
              <input id="book-page-input" type="number" min="1" step="1" inputmode="numeric" value="1" aria-label="Go to page number">
              <span id="book-page-total">of 1</span>
            </label>
            <span id="book-page-status" class="book-page-spread-label">Pages 1–2</span>
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
      <dialog id="comprehension-dialog" class="comprehension-dialog" aria-label="Comprehension check"></dialog>

      <div class="controls playback-controls">
        <button id="start-reader" class="primary">Start</button>
        <button id="pause-reader" class="secondary" disabled>Pause</button>
        <button id="reset-reader" class="secondary">Reset</button>
        <button id="check-comprehension" class="secondary comprehension-trigger" type="button">🧠 Comprehension</button>
        <span id="reader-status" class="status">${state.words.length.toLocaleString()} words loaded. Click a word to continue from there; click empty space or press Space to pause or resume.</span>
      </div>
    </section>`;

  const reader = app.querySelector('#reader');
  const readerFrame = app.querySelector('#reader-frame');
  const fullscreenButton = app.querySelector('#toggle-reader-fullscreen');
  arrangeReaderSidePanels();
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

  const jumpToTypedBookPage = () => {
    const input = app.querySelector('#book-page-input');
    const reader = app.querySelector('#reader');
    if (!input || !reader || !state.bookPages) return;

    const totalPages = Math.max(1, getEstimatedBookPageCount(reader));
    const requestedPage = Math.max(1, Math.min(totalPages, Math.trunc(Number(input.value) || 1)));
    input.value = String(requestedPage);

    // Facing-page layout: pages 1–2 are spread 0, 3–4 spread 1, etc.
    const targetSpread = Math.floor((requestedPage - 1) / 2);
    goToBookSpread(targetSpread, {
      behavior: 'auto',
      ensureRendered: true,
      syncReaderPosition: false
    });

    // Once the new spread is physically in place, move the logical reading
    // position to the first readable word on that spread so playback, resume,
    // TOC changes, and subsequent reflow all remain synchronized.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        state.bookSpreadIndex = targetSpread;
        reader.scrollLeft = targetSpread * getBookSpreadWidth(reader);
        syncReaderToVisibleBookSpread(reader);
        updateBookPageStatus(targetSpread);
        persistReaderSession();
      });
    });
  };

  app.querySelector('#book-page-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToTypedBookPage();
      event.currentTarget.blur();
    }
  });
  app.querySelector('#book-page-input')?.addEventListener('change', jumpToTypedBookPage);
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
  app.querySelector('#check-comprehension')?.addEventListener('click', startComprehensionCheck);
  app.querySelector('#fs-check-comprehension')?.addEventListener('click', startComprehensionCheck);
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

  app.querySelector('#focus-anchor-color')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.focusAnchorColor = event.target.value || '#20a866';
    refreshFocusAnchorStyle();
    restoreCapturedReaderLocation(snapshot, { rerendered: false });
    persistReaderSession({ immediate: true });
  });
  app.querySelector('#focus-anchor-bold')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.focusAnchorBold = Boolean(event.target.checked);
    refreshFocusAnchorStyle();
    restoreCapturedReaderLocation(snapshot, { rerendered: false });
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
  app.querySelectorAll('#mode-select, #speed, #word-count, #meaningful-chunks, #focus-anchor, #focus-anchor-font-size, #focus-anchor-color, #focus-anchor-bold, #font-family, #font-size, #theme-select, #bionic-reading, #book-pages, #illustration-mode').forEach((control) => {
    control.addEventListener('change', () => persistReaderSession());
    control.addEventListener('input', () => persistReaderSession());
  });
  // Bible chapters/books are typically small enough to save immediately, and
  // doing so guarantees Resume Last Reading points at the passage just opened.
  // This document is now the explicit current reader for the top Reader button.
  activeReaderSnapshot = buildReaderSessionSnapshot() || {
    title: state.title,
    currentText: state.currentText,
    originalText: state.originalText,
    source: state.source,
    language: state.language,
    index: state.index,
    wasRunning: false,
    controls: captureReaderControls()
  };

  if (source?.type === 'bible' || source?.type === 'bible-book') {
    persistReaderSession({ immediate: true });
  } else {
    persistReaderSession();
  }
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
    ['#fs-focus-anchor-color', '#focus-anchor-color'],
    ['#fs-focus-anchor-bold', '#focus-anchor-bold'],
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
      requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
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
      requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
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




function arrangeReaderSidePanels() {
  const wordPanel = app.querySelector('#word-panel');
  const toolbar = app.querySelector('.reader-toolbar');
  const media = app.querySelector('.reader-music-actions');
  const comprehension = app.querySelector('#check-comprehension');
  const translation = app.querySelector('.translation-tools');
  const wordResult = app.querySelector('#word-result');
  if (!wordPanel || !toolbar) return;

  wordPanel.classList.add('reader-control-panel');
  wordPanel.setAttribute('aria-label', 'Reader controls');

  const shell = document.createElement('div');
  shell.className = 'reader-control-shell';
  shell.innerHTML = `
    <div class="reader-control-header">
      <div><span>Reader</span><strong>Controls</strong></div>
      <button id="close-reader-controls" class="reader-panel-close" type="button" aria-label="Close reader controls">×</button>
    </div>
    <div id="reader-control-core" class="reader-control-section"></div>
    <details class="reader-control-group" open>
      <summary>Learn</summary>
      <div id="reader-control-learn" class="reader-control-group-body">
        <p class="reader-control-help">Check how well you understood the passage you just read.</p>
      </div>
    </details>
    <details class="reader-control-group">
      <summary>Media</summary>
      <div id="reader-control-media" class="reader-control-group-body"></div>
    </details>
    <details class="reader-control-group">
      <summary>Language &amp; Words</summary>
      <div id="reader-control-language" class="reader-control-group-body"></div>
    </details>`;

  wordPanel.replaceChildren(shell);
  shell.querySelector('#reader-control-core')?.appendChild(toolbar);
  if (comprehension) shell.querySelector('#reader-control-learn')?.appendChild(comprehension);
  if (media) shell.querySelector('#reader-control-media')?.appendChild(media);
  if (translation) shell.querySelector('#reader-control-language')?.appendChild(translation);
  if (wordResult) shell.querySelector('#reader-control-language')?.appendChild(wordResult);

  shell.querySelector('#close-reader-controls')?.addEventListener('click', () => {
    app.querySelector('#toggle-word-panel')?.click();
  });
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
    const label = pane === 'navigation' ? 'marks and contents' : 'reader controls';
    button.title = `${visible ? 'Close' : 'Open'} ${label}`;
  };

  // Keep the reading canvas clean. The labeled side-panel buttons remain visible
  // so readers can discover Contents/Bookmarks and Reader Controls when needed.
  setPane('navigation', false);
  setPane('word', false);
  navigationButton.addEventListener('click', () => {
    const anchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
    setPane('navigation', layout.classList.contains('navigation-hidden'));
    if (state.bookPages) scheduleBookPageReflow({ delay: 40, anchorIndex });
  });
  wordButton.addEventListener('click', () => {
    const anchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
    setPane('word', layout.classList.contains('word-panel-hidden'));
    if (state.bookPages) scheduleBookPageReflow({ delay: 40, anchorIndex });
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
    let resizeAnchorIndex = null;
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
      if (state.bookPages && Number.isFinite(Number(resizeAnchorIndex))) {
        scheduleBookPageReflow({ delay: 30, anchorIndex: resizeAnchorIndex });
      }
      resizeAnchorIndex = null;
    };
    splitter.addEventListener('pointerdown', (event) => {
      if (!pane || layout.classList.contains(side === 'left' ? 'navigation-hidden' : 'word-panel-hidden')) return;
      startX = event.clientX;
      startWidth = pane.getBoundingClientRect().width;
      resizeAnchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
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
let pendingBookPageAnchorIndex = null;
let bookPageReflowTimer = null;

function restoreBookPageWordAnchor(anchorIndex) {
  const reader = app.querySelector('#reader');
  if (!reader || !state.bookPages || !state.words.length) return;

  const safeIndex = Math.max(0, Math.min(state.words.length - 1, Number(anchorIndex) || 0));
  const mode = state.renderedMode || getSelectedMode();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;

  // The word index is canonical. Page/spread numbers are only a consequence of
  // the current viewport dimensions and must be recalculated after every reflow.
  state.index = safeIndex;
  ensureWordsRendered(reader, mode, groupSize, Math.min(state.words.length, safeIndex + 250));
  applyBookPageMetrics(reader);

  const spread = bookSpreadForWordIndex(reader, safeIndex);
  if (spread != null) {
    goToBookSpread(spread, {
      behavior: 'auto',
      ensureRendered: true,
      syncReaderPosition: false
    });
    // Do not let page navigation rewrite the preserved logical position.
    state.index = safeIndex;
    state.bookSpreadIndex = spread;
    updateBookPageStatus(spread);
  } else {
    updateBookPageStatus();
  }
}

function scheduleBookPageReflow({ delay = 0, anchorIndex = null } = {}) {
  if (!state.bookPages) return;

  // Capture once before a layout mutation when possible. ResizeObserver may fire
  // multiple times while panes animate/change width, so retain the same anchor
  // until the final geometry has settled.
  const requestedAnchor = Number(anchorIndex);
  if (Number.isFinite(requestedAnchor)) {
    pendingBookPageAnchorIndex = requestedAnchor;
  } else if (!Number.isFinite(Number(pendingBookPageAnchorIndex))) {
    pendingBookPageAnchorIndex = Math.max(0, Number(state.index) || 0);
  }

  window.clearTimeout(bookPageReflowTimer);
  bookPageReflowTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!state.bookPages) {
          pendingBookPageAnchorIndex = null;
          return;
        }
        const preservedWord = Math.max(
          0,
          Number.isFinite(Number(pendingBookPageAnchorIndex))
            ? Number(pendingBookPageAnchorIndex)
            : Number(state.index) || 0
        );
        restoreBookPageWordAnchor(preservedWord);
        pendingBookPageAnchorIndex = null;
        persistReaderSession();
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
    requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement === readerFrame && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    readerFrame.classList.remove('fullscreen-fallback');
    document.body.classList.remove('viewer-fullscreen-open');
    updateButton();
    requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
  };

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const anchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
    if (isViewerFullscreen()) await exitFullscreen();
    else await enterFullscreen();
    if (state.bookPages) scheduleBookPageReflow({ delay: 80, anchorIndex });
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== readerFrame) {
      readerFrame.classList.remove('fullscreen-fallback');
      document.body.classList.remove('viewer-fullscreen-open');
    }
    updateButton();
    scheduleBookPageReflow({ delay: 60, anchorIndex: pendingBookPageAnchorIndex ?? state.index });
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
    ? `Page ${firstPage}`
    : `Pages ${firstPage}–${lastPage}`;

  const pageInput = app.querySelector('#book-page-input');
  const pageTotal = app.querySelector('#book-page-total');
  if (pageInput) {
    pageInput.max = String(totalPages);
    if (document.activeElement !== pageInput) pageInput.value = String(firstPage);
  }
  if (pageTotal) pageTotal.textContent = `of ${totalPages}`;

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

function normalizeLibraryMatchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(the|a|an|volume|vol|book|works|complete|selected|selections)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreGreatBookCandidate(item, candidate) {
  const wantedTitle = normalizeLibraryMatchText(item.title);
  const wantedAuthor = normalizeLibraryMatchText(item.author);
  const candidateTitle = normalizeLibraryMatchText(candidate.title);
  const candidateAuthor = normalizeLibraryMatchText(candidate.author);
  if (!candidateTitle) return -1000;

  let score = 0;
  if (candidateTitle === wantedTitle) score += 100;
  else {
    const wantedWords = new Set(wantedTitle.split(' ').filter(Boolean));
    const candidateWords = new Set(candidateTitle.split(' ').filter(Boolean));
    const overlap = [...wantedWords].filter((word) => candidateWords.has(word)).length;
    const denominator = Math.max(1, Math.min(wantedWords.size, candidateWords.size));
    score += (overlap / denominator) * 65;
    if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) score += 20;
  }

  if (wantedAuthor && candidateAuthor) {
    const authorWords = wantedAuthor.split(' ').filter((word) => word.length > 2);
    const authorHits = authorWords.filter((word) => candidateAuthor.includes(word)).length;
    score += Math.min(25, authorHits * 8);
  }

  // Prefer sources that are directly readable. Within readable sources,
  // favor curated/proofread editions before OCR when relevance is comparable.
  const providerBonus = {
    standardebooks: 14,
    wikisource: 11,
    gutenberg: 9,
    internetarchive: 6,
    openlibrary: 0
  };
  score += providerBonus[candidate.provider] || 0;
  if (!candidate.readable) score -= 200;
  return score;
}


function validateGreatBookPrimaryText(item, candidate, loaded) {
  const text = String(loaded?.text || '').trim();
  const words = splitWords(text);
  const loadedTitle = loaded?.title || candidate?.title || '';
  const loadedAuthor = loaded?.author || candidate?.author || '';

  if (!text || words.length < 1500) {
    return { ok:false, reason:`Only ${words.length.toLocaleString()} readable words were returned; this looks like an excerpt or summary rather than the complete work.` };
  }

  const matchScore = scoreGreatBookCandidate(item, {
    ...candidate,
    title: loadedTitle || candidate?.title,
    author: loadedAuthor || candidate?.author,
    readable: true
  });

  if (matchScore < 45) {
    return { ok:false, reason:'The returned text does not match the requested title/author closely enough.' };
  }

  const opening = text.slice(0, 9000).toLowerCase();
  const summarySignals = [
    /\bplot summary\b/,
    /\bchapter summary\b/,
    /\bbook summary\b/,
    /\bsummary and analysis\b/,
    /\bstudy guide\b/,
    /\bcliffsnotes\b/,
    /\bsparknotes\b/,
    /\bshmoop\b/,
    /\bsynopsis\b/,
    /\babout the book\b/,
    /\bthis article is about\b/,
    /\boverview of\b/
  ];
  const signal = summarySignals.find((pattern) => pattern.test(opening));
  if (signal) {
    return { ok:false, reason:'The returned page appears to be summary/commentary material rather than the primary text.' };
  }

  // A true full-text edition normally has considerably more text than a catalog
  // extract. Keep the threshold lower for known short Great Books selections.
  const shortWorkPattern = /waste land|rose for emily|prussian officer|beast in the jungle|metamorphosis|saint joan|waiting for godot|fear and trembling|what is metaphysics/i;
  const minimumWords = shortWorkPattern.test(item.title) ? 1200 : 3000;
  if (words.length < minimumWords) {
    return { ok:false, reason:`The returned text is only ${words.length.toLocaleString()} words, which is too short to trust as the complete requested work.` };
  }

  return { ok:true, words:words.length, matchScore };
}

async function loadGreatBookEdition(item, status, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Searching libraries…';
  status.className = 'status book-load-status';
  status.textContent = 'Searching Standard Ebooks, Internet Archive, Open Library, Wikisource, and Project Gutenberg…';

  try {
    // Search the unified catalog, using title + author for better precision.
    const searchTerms = [
      `${item.title} ${item.author}`.trim(),
      item.query || item.title,
      item.title
    ].filter((value, index, all) => value && all.indexOf(value) === index);

    const candidatesByKey = new Map();
    const searchErrors = [];

    for (const query of searchTerms) {
      try {
        const payload = await loadApiPayload(`/api/library/search?q=${encodeURIComponent(query)}&provider=all`);
        (payload.books || []).forEach((book) => {
          const key = `${book.provider}:${book.id}`;
          if (!candidatesByKey.has(key)) candidatesByKey.set(key, book);
        });
        if ([...candidatesByKey.values()].some((book) => book.readable && scoreGreatBookCandidate(item, book) >= 70)) break;
      } catch (error) {
        searchErrors.push(error.message);
      }
    }

    const candidates = [...candidatesByKey.values()]
      .filter((book) => book.readable)
      .map((book) => ({ ...book, matchScore: scoreGreatBookCandidate(item, book) }))
      .filter((book) => book.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore);

    if (!candidates.length) {
      const discovery = [...candidatesByKey.values()]
        .filter((book) => !book.readable)
        .sort((a,b) => scoreGreatBookCandidate(item,b) - scoreGreatBookCandidate(item,a))[0];
      if (discovery?.externalUrl) {
        status.innerHTML = `No directly readable edition was found. <a href="${escapeHtml(discovery.externalUrl)}" target="_blank" rel="noopener noreferrer">Open the closest catalog result</a>.`;
      } else {
        throw new Error(searchErrors[0] || 'No readable edition was found in the connected public book libraries.');
      }
      button.disabled = false;
      button.textContent = original;
      return;
    }

    const failed = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const provider = LIBRARY_PROVIDERS[candidate.provider]?.label || candidate.provider;
      button.textContent = `Trying ${provider}…`;
      status.textContent = `Found ${candidates.length} possible full-text edition${candidates.length === 1 ? '' : 's'}. Verifying ${provider}: ${candidate.title}…`;

      try {
        const loaded = await loadApiPayload(`/api/library/read?provider=${encodeURIComponent(candidate.provider)}&id=${encodeURIComponent(candidate.id)}`);
        const text = String(loaded.text || '').trim();
        const validation = validateGreatBookPrimaryText(item, candidate, loaded);
        if (!validation.ok) throw new Error(validation.reason);

        const title = loaded.title || candidate.title || item.title;
        const author = loaded.author || candidate.author || item.author || '';
        renderReaderWithText(`${title}${author ? ` — ${author}` : ''}`, text, {
          type: candidate.provider,
          id: candidate.id,
          sourceUrl: loaded.sourceUrl || candidate.externalUrl || '',
          collection: 'great-books',
          greatBooksTitle: item.title,
          greatBooksAuthor: item.author,
          verifiedPrimaryText: true
        });
        return;
      } catch (error) {
        failed.push(`${provider}: ${error.message}`);
      }
    }

    throw new Error(`Matching editions were found, but none could be opened. ${failed.slice(0,3).join(' · ')}`);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    status.className = 'status error book-load-status';
    status.textContent = error.message;
  }
}


const STUDY_LANGUAGE_KEY = 'markSetGoStudyLanguageV1';
const LAST_BIBLE_PASSAGE_KEY = 'markSetGoLastBiblePassageV1';
const SYNTOPICON_SAVED_KEY = 'markSetGoSyntopiconSavedV1';

const studyLanguages = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  uk: 'Ukrainian',
  el: 'Greek',
  he: 'Hebrew',
  la: 'Latin',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean'
};

const greatIdeasCatalog = [
  'Angel', 'Animal', 'Aristocracy', 'Art', 'Astronomy', 'Beauty', 'Being', 'Cause',
  'Chance', 'Change', 'Citizen', 'Constitution', 'Courage', 'Custom and Convention',
  'Definition', 'Democracy', 'Desire', 'Dialectic', 'Duty', 'Education', 'Emotion',
  'Equality', 'Eternity', 'Evolution', 'Experience', 'Family', 'Fate', 'Form',
  'Freedom', 'Friendship', 'God', 'Good and Evil', 'Government', 'Habit',
  'Happiness', 'History', 'Honor', 'Hypothesis', 'Idea', 'Immortality', 'Induction',
  'Infinity', 'Judgment', 'Justice', 'Knowledge', 'Labor', 'Language', 'Law',
  'Liberty', 'Life and Death', 'Logic', 'Love', 'Man', 'Mathematics', 'Matter',
  'Mechanics', 'Medicine', 'Memory and Imagination', 'Metaphysics', 'Mind',
  'Monarchy', 'Nature', 'Necessity and Contingency', 'Oligarchy', 'One and Many',
  'Opinion', 'Opposition', 'Philosophy', 'Physics', 'Pleasure and Pain', 'Poetry',
  'Principle', 'Progress', 'Prophecy', 'Prudence', 'Punishment', 'Quality',
  'Quantity', 'Reasoning', 'Relation', 'Religion', 'Revolution', 'Rhetoric',
  'Same and Other', 'Science', 'Sense', 'Sign and Symbol', 'Sin', 'Slavery',
  'Soul', 'Space', 'State', 'Temperance', 'Theology', 'Time', 'Truth',
  'Tyranny', 'Universal and Particular', 'Virtue and Vice', 'War and Peace',
  'Wealth', 'Will', 'Wisdom', 'World'
];

function studyLanguageOptions(selected = 'en') {
  return Object.entries(studyLanguages).map(([code,name]) =>
    `<option value="${code}" ${code === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`
  ).join('');
}

function getStudyLanguage() {
  return localStorage.getItem(STUDY_LANGUAGE_KEY) || 'en';
}

function setStudyLanguage(code) {
  localStorage.setItem(STUDY_LANGUAGE_KEY, code || 'en');
}

function getLastBiblePassage() {
  try { return JSON.parse(localStorage.getItem(LAST_BIBLE_PASSAGE_KEY) || 'null'); } catch { return null; }
}

function saveLastBiblePassage(value) {
  try { localStorage.setItem(LAST_BIBLE_PASSAGE_KEY, JSON.stringify(value)); } catch {}
}

function savedSyntopiconAnalyses() {
  try {
    const value = JSON.parse(localStorage.getItem(SYNTOPICON_SAVED_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveSyntopiconAnalysis(value) {
  const saved = savedSyntopiconAnalyses();
  saved.unshift(value);
  localStorage.setItem(SYNTOPICON_SAVED_KEY, JSON.stringify(saved.slice(0, 50)));
}

async function translateStudyBlock(text, targetLanguage, statusElement) {
  if (!text || !targetLanguage || targetLanguage === 'en') return text;
  if (statusElement) statusElement.textContent = `Translating to ${studyLanguages[targetLanguage] || targetLanguage}…`;
  const result = await translateTextPreferBrowser(text, 'en', targetLanguage, (progress) => {
    if (!statusElement) return;
    if (progress.type === 'download') statusElement.textContent = `Downloading language pack… ${Math.round(progress.value * 100)}%`;
    if (progress.type === 'translate') statusElement.textContent = `Translating… ${progress.current} of ${progress.total}`;
  });
  if (statusElement) statusElement.textContent = result.provider === 'browser' ? 'Translated in browser.' : 'Translated using server fallback.';
  return result.text;
}

function renderSyntopiconResult(analysis, meta) {
  stopReader();
  app.innerHTML = `
    <section class="panel syntopicon-result-page">
      <div class="library-heading">
        <div><span class="source-category">Syntopicon</span><h1>${escapeHtml(analysis.idea || meta.idea)}</h1><p>${escapeHtml(analysis.centralQuestion || '')}</p></div>
        <div class="source-actions"><button id="save-syntopicon-result" class="secondary" type="button">Save Study</button><button class="secondary" type="button" data-read="syntopicon">New Comparison</button></div>
      </div>
      <div class="syntopicon-result-grid">
        <article class="study-guide-card"><h2>Shared Terms</h2>${(analysis.terms || []).map((item)=>`<div class="study-connection"><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.meaning)}</p></div>`).join('')}</article>
        <article class="study-guide-card"><h2>Agreements</h2><ul>${(analysis.agreements || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <article class="study-guide-card"><h2>Disagreements</h2><ul>${(analysis.disagreements || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <article class="study-guide-card"><h2>Important Distinctions</h2><ul>${(analysis.distinctions || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <section class="study-guide-wide"><h2>Positions by Source</h2><div class="great-idea-grid">
          ${(analysis.sourcePositions || []).map((item)=>`<article class="great-idea-card"><h3>${escapeHtml(item.source)}</h3><p>${escapeHtml(item.position)}</p><p class="syntopicon-evidence"><strong>Basis:</strong> ${escapeHtml(item.evidenceBasis)}</p><ul>${(item.questions || []).map((q)=>`<li>${escapeHtml(q)}</li>`).join('')}</ul></article>`).join('')}
        </div></section>
        <article class="study-guide-card"><h2>Questions to Pursue</h2><ol>${(analysis.studyQuestions || []).map((q)=>`<li>${escapeHtml(q)}</li>`).join('')}</ol></article>
        <article class="study-guide-card"><h2>Suggested Reading Path</h2><ol>${(analysis.readingPath || []).map((item)=>`<li><strong>${escapeHtml(item.source)}</strong><p>${escapeHtml(item.reason)}</p></li>`).join('')}</ol></article>
      </div>
    </section>`;
  app.querySelector('#save-syntopicon-result')?.addEventListener('click', (event) => {
    saveSyntopiconAnalysis({ ...meta, analysis, savedAt: new Date().toISOString() });
    event.currentTarget.textContent = 'Saved';
    event.currentTarget.disabled = true;
  });
}

function renderSyntopicon() {
  stopReader();
  const lastBible = getLastBiblePassage();
  const language = getStudyLanguage();
  const saved = savedSyntopiconAnalyses();

  app.innerHTML = `
    <section class="panel syntopicon-page">
      <div class="library-heading">
        <div><span class="source-category">Discover · Syntopical Reading</span><h1>Syntopicon</h1><p>Study one Great Idea across multiple books and Bible passages. The goal is comparison: shared terms, competing answers, agreements, disagreements, and the questions that remain.</p></div>
        <button class="secondary" type="button" data-action="reader">Return to Reader</button>
      </div>

      <div class="syntopicon-builder">
        <section class="syntopicon-step">
          <span>1</span><div><h2>Choose the Great Idea</h2><p>Select a classic idea or enter your own question/topic.</p></div>
          <label>Great Idea<select id="syntopicon-idea"><option value="">Choose an idea…</option>${greatIdeasCatalog.map((idea)=>`<option value="${escapeHtml(idea)}">${escapeHtml(idea)}</option>`).join('')}</select></label>
          <label>Or custom idea<input id="syntopicon-custom-idea" type="text" placeholder="e.g. What makes political authority legitimate?"></label>
        </section>

        <section class="syntopicon-step">
          <span>2</span><div><h2>Select Sources</h2><p>Choose at least two sources. Great Book entries without supplied excerpts are treated as work-level orientation, not quoted textual evidence.</p></div>
          ${lastBible ? `<label class="syntopicon-source bible-source"><input type="checkbox" data-syntopicon-bible checked><div><strong>${escapeHtml(lastBible.title)}</strong><small>${escapeHtml(lastBible.translation || 'Bible')} · exact chapter text available</small></div></label>` : `<div class="help-note">Load a Bible chapter in Bible Study if you want it available here as an exact-text source.</div>`}
          <label class="curated-filter">Filter Great Books<input id="syntopicon-book-filter" type="search" placeholder="Plato, Augustine, Locke, Tolstoy…"></label>
          <div id="syntopicon-books" class="syntopicon-books">
            ${greatBooksCatalog.map((book,index)=>`<label class="syntopicon-source" data-syntopicon-book-card data-search-text="${escapeHtml(`${book.title} ${book.author} ${book.era}`.toLowerCase())}"><input type="checkbox" data-syntopicon-book="${index}"><div><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)} · Vol. ${book.volume}</small></div></label>`).join('')}
          </div>
        </section>

        <section class="syntopicon-step">
          <span>3</span><div><h2>Analysis Language</h2><p>The comparative study can be generated directly in another language.</p></div>
          <label>Language<select id="syntopicon-language">${studyLanguageOptions(language)}</select></label>
        </section>

        <div class="syntopicon-actions">
          <button id="run-syntopicon" class="primary" type="button">Compare Selected Sources</button>
          <span id="syntopicon-status" class="status"></span>
        </div>
      </div>

      ${saved.length ? `<section class="dashboard-section"><h2>Saved Syntopical Studies</h2><div class="activity-list">${saved.slice(0,8).map((item,index)=>`<article><div><strong>${escapeHtml(item.idea || item.analysis?.idea || 'Study')}</strong><span>${new Date(item.savedAt).toLocaleString()}</span></div><p>${escapeHtml(item.analysis?.centralQuestion || '')}</p><button class="secondary" type="button" data-open-syntopicon="${index}">Open</button></article>`).join('')}</div></section>` : ''}
    </section>`;

  app.querySelector('#syntopicon-book-filter')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    app.querySelectorAll('[data-syntopicon-book-card]').forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.searchText.includes(query);
    });
  });

  app.querySelector('#syntopicon-language')?.addEventListener('change', (event) => setStudyLanguage(event.target.value));

  app.querySelector('#run-syntopicon')?.addEventListener('click', async (event) => {
    const idea = app.querySelector('#syntopicon-custom-idea').value.trim() || app.querySelector('#syntopicon-idea').value;
    const status = app.querySelector('#syntopicon-status');
    if (!idea) { status.className='status error'; status.textContent='Choose or enter a Great Idea.'; return; }

    const sources = [];
    if (lastBible && app.querySelector('[data-syntopicon-bible]')?.checked) {
      sources.push({ id:'last-bible', title:lastBible.title, author:lastBible.translation || 'Bible', type:'bible', excerpt:lastBible.text || '' });
    }
    app.querySelectorAll('[data-syntopicon-book]:checked').forEach((input) => {
      const book = greatBooksCatalog[Number(input.dataset.syntopiconBook)];
      if (book) sources.push({ id:`great-${input.dataset.syntopiconBook}`, title:book.title, author:book.author, type:'great-book', excerpt:'' });
    });
    if (sources.length < 2) { status.className='status error'; status.textContent='Select at least two sources.'; return; }

    const languageCode = app.querySelector('#syntopicon-language').value || 'en';
    setStudyLanguage(languageCode);
    const button = event.currentTarget;
    button.disabled=true; button.textContent='Comparing…';
    status.className='status'; status.textContent='Building a syntopical map of the selected sources…';
    try {
      const analysis = await loadApiPayload('/api/syntopicon', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ idea, language:studyLanguages[languageCode] || 'English', sources })
      });
      renderSyntopiconResult(analysis, { idea, language:languageCode, sources:sources.map(({excerpt,...rest})=>rest) });
    } catch(error) {
      status.className='status error'; status.textContent=error.message;
      button.disabled=false; button.textContent='Compare Selected Sources';
    }
  });

  app.querySelectorAll('[data-open-syntopicon]').forEach((button)=>button.addEventListener('click',()=>{
    const item=saved[Number(button.dataset.openSyntopicon)];
    if(item?.analysis) renderSyntopiconResult(item.analysis,item);
  }));
}


function greatBookGrokipediaUrl(book) {
  return grokipediaSearchUrl(book.title, book.author);
}

function flattenBibleContent(content) {
  const textOf = (value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.text === 'string') return value.text;
    if (typeof value.heading === 'string') return value.heading;
    if (value.lineBreak) return '\n';
    return '';
  };
  const lines = [];
  for (const item of Array.isArray(content) ? content : []) {
    if (item?.type === 'heading') {
      const heading = (item.content || []).map(textOf).join(' ').replace(/\s+/g,' ').trim();
      if (heading) lines.push(heading);
    } else if (item?.type === 'hebrew_subtitle') {
      const subtitle = (item.content || []).map(textOf).join(' ').replace(/\s+/g,' ').trim();
      if (subtitle) lines.push(subtitle);
    } else if (item?.type === 'verse') {
      const verseText = (item.content || []).map(textOf).join('').replace(/\s+/g,' ').trim();
      if (verseText) lines.push(`${item.number}. ${verseText}`);
    } else if (item?.type === 'line_break') {
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

function renderStudyGuide(title, guide, { sourceType = 'great-book', returnAction = 'great-books' } = {}) {
  stopReader();
  app.innerHTML = `
    <section class="panel study-guide-page">
      <div class="library-heading">
        <div><span class="source-category">${sourceType === 'bible' ? 'Bible Study' : 'Syntopical Study'}</span><h1>${escapeHtml(title)}</h1><p>An AI-assisted study guide. Treat interpretations and cross-connections as prompts for further reading, not as a substitute for the primary text.</p></div>
        <button class="secondary" type="button" data-study-return>Back</button>
      </div>
      <div class="study-guide-grid">
        <article class="study-guide-card study-guide-wide"><h2>Overview</h2><p>${escapeHtml(guide.overview || '')}</p></article>
        <article class="study-guide-card study-guide-wide"><h2>Context</h2><p>${escapeHtml(guide.context || '')}</p></article>
        <section class="study-guide-wide"><h2>Great Ideas</h2><div class="great-idea-grid">
          ${(guide.greatIdeas || []).map((idea) => `<article class="great-idea-card"><h3>${escapeHtml(idea.idea)}</h3><p>${escapeHtml(idea.whyItMatters)}</p><ul>${(idea.questions || []).map((q)=>`<li>${escapeHtml(q)}</li>`).join('')}</ul></article>`).join('')}
        </div></section>
        <article class="study-guide-card"><h2>Study Questions</h2><ol>${(guide.studyQuestions || []).map((q)=>`<li>${escapeHtml(q)}</li>`).join('')}</ol></article>
        <article class="study-guide-card"><h2>Syntopical Connections</h2>${(guide.connections || []).map((item)=>`<div class="study-connection"><strong>${escapeHtml(item.work)}</strong><p>${escapeHtml(item.connection)}</p></div>`).join('')}</article>
      </div>
    </section>`;
  app.querySelector('[data-study-return]')?.addEventListener('click', () => {
    if (returnAction === 'bible') renderBibleStudy();
    else renderGreatBooksLibrary();
  });
}

async function requestStudyGuide({ title, author = '', passage = '', sourceType = 'great-book', language = getStudyLanguage() }) {
  return loadApiPayload('/api/study-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author, passage, sourceType, language: studyLanguages[language] || language || 'English' })
  });
}

async function renderGreatBookStudy(book, button) {
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Building study guide…'; }
  try {
    const guide = await requestStudyGuide({ title: book.title, author: book.author, sourceType: 'great-book', language: getStudyLanguage() });
    renderStudyGuide(`${book.title} — ${book.author}`, guide, { sourceType: 'great-book', returnAction: 'great-books' });
  } catch (error) {
    window.alert(`Study guide unavailable: ${error.message}`);
    if (button) { button.disabled = false; button.textContent = original || 'Study / Great Ideas'; }
  }
}


function flattenBibleContent(content) {
  const textOf = (value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.text === 'string') return value.text;
    if (typeof value.heading === 'string') return value.heading;
    if (value.lineBreak) return '\n';
    return '';
  };
  const lines = [];
  for (const item of Array.isArray(content) ? content : []) {
    if (item?.type === 'heading') {
      const heading = (item.content || []).map(textOf).join(' ').replace(/\s+/g,' ').trim();
      if (heading) lines.push(heading);
    } else if (item?.type === 'hebrew_subtitle') {
      const subtitle = (item.content || []).map(textOf).join(' ').replace(/\s+/g,' ').trim();
      if (subtitle) lines.push(subtitle);
    } else if (item?.type === 'verse') {
      const verseText = (item.content || []).map(textOf).join('').replace(/\s+/g,' ').trim();
      if (verseText) lines.push(`${item.number}. ${verseText}`);
    } else if (item?.type === 'line_break') {
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

function flattenCommentaryContent(payload) {
  const intro = String(payload?.chapter?.introduction || payload?.introduction || '').trim();
  const content = payload?.chapter?.content || payload?.content || [];
  const body = flattenBibleContent(content);
  return [intro, body].filter(Boolean).join('\n\n').trim();
}

function collectDatasetReferences(payload) {
  const refs = [];
  const walk = (value, verseNumber = null) => {
    if (Array.isArray(value)) return value.forEach((item) => walk(item, verseNumber));
    if (!value || typeof value !== 'object') return;
    const currentVerse = value.verse ?? value.number ?? verseNumber;
    const candidates = value.references || value.crossReferences || value.refs || value.content;
    if (Array.isArray(candidates)) {
      candidates.forEach((ref) => {
        if (typeof ref === 'string') refs.push({ verse: currentVerse, reference: ref });
        else if (ref && typeof ref === 'object') {
          const book = ref.book || ref.bookId || ref.bookName || '';
          const chapter = ref.chapter || '';
          const verse = ref.verse || ref.startVerse || '';
          const endVerse = ref.endVerse || '';
          const label = ref.reference || ref.label || [book, chapter && `${chapter}:${verse}${endVerse && endVerse !== verse ? `-${endVerse}` : ''}`].filter(Boolean).join(' ');
          if (label) refs.push({ verse: currentVerse, reference: label });
        }
      });
    }
    Object.entries(value).forEach(([key, child]) => {
      if (!['references','crossReferences','refs','content'].includes(key)) walk(child, currentVerse);
    });
  };
  walk(payload);
  return refs.slice(0, 500);
}

async function renderBibleStudy() {
  stopReader();
  app.innerHTML = `
    <section class="panel bible-study-page">
      <div class="library-heading">
        <div><span class="source-category">Discover · Study</span><h1>Bible Study</h1><p>Read chapters or books, compare translations, consult public-domain commentaries, follow cross references, and generate Great Ideas study guides.</p></div>
        <button class="secondary" type="button" data-action="reader">Return to Reader</button>
      </div>

      <div class="bible-language-toolbar">
        <label>Bible language<select id="bible-language-filter"><option value="">All languages</option></select></label>
        <label>Study / display language<select id="bible-study-language">${studyLanguageOptions(getStudyLanguage())}</select></label>
        <button id="bible-translate-display" class="secondary" type="button" disabled>Translate Displayed Chapter</button>
        <button id="bible-restore-display" class="secondary" type="button" disabled>Restore Source Translation</button>
      </div>
      <div class="bible-study-controls">
        <label>Translation<select id="bible-translation"><option>Loading translations…</option></select></label>
        <label>Book<select id="bible-book" disabled><option>Select a translation</option></select></label>
        <label>Chapter<select id="bible-chapter" disabled><option>—</option></select></label>
        <label>Compare with<select id="bible-compare"><option value="">No comparison</option></select></label>
      </div>

      <div class="bible-study-actions">
        <button id="bible-load" class="primary" type="button" disabled>Load Chapter</button>
        <button id="bible-reader" class="secondary" type="button" disabled>Read Chapter</button>
        <button id="bible-read-book" class="secondary" type="button" disabled>Read Entire Book</button>
        <button id="bible-study-guide" class="secondary" type="button" disabled>Study / Great Ideas</button>
        <a id="bible-grokipedia" class="secondary button-link" href="${grokipediaSearchUrl('Bible')}" target="_blank" rel="noopener noreferrer">Grokipedia</a>
      </div>

      <div class="bible-study-tabs" role="tablist" aria-label="Bible study tools">
        <button class="active" type="button" data-bible-tab="text">Text</button>
        <button type="button" data-bible-tab="commentary">Commentary</button>
        <button type="button" data-bible-tab="crossrefs">Cross References</button>
        <button type="button" data-bible-tab="profiles">Profiles</button>
        <button type="button" data-bible-tab="notes">Notes</button>
      </div>

      <p id="bible-status" class="status"></p>

      <section data-bible-view="text" class="bible-study-view active">
        <div id="bible-results" class="bible-results">
          <div class="empty-library"><h2>Choose a translation, book, and chapter</h2><p>Load a chapter to read, compare, study, or send it into the main reader.</p></div>
        </div>
      </section>

      <section data-bible-view="commentary" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>Commentary</h2><p>Select a public-domain commentary for the current chapter.</p></div>
          <label>Commentary<select id="bible-commentary"><option value="">Loading commentaries…</option></select></label>
        </div>
        <div id="bible-commentary-result" class="bible-study-resource"><p class="navigation-empty">Load a chapter, then choose a commentary.</p></div>
      </section>

      <section data-bible-view="crossrefs" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>Cross References</h2><p>Explore related passages from available open datasets.</p></div>
          <label>Dataset<select id="bible-dataset"><option value="">Loading datasets…</option></select></label>
        </div>
        <div id="bible-crossref-result" class="bible-study-resource"><p class="navigation-empty">Load a chapter to view related references.</p></div>
      </section>

      <section data-bible-view="profiles" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>People & Profiles</h2><p>Profiles are available where the selected commentary provides them.</p></div></div>
        <div id="bible-profile-result" class="bible-study-resource"><p class="navigation-empty">Choose a commentary with profile data.</p></div>
      </section>

      <section data-bible-view="notes" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>Study Notes</h2><p>Keep observations and questions tied to this chapter.</p></div></div>
        <textarea id="bible-study-notes" rows="10" placeholder="Observations, questions, themes, connections…"></textarea>
        <div class="bible-study-actions"><button id="save-bible-notes" class="secondary" type="button">Save Notes</button><span id="bible-notes-status" class="status"></span></div>
      </section>
    </section>`;

  const translationSelect = app.querySelector('#bible-translation');
  const compareSelect = app.querySelector('#bible-compare');
  const bookSelect = app.querySelector('#bible-book');
  const chapterSelect = app.querySelector('#bible-chapter');
  const commentarySelect = app.querySelector('#bible-commentary');
  const datasetSelect = app.querySelector('#bible-dataset');
  const bibleLanguageFilter = app.querySelector('#bible-language-filter');
  const bibleStudyLanguage = app.querySelector('#bible-study-language');
  const status = app.querySelector('#bible-status');

  let chapterPayload = null;
  let chapterText = '';
  let displayedChapterText = '';
  let commentaries = [];
  let datasets = [];
  let bibleTranslations = [];

  const setStatus = (message, error = false) => {
    status.className = `status${error ? ' error' : ''}`;
    status.textContent = message || '';
  };

  const bookLabel = () => bookSelect.selectedOptions[0]?.textContent?.replace(/\s+·.*$/,'') || 'Bible';
  const referenceLabel = () => `${bookLabel()} ${chapterSelect.value || ''}`.trim();
  const notesKey = () => `markSetGoBibleNotesV1:${translationSelect.value}:${bookSelect.value}:${chapterSelect.value}`;

  const selectTab = (tab) => {
    app.querySelectorAll('[data-bible-tab]').forEach((button) => {
      const active = button.dataset.bibleTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    app.querySelectorAll('[data-bible-view]').forEach((view) => {
      view.classList.toggle('active', view.dataset.bibleView === tab);
    });
  };

  app.querySelectorAll('[data-bible-tab]').forEach((button) => {
    button.addEventListener('click', () => selectTab(button.dataset.bibleTab));
  });

  const popularOrder = ['KJV','BSB','WEB','ASV','YLT','DARBY'];

  try {
    const [translationsPayload, commentariesPayload, datasetsPayload] = await Promise.all([
      loadApiPayload('/api/bible/translations'),
      loadApiPayload('/api/bible/commentaries'),
      loadApiPayload('/api/bible/datasets')
    ]);
    bibleTranslations = translationsPayload.translations || [];
    bibleTranslations.sort((a,b) => {
      const ai = popularOrder.indexOf(a.id), bi = popularOrder.indexOf(b.id);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return `${a.languageName} ${a.name}`.localeCompare(`${b.languageName} ${b.name}`);
    });
    const languageNames = [...new Set(bibleTranslations.map((item)=>item.languageName || item.language).filter(Boolean))].sort();
    bibleLanguageFilter.innerHTML = `<option value="">All languages</option>${languageNames.map((name)=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
    const englishName = languageNames.find((name)=>/^english$/i.test(name));
    if (englishName) bibleLanguageFilter.value = englishName;

    const renderTranslationOptions = () => {
      const filterLanguage = bibleLanguageFilter.value;
      const filtered = bibleTranslations.filter((item)=>!filterLanguage || (item.languageName || item.language) === filterLanguage);
      const options = filtered.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.shortName)} — ${escapeHtml(item.name)}</option>`).join('');
      const previous = translationSelect.value;
      translationSelect.innerHTML = options;
      compareSelect.innerHTML = `<option value="">No comparison</option>${options}`;
      const preferred = filtered.find((item)=>item.id === previous) || filtered.find((item)=>item.id === 'KJV') || filtered.find((item)=>item.id === 'BSB') || filtered[0];
      if (preferred) translationSelect.value = preferred.id;
    };
    renderTranslationOptions();
    bibleLanguageFilter.addEventListener('change', async () => {
      renderTranslationOptions();
      if (translationSelect.value) await loadBooks();
    });

    commentaries = commentariesPayload.commentaries || [];
    commentarySelect.innerHTML = `<option value="">Choose commentary…</option>${commentaries.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;

    datasets = datasetsPayload.datasets || [];
    datasetSelect.innerHTML = `<option value="">Choose dataset…</option>${datasets.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;
    const crossRef = datasets.find((item) => /cross/i.test(item.name) || /cross-ref/i.test(item.id));
    if (crossRef) datasetSelect.value = crossRef.id;

    await loadBooks();
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  async function loadBooks() {
    setStatus('Loading books…');
    const payload = await loadApiPayload(`/api/bible/${encodeURIComponent(translationSelect.value)}/books`);
    const books = payload.books || [];
    bookSelect.innerHTML = books.map((book)=>`<option value="${escapeHtml(book.id)}" data-chapters="${Number(book.numberOfChapters)}">${escapeHtml(book.name)}${book.isApocryphal ? ' · Deuterocanonical/Apocryphal' : ''}</option>`).join('');
    bookSelect.disabled = false;
    updateChapters();
    setStatus('');
  }

  function updateChapters() {
    const option = bookSelect.selectedOptions[0];
    const count = Math.max(1, Number(option?.dataset.chapters) || 1);
    chapterSelect.innerHTML = Array.from({length:count},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    chapterSelect.disabled=false;
    app.querySelector('#bible-load').disabled=false;
    app.querySelector('#bible-read-book').disabled=false;
    updateGrokipedia();
    loadSavedNotes();
  }

  function updateGrokipedia() {
    app.querySelector('#bible-grokipedia').href = grokipediaSearchUrl(`${referenceLabel()} Bible`);
  }

  function loadSavedNotes() {
    app.querySelector('#bible-study-notes').value = localStorage.getItem(notesKey()) || '';
  }

  async function fetchChapter(translation) {
    return loadApiPayload(`/api/bible/${encodeURIComponent(translation)}/${encodeURIComponent(bookSelect.value)}/${encodeURIComponent(chapterSelect.value)}`);
  }

  async function loadCommentary() {
    const id = commentarySelect.value;
    const result = app.querySelector('#bible-commentary-result');
    if (!id || !chapterPayload) {
      result.innerHTML = '<p class="navigation-empty">Load a chapter, then choose a commentary.</p>';
      return;
    }
    result.innerHTML = '<p class="status">Loading commentary…</p>';
    try {
      const payload = await loadApiPayload(`/api/bible/commentary/${encodeURIComponent(id)}/${encodeURIComponent(bookSelect.value)}/${encodeURIComponent(chapterSelect.value)}`);
      const text = flattenCommentaryContent(payload);
      result.innerHTML = text
        ? `<article class="bible-resource-card"><div class="bible-resource-title"><h3>${escapeHtml(commentarySelect.selectedOptions[0]?.textContent || 'Commentary')}</h3></div><pre>${escapeHtml(text)}</pre></article>`
        : '<p class="navigation-empty">No commentary text is available for this chapter.</p>';
      loadProfiles();
    } catch (error) {
      result.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadCrossRefs() {
    const id = datasetSelect.value;
    const result = app.querySelector('#bible-crossref-result');
    if (!id || !chapterPayload) {
      result.innerHTML = '<p class="navigation-empty">Load a chapter and choose a dataset.</p>';
      return;
    }
    result.innerHTML = '<p class="status">Loading cross references…</p>';
    try {
      const payload = await loadApiPayload(`/api/bible/dataset/${encodeURIComponent(id)}/${encodeURIComponent(bookSelect.value)}/${encodeURIComponent(chapterSelect.value)}`);
      const refs = collectDatasetReferences(payload);
      result.innerHTML = refs.length
        ? `<div class="bible-reference-list">${refs.map((item)=>`<article><span>${item.verse ? `Verse ${escapeHtml(item.verse)}` : 'Related'}</span><strong>${escapeHtml(item.reference)}</strong></article>`).join('')}</div>`
        : `<article class="bible-resource-card"><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></article>`;
    } catch (error) {
      result.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadProfiles() {
    const id = commentarySelect.value;
    const result = app.querySelector('#bible-profile-result');
    const commentary = commentaries.find((item)=>item.id === id);
    if (!id || !commentary?.totalNumberOfProfiles) {
      result.innerHTML = '<p class="navigation-empty">This commentary does not advertise profile data.</p>';
      return;
    }
    result.innerHTML = '<p class="status">Loading profiles…</p>';
    try {
      const payload = await loadApiPayload(`/api/bible/commentary/${encodeURIComponent(id)}/profiles`);
      const matching = (payload.profiles || []).filter((profile) =>
        profile.reference?.book === bookSelect.value &&
        Number(profile.reference?.chapter) === Number(chapterSelect.value)
      );
      result.innerHTML = matching.length
        ? `<div class="bible-profile-list">${matching.map((profile)=>`<button class="secondary" type="button" data-bible-profile="${escapeHtml(profile.id)}">${escapeHtml(profile.subject || profile.id)}</button>`).join('')}</div>`
        : '<p class="navigation-empty">No profiles are tied directly to this chapter.</p>';
      result.querySelectorAll('[data-bible-profile]').forEach((button)=>button.addEventListener('click',async()=>{
        result.innerHTML='<p class="status">Loading profile…</p>';
        try {
          const profile = await loadApiPayload(`/api/bible/commentary/${encodeURIComponent(id)}/profiles/${encodeURIComponent(button.dataset.bibleProfile)}`);
          result.innerHTML=`<article class="bible-resource-card"><pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre></article>`;
        } catch(error) {
          result.innerHTML=`<p class="status error">${escapeHtml(error.message)}</p>`;
        }
      }));
    } catch (error) {
      result.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadChapter() {
    const loadButton=app.querySelector('#bible-load');
    loadButton.disabled=true;
    setStatus('Loading chapter…');
    try {
      chapterPayload = await fetchChapter(translationSelect.value);
      chapterText = flattenBibleContent(chapterPayload.chapter?.content);
      displayedChapterText = chapterText;
      const compareId = compareSelect.value;
      let comparePayload=null, compareText='';
      if (compareId) {
        comparePayload = await fetchChapter(compareId);
        compareText = flattenBibleContent(comparePayload.chapter?.content);
      }
      const heading = referenceLabel();
      app.querySelector('#bible-results').innerHTML = `
        <div class="bible-translation-grid ${comparePayload ? 'comparing' : ''}">
          <article class="bible-chapter-card"><div class="bible-chapter-heading"><h2>${escapeHtml(heading)}</h2><span>${escapeHtml(chapterPayload.translation?.shortName || translationSelect.value)}</span></div><pre>${escapeHtml(chapterText)}</pre></article>
          ${comparePayload ? `<article class="bible-chapter-card"><div class="bible-chapter-heading"><h2>${escapeHtml(heading)}</h2><span>${escapeHtml(comparePayload.translation?.shortName || compareId)}</span></div><pre>${escapeHtml(compareText)}</pre></article>` : ''}
        </div>`;
      app.querySelector('#bible-reader').disabled=false;
      app.querySelector('#bible-study-guide').disabled=false;
      app.querySelector('#bible-translate-display').disabled=false;
      app.querySelector('#bible-restore-display').disabled=true;
      saveLastBiblePassage({
        title: heading,
        translation: chapterPayload.translation?.shortName || translationSelect.value,
        translationId: translationSelect.value,
        book: bookSelect.value,
        chapter: Number(chapterSelect.value),
        text: chapterText,
        savedAt: new Date().toISOString()
      });
      setStatus(comparePayload ? 'Translations loaded side by side.' : 'Chapter loaded.');
      loadSavedNotes();
      if (commentarySelect.value) loadCommentary();
      if (datasetSelect.value) loadCrossRefs();
    } catch(error) {
      setStatus(error.message,true);
    } finally {
      loadButton.disabled=false;
    }
  }

  async function readEntireBook() {
    const button = app.querySelector('#bible-read-book');
    const original = button.textContent;
    const selectedBook = bookLabel();
    const selectedTranslation = translationSelect.value;
    const chapterCount = Math.max(1, Number(bookSelect.selectedOptions[0]?.dataset.chapters) || 1);
    button.disabled = true;
    button.textContent = 'Loading book…';
    setStatus(`Loading ${selectedBook}: 0 of ${chapterCount} chapters…`);

    try {
      // The upstream Bible API is chapter-oriented. Build the book from those
      // known-good chapter responses instead of depending on a "complete"
      // response whose shape varies by translation.
      const chapters = new Array(chapterCount);
      const concurrency = Math.min(4, chapterCount);
      let nextChapter = 1;
      let completed = 0;

      const worker = async () => {
        while (nextChapter <= chapterCount) {
          const chapterNumber = nextChapter++;
          const payload = await loadApiPayload(
            `/api/bible/${encodeURIComponent(selectedTranslation)}/${encodeURIComponent(bookSelect.value)}/${chapterNumber}`
          );
          const text = flattenBibleContent(payload.chapter?.content);
          if (!text || !splitWords(text).length) {
            throw new Error(`Chapter ${chapterNumber} did not contain readable text.`);
          }
          chapters[chapterNumber - 1] = {
            number: payload.chapter?.number || chapterNumber,
            text,
            translation: payload.translation
          };
          completed += 1;
          setStatus(`Loading ${selectedBook}: ${completed} of ${chapterCount} chapters…`);
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const parts = [];
      const toc = [];
      let wordIndex = 0;
      for (const chapter of chapters) {
        const heading = `Chapter ${chapter.number}`;
        const block = `${heading}\n\n${chapter.text}`;
        toc.push({ title: heading, index: wordIndex, type: 'chapter' });
        parts.push(block);
        wordIndex += splitWords(block).length;
      }

      const fullText = parts.join('\n\n');
      if (!splitWords(fullText).length) {
        throw new Error(`No readable text was returned for ${selectedBook}.`);
      }

      const title = `${selectedBook} — ${chapters[0]?.translation?.shortName || selectedTranslation}`;
      renderReaderWithText(title, fullText, {
        type:'bible-book',
        translation:selectedTranslation,
        book:bookSelect.value,
        author:'Bible',
        epubToc:toc
      });
    } catch(error) {
      setStatus(`Unable to load entire book: ${error.message}`, true);
      button.disabled=false;
      button.textContent=original;
    }
  }

  translationSelect.addEventListener('change', loadBooks);
  bookSelect.addEventListener('change', () => { updateChapters(); chapterPayload=null; chapterText=''; });
  chapterSelect.addEventListener('change', () => { updateGrokipedia(); loadSavedNotes(); });
  compareSelect.addEventListener('change', () => { if (chapterPayload) loadChapter(); });
  commentarySelect.addEventListener('change', () => { loadCommentary(); });
  datasetSelect.addEventListener('change', () => { loadCrossRefs(); });

  app.querySelector('#bible-load').addEventListener('click', loadChapter);
  app.querySelector('#bible-reader').addEventListener('click', async () => {
    if (!chapterPayload) await loadChapter();
    if (!chapterPayload || !chapterText) return;
    const heading = referenceLabel();
    renderReaderWithText(`${heading} — ${chapterPayload.translation?.shortName || translationSelect.value}`, chapterText, {
      type:'bible', translation:translationSelect.value, book:bookSelect.value, chapter:Number(chapterSelect.value), author:'Bible'
    });
  });
  app.querySelector('#bible-read-book').addEventListener('click', readEntireBook);
  app.querySelector('#bible-study-guide').addEventListener('click', async (event) => {
    if (!chapterPayload) await loadChapter();
    if (!chapterPayload || !chapterText) return;
    const button=event.currentTarget, original=button.textContent;
    button.disabled=true; button.textContent='Building study guide…';
    try {
      const heading = referenceLabel();
      const guide = await requestStudyGuide({ title: heading, author: chapterPayload.translation?.shortName || translationSelect.value, passage: chapterText, sourceType:'bible', language: bibleStudyLanguage.value || getStudyLanguage() });
      renderStudyGuide(heading, guide, { sourceType:'bible', returnAction:'bible' });
    } catch(error) {
      window.alert(`Bible study guide unavailable: ${error.message}`);
      button.disabled=false; button.textContent=original;
    }
  });

  bibleStudyLanguage.addEventListener('change', () => setStudyLanguage(bibleStudyLanguage.value));

  app.querySelector('#bible-translate-display').addEventListener('click', async (event) => {
    if (!chapterPayload || !chapterText) return;
    const target = bibleStudyLanguage.value || 'en';
    if (target === 'en') {
      setStatus('Study/display language is already English.');
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      displayedChapterText = await translateStudyBlock(chapterText, target, status);
      const heading = referenceLabel();
      const card = app.querySelector('#bible-results .bible-chapter-card');
      if (card) card.querySelector('pre').textContent = displayedChapterText;
      app.querySelector('#bible-restore-display').disabled = false;
      setStatus(`Displayed chapter translated to ${studyLanguages[target] || target}. Source translation remains unchanged.`);
    } catch(error) {
      setStatus(error.message,true);
    } finally {
      button.disabled=false;
    }
  });

  app.querySelector('#bible-restore-display').addEventListener('click', () => {
    displayedChapterText = chapterText;
    const card = app.querySelector('#bible-results .bible-chapter-card');
    if (card) card.querySelector('pre').textContent = chapterText;
    app.querySelector('#bible-restore-display').disabled = true;
    setStatus('Restored source translation.');
  });

  app.querySelector('#save-bible-notes').addEventListener('click', () => {
    localStorage.setItem(notesKey(), app.querySelector('#bible-study-notes').value || '');
    const noteStatus=app.querySelector('#bible-notes-status');
    noteStatus.textContent='Saved.';
    window.setTimeout(()=>{ if(noteStatus) noteStatus.textContent=''; },1200);
  });
}

function renderGreatBooksLibrary() {
  stopReader();
  const grouped = groupBy(greatBooksCatalog, 'volume');
  app.innerHTML = `
    <section class="panel curated-library great-books-study-library">
      <div class="library-heading">
        <div><span class="source-category">Discover · Study</span><h1>Great Books of the Western World</h1><p>The 1990 60-volume reading list, organized for primary-text reading, study, and syntopical exploration.</p></div>
        <div class="source-actions"><button class="secondary" type="button" data-read="gutenberg">Search Gutenberg</button><button class="secondary" type="button" data-action="reader">Return to Reader</button></div>
      </div>
      <div class="study-language-bar">
        <div><strong>Study language</strong><span>AI study guides can be generated in another language; imported books can be translated from the Reader.</span></div>
        <select id="great-books-study-language">${studyLanguageOptions(getStudyLanguage())}</select>
      </div>
      <div class="great-books-study-intro">
        <article><strong>${greatBooksCatalog.length}</strong><span>works / author groups</span></article>
        <article><strong>60</strong><span>volume framework</span></article>
        <article><strong>AI</strong><span>Great Ideas study guides</span></article>
      </div>
      <label class="curated-filter">Filter works, authors, volumes, or ideas<input id="great-books-filter" type="search" placeholder="Plato, justice, Shakespeare, science…"></label>
      <div id="great-books-groups" class="curated-groups great-books-volumes">
        ${Object.entries(grouped).sort((a,b)=>Number(a[0])-Number(b[0])).map(([volume, books]) => `
          <details class="curated-era" ${Number(volume) <= 6 ? 'open' : ''}>
            <summary>Volume ${escapeHtml(volume)} · ${escapeHtml(books[0]?.era || '')} <span>${books.length}</span></summary>
            <div class="curated-grid">
              ${books.map((book) => `<article class="curated-card" data-great-book-card data-search-text="${escapeHtml(`${book.title} ${book.author} ${book.era} volume ${book.volume}`.toLowerCase())}">
                <div><span class="source-category">Volume ${book.volume}</span><h2>${escapeHtml(book.title)}</h2><p>${escapeHtml(book.author)}</p></div>
                <div class="great-book-actions">
                  <button class="primary" type="button" data-load-great-book="${escapeHtml(book.query)}">Find &amp; Import Edition</button>
                  <button class="secondary" type="button" data-study-great-book="${escapeHtml(book.query)}">Study / Great Ideas</button>
                  <a class="secondary button-link" href="${greatBookGrokipediaUrl(book)}" target="_blank" rel="noopener noreferrer">Grokipedia</a>
                </div>
                <p class="status book-load-status"></p>
              </article>`).join('')}
            </div>
          </details>`).join('')}
      </div>
      <p class="library-note">The reading list follows the 1990 edition’s contents. Find & Import searches all connected public book sources—Standard Ebooks, Internet Archive, Open Library, Wikisource, and Project Gutenberg—and opens only a verified primary/full-text edition. Summaries, excerpts, study guides, and weak title matches are rejected automatically. It may not find works that remain copyrighted or lack a suitable open digital edition. This app does not reproduce Britannica’s copyrighted Syntopicon commentary; its Great Ideas study guides are newly generated for syntopical reading.</p>
    </section>`;

  app.querySelector('#great-books-study-language')?.addEventListener('change', (event) => setStudyLanguage(event.target.value));
  const filter = app.querySelector('#great-books-filter');
  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    app.querySelectorAll('[data-great-book-card]').forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.searchText.includes(query);
    });
    app.querySelectorAll('.curated-era').forEach((era) => {
      era.hidden = !Array.from(era.querySelectorAll('[data-great-book-card]')).some((card) => !card.hidden);
    });
  });
  app.querySelectorAll('[data-load-great-book]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = greatBooksCatalog.find((book) => book.query === button.dataset.loadGreatBook);
      loadGreatBookEdition(item, button.closest('.curated-card').querySelector('.book-load-status'), button);
    });
  });
  app.querySelectorAll('[data-study-great-book]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = greatBooksCatalog.find((book) => book.query === button.dataset.studyGreatBook);
      if (item) renderGreatBookStudy(item, button);
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
  const sections = [
    ['getting-started', 'Getting Started'],
    ['navigation', 'Navigation'],
    ['library', 'Library & Imports'],
    ['reader', 'Reader Basics'],
    ['modes', 'Reading Modes'],
    ['focus', 'Focus Anchor'],
    ['pages', 'Book Pages'],
    ['panels', 'Side Panels'],
    ['comprehension', 'Comprehension'],
    ['words', 'Dictionary, Notes & Vocabulary'],
    ['media', 'Music & Media Match'],
    ['translation', 'Translation'],
    ['fullscreen', 'Fullscreen'],
    ['shortcuts', 'Shortcuts'],
    ['progress', 'Reading Progress'],
    ['privacy', 'Storage & Privacy'],
    ['troubleshooting', 'Troubleshooting']
  ];

  app.innerHTML = `
    <section class="panel help-page">
      <div class="help-hero">
        <div>
          <span class="help-eyebrow">Mark, Set, Go! Guide</span>
          <h1>Help</h1>
          <p>Everything you need to import a book, configure the reader, practice comprehension, save what matters, and troubleshoot common issues.</p>
        </div>
        <label class="help-search">
          <span>Search Help</span>
          <input id="help-search-input" type="search" placeholder="Try “EPUB”, “focus anchor”, “comprehension”…" autocomplete="off">
        </label>
      </div>

      <div class="help-layout">
        <aside class="help-toc" aria-label="Help topics">
          <strong>On this page</strong>
          ${sections.map(([id, label]) => `<a href="#help-${id}" data-help-link="${id}">${label}</a>`).join('')}
        </aside>

        <div class="help-content" id="help-content">
          <section class="help-section" id="help-getting-started" data-help-section data-help-keywords="start begin first book quick start">
            <h2>Getting Started</h2>
            <ol class="help-steps">
              <li><strong>Find or import something to read.</strong> Use <em>Library</em> for your own books and files, or <em>Discover</em> for Gutenberg, Great Books, news, weather, and other sources.</li>
              <li><strong>Open the Reader.</strong> Your book loads into the central reading canvas. The left and right slide panels stay closed until you need them.</li>
              <li><strong>Choose a mode and pace.</strong> Open <strong>⚙ Reader Controls</strong> and set the reading mode, WPM, words shown, display options, and Focus Anchor.</li>
              <li><strong>Start reading.</strong> Use Start/Pause, press Space, or click the reading area in supported modes.</li>
              <li><strong>Check understanding.</strong> Open Reader Controls → Learn → <strong>Comprehension</strong> after you have read at least about 120 words.</li>
            </ol>
            <div class="help-tip"><strong>Tip:</strong> Mark, Set, Go! opens to a lightweight home screen instead of rebuilding your previous book automatically. Use <strong>Resume Last Reading</strong> when you want to restore the saved reader session.</div>
          </section>

          <section class="help-section" id="help-navigation" data-help-section data-help-keywords="menu library discover learn music help about navigation">
            <h2>Navigation</h2>
            <div class="help-card-grid">
              <article><h3>Library</h3><p>Your reading list, reading progress, imported EPUB/TXT content, illustrated books, and URL imports.</p></article>
              <article><h3>Discover</h3><p>Find new material through Search All Libraries, Project Gutenberg, Great Books, Bible Study, news, weather, and other feeds.</p></article>
              <article><h3>Learn</h3><p>Reader-training tools such as WPM tests and Vocabulary Builder. Comprehension checks are available inside the Reader Controls panel.</p></article>
              <article><h3>Music</h3><p>Manage reading music and launch quick reading playlists. Reader-specific Media Match options are also available in the Reader Controls panel.</p></article>
              <article><h3>Help</h3><p>This guide and About information.</p></article>
            </div>
          </section>

          <section class="help-section" id="help-library" data-help-section data-help-keywords="library epub epub3 txt upload import url gutenberg reading list">
            <h2>Library & Imports</h2>
            <h3>Import Book / Text</h3>
            <p>Use <strong>Library → Import Book / Text</strong> for TXT and EPUB/EPUB3 files. EPUB files are unpacked locally in your browser rather than interpreted as raw text. Great Books uses the unified public-library search and tries readable editions across all connected sources rather than relying on Project Gutenberg alone.</p>
            <h3>EPUB navigation</h3>
            <p>When available, the app uses the EPUB’s own navigation document and reading spine to preserve chapter order and build a cleaner table of contents. Older EPUBs can fall back to NCX navigation.</p>
            <h3>Read from URL</h3>
            <p>Use this for supported web content. Some sites block automated article extraction; if a page cannot be fetched, open the original page or paste/import readable text instead.</p>
            <div class="help-note"><strong>Kindle:</strong> DRM-protected Kindle purchases cannot be imported directly. DRM-free EPUBs and personal documents are appropriate import sources.</div>
          </section>

          <section class="help-section" id="help-reader" data-help-section data-help-keywords="reader start pause reset speed wpm words shown position">
            <h2>Reader Basics</h2>
            <p>The central reader is designed to remain uncluttered. Start, Pause, Reset, fullscreen, and page controls stay close to the text. Less-frequent controls live in the right drawer.</p>
            <dl class="help-definition-list">
              <div><dt>Speed / WPM</dt><dd>Controls the target words per minute for timed reading modes.</dd></div>
              <div><dt>Words shown</dt><dd>Controls how many words are presented as a group in compatible modes.</dd></div>
              <div><dt>Meaningful chunks</dt><dd>Uses punctuation and phrase boundaries to form more natural groups up to the selected word maximum.</dd></div>
              <div><dt>Position preservation</dt><dd>Changing a reading mode or layout option should keep the same logical word position rather than restarting the book.</dd></div>
            </dl>
          </section>

          <section class="help-section" id="help-modes" data-help-section data-help-keywords="highlight bold focus smooth glide pointing guide marquee flash digital sign auto scroll two columns">
            <h2>Reading Modes</h2>
            <div class="help-card-grid help-modes">
              <article><h3>Highlight</h3><p>Keeps the full passage visible while highlighting the active word group.</p></article>
              <article><h3>Bold Focus</h3><p>Keeps the passage visible and emphasizes the active group with typography instead of a colored highlight.</p></article>
              <article><h3>Smooth Glide</h3><p>Moves a soft visual focus guide continuously through the text.</p></article>
              <article><h3>Pointing Guide</h3><p>Uses a pointer beneath the current group to guide the eye.</p></article>
              <article><h3>Marquee</h3><p>Advances through the passage progressively while following the reading position.</p></article>
              <article><h3>Flash</h3><p>Presents a limited number of words at a fixed reading point for RSVP-style practice.</p></article>
              <article><h3>Digital Sign</h3><p>Moves text continuously across the display.</p></article>
              <article><h3>Auto Scroll</h3><p>Scrolls through normal text at a controlled pace.</p></article>
              <article><h3>Two Columns</h3><p>Formats text in a two-column reading layout.</p></article>
            </div>
            <div class="help-tip"><strong>Start conservatively:</strong> choose a comfortable speed and increase it only when comprehension stays strong.</div>
          </section>

          <section class="help-section" id="help-focus" data-help-section data-help-keywords="focus anchor center green color bold line overlay size">
            <h2>Focus Anchor</h2>
            <p>The Focus Anchor provides a stable recognition point while the current word or phrase changes around it.</p>
            <ul>
              <li><strong>Anchor size</strong> is independent of the normal book font size.</li>
              <li><strong>Anchor color</strong> can be changed; green is the default.</li>
              <li><strong>Bold anchor letter</strong> is optional if normal weight feels less visually disruptive.</li>
              <li>Short guide markers above and below the recognition point help keep the eyes centered.</li>
              <li>In normal reading, the anchor can be repositioned. In fullscreen, it occupies a dedicated upper band so the book text begins below it.</li>
            </ul>
          </section>

          <section class="help-section" id="help-pages" data-help-section data-help-keywords="book pages pagination page spread wheel previous next fullscreen">
            <h2>Book Pages</h2>
            <p>Book Pages creates a two-page spread using the available reader width. Spreads advance in pairs: 1–2, 3–4, 5–6, and so on.</p>
            <ul>
              <li>Use the page arrows or page indicator to navigate spreads.</li>
              <li>The mouse wheel can change spreads while Book Pages is active.</li>
              <li>Entering or leaving fullscreen recalculates the usable page geometry while preserving the logical reading position.</li>
              <li>The highlighter should remain within the visible spread rather than horizontally nudging the page.</li>
            </ul>
          </section>

          <section class="help-section" id="help-panels" data-help-section data-help-keywords="left right side panel marks contents bookmarks definitions notes reader controls">
            <h2>Left & Right Side Panels</h2>
            <h3>☰ Marks & Contents — left</h3>
            <p>This drawer exposes the features connected to the text itself:</p>
            <ul><li>Contents</li><li>Bookmarks</li><li>Saved Definitions</li><li>Notes</li></ul>
            <h3>⚙ Reader Controls — right</h3>
            <p>This is the reader control center. Settings are stacked vertically and grouped into Reading, Display, Learn, Media, and Language/Words. Both drawers normally stay closed so the book gets the maximum available space.</p>
          </section>

          <section class="help-section" id="help-comprehension" data-help-section data-help-keywords="comprehension ai quiz openai effective wpm questions recall main idea inference">
            <h2>Comprehension Checks</h2>
            <p>Open <strong>Reader Controls → Learn → Comprehension</strong> after reading a passage. The app sends only the bounded passage being tested to your server, which requests four structured questions from the configured OpenAI model.</p>
            <p>The quiz contains:</p>
            <ol><li>Factual recall</li><li>Main idea</li><li>Inference</li><li>Deeper understanding</li></ol>
            <p>After scoring, Mark, Set, Go! stores the comprehension percentage and calculates <strong>effective WPM</strong>:</p>
            <div class="help-formula">Effective WPM = Reading WPM × Comprehension Rate</div>
            <p>Results appear in Reading Progress. A check requires at least about 120 newly read words and normally uses the passage read since the previous check, within a safe size limit.</p>
            <div class="help-note"><strong>API setup:</strong> local/server comprehension requires <code>OPENAI_API_KEY</code> in the Node server environment. The key must never be stored in browser JavaScript.</div>
          </section>

          <section class="help-section" id="help-words" data-help-section data-help-keywords="dictionary definition note bookmark vocabulary word lookup save">
            <h2>Dictionary, Notes & Vocabulary</h2>
            <p>Use the word context menu to look up a word, save its definition, or attach a note. Saved definitions and notes for the current document appear in the left Marks & Contents drawer.</p>
            <p>The Vocabulary Builder under Learn is intended for reviewing saved words and building longer-term recall.</p>
          </section>

          <section class="help-section" id="help-media" data-help-section data-help-keywords="music media match score mood preferred news video youtube">
            <h2>Music & Media Match</h2>
            <p>The top-level Music menu manages general reading music. Inside the Reader Controls panel, Media Match adapts to the current content:</p>
            <ul>
              <li><strong>Music Score</strong> searches for an appropriate soundtrack/ambient score for books and general text.</li>
              <li><strong>News Video</strong> is useful for headlines/articles and looks for video coverage related to the current story.</li>
              <li><strong>Reading Mood</strong> searches for music matching the tone of the current reading.</li>
              <li><strong>Preferred Music</strong> lets readers quickly reuse music they previously saved from the Music page.</li>
            </ul>
          </section>

          <section class="help-section" id="help-translation" data-help-section data-help-keywords="translation browser translator language translate restore english">
            <h2>Translation</h2>
            <p>Choose a target language under Reader Controls → Language & Words. The app can use supported browser translation capabilities when available and retains server-side fallback behavior where configured.</p>
            <p>After a passage is translated, supported word interactions can show English meanings. Use <strong>Restore English</strong> to return to the source text.</p>
          </section>

          <section class="help-section" id="help-fullscreen" data-help-section data-help-keywords="fullscreen full screen options controls focus">
            <h2>Fullscreen Reading</h2>
            <p>Fullscreen removes surrounding page distractions. The compact Options panel contains fullscreen versions of the reading, focus, display, media, and translation controls.</p>
            <p>Press <kbd>O</kbd> to restore hidden fullscreen controls if needed. Focus Anchor uses a dedicated top band in fullscreen so it does not cover the beginning of the book text.</p>
          </section>

          <section class="help-section" id="help-shortcuts" data-help-section data-help-keywords="keyboard shortcuts space o mouse wheel click">
            <h2>Shortcuts & Interaction</h2>
            <table class="help-table">
              <thead><tr><th>Action</th><th>Shortcut / Interaction</th></tr></thead>
              <tbody>
                <tr><td>Pause / resume</td><td><kbd>Space</kbd> in compatible reader modes</td></tr>
                <tr><td>Move reading position</td><td>Click a word in supported full-text modes</td></tr>
                <tr><td>Restore fullscreen controls</td><td><kbd>O</kbd></td></tr>
                <tr><td>Turn Book Pages</td><td>Page arrows / indicator / mouse wheel while Book Pages is active</td></tr>
                <tr><td>Resize side panes</td><td>Drag a divider when the pane is open; double-click the divider to reset its stored width</td></tr>
              </tbody>
            </table>
          </section>

          <section class="help-section" id="help-progress" data-help-section data-help-keywords="progress sessions comprehension effective wpm streak">
            <h2>Reading Progress</h2>
            <p>Library → Reading Progress summarizes reading time, words, pace, streaks, book/document progress, comprehension results, and effective WPM when comprehension checks have been completed.</p>
            <p>Progress is currently stored in the browser, so clearing browser storage can remove history unless the feature is later migrated to an account-backed database.</p>
          </section>

          <section class="help-section" id="help-privacy" data-help-section data-help-keywords="privacy local storage indexeddb server openai data">
            <h2>Storage & Privacy</h2>
            <ul>
              <li>Reader sessions may use IndexedDB with a Local Storage fallback.</li>
              <li>Reading progress, notes, bookmarks, definitions, vocabulary, and comprehension history are currently stored locally in the browser.</li>
              <li>EPUB parsing occurs in the browser.</li>
              <li>Comprehension sends only the bounded passage being tested to the server/OpenAI request; it does not require sending the entire book.</li>
              <li>API keys belong on the server only.</li>
            </ul>
          </section>

          <section class="help-section" id="help-troubleshooting" data-help-section data-help-keywords="troubleshooting fetch failed 502 certificate node system ca frozen cache ctrl f5">
            <h2>Troubleshooting</h2>
            <details open><summary>External features return “Fetch failed” or 502 locally</summary>
              <p>If Node reports <code>UNABLE_TO_GET_ISSUER_CERT_LOCALLY</code> on a managed Windows computer, start Node with the Windows system certificate store:</p>
              <pre><code>$env:NODE_OPTIONS="--use-system-ca"
npm start</code></pre>
            </details>
            <details><summary>Comprehension says AI is not configured</summary>
              <p>Ensure <code>OPENAI_API_KEY</code> is set in the same PowerShell/server environment before starting Node. API usage also requires an API account with available billing/credits.</p>
            </details>
            <details><summary>The browser appears to show an older interface</summary>
              <p>Use <kbd>Ctrl</kbd>+<kbd>F5</kbd> once after installing a new build so cached JavaScript and CSS are replaced.</p>
            </details>
            <details><summary>A previous large book makes startup slow</summary>
              <p>Current builds open a lightweight home screen. The full saved reader session is reconstructed only after you explicitly choose Resume Last Reading.</p>
            </details>
            <details><summary>An EPUB looks like gibberish</summary>
              <p>Use Import Book / Text in a build with EPUB support. EPUB is a ZIP-based ebook package and cannot be treated as a normal TXT file.</p>
            </details>
          </section>

          <p id="help-no-results" class="navigation-empty help-no-results" hidden>No Help topics matched your search.</p>
        </div>
      </div>
    </section>`;

  const input = app.querySelector('#help-search-input');
  const helpSections = Array.from(app.querySelectorAll('[data-help-section]'));
  const noResults = app.querySelector('#help-no-results');

  input?.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    helpSections.forEach((section) => {
      const haystack = `${section.textContent} ${section.dataset.helpKeywords || ''}`.toLowerCase();
      const matches = !query || haystack.includes(query);
      section.hidden = !matches;
      if (matches) visible += 1;
    });
    noResults.hidden = visible !== 0;
  });

  app.querySelectorAll('[data-help-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      app.querySelector(`#help-${CSS.escape(link.dataset.helpLink)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
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

window.setInterval(() => {
  // Only persist while the actual reader is mounted. Otherwise state may still
  // contain the previous large book while the user is in Bible Study/Library.
  if (state.words.length && app.querySelector('#reader')) persistReaderSession();
}, 10000);
let bookPageResizeTimer = null;
window.addEventListener('resize', () => {
  if (!state.bookPages) return;
  const anchorIndex = Math.max(0, Number(state.index) || 0);
  window.clearTimeout(bookPageResizeTimer);
  bookPageResizeTimer = window.setTimeout(
    () => scheduleBookPageReflow({ anchorIndex }),
    90
  );
});

// Fullscreen and pane changes can alter the reader width without producing a
// useful window resize event. Observe the actual reader box and rebuild the
// two-page geometry while preserving the same logical spread.
let observedBookReader = null;
const bookPageResizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver(() => {
      if (!state.bookPages) return;
      const anchorIndex = Number.isFinite(Number(pendingBookPageAnchorIndex))
        ? Number(pendingBookPageAnchorIndex)
        : Math.max(0, Number(state.index) || 0);
      window.clearTimeout(bookPageResizeTimer);
      bookPageResizeTimer = window.setTimeout(
        () => scheduleBookPageReflow({ anchorIndex }),
        70
      );
    })
  : null;
function observeBookPageReader() {
  const reader = app.querySelector('#reader');
  if (!bookPageResizeObserver || !reader || reader === observedBookReader) return;
  if (observedBookReader) bookPageResizeObserver.unobserve(observedBookReader);
  observedBookReader = reader;
  bookPageResizeObserver.observe(reader);
}

window.addEventListener('pagehide', () => {
  if (app.querySelector('#reader')) persistReaderSession({ immediate: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && app.querySelector('#reader')) {
    persistReaderSession({ immediate: true });
  }
});

// v5.16: startup stays lightweight. The last book is restored only after an explicit Resume action.
renderHome();

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
