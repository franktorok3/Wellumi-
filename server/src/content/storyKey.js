const crypto = require('crypto');

const STORY_PROMPT_VERSION = 'wellumi_story_v2';
const CONTENT_VERSION = 1;

function stableSourceIds(sourceRecords = []) {
  return [...sourceRecords]
    .map((record) => record.id || `${record.provider}:${record.external_id}`)
    .sort()
    .join(',');
}

function buildStoryKey({
  isGeneral = true,
  baseTopicId = null,
  sourceRecords = [],
  storyCategory,
  productId = null,
  promptVersion = STORY_PROMPT_VERSION,
  contentVersion = CONTENT_VERSION,
}) {
  const scope = isGeneral ? 'general' : 'personalized';
  const parts = [
    scope,
    baseTopicId || 'none',
    storyCategory || 'unknown',
    isGeneral ? 'all' : productId || 'none',
    stableSourceIds(sourceRecords),
    promptVersion,
    String(contentVersion),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

module.exports = {
  CONTENT_VERSION,
  buildStoryKey,
  stableSourceIds,
};
