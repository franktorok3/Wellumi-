const crypto = require('crypto');
const { getSupabaseAdmin } = require('./supabase');
const { verifyMigrationCounts } = require('./guestMigrationMerge');

const TOKEN_TTL_MINUTES = 15;

function hashToken(plainToken) {
  return crypto.createHash('sha256').update(String(plainToken)).digest('hex');
}

function generatePlainToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function assertGuestSession(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw new Error(`Could not verify guest session: ${error.message}`);
  if (!data?.user) throw new Error('Guest session not found.');
  if (!data.user.is_anonymous) {
    const error = new Error('Migration tokens are only available for guest sessions.');
    error.statusCode = 403;
    throw error;
  }
  return data.user;
}

async function createMigrationToken(guestUserId) {
  await assertGuestSession(guestUserId);
  const supabase = getSupabaseAdmin();
  const plainToken = generatePlainToken();
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from('guest_migration_tokens').insert({
    guest_user_id: guestUserId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Could not create migration token: ${error.message}`);

  return {
    migration_token: plainToken,
    expires_at: expiresAt,
  };
}

async function completeGuestMigration(destinationUserId, plainToken) {
  if (!plainToken) {
    const error = new Error('migration_token is required.');
    error.statusCode = 400;
    throw error;
  }

  const supabase = getSupabaseAdmin();
  const tokenHash = hashToken(plainToken);

  const { data, error } = await supabase.rpc('complete_guest_account_upgrade', {
    p_token_hash: tokenHash,
    p_destination_user_id: destinationUserId,
  });
  if (error) {
    const migrationError = new Error(error.message || 'Guest migration failed.');
    migrationError.statusCode = 400;
    throw migrationError;
  }

  const verification = verifyMigrationCounts(
    data.before_guest,
    data.before_destination,
    data.after_destination
  );

  return {
    ...data,
    verification,
  };
}

module.exports = {
  TOKEN_TTL_MINUTES,
  hashToken,
  createMigrationToken,
  completeGuestMigration,
};
