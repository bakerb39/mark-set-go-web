MARK, SET, GO! — TOPIC FEEDS V2.1 — REFRESH-DRIVEN EDITIONS

REPLACE / ADD:
  /server.js
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html
  /db/migrations/006_topic_feeds.sql
  /render.yaml

WHAT CHANGED FROM V2

The scheduled morning Cron Job has been removed for now. There is no paid Render
Cron service and no in-process background refresh timer.

REFRESH NOW DOES THE WHOLE JOB

When a signed-in reader presses “Refresh & download latest”:
  1. Every feed in the selected topic is fetched.
  2. The newest feed entries are merged and ranked.
  3. Article text is prepared server-side.
  4. Prepared articles are stored in PostgreSQL.
  5. The refreshed topic and article state sync across devices.

Saving a new or edited topic also triggers this refresh immediately, so a new
topic gets its first downloaded edition as soon as it is created.

RECOMMENDED FEEDS

Creating/editing a topic still shows optional recommended feeds in addition to
manual RSS/website sources.

DAILY START

The reader can still choose one feed as Daily start. Without a background
scheduler, Daily start opens the newest unread article from the MOST RECENT
DOWNLOADED edition. Pressing Refresh updates that edition to the newest news.

MY TOPICS IN THE READER

Topic Feed articles still replace the Reader Contents area with My Topics /
Feeds / recent downloaded articles. Normal books keep their normal Contents.

DATABASE / CROSS-DEVICE

PostgreSQL remains the source of truth for signed-in Topic Feeds. Existing local
Topic Feeds are still imported automatically when the cloud account is empty.

IMPORTANT LIMITATION

Without a cron/background worker, Mark, Set, Go! cannot fetch news while nobody
is using the app. That means there is no true pre-login morning download yet.
For this interim version, Refresh is intentionally the trigger that retrieves
and prepares the latest edition.

UNCHANGED / PROTECTED

This package does NOT replace app.js, read-anything.js, Reader engine files,
annotation/playback code, companion scripts, or Mark/Beth/Chad image assets.
