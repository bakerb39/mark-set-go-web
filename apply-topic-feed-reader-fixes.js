'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const topicFeedsPath = path.join(root, 'public', 'topic-feeds.js');
const indexPath = path.join(root, 'public', 'index.html');
const VERSION = '20260827-v2.5.8-header-overlap-and-extension-copy';
const MARKER = 'TOPIC_FEED_HEADER_OVERLAP_GUARD_V1';

function patchTopicFeeds() {
  const original = fs.readFileSync(topicFeedsPath, 'utf8');
  let source = original;
  let changes = 0;

  const oldGeometry = `      const headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
      // headerHeight now includes the opaque ceiling ABOVE the Reader text.
      // Exclude that ceiling padding from the in-document spacer so the article
      // stays at the same starting position.
      const contentHeaderHeight = Math.max(0, headerHeight - headerContentPadding);
      const requiredHeight = Math.max(fontSize * 2, contentHeaderHeight + fontSize);
      const previousHeight = Number.parseFloat(spacer.style.height) || 0;
      spacer.style.width = '100%';
      spacer.style.maxWidth = \`${headerWidth}px\`;

      if (Math.abs(requiredHeight - previousHeight) > 1) {
        spacer.style.height = \`${Math.ceil(requiredHeight)}px\`;
        scheduleTopicFeedStoryBookReflow();
      }
    });`;

  const newGeometry = `      const headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
      // ${MARKER}
      const contentHeaderHeight = Math.max(0, headerHeight - headerContentPadding);
      const predictedHeight = Math.max(fontSize * 2, contentHeaderHeight + fontSize);
      const previousHeight = Number.parseFloat(spacer.style.height) || 0;
      const requiredHeight = Math.max(previousHeight, predictedHeight);
      spacer.style.width = '100%';
      spacer.style.maxWidth = \`${headerWidth}px\`;

      if (Math.abs(requiredHeight - previousHeight) > 1) {
        spacer.style.height = \`${Math.ceil(requiredHeight)}px\`;
        scheduleTopicFeedStoryBookReflow();
      }

      window.requestAnimationFrame(() => {
        if (!reader.isConnected || !header.isConnected || !spacer.isConnected) return;

        const firstText = [...reader.children].find((node) =>
          node !== spacer && node.classList?.contains('reader-group')
        );
        if (!firstText) return;

        const headerRect = header.getBoundingClientRect();
        const textRect = firstText.getBoundingClientRect();
        const overlap = Math.max(0, headerRect.bottom - textRect.top);
        if (overlap <= 1) return;

        const liveHeight = Number.parseFloat(spacer.style.height) ||
          spacer.getBoundingClientRect().height || 0;
        const breathingGap = Math.max(8, fontSize * .65);
        const correctedHeight = Math.ceil(liveHeight + overlap + breathingGap);
        const lastCorrection = Number(spacer.dataset.topicFeedOverlapCorrection || 0);

        if (correctedHeight <= liveHeight + 1 || Math.abs(correctedHeight - lastCorrection) <= 1) return;

        spacer.dataset.topicFeedOverlapCorrection = String(correctedHeight);
        spacer.style.height = \`${correctedHeight}px\`;
        scheduleTopicFeedStoryBookReflow();
      });
    });`;

  if (source.includes(oldGeometry)) {
    source = source.replace(oldGeometry, newGeometry);
    changes += 1;
  } else if (!source.includes(MARKER)) {
    throw new Error('Topic Feed reader fix could not locate the current header reserve calculation.');
  }

  const oldCopy = `    notice.innerHTML = \`<br><br><strong>Want the full article?</strong>
      Click <strong>View original</strong> above, then use the
      <strong>Read with Mark</strong> bookmarklet to import the publisher page.
      You can find the bookmarklet in the
      <a href="#read-anything" data-topic-feed-open-read-anything>Read Anything section</a>.\`;`;

  const newCopy = `    notice.innerHTML = \`<br><br><strong>Want the full article?</strong>
      <strong>Recommended:</strong> use the <strong>Read with Mark Extension</strong>
      to automatically recover more publisher pages. Install or check it in the
      <a href="#read-anything" data-topic-feed-open-read-anything>Read Anything section</a>.
      If automatic recovery cannot retrieve this page, click <strong>View original</strong>
      above and use the <strong>Read with Mark Bookmarklet</strong> as the manual fallback.\`;`;

  if (source.includes(oldCopy)) {
    source = source.replace(oldCopy, newCopy);
    changes += 1;
  } else if (!source.includes('Read with Mark Extension</strong>')) {
    throw new Error('Topic Feed reader fix could not locate the current full-article fallback copy.');
  }

  if (source !== original) {
    fs.writeFileSync(topicFeedsPath, source, 'utf8');

    const check = spawnSync(process.execPath, ['--check', topicFeedsPath], {
      encoding:'utf8'
    });

    if (check.status !== 0) {
      fs.writeFileSync(topicFeedsPath, original, 'utf8');
      process.stderr.write(check.stderr || 'topic-feeds.js syntax validation failed\n');
      throw new Error('Topic Feed reader fix was rolled back because topic-feeds.js did not validate.');
    }

    console.log(`topic feed reader: installed ${changes} focused fix${changes === 1 ? '' : 'es'}`);
  } else {
    console.log('topic feed reader: focused fixes already installed');
  }
}

function bumpTopicFeedsAsset() {
  let index = fs.readFileSync(indexPath, 'utf8');
  const pattern = /\/topic-feeds\.js(?:\?v=[^"'\\s>]+)?/g;

  if (!pattern.test(index)) {
    throw new Error('Topic Feed reader fix could not locate /topic-feeds.js in public/index.html.');
  }

  pattern.lastIndex = 0;
  const next = index.replace(pattern, `/topic-feeds.js?v=${VERSION}`);
  if (next !== index) {
    fs.writeFileSync(indexPath, next, 'utf8');
    console.log(`topic feed reader: browser asset -> ${VERSION}`);
  } else {
    console.log(`topic feed reader: browser asset already ${VERSION}`);
  }
}

patchTopicFeeds();
bumpTopicFeedsAsset();
