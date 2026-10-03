-- =============================================================================
-- Stub minimo dell'ambiente Supabase, SOLO per testare le migration su un
-- PostgreSQL vanilla (CI / sviluppo senza Docker). Non va mai applicato a un
-- progetto Supabase reale: lì auth e storage esistono già.
-- Riproduce: ruoli, grant di default su public, auth.uid(), auth.jwt(), storage minimo.
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
create schema auth;
create schema storage;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;

-- Come Supabase: tutto ciò che nasce in public è concesso ai ruoli API;
-- è la RLS (e le revoke esplicite delle migration) a proteggere i dati.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text unique
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  -- Stessa definizione di Supabase.
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Come in Supabase: claim del JWT della richiesta (incluso `aal`).
create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null,
  owner     uuid default auth.uid()
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

create function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
