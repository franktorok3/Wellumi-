const { config } = require('../config');
const { getSupabaseAdmin } = require('./supabase');

const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function uploadScanImage({ userId, imageBase64, mimeType = 'image/jpeg' }) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !imageBase64) {
    return null;
  }

  const extension = mimeType.split('/')[1] || 'jpg';
  const objectPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const buffer = Buffer.from(imageBase64, 'base64');

  const { error } = await supabase.storage
    .from(config.supabase.scanImageBucket)
    .upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    const uploadError = new Error(`Could not upload scan image: ${error.message}`);
    uploadError.statusCode = 500;
    throw uploadError;
  }

  return objectPath;
}

function isStoragePath(value) {
  return typeof value === 'string' && value.includes('/') && !value.startsWith('http');
}

async function createSignedScanImageUrl(storagePath) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !storagePath || !isStoragePath(storagePath)) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(config.supabase.scanImageBucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('[wellumi] Could not sign scan image URL', { message: error.message });
    return null;
  }

  return data?.signedUrl || null;
}

async function attachSignedImageUrls(records) {
  const list = Array.isArray(records) ? records : [records];
  return Promise.all(
    list.map(async (record) => {
      if (!record?.image_url) return record;
      const signedUrl = await createSignedScanImageUrl(record.image_url);
      return {
        ...record,
        image_signed_url: signedUrl,
      };
    })
  );
}

module.exports = {
  uploadScanImage,
  createSignedScanImageUrl,
  attachSignedImageUrls,
  isStoragePath,
};
