-- Wellumi working MVP migration (safe to run on existing 001 schema)

-- ---------------------------------------------------------------------------
-- saved_products: preserve exact analysis + scan context
-- ---------------------------------------------------------------------------
alter table public.saved_products
  add column if not exists analysis_id uuid references public.analyses(id) on delete set null,
  add column if not exists scan_id uuid references public.scans(id) on delete set null;

create index if not exists saved_products_analysis_id_idx on public.saved_products (analysis_id);
create index if not exists saved_products_scan_id_idx on public.saved_products (scan_id);

-- Replace broad unique constraint with analysis-aware deduplication
alter table public.saved_products
  drop constraint if exists saved_products_user_product_unique;

create unique index if not exists saved_products_user_product_analysis_unique
  on public.saved_products (user_id, product_id, analysis_id)
  where analysis_id is not null;

create unique index if not exists saved_products_user_product_null_analysis_unique
  on public.saved_products (user_id, product_id)
  where analysis_id is null;

-- ---------------------------------------------------------------------------
-- feed_items: cached external awareness content
-- ---------------------------------------------------------------------------
create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_type text not null,
  external_id text not null,
  title text not null,
  summary text,
  source_url text not null,
  published_at timestamptz,
  raw_source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_items_source_external_unique unique (source, external_id)
);

create index if not exists feed_items_published_at_idx on public.feed_items (published_at desc);
create index if not exists feed_items_source_type_idx on public.feed_items (source_type);
create index if not exists feed_items_created_at_idx on public.feed_items (created_at desc);

-- ---------------------------------------------------------------------------
-- user_feed_items: personalized matches
-- ---------------------------------------------------------------------------
create table if not exists public.user_feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  reason text not null,
  matched_terms jsonb not null default '[]'::jsonb,
  relevance_score numeric,
  is_read boolean not null default false,
  is_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint user_feed_items_user_feed_unique unique (user_id, feed_item_id)
);

create index if not exists user_feed_items_user_id_idx on public.user_feed_items (user_id);
create index if not exists user_feed_items_feed_item_id_idx on public.user_feed_items (feed_item_id);
create index if not exists user_feed_items_created_at_idx on public.user_feed_items (created_at desc);
create index if not exists user_feed_items_is_dismissed_idx on public.user_feed_items (user_id, is_dismissed);

-- updated_at for feed_items
drop trigger if exists feed_items_set_updated_at on public.feed_items;
create trigger feed_items_set_updated_at
before update on public.feed_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS for feed tables
-- ---------------------------------------------------------------------------
alter table public.feed_items enable row level security;
alter table public.user_feed_items enable row level security;

drop policy if exists "feed_items_select_authenticated" on public.feed_items;
create policy "feed_items_select_authenticated"
  on public.feed_items for select
  to authenticated
  using (true);

drop policy if exists "user_feed_items_select_own" on public.user_feed_items;
create policy "user_feed_items_select_own"
  on public.user_feed_items for select
  using (auth.uid() = user_id);

drop policy if exists "user_feed_items_update_own" on public.user_feed_items;
create policy "user_feed_items_update_own"
  on public.user_feed_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Private scan-images bucket
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false
where id = 'scan-images';

drop policy if exists "scan_images_read_authenticated" on storage.objects;
create policy "scan_images_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'scan-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "scan_images_insert_authenticated" on storage.objects;
create policy "scan_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'scan-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Track last feed refresh per user (server uses service role)
create table if not exists public.user_feed_refresh (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_refreshed_at timestamptz not null default now()
);

alter table public.user_feed_refresh enable row level security;

drop policy if exists "user_feed_refresh_select_own" on public.user_feed_refresh;
create policy "user_feed_refresh_select_own"
  on public.user_feed_refresh for select
  using (auth.uid() = user_id);
