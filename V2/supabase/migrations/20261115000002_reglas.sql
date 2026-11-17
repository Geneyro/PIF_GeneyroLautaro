-- =============================================================================
-- DETAIL CONTROL · Iteración 1 · Reglas de negocio en la base de datos
--
--   RF-23  Toda operación exige sesión; cada movimiento queda atribuido.
--   RF-02  Alta de insumo con unidad base y presentaciones.
--   RF-03  Ingreso convertido a unidad base, con proveedor y costo.
--   RF-01  Fraccionamiento con conservación de cantidades (RN-01, RN-02).
--   RF-06  Merma con motivo obligatorio (RN-03).
--   RF-05  Movimientos inmutables; corrección por compensación (RN-04).
--   RF-04  Saldo = suma de movimientos (RN-05), en vistas.
--
-- Las funciones públicas son la ÚNICA vía de escritura para los clientes.
-- Los triggers repiten las reglas para cualquier otra vía (SQL directo,
-- service_role, etc.), de modo que nadie pueda saltearlas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sesión y organización
-- -----------------------------------------------------------------------------
create function interno.organizacion_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organizacion_id from public.miembro m where m.usuario_id = auth.uid();
$$;

create function interno.exigir_sesion(out p_usuario uuid, out p_organizacion uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  p_usuario := auth.uid();
  if p_usuario is null then
    raise exception 'Se requiere una sesión iniciada para operar.' using errcode = '42501';
  end if;
  select m.organizacion_id into p_organizacion from public.miembro m where m.usuario_id = p_usuario;
  if p_organizacion is null then
    raise exception 'El usuario no pertenece a ninguna organización.' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Conversión a unidad base (solo enteros)
-- -----------------------------------------------------------------------------
create function interno.a_unidad_base(
  p_cantidad bigint,
  p_unidad   text,
  p_base     public.unidad_base
)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un entero mayor que 0.' using errcode = '22023';
  end if;
  if (p_base = 'mL' and p_unidad = 'mL') or (p_base = 'g' and p_unidad = 'g') then
    return p_cantidad;
  elsif (p_base = 'mL' and p_unidad = 'L') or (p_base = 'g' and p_unidad = 'kg') then
    return p_cantidad * 1000;
  end if;
  raise exception 'La unidad "%" no es compatible con la unidad base %.', coalesce(p_unidad, '(vacía)'), p_base
    using errcode = '22023';
end;
$$;

-- =============================================================================
-- Triggers sobre el libro de movimientos
-- =============================================================================

-- RF-23 · La base fija el autor y la fecha; el cliente no puede elegirlos. ------
create function interno.atribuir_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();
  if new.organizacion_id is distinct from v_org then
    raise exception 'El movimiento no pertenece a la organización del usuario.' using errcode = '42501';
  end if;
  new.usuario_id    := v_usuario;
  new.registrado_en := now();
  return new;
end;
$$;

create trigger trg_movimiento_atribuir
  before insert on public.movimiento
  for each row execute function interno.atribuir_movimiento();

-- RF-05 / RN-04 · Inmutabilidad -------------------------------------------------
create function interno.impedir_modificacion_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_level = 'ROW' then
    raise exception 'Los movimientos son inmutables: no se permite % sobre el movimiento #%.', tg_op, old.id
      using errcode = 'P0001',
            hint = 'Para corregirlo registre una compensación; los movimientos nunca se editan ni se eliminan.';
  end if;
  raise exception 'Los movimientos son inmutables: no se permite % sobre la tabla de movimientos.', tg_op
    using errcode = 'P0001';
end;
$$;

create trigger trg_movimiento_bloquear_update
  before update on public.movimiento
  for each row execute function interno.impedir_modificacion_movimiento();

create trigger trg_movimiento_bloquear_delete
  before delete on public.movimiento
  for each row execute function interno.impedir_modificacion_movimiento();

create trigger trg_movimiento_bloquear_truncate
  before truncate on public.movimiento
  for each statement execute function interno.impedir_modificacion_movimiento();

-- RN-01 / RN-02 · Invariantes, verificados al terminar cada sentencia INSERT ----
-- Aunque alguien inserte líneas sin pasar por las funciones, la sentencia falla
-- si un fraccionamiento no conserva cantidades, si una línea de presentación
-- no coincide con su capacidad o si algún saldo queda negativo.
create function interno.verificar_invariantes_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  select n.unidades, p.capacidad_base, n.cantidad_base into r
    from nuevas n
    join public.presentacion p on p.id = n.presentacion_id
   where n.compartimento = 'PRESENTACION'
     and n.cantidad_base <> n.unidades::bigint * p.capacidad_base
   limit 1;
  if found then
    raise exception 'Línea de presentación inválida: % unidades × % = %, pero se registraron %.',
      r.unidades, r.capacidad_base, r.unidades::bigint * r.capacidad_base, r.cantidad_base
      using errcode = 'P0001';
  end if;

  select m.operacion_id, sum(m.cantidad_base) as suma, count(distinct m.insumo_id) as insumos into r
    from public.movimiento m
   where m.operacion_id in (select n.operacion_id from nuevas n where n.tipo = 'FRACCIONAMIENTO')
   group by m.operacion_id
  having sum(m.cantidad_base) <> 0 or count(distinct m.insumo_id) <> 1
   limit 1;
  if found then
    raise exception 'Conservación de cantidades violada en la operación %: sus líneas suman % (deben sumar 0, sobre un único insumo).',
      r.operacion_id, r.suma
      using errcode = 'P0001';
  end if;

  select m.insumo_id, sum(m.cantidad_base) as saldo into r
    from public.movimiento m
   where m.compartimento = 'GRANEL'
     and m.insumo_id in (select n.insumo_id from nuevas n)
   group by m.insumo_id
  having sum(m.cantidad_base) < 0
   limit 1;
  if found then
    raise exception 'Saldo insuficiente: el saldo a granel del insumo quedaría en % (no puede ser negativo).', r.saldo
      using errcode = 'P0001';
  end if;

  select m.presentacion_id, sum(m.cantidad_base) as saldo into r
    from public.movimiento m
   where m.compartimento = 'PRESENTACION'
     and m.presentacion_id in (select n.presentacion_id from nuevas n where n.presentacion_id is not null)
   group by m.presentacion_id
  having sum(m.cantidad_base) < 0
   limit 1;
  if found then
    raise exception 'Saldo insuficiente: el saldo fraccionado de la presentación quedaría en % (no puede ser negativo).', r.saldo
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

create trigger trg_movimiento_invariantes
  after insert on public.movimiento
  referencing new table as nuevas
  for each statement execute function interno.verificar_invariantes_movimiento();

-- =============================================================================
-- Operaciones (únicas vías de escritura para los clientes)
-- =============================================================================

-- RF-02 · Alta de insumo con sus presentaciones ----------------------------------
-- p_presentaciones: tamaños en L (o kg): 1, 5, 20, 60 o 120.
create function public.crear_insumo(
  p_nombre         text,
  p_unidad_base    text,
  p_presentaciones integer[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario  uuid;
  v_org      uuid;
  v_id       uuid;
  v_invalida integer;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'El nombre del insumo es obligatorio.' using errcode = '22023';
  end if;
  if p_unidad_base is null or p_unidad_base not in ('mL', 'g') then
    raise exception 'La unidad base es obligatoria: mL o g.' using errcode = '22023';
  end if;

  select x into v_invalida
    from unnest(coalesce(p_presentaciones, '{}'::integer[])) as x
   where x is null or x not in (1, 5, 20, 60, 120)
   limit 1;
  if found then
    raise exception 'Presentación no admitida: %. Las presentaciones son de 1, 5, 20, 60 o 120 (L o kg).', v_invalida
      using errcode = '22023';
  end if;

  begin
    insert into public.insumo (organizacion_id, nombre, unidad_base, creado_por)
    values (v_org, btrim(p_nombre), p_unidad_base::public.unidad_base, v_usuario)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Ya existe un insumo llamado "%".', btrim(p_nombre) using errcode = '23505';
  end;

  insert into public.presentacion (organizacion_id, insumo_id, capacidad_base, creado_por)
  select v_org, v_id, s.x::bigint * 1000, v_usuario
    from (select distinct x from unnest(coalesce(p_presentaciones, '{}'::integer[])) as x) s;

  return v_id;
end;
$$;

-- RF-02 · Agregar una presentación a un insumo existente --------------------------
create function public.agregar_presentacion(
  p_insumo_id uuid,
  p_tamano    integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
  v_id      uuid;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  perform 1 from public.insumo i where i.id = p_insumo_id and i.organizacion_id = v_org and i.activo;
  if not found then
    raise exception 'El insumo indicado no existe o está dado de baja.' using errcode = 'P0002';
  end if;
  if p_tamano is null or p_tamano not in (1, 5, 20, 60, 120) then
    raise exception 'Presentación no admitida: %. Las presentaciones son de 1, 5, 20, 60 o 120 (L o kg).', p_tamano
      using errcode = '22023';
  end if;

  begin
    insert into public.presentacion (organizacion_id, insumo_id, capacidad_base, creado_por)
    values (v_org, p_insumo_id, p_tamano::bigint * 1000, v_usuario)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Ese insumo ya tiene una presentación de ese tamaño.' using errcode = '23505';
  end;

  return v_id;
end;
$$;

-- RF-03 · Ingreso de insumo ---------------------------------------------------
-- p_cantidad entera en p_unidad (mL | L para líquidos, g | kg para sólidos).
-- p_costo_centavos: costo total del ingreso, en centavos.
create function public.registrar_ingreso(
  p_insumo_id      uuid,
  p_cantidad       bigint,
  p_unidad         text,
  p_proveedor      text,
  p_costo_centavos bigint,
  p_observacion    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario   uuid;
  v_org       uuid;
  v_base      public.unidad_base;
  v_activo    boolean;
  v_cantidad  bigint;
  v_proveedor uuid;
  v_op        uuid := gen_random_uuid();
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  -- El bloqueo del insumo serializa las operaciones concurrentes sobre su saldo.
  select i.unidad_base, i.activo into v_base, v_activo
    from public.insumo i
   where i.id = p_insumo_id and i.organizacion_id = v_org
     for update;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
  if not v_activo then
    raise exception 'El insumo está dado de baja.' using errcode = 'P0001';
  end if;
  if p_proveedor is null or length(btrim(p_proveedor)) = 0 then
    raise exception 'El proveedor es obligatorio.' using errcode = '22023';
  end if;
  if p_costo_centavos is null or p_costo_centavos <= 0 then
    raise exception 'El costo es obligatorio y debe ser mayor que 0.' using errcode = '22023';
  end if;

  v_cantidad := interno.a_unidad_base(p_cantidad, p_unidad, v_base);

  insert into public.proveedor (organizacion_id, nombre)
  values (v_org, btrim(p_proveedor))
  on conflict (organizacion_id, lower(nombre)) do nothing;

  select p.id into v_proveedor
    from public.proveedor p
   where p.organizacion_id = v_org and lower(p.nombre) = lower(btrim(p_proveedor));

  insert into public.movimiento
    (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base,
     proveedor_id, costo_centavos, observacion, usuario_id)
  values
    (v_org, v_op, 'INGRESO', p_insumo_id, 'GRANEL', v_cantidad,
     v_proveedor, p_costo_centavos, nullif(btrim(p_observacion), ''), v_usuario);

  return v_op;
end;
$$;

-- RF-01 / RF-06 · Fraccionamiento con conservación de cantidades -----------------
-- Toma p_cantidad_origen (unidad base) del granel y la transforma en p_unidades
-- de la presentación más p_merma. Rechaza la operación completa si
--     p_cantidad_origen <> p_unidades × capacidad + p_merma
-- e informa la cantidad no explicada.
create function public.registrar_fraccionamiento(
  p_insumo_id       uuid,
  p_cantidad_origen bigint,
  p_presentacion_id uuid,
  p_unidades        integer,
  p_merma           bigint default 0,
  p_motivo_merma    text default null,
  p_observacion     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario    uuid;
  v_org        uuid;
  v_base       public.unidad_base;
  v_activo     boolean;
  v_capacidad  bigint;
  v_pres_activa boolean;
  v_merma      bigint := coalesce(p_merma, 0);
  v_motivo     text := nullif(btrim(p_motivo_merma), '');
  v_salida     bigint;
  v_saldo      bigint;
  v_diferencia bigint;
  v_op         uuid := gen_random_uuid();
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  select i.unidad_base, i.activo into v_base, v_activo
    from public.insumo i
   where i.id = p_insumo_id and i.organizacion_id = v_org
     for update;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
  if not v_activo then
    raise exception 'El insumo está dado de baja.' using errcode = 'P0001';
  end if;

  select p.capacidad_base, p.activo into v_capacidad, v_pres_activa
    from public.presentacion p
   where p.id = p_presentacion_id and p.insumo_id = p_insumo_id;
  if not found then
    raise exception 'La presentación indicada no existe o no pertenece a este insumo.' using errcode = 'P0002';
  end if;
  if not v_pres_activa then
    raise exception 'La presentación está dada de baja.' using errcode = 'P0001';
  end if;

  if p_cantidad_origen is null or p_cantidad_origen <= 0 then
    raise exception 'La cantidad tomada del origen debe ser un entero mayor que 0.' using errcode = '22023';
  end if;
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'La cantidad de unidades generadas debe ser mayor que 0.' using errcode = '22023';
  end if;
  if v_merma < 0 then
    raise exception 'La merma no puede ser negativa.' using errcode = '22023';
  end if;

  -- RN-02: no exceder el saldo disponible.
  select coalesce(sum(m.cantidad_base), 0)::bigint into v_saldo
    from public.movimiento m
   where m.insumo_id = p_insumo_id and m.compartimento = 'GRANEL';
  if p_cantidad_origen > v_saldo then
    raise exception 'Saldo insuficiente: se intentan tomar % % y el saldo a granel es % %.',
      p_cantidad_origen, v_base, v_saldo, v_base
      using errcode = 'P0001';
  end if;

  -- RN-01: unidades generadas + merma = cantidad tomada del origen.
  v_salida     := p_unidades::bigint * v_capacidad;
  v_diferencia := p_cantidad_origen - (v_salida + v_merma);

  if v_diferencia > 0 then
    raise exception 'Fraccionamiento rechazado: hay % % no explicados. Se tomaron % % del origen, las presentaciones suman % % (% × % %) y la merma declarada es % %.',
      v_diferencia, v_base, p_cantidad_origen, v_base,
      v_salida, v_base, p_unidades, v_capacidad, v_base, v_merma, v_base
      using errcode = 'P0001',
            hint = 'Declare la diferencia como merma (con motivo) o corrija las unidades generadas.';
  elsif v_diferencia < 0 then
    raise exception 'Fraccionamiento rechazado: las salidas exceden en % % lo tomado del origen. Se tomaron % %, las presentaciones suman % % y la merma declarada es % %.',
      -v_diferencia, v_base, p_cantidad_origen, v_base, v_salida, v_base, v_merma, v_base
      using errcode = 'P0001',
            hint = 'No se puede generar más cantidad que la tomada del envase de origen.';
  end if;

  -- RN-03: toda merma lleva motivo.
  if v_merma > 0 and v_motivo is null then
    raise exception 'La merma de % % debe declararse con un motivo.', v_merma, v_base
      using errcode = '22023';
  end if;

  -- Todas las líneas en una única sentencia: la operación nunca existe a medias.
  insert into public.movimiento
    (organizacion_id, operacion_id, tipo, insumo_id, compartimento, presentacion_id,
     unidades, cantidad_base, motivo, observacion, usuario_id)
  select v_org, v_op, 'FRACCIONAMIENTO', p_insumo_id, l.compartimento, l.presentacion_id,
         l.unidades, l.cantidad, l.motivo, nullif(btrim(p_observacion), ''), v_usuario
    from (values
      ('GRANEL'::public.compartimento,       null::uuid,        null::integer, -p_cantidad_origen, null::text),
      ('PRESENTACION'::public.compartimento, p_presentacion_id, p_unidades,    v_salida,           null::text),
      ('MERMA'::public.compartimento,        null::uuid,        null::integer, v_merma,            v_motivo)
    ) as l (compartimento, presentacion_id, unidades, cantidad, motivo)
   where l.cantidad <> 0;

  return v_op;
end;
$$;

-- RF-05 · Corrección por compensación ---------------------------------------------
-- Registra una operación nueva con las líneas de la original invertidas, cada
-- una referenciando a su línea de origen. La operación original no se toca.
create function public.compensar_operacion(
  p_operacion_id uuid,
  p_motivo       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
  v_insumo  uuid;
  v_op      uuid := gen_random_uuid();
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'El motivo de la corrección es obligatorio.' using errcode = '22023';
  end if;

  select m.insumo_id into v_insumo
    from public.movimiento m
   where m.operacion_id = p_operacion_id and m.organizacion_id = v_org
   limit 1;
  if not found then
    raise exception 'La operación indicada no existe.' using errcode = 'P0002';
  end if;

  perform 1 from public.insumo i where i.id = v_insumo for update;

  if exists (select 1 from public.movimiento m
              where m.operacion_id = p_operacion_id and m.tipo = 'COMPENSACION') then
    raise exception 'Una compensación no se compensa: registre un movimiento nuevo.' using errcode = 'P0001';
  end if;
  if exists (select 1
               from public.movimiento c
               join public.movimiento o on o.id = c.movimiento_origen_id
              where o.operacion_id = p_operacion_id) then
    raise exception 'La operación ya fue compensada.' using errcode = 'P0001';
  end if;

  insert into public.movimiento
    (organizacion_id, operacion_id, tipo, insumo_id, compartimento, presentacion_id,
     unidades, cantidad_base, proveedor_id, costo_centavos, motivo, movimiento_origen_id, usuario_id)
  select v_org, v_op, 'COMPENSACION', m.insumo_id, m.compartimento, m.presentacion_id,
         -m.unidades, -m.cantidad_base, m.proveedor_id, -m.costo_centavos, btrim(p_motivo), m.id, v_usuario
    from public.movimiento m
   where m.operacion_id = p_operacion_id;

  return v_op;
end;
$$;

-- =============================================================================
-- RF-04 · Saldos: siempre la suma de los movimientos (RN-05)
-- =============================================================================
create view public.v_saldo_insumo with (security_invoker = true) as
select
  i.id as insumo_id,
  i.organizacion_id,
  i.nombre,
  i.unidad_base,
  i.activo,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'GRANEL'), 0)::bigint as saldo_granel,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'PRESENTACION'), 0)::bigint as saldo_fraccionado,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento in ('GRANEL', 'PRESENTACION')), 0)::bigint as saldo_total,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'MERMA'), 0)::bigint as merma_acumulada,
  i.creado_en
