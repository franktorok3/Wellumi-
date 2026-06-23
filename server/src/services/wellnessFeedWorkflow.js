const { getSupabaseAdmin } = require('./supabase');
const { listUserScans, listSavedProducts } = require('./scanWorkflow');
const { hasSuccessfulProvider, isCompleteProviderFailure } = require('../utils/feedRefreshPolicy');
const { buildUserInterestModel } = require('../content/productInterestClassifier');
const {
  BASE_FEED_MIX_TARGETS,
  REQUIRED_BASE_TOPIC_IDS,
  getBaseTopicsForMix,
  getTopicById,
} = require('../content/baseFeedTopics');
const { filterRelevantSources, scoreSourceRecord } = require('../content/sourceRelevance');
const { acceptsStoryForDisplay } = require('../content/feedQuality');
const {
  TRIGGER_SCORE_THRESHOLD,
  computeTriggerScore,
  buildPersonalizationReason,
} = require('../content/triggerScore');
const { computeRankScore, applyFeedMix } = require('../content/storyRanking');
const { collectSourcesForTopic, collectSourcesForProfile } = require('../providers/sourceProviders');
const { getEvergreenForTopic, getEvergreenStorySeed } = require('../content/evergreenGuidance');
const { evaluateSafetyEligibility } = require('../content/safetyRecall');
const { generateWellnessStory, STORY_PROMPT_VERSION } = require('./storyGenerator');

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const IS_DEV = process.env.NODE_ENV !== 'production';

async function shouldRefreshFeed(userId) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_feed_refresh')
    .select('last_refreshed_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.last_refreshed_at) return true;
  return Date.now() - new Date(data.last_refreshed_at).getTime() >= REFRESH_INTERVAL_MS;
}

async function markFeedRefreshed(userId) {
  const supabase = getSupabaseAdmin();
  await supabase.from('user_feed_refresh').upsert({
    user_id: userId,
    last_refreshed_at: new Date().toISOString(),
  });
}

