# Mark, Set, Go! — Web Edition

A deployable Node.js/browser version of the original Python reading accelerator.

## Features

- 250-word WPM tests
- Flash reading mode
- Marquee mode with automatic scrolling
- Highlight mode that follows selected word groups and scrolls near 75% of the reading pane
- Adjustable WPM, words per step, font size, and light/dark reading themes
- Local text-file upload
- Server-side import of public web pages
- News and weather sources
- Optional passage translation through Azure AI Translator
- Clickable translated words with English meanings in a side panel

## Requirements

- Node.js 20 or newer
- npm
- An Azure AI Translator resource only if translation is enabled

## Run locally

From the project directory:

```powershell
npm install
npm start
```

Open:

```text
http://localhost:3000
```

The reading features work without Azure configuration. Translation requires the environment variables below.

## Configure translation

Create an Azure AI Translator resource, then provide these environment variables to the Node process:

```text
AZURE_TRANSLATOR_KEY=your-key
AZURE_TRANSLATOR_REGION=your-resource-region
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
```

For a temporary PowerShell session:

```powershell
$env:AZURE_TRANSLATOR_KEY="your-key"
$env:AZURE_TRANSLATOR_REGION="eastus"
$env:AZURE_TRANSLATOR_ENDPOINT="https://api.cognitive.microsofttranslator.com"
npm start
```

Do not put a real API key in `public/app.js`, GitHub, or any browser-delivered file. On Render, add these values under the web service's **Environment** settings.

## Add the complete books

Replace the placeholder text files under `public/texts/` while retaining these names:

```text
public/texts/gg.txt
public/texts/hb.txt
public/texts/tt.txt
public/texts/pp.txt
```

## Deploy to Render

1. Put this project in a GitHub repository.
2. In Render, create a new **Web Service** from the repository.
3. Use:

```text
Build command: npm install
Start command: npm start
```

4. Add the Azure environment variables in Render if translation should be enabled.
5. Deploy.

The server reads the hosting platform's `PORT` automatically.

## Translation behavior

The passage is translated in chunks on the server and returned to the browser. Clicking a translated word sends only that word or short token to the server for an English translation. Word lookups are cached in the browser for the current passage.

Single-word translations are helpful references, but their exact meaning can differ according to sentence context.

## Security notes

- Azure credentials remain server-side.
- URL imports reject local, private, and non-HTTP addresses.
- Imported pages are size-limited and stripped of scripts, forms, navigation, and other non-reading elements.
- Uploaded text remains in the browser unless the user chooses to translate it.


## Digital Sign mode

Select **Digital Sign** to move each selected word group horizontally from right to left across the reading pane. The WPM and Words at a time controls determine the phrase cadence. Pause and Resume preserve the phrase position.

## Bionic text option

The **Bionic text** checkbox bolds approximately the first 45% of each word. It works with Flash, Marquee, Highlight, Digital Sign, translated passages, and uploaded text. The option is off by default.


## Two-column and Auto Scroll modes

- **Two Columns** displays the complete passage in two side-by-side columns for self-paced reading. On narrow screens it changes to a single column. WPM and Words at a time are disabled in this mode.
- **Auto Scroll** keeps the passage visible and scrolls it vertically at a rate estimated from the selected WPM. Pause preserves the current location, and Reset returns to the beginning. Large documents continue loading in sections as the reader approaches them.

## Fullscreen options menu

In text-viewer fullscreen mode, use **Options** to open a compact menu containing reading mode, WPM, words shown, font, text size, theme, Bionic text, translation, and playback controls. Select **×** to hide every floating fullscreen control. Move the pointer into the upper-right corner or press **O** to restore the controls. Press **Esc** to leave fullscreen.


## Meaningful Chunks

Enable **Meaningful chunks** in Reading settings to group text using punctuation and common phrase boundaries. In supported modes, **Words shown** becomes the maximum chunk size rather than an exact fixed count. The toggle applies to Highlight, Bold Focus, Smooth Glide, Pointing Guide, Marquee, and Flash.


## Project Gutenberg Library

The **Read → Project Gutenberg Library** option searches the Gutendex catalog and loads a selected Project Gutenberg plain-text edition through the Node server. Search results are paginated, may be filtered by language, and are downloaded only after the user clicks **Load into Reader**. The server removes common Project Gutenberg header and footer boilerplate before sending the text to the browser.

