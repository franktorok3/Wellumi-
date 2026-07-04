# Wellumi API Server

Node/Express API for Wellumi. It keeps server-only secrets out of the Expo app and orchestrates:

- OpenAI label analysis
- Open Food Facts barcode lookup
- USDA FoodData Central fallback nutrition lookup
- Supabase Postgres persistence and scan image storage

## Setup

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USDA_FDC_API_KEY` (optional but recommended for nutrition fallback)

### 3. Apply database migrations

Run in order in the Supabase SQL editor:

1. `server/migrations/001_initial_schema.sql` (if not already applied)
2. `server/migrations/002_working_mvp.sql`

Also enable anonymous sign-in in Supabase Auth:

1. Authentication → Providers → Anonymous sign-ins → Enable

### 4. Start the server

```bash
npm start
```

Default URL: `http://localhost:3001`

## Expo configuration

Copy the root `.env.example` to `.env` and set:

- `EXPO_PUBLIC_API_BASE_URL` to your computer's LAN IP when testing on a phone
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never put service role, OpenAI, or USDA keys in the Expo app.

## Endpoints

### `GET /health`

Service status and configuration flags.

### `POST /analyze-label`

Primary scan workflow. Accepts a label image and/or barcode.

Request:

```json
{
  "imageBase64": "base64-without-data-uri-prefix",
  "mimeType": "image/jpeg",
  "barcode": "012345678905"
}
```

Headers:

```http
Authorization: Bearer <supabase_access_token>
```

Behavior:

- With auth + Supabase configured: resolves product data, persists product/analysis/scan, returns saved result
- Without auth/Supabase: preserves legacy OpenAI-only image analysis response

Response (persisted):

```json
{
  "product_name": "Legacy UI fields preserved",
  "detected_label_text": "...",
  "what_it_is": "...",
  "persisted": true,
  "product": { "id": "uuid", "name": "...", "source": "merged" },
  "analysis": { "id": "uuid", "summary": "...", "positives": [] },
  "scan": { "id": "uuid", "scan_type": "image", "created_at": "..." }
}
```

### `GET /scans`

Returns the authenticated user's recent scans with joined product and analysis records.

### `GET /saved-products`

Returns the authenticated user's saved products.

### `POST /saved-products`

Request:

```json
{
  "productId": "uuid"
}
```

## Architecture notes

- Products are deduplicated by barcode when present.
- Open Food Facts is the first external lookup for barcodes.
- USDA FoodData Central is used as a nutrition fallback when configured.
- OpenAI output is stored as analysis, not verified product fact.
- Raw source payloads are stored in `products.raw_source_data`.