async function upsertSourceRecord(record) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('source_records')
    .upsert(
      {
        provider: record.provider,
        source_type: record.source_type,
        external_id: record.external_id,
        title: record.title,
        summary: record.summary,
        abstract: record.abstract,
        published_at: record.published_at,
        source_url: record.source_url,
        topics: record.topics || [],
        raw_payload: record.raw_payload || {},
        consumer_relevance: record.consumer_relevance,
        source_strength: record.source_strength,
        freshness_score: record.freshness_score,
        safety_relevance: record.safety_relevance,
        is_evergreen: Boolean(record.is_evergreen),
        last_reviewed_at: record.last_reviewed_at || null,
        recall_status: record.recall_status || null,
        recall_product_description: record.recall_product_description || null,
        recall_reason: record.recall_reason || null,
        recall_initiation_date: record.recall_initiation_date || null,
      },
      { onConflict: 'provider,external_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(`Could not upsert source record: ${error.message}`);
  return data;
}

async function upsertInterestProfile(userId, productId, profile, { scanCount, isSaved }) {
  const supabase = getSupabaseAdmin();
  await supabase.from('product_interest_profiles').upsert({
    user_id: userId,
    product_id: productId,
    profile,
    personalization_strength: profile.personalizationStrength,
    scan_count: scanCount,
    is_saved: isSaved,
    last_derived_at: new Date().toISOString(),
  });
}

async function createStoryWithSources({
  generated,
  storyCategory,
  lifestyleCategory,
  topics,
  isGeneral,
  safetyFlag,
  triggerScore,
  sourceDbRecords,
  displayEligible = true,
}) {
  const supabase = getSupabaseAdmin();
  const freshnessDate = sourceDbRecords
    .map((record) => record.published_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const { data: story, error } = await supabase
    .from('wellness_stories')
    .insert({
      title: generated.title,
      deck: generated.deck,
      body: generated.sections || {},
      lifestyle_category: lifestyleCategory,
      topics,
      story_type: isGeneral ? 'general' : 'personalized',
      story_category: storyCategory,
      is_general: isGeneral,
      safety_flag: safetyFlag,
      source_strength_label: generated.source_strength_label,
      editorial_confidence: generated.editorial_confidence,
      trigger_score: triggerScore,
      freshness_date: freshnessDate,
      model: generated.model,
      prompt_version: generated.prompt_version || STORY_PROMPT_VERSION,
      generation_mode: generated.generation_mode || 'fallback',
      fallback_reason: generated.fallback_reason || null,
      display_eligible: displayEligible,
      generated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Could not create wellness story: ${error.message}`);

  for (const [index, source] of sourceDbRecords.entries()) {
    await supabase.from('wellness_story_sources').upsert({
      story_id: story.id,
      source_record_id: source.id,
      citation_order: index,
    });
  }

  return story;
}

async function upsertUserStoryMatch({
  userId,
  storyId,
  personalizationReason,
  matchedProducts,
  matchedInterests,
  rankScore,
  isPersonalized,
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_story_matches')
    .upsert(
      {
        user_id: userId,
        story_id: storyId,
        personalization_reason: personalizationReason,
        matched_products: matchedProducts,
        matched_interests: matchedInterests,
        rank_score: rankScore,
        is_personalized: isPersonalized,
      },
      { onConflict: 'user_id,story_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(`Could not upsert user story match: ${error.message}`);
  return data;
}

function buildGeneralReason(topic) {
  const seed = getEvergreenStorySeed(topic?.id);
  if (seed?.deck) return seed.deck;
  if (topic?.titleConcept) return `Practical context on ${topic.titleConcept}.`;
  return 'Source-backed wellness context from official guidance.';
}

function scoreAndFilterSources(sourceRecords, { topic = null, profile = null } = {}) {
  const scored = sourceRecords.map((record) => {
    const scores = scoreSourceRecord(record, {
      searchConcepts: topic?.searchConcepts || profile?.lifestyleTopics || [],
      excludedConcepts: topic?.excludedConcepts || [],
      freshnessWindowDays: topic?.freshnessWindowDays,
      brand: profile?.brand,
      productCategory: profile?.productCategory,
    });
    return {
      ...record,
      consumer_relevance: record.consumer_relevance ?? scores.consumerRelevance,
      safety_relevance: record.safety_relevance ?? scores.safetyRelevance,
      source_strength: record.source_strength ?? scores.sourceStrength,
      freshness_score: record.freshness_score ?? scores.freshnessScore,
    };
  });

  const evergreen = scored.filter((record) => record.is_evergreen);
  const live = scored.filter((record) => !record.is_evergreen);
  const filteredLive = filterRelevantSources(live, {
    minimumSourceQuality: topic?.minimumSourceQuality || 0.45,
    excludedConcepts: topic?.excludedConcepts || [],
  });

  return [...evergreen, ...filteredLive];
}

async function maybeCreateStory({
  userId,
  sourceRecords,
  storyCategory,
  lifestyleCategory,
  topics,
  topic = null,
  profile = null,
  aggregates = null,
  isGeneral,
  productId = null,
}) {
  const scoredFiltered = scoreAndFilterSources(sourceRecords, { topic, profile });
  if (!scoredFiltered.length) return null;

  let safetyContext = null;
  let eligibleSafetyRecords = scoredFiltered;
  if (storyCategory === 'safety_and_recalls' || scoredFiltered.some((r) => r.provider?.includes('openfda'))) {
    eligibleSafetyRecords = [];
    for (const record of scoredFiltered) {
      if (!record.provider?.includes('openfda')) {
        eligibleSafetyRecords.push(record);
        continue;
      }
      safetyContext = evaluateSafetyEligibility(record, profile);
      if (safetyContext.displayEligible) {
        eligibleSafetyRecords.push(safetyContext.normalized);
      }
    }
    if (!eligibleSafetyRecords.length) return null;
    if (storyCategory === 'safety_and_recalls' && safetyContext && !safetyContext.displayEligible) {
      return null;
    }
  }

  const workingRecords =
    storyCategory === 'safety_and_recalls'
      ? eligibleSafetyRecords.filter((record) => record.provider?.includes('openfda'))
      : eligibleSafetyRecords;

  if (!workingRecords.length) return null;

  if (
    !isGeneral &&
    profile?.researchPriority === 'low' &&
    storyCategory !== 'safety_and_recalls' &&
    !workingRecords.some((record) => (record.safety_relevance || 0) >= 0.85)
  ) {
    return null;
  }

  const trigger = computeTriggerScore({
    sourceRecords: workingRecords,
    profile,
    topic,
    aggregates,
    storyCategory,
    isPersonalized: !isGeneral,
  });

  const evergreenOnly = workingRecords.every((record) => record.is_evergreen);
  const threshold = evergreenOnly ? 4 : TRIGGER_SCORE_THRESHOLD;
  if (trigger.score < threshold) {
    if (IS_DEV) {
      console.log('[wellumi-story] skipped', {
        storyCategory,
        score: trigger.score,
        threshold,
      });
    }
    return null;
  }

  const personalizationReason = isGeneral
    ? buildGeneralReason(topic)
    : buildPersonalizationReason({
        profile,
        aggregates,
        storyCategory,
        signals: trigger.signals,
        safetyContext,
      });

  const generated = await generateWellnessStory({
    sourceRecords: workingRecords,
    storyCategory,
    topic,
    profile,
    personalizationReason,
    isGeneral,
    safetyContext,
  });

  const quality = acceptsStoryForDisplay({
    generated,
    sourceRecords: workingRecords,
    storyCategory,
    safetyContext,
  });
  if (!quality.accepted) {
    if (IS_DEV) {
      console.log('[wellumi-story] rejected', {
        storyCategory,
        reason: quality.reason,
        generation_mode: generated.generation_mode,
        fallback_reason: generated.fallback_reason,
      });
    }
    return null;
  }

  const storedSources = [];
  for (const record of workingRecords) {
    storedSources.push(await upsertSourceRecord(record));
  }

  const safetyFlag =
    Boolean(safetyContext?.showSafetyBadge) ||
    (storyCategory === 'safety_and_recalls' && safetyContext?.displayEligible);

  const story = await createStoryWithSources({
    generated,
    storyCategory,
    lifestyleCategory,
    topics,
    isGeneral,
    safetyFlag,
    triggerScore: trigger.score,
    sourceDbRecords: storedSources,
    displayEligible: true,
  });

  const rankScore = computeRankScore({
    triggerScore: trigger.score,
    story,
    isPersonalized: !isGeneral,
    profile,
    aggregates,
  });

  const match = await upsertUserStoryMatch({
    userId,
    storyId: story.id,
    personalizationReason,
    matchedProducts: productId ? [productId] : [],
    matchedInterests: topics,
    rankScore,
    isPersonalized: !isGeneral,
  });

  if (IS_DEV) {
    console.log('[wellumi-story] created', {
      title: story.title,
      generation_mode: story.generation_mode,
      fallback_reason: story.fallback_reason,
      isGeneral,
      storyCategory,
    });
  }

  return { story, match, trigger, sources: storedSources, topicId: topic?.id || null };
}

async function ensureBaseFeedStories(userId, createdMatches, interestModel) {
  const createdTopicIds = new Set(
    createdMatches
      .filter((item) => item.story?.is_general)
      .map((item) => item.topicId || item.story?.topics?.[0])
      .filter(Boolean)
  );

  for (const topicId of REQUIRED_BASE_TOPIC_IDS) {
    if (createdTopicIds.has(topicId)) continue;
    const topic = getTopicById(topicId);
    if (!topic) continue;
    const evergreen = getEvergreenForTopic(topicId);
    if (!evergreen.length) continue;
    const created = await maybeCreateStory({
      userId,
      sourceRecords: evergreen,
      storyCategory: topic.storyCategory,
      lifestyleCategory: topic.lifestyleCategory,
      topics: [topic.id, topic.titleConcept],
      topic,
      aggregates: interestModel.aggregates,
      isGeneral: true,
    });
    if (created) {
      createdMatches.push(created);
      createdTopicIds.add(topicId);
    }
  }
}

async function refreshUserFeed(userId, { force = false } = {}) {
  if (!force && !(await shouldRefreshFeed(userId))) {
    return { refreshed: false, stale: false };
  }

  const [scans, savedProducts] = await Promise.all([
    listUserScans(userId, { limit: 20 }),
    listSavedProducts(userId, { limit: 20 }),
  ]);

  const interestModel = buildUserInterestModel({ scans, savedProducts });
  const providerResults = [];
  const createdMatches = [];

  const productStats = new Map();
  for (const scan of scans) {
    if (!scan?.product?.id) continue;
    const current = productStats.get(scan.product.id) || { product: scan.product, scanCount: 0, isSaved: false };
    current.scanCount += 1;
    productStats.set(scan.product.id, current);
  }
  for (const saved of savedProducts) {
    if (!saved?.product?.id) continue;
    const current = productStats.get(saved.product.id) || { product: saved.product, scanCount: 0, isSaved: false };
    current.isSaved = true;
    productStats.set(saved.product.id, current);
  }

  for (const profile of interestModel.profiles) {
    const productId = profile.productId || null;
    const productEntry = productId ? productStats.get(productId) : null;
    if (productId && profile) {
      await upsertInterestProfile(userId, productId, profile, {
        scanCount: productEntry?.scanCount || 1,
        isSaved: productEntry?.isSaved || false,
      });
    }
  }

  const baseTopics = getBaseTopicsForMix();
  for (const topic of baseTopics) {
    const { records, providerResults: topicProviders } = await collectSourcesForTopic(topic);
    providerResults.push(...topicProviders);

    if (topic.storyCategory === 'safety_and_recalls') {
      const recentSafety = records.filter((record) => {
        if (!record.provider?.includes('openfda')) return false;
        const eligibility = evaluateSafetyEligibility(record, null);
        return eligibility.displayEligible && !eligibility.historical;
      });
      if (!recentSafety.length) continue;
    }

    const created = await maybeCreateStory({
      userId,
      sourceRecords: records,
      storyCategory: topic.storyCategory,
      lifestyleCategory: topic.lifestyleCategory,
      topics: [topic.id, topic.titleConcept],
      topic,
      aggregates: interestModel.aggregates,
      isGeneral: true,
    });
    if (created) createdMatches.push(created);
  }

  await ensureBaseFeedStories(userId, createdMatches, interestModel);

  for (const profile of interestModel.profiles) {
    const productId = profile.productId || null;
    const productEntry = productId ? productStats.get(productId) : null;
    const enrichedProfile = { ...profile, isSaved: productEntry?.isSaved || false };

    const { records, providerResults: profileProviders } = await collectSourcesForProfile(enrichedProfile);
    providerResults.push(...profileProviders);
    if (!records.length) continue;

    const hasEligibleSafety = records.some((record) => {
      if (!record.provider?.includes('openfda')) return false;
      return evaluateSafetyEligibility(record, enrichedProfile).displayEligible;
    });

    const storyCategory = hasEligibleSafety
      ? 'safety_and_recalls'
      : profile.primaryIngredient
        ? 'ingredient_spotlight'
        : profile.productCategory === 'otc_medication'
          ? 'medicine_cabinet'
          : profile.productCategory === 'packaged_food'
            ? 'everyday_wellness'
            : 'everyday_wellness';

    const created = await maybeCreateStory({
      userId,
      sourceRecords: records,
      storyCategory,
      lifestyleCategory: profile.lifestyleTopics[0] || 'everyday_wellness',
      topics: [
        profile.productCategory,
        profile.primaryIngredient,
        profile.activeIngredient,
        ...profile.lifestyleTopics,
      ].filter(Boolean),
      profile: enrichedProfile,
      aggregates: interestModel.aggregates,
      isGeneral: false,
      productId,
    });
    if (created) createdMatches.push(created);
  }

  const anyProviderSucceeded =
    hasSuccessfulProvider(providerResults) || createdMatches.length > 0;
  const allProvidersFailed = isCompleteProviderFailure(providerResults) && !createdMatches.length;

  if (allProvidersFailed) {
    return {
      refreshed: false,
      stale: true,
      matchedCount: 0,
      cachedCount: 0,
      errors: providerResults.map((item) => item.error).filter(Boolean),
      providerResults,
    };
  }

  if (anyProviderSucceeded) {
    await markFeedRefreshed(userId);
  }

  if (IS_DEV) {
    console.log('[wellumi-story-feed] refresh complete', {
      stories: createdMatches.length,
      generalStories: createdMatches.filter((item) => item.story?.is_general).length,
      providers: providerResults.length,
      mixTargets: BASE_FEED_MIX_TARGETS,
    });
  }

  return {
    refreshed: true,
    stale: providerResults.some((item) => !item.success),
    matchedCount: createdMatches.length,
    cachedCount: createdMatches.length,
    errors: providerResults.filter((item) => !item.success).map((item) => item.error).filter(Boolean),
    providerResults,
  };
}

async function listUserFeed(userId, { limit = 30 } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_story_matches')
    .select(
      `
      id,
      personalization_reason,
      matched_products,
      matched_interests,
      rank_score,
      is_personalized,
      is_read,
      is_dismissed,
      created_at,
      story:wellness_stories (
        id,
        title,
        deck,
        body,
        lifestyle_category,
        topics,
        story_type,
        story_category,
        is_general,
        safety_flag,
        source_strength_label,
        editorial_confidence,
        trigger_score,
        freshness_date,
        generated_at,
        generation_mode,
        fallback_reason,
        display_eligible,
        wellness_story_sources (
          citation_order,
          source_record:source_records (
            id,
            provider,
            source_type,
            external_id,
            title,
            summary,
            abstract,
            published_at,
            source_url,
            source_strength,
            safety_relevance,
            recall_status,
            recall_initiation_date
          )
        )
      )
    `
    )
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .order('rank_score', { ascending: false })
    .limit(limit * 3);

  if (error) {
    throw new Error(`Could not load wellness feed: ${error.message}`);
  }

  const mixed = applyFeedMix(data || [], {
    hasPersonalization: (data || []).some((item) => item.is_personalized),
  });

  return mixed.slice(0, limit);
}

async function markFeedRead(userId, userStoryMatchId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_story_matches')
    .update({ is_read: true })
    .eq('id', userStoryMatchId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not mark story read: ${error.message}`);
  return data;
}

async function dismissFeedItem(userId, userStoryMatchId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_story_matches')
    .update({ is_dismissed: true })
    .eq('id', userStoryMatchId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not dismiss story: ${error.message}`);
  return data;
}

module.exports = {
  refreshUserFeed,
  listUserFeed,
  markFeedRead,
  dismissFeedItem,
  TRIGGER_SCORE_THRESHOLD,
  STORY_PROMPT_VERSION,
  maybeCreateStory,
  ensureBaseFeedStories,
};