Gutendex is an independent metadata service. For a long-lived or high-traffic deployment, consider self-hosting Gutendex or using Project Gutenberg's machine-readable catalog and mirrors rather than placing heavy automated traffic on the main Gutenberg site.


## Contents and bookmarks

The reader detects common chapter headings and displays them in a left-side Contents pane. Selecting a heading jumps to that chapter. The Bookmark button saves the current document and reading position in browser storage. A small same-site cookie remembers the bookmark identifiers; the document text and bookmark details are kept in localStorage because browser cookies are too small for books. Bookmarks are private to that browser and device.


## Click-to-resume reading

In full-text guided modes, click any rendered word to move the reading position to that word's current phrase group. If the reader was already running, it continues from the new position. If it was paused, the selected phrase is shown and remains paused until resumed. Clicking empty space in the viewer continues to toggle pause and resume.


## Additional online libraries

- **Great Books Library** is a curated public-domain reading list. It searches Project Gutenberg for an available English plain-text edition when a reader selects a work. It does not reproduce Britannica's copyrighted anthology or editorial content.
- **News, Sports & Interests** displays RSS/Atom headlines and summaries from listed sources and topical feeds. Full article import is user-triggered and may fail when a publisher blocks automated access or requires a subscription.
- Always preserve source links and respect publisher terms, copyrights, and public-domain rules in the reader's country.


## Music

The top-level Music menu provides reading-mood playlists, a persistent YouTube player, custom YouTube video or playlist URLs, and a best-effort current Hot 100 listing. Music keeps playing while the user returns to the reader.


## Facing book pages
Enable **Book pages** under Display to flow supported guided modes across two facing pages. Highlight, Bold Focus, Smooth Glide, Pointing Guide, Marquee, Bionic text, meaningful chunks, click-to-resume, bookmarks, contents links, themes, fonts, and fullscreen remain available. Use the page arrows or horizontal scrolling to move between spreads. On narrow screens the layout changes to one page.


### Book Pages navigation fix
Book Pages now creates as many horizontal page columns as the document requires. The arrows advance one two-page spread at a time, and large documents render additional pages as needed.

## Dictionary and saved definitions

Right-click any rendered word and choose **Look up word** to show an English definition in the right pane. Choose **Save definition** to preserve the definition in browser storage, highlight that word occurrence, and add it under **Saved definitions** beneath Bookmarks. Saved definitions are local to the browser and can be opened to return to the saved word or removed individually. Dictionary lookup uses the free Dictionary API through the Node server; no API key is required.


## Notes, reading list, and book music

- Right-click a word and choose **Add note** to save a position-aware note in the browser.
- Use **Reading List** to organize books as Want to Read, Currently Reading, or Finished.
- Gutenberg results, Great Books entries, and reading-list items now include optional YouTube searches for an adaptation score and a reading-mood soundtrack. These are suggestions only; users choose what to play, and availability depends on YouTube and regional restrictions.


## Reading Progress Dashboard
The My Library menu includes a private, browser-based dashboard for words read, time, WPM, streaks, document completion, and recent sessions.

## Vocabulary Builder
Saved dictionary definitions become review cards. Rate a word Again, Hard, Good, or Easy to schedule future reviews using a lightweight spaced-repetition system.


## Automatic document formatting

Imported books and documents are scanned for structural boundaries such as parts, chapters, sections, contents, appendices, notes, bibliographies, glossaries, and indexes. Detected headings receive book-like spacing and typography and populate the navigation pane when appropriate.

## Notes

Right-click a word and choose **Add note**. Notes now open in a modal editor, can be edited or deleted, remain associated with the document and word position, and appear in the Notes section of the left navigation pane. Notes are stored in browser local storage; a small cookie keeps lightweight note references.

## Reliability update

- Project Gutenberg catalog requests are cached, allowed more time to respond, and retried once when Gutendex is temporarily slow.
- The Gutenberg catalog screen now offers a Try again button after a failed request.
- Retired Lofi video IDs were replaced, and every built-in music card now includes Open on YouTube and Find alternative links in case a video is unavailable or blocked from embedding.

## Reader tools and local weather

- **Upload Text** and **Choose URL** are now under the persistent **Reader** menu rather than the Read library menu.
- **Local Weather** accepts a five-digit U.S. ZIP code and stores it in a SameSite browser cookie for one year.
- Weather is returned as structured daily sections, with separate daytime/nighttime periods, temperature, precipitation chance, wind, and detailed forecast.
- The formatted forecast can be loaded into the reading viewer with **Load forecast into Reader**.


