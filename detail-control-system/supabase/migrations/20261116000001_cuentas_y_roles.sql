-- =============================================================================
-- DETAIL CONTROL · Cuentas, registro y roles
--
--   * Roles: ADMINISTRADOR (además aprueba las cuentas nuevas) y OPERARIO.
--     Los dos operan existencias por igual.
--   * Registro abierto con aprobación: toda cuenta nueva (formulario o Google)
--     queda como solicitud de acceso, sin ver ni operar datos, hasta que un
--     administrador la aprueba y la incorpora a su organización.
--   * Puesta en marcha: la primera cuenta del sistema se activa como
--     administradora. Solo lo puede pedir el servidor de la aplicación.
--   * Las contraseñas las guarda Supabase Auth con bcrypt (auth.users):
--     las tablas de esta aplicación nunca las reciben ni las almacenan.
-- =============================================================================

create type public.rol_usuario as enum ('ADMINISTRADOR', 'OPERARIO');

alter table public.miembro
  add column rol public.rol_usuario not null default 'OPERARIO';

-- Quienes ya eran miembros tenían acceso completo: quedan como administradores.
update public.miembro set rol = 'ADMINISTRADOR';

-- -----------------------------------------------------------------------------
-- Solicitudes de acceso
-- -----------------------------------------------------------------------------
create table public.solicitud_acceso (
  usuario_id     uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null,
  correo         text,
  rol_solicitado public.rol_usuario not null default 'OPERARIO',
  creado_en      timestamptz not null default now(),
  constraint solicitud_nombre_no_vacio check (length(btrim(nombre)) > 0)
);

comment on table public.solicitud_acceso is
  'Cuentas registradas que esperan aprobación. Todavía no pertenecen a ninguna organización: por eso no llevan organizacion_id.';

create function interno.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembro m where m.usuario_id = auth.uid() and m.rol = 'ADMINISTRADOR'
  );
$$;

-- Cada cuenta nueva de Supabase Auth genera su solicitud de acceso.
create function interno.registrar_cuenta_nueva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_rol    public.rol_usuario;
begin
  -- Cuentas dadas de alta a mano (datos de prueba, scripts): se asocian por
  -- fuera. app_metadata solo lo escribe el servidor, nunca el usuario.
  if new.raw_app_meta_data ->> 'alta_manual' = 'true' then
    return new;
  end if;

  -- Formulario: «nombre». Google: «full_name» o «name».
  v_nombre := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario sin nombre'
  );
  -- El rol elegido es solo un pedido: lo confirma el administrador al aprobar.
  v_rol := case upper(coalesce(new.raw_user_meta_data ->> 'rol', ''))
             when 'ADMINISTRADOR' then 'ADMINISTRADOR'::public.rol_usuario
             else 'OPERARIO'::public.rol_usuario
           end;

  insert into public.solicitud_acceso (usuario_id, nombre, correo, rol_solicitado)
  values (new.id, left(v_nombre, 120), new.email, v_rol)
  on conflict (usuario_id) do nothing;

  return new;
end;
$$;

create trigger trg_auth_cuenta_nueva
  after insert on auth.users
  for each row execute function interno.registrar_cuenta_nueva();

-- -----------------------------------------------------------------------------
-- Puesta en marcha: la primera cuenta del sistema entra como administradora.
-- Solo la ejecuta el servidor (clave de servicio). Un bloqueo serializa dos
-- registros simultáneos: nunca puede haber dos «primeras» cuentas.
-- -----------------------------------------------------------------------------
create function public.activar_primera_cuenta(p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitud_acceso;
  v_org       uuid;
begin
  perform pg_advisory_xact_lock(hashtext('detail-control:primera-cuenta'));

  if exists (select 1 from public.miembro) then
    return false;
  end if;

  select * into v_solicitud from public.solicitud_acceso s where s.usuario_id = p_usuario_id;
  if not found then
    return false;
  end if;

  select o.id into v_org from public.organizacion o order by o.creado_en, o.id limit 1;
  if v_org is null then
    insert into public.organizacion (nombre) values ('GFK Estética Vehicular') returning id into v_org;
  end if;

  insert into public.miembro (usuario_id, organizacion_id, nombre, rol)
  values (v_solicitud.usuario_id, v_org, v_solicitud.nombre, 'ADMINISTRADOR');
  delete from public.solicitud_acceso s where s.usuario_id = p_usuario_id;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aprobación y rechazo (solo administradores, dentro de su organización)
-- -----------------------------------------------------------------------------
create function public.aprobar_solicitud(p_usuario_id uuid, p_rol text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario   uuid;
  v_org       uuid;
  v_solicitud public.solicitud_acceso;
  v_rol       public.rol_usuario;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();
  if not interno.es_administrador() then
    raise exception 'Solo un administrador puede aprobar cuentas.' using errcode = '42501';
  end if;

  select * into v_solicitud from public.solicitud_acceso s where s.usuario_id = p_usuario_id for update;
  if not found then
    raise exception 'La solicitud no existe o ya fue resuelta.' using errcode = 'P0002';
  end if;

  if p_rol is null or btrim(p_rol) = '' then
    v_rol := v_solicitud.rol_solicitado;
  elsif upper(p_rol) in ('ADMINISTRADOR', 'OPERARIO') then
    v_rol := upper(p_rol)::public.rol_usuario;
  else
    raise exception 'Rol no válido: %. Use ADMINISTRADOR u OPERARIO.', p_rol using errcode = '22023';
  end if;

  insert into public.miembro (usuario_id, organizacion_id, nombre, rol)
  values (v_solicitud.usuario_id, v_org, v_solicitud.nombre, v_rol);
  delete from public.solicitud_acceso s where s.usuario_id = p_usuario_id;
end;
$$;

-- La cuenta rechazada sigue existiendo, pero sin acceso a ningún dato.
create function public.rechazar_solicitud(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform interno.exigir_sesion();
  if not interno.es_administrador() then
    raise exception 'Solo un administrador puede rechazar cuentas.' using errcode = '42501';
  end if;

  delete from public.solicitud_acceso s where s.usuario_id = p_usuario_id;
  if not found then
    raise exception 'La solicitud no existe o ya fue resuelta.' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------
alter table public.solicitud_acceso enable row level security;

create policy solicitud_lectura_administrador on public.solicitud_acceso
  for select to authenticated
  using (interno.es_administrador());

revoke all on public.solicitud_acceso from public, anon, authenticated;
grant select on public.solicitud_acceso to authenticated;

revoke execute on function interno.es_administrador() from public, anon;
grant execute on function interno.es_administrador() to authenticated, service_role;
revoke execute on function interno.registrar_cuenta_nueva() from public, anon, authenticated;

revoke execute on function public.activar_primera_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.activar_primera_cuenta(uuid) to service_role;

revoke execute on function
  public.aprobar_solicitud(uuid, text),
  public.rechazar_solicitud(uuid)
from public, anon;
grant execute on function
  public.aprobar_solicitud(uuid, text),
  public.rechazar_solicitud(uuid)
to authenticated;
