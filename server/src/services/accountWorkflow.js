const { getSupabaseAdmin } = require('./supabase');

const USER_OWNED_TABLES = [
  { table: 'user_story_feedback', column: 'user_id' },
  { table: 'user_interest_signals', column: 'user_id' },
  { table: 'user_preferences', column: 'user_id' },
  { table: 'user_story_matches', column: 'user_id' },
  { table: 'product_interest_profiles', column: 'user_id' },
  { table: 'user_feed_refresh', column: 'user_id' },
  { table: 'saved_products', column: 'user_id' },
  { table: 'scans', column: 'user_id' },
  { table: 'analyses', column: 'user_id' },
  { table: 'profiles', column: 'id' },
];

async function countUserRows(userId) {
  const supabase = getSupabaseAdmin();
  const counts = {};
  for (const entry of USER_OWNED_TABLES) {
    const { count, error } = await supabase
      .from(entry.table)
      .select('*', { count: 'exact', head: true })
      .eq(entry.column, userId);
    if (error) throw new Error(`Could not count ${entry.table}: ${error.message}`);
    counts[entry.table] = count || 0;
  }
  return counts;
}

async function migrateGuestOwnership(fromUserId, toUserId) {
  if (fromUserId === toUserId) return { migrated: false, counts: await countUserRows(toUserId) };

  const supabase = getSupabaseAdmin();
  const beforeFrom = await countUserRows(fromUserId);
  const beforeTo = await countUserRows(toUserId);

  for (const entry of USER_OWNED_TABLES) {
    if (entry.table === 'profiles') continue;
    const { error } = await supabase
      .from(entry.table)
      .update({ [entry.column]: toUserId })
      .eq(entry.column, fromUserId);
    if (error) throw new Error(`Could not migrate ${entry.table}: ${error.message}`);
  }

  const afterTo = await countUserRows(toUserId);
  return {
    migrated: true,
    beforeFrom,
    beforeTo,
    afterTo,
  };
}

async function deleteAccount(userId) {
  const supabase = getSupabaseAdmin();
  for (const entry of [...USER_OWNED_TABLES].reverse()) {
    const { error } = await supabase.from(entry.table).delete().eq(entry.column, userId);
    if (error) throw new Error(`Could not delete from ${entry.table}: ${error.message}`);
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`Could not delete auth user: ${authError.message}`);
  return { deleted: true };
}

async function markAccountUpgraded(userId, accountType) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      account_type: accountType,
      last_profile_sync_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not update account type: ${error.message}`);
  return data;
}

module.exports = {
  countUserRows,
  migrateGuestOwnership,
  deleteAccount,
  markAccountUpgraded,
  USER_OWNED_TABLES,
};