## Illustrated Reading

The Display settings include an **Illustrations** option:

- **Off** — no images are inserted.
- **Chapter openings** — searches for an open-license image at detected chapter, part, prologue, introduction, epilogue, and appendix headings.
- **Automatic** — also adds images at section headings and occasional natural points in long text.

Images are searched dynamically through the Wikimedia Commons API. Each image includes creator/license information and **Replace**, **Hide**, and **Source** controls. No API key is required. Search results can be imperfect, so readers remain in control of what appears.

## Reader music recommendation

Every loaded book, article, upload, or URL now shows a **Play recommended music** button beside the reader title. The app chooses an embeddable mood playlist from the existing Music Library using the document title and a small text sample, then opens it in the persistent YouTube player. Related adaptation-score and reading-mood searches remain available beneath the title when a more specific soundtrack is desired.

## Reader music choices and Grokipedia

The reader title now provides separate **Adaptation score** and **Reading mood** controls. Adaptation score opens a title-specific YouTube search, while Reading mood launches the closest matching option in the built-in player. A Grokipedia search link for the loaded title appears below the title.

Illustrations now retry alternate Wikimedia Commons results when an image fails to load and remove failed placeholders automatically so blank white spaces do not remain in the text.


## Book-specific music playback

The reader's **Adaptation score** and **Reading mood** buttons now both load inside the persistent YouTube player. Each button creates a YouTube embedded search playlist rather than opening a separate browser tab. Reading-mood searches use a title-specific profile when available and otherwise infer atmosphere from the loaded text (for example mystery, Regency romance, maritime adventure, ancient epic, gothic, nature, war, or science fiction).


- Illustrated Reading now scores Wikimedia results against the current chapter heading and nearby story context, reducing generic book-cover matches and favoring chapter-specific scenes, places, maps, portraits, and illustrations.


## Session recovery and source reliability

- The active reader document and all reading controls are saved in IndexedDB and restored when the user returns to the site. This includes reading position, WPM, mode, words shown, font, size, theme, Bionic text, meaningful chunks, book pages, and illustration mode.
- Reading List titles are checked against Project Gutenberg. Matching titles open directly in the reader; unmatched titles provide searches for Standard Ebooks, Internet Archive, and Google Books free editions.
- Book-specific music searches now resolve to actual YouTube video IDs. If a result is unavailable or blocked, use the circular-arrow button in the player to try the next search result.
- Illustration matching now uses chapter headings, nearby context, repeated terms, and proper nouns, while avoiding book covers and unrelated promotional images.


## Illustrated book ZIP upload

Use **Reader → Upload Illustrated Book** to import a ZIP containing `manifest.json`, a text file, and mapped PNG/JPG/WEBP/GIF illustrations. Each manifest illustration uses a chapter `heading`, image path, and optional caption. Uploaded illustrations are inserted beneath matching detected chapter headings and saved with the persistent reader session in IndexedDB.

Example manifest:

```json
{
  "title": "Frankenstein",
  "author": "Mary Shelley",
  "textFile": "book.txt",
  "illustrations": [
    { "heading": "Chapter 1", "image": "images/chapter-01.png", "caption": "Victor's childhood near Geneva." }
  ]
}
```


## Built-in Frankenstein illustrated demo

The **Read** menu includes **Frankenstein Illustrated Demo**, a permanent first-five-chapter showcase bundled under `public/demos/frankenstein/`. It loads through the normal reader, supports the existing illustration display controls, music recommendations, notes, bookmarks, and persistent reading-session recovery.


## Persistent Project Gutenberg cache

The server now checks a local disk cache before downloading a Gutenberg title. The first successful download is cleaned and saved as `<book-id>.txt` plus metadata, and future users receive the local cached copy.

For Render, attach a persistent disk mounted at `/var/data` and add these environment variables:

```text
GUTENBERG_CACHE_DIR=/var/data/gutenberg
GUTENBERG_MIRROR_BASES=https://gutenberg.pglaf.org,https://mirrors.xmission.com/gutenberg
```

Without a persistent disk, caching still works until Render replaces or restarts the instance, but the files will not be durable across deployments.


## Gutenberg mirror loading

Books load from configured Gutenberg mirrors and are cached only in memory for the current Render instance. No persistent disk is required.
