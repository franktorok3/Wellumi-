function rankStories(matches) {
  return [...matches].sort((a, b) => {
    const left = a.rank_score || 0;
    const right = b.rank_score || 0;
    if (right !== left) return right - left;

    if (Boolean(b.story?.safety_flag) !== Boolean(a.story?.safety_flag)) {
      return Number(b.story?.safety_flag) - Number(a.story?.safety_flag);
    }

    const leftFresh = new Date(b.story?.freshness_date || b.created_at || 0).getTime();
    const rightFresh = new Date(a.story?.freshness_date || a.created_at || 0).getTime();
    return leftFresh - rightFresh;
  });
}

function computeRankScore({
  triggerScore = 0,
  story = null,
  isPersonalized = false,
  profile = null,
  aggregates = null,
}) {
  let score = triggerScore;

  if (story?.safety_flag) score += 100;
  if (isPersonalized && profile?.isSaved) score += 40;
  if (isPersonalized && profile?.primaryIngredient) score += 25;
  if (isPersonalized && profile?.activeIngredient) score += 25;
  if (aggregates?.categoryCounts?.[profile?.productCategory] >= 2) score += 10;
  if (story?.story_category === 'everyday_wellness') score += 8;
  if (story?.editorial_confidence) score += story.editorial_confidence * 5;
  if (story?.freshness_date) {
    const ageDays = (Date.now() - new Date(story.freshness_date).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 30) score += 8;
    else if (ageDays <= 180) score += 4;
  }

  const strength = story?.source_strength_label;
  if (strength === 'strong') score += 6;
  if (strength === 'moderate') score += 3;

  return score;
}

function diversifyStories(matches, { maxPerCategory = 2, maxPerProduct = 1 } = {}) {
  const categoryCounts = new Map();
  const productCounts = new Map();
  const selected = [];

  for (const match of rankStories(matches)) {
    const category = match.story?.story_category || 'other';
    const productKey =
      Array.isArray(match.matched_products) && match.matched_products[0]
        ? match.matched_products[0]
        : match.story?.is_general
          ? `general:${match.matched_interests?.[0] || match.story?.topics?.[0] || category}`
          : 'general';

    if ((categoryCounts.get(category) || 0) >= maxPerCategory) continue;
    if (
      !match.story?.is_general &&
      (productCounts.get(productKey) || 0) >= maxPerProduct
    ) {
      continue;
    }

    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    productCounts.set(productKey, (productCounts.get(productKey) || 0) + 1);
    selected.push(match);
  }

  return selected;
}

function applyFeedMix(matches, { hasPersonalization = false } = {}) {
  const eligible = (matches || []).filter((item) => item.story?.display_eligible !== false);

  if (!hasPersonalization) {
    return diversifyStories(eligible, { maxPerCategory: 2, maxPerProduct: 1 }).slice(0, 6);
  }

  const ranked = rankStories(eligible);
  const personalized = ranked.filter((item) => item.is_personalized);
  const general = ranked.filter((item) => !item.is_personalized);
  const safety = general.filter((item) => item.story?.safety_flag).slice(0, 1);
  const generalPool = general.filter((item) => !item.story?.safety_flag);

  const personalizedPicked = diversifyStories(personalized, {
    maxPerCategory: 2,
    maxPerProduct: 1,
  }).slice(0, 3);
  const generalPicked = diversifyStories(generalPool, {
    maxPerCategory: 2,
    maxPerProduct: 1,
  }).slice(0, Math.max(3, 4 - safety.length));

  return [...safety, ...personalizedPicked, ...generalPicked].slice(0, 8);
}

module.exports = {
  rankStories,
  computeRankScore,
  diversifyStories,
  applyFeedMix,
};
