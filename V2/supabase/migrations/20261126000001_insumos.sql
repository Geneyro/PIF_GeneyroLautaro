-- =============================================================================
-- DETAIL CONTROL · Pestaña Insumos y presentaciones completas
--
--   * Todo insumo tiene las cinco presentaciones: 1, 5, 20, 60 y 120 L (o kg).
--   * agregar_insumo(): alta desde la pestaña Insumos, con las cinco
--     presentaciones. Si el insumo existía y estaba eliminado (baja lógica),
--     lo reactiva con su historial intacto.
--   * Eliminar un insumo es una baja lógica (cambiar_estado_insumo): sus
--     movimientos son inmutables y se conservan.
-- =============================================================================

create function interno.completar_presentaciones(p_insumo_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.presentacion (organizacion_id, insumo_id, capacidad_base, creado_por)
  select i.organizacion_id, i.id, t.capacidad, i.creado_por
    from public.insumo i
   cross join (values (1000::bigint), (5000), (20000), (60000), (120000)) as t (capacidad)
   where i.id = p_insumo_id
  on conflict (insumo_id, capacidad_base) do nothing;

  update public.presentacion p set activo = true where p.insumo_id = p_insumo_id and not p.activo;
$$;

revoke execute on function interno.completar_presentaciones(uuid) from public, anon, authenticated;

-- Insumos existentes: se agregan las presentaciones que les falten.
select interno.completar_presentaciones(i.id) from public.insumo i;

create function public.agregar_insumo(
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

revoke execute on function public.agregar_insumo(text, text) from public, anon;
grant execute on function public.agregar_insumo(text, text) to authenticated;
