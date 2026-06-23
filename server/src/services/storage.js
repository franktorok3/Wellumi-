const { config } = require('../config');
const { getSupabaseAdmin } = require('./supabase');

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

  const { data } = supabase.storage.from(config.supabase.scanImageBucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

module.exports = {
  uploadScanImage,
};
