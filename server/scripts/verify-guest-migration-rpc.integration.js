/**
 * Integration tests for complete_guest_account_upgrade RPC.
 *
 * Requires migrations 006 + 007 applied on the target Supabase project.
 *
 * Run:
 *   WELLUMI_RUN_RPC_INTEGRATION=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... npm run verify:guest-migration-rpc
 *
 * Without WELLUMI_RUN_RPC_INTEGRATION=1 the script exits 0 with SKIP.
 * With the flag set, missing RPC or failed assertions exit 1.
 */
require('dotenv').config();

const assert = require('assert');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const RUN = process.env.WELLUMI_RUN_RPC_INTEGRATION === '1';
const URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function hashToken(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function randomEmail(label) {
  return `wellumi.rpc.${label}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}@example.com`;
}

async function countRows(supabase, table, userId, column = 'user_id') {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count || 0;
}

async function snapshotUser(supabase, userId) {
  const tables = [
    'profiles',
    'user_preferences',
    'user_interest_signals',
    'saved_products',
    'user_story_matches',
    'scans',
    'analyses',
    'product_interest_profiles',
    'user_feed_refresh',
    'user_story_feedback',
  ];
  const snapshot = {};
  for (const table of tables) {
    snapshot[table] = await countRows(supabase, table, userId, table === 'profiles' ? 'id' : 'user_id');
  }
  return snapshot;
}

async function createAnonymousGuestUser() {
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is required to create anonymous guest users for RPC integration tests');
  }
  const anonClient = createClient(URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anonClient.auth.signInAnonymously();
  if (error) throw new Error(`create anonymous guest: ${error.message}`);
  return data.user;
}

async function createEmailUser(supabase, label) {
  const email = randomEmail(label);
  const password = `Test-${crypto.randomBytes(12).toString('hex')}!9`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`create user ${label}: ${error.message}`);
  return { user: data.user, email, password };
}

async function ensureProfile(supabase, userId, patch = {}) {
  await supabase.from('profiles').upsert({
    id: userId,
    display_name: patch.display_name || 'RPC test user',
    account_type: patch.account_type || 'email',
    onboarding_status: patch.onboarding_status || 'not_started',
    onboarding_step: patch.onboarding_step || 'welcome',
  });
}

async function ensurePreferences(supabase, userId, prefs) {
  await supabase.from('user_preferences').upsert({
    user_id: userId,
    ...prefs,
  });
}

