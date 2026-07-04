const { getSupabaseAdmin } = require('./supabase');
const { hashToken } = require('./guestMigrationService');
const { ONBOARDING_INTERESTS } = require('../content/onboardingOptions');

const INTEREST_LABELS = Object.fromEntries(ONBOARDING_INTERESTS.map((item) => [item.id, item.label]));

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatCountLine(count, singular, plural) {
  if (!count) return null;
  return `${count} ${pluralize(count, singular, plural)}`;
}

async function loadValidMigrationToken(plainToken) {
  const supabase = getSupabaseAdmin();
  const tokenHash = hashToken(plainToken);
  const { data, error } = await supabase
    .from('guest_migration_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Could not read migration token: ${error.message}`);
  if (!data) {
    const tokenError = new Error('Migration token is invalid or expired.');
    tokenError.statusCode = 400;
    throw tokenError;
  }
  return data;
}

async function previewGuestMigration(destinationUserId, plainToken) {
  const token = await loadValidMigrationToken(plainToken);
  const guestUserId = token.guest_user_id;
  const supabase = getSupabaseAdmin();

  if (guestUserId === destinationUserId) {
    return {
      headline: 'Your account is already linked.',
      guest_user_id: guestUserId,
      destination_user_id: destinationUserId,
      linked: true,
      lines: [],
      has_destination_data: false,
    };
  }

  const [
    guestScans,
    guestSaved,
    guestPrefs,
    destScans,
    destSaved,
    destPrefs,
    destProfile,
  ] = await Promise.all([
    supabase.from('scans').select('id', { count: 'exact', head: true }).eq('user_id', guestUserId),
    supabase.from('saved_products').select('product_id').eq('user_id', guestUserId),
    supabase.from('user_preferences').select('*').eq('user_id', guestUserId).maybeSingle(),
    supabase.from('scans').select('id', { count: 'exact', head: true }).eq('user_id', destinationUserId),
    supabase.from('saved_products').select('product_id').eq('user_id', destinationUserId),
    supabase.from('user_preferences').select('*').eq('user_id', destinationUserId).maybeSingle(),
    supabase.from('profiles').select('onboarding_status').eq('id', destinationUserId).maybeSingle(),
  ]);

  const destProductIds = new Set((destSaved.data || []).map((row) => row.product_id));
  const guestOnlySaved = (guestSaved.data || []).filter((row) => !destProductIds.has(row.product_id));

  const guestInterests = guestPrefs.data?.selected_interests || [];
  const interestLabels = guestInterests
    .map((id) => INTEREST_LABELS[id] || id.replace(/_/g, ' '))
    .slice(0, 4);

  const hasFeedPreferences =
    Object.keys(guestPrefs.data?.content_balance || {}).length > 0 ||
    (guestPrefs.data?.limited_topics || []).length > 0;

  const lines = [
    formatCountLine(guestScans.count || 0, 'scan'),
    formatCountLine(guestOnlySaved.length, 'saved product'),
  ].filter(Boolean);

  if (interestLabels.length) {
    lines.push(`your selected interests (${interestLabels.join(', ')})`);
  }
  if (hasFeedPreferences) {
    lines.push('your feed preferences');
  }

  const hasDestinationData =
    (destScans.count || 0) > 0 ||
    (destSaved.data || []).length > 0 ||
    (destPrefs.data?.selected_interests || []).length > 0 ||
    destProfile.data?.onboarding_status === 'completed';

  return {
    headline: 'Add this guest activity to your account?',
    guest_user_id: guestUserId,
    destination_user_id: destinationUserId,
    linked: false,
    lines,
    counts: {
      scans: guestScans.count || 0,
      saved_products: guestOnlySaved.length,
      interest_count: guestInterests.length,
      has_feed_preferences: hasFeedPreferences,
    },
    has_destination_data: hasDestinationData,
    destination_summary: hasDestinationData
      ? 'We found existing activity on this email account.'
      : null,
  };
}

module.exports = {
  previewGuestMigration,
};
