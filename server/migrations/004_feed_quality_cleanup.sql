-- Feed quality cleanup: generation mode, evergreen sources, recall metadata

alter table public.wellness_stories
  add column if not exists generation_mode text not null default 'fallback',
  add column if not exists fallback_reason text,
  add column if not exists display_eligible boolean not null default true;

alter table public.source_records
  add column if not exists is_evergreen boolean not null default false,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists recall_status text,
  add column if not exists recall_product_description text,
  add column if not exists recall_reason text,
  add column if not exists recall_initiation_date timestamptz;

create index if not exists wellness_stories_generation_mode_idx on public.wellness_stories (generation_mode);
create index if not exists source_records_is_evergreen_idx on public.source_records (is_evergreen);