async function insertToken(supabase, guestUserId) {
  const plain = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(plain);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from('guest_migration_tokens').insert({
    guest_user_id: guestUserId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`insert token: ${error.message}`);
  return { plain, tokenHash };
}

async function rpcUpgrade(supabase, tokenHash, destinationUserId, testAbortAt = null) {
  const args = {
    p_token_hash: tokenHash,
    p_destination_user_id: destinationUserId,
  };
  if (testAbortAt) args.p_test_abort_at = testAbortAt;
  return supabase.rpc('complete_guest_account_upgrade', args);
}

async function getTokenRow(supabase, tokenHash) {
  const { data, error } = await supabase
    .from('guest_migration_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function cleanupUsers(supabase, userIds) {
  for (const userId of userIds) {
    await supabase.from('guest_migration_tokens').delete().eq('guest_user_id', userId);
    const tables = [
      'user_story_feedback',
      'user_interest_signals',
      'user_preferences',
      'user_story_matches',
      'product_interest_profiles',
      'user_feed_refresh',
      'saved_products',
      'scans',
      'analyses',
      'profiles',
    ];
    for (const table of tables) {
      await supabase.from(table).delete().eq(table === 'profiles' ? 'id' : 'user_id', userId);
    }
    await supabase.auth.admin.deleteUser(userId);
  }
}

async function main() {
  if (!RUN) {
    console.log('verify-guest-migration-rpc: SKIP (set WELLUMI_RUN_RPC_INTEGRATION=1 to run)');
    return;
  }
  if (!URL || !SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when WELLUMI_RUN_RPC_INTEGRATION=1');
  }

  const supabase = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const probe = await rpcUpgrade(supabase, hashToken('probe'), '00000000-0000-0000-0000-000000000001');
  if (probe.error?.message?.includes('Could not find the function')) {
    throw new Error('complete_guest_account_upgrade RPC is missing. Apply migration 007 first.');
  }

  const createdUsers = [];
  let destAuth;
  let productA;
  let productB;
  let storyA;

  try {
    const guestUser = await createAnonymousGuestUser();
    destAuth = await createEmailUser(supabase, 'dest');
    const destUser = destAuth.user;
    createdUsers.push(guestUser.id, destUser.id);

    await ensureProfile(supabase, guestUser.id, {
      account_type: 'guest',
      onboarding_status: 'in_progress',
      display_name: 'Guest tester',
    });
    await ensureProfile(supabase, destUser.id, {
      account_type: 'email',
      onboarding_status: 'completed',
      display_name: 'Destination tester',
      onboarding_step: 'completed',
    });

    await ensurePreferences(supabase, guestUser.id, {
      selected_interests: ['sleep', 'nutrition'],
      selected_use_cases: ['understand_labels'],
      content_balance: { safety: 'more' },
      limited_topics: [],
      preferred_feed_mix: {},
      notifications: {},
    });
    await ensurePreferences(supabase, destUser.id, {
      selected_interests: ['hydration'],
      selected_use_cases: ['track_products'],
      content_balance: { safety: 'less' },
      limited_topics: ['weight_loss'],
      preferred_feed_mix: {},
      notifications: {},
    });

    const { data: productRows, error: productError } = await supabase
      .from('products')
      .insert([
        { name: 'RPC Product A', source: 'unknown' },
        { name: 'RPC Product B', source: 'unknown' },
      ])
      .select('id');
    if (productError) throw new Error(productError.message);
    productA = productRows[0].id;
    productB = productRows[1].id;

    const { data: storyRow, error: storyError } = await supabase
      .from('wellness_stories')
      .insert({
        title: 'RPC migration story',
        deck: 'test',
        body: { sections: [] },
        story_category: 'everyday_wellness',
        lifestyle_category: 'everyday_wellness',
        display_eligible: true,
      })
      .select('id')
      .single();
    if (storyError) throw new Error(storyError.message);
    storyA = storyRow.id;

    await supabase.from('saved_products').insert([
      { user_id: guestUser.id, product_id: productA },
      { user_id: guestUser.id, product_id: productB },
      { user_id: destUser.id, product_id: productA },
    ]);

    await supabase.from('user_interest_signals').insert([
      {
        user_id: guestUser.id,
        topic: 'sleep',
        signal_type: 'onboarding_interest',
        source_type: 'onboarding',
        source_id: 'interests',
        weight: 8,
        is_explicit: true,
      },
      {
        user_id: destUser.id,
        topic: 'sleep',
        signal_type: 'onboarding_interest',
        source_type: 'onboarding',
        source_id: 'interests',
        weight: -20,
        is_explicit: true,
      },
    ]);

    await supabase.from('user_story_matches').insert([
      {
        user_id: guestUser.id,
        story_id: storyA,
        personalization_reason: 'guest reason',
        rank_score: 2,
        is_read: true,
        is_dismissed: false,
      },
      {
        user_id: destUser.id,
        story_id: storyA,
        personalization_reason: 'dest reason',
        rank_score: 9,
        is_read: false,
        is_dismissed: true,
      },
    ]);

    const { data: analysisRow } = await supabase
      .from('analyses')
      .insert({ user_id: guestUser.id, product_id: productB, summary: 'guest analysis' })
      .select('id')
      .single();
    await supabase.from('scans').insert({
      user_id: guestUser.id,
      product_id: productB,
      analysis_id: analysisRow.id,
      scan_type: 'barcode',
    });

    await supabase.from('user_feed_refresh').upsert({
      user_id: guestUser.id,
      last_refreshed_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    await supabase.from('user_feed_refresh').upsert({
      user_id: destUser.id,
      last_refreshed_at: new Date().toISOString(),
    });

    const beforeGuest = await snapshotUser(supabase, guestUser.id);
    const beforeDest = await snapshotUser(supabase, destUser.id);
    assert.ok(beforeGuest.saved_products >= 2);
    assert.ok(beforeDest.saved_products >= 1);

    const rollbackToken = await insertToken(supabase, guestUser.id);
    const beforeRollbackGuest = await snapshotUser(supabase, guestUser.id);
    const beforeRollbackDest = await snapshotUser(supabase, destUser.id);
    const rollback = await rpcUpgrade(
      supabase,
      rollbackToken.tokenHash,
      destUser.id,
      'after_preferences'
    );
    assert.ok(rollback.error, 'forced abort should fail RPC');
    const rollbackTokenRow = await getTokenRow(supabase, rollbackToken.tokenHash);
    assert.strictEqual(rollbackTokenRow.consumed_at, null, 'token must remain unconsumed on rollback');
    const afterRollbackGuest = await snapshotUser(supabase, guestUser.id);
    const afterRollbackDest = await snapshotUser(supabase, destUser.id);
    assert.deepStrictEqual(afterRollbackGuest, beforeRollbackGuest, 'guest rows must rollback');
    assert.deepStrictEqual(afterRollbackDest, beforeRollbackDest, 'destination rows must rollback');

    const successToken = await insertToken(supabase, guestUser.id);
    const success = await rpcUpgrade(supabase, successToken.tokenHash, destUser.id);
    if (success.error) throw new Error(`migration failed: ${success.error.message}`);
    assert.strictEqual(success.data.migrated, true);

    const consumed = await getTokenRow(supabase, successToken.tokenHash);
    assert.ok(consumed.consumed_at, 'token must be consumed after success');
    assert.strictEqual(consumed.consumed_by_user_id, destUser.id);

    const afterGuest = await snapshotUser(supabase, guestUser.id);
    const afterDest = await snapshotUser(supabase, destUser.id);
    assert.strictEqual(afterGuest.scans, 0);
    assert.ok(afterDest.scans >= 1);
    assert.strictEqual(afterDest.saved_products, 2, 'duplicate saved product should dedupe to 2 total');

    const { data: mergedSignal } = await supabase
      .from('user_interest_signals')
      .select('weight')
      .eq('user_id', destUser.id)
      .eq('topic', 'sleep')
      .eq('signal_type', 'onboarding_interest')
      .eq('source_type', 'onboarding')
      .eq('source_id', 'interests')
      .maybeSingle();
    assert.strictEqual(mergedSignal.weight, -20, 'explicit negative signal must win');

    const { data: mergedMatch } = await supabase
      .from('user_story_matches')
      .select('is_read,is_dismissed,rank_score')
      .eq('user_id', destUser.id)
      .eq('story_id', storyA)
      .maybeSingle();
    assert.strictEqual(mergedMatch.is_read, true);
    assert.strictEqual(mergedMatch.is_dismissed, true);
    assert.strictEqual(Number(mergedMatch.rank_score), 9);

    const { data: destProfile } = await supabase
      .from('profiles')
      .select('onboarding_status,display_name')
      .eq('id', destUser.id)
      .single();
    assert.strictEqual(destProfile.onboarding_status, 'completed');

    const { count: duplicateSaved } = await supabase
      .from('saved_products')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', destUser.id)
      .eq('product_id', productA);
    assert.strictEqual(duplicateSaved, 1);

    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    if (anonKey) {
      const anonClient = createClient(URL, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: destAuth.email,
        password: destAuth.password,
      });
      if (!signInError && signInData?.session?.access_token) {
        const authedClient = createClient(URL, anonKey, {
          global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const forbidden = await authedClient.rpc('complete_guest_account_upgrade', {
          p_token_hash: successToken.tokenHash,
          p_destination_user_id: destUser.id,
        });
        assert.ok(forbidden.error, 'authenticated role must not execute migration RPC');
        console.log('verify-guest-migration-rpc: forbidden authenticated execution — passed');
      } else {
        console.log('verify-guest-migration-rpc: skip forbidden RPC test (could not sign in dest user)');
      }
    } else {
      console.log('verify-guest-migration-rpc: skip forbidden RPC test (no SUPABASE_ANON_KEY)');
    }

    const { error: deleteDestError } = await supabase.auth.admin.deleteUser(destUser.id);
    assert.ok(!deleteDestError, `destination deletion should succeed: ${deleteDestError?.message}`);
    const { data: tokenAfterDelete } = await supabase
      .from('guest_migration_tokens')
      .select('consumed_by_user_id')
      .eq('token_hash', successToken.tokenHash)
      .maybeSingle();
    assert.strictEqual(tokenAfterDelete.consumed_by_user_id, null, 'consumed_by_user_id must SET NULL on delete');

    console.log('verify-guest-migration-rpc: destination account deletion after migration — passed');
    console.log('verify-guest-migration-rpc: all integration checks passed');
    console.log(
      JSON.stringify(
        {
          rollback: 'passed',
          success: success.data,
          after_destination: afterDest,
        },
        null,
        2
      )
    );
  } finally {
    if (storyA) await supabase.from('wellness_stories').delete().eq('id', storyA);
    if (productA) await supabase.from('products').delete().in('id', [productA, productB].filter(Boolean));
    if (createdUsers.length) await cleanupUsers(supabase, createdUsers);
  }
}

main().catch((error) => {
  console.error('verify-guest-migration-rpc: FAILED');
  console.error(error.message || error);
  process.exit(1);
});
