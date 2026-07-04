const { isGenericTerm } = require('./genericTerms');
const { daysSince } = require('./sourceRelevance');

const TRIGGER_SCORE_THRESHOLD = 6;

function computeTriggerScore({
  sourceRecords = [],
  profile = null,
  topic = null,
  aggregates = null,
  storyCategory = 'everyday_wellness',
  isPersonalized = false,
  interestProfile = null,
}) {
  let score = 0;
  const signals = [];

  const brand = profile?.brand;
  const textBlob = sourceRecords
    .map((record) => `${record.title || ''} ${record.summary || ''}`)
    .join(' ')
    .toLowerCase();

  if (brand && textBlob.includes(String(brand).toLowerCase())) {
    score += 10;
    signals.push('direct_brand_safety_match');
  }

  const recallHit = sourceRecords.some(
    (record) =>
      (record.provider === 'openfda_food' || record.provider === 'openfda_drug') &&
      String(record.title || record.summary || '')
        .toLowerCase()
        .includes('recall')
  );
  if (recallHit && brand && textBlob.includes(String(brand).toLowerCase())) {
    score += 10;
    signals.push('direct_product_recall_match');
  }

  if (profile?.isSaved && profile?.primaryIngredient) {
    score += 7;
    signals.push('saved_ingredient_match');
  } else if (profile?.personalizationStrength === 'high' && profile?.primaryIngredient) {
    score += 7;
    signals.push('saved_or_high_strength_ingredient');
  }

  if (profile?.isSaved) {
    score += 5;
    signals.push('saved_product_category');
  }

  if (aggregates?.ingredientCounts?.[profile?.primaryIngredient] >= 2) {
    score += 5;
    signals.push('repeated_ingredient_scans');
  }

  if (aggregates?.categoryCounts?.[profile?.productCategory] >= 2) {
    score += 3;
    signals.push('repeated_category_scans');
  }

  if (profile?.labelClaims?.length >= 2) {
    score += 4;
    signals.push('meaningful_claim_cluster');
  }

  if (storyCategory === 'product_trends') {
    score += 3;
    signals.push('strong_current_trend');
  }

  if (topic?.targetMix === 'everyday_wellness' && !isPersonalized) {
    score += 2;
    signals.push('seasonal_or_base_relevance');
  }

  if (sourceRecords.length >= 2) {
    score += 3;
    signals.push('multiple_credible_sources');
  }

  const newest = sourceRecords
    .map((record) => daysSince(record.published_at))
    .filter((value) => value != null)
    .sort((a, b) => a - b)[0];
  if (newest != null && newest <= 120) {
    score += 2;
    signals.push('recent_source');
  }

  const oldestRelevant = sourceRecords
    .map((record) => daysSince(record.published_at))
    .filter((value) => value != null)
    .sort((a, b) => b - a)[0];
  if (oldestRelevant != null && oldestRelevant > 730 && storyCategory !== 'safety_and_recalls') {
    score -= 4;
    signals.push('older_source_penalty');
  }

  const genericOnly =
    profile &&
    !profile.primaryIngredient &&
    !profile.activeIngredient &&
    (profile.productCategory === 'bottled_water' || profile.meaningfulIngredients.every(isGenericTerm));
  if (genericOnly && isPersonalized) {
    score -= 10;
    signals.push('generic_term_only_match');
  }

  if (textBlob.includes('hydrogel') || textBlob.includes('nanoclay') || textBlob.includes('polycyclic aromatic')) {
    score -= 8;
    signals.push('industrial_context_penalty');
  }

  const avgRelevance =
    sourceRecords.reduce((sum, record) => sum + (record.consumer_relevance || 0), 0) /
    Math.max(sourceRecords.length, 1);
  if (avgRelevance < 0.45) {
    score -= 6;
    signals.push('weak_relationship_penalty');
  }

  if (!isPersonalized) {
    score += 4;
    signals.push('base_feed_topic');
  }

  if (!isPersonalized && sourceRecords.length >= 1) {
    score += 3;
    signals.push('base_story_sources');
  }

  if (interestProfile) {
    const selected = interestProfile.preferences?.selected_interests || [];
    const limited = new Set((interestProfile.preferences?.limited_topics || []).map((t) => String(t).toLowerCase()));
    const storyTopics = [
      topic?.id,
      topic?.titleConcept,
      storyCategory,
      ...(profile?.lifestyleTopics || []),
      profile?.productCategory,
    ].filter(Boolean);

    for (const interest of selected) {
      const normalized = String(interest).toLowerCase();
      if (storyTopics.some((t) => String(t).toLowerCase().includes(normalized) || normalized.includes(String(t).toLowerCase()))) {
        score += 6;
        signals.push('explicit_interest_match');
      }
    }

    for (const limitTopic of limited) {
      if (storyTopics.some((t) => String(t).toLowerCase().includes(limitTopic))) {
        score -= 12;
        signals.push('explicit_limit_penalty');
      }
    }

    const topicWeights = new Map(
      (interestProfile.topics || []).map((item) => [String(item.topic).toLowerCase(), item.finalWeight || 0])
    );
    for (const t of storyTopics) {
      const weight = topicWeights.get(String(t).toLowerCase());
      if (weight > 0) {
        score += Math.min(weight, 12);
        signals.push('signal_weight_boost');
      }
      if (weight < 0) {
        score += Math.max(weight, -20);
        signals.push('signal_weight_penalty');
      }
    }
  }

  if (storyCategory === 'safety_and_recalls') {
    score += 5;
    signals.push('safety_story_boost');
  }

  return {
    score,
    signals,
    passesThreshold: score >= TRIGGER_SCORE_THRESHOLD,
  };
}

