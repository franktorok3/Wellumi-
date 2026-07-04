const assert = require('assert');
const { getEvergreenForTopic } = require('../src/content/evergreenGuidance');
const { REQUIRED_BASE_TOPIC_IDS } = require('../src/content/baseFeedTopics');
const { buildFactualFallbackStory } = require('../src/services/storyGenerator');
const { acceptsStoryForDisplay, containsFiller, isSpecificTitle, isUsefulDeck } = require('../src/content/feedQuality');
const {
  evaluateSafetyEligibility,
  buildSafetyStoryTitle,
} = require('../src/content/safetyRecall');
const { applyFeedMix } = require('../src/content/storyRanking');
const { formatNutritionEntries } = require('../src/utils/formatNutrition');
const { hasOpenAIConfig } = require('../src/config');

const sabraNutriments = {
  per_100g: {
    energy_kcal_100g: 255.555555,
    'energy-kcal_100g': 255.555555,
    fat_100g: 16.6666666666667,
    'saturated-fat_100g': 2.38,
    carbohydrates_100g: 20,
    sugars_100g: 0.5,
    fiber_100g: 6.67,
    proteins_100g: 6.67,
    sodium_100g: 0.43,
    salt_100g: 1.08,
    'nova-group_100g': 3,
    'nova-group': 3,
    nutriscore_grade: 'c',
  },
};

const deerParkNutriments = {
  per_100g: {
    energy_kcal_100g: 0,
    fat_100g: 0,
    'nova-group': 1,
    sodium_100g: 0.001,
  },
};

const staleSabraRecall = {
  provider: 'openfda_food',
  source_type: 'food_recall',
  external_id: 'F-1234',
  title: 'Undeclared allergen',
  summary: 'Product: Sabra Classic Hummus · Reason: undeclared sesame · Status: Terminated',
  published_at: '2024-12-01',
  source_url: 'https://api.fda.gov/food/enforcement.json',
  raw_payload: {
    status: 'Terminated',
    product_description: 'Sabra Classic Hummus',
    reason_for_recall: 'Undeclared sesame',
    recalling_firm: 'Sabra',
    recall_initiation_date: '20241201',
  },
};

const sabraProfile = {
  brand: 'Sabra',
  productName: 'Sabra Classic Hummus',
  productCategory: 'packaged_food',
};

const fallback = buildFactualFallbackStory({
  sourceRecords: getEvergreenForTopic('hydration-habits'),
  storyCategory: 'everyday_wellness',
  topic: { id: 'hydration-habits' },
  fallbackReason: 'test_fallback',
});

assert.strictEqual(fallback.generation_mode, 'fallback');
assert.ok(!fallback.sections.everyday_explanation);
assert.ok(!containsFiller(fallback.deck));
assert.ok(Object.keys(fallback.sections).length <= 5);

const staleSafety = evaluateSafetyEligibility(staleSabraRecall, sabraProfile);
assert.strictEqual(staleSafety.displayEligible, false, 'stale terminated recall should be suppressed');

const brandOnlyHistorical = evaluateSafetyEligibility(
  {
    ...staleSabraRecall,
    raw_payload: {
      ...staleSabraRecall.raw_payload,
      status: 'Ongoing',
      product_description: 'Sabra TZatziki Dip',
    },
  },
  sabraProfile
);
assert.strictEqual(brandOnlyHistorical.matchType, 'brand_only');
const brandTitle = buildSafetyStoryTitle({
  matchType: 'brand_only',
  profile: sabraProfile,
  record: brandOnlyHistorical.normalized,
  historical: true,
});
assert.match(brandTitle, /older Sabra recall/i);
assert.ok(!/worth knowing about/i.test(brandTitle));

const sabraNutrition = formatNutritionEntries(sabraNutriments);
assert.ok(sabraNutrition.entries.find((entry) => entry.key === 'energy'));
assert.ok(sabraNutrition.entries.find((entry) => entry.key === 'fat'));
assert.strictEqual(sabraNutrition.entries.filter((entry) => entry.key === 'fat').length, 1);
assert.strictEqual(sabraNutrition.entries.filter((entry) => entry.key === 'salt').length, 1);
assert.ok(!sabraNutrition.entries.some((entry) => /nova/i.test(entry.key)));

const deerParkNutrition = formatNutritionEntries(deerParkNutriments);
assert.strictEqual(deerParkNutrition.entries.length, 0, 'bottled water should hide empty/noise nutrition');

const evergreenTopics = REQUIRED_BASE_TOPIC_IDS.map((id) => getEvergreenForTopic(id)).filter((x) => x.length);
assert.ok(evergreenTopics.length >= 4, 'base evergreen topics should cover general feed');

const quality = acceptsStoryForDisplay({
  generated: fallback,
  sourceRecords: getEvergreenForTopic('hydration-habits'),
  storyCategory: 'everyday_wellness',
});
assert.ok(quality.accepted, `fallback evergreen story should be display eligible: ${quality.reason}`);

const mixed = applyFeedMix(
  [
    { is_personalized: true, rank_score: 90, story: { story_category: 'ingredient_spotlight', display_eligible: true } },
    { is_personalized: true, rank_score: 80, story: { story_category: 'everyday_wellness', display_eligible: true } },
    { is_personalized: false, rank_score: 70, story: { story_category: 'everyday_wellness', is_general: true, display_eligible: true } },
    { is_personalized: false, rank_score: 65, story: { story_category: 'medicine_cabinet', is_general: true, display_eligible: true } },
    { is_personalized: false, rank_score: 60, story: { story_category: 'claims_decoded', is_general: true, display_eligible: true } },
    { is_personalized: false, rank_score: 55, story: { story_category: 'product_trends', is_general: true, display_eligible: true } },
  ],
  { hasPersonalization: true }
);
assert.ok(mixed.filter((item) => !item.is_personalized).length >= 3, 'personalized feed should retain general stories');

const baseStories = REQUIRED_BASE_TOPIC_IDS.map((topicId) =>
  buildFactualFallbackStory({
    sourceRecords: getEvergreenForTopic(topicId),
    storyCategory: 'everyday_wellness',
    topic: { id: topicId },
    fallbackReason: 'verify_base_feed',
  })
);
assert.ok(baseStories.length >= 4, 'base feed should include at least four general stories');
for (const story of baseStories) {
  assert.ok(isSpecificTitle(story.title), `base story title should be specific: ${story.title}`);
  assert.ok(isUsefulDeck(story.deck), `base story deck should be useful: ${story.deck}`);
  assert.ok(!containsFiller(JSON.stringify(story.sections)), `base story should not contain filler: ${story.title}`);
}

const openAiFallback = buildFactualFallbackStory({
  sourceRecords: getEvergreenForTopic('hydration-habits'),
  storyCategory: 'everyday_wellness',
  topic: { id: 'hydration-habits' },
  fallbackReason: 'openai_http_error:429:rate_limit',
});
assert.strictEqual(openAiFallback.generation_mode, 'fallback');
assert.match(openAiFallback.fallback_reason, /openai_http_error|verify|test/);
assert.ok(typeof hasOpenAIConfig === 'function', 'OpenAI config detection should be available');

const exactMatchTitle = buildSafetyStoryTitle({
  matchType: 'exact_product',
  profile: sabraProfile,
  record: { recall_product_description: 'Sabra Classic Hummus', recall_initiation_date: '2025-03-01' },
  historical: false,
});
assert.match(exactMatchTitle, /recall notice involving/i);
assert.ok(!/worth knowing about/i.test(exactMatchTitle));

console.log('verify-feed-quality: all checks passed');
