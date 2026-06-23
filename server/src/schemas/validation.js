const { z } = require('zod');

const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/, 'barcode must be 8-14 digits')
  .optional();

const analyzeLabelRequestSchema = z
  .object({
    imageBase64: z.string().min(1).optional(),
    mimeType: z.string().min(3).default('image/jpeg'),
    barcode: barcodeSchema,
  })
  .refine((value) => Boolean(value.imageBase64 || value.barcode), {
    message: 'imageBase64 or barcode is required',
  });

const saveProductRequestSchema = z.object({
  productId: z.string().uuid(),
});

const openAiLabelSummarySchema = z.object({
  product_name: z.string().min(1),
  detected_label_text: z.string().default(''),
  what_it_is: z.string().min(1),
  what_people_commonly_use_it_for: z.string().min(1),
  what_sources_say: z.string().min(1),
  questions_to_ask_a_professional: z.array(z.string().min(1)).min(1),
  neutral_disclaimer: z.string().min(1),
});

const openFoodFactsProductSchema = z
  .object({
    code: z.string().optional(),
    product_name: z.string().optional(),
    brands: z.string().optional(),
    ingredients_text: z.string().optional(),
    ingredients: z.array(z.unknown()).optional(),
    nutriments: z.record(z.unknown()).optional(),
    image_url: z.string().optional(),
    image_front_url: z.string().optional(),
    image_front_small_url: z.string().optional(),
  })
  .passthrough();

const openFoodFactsResponseSchema = z.object({
  status: z.number(),
  product: openFoodFactsProductSchema.optional(),
});

const usdaFoodSchema = z
  .object({
    fdcId: z.number(),
    description: z.string(),
    brandOwner: z.string().optional(),
    ingredients: z.string().optional(),
    foodNutrients: z.array(z.unknown()).optional(),
  })
  .passthrough();

const usdaSearchResponseSchema = z.object({
  foods: z.array(usdaFoodSchema).default([]),
  totalHits: z.number().optional(),
});

function validateBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return parsed.data;
}

module.exports = {
  analyzeLabelRequestSchema,
  saveProductRequestSchema,
  openAiLabelSummarySchema,
  openFoodFactsResponseSchema,
  usdaSearchResponseSchema,
  validateBody,
};
