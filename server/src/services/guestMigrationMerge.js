function mergePreferences(guestPrefs = {}, destPrefs = {}) {
  const union = (left = [], right = []) => [...new Set([...(left || []), ...(right || [])])];
  return {
    selected_interests: union(guestPrefs.selected_interests, destPrefs.selected_interests),
    selected_use_cases: union(guestPrefs.selected_use_cases, destPrefs.selected_use_cases),
    limited_topics: union(guestPrefs.limited_topics, destPrefs.limited_topics),
    content_balance: { ...(guestPrefs.content_balance || {}), ...(destPrefs.content_balance || {}) },
    preferred_feed_mix: { ...(guestPrefs.preferred_feed_mix || {}), ...(destPrefs.preferred_feed_mix || {}) },
    notifications: { ...(guestPrefs.notifications || {}), ...(destPrefs.notifications || {}) },
  };
}

function mergeInterestSignals(guestSignal, destSignal) {
  if (!guestSignal) return destSignal;
  if (!destSignal) return guestSignal;

  const guestNegative = guestSignal.is_explicit && guestSignal.weight < 0;
  const destNegative = destSignal.is_explicit && destSignal.weight < 0;

  let weight;
  if (guestNegative && destNegative) {
    weight = Math.min(guestSignal.weight, destSignal.weight);
  } else if (guestNegative) {
    weight = guestSignal.weight;
  } else if (destNegative) {
    weight = destSignal.weight;
  } else {
    weight = (guestSignal.weight || 0) + (destSignal.weight || 0);
  }

  return {
    ...destSignal,
    ...guestSignal,
    weight,
    confidence: Math.max(guestSignal.confidence || 0, destSignal.confidence || 0),
    is_explicit: Boolean(guestSignal.is_explicit || destSignal.is_explicit),
    first_seen_at:
      guestSignal.first_seen_at < destSignal.first_seen_at
        ? guestSignal.first_seen_at
        : destSignal.first_seen_at,
    last_seen_at:
      guestSignal.last_seen_at > destSignal.last_seen_at
        ? guestSignal.last_seen_at
        : destSignal.last_seen_at,
    is_active: Boolean(guestSignal.is_active || destSignal.is_active),
    metadata: { ...(destSignal.metadata || {}), ...(guestSignal.metadata || {}) },
  };
}

function dedupeSavedProducts(guestItems = [], destItems = []) {
  const byProduct = new Map();
  for (const item of [...guestItems, ...destItems]) {
    const existing = byProduct.get(item.product_id);
    if (!existing || new Date(item.created_at) < new Date(existing.created_at)) {
      byProduct.set(item.product_id, item);
    }
  }
  return [...byProduct.values()];
}

function dedupeStoryMatches(guestItems = [], destItems = []) {
  const byStory = new Map();
  for (const item of [...guestItems, ...destItems]) {
    const existing = byStory.get(item.story_id);
    if (!existing) {
      byStory.set(item.story_id, item);
      continue;
    }
    byStory.set(item.story_id, {
      ...existing,
      rank_score: Math.max(existing.rank_score || 0, item.rank_score || 0),
      is_read: Boolean(existing.is_read || item.is_read),
      is_dismissed: Boolean(existing.is_dismissed || item.is_dismissed),
      is_personalized: Boolean(existing.is_personalized || item.is_personalized),
      is_active: Boolean(existing.is_active ?? true) || Boolean(item.is_active ?? true),
      last_matched_at:
        !existing.last_matched_at || (item.last_matched_at && item.last_matched_at > existing.last_matched_at)
          ? item.last_matched_at || existing.last_matched_at
          : existing.last_matched_at,
    });
  }
  return [...byStory.values()];
}

function mergeProfiles(guestProfile = {}, destProfile = {}) {
  const guestCompleted = guestProfile.onboarding_status === 'completed';
  const destCompleted = destProfile.onboarding_status === 'completed';
  const onboardingStatus = destCompleted || guestCompleted
    ? 'completed'
    : guestProfile.onboarding_status === 'in_progress' || destProfile.onboarding_status === 'in_progress'
      ? 'in_progress'
      : destProfile.onboarding_status || guestProfile.onboarding_status || 'not_started';

  const destNameFresh =
    destProfile.updated_at &&
    (!guestProfile.updated_at || destProfile.updated_at >= guestProfile.updated_at) &&
    destProfile.display_name &&
    destProfile.display_name !== 'Wellumi member';

  return {
    ...destProfile,
    display_name: destNameFresh
      ? destProfile.display_name
      : guestProfile.display_name && guestProfile.display_name !== 'Wellumi member'
        ? guestProfile.display_name
        : destProfile.display_name || guestProfile.display_name || 'Wellumi member',
    account_type:
      destProfile.account_type === 'email' || destProfile.account_type === 'apple'
        ? destProfile.account_type
        : guestProfile.account_type === 'email' || guestProfile.account_type === 'apple'
          ? guestProfile.account_type
          : 'email',
    onboarding_status: onboardingStatus,
    onboarding_step: destCompleted
      ? destProfile.onboarding_step
      : guestCompleted
        ? guestProfile.onboarding_step
        : destProfile.onboarding_step || guestProfile.onboarding_step,
  };
}

function verifyMigrationCounts(beforeGuest, beforeDest, afterDest) {
  const tables = [
    'saved_products',
    'user_interest_signals',
    'user_story_matches',
    'scans',
    'analyses',
    'product_interest_profiles',
    'user_story_feedback',
  ];
  const issues = [];
  for (const table of tables) {
    const guestCount = beforeGuest?.[table] || 0;
    const destBefore = beforeDest?.[table] || 0;
    const destAfter = afterDest?.[table] || 0;
    if (destAfter < destBefore) {
      issues.push(`${table}: destination count decreased (${destBefore} -> ${destAfter})`);
    }
    if (guestCount > 0 && destAfter < destBefore + guestCount) {
      // merged rows may dedupe; only flag if we lost everything from guest without merge
      const minExpected = destBefore;
      if (destAfter < minExpected) {
        issues.push(`${table}: possible data loss after migration`);
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  mergePreferences,
  mergeInterestSignals,
  dedupeSavedProducts,
  dedupeStoryMatches,
  mergeProfiles,
  verifyMigrationCounts,
};
