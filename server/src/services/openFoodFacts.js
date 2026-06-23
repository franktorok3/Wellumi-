const { config } = require('../config');
const { openFoodFactsResponseSchema } = require('../schemas/validation');

async function fetchProductByBarcode(barcode) {
  const normalizedBarcode = String(barcode || '').trim();
  if (!normalizedBarcode) {
    return null;
  }

  const url = `${config.openFoodFacts.baseUrl}/product/${encodeURIComponent(normalizedBarcode)}.json`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': config.openFoodFacts.userAgent,
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = new Error(`Open Food Facts returned ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const validated = openFoodFactsResponseSchema.safeParse(payload);
  if (!validated.success || validated.data.status !== 1 || !validated.data.product) {
    return null;
  }

  return {
    source: 'open_food_facts',
    sourceProductId: normalizedBarcode,
    raw: validated.data,
    product: validated.data.product,
  };
}

module.exports = {
  fetchProductByBarcode,
};
