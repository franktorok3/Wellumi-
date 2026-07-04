const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isGenericTerm, containsIndustrialContext } = require('../src/content/genericTerms');
const {
  classifyProduct,
  buildUserInterestModel,
  buildPubMedConcepts,
} = require('../src/content/productInterestClassifier');
const { filterRelevantSources, scorePubMedRecord, scoreSourceRecord } = require('../src/content/sourceRelevance');
const {
  computeTriggerScore,
  buildPersonalizationReason,
  TRIGGER_SCORE_THRESHOLD,
} = require('../src/content/triggerScore');
const { rankStories, computeRankScore } = require('../src/content/storyRanking');
const { getBaseTopicsForMix } = require('../src/content/baseFeedTopics');
const { buildFactualFallbackStory } = require('../src/services/storyGenerator');
const { getEvergreenForTopic } = require('../src/content/evergreenGuidance');
const { evaluateSafetyEligibility } = require('../src/content/safetyRecall');
const { STORY_PROMPT_VERSION } = require('../src/services/wellnessFeedWorkflow');

const deerPark = {
  name: 'Deer Park Bottled Water',
  brand: 'Deer Park',
  ingredients_text: 'Spring water',
};

const sabra = {
  name: 'Sabra Classic Hummus',
  brand: 'Sabra',
  ingredients_text: 'Cooked chickpeas, tahini, soybean oil, garlic, salt, citric acid',
};

const magnesium = {
  name: 'Magnesium Glycinate 400mg',
  brand: 'Nature Made',
  ingredients_text: 'Magnesium glycinate, cellulose, stearic acid',
};

const ibuprofen = {
  name: 'Ibuprofen Tablets 200mg',
  brand: 'Advil',
  ingredients_text: 'Ibuprofen 200mg, inactive ingredients',
};

const industrialWaterPaper = {
  provider: 'pubmed',
  source_type: 'research_update',
  external_id: 'industrial-1',
  title: 'Safety of Nanoclay/Spring Water Hydrogels',
  summary: 'Materials science study on hydrogel polymers in laboratory settings.',
  published_at: '2024-01-15',
  source_url: 'https://pubmed.ncbi.nlm.nih.gov/industrial-1/',
};

const hydrationReview = {
  provider: 'pubmed',
  source_type: 'research_update',
  external_id: 'hydration-1',
  title: 'Systematic review of daily hydration habits',
  summary: 'Review of fluid intake habits and consumer wellness routines.',
  published_at: '2025-02-01',
  source_url: 'https://pubmed.ncbi.nlm.nih.gov/hydration-1/',
  topics: ['daily hydration habits'],
};

const deerParkRecall = {
  provider: 'openfda_food',
  source_type: 'food_recall',
  external_id: 'recall-1',
  title: 'Deer Park bottled water recalled due to labeling issue',
  summary: 'Product: Deer Park bottled water · Reason: mislabeled product description · Status: Ongoing',
  published_at: '20250601',
  source_url: 'https://api.fda.gov/food/enforcement.json',
  safety_relevance: 1,
  consumer_relevance: 0.95,
  raw_payload: {
    status: 'Ongoing',
    product_description: 'Deer Park bottled water',
    reason_for_recall: 'mislabeled product description',
    recalling_firm: 'Deer Park',
    recall_initiation_date: '20250601',
  },
};

const sabraNutriments = {
  per_100g: {
    energy_kcal_100g: 255.555555,
    fat_100g: 16.6666666666667,
    'saturated-fat_100g': 2.38,
    carbohydrates_100g: 20,
    sugars_100g: 0.5,
    fiber_100g: 6.67,
    proteins_100g: 6.67,
    salt_100g: 1.08,
    'nova-group_100g': 3,
  },
};

