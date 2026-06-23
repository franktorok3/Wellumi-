const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8;

function stripDataUrlPrefix(value) {
  const commaIndex = value.indexOf(',');
  if (commaIndex === -1) {
    return value;
  }
  return value.slice(commaIndex + 1);
}

function estimateDecodedBase64Bytes(base64) {
  const raw = stripDataUrlPrefix(base64).replace(/\s/g, '');
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return null;
  }
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  return Math.floor((raw.length * 3) / 4) - padding;
}

function normalizeMimeType(mimeType) {
  return String(mimeType || 'image/jpeg')
    .trim()
    .toLowerCase()
    .split(';')[0];
}

function validateImagePayload({ imageBase64, mimeType }) {
  if (!imageBase64) {
    return;
  }

  const normalizedMime = normalizeMimeType(mimeType);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedMime)) {
    const error = new Error(
      `Unsupported image type "${normalizedMime}". Allowed types: JPEG, PNG, WEBP, HEIC.`
    );
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_IMAGE_TYPE';
    throw error;
  }

  const rawBase64 = stripDataUrlPrefix(imageBase64);
  if (rawBase64.length > MAX_BASE64_LENGTH) {
    const error = new Error(
      `Image payload is too large. Maximum allowed size is ${MAX_IMAGE_BYTES} bytes.`
    );
    error.statusCode = 413;
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }

  const decodedBytes = estimateDecodedBase64Bytes(rawBase64);
  if (decodedBytes == null) {
    const error = new Error('Image payload is not valid base64 data.');
    error.statusCode = 400;
    error.code = 'INVALID_IMAGE_DATA';
    throw error;
  }

  if (decodedBytes > MAX_IMAGE_BYTES) {
    const error = new Error(
      `Decoded image is too large (${decodedBytes} bytes). Maximum allowed size is ${MAX_IMAGE_BYTES} bytes.`
    );
    error.statusCode = 413;
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }
}

module.exports = {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_BASE64_LENGTH,
  estimateDecodedBase64Bytes,
  normalizeMimeType,
  validateImagePayload,
};
