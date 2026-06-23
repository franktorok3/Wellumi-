const { getSupabaseAdmin } = require('./supabase');
const {
  DEFAULT_CONTENT_BALANCE,
  BALANCE_LEVELS,
  ONBOARDING_INTERESTS,
  ONBOARDING_USE_CASES,
  CONTENT_BALANCE_CATEGORIES,
  LIMITABLE_TOPICS,
} = require('../content/onboardingOptions');
const { createSignalsFromOnboarding } = require('./interestSignalService');

const VALID_INTEREST_IDS = new Set(ONBOARDING_INTERESTS.map((item) => item.id));
const VALID_USE_CASE_IDS = new Set(ONBOARDING_USE_CASES.map((item) => item.id));
const VALID_LIMIT_IDS = new Set(LIMITABLE_TOPICS.map((item) => item.id));
const VALID_BALANCE_IDS = new Set(CONTENT_BALANCE_CATEGORIES.map((item) => item.id));

function validatePreferences(payload = {}) {
  const selectedInterests = (payload.selected_interests || []).filter((id) => VALID_INTEREST_IDS.has(id));
  const selectedUseCases = (payload.selected_use_cases || []).filter((id) => VALID_USE_CASE_IDS.has(id));
  const limitedTopics = (payload.limited_topics || []).filter((id) => VALID_LIMIT_IDS.has(id));

  const contentBalance = { ...DEFAULT_CONTENT_BALANCE };
  for (const [key, value] of Object.entries(payload.content_balance || {})) {
    if (VALID_BALANCE_IDS.has(key) && BALANCE_LEVELS.includes(value)) {
      contentBalance[key] = value;
    }
  }

  return {
    selected_interests: selectedInterests,
    selected_use_cases: selectedUseCases,
    content_balance: contentBalance,
    limited_topics: limitedTopics,
    preferred_feed_mix: payload.preferred_feed_mix || {},
    notifications: payload.notifications || {},
  };
}

async function ensureProfile(userId) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      display_name: 'Wellumi member',
      account_type: 'guest',
      onboarding_status: 'not_started',
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not create profile: ${error.message}`);

  await supabase.from('user_preferences').upsert({ user_id: userId });
  return data;
}

async function getMe(userId) {
  const supabase = getSupabaseAdmin();
  await ensureProfile(userId);
  const [{ data: profile }, { data: preferences }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  return { profile, preferences: preferences || null };
}

async function patchMe(userId, patch = {}) {
  const supabase = getSupabaseAdmin();
  const allowed = {};
  if (patch.display_name != null) allowed.display_name = String(patch.display_name).slice(0, 80);
  if (patch.last_seen_at != null) allowed.last_seen_at = patch.last_seen_at;

  const { data: current } = await supabase.from('profiles').select('profile_version').eq('id', userId).maybeSingle();

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...allowed,
      last_profile_sync_at: new Date().toISOString(),
      profile_version: (current?.profile_version || 1) + (Object.keys(allowed).length ? 1 : 0),
    })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw new Error(`Could not update profile: ${error.message}`);
  return data;
}

async function getPreferences(userId) {
  const supabase = getSupabaseAdmin();
  await ensureProfile(userId);
  const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not load preferences: ${error.message}`);
  return data || { user_id: userId, ...validatePreferences({}) };
}

async function putPreferences(userId, payload) {
  const supabase = getSupabaseAdmin();
  const validated = validatePreferences(payload);
  const { data: current } = await supabase
    .from('profiles')
    .select('preference_version')
    .eq('id', userId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: userId,
      ...validated,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not save preferences: ${error.message}`);

  await supabase
    .from('profiles')
    .update({
      preference_version: (current?.preference_version || 1) + 1,
      last_profile_sync_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return data;
}

async function startOnboarding(userId) {
  const supabase = getSupabaseAdmin();
  await ensureProfile(userId);
  const { data, error } = await supabase
    .from('profiles')
    .update({
      onboarding_status: 'in_progress',
      onboarding_step: 'welcome',
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not start onboarding: ${error.message}`);
  return data;
}

async function saveOnboardingStep(userId, { step, draft = {} }) {
  const supabase = getSupabaseAdmin();
  if (draft.selected_interests || draft.selected_use_cases || draft.content_balance || draft.limited_topics) {
    await putPreferences(userId, {
      ...(await getPreferences(userId)),
      ...draft,
    });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      onboarding_status: 'in_progress',
      onboarding_step: step,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not save onboarding step: ${error.message}`);
  return data;
}

async function completeOnboarding(userId, finalPreferences = {}) {
  const supabase = getSupabaseAdmin();
  const preferences = await putPreferences(userId, finalPreferences);
  await createSignalsFromOnboarding(userId, preferences);

  const { data, error } = await supabase
    .from('profiles')
    .update({
      onboarding_status: 'completed',
      onboarding_step: 'completed',
      onboarding_completed_at: new Date().toISOString(),
      preference_version: 1,
      last_profile_sync_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not complete onboarding: ${error.message}`);

  const { refreshUserFeed } = require('./wellnessFeedWorkflow');
  await refreshUserFeed(userId, { force: true });
  return { profile: data, preferences };
}

module.exports = {
  ensureProfile,
  getMe,
  patchMe,
  getPreferences,
  putPreferences,
  startOnboarding,
  saveOnboardingStep,
  completeOnboarding,
  validatePreferences,
};