function demoStory({ profile, sources, storyCategory, isGeneral, isSaved = false, topic = null }) {
  const enriched = { ...profile, isSaved };
  const filtered = filterRelevantSources(sources, {
    minimumSourceQuality: 0.45,
    excludedConcepts: ['hydrogel', 'nanoclay', 'polycyclic aromatic'],
  });
  const scoredFiltered = filtered.map((record) => {
    const scores = scoreSourceRecord(record, {
      searchConcepts: topic?.searchConcepts || profile?.lifestyleTopics || [],
      excludedConcepts: topic?.excludedConcepts || ['hydrogel'],
      brand: profile?.brand,
      productCategory: profile?.productCategory,
    });
    return { ...record, consumer_relevance: scores.consumerRelevance, safety_relevance: scores.safetyRelevance };
  });
  const trigger = computeTriggerScore({
    sourceRecords: scoredFiltered,
    profile: enriched,
    topic,
    storyCategory,
    isPersonalized: !isGeneral,
  });
  const reason = isGeneral
    ? 'Practical context on hydration and bottled-water labels.'
    : buildPersonalizationReason({ profile: enriched, storyCategory, signals: trigger.signals });
  const safetyContext =
    storyCategory === 'safety_and_recalls' && scoredFiltered.some((s) => s.provider?.includes('openfda'))
      ? evaluateSafetyEligibility(scoredFiltered.find((s) => s.provider?.includes('openfda')), enriched)
      : null;
  const story = buildFactualFallbackStory({
    sourceRecords: scoredFiltered,
    storyCategory,
    topic,
    profile: enriched,
    personalizationReason: reason,
    safetyContext,
    fallbackReason: 'verify_demo',
  });
  const rankScore = computeRankScore({
    triggerScore: trigger.score,
    story: { story_category: storyCategory, safety_flag: storyCategory === 'safety_and_recalls', source_strength_label: story.source_strength_label },
    isPersonalized: !isGeneral,
    profile: enriched,
  });
  return {
    title: story.title,
    deck: story.deck,
    reason,
    triggerScore: trigger.score,
    passesThreshold: trigger.passesThreshold,
    rankScore,
    sourceCount: scoredFiltered.length,
    sources: scoredFiltered.map((source) => ({ provider: source.provider, title: source.title })),
    sections: story.sections,
  };
}

const waterProfile = classifyProduct(deerPark, { scanCount: 1, isSaved: false });
assert.deepStrictEqual(waterProfile.pubmedConcepts, [], 'bottled water must not query PubMed with generic water');
assert.ok(!buildPubMedConcepts(waterProfile).some((concept) => /\bwater\b/i.test(concept) && !/bottled/i.test(concept)));

const magnesiumProfile = classifyProduct(magnesium, { scanCount: 1, isSaved: true });
assert.ok(magnesiumProfile.primaryIngredient.includes('magnesium'));
assert.ok(magnesiumProfile.pubmedConcepts.some((concept) => concept.includes('magnesium')));

const ibuprofenProfile = classifyProduct(ibuprofen, { scanCount: 1, isSaved: false });
assert.strictEqual(ibuprofenProfile.productCategory, 'otc_medication');

assert.ok(isGenericTerm('water'));
assert.ok(containsIndustrialContext(industrialWaterPaper.title));
assert.ok(scorePubMedRecord(industrialWaterPaper, { searchConcepts: ['water'] }) < 0.35);

const newUserModel = buildUserInterestModel({ scans: [], savedProducts: [] });
assert.strictEqual(newUserModel.hasPersonalization, false);
assert.ok(getBaseTopicsForMix().length >= 6, 'new users should have base lifestyle topics');

const waterStory = demoStory({
  profile: waterProfile,
  sources: getEvergreenForTopic('hydration-habits'),
  storyCategory: 'everyday_wellness',
  isGeneral: true,
  topic: getBaseTopicsForMix().find((item) => item.id === 'hydration-habits'),
});
assert.ok(waterStory.triggerScore >= 4);
assert.ok(!/general wellumi wellness story/i.test(waterStory.reason));
assert.ok(!waterStory.sources.some((source) => /hydrogel/i.test(source.title)));

const filteredIndustrial = filterRelevantSources([industrialWaterPaper, hydrationReview], {
  minimumSourceQuality: 0.45,
  excludedConcepts: ['hydrogel'],
});
assert.strictEqual(filteredIndustrial.length, 1);

const sabraProfile = classifyProduct(sabra, { scanCount: 1, isSaved: false });
const sabraStory = demoStory({
  profile: sabraProfile,
  sources: [
    {
      provider: 'openfda_food',
      source_type: 'food_recall',
      external_id: 'sabra-1',
      title: 'Sabra hummus recalled for undeclared allergen',
      summary: 'Reason for recall: undeclared sesame. Product description: Sabra hummus.',
      published_at: '20250301',
      source_url: 'https://api.fda.gov/food/enforcement.json',
      consumer_relevance: 0.9,
      safety_relevance: 0.95,
    },
  ],
  storyCategory: 'safety_and_recalls',
  isGeneral: false,
});
assert.ok(sabraStory.triggerScore >= TRIGGER_SCORE_THRESHOLD);
assert.match(sabraStory.reason, /Sabra|food/i);

