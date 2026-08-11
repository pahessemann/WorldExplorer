create extension if not exists pgcrypto;

create table if not exists public.city_cards (
  id text primary key,
  city text not null,
  title text not null,
  description text not null,
  image_url text,
  latitude double precision,
  longitude double precision,
  unlock_radius_m integer not null default 50,
  challenge_distance_m integer,
  qr_code text unique,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  author_device_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.card_votes (
  card_id text not null references public.city_cards(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (card_id, device_id)
);

create table if not exists public.explored_circles (
  id text primary key,
  device_id text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 50,
  explored_at timestamptz not null default now()
);

create table if not exists public.trips (
  id text primary key,
  device_id text not null,
  name text not null,
  city text,
  started_at timestamptz not null,
  duration_seconds integer not null,
  distance_m double precision not null,
  circles_count integer not null,
  points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view public.city_card_scores as
select c.*, count(v.card_id)::integer as votes
from public.city_cards c
left join public.card_votes v on v.card_id = c.id
group by c.id;

insert into public.city_cards (id, city, title, description, status, author_device_id)
values
  ('card-passage', 'Paris', 'Les passages secrets', 'Galeries vitrées, mosaïques et raccourcis cachés du Paris du XIXe siècle.', 'approved', 'worldexplorer-seed'),
  ('card-ourcq', 'Paris', 'L’eau sous la ville', 'Suivez la trace invisible du canal de l’Ourcq jusqu’au cœur de Paris.', 'approved', 'worldexplorer-seed'),
  ('card-bievre', 'Paris', 'La Bièvre retrouvée', 'Une rivière disparue, encore lisible dans les rues du 13e arrondissement.', 'approved', 'worldexplorer-seed'),
  ('card-toits', 'Paris', 'Les toits de zinc', 'Cheminées, mansardes et silhouettes qui dessinent l’horizon parisien.', 'proposed', 'worldexplorer-seed')
on conflict (id) do nothing;

alter table public.city_cards enable row level security;
alter table public.card_votes enable row level security;
alter table public.explored_circles enable row level security;
alter table public.trips enable row level security;

create policy "Community cards are readable" on public.city_cards for select using (true);
create policy "Anyone can propose a card" on public.city_cards for insert with check (status = 'proposed');
create policy "Votes are readable" on public.card_votes for select using (true);
create policy "One anonymous vote per device" on public.card_votes for insert with check (length(device_id) >= 16);
create policy "Devices can sync circles" on public.explored_circles for insert with check (length(device_id) >= 16);
create policy "Devices can sync trips" on public.trips for insert with check (length(device_id) >= 16);

-- Exemple de validation automatique à adapter au volume de la communauté.
create or replace function public.approve_popular_cards() returns void language sql security definer as $$
  update public.city_cards c set status = 'approved'
  where c.status = 'proposed'
    and (select count(*) from public.card_votes v where v.card_id = c.id) >= 25;
$$;
