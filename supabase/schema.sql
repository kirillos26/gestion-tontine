create extension if not exists pgcrypto;

create table if not exists public.tontines (
  id uuid primary key default gen_random_uuid(),
  access_code_hash text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tontines enable row level security;
-- Aucune politique : les clients anon ne peuvent ni lire, ni lister, ni écrire la table.

create or replace function public.create_tontine(p_access_code text, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare new_id uuid;
begin
  if length(p_access_code) < 20 then raise exception 'Code trop court'; end if;
  insert into public.tontines(access_code_hash, data)
  values (crypt(p_access_code, gen_salt('bf', 10)), p_data)
  returning id into new_id;
  update public.tontines set data = data || jsonb_build_object('id', new_id) where id = new_id;
  return new_id;
end;
$$;

create or replace function public.open_tontine(p_access_code text)
returns jsonb
language sql security definer set search_path = public, extensions
as $$
  select data from public.tontines
  where access_code_hash = crypt(p_access_code, access_code_hash)
  limit 1;
$$;

create or replace function public.update_tontine(p_access_code text, p_data jsonb)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare target_id uuid;
begin
  select id into target_id from public.tontines
  where access_code_hash = crypt(p_access_code, access_code_hash) limit 1;
  if target_id is null then raise exception 'Code invalide'; end if;
  if p_data->>'id' is distinct from target_id::text then raise exception 'Identifiant invalide'; end if;
  update public.tontines set data = p_data, updated_at = now() where id = target_id;
  return true;
end;
$$;

revoke all on public.tontines from anon, authenticated;
grant execute on function public.create_tontine(text, jsonb) to anon, authenticated;
grant execute on function public.open_tontine(text) to anon, authenticated;
grant execute on function public.update_tontine(text, jsonb) to anon, authenticated;
