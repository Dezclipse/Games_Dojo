-- =====================================================
-- Dojo Hobo 2 - skema Supabase
-- Jalankan seluruh file ini di Supabase > SQL Editor
-- =====================================================

-- ---------- PROFIL ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  nama text not null default '',
  hp text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nama, hp)
  values (new.id, coalesce(new.raw_user_meta_data->>'nama',''), new.raw_user_meta_data->>'hp');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- ---------- TABEL UTAMA ----------
create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  konsol text not null default 'PS5',
  tarif_per_jam int not null default 8000,
  pos_x numeric not null default 50,
  pos_y numeric not null default 50,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists stations_nama_unik on stations (nama);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations on delete cascade,
  user_id uuid references auth.users on delete set null,
  nama text not null,
  jenis text not null check (jenis in ('antri','jadwal')),
  jadwal_mulai timestamptz,
  durasi_menit int not null check (durasi_menit between 15 and 480),
  biaya int not null default 0,
  status text not null default 'menunggu' check (status in ('menunggu','main','selesai','batal')),
  mulai_aktual timestamptz,
  selesai_aktual timestamptz,
  auto_cutoff boolean not null default false,
  created_at timestamptz not null default now()
);
-- Jaga-jaga buat yang sudah pernah menjalankan schema ini sebelum kolom ini ada.
alter table bookings add column if not exists auto_cutoff boolean not null default false;
create index if not exists bookings_station_status on bookings (station_id, status);
create index if not exists bookings_user on bookings (user_id, status);

create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  isi text,
  gambar_url text,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kategori text not null default 'makanan' check (kategori in ('makanan','minuman','snack')),
  harga int not null default 0,
  deskripsi text,
  gambar_url text,
  tersedia boolean not null default true
);
create unique index if not exists menu_items_nama_unik on menu_items (nama);
-- Jaga-jaga buat yang sudah pernah menjalankan schema ini sebelum kolom ini ada.
alter table menu_items add column if not exists gambar_url text;

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  deskripsi text,
  gambar_url text,
  platform text[] not null default '{PS5}',   -- PS5, PS4, PS3, Xbox Series X|S, Xbox One, PC, Nintendo Switch, Mobile
  genre text[] not null default '{}',          -- aksi, olahraga, balap, fighting, horor, petualangan, party, rpg, strategi, puzzle, simulasi, battle-royale, fps, platformer
  jumlah_pemain text[] not null default '{}',  -- solo, duo, 3-4-pemain, multiplayer-besar
  mode_main text[] not null default '{}',      -- online, offline, split-screen, co-op-lokal
  gaya text[] not null default '{}',           -- santai, kompetitif, cerita, cepat (dipakai kuis rekomendasi)
  tahun_rilis int,
  rating_usia text default 'Semua Umur' check (rating_usia in ('Semua Umur','7+','13+','16+','18+')),
  developer text,
  publisher text,
  dipilih int not null default 0,
  likes_count int not null default 0,  -- disukai (Hall of Fame), anonim lewat localStorage di browser pengunjung
  created_at timestamptz not null default now()
);
alter table games add column if not exists likes_count int not null default 0;
-- Link trailer YouTube (watch, youtu.be, shorts, atau embed). Dipakai di modal detail game.
alter table games add column if not exists trailer_url text;
create unique index if not exists games_judul_unik on games (judul);
create index if not exists games_tahun on games (tahun_rilis desc);
create index if not exists games_dipilih on games (dipilih desc);
create index if not exists games_likes on games (likes_count desc);

-- ---------- Data master (parameter game, diatur dari dashboard admin) ----------
create table if not exists master_platform (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  label text not null,
  urutan int not null default 0
);
create table if not exists master_genre (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  label text not null,
  urutan int not null default 0
);
create table if not exists master_jumlah_pemain (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  label text not null,
  urutan int not null default 0
);
create table if not exists master_mode_main (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  label text not null,
  urutan int not null default 0
);
create table if not exists master_gaya (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  label text not null,
  urutan int not null default 0
);

