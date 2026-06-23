-- Accounts, onboarding, preferences, interest signals, and story feedback

-- ---------------------------------------------------------------------------
-- profiles: account + onboarding lifecycle
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_type text not null default 'guest',
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists onboarding_step text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists profile_version integer not null default 1,
  add column if not exists preference_version integer not null default 1,
  add column if not exists last_profile_sync_at timestamptz,
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('guest', 'email', 'apple'));

alter table public.profiles
  drop constraint if exists profiles_onboarding_status_check;
alter table public.profiles
  add constraint profiles_onboarding_status_check
  check (onboarding_status in ('not_started', 'in_progress', 'completed'));

create index if not exists profiles_onboarding_status_idx on public.profiles (onboarding_status);

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_interests jsonb not null default '[]'::jsonb,
  selected_use_cases jsonb not null default '[]'::jsonb,
  content_balance jsonb not null default '{}'::jsonb,
  limited_topics jsonb not null default '[]'::jsonb,
  preferred_feed_mix jsonb not null default '{}'::jsonb,
  notifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_interest_signals
-- ---------------------------------------------------------------------------
create table if not exists public.user_interest_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  signal_type text not null,
  source_type text not null,
  source_id text,
  weight numeric not null,
  confidence numeric,
  is_explicit boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists user_interest_signals_unique_idx
  on public.user_interest_signals (
    user_id,
    topic,
    signal_type,
    source_type,
    coalesce(source_id, '')
  );

create index if not exists user_interest_signals_user_active_idx
  on public.user_interest_signals (user_id, is_active, topic);

-- ---------------------------------------------------------------------------
-- user_story_feedback
-- ---------------------------------------------------------------------------
create table if not exists public.user_story_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.wellness_stories(id) on delete cascade,
  feedback_type text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_story_feedback_type_check check (
    feedback_type in (
      'opened',
      'source_opened',
      'saved',
      'dismissed',
      'more_like_this',
      'less_like_this',
      'not_relevant'
    )
  )
);

create index if not exists user_story_feedback_user_id_idx
  on public.user_story_feedback (user_id, created_at desc);

create index if not exists user_story_feedback_story_id_idx
  on public.user_story_feedback (story_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_preferences enable row level security;
alter table public.user_interest_signals enable row level security;
alter table public.user_story_feedback enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
  on public.user_preferences for select using (auth.uid() = user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
  on public.user_preferences for insert with check (auth.uid() = user_id);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
  on public.user_preferences for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_interest_signals_select_own" on public.user_interest_signals;
create policy "user_interest_signals_select_own"
  on public.user_interest_signals for select using (auth.uid() = user_id);

drop policy if exists "user_story_feedback_select_own" on public.user_story_feedback;
create policy "user_story_feedback_select_own"
  on public.user_story_feedback for select using (auth.uid() = user_id);

drop policy if exists "user_story_feedback_insert_own" on public.user_story_feedback;
create policy "user_story_feedback_insert_own"
  on public.user_story_feedback for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Bootstrap preferences on new user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, account_type, onboarding_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Wellumi member'),
    case
      when new.is_anonymous then 'guest'
      when new.app_metadata->>'provider' = 'apple' then 'apple'
      when new.email is not null then 'email'
      else 'guest'
    end,
    'not_started'
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
