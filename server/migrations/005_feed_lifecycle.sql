-- Feed lifecycle: deterministic story identity, match lifecycle, curated source metadata

-- ---------------------------------------------------------------------------
-- wellness_stories: deterministic identity + lifecycle
-- ---------------------------------------------------------------------------
alter table public.wellness_stories
  add column if not exists story_key text,
  add column if not exists base_topic_id text,
  add column if not exists content_version integer not null default 1,
  add column if not exists last_generated_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists is_active boolean not null default true;

create unique index if not exists wellness_stories_story_key_unique
  on public.wellness_stories (story_key)
  where story_key is not null;

create index if not exists wellness_stories_base_topic_active_idx
  on public.wellness_stories (base_topic_id, is_active, display_eligible)
  where base_topic_id is not null;

create index if not exists wellness_stories_is_active_idx
  on public.wellness_stories (is_active, display_eligible);

-- ---------------------------------------------------------------------------
-- user_story_matches: refresh lifecycle
-- ---------------------------------------------------------------------------
alter table public.user_story_matches
  add column if not exists is_active boolean not null default true,
  add column if not exists last_matched_at timestamptz,
  add column if not exists match_version integer not null default 1,
  add column if not exists refresh_token text,
  add column if not exists match_explanation jsonb not null default '{}'::jsonb;

create index if not exists user_story_matches_active_idx
  on public.user_story_matches (user_id, is_active, is_dismissed);

create index if not exists user_story_matches_refresh_token_idx
  on public.user_story_matches (user_id, refresh_token);

-- ---------------------------------------------------------------------------
-- source_records: curated-source integrity
-- ---------------------------------------------------------------------------
alter table public.source_records
  add column if not exists curated_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_status text,
  add column if not exists source_owner text;

-- Backfill curated evergreen records
update public.source_records
set
  curated_at = coalesce(curated_at, created_at),
  verified_at = coalesce(verified_at, now()),
  verification_status = coalesce(verification_status, 'manually_curated'),
  source_owner = coalesce(source_owner, 'wellumi_editorial')
where is_evergreen = true;

-- ---------------------------------------------------------------------------
-- user_feed_refresh: separate live vs evergreen refresh tracking
-- ---------------------------------------------------------------------------
alter table public.user_feed_refresh
  add column if not exists live_refresh_completed_at timestamptz,
  add column if not exists last_live_refresh_at timestamptz,
  add column if not exists evergreen_fallback_used boolean not null default false;

-- ---------------------------------------------------------------------------
-- Retire legacy low-quality stories (soft deactivate, do not delete)
-- ---------------------------------------------------------------------------
update public.wellness_stories ws
set
  display_eligible = false,
  is_active = false,
  last_verified_at = now()
where
  display_eligible = true
  and (
    title ilike '%a general wellumi wellness story%'
    or title ilike '%a safety update worth knowing about%'
    or deck ilike '%products like this%'
    or deck ilike '%routine wellness habits%'
    or deck ilike '%wellumi turns source updates%'
    or body::text ilike '%products like this%'
    or body::text ilike '%routine wellness habits%'
    or body::text ilike '%this story connects to everyday topics%'
    or body::text ilike '%wellumi turns source updates%'
    or (prompt_version is not null and prompt_version <> 'wellumi_story_v2' and generation_mode = 'fallback')
  );

update public.wellness_stories ws
set display_eligible = false, is_active = false, last_verified_at = now()
where display_eligible = true
  and not exists (
    select 1 from public.wellness_story_sources wss where wss.story_id = ws.id
  );

update public.user_story_matches usm
set is_active = false
from public.wellness_stories ws
where usm.story_id = ws.id
  and (ws.is_active = false or ws.display_eligible = false);
