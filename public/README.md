# Mark, Set, Go! — Topic Feeds Beta

This patch adds a first working Topic Feeds beta without modifying the protected Reader core.

## Included

- User-created topics
- Daily or weekly editions
- Normal website URLs
- Direct RSS / Atom feeds
- Cryptocurrency starter configuration
- Recommended vs All Articles
- Lightweight relevance/recency ranking
- Duplicate-headline suppression
- Per-article Read in Reader
- Original-source link
- Read state
- Automatic refresh on first open when the edition is stale
- Server-side public URL validation for custom sources

## How website URLs work

A normal website URL is treated as a source domain. The server builds a Google News RSS query for:

`<topic> site:<source-domain>`

This gives the beta user a practical way to follow a chosen website even if they do not know its RSS address.

If the user knows the publication's direct RSS/Atom URL, select **RSS / Atom** instead.

## Apply

From the root of `mark-set-go-web`:

```bash
unzip mark-set-go-topic-feeds-beta.zip -d /tmp/msg-topic-feeds
node /tmp/msg-topic-feeds/apply-topic-feeds.js
```

Then inspect:

```bash
git diff -- public/index.html server.js public/topic-feeds.js public/topic-feeds.css
```

Run the app normally and open:

**My Library → Topic Feeds**

## Current persistence

This beta stores topic definitions, articles, and read-state in browser `localStorage` under:

`markSetGoTopicFeedsV1`

That was intentional for the first isolated beta so it does not alter the account/database schema or cloud-library behavior.

A later iteration should move topic definitions and article/read state into PostgreSQL for cross-device use.

## Reader safety

The patch does **not** modify:

- `public/reader/*`
- ReaderEngine
- VirtualRenderer
- playback cursor
- viewport anchor
- pause/resume
- pagination

Article reading uses the existing `/api/fetch-text` endpoint and the existing public `MarkSetGoReadAnything.openDocument()` handoff.
