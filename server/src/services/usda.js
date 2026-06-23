const { config, hasUsdaConfig } = require('../config');
const { usdaSearchResponseSchema } = require('../schemas/validation');

function buildSearchQuery({ barcode, name, brand }) {
  if (barcode) {
    return barcode;
  }
  if (name && brand) {
    return `${brand} ${name}`;
  }
  if (name) {
    return name;
  }
  return '';
}

async function searchFoodDataCentral({ barcode, name, brand }) {
  if (!hasUsdaConfig()) {
    return null;
  }

  const query = buildSearchQuery({ barcode, name, brand }).trim();
  if (!query) {
    return null;
  }

  const url = new URL(`${config.usda.baseUrl}/foods/search`);
  url.searchParams.set('api_key', config.usda.apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', '5');
  url.searchParams.set('dataType', 'Branded,Survey (FNDDS),Foundation,SR Legacy');

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`USDA FoodData Central returned ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const validated = usdaSearchResponseSchema.safeParse(payload);
  if (!validated.success || !validated.data.foods.length) {
    return null;
  }

  const bestMatch = validated.data.foods[0];
  return {
    source: 'usda_fdc',
    sourceProductId: String(bestMatch.fdcId),
    raw: validated.data,
    product: bestMatch,
  };
}

module.exports = {
  searchFoodDataCentral,
};
