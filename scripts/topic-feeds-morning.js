'use strict';

const { refreshDueTopicFeeds } = require('../server');
const { closeDatabase } = require('../db');

(async () => {
  try {
    const result = await refreshDueTopicFeeds({ userLimit: 1000 });
    console.log('Topic Feed morning refresh complete:', JSON.stringify(result));
  } catch (error) {
    console.error('Topic Feed morning refresh failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
  }
})();
