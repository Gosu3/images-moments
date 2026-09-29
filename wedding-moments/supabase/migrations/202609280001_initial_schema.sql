create extension if not exists pgcrypto;
create type public.wedding_visibility as enum ('public','password','private');
create type public.photo_status as enum ('pending','processing','ready','failed','deleted');
create type public.download_status as enum ('queued','packaging','ready','failed','expired');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
create table public.weddings (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id), slug text not null unique,
  partner_one_name text not null, partner_two_name text not null, wedding_date date, location text,
  visibility public.wedding_visibility not null default 'private', password_hash text, theme jsonb not null default '{}'::jsonb,
  cover_photo_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.albums (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id) on delete cascade,
  slug text not null, name text not null, description text, sort_order integer not null default 0, is_hidden boolean not null default false,
  visibility public.wedding_visibility, password_hash text, cover_photo_id uuid, created_at timestamptz not null default now(), unique(wedding_id,slug)
);
create table public.photos (
  id uuid primary key default gen_random_uuid(), album_id uuid not null references public.albums(id) on delete cascade,
  object_key text not null unique, original_filename text not null, display_name text, mime_type text not null,
  width integer, height integer, file_size bigint not null check(file_size>0), taken_at timestamptz, uploaded_at timestamptz not null default now(),
  sort_order integer not null default 0, orientation smallint, camera_model text, location jsonb, caption text,
  is_featured boolean not null default false, is_hidden boolean not null default false, checksum text not null,
  blur_placeholder text, status public.photo_status not null default 'pending', deleted_at timestamptz,
  unique(album_id,checksum)
);
alter table public.weddings add constraint weddings_cover_photo_fk foreign key(cover_photo_id) references public.photos(id) on delete set null;
alter table public.albums add constraint albums_cover_photo_fk foreign key(cover_photo_id) references public.photos(id) on delete set null;
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create table public.album_access (
  id uuid primary key default gen_random_uuid(), album_id uuid not null references public.albums(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade, granted_at timestamptz not null default now(), expires_at timestamptz not null,
  unique(album_id,guest_session_id)
);
create table public.favorites (
  id uuid primary key default gen_random_uuid(), photo_id uuid not null references public.photos(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade, user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(), check((guest_session_id is not null)::int + (user_id is not null)::int = 1)
);
create unique index favorites_guest_unique on public.favorites(photo_id,guest_session_id) where guest_session_id is not null;
create unique index favorites_user_unique on public.favorites(photo_id,user_id) where user_id is not null;
create table public.download_jobs (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id) on delete cascade,
  requested_by uuid references public.users(id), guest_session_id uuid references public.guest_sessions(id), status public.download_status not null default 'queued',
  photo_ids uuid[] not null, object_key text, progress smallint not null default 0 check(progress between 0 and 100), error_message text,
  expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index albums_wedding_sort_idx on public.albums(wedding_id,sort_order);
create index photos_album_sort_idx on public.photos(album_id,sort_order,id) where deleted_at is null and is_hidden=false;
create index photos_album_taken_idx on public.photos(album_id,taken_at,id) where deleted_at is null;
create index download_jobs_status_idx on public.download_jobs(status,created_at);

alter table public.users enable row level security; alter table public.weddings enable row level security; alter table public.albums enable row level security;
alter table public.photos enable row level security; alter table public.favorites enable row level security; alter table public.download_jobs enable row level security;
create policy "users read own profile" on public.users for select using(auth.uid()=id);
create policy "owners manage weddings" on public.weddings for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create policy "owners manage albums" on public.albums for all using(exists(select 1 from public.weddings w where w.id=wedding_id and w.owner_id=auth.uid())) with check(exists(select 1 from public.weddings w where w.id=wedding_id and w.owner_id=auth.uid()));
create policy "owners manage photos" on public.photos for all using(exists(select 1 from public.albums a join public.weddings w on w.id=a.wedding_id where a.id=album_id and w.owner_id=auth.uid())) with check(exists(select 1 from public.albums a join public.weddings w on w.id=a.wedding_id where a.id=album_id and w.owner_id=auth.uid()));
create policy "users manage favorites" on public.favorites for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "owners read download jobs" on public.download_jobs for select using(exists(select 1 from public.weddings w where w.id=wedding_id and w.owner_id=auth.uid()));
