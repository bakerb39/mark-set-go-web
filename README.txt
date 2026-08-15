MARK, SET, GO! — TOPIC FEEDS V2
Cloud sync + recommended feeds + prepared morning editions + My Topics Reader navigation

REPLACE / ADD THESE FILES

  /server.js
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html
  /db/migrations/006_topic_feeds.sql
  /scripts/topic-feeds-morning.js
  /render.yaml


WHAT THIS VERSION ADDS

1. RECOMMENDED FEEDS WHEN CREATING A TOPIC
   - Enter a topic name and Mark, Set, Go! immediately offers relevant feed
     recommendations.
   - Recommendations are optional.
   - The reader can still add any website or RSS/Atom feed manually.
   - Recommended feeds and manual feeds live together in the same topic.

2. POSTGRESQL / CROSS-DEVICE TOPIC FEEDS
   - Signed-in readers use PostgreSQL as the Topic Feeds source of truth.
   - Existing local-browser Topic Feeds are imported automatically the first
     time the signed-in cloud account is empty.
   - A local cache is still kept so the UI remains responsive.
   - Topic names, sources, article state, daily-start preference, timezone, and
     morning-download preference follow the account to another device.

3. MORNING ARTICLE PREPARATION
   - A server-side job refreshes due topics and prepares article text before the
     reader opens the app.
   - The reader chooses a local morning hour (4–8 AM; default 5 AM).
   - The included Render cron runs hourly. The server checks each account's IANA
     timezone and only refreshes when that reader's local morning hour has
     arrived.
   - Up to 60 current articles per topic are prepared into PostgreSQL, with
     recommended/current items prioritized.
   - Opening a prepared article therefore uses database text instead of waiting
     for the publisher page to be fetched again.

4. DAILY START FEED
   - Each feed can be marked "Daily start."
   - One feed can be the daily start source for the account.
   - On the first signed-in app visit of the local day, the newest unread
     prepared article from that feed opens directly in the Reader.
   - If all current articles are read, the newest article is used.
   - The database records the daily open date so a second device does not
     automatically open it again that same day.

5. "MY TOPICS" REPLACES CONTENTS FOR TOPIC-FEED ARTICLES
   - While a Topic Feed article is active, the Reader's Contents area becomes
     "My Topics."
   - It shows:
       Topic
         Feed
           recent downloaded articles
   - Normal books keep their normal Contents view.
   - This is implemented additively in topic-feeds.js; app.js and the protected
     Reader engine are NOT replaced.

6. READER-SAFE / COMPANION-SAFE
   This package does NOT replace:
   - /public/app.js
   - /public/read-anything.js
   - companion scripts
   - Mark/Beth/Chad images
   - Reader annotation/drawing/workspace code
   - Reader playback/double-click code


DATABASE

The server creates the two Topic Feed tables defensively at runtime, and
/db/migrations/006_topic_feeds.sql is included as the formal migration.

Tables:
  topic_feed_accounts
  topic_feed_prepared_articles


RENDER MORNING JOB — IMPORTANT

True "before login" preparation needs a scheduler that runs even when the web
service is idle.

The included render.yaml adds:

  mark-set-go-topic-feeds-morning
  plan: starter
  schedule: 0 * * * *
  command: node scripts/topic-feeds-morning.js

Render does not offer its free instance type for Cron Jobs, so this is a paid
Render service. It is declared as Starter explicitly rather than letting Render
choose the default implicitly.

The cron process uses the SAME PostgreSQL database as the web app.

When the Blueprint creates the cron service, set its DATABASE_URL to the same
DATABASE_URL used by the Mark, Set, Go! web service.

If your Render services are not managed from render.yaml, create the equivalent
Cron Job in the Render dashboard instead:
  Schedule: 0 * * * *
  Command:  node scripts/topic-feeds-morning.js
  DATABASE_URL: same value as the web app

The hourly schedule is intentional: individual readers can be in different
timezones. The script checks each reader's local timezone/morning setting and
only refreshes a reader once per local day.


DEPLOYMENT TEST

After deployment:

1. Sign in.
2. Open Topic Feeds.
3. Create a topic such as "Artificial Intelligence."
4. Confirm "Recommended feeds for this topic" appears.
5. Add one recommendation and/or your own feed.
6. Mark one source "Daily start."
7. Save the topic and refresh it once.
8. Confirm articles show "Downloaded" after server preparation.
9. Open an article and confirm Reader navigation says "My Topics."
10. Sign in on another device/browser and confirm the same topics/feeds load.

Existing Topic Feeds stored in the first browser should migrate automatically
when the signed-in database has no Topic Feed setup yet.
