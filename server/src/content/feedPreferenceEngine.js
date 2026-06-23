const STORY_CATEGORY_TO_BALANCE = {
  everyday_wellness: 'everyday_guidance',
  ingredient_spotlight: 'ingredient_explainers',
  product_trends: 'trends',
  safety_and_recalls: 'safety',
  claims_decoded: 'ingredient_explainers',
  medicine_cabinet: 'ingredient_explainers',
};

const CONTENT_BALANCE_MULTIPLIER = {
  less: 0.55,
  balanced: 1,
  more: 1.65,
};

const INTEREST_TOPIC_LINKS = {
  hydration: ['hydration', 'hydration-habits', 'hydration_habits', 'bottled_water', 'beverages'],
  sleep: ['sleep', 'sleep-recovery', 'sleep_recovery', 'sleep routines'],
  nutrition: ['nutrition', 'everyday nutrition', 'packaged_food', 'everyday_wellness'],
  supplements: ['supplements', 'supplement-literacy', 'supplement_literacy', 'dietary_supplement'],
  safety: ['safety', 'safety_and_recalls', 'general-food-safety'],
  trends: ['trends', 'product_trends', 'functional-drinks-trend'],
  food_literacy: ['food_literacy', 'claims-decoded-natural', 'claims_decoded', 'ingredient_spotlight'],
  medicine_cabinet: ['medicine_cabinet', 'otc-label-literacy', 'otc_medication'],
};

