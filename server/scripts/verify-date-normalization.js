const assert = require('assert');
const { normalizeExternalDate } = require('../src/utils/normalizeExternalDate');

function expectIso(input, expectedIsoPrefix) {
  const result = normalizeExternalDate(input);
  assert.ok(result, `Expected ISO date for ${JSON.stringify(input)}`);
  assert.ok(
    result.startsWith(expectedIsoPrefix),
    `Expected ${result} to start with ${expectedIsoPrefix}`
  );
  return result;
}

function expectNull(input) {
  const result = normalizeExternalDate(input);
  assert.strictEqual(result, null, `Expected null for ${JSON.stringify(input)}, got ${result}`);
}

expectIso('20260623', '2026-06-23');
expectIso('2024-06-23T12:00:00.000Z', '2024-06-23');
expectIso('2024-06-23', '2024-06-23');

expectNull('');
expectNull('not-a-date');
expectNull(undefined);
expectNull(null);
expectNull('20261399');

expectIso('2024 Jan 15', '2024-01-15');
expectIso('2024 Jan', '2024-01-01');
expectIso('2024 Spring', '2024-03-01');
expectIso('2023', '2023-01-01');

const invalidJsDate = normalizeExternalDate('20260623');
assert.doesNotThrow(() => normalizeExternalDate('20260623'));
assert.notStrictEqual(invalidJsDate, 'Invalid Date');

const { mapFoodRecallToFeedItem } = require('../src/services/openFda');
const mappedRecall = mapFoodRecallToFeedItem({
  recall_number: 'F-1',
  recall_initiation_date: '20260623',
  product_description: 'Test product',
});
assert.ok(mappedRecall.published_at?.startsWith('2026-06-23'));
assert.doesNotThrow(() =>
  mapFoodRecallToFeedItem({
    recall_number: 'F-2',
    recall_initiation_date: 'not-valid',
    product_description: 'Still kept',
  })
);

console.log('verify-date-normalization: all checks passed');
