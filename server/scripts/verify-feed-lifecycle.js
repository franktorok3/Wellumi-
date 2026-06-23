const assert = require('assert');
const { buildStoryKey } = require('../src/content/storyKey');
const { containsFiller } = require('../src/content/feedQuality');
const { evaluateSafetyEligibility } = require('../src/content/safetyRecall');
const { createRefreshToken } = require('../src/services/feedLifecycle');
const { applyFeedMix } = require('../src/content/storyRanking');

const sourceA = { id: 'src-1', provider: 'cdc', external_id: 'a' };
const sourceB = { id: 'src-2', provider: 'fda', external_id: 'b' };

const key1 = buildStoryKey({
  isGeneral: true,
  baseTopicId: 'hydration-habits',
  sourceRecords: [sourceA],
  storyCategory: 'everyday_wellness',
});
const key2 = buildStoryKey({
  isGeneral: true,
  baseTopicId: 'hydration-habits',
  sourceRecords: [sourceA],
  storyCategory: 'everyday_wellness',
});
assert.strictEqual(key1, key2, 'story keys must be deterministic');

const key3 = buildStoryKey({
  isGeneral: true,
  baseTopicId: 'hydration-habits',
  sourceRecords: [sourceA, sourceB],
  storyCategory: 'everyday_wellness',
});
assert.notStrictEqual(key1, key3, 'different source sets must produce different keys');

assert.ok(containsFiller('products like this'));
assert.ok(!containsFiller('Hydration advice changes with heat, exercise, and diet'));

const staleRecall = {
  provider: 'openfda_food',
  raw_payload: {
    status: 'Terminated',
    product_description: 'Sabra Classic Hummus',
    reason_for_recall: 'Undeclared sesame',
    recall_initiation_date: '20241201',
  },
  published_at: '2024-12-01',
};
const stale = evaluateSafetyEligibility(staleRecall, {
  brand: 'Sabra',
  productName: 'Sabra Classic Hummus',
});
assert.strictEqual(stale.displayEligible, false, 'stale terminated recall suppressed');

assert.ok(createRefreshToken());

const mixed = applyFeedMix(
  [
    { is_personalized: false, rank_score: 80, story: { story_category: 'everyday_wellness', is_general: true, display_eligible: true, is_active: true } },
    { is_personalized: false, rank_score: 70, story: { story_category: 'medicine_cabinet', is_general: true, display_eligible: true, is_active: true } },
    { is_personalized: true, rank_score: 90, story: { story_category: 'ingredient_spotlight', display_eligible: true, is_active: true } },
  ],
  { hasPersonalization: true }
);
assert.ok(mixed.length >= 2);

console.log('verify-feed-lifecycle: all checks passed');
