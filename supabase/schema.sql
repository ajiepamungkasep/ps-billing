-- Supabase PostgreSQL schema for PS Billing
create table if not exists public.stations (
  id bigserial primary key,
  name text not null,
  type text not null default 'PS4',
  status text not null default 'available' check (status in ('available','in_use','maintenance')),
  created_at timestamptz default now()
);

create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  price numeric not null check (price > 0),
  stock integer not null default 0 check (stock >= 0),
  category text default 'food',
  active integer default 1,
  created_at timestamptz default now()
);

create table if not exists public.timer_pricing (
  id bigserial primary key,
  label text not null,
  console_type text not null default 'PS4' check (console_type in ('PS2', 'PS3', 'PS4')),
  duration_minutes integer,
  price numeric not null check (price > 0),
  type text default 'hourly' check (type in ('hourly','package','open')),
  active integer default 1
);

create table if not exists public.sessions (
  id bigserial primary key,
  station_id bigint not null references public.stations(id),
  customer_name text,
  pricing_id bigint references public.timer_pricing(id),
  custom_duration_minutes integer,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_minutes integer,
  total_price numeric default 0,
  status text default 'active' check (status in ('active','finished','cancelled')),
  notes text
);

create table if not exists public.orders (
  id bigserial primary key,
  session_id bigint references public.sessions(id),
  station_id bigint references public.stations(id),
  product_id bigint not null references public.products(id),
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null,
  subtotal numeric not null,
  created_at timestamptz default now()
);

create table if not exists public.cash_flow (
  id bigserial primary key,
  type text not null check (type in ('income','expense')),
  category text,
  amount numeric not null check (amount > 0),
  description text,
  ref_id bigint,
  created_at timestamptz default now()
);

insert into public.stations (name, type, status)
select * from (values
  ('PS4 - Unit 1', 'PS4', 'available'),
  ('PS4 - Unit 2', 'PS4', 'available'),
  ('PS4 - Unit 3', 'PS4', 'available'),
  ('PS5 - Unit 1', 'PS5', 'available'),
  ('PS5 - Unit 2', 'PS5', 'available')
) as v(name, type, status)
where not exists (select 1 from public.stations);

insert into public.timer_pricing (label, console_type, duration_minutes, price, type)
select * from (values
  ('1 Jam', 'PS4', 60, 8000, 'hourly'),
  ('2 Jam', 'PS4', 120, 15000, 'package'),
  ('3 Jam', 'PS4', 180, 20000, 'package'),
  ('Main Bebas', 'PS4', null, 6000, 'open')
) as v(label, console_type, duration_minutes, price, type)
where not exists (select 1 from public.timer_pricing);

insert into public.products (name, price, stock, category)
select * from (values
  ('Air Mineral', 3000, 50, 'drink'),
  ('Indomie Goreng', 5000, 30, 'food'),
  ('Kopi Sachet', 4000, 40, 'drink'),
  ('Chiki', 3000, 60, 'snack'),
  ('Teh Botol', 5000, 30, 'drink')
) as v(name, price, stock, category)
where not exists (select 1 from public.products);
