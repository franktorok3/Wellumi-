-- Wellumi wellness story feed (run after 002_working_mvp.sql)

-- ---------------------------------------------------------------------------
-- source_records: normalized external evidence (not user-facing cards)
-- ---------------------------------------------------------------------------
create table if not exists public.source_records (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_type text not null,
  external_id text not null,
  title text not null,
  summary text,
  abstract text,
  published_at timestamptz,
  source_url text not null,
  topics jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  consumer_relevance numeric,
  source_strength numeric,
  freshness_score numeric,
  safety_relevance numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_records_provider_external_unique unique (provider, external_id)
);

create index if not exists source_records_published_at_idx on public.source_records (published_at desc);
create index if not exists source_records_provider_idx on public.source_records (provider);
create index if not exists source_records_safety_relevance_idx on public.source_records (safety_relevance desc nulls last);

drop trigger if exists source_records_set_updated_at on public.source_records;
create trigger source_records_set_updated_at
before update on public.source_records
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- wellness_stories: user-facing editorial stories
-- ---------------------------------------------------------------------------
create table if not exists public.wellness_stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  deck text,
  body jsonb not null default '{}'::jsonb,
  lifestyle_category text not null,
  topics jsonb not null default '[]'::jsonb,
  story_type text not null,
  story_category text not null,
  is_general boolean not null default true,
  safety_flag boolean not null default false,
  source_strength_label text,
  editorial_confidence numeric,
  trigger_score numeric,
  freshness_date timestamptz,
  model text,
  prompt_version text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wellness_stories_generated_at_idx on public.wellness_stories (generated_at desc);
create index if not exists wellness_stories_story_category_idx on public.wellness_stories (story_category);
create index if not exists wellness_stories_safety_flag_idx on public.wellness_stories (safety_flag);

drop trigger if exists wellness_stories_set_updated_at on public.wellness_stories;
create trigger wellness_stories_set_updated_at
before update on public.wellness_stories
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- wellness_story_sources: story evidence links
-- ---------------------------------------------------------------------------
create table if not exists public.wellness_story_sources (
  story_id uuid not null references public.wellness_stories(id) on delete cascade,
  source_record_id uuid not null references public.source_records(id) on delete cascade,
  citation_order int not null default 0,
  primary key (story_id, source_record_id)
);

create index if not exists wellness_story_sources_source_record_id_idx
  on public.wellness_story_sources (source_record_id);

-- ---------------------------------------------------------------------------
-- user_story_matches: personalized feed placements
-- ---------------------------------------------------------------------------
create table if not exists public.user_story_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.wellness_stories(id) on delete cascade,
  personalization_reason text not null,
  matched_products jsonb not null default '[]'::jsonb,
  matched_interests jsonb not null default '[]'::jsonb,
  rank_score numeric not null default 0,
  is_personalized boolean not null default false,
  is_read boolean not null default false,
  is_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint user_story_matches_user_story_unique unique (user_id, story_id)
);

create index if not exists user_story_matches_user_id_idx on public.user_story_matches (user_id);
create index if not exists user_story_matches_rank_score_idx on public.user_story_matches (user_id, rank_score desc);
create index if not exists user_story_matches_dismissed_idx on public.user_story_matches (user_id, is_dismissed);

-- ---------------------------------------------------------------------------
-- product_interest_profiles: structured scan/save signals
-- ---------------------------------------------------------------------------
create table if not exists public.product_interest_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  personalization_strength text not null default 'low',
  scan_count int not null default 1,
  is_saved boolean not null default false,
  last_derived_at timestamptz not null default now(),
  constraint product_interest_profiles_user_product_unique unique (user_id, product_id)
);

create index if not exists product_interest_profiles_user_id_idx on public.product_interest_profiles (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.source_records enable row level security;
alter table public.wellness_stories enable row level security;
alter table public.wellness_story_sources enable row level security;
alter table public.user_story_matches enable row level security;
alter table public.product_interest_profiles enable row level security;

drop policy if exists "source_records_select_authenticated" on public.source_records;
create policy "source_records_select_authenticated"
  on public.source_records for select to authenticated using (true);

drop policy if exists "wellness_stories_select_authenticated" on public.wellness_stories;
create policy "wellness_stories_select_authenticated"
  on public.wellness_stories for select to authenticated using (true);

drop policy if exists "wellness_story_sources_select_authenticated" on public.wellness_story_sources;
create policy "wellness_story_sources_select_authenticated"
  on public.wellness_story_sources for select to authenticated using (true);

drop policy if exists "user_story_matches_select_own" on public.user_story_matches;
create policy "user_story_matches_select_own"
  on public.user_story_matches for select using (auth.uid() = user_id);

drop policy if exists "user_story_matches_update_own" on public.user_story_matches;
create policy "user_story_matches_update_own"
  on public.user_story_matches for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "product_interest_profiles_select_own" on public.product_interest_profiles;
create policy "product_interest_profiles_select_own"
  on public.product_interest_profiles for select using (auth.uid() = user_id);