const magnesiumStory = demoStory({
  profile: magnesiumProfile,
  sources: [
    {
      provider: 'pubmed',
      source_type: 'research_update',
      external_id: 'mg-1',
      title: 'Systematic review of magnesium supplementation and sleep',
      summary: 'Review of magnesium forms and sleep routine research in adults.',
      published_at: '20250101',
      source_url: 'https://pubmed.ncbi.nlm.nih.gov/mg-1/',
      consumer_relevance: 0.82,
    },
  ],
  storyCategory: 'ingredient_spotlight',
  isGeneral: false,
  isSaved: true,
});
assert.match(magnesiumStory.reason, /saved magnesium glycinate/i);
assert.ok(magnesiumStory.title.toLowerCase().includes('magnesium'));

const safetyRank = computeRankScore({
  triggerScore: 8,
  story: { story_category: 'safety_and_recalls', safety_flag: true, source_strength_label: 'strong' },
  isPersonalized: true,
  profile: waterProfile,
});
const lifestyleRank = computeRankScore({
  triggerScore: 8,
  story: { story_category: 'everyday_wellness', safety_flag: false, source_strength_label: 'moderate' },
  isPersonalized: true,
  profile: waterProfile,
});
assert.ok(safetyRank > lifestyleRank, 'direct safety should outrank general lifestyle');

const oldResearch = {
  provider: 'pubmed',
  title: 'Older magnesium review',
  summary: 'Review article',
  published_at: '2010-01-01',
  consumer_relevance: 0.55,
};
const oldTrigger = computeTriggerScore({
  sourceRecords: [oldResearch],
  profile: magnesiumProfile,
  storyCategory: 'ingredient_spotlight',
  isPersonalized: true,
});
const freshTrigger = computeTriggerScore({
  sourceRecords: [{ ...oldResearch, published_at: '2025-01-01' }],
  profile: magnesiumProfile,
  storyCategory: 'ingredient_spotlight',
  isPersonalized: true,
});
assert.ok(freshTrigger.score > oldTrigger.score);

const generated = buildFactualFallbackStory({
  sourceRecords: getEvergreenForTopic('hydration-habits'),
  storyCategory: 'everyday_wellness',
  topic: { id: 'hydration-habits' },
  profile: waterProfile,
  personalizationReason: 'Related to your hydration scans',
  fallbackReason: 'verify_demo',
});
assert.ok(generated.title);
assert.ok(generated.sections.what_reliable_sources_say);
assert.ok(!generated.sections.everyday_explanation);

const personalizedReason = buildPersonalizationReason({
  profile: waterProfile,
  storyCategory: 'everyday_wellness',
  signals: [],
});
assert.match(personalizedReason, /hydration scans/i);
assert.ok(!/because you scanned or saved items/i.test(personalizedReason));

const appJs = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
assert.match(appJs, /screenPaddingBottom: 148/);
assert.match(appJs, /__DEV__ && !!userId/);

const nutrition = require('../src/utils/formatNutrition');
const formatted = nutrition.formatNutritionEntries(sabraNutriments);
const protein = formatted.entries.find((entry) => entry.key === 'protein');
assert.ok(protein.display.includes('6.67'));
assert.ok(formatted.basis.includes('per 100 g'));

console.log('\n=== Demo feed: Deer Park bottled water (general hydration story) ===');
console.log(JSON.stringify(waterStory, null, 2));

console.log('\n=== Demo feed: Magnesium glycinate (saved) ===');
console.log(JSON.stringify(magnesiumStory, null, 2));

console.log('\n=== Demo feed: Deer Park safety recall ===');
console.log(
  JSON.stringify(
    demoStory({
      profile: waterProfile,
      sources: [deerParkRecall],
      storyCategory: 'safety_and_recalls',
      isGeneral: false,
    }),
    null,
    2
  )
);

console.log(`\nverify-wellness-content: all checks passed (story prompt ${STORY_PROMPT_VERSION}, threshold ${TRIGGER_SCORE_THRESHOLD})`);
