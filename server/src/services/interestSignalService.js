const { getSupabaseAdmin } = require('./supabase');
const {
  DEFAULT_CONTENT_BALANCE,
  SIGNAL_WEIGHTS,
  SIGNAL_CAPS,
  SIGNAL_DECAY_DAYS,
} = require('../content/onboardingOptions');

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function capWeight(signalType, weight) {
  const cap = SIGNAL_CAPS[signalType];
  if (cap == null) return weight;
  if (weight > 0) return Math.min(weight, cap);
  return Math.max(weight, -cap);
}

async function upsertInterestSignal(userId, payload) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const sourceId = payload.source_id || null;

  let query = supabase
    .from('user_interest_signals')
    .select('*')
    .eq('user_id', userId)
    .eq('topic', payload.topic)
    .eq('signal_type', payload.signal_type)
    .eq('source_type', payload.source_type);

  query = sourceId ? query.eq('source_id', sourceId) : query.is('source_id', null);
  const { data: prior, error: readError } = await query.maybeSingle();
  if (readError) throw new Error(`Could not read interest signal: ${readError.message}`);

  const mergedWeight = capWeight(payload.signal_type, (prior?.weight || 0) + payload.weight);
  const row = {
    user_id: userId,
    topic: payload.topic,
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

  const { data, error } = await supabase
    .from('user_interest_signals')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`Could not insert interest signal: ${error.message}`);
  return data;
}

async function createSignalsFromOnboarding(userId, preferences) {
  const created = [];
  for (const interest of preferences.selected_interests || []) {
    created.push(
      await upsertInterestSignal(userId, {
        topic: interest,
        signal_type: 'onboarding_interest',
        source_type: 'onboarding',
        source_id: 'interests',
        weight: SIGNAL_WEIGHTS.onboarding_interest,
        is_explicit: true,
        expires_at: null,
      })
    );
  }
  for (const topic of preferences.limited_topics || []) {
    created.push(
      await upsertInterestSignal(userId, {
        topic,
        signal_type: 'manual_limit',
        source_type: 'onboarding',
        source_id: 'limited_topics',
        weight: SIGNAL_WEIGHTS.manual_limit,
        is_explicit: true,
        expires_at: null,
      })
    );
  }
  return created;
}

async function recordStoryFeedback(userId, storyId, feedbackType, metadata = {}) {
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
  if (error) throw new Error(`Could not record story feedback: ${error.message}`);

  const topic = metadata.topic || metadata.storyCategory || 'general';
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
  if (mapping) {
    await upsertInterestSignal(userId, {
      topic,
      signal_type: mapping.signal_type,
      source_type: 'story_feedback',
      source_id: storyId,
      weight: mapping.weight,
      is_explicit: Boolean(mapping.is_explicit),
      expires_at: mapping.is_explicit
        ? feedbackType === 'not_relevant'
          ? addDays(SIGNAL_DECAY_DAYS.not_relevant)
          : null
        : addDays(SIGNAL_DECAY_DAYS.story_opened),
      metadata,
    });
  }
  return data;
}

async function deactivateInferredTopic(userId, topic) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('user_interest_signals')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('topic', topic)
    .eq('is_explicit', false);

  return upsertInterestSignal(userId, {
    topic,
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

    if (signal.source_type === 'onboarding') {
      current.sourceSummary.push('Selected during onboarding');
    } else if (signal.signal_type === 'story_opened') {
      current.sourceSummary.push('Opened related stories');
    } else if (signal.signal_type === 'saved_category') {
      current.sourceSummary.push('Saved related products');
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

function determineProfileStage({ profile, preferences, signals, meaningfulActions = 0, hasSafetyEvent = false }) {
  if (hasSafetyEvent) return 'safety_event';
  if (!profile || profile.onboarding_status !== 'completed') return 'cold_start';
  if (meaningfulActions < 3) return preferences?.selected_interests?.length ? 'preference_led' : 'cold_start';
  if (meaningfulActions < 6) return 'early_behavior';
  return 'established';
}

async function buildNormalizedInterestProfile(userId, { scans = [], savedProducts = [] } = {}) {
  const supabase = getSupabaseAdmin();
  const [{ data: profile }, { data: preferences }, { data: signals }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('user_interest_signals')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);

  const meaningfulActions = scans.length + savedProducts.length;
  const aggregated = aggregateSignals(signals || []);
  const profileStage = determineProfileStage({
    profile,
    preferences,
    signals,
    meaningfulActions,
  });

  const feedMix = {
    explicitPreferences: profileStage === 'cold_start' ? 0.35 : 0.5,
    productSignals: profileStage === 'established' ? 0.3 : 0.2,
    generalLifestyle: profileStage === 'established' ? 0.2 : 0.25,
    safetyAndTrends: 0.1,
  };

  return {
    profileStage,
    topics: aggregated.topics,
    excludedTopics: aggregated.excludedTopics,
    feedMix,
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
  createSignalsFromOnboarding,
  recordStoryFeedback,
  deactivateInferredTopic,
  buildNormalizedInterestProfile,
  aggregateSignals,
  determineProfileStage,
  SIGNAL_WEIGHTS,
};