function normalizeTopic(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function topicMatchesInterest(topic, interestId) {
  const normalizedTopic = normalizeTopic(topic);
  const normalizedInterest = normalizeTopic(interestId);
  if (normalizedTopic === normalizedInterest) return true;
  const aliases = INTEREST_TOPIC_LINKS[interestId] || [];
  return aliases.some((alias) => normalizeTopic(alias) === normalizedTopic);
}

function getFeedSlotTargets(profileStage) {
  switch (profileStage) {
    case 'preference_led':
      return {
        general: 0.55,
        explicit: 0.35,
        safetyTrends: 0.1,
        behaviorMax: 2,
        generalMin: 3,
        limit: 8,
      };
    case 'early_behavior':
      return {
        general: 0.45,
        explicit: 0.35,
        behavior: 0.1,
        safetyTrends: 0.1,
        behaviorMax: 2,
        generalMin: 3,
        limit: 8,
      };
    case 'established':
      return {
        explicit: 0.35,
        product: 0.3,
        general: 0.2,
        safetyTrends: 0.15,
        behaviorMax: 3,
        generalMin: 2,
        limit: 8,
      };
    default:
      return {
        general: 0.6,
        explicit: 0.3,
        safetyTrends: 0.1,
        behaviorMax: 1,
        generalMin: 4,
        limit: 6,
      };
  }
}

function classifyMatchBucket(match) {
  if (match.story?.safety_flag || match.story?.story_category === 'safety_and_recalls') {
    return 'safetyTrends';
  }
  if (!match.is_personalized || match.story?.is_general) {
    return 'general';
  }
  if (match.story?.story_category === 'product_trends') {
    return 'safetyTrends';
  }
  return 'behavior';
}

function storyTouchesExplicitInterest(match, selectedInterests = []) {
  const storyTopics = [
    match.story?.base_topic_id,
    ...(match.story?.topics || []),
    ...(match.matched_interests || []),
  ].filter(Boolean);
  return selectedInterests.some((interest) =>
    storyTopics.some((topic) => topicMatchesInterest(topic, interest))
  );
}

function isStoryExcluded(match, interestProfile) {
  const excluded = new Set((interestProfile?.excludedTopics || []).map(normalizeTopic));
  const storyTopics = [
    match.story?.base_topic_id,
    ...(match.story?.topics || []),
    ...(match.matched_interests || []),
    match.story?.story_category,
    match.story?.lifestyle_category,
  ]
    .filter(Boolean)
    .map(normalizeTopic);

  return storyTopics.some((topic) => excluded.has(topic));
}

function getContentBalanceMultiplier(storyCategory, contentBalance = {}) {
  const key = STORY_CATEGORY_TO_BALANCE[storyCategory] || 'everyday_guidance';
  const level = contentBalance[key] || 'balanced';
  return CONTENT_BALANCE_MULTIPLIER[level] || 1;
}

function getTopicAffinityBonus(match, interestProfile) {
  if (!interestProfile) return 0;
  if (isStoryExcluded(match, interestProfile)) return -1000;

  const selectedInterests = interestProfile.preferences?.selected_interests || [];
  const topicWeights = new Map(
    (interestProfile.topics || []).map((item) => [normalizeTopic(item.topic), item.finalWeight || 0])
  );

  let bonus = 0;
  const storyTopics = [
    match.story?.base_topic_id,
    ...(match.story?.topics || []),
    ...(match.matched_interests || []),
  ].filter(Boolean);

  for (const interest of selectedInterests) {
    if (storyTopics.some((topic) => topicMatchesInterest(topic, interest))) {
      bonus += 24;
    }
  }

  for (const topic of storyTopics) {
    const weight = topicWeights.get(normalizeTopic(topic));
    if (weight > 0) bonus += weight * 2.5;
    if (weight < 0) bonus += weight * 3;
  }

  if (storyTouchesExplicitInterest(match, selectedInterests)) {
    bonus += 12;
  }

  return bonus;
}

function adjustTriggerThreshold({ baseThreshold, interestProfile, topic, storyCategory, isPersonalized }) {
  let threshold = baseThreshold;
  const selected = interestProfile?.preferences?.selected_interests || [];
  const limited = new Set((interestProfile?.preferences?.limited_topics || []).map(normalizeTopic));

  if (topic && selected.some((interest) => topicMatchesInterest(topic.id || topic, interest))) {
    threshold -= 2;
  }
  if (
    storyCategory &&
    [...limited].some((limitTopic) => normalizeTopic(storyCategory).includes(limitTopic))
  ) {
    threshold += 4;
  }
  if (!isPersonalized && interestProfile?.profileStage === 'preference_led') {
    threshold -= 1;
  }
  return Math.max(3, threshold);
}

function filterCandidatesByPreferences(matches, interestProfile) {
  return (matches || []).filter((match) => !isStoryExcluded(match, interestProfile));
}

function applyPreferenceRankAdjustments(match, interestProfile, baseRankScore) {
  const storyCategory = match.story?.story_category || 'everyday_wellness';
  const balanceMultiplier = getContentBalanceMultiplier(
    storyCategory,
    interestProfile?.preferences?.content_balance || {}
  );
  const affinity = getTopicAffinityBonus(match, interestProfile);
  const bucket = classifyMatchBucket(match);
  let score = (baseRankScore || match.rank_score || 0) * balanceMultiplier + affinity;

  if (bucket === 'general' && interestProfile?.profileStage === 'early_behavior') {
    score += 6;
  }
  if (bucket === 'behavior' && interestProfile?.profileStage === 'preference_led') {
    score -= 8;
  }
  if (
    bucket === 'behavior' &&
    (interestProfile?.preferences?.selected_interests || []).length >= 2 &&
    !storyTouchesExplicitInterest(match, interestProfile?.preferences?.selected_interests || [])
  ) {
    score -= 10;
  }

  return score;
}

function rankStoriesWithPreferences(matches, interestProfile) {
  const scored = filterCandidatesByPreferences(matches, interestProfile).map((match) => ({
    ...match,
    rank_score: applyPreferenceRankAdjustments(match, interestProfile, match.rank_score),
  }));

  return scored.sort((a, b) => {
    if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
    if (Boolean(b.story?.safety_flag) !== Boolean(a.story?.safety_flag)) {
      return Number(b.story?.safety_flag) - Number(a.story?.safety_flag);
    }
    const leftFresh = new Date(b.story?.freshness_date || b.created_at || 0).getTime();
    const rightFresh = new Date(a.story?.freshness_date || a.created_at || 0).getTime();
    return leftFresh - rightFresh;
  });
}

function diversifyStories(matches, { maxPerCategory = 2, maxPerProduct = 1 } = {}) {
  const categoryCounts = new Map();
  const productCounts = new Map();
  const selected = [];

  for (const match of matches) {
    const category = match.story?.story_category || 'other';
    const productKey =
      Array.isArray(match.matched_products) && match.matched_products[0]
        ? match.matched_products[0]
        : match.story?.is_general
          ? `general:${match.matched_interests?.[0] || match.story?.topics?.[0] || category}`
          : 'general';

    if ((categoryCounts.get(category) || 0) >= maxPerCategory) continue;
    if (!match.story?.is_general && (productCounts.get(productKey) || 0) >= maxPerProduct) continue;

    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    productCounts.set(productKey, (productCounts.get(productKey) || 0) + 1);
    selected.push(match);
  }

  return selected;
}

function applyProfileStageSlots(matches, interestProfile) {
  const targets = getFeedSlotTargets(interestProfile?.profileStage || 'cold_start');
  const ranked = rankStoriesWithPreferences(matches, interestProfile);
  const hasPersonalization = ranked.some((item) => item.is_personalized);
  const limit = targets.limit || 8;

  if (!hasPersonalization) {
    return diversifyStories(ranked, { maxPerCategory: 2, maxPerProduct: 1 }).slice(0, limit);
  }

  const buckets = {
    general: [],
    explicit: [],
    behavior: [],
    safetyTrends: [],
  };

  for (const match of ranked) {
    const bucket = classifyMatchBucket(match);
    if (bucket === 'general') buckets.general.push(match);
    else if (storyTouchesExplicitInterest(match, interestProfile?.preferences?.selected_interests || [])) {
      buckets.explicit.push(match);
    } else if (bucket === 'safetyTrends') buckets.safetyTrends.push(match);
    else buckets.behavior.push(match);
  }

  const behaviorCap = targets.behaviorMax || 2;
  const generalMin = targets.generalMin || 3;
  const picked = [];
  const seen = new Set();

  const takeFrom = (list, count) => {
    for (const item of diversifyStories(list, { maxPerCategory: 2, maxPerProduct: 1 })) {
      if (picked.length >= limit || count <= 0) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      picked.push(item);
      count -= 1;
    }
  };

  takeFrom(buckets.safetyTrends, 1);
  takeFrom(buckets.explicit, Math.max(2, Math.round(limit * (targets.explicit || 0.35))));
  takeFrom(buckets.behavior, behaviorCap);
  takeFrom(buckets.general, Math.max(generalMin, Math.round(limit * (targets.general || 0.2))));

  for (const bucket of [buckets.general, buckets.explicit, buckets.behavior, buckets.safetyTrends]) {
    for (const item of bucket) {
      if (picked.length >= limit) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      picked.push(item);
    }
  }

  while (picked.filter((item) => classifyMatchBucket(item) === 'general').length < generalMin) {
    const nextGeneral = buckets.general.find((item) => !seen.has(item.id));
    if (!nextGeneral) break;
    seen.add(nextGeneral.id);
    picked.push(nextGeneral);
  }

  return picked.slice(0, limit);
}

function prioritizeBaseTopics(baseTopics, interestProfile) {
  const selected = interestProfile?.preferences?.selected_interests || [];
  if (!selected.length) return baseTopics;

  const scored = baseTopics.map((topic) => {
    let score = 0;
    for (const interest of selected) {
      if (topicMatchesInterest(topic.id, interest) || topicMatchesInterest(topic.titleConcept, interest)) {
        score += 10;
      }
    }
    if (isTopicLimited(topic, interestProfile)) score -= 20;
    return { topic, score };
  });

  return scored.sort((a, b) => b.score - a.score).map((item) => item.topic);
}

function isTopicLimited(topic, interestProfile) {
  const limited = new Set((interestProfile?.preferences?.limited_topics || []).map(normalizeTopic));
  const topicTokens = [topic.id, topic.storyCategory, topic.lifestyleCategory, topic.titleConcept]
    .filter(Boolean)
    .map(normalizeTopic);
  return topicTokens.some((token) => [...limited].some((limit) => token.includes(limit) || limit.includes(token)));
}

module.exports = {
  STORY_CATEGORY_TO_BALANCE,
  CONTENT_BALANCE_MULTIPLIER,
  getFeedSlotTargets,
  classifyMatchBucket,
  isStoryExcluded,
  getContentBalanceMultiplier,
  getTopicAffinityBonus,
  adjustTriggerThreshold,
  filterCandidatesByPreferences,
  applyPreferenceRankAdjustments,
  rankStoriesWithPreferences,
  diversifyStories,
  applyProfileStageSlots,
  prioritizeBaseTopics,
  topicMatchesInterest,
  normalizeTopic,
};
