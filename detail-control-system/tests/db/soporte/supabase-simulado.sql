-- Simula, para las pruebas en memoria (PGlite), lo mínimo que la plataforma
-- Supabase aporta antes de las migraciones: los roles de la API, el esquema
-- `auth` con sus usuarios y la función auth.uid().
-- No forma parte de las migraciones ni se aplica nunca a una base real.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Misma semántica que en Supabase: el `sub` del JWT de la petición.
create function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- En Supabase, todo objeto nuevo de `public` nace con permisos para los roles
-- de la API. Se replica para que las pruebas verifiquen que las migraciones
-- los revocan de verdad.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
