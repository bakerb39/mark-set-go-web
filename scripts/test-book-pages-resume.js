'use strict';

const assert = require('node:assert/strict');

function oldExactGroupLookup(groups, savedIndex) {
  return groups.find((group) => group.start === savedIndex) || null;
}

function rangeAwareGroupLookup(groups, savedIndex) {
  return groups.find((group) => group.start <= savedIndex && group.end > savedIndex) || null;
}

function spreadForGroup(group, groupsPerSpread = 4) {
  return Math.floor(group.ordinal / groupsPerSpread);
}

const groups = Array.from({ length: 20 }, (_, ordinal) => ({
  ordinal,
  start: ordinal * 3,
  end: ordinal * 3 + 3
}));

// Saved word 58 is inside group 57–59, not at its start.
const savedIndex = 58;
assert.equal(oldExactGroupLookup(groups, savedIndex), null,
  'The old exact-start lookup should reproduce the Book Pages resume failure.');
const containing = rangeAwareGroupLookup(groups, savedIndex);
assert.deepEqual(containing, { ordinal: 19, start: 57, end: 60 });
assert.equal(spreadForGroup(containing), 4,
  'The range-aware lookup should resolve a later spread rather than spread 0.');

// Exact group-start positions continue to work.
const exactIndex = 57;
assert.equal(oldExactGroupLookup(groups, exactIndex)?.start, exactIndex);
assert.equal(rangeAwareGroupLookup(groups, exactIndex)?.start, exactIndex);

// Single-word groups continue to work.
const singleWordGroups = Array.from({ length: 10 }, (_, ordinal) => ({
  ordinal,
  start: ordinal,
  end: ordinal + 1
}));
assert.equal(rangeAwareGroupLookup(singleWordGroups, 7)?.start, 7);

console.log('Book Pages resume scenarios passed: inside-group, exact-start, and single-word.');
