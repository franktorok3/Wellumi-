require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3001),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    promptVersion: process.env.OPENAI_PROMPT_VERSION || 'wellumi_label_summary_v1',
    storyPromptVersion: process.env.WELLUMI_STORY_PROMPT_VERSION || 'wellumi_story_v1',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    scanImageBucket: process.env.SCAN_IMAGE_BUCKET || 'scan-images',
  },
  usda: {
    apiKey: process.env.USDA_FDC_API_KEY || '',
    baseUrl: 'https://api.nal.usda.gov/fdc/v1',
  },
  openFoodFacts: {
    baseUrl: 'https://world.openfoodfacts.org/api/v2',
    userAgent: process.env.OPEN_FOOD_FACTS_USER_AGENT || 'Wellumi/1.0 (contact@wellumi.app)',
  },
};

function hasSupabaseConfig() {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

function hasOpenAIConfig() {
  return Boolean(config.openai.apiKey);
}

function hasUsdaConfig() {
  return Boolean(config.usda.apiKey);
}

module.exports = {
  config,
  hasSupabaseConfig,
  hasOpenAIConfig,
  hasUsdaConfig,
};