function buildPersonalizationReason({
  profile,
  aggregates,
  storyCategory,
  signals = [],
  safetyContext = null,
  interestProfile = null,
}) {
  if (safetyContext?.matchType === 'exact_product' && profile?.productName) {
    return `Recall notice involving ${profile.productName}, a product you scanned`;
  }
  if (safetyContext?.matchType === 'product_family' && profile?.brand) {
    return `Safety update involving a ${profile.brand} product family you scanned`;
  }
  if (safetyContext?.matchType === 'brand_only' && profile?.brand) {
    return `An older ${profile.brand} recall to review against what you scanned`;
  }
  if (safetyContext?.matchType === 'category_only') {
    return 'A recent category recall update';
  }

  const topExplicit = (interestProfile?.topics || []).find((item) => item.explicitWeight > 0);
  if (topExplicit && storyCategory === 'everyday_wellness') {
    return `Based on your interest in ${topExplicit.topic.replace(/_/g, ' ')}`;
  }
  if (signals.includes('direct_product_recall_match') && profile?.brand) {
    return `A safety update involving ${profile.brand}, a brand you scanned`;
  }
  if (signals.includes('saved_ingredient_match') && profile?.primaryIngredient) {
    return `Because you saved ${profile.primaryIngredient}`;
  }
  if (profile?.isSaved && profile?.productName) {
    return `Because you saved ${profile.productName}`;
  }
  if (profile?.productCategory === 'bottled_water') {
    return 'Related to your hydration scans';
  }
  if (aggregates?.ingredientCounts?.[profile?.primaryIngredient] >= 2 && profile?.primaryIngredient) {
    return `Because several products you scanned mention ${profile.primaryIngredient}`;
  }
  if (profile?.productCategory === 'otc_medication') {
    return 'Related to products in your medicine cabinet';
  }
  if (profile?.productCategory === 'packaged_food' && profile?.brand) {
    return `Related to your ${profile.brand} food scans`;
  }
  if (storyCategory === 'claims_decoded' && profile?.labelClaims?.length) {
    return `Related to label claims on products you scanned`;
  }
  if (profile?.lifestyleTopics?.includes('sleep routines') && profile?.primaryIngredient) {
    return `Related to your interest in sleep routines and ${profile.primaryIngredient}`;
  }
  if (!profile) {
    return 'Source-backed wellness context from official guidance.';
  }
  return `Related to your ${profile.broaderCategory || 'wellness'} scans`;
}

module.exports = {
  TRIGGER_SCORE_THRESHOLD,
  computeTriggerScore,
  buildPersonalizationReason,
};
