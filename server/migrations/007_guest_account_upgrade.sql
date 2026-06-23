-- Guest account upgrade: secure migration tokens + atomic ownership merge RPC

-- ---------------------------------------------------------------------------
-- guest_migration_tokens: one-time handshake for guest -> permanent upgrade
-- ---------------------------------------------------------------------------
create table if not exists public.guest_migration_tokens (
  id uuid primary key default gen_random_uuid(),
  guest_user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists guest_migration_tokens_guest_user_idx
  on public.guest_migration_tokens (guest_user_id, consumed_at);

alter table public.guest_migration_tokens enable row level security;

-- Tokens are server-managed only (service role). No client policies.

-- ---------------------------------------------------------------------------
-- Helper: count user-owned rows for migration verification
-- ---------------------------------------------------------------------------
create or replace function public.count_user_owned_rows(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  v_count bigint;
begin
  select count(*) into v_count from public.profiles where id = p_user_id;
  result := result || jsonb_build_object('profiles', v_count);

  select count(*) into v_count from public.user_preferences where user_id = p_user_id;
  result := result || jsonb_build_object('user_preferences', v_count);

  select count(*) into v_count from public.user_interest_signals where user_id = p_user_id;
  result := result || jsonb_build_object('user_interest_signals', v_count);

  select count(*) into v_count from public.saved_products where user_id = p_user_id;
  result := result || jsonb_build_object('saved_products', v_count);

  select count(*) into v_count from public.user_story_matches where user_id = p_user_id;
  result := result || jsonb_build_object('user_story_matches', v_count);

  select count(*) into v_count from public.scans where user_id = p_user_id;
  result := result || jsonb_build_object('scans', v_count);

  select count(*) into v_count from public.analyses where user_id = p_user_id;
  result := result || jsonb_build_object('analyses', v_count);

  select count(*) into v_count from public.product_interest_profiles where user_id = p_user_id;
  result := result || jsonb_build_object('product_interest_profiles', v_count);

  select count(*) into v_count from public.user_feed_refresh where user_id = p_user_id;
  result := result || jsonb_build_object('user_feed_refresh', v_count);

  select count(*) into v_count from public.user_story_feedback where user_id = p_user_id;
  result := result || jsonb_build_object('user_story_feedback', v_count);

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic guest ownership merge
-- ---------------------------------------------------------------------------
create or replace function public.complete_guest_account_upgrade(
  p_token_hash text,
  p_destination_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token record;
  v_guest_user_id uuid;
  v_before_guest jsonb;
  v_before_dest jsonb;
  v_after_dest jsonb;
  v_guest_profile record;
  v_dest_profile record;
  v_guest_prefs record;
  v_dest_prefs record;
  v_merged_interests jsonb;
  v_merged_use_cases jsonb;
  v_merged_balance jsonb;
  v_merged_limited jsonb;
  v_merged_feed_mix jsonb;
  v_merged_notifications jsonb;
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    raise exception 'migration_token_required';
  end if;

  if p_destination_user_id is null then
    raise exception 'destination_user_required';
  end if;

  select *
  into v_token
  from public.guest_migration_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invalid_migration_token';
  end if;

  if v_token.consumed_at is not null then
    raise exception 'migration_token_already_used';
  end if;

  if v_token.expires_at < now() then
    raise exception 'migration_token_expired';
  end if;

  v_guest_user_id := v_token.guest_user_id;

  if v_guest_user_id = p_destination_user_id then
    update public.guest_migration_tokens
    set consumed_at = now(), consumed_by_user_id = p_destination_user_id
    where id = v_token.id;

    return jsonb_build_object(
      'migrated', false,
      'linked', true,
      'guest_user_id', v_guest_user_id,
      'destination_user_id', p_destination_user_id,
      'before_guest', public.count_user_owned_rows(v_guest_user_id),
      'before_destination', public.count_user_owned_rows(p_destination_user_id),
      'after_destination', public.count_user_owned_rows(p_destination_user_id)
    );
  end if;

  v_before_guest := public.count_user_owned_rows(v_guest_user_id);
  v_before_dest := public.count_user_owned_rows(p_destination_user_id);

  select * into v_guest_profile from public.profiles where id = v_guest_user_id;
  select * into v_dest_profile from public.profiles where id = p_destination_user_id;

  select * into v_guest_prefs from public.user_preferences where user_id = v_guest_user_id;
  select * into v_dest_prefs from public.user_preferences where user_id = p_destination_user_id;

  -- profiles: preserve destination id; prefer completed onboarding; newest display name
  if v_dest_profile.id is null and v_guest_profile.id is not null then
    insert into public.profiles (
      id,
      display_name,
      account_type,
      onboarding_status,
      onboarding_step,
      onboarding_completed_at,
      profile_version,
      preference_version,
      last_profile_sync_at,
      last_seen_at
    )
    values (
      p_destination_user_id,
      coalesce(v_guest_profile.display_name, 'Wellumi member'),
      case when v_guest_profile.account_type = 'guest' then 'email' else v_guest_profile.account_type end,
      v_guest_profile.onboarding_status,
      v_guest_profile.onboarding_step,
      v_guest_profile.onboarding_completed_at,
      coalesce(v_guest_profile.profile_version, 1),
      coalesce(v_guest_profile.preference_version, 1),
      now(),
      v_guest_profile.last_seen_at
    )
    on conflict (id) do nothing;

    select * into v_dest_profile from public.profiles where id = p_destination_user_id;
  end if;

  if v_dest_profile.id is not null then
    update public.profiles
    set
      display_name = case
        when v_dest_profile.updated_at >= coalesce(v_guest_profile.updated_at, v_dest_profile.updated_at)
          and coalesce(v_dest_profile.display_name, '') <> ''
          and v_dest_profile.display_name <> 'Wellumi member'
          then v_dest_profile.display_name
        when coalesce(v_guest_profile.display_name, '') <> ''
          and v_guest_profile.display_name <> 'Wellumi member'
          then v_guest_profile.display_name
        else coalesce(v_dest_profile.display_name, v_guest_profile.display_name, 'Wellumi member')
      end,
      account_type = case
        when v_dest_profile.account_type in ('email', 'apple') then v_dest_profile.account_type
        when v_guest_profile.account_type in ('email', 'apple') then v_guest_profile.account_type
        else coalesce(v_dest_profile.account_type, 'email')
      end,
      onboarding_status = case
        when v_dest_profile.onboarding_status = 'completed'
          or coalesce(v_guest_profile.onboarding_status, '') = 'completed' then 'completed'
        when v_dest_profile.onboarding_status = 'in_progress'
          or coalesce(v_guest_profile.onboarding_status, '') = 'in_progress' then 'in_progress'
        else coalesce(v_dest_profile.onboarding_status, v_guest_profile.onboarding_status, 'not_started')
      end,
      onboarding_step = case
        when v_dest_profile.onboarding_status = 'completed' then v_dest_profile.onboarding_step
        when coalesce(v_guest_profile.onboarding_status, '') = 'completed' then v_guest_profile.onboarding_step
        else coalesce(v_dest_profile.onboarding_step, v_guest_profile.onboarding_step)
      end,
      onboarding_completed_at = coalesce(
        greatest(v_dest_profile.onboarding_completed_at, v_guest_profile.onboarding_completed_at),
        v_dest_profile.onboarding_completed_at,
        v_guest_profile.onboarding_completed_at
      ),
      profile_version = greatest(coalesce(v_dest_profile.profile_version, 1), coalesce(v_guest_profile.profile_version, 1)),
      preference_version = greatest(coalesce(v_dest_profile.preference_version, 1), coalesce(v_guest_profile.preference_version, 1)),
      last_profile_sync_at = now(),
      last_seen_at = greatest(v_dest_profile.last_seen_at, v_guest_profile.last_seen_at)
    where id = p_destination_user_id;
  end if;

  -- user_preferences: one row; destination explicit edits win; union arrays
  v_merged_interests := (
    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(coalesce(v_guest_prefs.selected_interests, '[]'::jsonb)) as value
      union
      select jsonb_array_elements_text(coalesce(v_dest_prefs.selected_interests, '[]'::jsonb)) as value
    ) merged
  );

  v_merged_use_cases := (
    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(coalesce(v_guest_prefs.selected_use_cases, '[]'::jsonb)) as value
      union
      select jsonb_array_elements_text(coalesce(v_dest_prefs.selected_use_cases, '[]'::jsonb)) as value
    ) merged
  );

  v_merged_limited := (
    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(coalesce(v_guest_prefs.limited_topics, '[]'::jsonb)) as value
      union
      select jsonb_array_elements_text(coalesce(v_dest_prefs.limited_topics, '[]'::jsonb)) as value
    ) merged
  );

  v_merged_balance := coalesce(v_guest_prefs.content_balance, '{}'::jsonb) || coalesce(v_dest_prefs.content_balance, '{}'::jsonb);
  v_merged_feed_mix := coalesce(v_guest_prefs.preferred_feed_mix, '{}'::jsonb) || coalesce(v_dest_prefs.preferred_feed_mix, '{}'::jsonb);
  v_merged_notifications := coalesce(v_guest_prefs.notifications, '{}'::jsonb) || coalesce(v_dest_prefs.notifications, '{}'::jsonb);

  insert into public.user_preferences (
    user_id,
    selected_interests,
    selected_use_cases,
    content_balance,
    limited_topics,
    preferred_feed_mix,
    notifications,
    created_at,
    updated_at
  )
  values (
    p_destination_user_id,
    coalesce(v_merged_interests, '[]'::jsonb),
    coalesce(v_merged_use_cases, '[]'::jsonb),
    coalesce(v_merged_balance, '{}'::jsonb),
    coalesce(v_merged_limited, '[]'::jsonb),
    coalesce(v_merged_feed_mix, '{}'::jsonb),
    coalesce(v_merged_notifications, '{}'::jsonb),
    least(coalesce(v_guest_prefs.created_at, now()), coalesce(v_dest_prefs.created_at, now())),
    now()
  )
  on conflict (user_id) do update set
    selected_interests = excluded.selected_interests,
    selected_use_cases = excluded.selected_use_cases,
    content_balance = excluded.content_balance,
    limited_topics = excluded.limited_topics,
    preferred_feed_mix = excluded.preferred_feed_mix,
    notifications = excluded.notifications,
    updated_at = now();

  delete from public.user_preferences where user_id = v_guest_user_id and user_id <> p_destination_user_id;

  -- user_interest_signals: merge on uniqueness key; strongest explicit negative wins
  insert into public.user_interest_signals (
    user_id,
    topic,
    signal_type,
    source_type,
    source_id,
    weight,
    confidence,
    is_explicit,
    first_seen_at,
    last_seen_at,
    expires_at,
    is_active,
    metadata
  )
  select
    p_destination_user_id,
    s.topic,
    s.signal_type,
    s.source_type,
    s.source_id,
    s.weight,
    s.confidence,
    s.is_explicit,
    s.first_seen_at,
    s.last_seen_at,
    s.expires_at,
    s.is_active,
    s.metadata
  from public.user_interest_signals s
  where s.user_id = v_guest_user_id
  on conflict (
    user_id,
    topic,
    signal_type,
    source_type,
    (coalesce(source_id, ''))
  ) do update set
    weight = case
      when excluded.is_explicit and excluded.weight < 0 and user_interest_signals.is_explicit and user_interest_signals.weight < 0
        then least(excluded.weight, user_interest_signals.weight)
      when excluded.is_explicit and excluded.weight < 0 then excluded.weight
      when user_interest_signals.is_explicit and user_interest_signals.weight < 0 then user_interest_signals.weight
      else excluded.weight + user_interest_signals.weight
    end,
    confidence = greatest(coalesce(excluded.confidence, 0), coalesce(user_interest_signals.confidence, 0)),
    is_explicit = excluded.is_explicit or user_interest_signals.is_explicit,
    first_seen_at = least(excluded.first_seen_at, user_interest_signals.first_seen_at),
    last_seen_at = greatest(excluded.last_seen_at, user_interest_signals.last_seen_at),
    expires_at = coalesce(excluded.expires_at, user_interest_signals.expires_at),
    is_active = excluded.is_active or user_interest_signals.is_active,
    metadata = user_interest_signals.metadata || excluded.metadata;

  delete from public.user_interest_signals where user_id = v_guest_user_id;

  -- saved_products: dedupe by destination user + product; keep earliest save date
  insert into public.saved_products (user_id, product_id, created_at)
  select p_destination_user_id, sp.product_id, sp.created_at
  from public.saved_products sp
  where sp.user_id = v_guest_user_id
  on conflict (user_id, product_id) do update set
    created_at = least(excluded.created_at, saved_products.created_at);

  delete from public.saved_products where user_id = v_guest_user_id;

  -- user_story_matches: dedupe by destination user + story; preserve engagement state
  insert into public.user_story_matches (
    user_id,
    story_id,
    personalization_reason,
    matched_products,
    matched_interests,
    rank_score,
    is_personalized,
    is_read,
    is_dismissed,
    created_at,
    is_active,
    last_matched_at,
    match_version,
    refresh_token,
    match_explanation
  )
  select
    p_destination_user_id,
    m.story_id,
    m.personalization_reason,
    m.matched_products,
    m.matched_interests,
    m.rank_score,
    m.is_personalized,
    m.is_read,
    m.is_dismissed,
    m.created_at,
    coalesce(m.is_active, true),
    m.last_matched_at,
    coalesce(m.match_version, 1),
    m.refresh_token,
    coalesce(m.match_explanation, '{}'::jsonb)
  from public.user_story_matches m
  where m.user_id = v_guest_user_id
  on conflict (user_id, story_id) do update set
    rank_score = greatest(excluded.rank_score, user_story_matches.rank_score),
    is_read = excluded.is_read or user_story_matches.is_read,
    is_dismissed = excluded.is_dismissed or user_story_matches.is_dismissed,
    is_personalized = excluded.is_personalized or user_story_matches.is_personalized,
    matched_products = case
      when jsonb_array_length(excluded.matched_products) >= jsonb_array_length(user_story_matches.matched_products)
        then excluded.matched_products
      else user_story_matches.matched_products
    end,
    matched_interests = case
      when jsonb_array_length(excluded.matched_interests) >= jsonb_array_length(user_story_matches.matched_interests)
        then excluded.matched_interests
      else user_story_matches.matched_interests
    end,
    is_active = excluded.is_active or user_story_matches.is_active,
    last_matched_at = greatest(excluded.last_matched_at, user_story_matches.last_matched_at),
    match_explanation = user_story_matches.match_explanation || excluded.match_explanation;

  delete from public.user_story_matches where user_id = v_guest_user_id;

  -- scans and analyses: transfer ownership, preserve ids
  update public.scans set user_id = p_destination_user_id where user_id = v_guest_user_id;
  update public.analyses set user_id = p_destination_user_id where user_id = v_guest_user_id;

  -- product_interest_profiles: dedupe by user + product
  insert into public.product_interest_profiles (
    user_id,
    product_id,
    profile,
    personalization_strength,
    scan_count,
    is_saved,
    last_derived_at
  )
  select
    p_destination_user_id,
    pip.product_id,
    pip.profile,
    pip.personalization_strength,
    pip.scan_count,
    pip.is_saved,
    pip.last_derived_at
  from public.product_interest_profiles pip
  where pip.user_id = v_guest_user_id
  on conflict (user_id, product_id) do update set
    profile = product_interest_profiles.profile || excluded.profile,
    personalization_strength = case
      when excluded.personalization_strength = 'high' or product_interest_profiles.personalization_strength = 'high' then 'high'
      when excluded.personalization_strength = 'medium' or product_interest_profiles.personalization_strength = 'medium' then 'medium'
      else 'low'
    end,
    scan_count = greatest(excluded.scan_count, product_interest_profiles.scan_count),
    is_saved = excluded.is_saved or product_interest_profiles.is_saved,
    last_derived_at = greatest(excluded.last_derived_at, product_interest_profiles.last_derived_at);

  delete from public.product_interest_profiles where user_id = v_guest_user_id;

  -- user_feed_refresh: keep most recent valid timestamps
  insert into public.user_feed_refresh (
    user_id,
    last_refreshed_at,
    live_refresh_completed_at,
    last_live_refresh_at,
    evergreen_fallback_used
  )
  select
    p_destination_user_id,
    ufr.last_refreshed_at,
    ufr.live_refresh_completed_at,
    ufr.last_live_refresh_at,
    ufr.evergreen_fallback_used
  from public.user_feed_refresh ufr
  where ufr.user_id = v_guest_user_id
  on conflict (user_id) do update set
    last_refreshed_at = greatest(excluded.last_refreshed_at, user_feed_refresh.last_refreshed_at),
    live_refresh_completed_at = greatest(excluded.live_refresh_completed_at, user_feed_refresh.live_refresh_completed_at),
    last_live_refresh_at = greatest(excluded.last_live_refresh_at, user_feed_refresh.last_live_refresh_at),
    evergreen_fallback_used = excluded.evergreen_fallback_used or user_feed_refresh.evergreen_fallback_used;

  delete from public.user_feed_refresh where user_id = v_guest_user_id;

  -- user_story_feedback: transfer ownership (append-only history)
  update public.user_story_feedback set user_id = p_destination_user_id where user_id = v_guest_user_id;

  -- Remove guest profile row after data transfer (do not delete auth identity here)
  delete from public.profiles where id = v_guest_user_id and id <> p_destination_user_id;

  update public.guest_migration_tokens
  set consumed_at = now(), consumed_by_user_id = p_destination_user_id
  where id = v_token.id;

  v_after_dest := public.count_user_owned_rows(p_destination_user_id);

  return jsonb_build_object(
    'migrated', true,
    'linked', false,
    'guest_user_id', v_guest_user_id,
    'destination_user_id', p_destination_user_id,
    'before_guest', v_before_guest,
    'before_destination', v_before_dest,
    'after_destination', v_after_dest
  );
exception
  when others then
    raise;
end;
$$;