from public.insumo i
left join public.movimiento m on m.insumo_id = i.id
group by i.id;

-- Por presentación: unidades ya fraccionadas en existencia y equivalente del
-- saldo total del insumo expresado en esa presentación (420.000 mL = 21 × 20 L).
create view public.v_saldo_presentacion with (security_invoker = true) as
select
  p.id as presentacion_id,
  p.insumo_id,
  p.organizacion_id,
  s.nombre as insumo_nombre,
  s.unidad_base,
  p.capacidad_base,
  p.activo,
  coalesce(sum(m.unidades), 0)::bigint as unidades_en_existencia,
  coalesce(sum(m.cantidad_base), 0)::bigint as saldo_base,
  s.saldo_total as saldo_total_insumo,
  (s.saldo_total / p.capacidad_base)::bigint as equivalente_unidades
from public.presentacion p
join public.v_saldo_insumo s on s.insumo_id = p.insumo_id
left join public.movimiento m
  on m.presentacion_id = p.id and m.compartimento = 'PRESENTACION'
group by p.id, s.nombre, s.unidad_base, s.saldo_total;

create view public.v_movimiento with (security_invoker = true) as
select
  m.id,
  m.organizacion_id,
  m.operacion_id,
  m.tipo,
  m.compartimento,
  m.insumo_id,
  i.nombre as insumo_nombre,
  i.unidad_base,
  m.presentacion_id,
  p.capacidad_base,
  m.unidades,
  m.cantidad_base,
  m.proveedor_id,
  pr.nombre as proveedor_nombre,
  m.costo_centavos,
  m.motivo,
  m.observacion,
  m.movimiento_origen_id,
  exists (select 1 from public.movimiento c where c.movimiento_origen_id = m.id) as compensado,
  m.usuario_id,
  u.nombre as usuario_nombre,
  m.registrado_en
from public.movimiento m
join public.insumo i on i.id = m.insumo_id
left join public.presentacion p on p.id = m.presentacion_id
left join public.proveedor pr on pr.id = m.proveedor_id
left join public.miembro u on u.usuario_id = m.usuario_id;
