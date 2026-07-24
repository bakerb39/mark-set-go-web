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
