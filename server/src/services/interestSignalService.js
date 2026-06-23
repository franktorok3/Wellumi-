const { getSupabaseAdmin } = require('./supabase');
const {
  DEFAULT_CONTENT_BALANCE,
  SIGNAL_WEIGHTS,
  SIGNAL_CAPS,
  SIGNAL_DECAY_DAYS,
} = require('../content/onboardingOptions');
const { classifyProduct } = require('../content/productInterestClassifier');

const REPEATED_CATEGORY_BOOST = SIGNAL_WEIGHTS.scan_repeat_category;
const REPEATED_INGREDIENT_THRESHOLD = 2;

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function capWeight(signalType, weight) {
  const cap = SIGNAL_CAPS[signalType];
  if (cap == null) return weight;
  if (weight > 0) return Math.min(weight, cap);
  return Math.max(weight, -cap);
}

function normalizeTopic(value) {
  return String(value || '').trim().toLowerCase();
}

function isUniqueViolation(error) {
  return error?.code === '23505';
}

async function findSignalByKey({ userId, topic, signalType, sourceType, sourceId }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('user_interest_signals')
    .select('*')
    .eq('user_id', userId)
    .eq('topic', topic)
    .eq('signal_type', signalType)
    .eq('source_type', sourceType);

  query = sourceId ? query.eq('source_id', sourceId) : query.is('source_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Could not read interest signal: ${error.message}`);
  return data;
}

async function deactivateSignals({ userId, topic, signalType, sourceType, sourceId }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('user_interest_signals')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (topic) query = query.eq('topic', topic);
  if (signalType) query = query.eq('signal_type', signalType);
  if (sourceType) query = query.eq('source_type', sourceType);
  if (sourceId) query = query.eq('source_id', sourceId);

  const { error } = await query;
  if (error) throw new Error(`Could not deactivate interest signal: ${error.message}`);
}

/**
 * Set a signal to an absolute weight (idempotent — does not accumulate).
 */
async function setExplicitSignal(userId, payload) {
  const now = new Date().toISOString();
  const topic = normalizeTopic(payload.topic);
  const sourceId = payload.source_id || null;
  const prior = await findSignalByKey({
    userId,
    topic,
    signalType: payload.signal_type,
    sourceType: payload.source_type,
    sourceId,
  });

  const row = {
    user_id: userId,
    topic,
    signal_type: payload.signal_type,
    source_type: payload.source_type,
    source_id: sourceId,
    weight: capWeight(payload.signal_type, payload.weight),
    confidence: payload.confidence ?? prior?.confidence ?? 0.7,
    is_explicit: Boolean(payload.is_explicit ?? prior?.is_explicit ?? true),
    first_seen_at: prior?.first_seen_at || now,
    last_seen_at: now,
    expires_at: payload.expires_at ?? prior?.expires_at ?? null,
    is_active: payload.is_active !== false,
    metadata: { ...(prior?.metadata || {}), ...(payload.metadata || {}) },
  };

  const supabase = getSupabaseAdmin();
  if (prior?.id) {
    const { data, error } = await supabase
      .from('user_interest_signals')
      .update(row)
      .eq('id', prior.id)
      .select('*')
      .single();
    if (error) throw new Error(`Could not update interest signal: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase.from('user_interest_signals').insert(row).select('*').single();
  if (error) {
    if (isUniqueViolation(error)) {
      return findSignalByKey({
        userId,
        topic,
        signalType: payload.signal_type,
        sourceType: payload.source_type,
        sourceId,
      });
    }
    throw new Error(`Could not insert interest signal: ${error.message}`);
  }
  return data;
}

async function upsertInterestSignal(userId, payload, { absolute = false } = {}) {
  if (absolute) {
    return setExplicitSignal(userId, payload);
  }

  const now = new Date().toISOString();
  const topic = normalizeTopic(payload.topic);
  const sourceId = payload.source_id || null;
  const prior = await findSignalByKey({
    userId,
    topic,
    signalType: payload.signal_type,
    sourceType: payload.source_type,
    sourceId,
  });

  const mergedWeight = capWeight(payload.signal_type, (prior?.weight || 0) + payload.weight);
  const row = {
    user_id: userId,
    topic,
    signal_type: payload.signal_type,
    source_type: payload.source_type,
    source_id: sourceId,
    weight: mergedWeight,
    confidence: payload.confidence ?? prior?.confidence ?? 0.7,
    is_explicit: Boolean(payload.is_explicit ?? prior?.is_explicit),
    first_seen_at: prior?.first_seen_at || now,
    last_seen_at: now,
    expires_at: payload.expires_at ?? prior?.expires_at ?? null,
    is_active: payload.is_active !== false,
    metadata: { ...(prior?.metadata || {}), ...(payload.metadata || {}) },
  };

  const supabase = getSupabaseAdmin();
  if (prior?.id) {
    const { data, error } = await supabase
      .from('user_interest_signals')
      .update(row)
      .eq('id', prior.id)
      .select('*')
      .single();
    if (error) throw new Error(`Could not update interest signal: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase.from('user_interest_signals').insert(row).select('*').single();
  if (error) throw new Error(`Could not insert interest signal: ${error.message}`);
  return data;
}

function canonicalOnboardingSourceId(interestId) {
  return `onboarding:${interestId}`;
}

function canonicalPreferenceSourceId(interestId) {
  return `preference:${interestId}`;
}

function canonicalLimitSourceId(limitId) {
  return `limit:${limitId}`;
}

/**
 * Idempotent onboarding signals — one per topic at weight +8.
 */
async function createSignalsFromOnboarding(userId, preferences) {
  const created = [];
  for (const interest of preferences.selected_interests || []) {
    created.push(
      await setExplicitSignal(userId, {
        topic: interest,
        signal_type: 'onboarding_interest',
        source_type: 'onboarding',
        source_id: canonicalOnboardingSourceId(interest),
        weight: SIGNAL_WEIGHTS.onboarding_interest,
        is_explicit: true,
        expires_at: null,
        metadata: { interest_id: interest },
      })
    );
  }
  for (const topic of preferences.limited_topics || []) {
    created.push(
      await setExplicitSignal(userId, {
        topic,
        signal_type: 'manual_limit',
        source_type: 'onboarding',
        source_id: canonicalLimitSourceId(topic),
        weight: SIGNAL_WEIGHTS.manual_limit,
        is_explicit: true,
        expires_at: null,
        metadata: { limit_id: topic },
      })
    );
  }
  return created;
}

/**
 * Synchronize explicit preference signals with PUT /preferences payload.
 */
async function syncPreferencesSignals(userId, preferences = {}) {
  const interests = preferences.selected_interests || [];
  const limits = preferences.limited_topics || [];
  const supabase = getSupabaseAdmin();

  const { data: activeSignals } = await supabase
    .from('user_interest_signals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  const desiredInterestIds = new Set(interests);
  const desiredLimitIds = new Set(limits);

  for (const interestId of desiredInterestIds) {
    await setExplicitSignal(userId, {
      topic: interestId,
      signal_type: 'explicit_interest',
      source_type: 'preference',
      source_id: canonicalPreferenceSourceId(interestId),
      weight: SIGNAL_WEIGHTS.onboarding_interest,
      is_explicit: true,
      expires_at: null,
      metadata: { interest_id: interestId },
    });
  }

  for (const signal of activeSignals || []) {
    if (
      ['onboarding_interest', 'explicit_interest'].includes(signal.signal_type) &&
      !desiredInterestIds.has(signal.topic)
    ) {
      await deactivateSignals({
        userId,
        topic: signal.topic,
        signalType: signal.signal_type,
        sourceType: signal.source_type,
        sourceId: signal.source_id,
      });
    }
  }

  for (const limitId of desiredLimitIds) {
    await setExplicitSignal(userId, {
      topic: limitId,
      signal_type: 'manual_limit',
      source_type: 'preference',
      source_id: canonicalLimitSourceId(limitId),
      weight: SIGNAL_WEIGHTS.manual_limit,
      is_explicit: true,
      expires_at: null,
      metadata: { limit_id: limitId },
    });
  }

  for (const signal of activeSignals || []) {
    if (signal.signal_type === 'manual_limit' && !desiredLimitIds.has(signal.topic)) {
      await deactivateSignals({
        userId,
        topic: signal.topic,
        signalType: 'manual_limit',
        sourceType: signal.source_type,
        sourceId: signal.source_id,
      });
    }
  }

  return { interests: [...desiredInterestIds], limits: [...desiredLimitIds] };
}

async function countDistinctScanSources(userId, topic, signalType) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_interest_signals')
    .select('source_id')
    .eq('user_id', userId)
    .eq('topic', topic)
    .eq('signal_type', signalType)
    .eq('source_type', 'scan')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((row) => row.source_id)).size;
}

function buildScanSignalPayloads(productRecord, analysisRecord, scanId) {
  const profile = classifyProduct(productRecord, {
    analysis: analysisRecord,
    scanCount: 1,
    isSaved: false,
  });
  const payloads = [];

  if (profile.productCategory) {
    payloads.push({
      topic: profile.productCategory,
      signal_type: 'scan_category',
      weight: SIGNAL_WEIGHTS.scan_once,
    });
  }

  for (const ingredient of profile.meaningfulIngredients.slice(0, 5)) {
    payloads.push({
      topic: normalizeTopic(ingredient),
      signal_type: 'scan_ingredient',
      weight: SIGNAL_WEIGHTS.scan_once,
    });
  }

  if (profile.activeIngredient) {
    payloads.push({
      topic: normalizeTopic(profile.activeIngredient),
      signal_type: 'scan_active_ingredient',
      weight: SIGNAL_WEIGHTS.scan_once,
    });
  } else if (profile.primaryIngredient) {
    payloads.push({
      topic: normalizeTopic(profile.primaryIngredient),
      signal_type: 'scan_ingredient',
      weight: SIGNAL_WEIGHTS.scan_once,
    });
  }

  for (const topic of profile.labelTopics || []) {
    payloads.push({
      topic: normalizeTopic(topic),
      signal_type: 'label_literacy_topic',
      weight: SIGNAL_WEIGHTS.scan_once,
    });
  }

  return { payloads, profile };
}

/**
 * Write scan-derived signals using persisted scan ID (idempotent per scan).
 */
async function recordScanSignals(userId, scanId, productRecord, analysisRecord) {
  const sourceId = String(scanId);
  const { payloads } = buildScanSignalPayloads(productRecord, analysisRecord, scanId);
  const results = [];

  for (const payload of payloads) {
    const existing = await findSignalByKey({
      userId,
      topic: payload.topic,
      signalType: payload.signal_type,
      sourceType: 'scan',
      sourceId,
    });
    if (existing) {
      results.push(existing);
      continue;
    }

    let weight = payload.weight;
    if (payload.signal_type === 'scan_category') {
      const distinct = await countDistinctScanSources(userId, payload.topic, payload.signal_type);
      if (distinct >= 1) weight += REPEATED_CATEGORY_BOOST;
    }
    if (payload.signal_type === 'scan_ingredient' || payload.signal_type === 'scan_active_ingredient') {
      const distinct = await countDistinctScanSources(userId, payload.topic, payload.signal_type);
      if (distinct + 1 >= REPEATED_INGREDIENT_THRESHOLD) {
        weight += SIGNAL_WEIGHTS.repeated_ingredient;
      }
    }

    results.push(
      await setExplicitSignal(userId, {
        topic: payload.topic,
        signal_type: payload.signal_type,
        source_type: 'scan',
        source_id: sourceId,
        weight,
        is_explicit: false,
        expires_at: addDays(SIGNAL_DECAY_DAYS.scan_once),
        metadata: { scan_id: sourceId },
      })
    );
  }

  return results;
}

function buildSaveSignalPayloads(productRecord, analysisRecord) {
  const profile = classifyProduct(productRecord, {
    analysis: analysisRecord,
    scanCount: 1,
    isSaved: true,
  });
  const payloads = [];

  if (profile.productCategory) {
    payloads.push({
      topic: profile.productCategory,
      signal_type: 'saved_category',
      weight: SIGNAL_WEIGHTS.saved_category,
    });
  }

  for (const ingredient of profile.meaningfulIngredients.slice(0, 5)) {
    payloads.push({
      topic: normalizeTopic(ingredient),
      signal_type: 'saved_ingredient',
      weight: SIGNAL_WEIGHTS.saved_ingredient,
    });
  }

  if (profile.activeIngredient) {
    payloads.push({
      topic: normalizeTopic(profile.activeIngredient),
      signal_type: 'saved_active_ingredient',
      weight: SIGNAL_WEIGHTS.saved_active_ingredient,
    });
  }

  return payloads;
}

/**
 * Write save-derived signals (idempotent per product ID).
 * Unsave is not implemented in the API; when added, call deactivateSaveSignals for that product.
 */
async function recordSaveSignals(userId, productId, productRecord, analysisRecord = null) {
  const sourceId = String(productId);
  const payloads = buildSaveSignalPayloads(productRecord, analysisRecord);
  const results = [];

  for (const payload of payloads) {
    results.push(
      await setExplicitSignal(userId, {
        topic: payload.topic,
        signal_type: payload.signal_type,
        source_type: 'save',
        source_id: sourceId,
        weight: payload.weight,
        is_explicit: false,
        expires_at: null,
        metadata: { product_id: sourceId },
      })
    );
  }

  return results;
}

async function deactivateSaveSignals(userId, productId) {
  await deactivateSignals({
    userId,
    sourceType: 'save',
    sourceId: String(productId),
  });
}

const feedbackDedup = new Set();

function feedbackDedupKey(userId, storyId, feedbackType) {
  return `${userId}:${storyId}:${feedbackType}`;
}

async function recordStoryFeedback(userId, storyId, feedbackType, metadata = {}) {
  const dedupKey = feedbackDedupKey(userId, storyId, feedbackType);
  if (feedbackDedup.has(dedupKey)) {
    return { deduped: true };
  }
  feedbackDedup.add(dedupKey);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_story_feedback')
    .insert({
      user_id: userId,
      story_id: storyId,
      feedback_type: feedbackType,
      metadata,
    })
    .select('*')
    .single();
  if (error && !isUniqueViolation(error)) {
    throw new Error(`Could not record story feedback: ${error.message}`);
  }

  const weightMap = {
    opened: { signal_type: 'story_opened', weight: SIGNAL_WEIGHTS.story_opened },
    source_opened: { signal_type: 'source_opened', weight: SIGNAL_WEIGHTS.source_opened },
    saved: { signal_type: 'story_saved', weight: SIGNAL_WEIGHTS.story_saved },
    dismissed: { signal_type: 'story_dismissed', weight: SIGNAL_WEIGHTS.story_dismissed },
    more_like_this: { signal_type: 'more_like_this', weight: SIGNAL_WEIGHTS.more_like_this, is_explicit: true },
    less_like_this: { signal_type: 'less_like_this', weight: SIGNAL_WEIGHTS.less_like_this, is_explicit: true },
    not_relevant: { signal_type: 'not_relevant', weight: SIGNAL_WEIGHTS.not_relevant, is_explicit: true },
  };
  const mapping = weightMap[feedbackType];
  if (!mapping) return data;

  const topics =
    feedbackType === 'not_relevant'
      ? [
          ...(metadata.topics || []),
          metadata.topic,
          metadata.storyCategory,
          metadata.lifestyleCategory,
        ].filter(Boolean)
      : [metadata.topic || metadata.storyCategory || metadata.lifestyleCategory || 'general'];

  const uniqueTopics = [...new Set(topics.map(normalizeTopic))];

  for (const topic of uniqueTopics) {
    await setExplicitSignal(userId, {
      topic,
      signal_type: mapping.signal_type,
      source_type: 'story_feedback',
      source_id: `${storyId}:${feedbackType}:${topic}`,
      weight: mapping.weight,
      is_explicit: Boolean(mapping.is_explicit),
      expires_at: mapping.is_explicit
        ? feedbackType === 'not_relevant'
          ? addDays(SIGNAL_DECAY_DAYS.not_relevant)
          : null
        : addDays(SIGNAL_DECAY_DAYS.story_opened),
      metadata: { story_id: storyId, feedback_type: feedbackType, ...metadata },
    });

    if (feedbackType === 'not_relevant') {
      const { data: weakSignals } = await supabase
        .from('user_interest_signals')
        .select('*')
        .eq('user_id', userId)
        .eq('topic', topic)
        .eq('is_active', true)
        .eq('is_explicit', false);

      for (const signal of weakSignals || []) {
        if (
          ['scan_category', 'scan_ingredient', 'scan_active_ingredient', 'label_literacy_topic'].includes(
            signal.signal_type
          ) &&
          Math.abs(Number(signal.weight)) <= REPEATED_CATEGORY_BOOST
        ) {
          await deactivateSignals({
            userId,
            topic: signal.topic,
            signalType: signal.signal_type,
            sourceType: signal.source_type,
            sourceId: signal.source_id,
          });
        }
      }
    }
  }

  return data;
}

async function deactivateInferredTopic(userId, topic) {
  await deactivateSignals({
    userId,
    topic: normalizeTopic(topic),
    signalType: null,
    sourceType: null,
    sourceId: null,
  });

  return setExplicitSignal(userId, {
    topic: normalizeTopic(topic),
    signal_type: 'manual_limit',
    source_type: 'profile_edit',
    source_id: 'removed_inferred',
    weight: SIGNAL_WEIGHTS.manual_limit,
    is_explicit: true,
    expires_at: null,
  });
}

function aggregateSignals(signals = []) {
  const now = Date.now();
  const topics = new Map();
  const excluded = new Set();

  for (const signal of signals) {
    if (!signal.is_active) continue;
    if (signal.expires_at && new Date(signal.expires_at).getTime() < now) continue;

    const topic = signal.topic;
    const current = topics.get(topic) || {
      topic,
      explicitWeight: 0,
      inferredWeight: 0,
      finalWeight: 0,
      sourceSummary: [],
    };

    if (signal.is_explicit) current.explicitWeight += Number(signal.weight || 0);
    else current.inferredWeight += Number(signal.weight || 0);

    if (signal.signal_type === 'manual_limit' || signal.signal_type === 'not_relevant') {
      excluded.add(topic);
    }

    if (signal.source_type === 'onboarding' || signal.source_type === 'preference') {
      current.sourceSummary.push('Selected in preferences');
    } else if (signal.signal_type === 'story_opened') {
      current.sourceSummary.push('Opened related stories');
    } else if (signal.signal_type === 'saved_category' || signal.signal_type === 'saved_ingredient') {
      current.sourceSummary.push('Saved related products');
    } else if (signal.source_type === 'scan') {
      current.sourceSummary.push('Product scans');
    }

    topics.set(topic, current);
  }

  const topicList = [...topics.values()].map((item) => ({
    ...item,
    finalWeight: item.explicitWeight + item.inferredWeight,
    sourceSummary: [...new Set(item.sourceSummary)].slice(0, 4),
  }));

  return {
    topics: topicList.sort((a, b) => b.finalWeight - a.finalWeight),
    excludedTopics: [...excluded],
  };
}

function determineProfileStage({ profile, preferences, meaningfulActions = 0, hasSafetyEvent = false }) {
  if (hasSafetyEvent) return 'safety_event';
  if (!profile || profile.onboarding_status !== 'completed') return 'cold_start';
  if (meaningfulActions < 3) {
    return preferences?.selected_interests?.length ? 'preference_led' : 'cold_start';
  }
  if (meaningfulActions < 6) return 'early_behavior';
  return 'established';
}

async function buildNormalizedInterestProfile(userId, { scans = [], savedProducts = [] } = {}) {
  const supabase = getSupabaseAdmin();
  const [{ data: profile }, { data: preferences }, { data: signals }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_interest_signals').select('*').eq('user_id', userId).eq('is_active', true),
  ]);

  const meaningfulActions = scans.length + savedProducts.length;
  const aggregated = aggregateSignals(signals || []);
  const profileStage = determineProfileStage({
    profile,
    preferences,
    meaningfulActions,
  });

  return {
    profileStage,
    topics: aggregated.topics,
    excludedTopics: aggregated.excludedTopics,
    preferences: preferences || {
      selected_interests: [],
      selected_use_cases: [],
      content_balance: DEFAULT_CONTENT_BALANCE,
      limited_topics: [],
      preferred_feed_mix: {},
      notifications: {},
    },
    profile,
  };
}

module.exports = {
  upsertInterestSignal,
  setExplicitSignal,
  createSignalsFromOnboarding,
  syncPreferencesSignals,
  recordScanSignals,
  recordSaveSignals,
  deactivateSaveSignals,
  recordStoryFeedback,
  deactivateInferredTopic,
  buildNormalizedInterestProfile,
  aggregateSignals,
  determineProfileStage,
  buildScanSignalPayloads,
  buildSaveSignalPayloads,
  SIGNAL_WEIGHTS,
  REPEATED_INGREDIENT_THRESHOLD,
};
