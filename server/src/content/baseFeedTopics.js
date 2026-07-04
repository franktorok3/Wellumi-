const BASE_FEED_TOPICS = [
  {
    id: 'hydration-habits',
    lifestyleCategory: 'everyday_wellness',
    storyCategory: 'everyday_wellness',
    titleConcept: 'hydration and bottled-water labels',
    searchConcepts: ['water and healthier drinks consumer guidance'],
    excludedConcepts: ['hydrogel', 'polycyclic aromatic', 'nanoclay', 'wastewater'],
    preferredSourceTypes: ['official_guidance', 'openfda_food'],
    minimumSourceQuality: 0.45,
    freshnessWindowDays: 1825,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'everyday_wellness',
  },
  {
    id: 'sleep-recovery',
    lifestyleCategory: 'everyday_wellness',
    storyCategory: 'everyday_wellness',
    titleConcept: 'sleep routines',
    searchConcepts: ['sleep hygiene consumer guidance'],
    excludedConcepts: ['hydrogel', 'industrial', 'polymer'],
    preferredSourceTypes: ['official_guidance'],
    minimumSourceQuality: 0.45,
    freshnessWindowDays: 1825,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'everyday_wellness',
  },
  {
    id: 'supplement-literacy',
    lifestyleCategory: 'ingredient_spotlight',
    storyCategory: 'ingredient_spotlight',
    titleConcept: 'supplement label literacy',
    searchConcepts: ['dietary supplement facts label consumer'],
    excludedConcepts: ['industrial chemistry'],
    preferredSourceTypes: ['official_guidance', 'openfda_drug'],
    minimumSourceQuality: 0.45,
    freshnessWindowDays: 1825,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'supplement_literacy',
  },
  {
    id: 'claims-decoded-natural',
    lifestyleCategory: 'claims_decoded',
    storyCategory: 'claims_decoded',
    titleConcept: 'natural label claims',
    searchConcepts: ['natural food label claim FDA consumer'],
    excludedConcepts: ['hydrogel', 'materials science'],
    preferredSourceTypes: ['official_guidance'],
    minimumSourceQuality: 0.45,
    freshnessWindowDays: 1825,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'claims_decoded',
  },
  {
    id: 'otc-label-literacy',
    lifestyleCategory: 'medicine_cabinet',
    storyCategory: 'medicine_cabinet',
    titleConcept: 'OTC medicine labels',
    searchConcepts: ['over the counter drug facts label FDA'],
    excludedConcepts: ['industrial'],
    preferredSourceTypes: ['official_guidance', 'openfda_drug'],
    minimumSourceQuality: 0.45,
    freshnessWindowDays: 1825,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'medicine_cabinet',
  },
  {
    id: 'functional-drinks-trend',
    lifestyleCategory: 'product_trends',
    storyCategory: 'product_trends',
    titleConcept: 'functional drinks and beverage labels',
    searchConcepts: ['beverage nutrition label consumer guidance'],
    excludedConcepts: ['hydrogel', 'nanoclay', 'drinking water analysis laboratory'],
    preferredSourceTypes: ['official_guidance'],
    minimumSourceQuality: 0.45,
    freshnessWindowDays: 1825,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'trends',
  },
  {
    id: 'general-food-safety',
    lifestyleCategory: 'safety_and_recalls',
    storyCategory: 'safety_and_recalls',
    titleConcept: 'current food safety updates',
    searchConcepts: ['food recall undeclared allergen'],
    excludedConcepts: [],
    preferredSourceTypes: ['openfda_food'],
    minimumSourceQuality: 0.55,
    freshnessWindowDays: 120,
    aiSummarizationAllowed: true,
    generalFeedEligible: true,
    targetMix: 'safety',
  },
];

const REQUIRED_BASE_TOPIC_IDS = [
  'hydration-habits',
  'sleep-recovery',
  'supplement-literacy',
  'otc-label-literacy',
  'claims-decoded-natural',
  'functional-drinks-trend',
];

const BASE_FEED_MIX_TARGETS = {
  everyday_wellness: 2,
  ingredient_or_trend: 1,
  claims_decoded: 1,
  safety: 1,
  medicine_cabinet_or_supplement: 1,
};

function getBaseTopicsForMix() {
  return BASE_FEED_TOPICS.filter((topic) => topic.generalFeedEligible);
}

function getTopicById(topicId) {
  return BASE_FEED_TOPICS.find((topic) => topic.id === topicId) || null;
}

module.exports = {
  BASE_FEED_TOPICS,
  BASE_FEED_MIX_TARGETS,
  REQUIRED_BASE_TOPIC_IDS,
  getBaseTopicsForMix,
  getTopicById,
};