-- ---------- RLS ----------
alter table profiles   enable row level security;
alter table stations   enable row level security;
alter table bookings   enable row level security;
alter table news       enable row level security;
alter table menu_items enable row level security;
alter table games      enable row level security;
alter table master_platform      enable row level security;
alter table master_genre         enable row level security;
alter table master_jumlah_pemain enable row level security;
alter table master_mode_main     enable row level security;
alter table master_gaya          enable row level security;

drop policy if exists "profil: baca sendiri" on profiles;
create policy "profil: baca sendiri" on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists "profil: admin ubah" on profiles;
create policy "profil: admin ubah" on profiles for update using (is_admin()) with check (is_admin());

-- baca publik (tanpa login)
do $$
declare t text;
begin
  foreach t in array array['stations','bookings','news','menu_items','games',
    'master_platform','master_genre','master_jumlah_pemain','master_mode_main','master_gaya'] loop
    execute format('drop policy if exists "publik baca" on %I', t);
    execute format('create policy "publik baca" on %I for select using (true)', t);
    execute format('drop policy if exists "admin tulis" on %I', t);
    execute format('create policy "admin tulis" on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Catatan: user biasa TIDAK bisa insert/update bookings langsung.
-- Semua lewat fungsi di bawah agar aturan bisnis dipaksa di server.

-- ---------- FUNGSI BOOKING ----------
create or replace function buat_booking(
  p_station uuid, p_jenis text, p_mulai timestamptz, p_durasi int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tarif int; v_nama text; v_id uuid; v_akhir timestamptz; v_jumlah int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu untuk booking.'; end if;
  if p_jenis not in ('antri','jadwal') then raise exception 'Jenis booking tidak valid.'; end if;
  if p_durasi is null or p_durasi < 15 or p_durasi > 480 then
    raise exception 'Durasi harus 15 sampai 480 menit.';
  end if;

  select tarif_per_jam into v_tarif from stations where id = p_station and aktif;
  if v_tarif is null then raise exception 'Unit tidak tersedia untuk booking.'; end if;

  select count(*) into v_jumlah from bookings
   where user_id = auth.uid() and status in ('menunggu','main');
  if v_jumlah >= 3 then raise exception 'Maksimal 3 booking aktif. Batalkan salah satu dulu.'; end if;

  select nama into v_nama from profiles where id = auth.uid();

  if p_jenis = 'jadwal' then
    if p_mulai is null or p_mulai < now() then
      raise exception 'Waktu mulai harus di masa depan.';
    end if;
    v_akhir := p_mulai + make_interval(mins => p_durasi);

    -- cek bentrok interval: a.mulai < b.selesai AND a.selesai > b.mulai
    if exists (
      select 1 from bookings b
       where b.station_id = p_station and b.status = 'menunggu' and b.jenis = 'jadwal'
         and b.jadwal_mulai < v_akhir
         and b.jadwal_mulai + make_interval(mins => b.durasi_menit) > p_mulai
    ) or exists (
      select 1 from bookings b
       where b.station_id = p_station and b.status = 'main'
         and b.mulai_aktual < v_akhir and b.selesai_aktual > p_mulai
    ) then
      raise exception 'Jam itu bentrok dengan booking lain. Pilih jam berbeda.';
    end if;
  end if;

  insert into bookings (station_id, user_id, nama, jenis, jadwal_mulai, durasi_menit, biaya)
  values (p_station, auth.uid(), coalesce(nullif(v_nama,''),'Pemain'), p_jenis,
          case when p_jenis = 'jadwal' then p_mulai end, p_durasi,
          round(v_tarif * p_durasi / 60.0))
  returning id into v_id;

  return v_id;
end $$;

create or replace function batalkan_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_id;
  if b.id is null then raise exception 'Booking tidak ditemukan.'; end if;
  if b.user_id is distinct from auth.uid() and not is_admin() then
    raise exception 'Ini bukan booking kamu.';
  end if;
  if b.status = 'menunggu' then
    update bookings set status = 'batal' where id = p_id;
  elsif b.status = 'main' then
    update bookings set status = 'selesai', selesai_aktual = now() where id = p_id;
  else
    raise exception 'Booking sudah selesai atau dibatalkan.';
  end if;
end $$;

-- hitung "game terfavorit" dari pilihan pengunjung
create or replace function pilih_game(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update games set dipilih = dipilih + 1 where id = p_id;
$$;

-- suka / batal suka game (anonim, dicatat di localStorage browser pengunjung, bukan akun) -> dipakai Hall of Fame
create or replace function sukai_game(p_id uuid) returns int
language sql security definer set search_path = public as $$
  update games set likes_count = likes_count + 1 where id = p_id returning likes_count;
$$;
create or replace function batal_sukai_game(p_id uuid) returns int
language sql security definer set search_path = public as $$
  update games set likes_count = greatest(0, likes_count - 1) where id = p_id returning likes_count;
$$;

grant execute on function buat_booking(uuid, text, timestamptz, int) to authenticated;
grant execute on function batalkan_booking(uuid) to authenticated;
grant execute on function pilih_game(uuid) to anon, authenticated;
grant execute on function sukai_game(uuid) to anon, authenticated;
grant execute on function batal_sukai_game(uuid) to anon, authenticated;

-- ---------- STORAGE (upload gambar berita, game, dll dari dashboard admin) ----------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists "uploads: publik baca" on storage.objects;
create policy "uploads: publik baca" on storage.objects for select using (bucket_id = 'uploads');
drop policy if exists "uploads: admin unggah" on storage.objects;
create policy "uploads: admin unggah" on storage.objects for insert with check (bucket_id = 'uploads' and is_admin());
drop policy if exists "uploads: admin ubah" on storage.objects;
create policy "uploads: admin ubah" on storage.objects for update using (bucket_id = 'uploads' and is_admin());
drop policy if exists "uploads: admin hapus" on storage.objects;
create policy "uploads: admin hapus" on storage.objects for delete using (bucket_id = 'uploads' and is_admin());

-- ---------- REALTIME ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table bookings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'stations'
  ) then
    alter publication supabase_realtime add table stations;
  end if;
end $$;

-- ---------- AUTO CUTOFF ----------
-- Tutup otomatis sesi 'main' yang sudah lewat waktu dan auto_cutoff-nya dinyalakan admin
-- saat memulai sesi. Jalan tiap menit lewat pg_cron, jadi tetap jalan walau dashboard
-- admin lagi nggak dibuka siapa-siapa. Butuh extension pg_cron aktif di project ini
-- (Database > Extensions di dashboard Supabase, biasanya sudah tersedia di semua plan).
-- Kalau extension belum aktif, blok ini dilewati dengan notice, sisanya tetap jalan normal.
do $$
begin
  create extension if not exists pg_cron;

  if exists (select 1 from cron.job where jobname = 'giliran-ps-auto-cutoff') then
    perform cron.unschedule('giliran-ps-auto-cutoff');
  end if;

  perform cron.schedule(
    'giliran-ps-auto-cutoff',
    '* * * * *',
    $job$
      update bookings
      set status = 'selesai'
      where status = 'main'
        and auto_cutoff
        and selesai_aktual is not null
        and selesai_aktual <= now();
    $job$
  );
exception when others then
  raise notice 'Lewati setup auto-cutoff (pg_cron belum aktif di project ini): %', sqlerrm;
end $$;

-- ---------- DATA CONTOH ----------
insert into stations (nama, konsol, tarif_per_jam, pos_x, pos_y) values
  ('Unit 1', 'PS5', 10000, 18, 28),
  ('Unit 2', 'PS5', 10000, 50, 28),
  ('Unit 3', 'PS5', 10000, 82, 28),
  ('Unit 4', 'PS4', 7000, 30, 66),
  ('Unit 5', 'PS4', 7000, 70, 66)
on conflict (nama) do nothing;

insert into master_platform (kode, label, urutan) values
  ('PS5', 'PS5', 1), ('PS4', 'PS4', 2), ('PS3', 'PS3', 3),
  ('Xbox Series X|S', 'Xbox Series X/S', 4), ('Xbox One', 'Xbox One', 5),
  ('PC', 'PC', 6), ('Nintendo Switch', 'Nintendo Switch', 7), ('Mobile', 'Mobile', 8),
  ('PS VR2', 'PS VR2', 9), ('Steam Deck', 'Steam Deck', 10), ('Mac', 'Mac', 11)
on conflict (kode) do nothing;

insert into master_genre (kode, label, urutan) values
  ('aksi', 'Aksi', 1), ('rpg', 'RPG', 2), ('olahraga', 'Olahraga', 3), ('balap', 'Balap', 4),
  ('fighting', 'Fighting', 5), ('fps', 'FPS/Tembak-tembakan', 6), ('horor', 'Horor', 7),
  ('petualangan', 'Petualangan', 8), ('strategi', 'Strategi', 9), ('simulasi', 'Simulasi', 10),
  ('party', 'Party', 11), ('platformer', 'Platformer', 12), ('puzzle', 'Puzzle', 13),
  ('battle-royale', 'Battle Royale', 14), ('survival', 'Survival', 15), ('sandbox', 'Sandbox', 16),
  ('stealth', 'Stealth', 17), ('metroidvania', 'Metroidvania', 18), ('moba', 'MOBA', 19),
  ('musik', 'Musik/Rhythm', 20), ('visual-novel', 'Visual Novel', 21), ('kartu', 'Kartu/Board game', 22)
on conflict (kode) do nothing;

insert into master_jumlah_pemain (kode, label, urutan) values
  ('solo', 'Sendiri', 1), ('duo', 'Berdua', 2),
  ('3-4-pemain', 'Bertiga/berempat', 3), ('multiplayer-besar', 'Multiplayer besar', 4)
on conflict (kode) do nothing;

insert into master_mode_main (kode, label, urutan) values
  ('online', 'Online', 1), ('offline', 'Offline', 2),
  ('split-screen', 'Split-screen', 3), ('co-op-lokal', 'Co-op lokal', 4),
  ('lan', 'LAN party', 5), ('cross-platform', 'Cross-platform', 6)
on conflict (kode) do nothing;

insert into master_gaya (kode, label, urutan) values
  ('santai', 'Santai', 1), ('kompetitif', 'Kompetitif', 2),
  ('cerita', 'Ceritanya kuat', 3), ('cepat', 'Serba cepat', 4),
  ('menegangkan', 'Menegangkan', 5), ('edukatif', 'Edukatif', 6), ('strategis', 'Mikir strategi', 7)
on conflict (kode) do nothing;

insert into games
  (judul, deskripsi, gambar_url, platform, genre, jumlah_pemain, mode_main, gaya, tahun_rilis, rating_usia, developer, publisher) values



    ('EA Sports FC 25', 'Sepak bola terlengkap, cocok adu skill sama teman.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=EA+Sports+FC+25',
   '{PS5,PS4,Xbox Series X|S,Xbox One,PC}', '{olahraga}', '{duo,3-4-pemain}', '{online,offline}', '{kompetitif,cepat}',
   2024, 'Semua Umur', 'EA Vancouver', 'EA Sports'),

    ('Gran Turismo 7', 'Simulasi balap dengan mobil asli dan trek indah.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Gran+Turismo+7',
   '{PS5,PS4}', '{balap,simulasi}', '{solo,duo}', '{online,offline}', '{santai,kompetitif}',
   2022, 'Semua Umur', 'Polyphony Digital', 'Sony Interactive Entertainment'),

    ('Tekken 8', 'Fighting 3D dengan combo mendalam dan duel sengit.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Tekken+8',
   '{PS5,Xbox Series X|S,PC}', '{fighting}', '{duo}', '{online,offline}', '{kompetitif,cepat}',
   2024, '16+', 'Bandai Namco Studios', 'Bandai Namco'),

    ('Mortal Kombat 1', 'Fighting brutal dengan cerita dan karakter ikonik.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Mortal+Kombat+1',
   '{PS5,Xbox Series X|S,PC,Nintendo Switch}', '{fighting,aksi}', '{duo}', '{online,offline}', '{kompetitif,cerita}',
   2023, '18+', 'NetherRealm Studios', 'Warner Bros. Games'),

    ('God of War Ragnarok', 'Petualangan mitologi Nordik dengan cerita emosional.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=God+of+War+Ragnarok',
   '{PS5,PS4}', '{aksi,petualangan,rpg}', '{solo}', '{offline}', '{cerita}',
   2022, '18+', 'Santa Monica Studio', 'Sony Interactive Entertainment'),

    ('Marvel''s Spider-Man 2', 'Ayun keliling New York dan lawan penjahat ikonik.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Marvel+s+Spider+Man+2',
   '{PS5}', '{aksi,petualangan}', '{solo}', '{offline}', '{cerita,cepat}',
   2023, '16+', 'Insomniac Games', 'Sony Interactive Entertainment'),

    ('Resident Evil Village', 'Horor bertahan hidup dengan suasana mencekam.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Resident+Evil+Village',
   '{PS5,PS4,Xbox Series X|S,Xbox One,PC}', '{horor,aksi}', '{solo}', '{offline}', '{cerita}',
   2021, '18+', 'Capcom', 'Capcom'),

    ('It Takes Two', 'Petualangan kooperatif berdua yang penuh ide segar.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=It+Takes+Two',
   '{PS5,PS4,Xbox Series X|S,Xbox One,PC}', '{petualangan,party}', '{duo}', '{online,offline,split-screen}', '{santai,cerita}',
   2021, '7+', 'Hazelight Studios', 'EA'),

    ('Overcooked! All You Can Eat', 'Masak bareng di dapur kacau, seru dan bikin teriak.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Overcooked+All+You+Can+Eat',
   '{PS5,PS4,Xbox Series X|S,Nintendo Switch,PC}', '{party}', '{duo,3-4-pemain}', '{offline,online}', '{santai,kompetitif}',
   2021, 'Semua Umur', 'Ghost Town Games', 'Team17'),

    ('Need for Speed Unbound', 'Balap jalanan gaya kartun dengan aksi kejar-kejaran polisi.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Need+for+Speed+Unbound',
   '{PS5,Xbox Series X|S,PC}', '{balap,aksi}', '{solo,duo}', '{online,offline}', '{cepat,kompetitif}',
   2022, '13+', 'Criterion Games', 'EA'),

    ('Astro Bot', 'Platformer imut, mudah dimainkan semua umur.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Astro+Bot',
   '{PS5}', '{petualangan,platformer}', '{solo}', '{offline}', '{santai}',
   2024, 'Semua Umur', 'Team Asobi', 'Sony Interactive Entertainment'),

    ('Crash Team Racing Nitro-Fueled', 'Balap kart ringan, pas untuk main ramai-ramai.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Crash+Team+Racing+Nitro+Fueled',
   '{PS5,PS4,Xbox Series X|S,Nintendo Switch}', '{balap,party}', '{duo,3-4-pemain}', '{offline,online,split-screen}', '{santai,kompetitif}',
   2019, 'Semua Umur', 'Beenox', 'Activision'),

    ('The Last of Us Part I', 'Bertahan hidup di dunia pasca wabah, cerita kuat.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=The+Last+of+Us+Part+I',
   '{PS5,PC}', '{aksi,horor,petualangan}', '{solo}', '{offline}', '{cerita}',
   2022, '18+', 'Naughty Dog', 'Sony Interactive Entertainment'),

    ('Black Myth: Wukong', 'Action RPG mitologi Tiongkok dengan bos-bos raksasa.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Black+Myth+Wukong',
   '{PS5,PC}', '{aksi,rpg}', '{solo}', '{offline}', '{cerita,kompetitif}',
   2024, '16+', 'Game Science', 'Game Science'),

    ('Call of Duty: Black Ops 6', 'FPS militer cepat dengan mode kampanye dan multiplayer online.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Call+of+Duty+Black+Ops+6',
   '{PS5,PS4,Xbox Series X|S,Xbox One,PC}', '{fps,aksi}', '{solo,multiplayer-besar}', '{online,offline}', '{kompetitif,cepat}',
   2024, '18+', 'Treyarch', 'Activision'),

    ('Helldivers 2', 'Co-op tembak-tembakan satir melawan alien, kocak dan kacau.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Helldivers+2',
   '{PS5,PC}', '{aksi,fps}', '{3-4-pemain,multiplayer-besar}', '{online}', '{kompetitif,cepat}',
   2024, '16+', 'Arrowhead Game Studios', 'Sony Interactive Entertainment'),

    ('Dragon''s Dogma 2', 'RPG fantasi dunia terbuka dengan sistem Pawn yang unik.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Dragon+s+Dogma+2',
   '{PS5,Xbox Series X|S,PC}', '{rpg,petualangan}', '{solo}', '{offline}', '{cerita}',
   2024, '18+', 'Capcom', 'Capcom'),

    ('Final Fantasy VII Rebirth', 'RPG epik lanjutan remake FF7 dengan dunia luas.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Final+Fantasy+VII+Rebirth',
   '{PS5}', '{rpg,petualangan}', '{solo}', '{offline}', '{cerita}',
   2024, '16+', 'Square Enix', 'Square Enix'),

    ('Stellar Blade', 'Action RPG stylish dengan combat cepat dan desain dunia pasca-apokaliptik.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Stellar+Blade',
   '{PS5}', '{aksi,rpg}', '{solo}', '{offline}', '{cepat,cerita}',
   2024, '18+', 'Shift Up', 'Sony Interactive Entertainment'),

    ('Kingdom Come: Deliverance II', 'RPG abad pertengahan dengan simulasi realistis dan cerita dalam.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Kingdom+Come+Deliverance+II',
   '{PS5,Xbox Series X|S,PC}', '{rpg,simulasi}', '{solo}', '{offline}', '{cerita,santai}',
   2025, '18+', 'Warhorse Studios', 'Deep Silver'),

    ('Monster Hunter Wilds', 'Buru monster raksasa bareng tim di dunia terbuka yang dinamis.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Monster+Hunter+Wilds',
   '{PS5,Xbox Series X|S,PC}', '{aksi,rpg}', '{solo,3-4-pemain}', '{online,offline}', '{kompetitif,cerita}',
   2025, '16+', 'Capcom', 'Capcom'),

    ('Split Fiction', 'Petualangan co-op dari pembuat It Takes Two, lompat antar dunia fiksi.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Split+Fiction',
   '{PS5,Xbox Series X|S,PC}', '{petualangan,aksi}', '{duo}', '{online,offline,split-screen}', '{santai,cerita,cepat}',
   2025, '13+', 'Hazelight Studios', 'EA'),

    ('Clair Obscur: Expedition 33', 'RPG giliran dengan gaya seni lukisan dan cerita emosional.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Clair+Obscur+Expedition+33',
   '{PS5,Xbox Series X|S,PC}', '{rpg}', '{solo}', '{offline}', '{cerita,santai}',
   2025, '16+', 'Sandfall Interactive', 'Kepler Interactive'),

    ('Civilization VII', 'Strategi membangun peradaban lintas zaman, bisa main sendiri atau online.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Civilization+VII',
   '{PS5,Xbox Series X|S,PC,Nintendo Switch}', '{strategi}', '{solo,multiplayer-besar}', '{online,offline}', '{santai,kompetitif}',
   2025, '13+', 'Firaxis Games', '2K'),

    ('Elden Ring Nightreign', 'Spin-off kooperatif Elden Ring dengan format run cepat.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Elden+Ring+Nightreign',
   '{PS5,Xbox Series X|S,PC}', '{aksi,rpg}', '{solo,3-4-pemain}', '{online,offline}', '{kompetitif,cepat}',
   2025, '16+', 'FromSoftware', 'Bandai Namco'),

    ('Death Stranding 2: On the Beach', 'Petualangan sureal mengantar barang lintas benua pasca-bencana.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Death+Stranding+2+On+the+Beach',
   '{PS5}', '{aksi,petualangan}', '{solo}', '{online,offline}', '{cerita,santai}',
   2025, '16+', 'Kojima Productions', 'Sony Interactive Entertainment'),

    ('Borderlands 4', 'Looter-shooter kocak dengan jutaan kombinasi senjata.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Borderlands+4',
   '{PS5,Xbox Series X|S,PC}', '{fps,aksi,rpg}', '{solo,3-4-pemain}', '{online,offline}', '{kompetitif,cepat}',
   2025, '18+', 'Gearbox Software', '2K'),

    ('Ghost of Yotei', 'Aksi samurai dunia terbuka di Jepang era feodal.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Ghost+of+Yotei',
   '{PS5}', '{aksi,petualangan}', '{solo}', '{offline}', '{cerita,kompetitif}',
   2025, '18+', 'Sucker Punch Productions', 'Sony Interactive Entertainment'),

    ('Marvel Rivals', 'Hero shooter PvP 6v6 dengan karakter Marvel favorit.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Marvel+Rivals',
   '{PS5,Xbox Series X|S,PC}', '{fps,aksi}', '{3-4-pemain,multiplayer-besar}', '{online}', '{kompetitif,cepat}',
   2024, '13+', 'NetEase Games', 'NetEase Games'),

    ('Mario Kart World', 'Balap kart ikonik Nintendo dengan peta terbuka penuh warna.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Mario+Kart+World',
   '{Nintendo Switch}', '{balap,party}', '{duo,3-4-pemain}', '{online,offline,split-screen}', '{santai,kompetitif}',
   2025, 'Semua Umur', 'Nintendo EPD', 'Nintendo'),

  ('Silent Hill 2', 'Remake horor psikologis klasik dengan atmosfer mencekam.', 'https://placehold.co/480x640/1b1c1f/e8e6e3?font=poppins&text=Silent+Hill+2',
   '{PS5,PC}', '{horor,petualangan}', '{solo}', '{offline}', '{cerita}',
   2024, '18+', 'Bloober Team', 'Konami')
on conflict (judul) do nothing;

insert into menu_items (nama, kategori, harga, deskripsi) values
  ('Indomie goreng telur', 'makanan', 12000, 'Mi goreng dengan telur mata sapi.'),
  ('Nasi ayam geprek', 'makanan', 18000, 'Ayam crispy sambal geprek dengan nasi hangat.'),
  ('Kentang goreng', 'snack', 10000, 'Renyah, bisa dimakan sambil pegang stik.'),
  ('Keripik pisang', 'snack', 8000, 'Camilan manis gurih.'),
  ('Es teh manis', 'minuman', 5000, 'Segar dan dingin.'),
  ('Kopi susu', 'minuman', 12000, 'Kopi susu gula aren.'),
  ('Air mineral', 'minuman', 4000, 'Botol 600 ml.')
on conflict (nama) do nothing;

insert into news (judul, isi)
select judul, isi from (values
  ('Turnamen Tekken 8 akhir bulan', 'Daftar langsung di kasir atau lewat admin. Hadiah berupa jam main gratis dan voucher makanan. Kuota 16 peserta.'),
  ('Unit PS5 bertambah', 'Kami menambah unit PS5 supaya antrian lebih pendek di akhir pekan. Cek denah di halaman Booking.')
) as seed(judul, isi)
where not exists (select 1 from news n where n.judul = seed.judul);

-- ---------- JADIKAN AKUN ADMIN ----------
-- Setelah kamu daftar lewat aplikasi, jalankan (ganti emailnya):
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'emailkamu@contoh.com');
