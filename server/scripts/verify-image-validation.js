const assert = require('assert');
const { validateImagePayload, MAX_IMAGE_BYTES } = require('../src/utils/imageValidation');
const { validateBody, analyzeLabelRequestSchema } = require('../src/schemas/validation');

function expectThrows(fn, code) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected error${code ? ` with code ${code}` : ''}`);
  if (code) {
    assert.strictEqual(caught.code, code);
  }
}

expectThrows(
  () => validateImagePayload({ imageBase64: 'abc', mimeType: 'image/gif' }),
  'UNSUPPORTED_IMAGE_TYPE'
);

const smallJpeg = Buffer.alloc(100, 1).toString('base64');
assert.doesNotThrow(() =>
  validateImagePayload({ imageBase64: smallJpeg, mimeType: 'image/jpeg' })
);

const tooLarge = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString('base64');
expectThrows(
  () => validateImagePayload({ imageBase64: tooLarge, mimeType: 'image/jpeg' }),
  'IMAGE_TOO_LARGE'
);

const invalidBase64 = '###not-base64###';
expectThrows(
  () => validateImagePayload({ imageBase64: invalidBase64, mimeType: 'image/jpeg' }),
  'INVALID_IMAGE_DATA'
);

expectThrows(() =>
  validateBody(analyzeLabelRequestSchema, {
    imageBase64: tooLarge,
    mimeType: 'image/jpeg',
  })
);

console.log('verify-image-validation: all checks passed');
