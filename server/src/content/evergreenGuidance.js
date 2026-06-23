const { normalizeExternalDate } = require('../utils/normalizeExternalDate');

const EVERGREEN_GUIDANCE = [
  {
    topicId: 'hydration-habits',
    storyCategory: 'everyday_wellness',
    lifestyleCategory: 'everyday_wellness',
    title: 'Hydration advice changes with heat, exercise, and diet',
    deck: 'CDC guidance explains when water is enough and when other factors matter.',
    provider: 'cdc',
    source_type: 'consumer_guidance',
    external_id: 'cdc-water-healthier-drinks',
    summary:
      'CDC consumer guidance describes how daily fluid needs vary with activity, heat, and overall diet, and encourages choosing water over sugary drinks.',
    source_url: 'https://www.cdc.gov/healthy-weight-gain/healthy-snacks-and-drinks/water-and-healthier-drinks.html',
    published_at: '2023-06-01',
    last_reviewed_at: '2025-01-01',
    consumer_relevance: 0.92,
    source_strength: 0.95,
    freshness_score: 0.9,
    safety_relevance: 0,
    is_evergreen: true,
  },
  {
    topicId: 'supplement-literacy',
    storyCategory: 'ingredient_spotlight',
    lifestyleCategory: 'supplement_literacy',
    title: 'What supplement labels must include—and what they do not prove',
    deck: 'NIH consumer guidance explains Supplement Facts panels and what labels can and cannot claim.',
    provider: 'nih_ods',
    source_type: 'consumer_guidance',
    external_id: 'nih-dietary-supplements-consumer',
    summary:
      'NIH Office of Dietary Supplements describes required supplement label information, ingredient listing, and the limits of structure/function claims.',
    source_url: 'https://ods.od.nih.gov/factsheets/DietarySupplements-Consumer/',
    published_at: '2022-03-01',
    last_reviewed_at: '2025-01-01',
    consumer_relevance: 0.94,
    source_strength: 0.96,
    freshness_score: 0.88,
    safety_relevance: 0,
    is_evergreen: true,
  },
  {
    topicId: 'otc-label-literacy',
    storyCategory: 'medicine_cabinet',
    lifestyleCategory: 'medicine_cabinet',
    title: 'How to compare active ingredients across OTC products',
    deck: 'FDA explains how Drug Facts labels list active ingredients, warnings, and directions.',
    provider: 'fda',
    source_type: 'consumer_guidance',
    external_id: 'fda-otc-drug-facts',
    summary:
      'FDA consumer information describes OTC Drug Facts labels, including active ingredients, warnings, and directions for use.',
    source_url: 'https://www.fda.gov/drugs/information-consumers-and-patients-drugs/over-counter-medicine-label',
    published_at: '2021-05-01',
    last_reviewed_at: '2025-01-01',
    consumer_relevance: 0.93,
    source_strength: 0.96,
    freshness_score: 0.88,
    safety_relevance: 0,
    is_evergreen: true,
  },
  {
    topicId: 'claims-decoded-natural',
    storyCategory: 'claims_decoded',
    lifestyleCategory: 'claims_decoded',
    title: 'What “natural” actually tells you on a food label',
    deck: 'FDA guidance clarifies how “natural” is used on food labels and what it does not guarantee.',
    provider: 'fda',
    source_type: 'consumer_guidance',
    external_id: 'fda-natural-label-claims',
    summary:
      'FDA consumer guidance explains that “natural” on food labels has a specific regulatory meaning and does not by itself indicate safety or healthfulness.',
    source_url: 'https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label',
    published_at: '2020-01-01',
    last_reviewed_at: '2025-01-01',
    consumer_relevance: 0.9,
    source_strength: 0.94,
    freshness_score: 0.85,
    safety_relevance: 0,
    is_evergreen: true,
  },
  {
    topicId: 'sleep-recovery',
    storyCategory: 'everyday_wellness',
    lifestyleCategory: 'everyday_wellness',
    title: 'Sleep routines start with consistent habits, not single products',
    deck: 'CDC sleep guidance focuses on schedule, environment, and screen habits before supplements.',
    provider: 'cdc',
    source_type: 'consumer_guidance',
    external_id: 'cdc-sleep-basics',
    summary:
      'CDC consumer guidance outlines sleep routine basics including consistent schedules, bedroom environment, and limiting screens before bed.',
    source_url: 'https://www.cdc.gov/sleep/about/index.html',
    published_at: '2022-09-01',
    last_reviewed_at: '2025-01-01',
    consumer_relevance: 0.9,
    source_strength: 0.94,
    freshness_score: 0.86,
    safety_relevance: 0,
    is_evergreen: true,
  },
  {
    topicId: 'functional-drinks-trend',
    storyCategory: 'product_trends',
    lifestyleCategory: 'product_trends',
    title: 'Functional drinks often highlight electrolytes—labels still matter',
    deck: 'USDA and FDA consumer resources help compare beverage labels beyond marketing language.',
    provider: 'usda',
    source_type: 'consumer_guidance',
    external_id: 'usda-beverage-label-basics',
    summary:
      'USDA consumer guidance on reading beverage and nutrition labels helps compare sugars, serving sizes, and listed nutrients across drinks.',
    source_url: 'https://www.myplate.gov/eat-healthy/beverages',
    published_at: '2021-08-01',
    last_reviewed_at: '2025-01-01',
    consumer_relevance: 0.86,
    source_strength: 0.9,
    freshness_score: 0.84,
    safety_relevance: 0,
    is_evergreen: true,
  },
];

function toSourceRecord(entry) {
  return {
    provider: entry.provider,
    source_type: entry.source_type,
    external_id: entry.external_id,
    title: entry.title,
    summary: entry.summary,
    abstract: entry.summary,
    published_at: normalizeExternalDate(entry.published_at),
    source_url: entry.source_url,
    topics: [entry.topicId],
    raw_payload: { evergreen: true, topicId: entry.topicId },
    consumer_relevance: entry.consumer_relevance,
    source_strength: entry.source_strength,
    freshness_score: entry.freshness_score,
    safety_relevance: entry.safety_relevance,
    is_evergreen: true,
    last_reviewed_at: normalizeExternalDate(entry.last_reviewed_at),
  };
}

function getEvergreenForTopic(topicId) {
  const entry = EVERGREEN_GUIDANCE.find((item) => item.topicId === topicId);
  return entry ? [toSourceRecord(entry)] : [];
}

function getRequiredBaseEvergreen() {
  return EVERGREEN_GUIDANCE.map(toSourceRecord);
}

function getEvergreenStorySeed(topicId) {
  return EVERGREEN_GUIDANCE.find((item) => item.topicId === topicId) || null;
}

module.exports = {
  EVERGREEN_GUIDANCE,
  getEvergreenForTopic,
  getRequiredBaseEvergreen,
  getEvergreenStorySeed,
  toSourceRecord,
};
