const assert = require('assert');
const { verifySaveProductOwnership } = require('../src/utils/saveProductOwnership');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const PRODUCT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANALYSIS_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SCAN_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function createMockSupabase(tables) {
  return {
    from(table) {
      const state = { filters: {} };
      const query = {
        select() {
          return query;
        },
        eq(column, value) {
          state.filters[column] = value;
          return query;
        },
        async maybeSingle() {
          const rows = tables[table] || [];
          const match = rows.find((row) =>
            Object.entries(state.filters).every(([column, value]) => row[column] === value)
          );
          return { data: match || null, error: null };
        },
      };
      return query;
    },
  };
}

async function expectForbidden(promise, messageFragment) {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'Expected ownership check to throw');
  assert.strictEqual(caught.statusCode, 403);
  assert.match(caught.message, new RegExp(messageFragment, 'i'));
}

async function run() {
  const supabase = createMockSupabase({
    analyses: [
      {
        id: ANALYSIS_B,
        user_id: USER_B,
        product_id: PRODUCT_B,
      },
    ],
    scans: [
      {
        id: SCAN_B,
        user_id: USER_B,
        product_id: PRODUCT_B,
        analysis_id: ANALYSIS_B,
      },
    ],
  });

  await expectForbidden(
    verifySaveProductOwnership(supabase, USER_A, {
      productId: PRODUCT_B,
      analysisId: ANALYSIS_B,
    }),
    'analysis does not belong'
  );

  await expectForbidden(
    verifySaveProductOwnership(supabase, USER_A, {
      productId: PRODUCT_B,
      scanId: SCAN_B,
    }),
    'scan does not belong'
  );

  await expectForbidden(
    verifySaveProductOwnership(supabase, USER_B, {
      productId: PRODUCT_A,
      analysisId: ANALYSIS_B,
    }),
    'analysis does not belong to the submitted product'
  );

  let passedForOwner = false;
  try {
    await verifySaveProductOwnership(supabase, USER_B, {
      productId: PRODUCT_B,
      analysisId: ANALYSIS_B,
      scanId: SCAN_B,
    });
    passedForOwner = true;
  } catch (error) {
    assert.fail(`Owner save should pass verification: ${error.message}`);
  }
  assert.ok(passedForOwner);

  console.log('verify-save-product-ownership: all checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
