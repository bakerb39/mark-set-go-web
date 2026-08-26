'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const serverPath = path.join(__dirname, 'server.js');
const original = fs.readFileSync(serverPath, 'utf8');
let server = original;
let changes = 0;

function replaceOnce(before, after, label) {
  if (server.includes(after)) return;
  if (!server.includes(before)) {
    throw new Error(`Topic Feed performance patch could not find: ${label}`);
  }
  server = server.replace(before, after);
  changes += 1;
}

const helperMarker = `async function fetchTopicFeedEdition(topic, requestedSources) {`;
const helper = `// Topic Feed refresh performance guard.
// A slow publisher must never hold every other source hostage.
function topicFeedWithin(promise, timeoutMs, fallback) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
      timer.unref?.();
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

`;

if (!server.includes('function topicFeedWithin(')) {
  if (!server.includes(helperMarker)) throw new Error('Topic Feed edition helper marker was not found.');
  server = server.replace(helperMarker, helper + helperMarker);
  changes += 1;
}

// Website feed discovery used to try up to 12 conventional feed URLs one by one.
// Probe a bounded set in parallel and return as soon as one works.
replaceOnce(
`  for (const feedUrl of candidates.slice(0, 12)) {
    try {
      const items = await fetchFeedItems({ feedUrl });
      if (items.length) return { feedUrl, items };
    } catch (_) {}
  }

  return null;`,
`  const probeUrls = candidates.slice(0, 8);
  if (probeUrls.length) {
    try {
      return await Promise.any(probeUrls.map(async (feedUrl) => {
        const items = await fetchFeedItems({ feedUrl });
        if (!items.length) throw new Error('No feed items.');
        return { feedUrl, items };
      }));
    } catch (_) {}
  }

  return null;`,
'parallel publisher feed probing'
);

// Publisher-page fallback was allowed to crawl six listing pages serially.
// Two likely pages is enough for a fallback because Google News is next.
replaceOnce(
`  for (const pageUrl of pageCandidates.slice(0, 6)) {`,
`  for (const pageUrl of pageCandidates.slice(0, 2)) {`,
'publisher page scan limit'
);

// Process up to four topic sources concurrently rather than waiting for source
// 1 to completely finish before source 2 even begins.
replaceOnce(
`  const articles = [];
  const sourceResults = [];
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const rawSource = sources[sourceIndex] || {};`,
`  const articles = [];
  const sourceResults = [];
  let nextSourceIndex = 0;

  async function fetchNextTopicSource() {
    while (true) {
      const sourceIndex = nextSourceIndex++;
      if (sourceIndex >= sources.length) return;
      const rawSource = sources[sourceIndex] || {};`,
'bounded source worker pool opening'
);

replaceOnce(
`    } catch (error) {
      sourceResults.push({ id:sourceClientId, name, url:rawUrl, ok:false, count:0, error:error?.message || 'The source could not be refreshed.' });
    }
  }
  const seen = new Set();`,
`    } catch (error) {
      sourceResults.push({ id:sourceClientId, name, url:rawUrl, ok:false, count:0, error:error?.message || 'The source could not be refreshed.' });
    }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(4, sources.length) },
      () => fetchNextTopicSource()
    )
  );

  const seen = new Set();`,
'bounded source worker pool closing'
);

// Hard time budgets for each stage. A source with broken feed endpoints still
// gets a publisher-headline attempt and then a Google News fallback.
replaceOnce(
`        const discoveredFeed = await discoverPublisherFeed(parsed.toString());`,
`        const discoveredFeed = await topicFeedWithin(
          discoverPublisherFeed(parsed.toString()).catch(() => null),
          5500,
          null
        );`,
'feed discovery timeout'
);

replaceOnce(
`          const publisherItems = await discoverPublisherPageArticles(parsed.toString(), cleanTopic);`,
`          const publisherItems = await topicFeedWithin(
            discoverPublisherPageArticles(parsed.toString(), cleanTopic).catch(() => []),
            4000,
            []
          );`,
'publisher headline timeout'
);

replaceOnce(
`            items = await fetchFeedItems({ feedUrl });
            mode = 'google-news-fallback';`,
`            items = await topicFeedWithin(
              fetchFeedItems({ feedUrl }).catch(() => []),
              5500,
              []
            );
            mode = 'google-news-fallback';`,
'Google News fallback timeout'
);

replaceOnce(
`      } else {
        items = await fetchFeedItems({ feedUrl });
      }`,
`      } else {
        items = await topicFeedWithin(
          fetchFeedItems({ feedUrl }).catch(() => []),
          7000,
          []
        );
      }`,
'direct RSS timeout'
);

if (!changes) {
  console.log('topic feeds: performance patch already installed');
  process.exit(0);
}

fs.writeFileSync(serverPath, server, 'utf8');

const check = spawnSync(process.execPath, ['--check', serverPath], {
  encoding:'utf8'
});

if (check.status !== 0) {
  fs.writeFileSync(serverPath, original, 'utf8');
  process.stderr.write(check.stderr || 'server.js syntax validation failed\n');
  throw new Error('Topic Feed performance patch was rolled back because server.js did not validate.');
}

console.log(`topic feeds: performance patch installed (${changes} change${changes === 1 ? '' : 's'})`);
