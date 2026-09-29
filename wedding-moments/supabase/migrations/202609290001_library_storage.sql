-- Standalone migration for the current per-user library. Does not depend on
-- the earlier, unused wedding schema and does not change or delete old tables.
create table if not exists public.wm_libraries (
  owner text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.wm_libraries enable row level security;
revoke all on public.wm_libraries from anon, authenticated;
grant select, insert, update on public.wm_libraries to service_role;

-- Atomic compare-and-swap prevents one admin tab from overwriting another.
create or replace function public.wm_save_library(p_owner text, p_data jsonb, p_revision bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare saved boolean;
begin
  if p_revision < 0 or length(p_owner) = 0 then
    raise exception 'Invalid library revision or owner';
  end if;
  if p_revision = 0 then
    insert into public.wm_libraries as target (owner, data, revision)
    values (p_owner, p_data, 1)
    on conflict (owner) do update
      set data = excluded.data, revision = target.revision + 1, updated_at = now()
      where target.revision = p_revision
    returning true into saved;
  else
    update public.wm_libraries
      set data = p_data, revision = revision + 1, updated_at = now()
      where owner = p_owner and revision = p_revision
    returning true into saved;
  end if;
  return coalesce(saved, false);
end;
$$;
revoke all on function public.wm_save_library(text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.wm_save_library(text, jsonb, bigint) to service_role;
