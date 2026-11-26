-- =============================================================================
-- Insumos · solo un administrador agrega o elimina insumos
--
-- Los operarios siguen registrando conteos, fraccionamientos, servicios y el
-- punto de pedido; dar de alta un insumo o darlo de baja queda reservado a
-- los administradores. La pantalla oculta esas opciones, pero la regla vive
-- acá para que no dependa de la interfaz.
-- =============================================================================

create or replace function public.agregar_insumo(
  p_nombre      text,
  p_unidad_base text default 'mL'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
  v_nombre  text := btrim(p_nombre);
  v_id      uuid;
  v_activo  boolean;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();
  if not interno.es_administrador() then
    raise exception 'Solo un administrador puede agregar o eliminar insumos.' using errcode = '42501';
  end if;

  if v_nombre is null or length(v_nombre) = 0 then
    raise exception 'Ingrese el nombre del insumo.' using errcode = '22023';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'El nombre del insumo admite hasta 80 caracteres.' using errcode = '22023';
  end if;
  if p_unidad_base is null or p_unidad_base not in ('mL', 'g') then
    raise exception 'La unidad del insumo es mL o g.' using errcode = '22023';
  end if;

  select i.id, i.activo into v_id, v_activo
    from public.insumo i
   where i.organizacion_id = v_org and lower(i.nombre) = lower(v_nombre)
     for update;

  if found then
    if v_activo then
      raise exception 'Ya existe un insumo llamado "%".', v_nombre using errcode = '23505';
    end if;
    update public.insumo set activo = true where id = v_id;
  else
    insert into public.insumo (organizacion_id, nombre, unidad_base, creado_por)
    values (v_org, v_nombre, p_unidad_base::public.unidad_base, v_usuario)
    returning id into v_id;
  end if;

  perform interno.completar_presentaciones(v_id);
  return v_id;
end;
$$;

create or replace function public.cambiar_estado_insumo(
  p_insumo_id uuid,
  p_activo    boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();
  if not interno.es_administrador() then
    raise exception 'Solo un administrador puede agregar o eliminar insumos.' using errcode = '42501';
  end if;
  if p_activo is null then
    raise exception 'Indique si el insumo queda activo o dado de baja.' using errcode = '22023';
  end if;
  update public.insumo i
     set activo = p_activo
   where i.id = p_insumo_id and i.organizacion_id = v_org;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function
  public.agregar_insumo(text, text),
  public.cambiar_estado_insumo(uuid, boolean)
from public, anon;
grant execute on function
  public.agregar_insumo(text, text),
  public.cambiar_estado_insumo(uuid, boolean)
to authenticated;
