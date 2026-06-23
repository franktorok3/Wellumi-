-- Wellumi initial schema
-- Run in Supabase SQL editor or via supabase db push

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_created_at_idx on public.profiles (created_at);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  name text not null,
  brand text,
  ingredients_text text,
  ingredients_data jsonb not null default '{}'::jsonb,
  nutrition_data jsonb not null default '{}'::jsonb,
  product_image_url text,
  source text not null default 'unknown',
  source_product_id text,
  raw_source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_source_check check (
    source in ('unknown', 'open_food_facts', 'usda_fdc', 'openai_label', 'merged')
  )
);

create unique index if not exists products_barcode_unique_idx
  on public.products (barcode)
  where barcode is not null;

create index if not exists products_created_at_idx on public.products (created_at);
create index if not exists products_name_idx on public.products (name);

-- ---------------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score numeric,
  summary text,
  positives jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  allergen_flags jsonb not null default '[]'::jsonb,
  confidence numeric,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create index if not exists analyses_user_id_idx on public.analyses (user_id);
create index if not exists analyses_product_id_idx on public.analyses (product_id);
create index if not exists analyses_created_at_idx on public.analyses (created_at desc);

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  analysis_id uuid references public.analyses (id) on delete set null,
  scan_type text not null,
  image_url text,
  extracted_text text,
  created_at timestamptz not null default now(),
  constraint scans_scan_type_check check (scan_type in ('barcode', 'image', 'manual'))
);

create index if not exists scans_user_id_idx on public.scans (user_id);
create index if not exists scans_product_id_idx on public.scans (product_id);
create index if not exists scans_created_at_idx on public.scans (created_at desc);

-- ---------------------------------------------------------------------------
-- saved_products
-- ---------------------------------------------------------------------------
create table if not exists public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_products_user_product_unique unique (user_id, product_id)
);

create index if not exists saved_products_user_id_idx on public.saved_products (user_id);
create index if not exists saved_products_product_id_idx on public.saved_products (product_id);
create index if not exists saved_products_created_at_idx on public.saved_products (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile bootstrap for new auth users (including anonymous)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Wellumi member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.analyses enable row level security;
alter table public.scans enable row level security;
alter table public.saved_products enable row level security;

-- profiles: users manage their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- products: readable by authenticated users; writes via service role only
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated"
  on public.products for select
  to authenticated
  using (true);

-- analyses: users read/write their own
drop policy if exists "analyses_select_own" on public.analyses;
create policy "analyses_select_own"
  on public.analyses for select
  using (auth.uid() = user_id);

drop policy if exists "analyses_insert_own" on public.analyses;
create policy "analyses_insert_own"
  on public.analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "analyses_update_own" on public.analyses;
create policy "analyses_update_own"
  on public.analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "analyses_delete_own" on public.analyses;
create policy "analyses_delete_own"
  on public.analyses for delete
  using (auth.uid() = user_id);

-- scans: users read/write their own
drop policy if exists "scans_select_own" on public.scans;
create policy "scans_select_own"
  on public.scans for select
  using (auth.uid() = user_id);

drop policy if exists "scans_insert_own" on public.scans;
create policy "scans_insert_own"
  on public.scans for insert
  with check (auth.uid() = user_id);

drop policy if exists "scans_update_own" on public.scans;
create policy "scans_update_own"
  on public.scans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scans_delete_own" on public.scans;
create policy "scans_delete_own"
  on public.scans for delete
  using (auth.uid() = user_id);

-- saved_products: users read/write their own
drop policy if exists "saved_products_select_own" on public.saved_products;
create policy "saved_products_select_own"
  on public.saved_products for select
  using (auth.uid() = user_id);

drop policy if exists "saved_products_insert_own" on public.saved_products;
create policy "saved_products_insert_own"
  on public.saved_products for insert
  with check (auth.uid() = user_id);

drop policy if exists "saved_products_delete_own" on public.saved_products;
create policy "saved_products_delete_own"
  on public.saved_products for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for scan images (create in dashboard if SQL insert fails)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('scan-images', 'scan-images', true)
on conflict (id) do nothing;

drop policy if exists "scan_images_read_authenticated" on storage.objects;
create policy "scan_images_read_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'scan-images');

drop policy if exists "scan_images_insert_authenticated" on storage.objects;
create policy "scan_images_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'scan-images' and auth.uid()::text = (storage.foldername(name))[1]);
