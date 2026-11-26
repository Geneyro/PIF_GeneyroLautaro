-- =============================================================================
-- DETAIL CONTROL · Dashboard, Motor de Fraccionamiento, Auditoría y Servicios
--
--   * Punto de pedido por insumo: alerta de reposición en el Dashboard.
--   * fraccionar(): una operación con una o varias presentaciones, sin merma.
--     Lo que sale del granel es exactamente lo que entra a las presentaciones.
--   * registrar_conteo(): conteo físico; si difiere del saldo, un movimiento
--     AJUSTE lleva el saldo al valor contado.
--   * registrar_servicio(): servicio del taller con su receta; cada insumo se
--     descuenta del granel con un movimiento CONSUMO.
--
-- Igual que en la Iteración 1: cantidades enteras en unidad base, saldo =
-- suma de movimientos, registros inmutables y atribuidos por la base, y
-- escritura solo a través de estas funciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Punto de pedido (en unidad base). Null: el insumo no genera alertas.
-- -----------------------------------------------------------------------------
alter table public.insumo
  add column punto_pedido bigint,
  add constraint insumo_punto_pedido_positivo check (punto_pedido is null or punto_pedido > 0);

comment on column public.insumo.punto_pedido is
  'Saldo a granel (unidad base) por debajo del cual el insumo se marca para reponer.';

-- -----------------------------------------------------------------------------
-- Forma de las líneas AJUSTE y CONSUMO
-- -----------------------------------------------------------------------------
alter table public.movimiento drop constraint movimiento_forma_valida;
alter table public.movimiento add constraint movimiento_forma_valida check (
  ( -- RF-03: ingreso a granel con proveedor y costo obligatorios
    tipo = 'INGRESO' and compartimento = 'GRANEL' and cantidad_base > 0
    and proveedor_id is not null and costo_centavos is not null and costo_centavos > 0
    and movimiento_origen_id is null
  )
  or ( -- RF-01 / RF-06: sale del granel, entra a presentación o a merma (con motivo)
    tipo = 'FRACCIONAMIENTO' and proveedor_id is null and costo_centavos is null
    and movimiento_origen_id is null
    and (
      (compartimento = 'GRANEL' and cantidad_base < 0)
      or (compartimento = 'PRESENTACION' and cantidad_base > 0 and unidades > 0)
      or (compartimento = 'MERMA' and cantidad_base > 0
          and motivo is not null and length(btrim(motivo)) > 0)
    )
  )
  or ( -- RF-05: compensación que referencia la línea original, con motivo
    tipo = 'COMPENSACION' and movimiento_origen_id is not null
    and motivo is not null and length(btrim(motivo)) > 0
  )
  or ( -- Auditoría: ajuste del granel al conteo físico, con motivo
    tipo = 'AJUSTE' and compartimento = 'GRANEL'
    and proveedor_id is null and costo_centavos is null and movimiento_origen_id is null
    and motivo is not null and length(btrim(motivo)) > 0
  )
  or ( -- Servicios: consumo del granel
    tipo = 'CONSUMO' and compartimento = 'GRANEL' and cantidad_base < 0
    and proveedor_id is null and costo_centavos is null and movimiento_origen_id is null
  )
);

-- -----------------------------------------------------------------------------
-- Servicios del taller y conteos físicos
-- -----------------------------------------------------------------------------
create table public.servicio (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id) on delete restrict,
  operacion_id    uuid not null unique,
  nombre          text not null,
  tipo_vehiculo   text not null,
  observacion     text,
  usuario_id      uuid not null references auth.users (id) on delete restrict,
  registrado_en   timestamptz not null default now(),
  constraint servicio_nombre_valido check (length(btrim(nombre)) between 1 and 120),
  constraint servicio_vehiculo_valido check (length(btrim(tipo_vehiculo)) between 1 and 120)
);

create index servicio_organizacion_idx on public.servicio (organizacion_id, registrado_en desc);

comment on table public.servicio is
  'Servicio prestado en el taller. Sus consumos son los movimientos CONSUMO de la misma operacion_id.';

create table public.conteo_fisico (
  id              bigint generated always as identity primary key,
  organizacion_id uuid not null,
  insumo_id       uuid not null,
  saldo_sistema   bigint not null,
  conteo          bigint not null,
  diferencia      bigint generated always as (conteo - saldo_sistema) stored,
  operacion_id    uuid unique,
  observacion     text,
  usuario_id      uuid not null references auth.users (id) on delete restrict,
  registrado_en   timestamptz not null default now(),
  constraint conteo_insumo_fk
    foreign key (insumo_id, organizacion_id)
    references public.insumo (id, organizacion_id) on delete restrict,
  constraint conteo_no_negativo check (conteo >= 0),
  -- Hay movimiento de ajuste si y solo si el conteo difiere del sistema.
  constraint conteo_ajuste_coherente check ((conteo = saldo_sistema) = (operacion_id is null))
);

create index conteo_organizacion_idx on public.conteo_fisico (organizacion_id, id desc);

comment on table public.conteo_fisico is
  'Conteo físico presencial del granel de un insumo, comparado con el saldo del sistema en ese momento.';

-- La base fija autor y fecha, y los registros no se editan ni se borran.
create function interno.atribuir_registro()
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
    raise exception 'El registro no pertenece a la organización del usuario.' using errcode = '42501';
  end if;
  new.usuario_id    := v_usuario;
  new.registrado_en := now();
  return new;
end;
$$;

create function interno.impedir_modificacion_registro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los registros de % son inmutables: no se permite %.', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create trigger trg_servicio_atribuir
  before insert on public.servicio
  for each row execute function interno.atribuir_registro();
create trigger trg_servicio_bloquear
  before update or delete on public.servicio
  for each row execute function interno.impedir_modificacion_registro();
create trigger trg_servicio_bloquear_truncate
  before truncate on public.servicio
  for each statement execute function interno.impedir_modificacion_registro();

create trigger trg_conteo_atribuir
  before insert on public.conteo_fisico
  for each row execute function interno.atribuir_registro();
create trigger trg_conteo_bloquear
  before update or delete on public.conteo_fisico
  for each row execute function interno.impedir_modificacion_registro();
create trigger trg_conteo_bloquear_truncate
  before truncate on public.conteo_fisico
  for each statement execute function interno.impedir_modificacion_registro();

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------
-- 1234567 → '1.234.567 mL' (para los mensajes que ve el usuario).
create function interno.texto_cantidad(p_cantidad bigint, p_unidad public.unidad_base)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(p_cantidad, 'FM999,999,999,999,990'), ',', '.') || ' ' || p_unidad::text;
$$;

create function interno.saldo_granel(p_insumo_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(m.cantidad_base), 0)::bigint
    from public.movimiento m
   where m.insumo_id = p_insumo_id and m.compartimento = 'GRANEL';
$$;

-- =============================================================================
-- Operaciones
-- =============================================================================

-- Dashboard · Punto de pedido ---------------------------------------------------
create function public.definir_punto_pedido(
  p_insumo_id uuid,
  p_punto     bigint
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
  if p_punto is not null and p_punto <= 0 then
    raise exception 'El punto de pedido debe ser un número entero mayor que 0.' using errcode = '22023';
  end if;
  update public.insumo i
     set punto_pedido = p_punto
   where i.id = p_insumo_id and i.organizacion_id = v_org;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
end;
$$;

-- Catálogo · Baja y reactivación lógica -----------------------------------------
create function public.cambiar_estado_insumo(
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

-- Motor de Fraccionamiento -------------------------------------------------------
-- Toma del granel exactamente Σ unidades × capacidad y lo pasa a las
-- presentaciones indicadas. No hay merma: la operación conserva cantidades
-- por construcción (y el trigger de invariantes lo vuelve a verificar).
create function public.fraccionar(
  p_insumo_id       uuid,
  p_presentaciones  uuid[],
  p_unidades        integer[],
  p_observacion     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
  v_nombre  text;
  v_base    public.unidad_base;
  v_activo  boolean;
  v_lineas  integer := coalesce(cardinality(p_presentaciones), 0);
  v_total   bigint;
  v_saldo   bigint;
  v_op      uuid := gen_random_uuid();
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  select i.nombre, i.unidad_base, i.activo into v_nombre, v_base, v_activo
    from public.insumo i
   where i.id = p_insumo_id and i.organizacion_id = v_org
     for update;
  if not found then
    raise exception 'Seleccione un insumo de origen.' using errcode = 'P0002';
  end if;
  if not v_activo then
    raise exception 'El insumo % está dado de baja.', v_nombre using errcode = 'P0001';
  end if;

  if v_lineas = 0 or v_lineas <> coalesce(cardinality(p_unidades), 0) then
    raise exception 'Indique al menos una presentación y su cantidad de unidades.' using errcode = '22023';
  end if;
  if v_lineas > 20 then
    raise exception 'Un fraccionamiento admite hasta 20 presentaciones.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_unidades) u where u is null or u <= 0) then
    raise exception 'Cada presentación debe generar al menos 1 unidad.' using errcode = '22023';
  end if;
  if exists (
    select 1
      from unnest(p_presentaciones) x(id)
      left join public.presentacion p on p.id = x.id and p.insumo_id = p_insumo_id and p.activo
     where p.id is null
  ) then
    raise exception 'Alguna presentación elegida no corresponde a %.', v_nombre using errcode = 'P0002';
  end if;

  select sum(x.u::bigint * p.capacidad_base) into v_total
    from unnest(p_presentaciones, p_unidades) x(id, u)
    join public.presentacion p on p.id = x.id;
  v_saldo := interno.saldo_granel(p_insumo_id);

  if v_total > v_saldo then
    raise exception 'No hay stock suficiente de %: hay % a granel y el fraccionamiento necesita %.',
      v_nombre, interno.texto_cantidad(v_saldo, v_base), interno.texto_cantidad(v_total, v_base)
      using errcode = 'P0001';
  end if;

  -- Todas las líneas en una única sentencia: la operación nunca existe a medias.
  insert into public.movimiento
    (organizacion_id, operacion_id, tipo, insumo_id, compartimento, presentacion_id,
     unidades, cantidad_base, observacion, usuario_id)
  select v_org, v_op, 'FRACCIONAMIENTO'::public.tipo_movimiento, p_insumo_id, l.compartimento,
         l.presentacion_id, l.unidades, l.cantidad, nullif(btrim(p_observacion), ''), v_usuario
    from (
      select 'GRANEL'::public.compartimento as compartimento, null::uuid as presentacion_id,
             null::integer as unidades, -v_total as cantidad
      union all
      select 'PRESENTACION'::public.compartimento, x.id, sum(x.u)::integer, sum(x.u)::bigint * p.capacidad_base
        from unnest(p_presentaciones, p_unidades) x(id, u)
        join public.presentacion p on p.id = x.id
       group by x.id, p.capacidad_base
    ) l;

  return v_op;
end;
$$;

-- Auditoría · Conteo físico --------------------------------------------------------
-- Compara el conteo con el saldo a granel en el momento de registrarlo (con
-- el insumo bloqueado) y, si difieren, registra el ajuste por la diferencia.
-- Devuelve la diferencia aplicada (conteo − saldo del sistema).
create function public.registrar_conteo(
  p_insumo_id   uuid,
  p_conteo      bigint,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
  v_nombre  text;
  v_activo  boolean;
  v_saldo   bigint;
  v_op      uuid;
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  select i.nombre, i.activo into v_nombre, v_activo
    from public.insumo i
   where i.id = p_insumo_id and i.organizacion_id = v_org
     for update;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
  if not v_activo then
    raise exception 'El insumo % está dado de baja.', v_nombre using errcode = 'P0001';
  end if;
  if p_conteo is null or p_conteo < 0 then
    raise exception 'El conteo físico debe ser un número entero igual o mayor que 0.' using errcode = '22023';
  end if;

  v_saldo := interno.saldo_granel(p_insumo_id);

  if p_conteo <> v_saldo then
    v_op := gen_random_uuid();
    insert into public.movimiento
      (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, motivo, observacion, usuario_id)
    values
      (v_org, v_op, 'AJUSTE', p_insumo_id, 'GRANEL', p_conteo - v_saldo, 'Conteo físico',
       nullif(btrim(p_observacion), ''), v_usuario);
  end if;

  insert into public.conteo_fisico
    (organizacion_id, insumo_id, saldo_sistema, conteo, operacion_id, observacion, usuario_id)
  values
    (v_org, p_insumo_id, v_saldo, p_conteo, v_op, nullif(btrim(p_observacion), ''), v_usuario);

  return p_conteo - v_saldo;
end;
$$;

-- Servicios · Registro con receta de consumo -----------------------------------------
-- Descuenta del granel la cantidad usada de cada insumo. Si algún insumo no
-- alcanza, no se registra nada.
create function public.registrar_servicio(
  p_nombre        text,
  p_tipo_vehiculo text,
  p_insumos       uuid[],
  p_cantidades    bigint[],
  p_observacion   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_org     uuid;
  v_lineas  integer := coalesce(cardinality(p_insumos), 0);
  v_faltan  integer;
  r         record;
  v_op      uuid := gen_random_uuid();
begin
  select * into v_usuario, v_org from interno.exigir_sesion();

  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'Ingrese el nombre del servicio.' using errcode = '22023';
  end if;
  if p_tipo_vehiculo is null or length(btrim(p_tipo_vehiculo)) = 0 then
    raise exception 'Ingrese el tipo de vehículo.' using errcode = '22023';
  end if;
  if length(btrim(p_nombre)) > 120 or length(btrim(p_tipo_vehiculo)) > 120 then
    raise exception 'El nombre del servicio y el tipo de vehículo admiten hasta 120 caracteres.' using errcode = '22023';
  end if;
  if v_lineas = 0 or v_lineas <> coalesce(cardinality(p_cantidades), 0) then
    raise exception 'Agregue al menos un insumo a la receta de consumo.' using errcode = '22023';
  end if;
  if v_lineas > 20 then
    raise exception 'Una receta admite hasta 20 insumos.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_cantidades) c where c is null or c <= 0) then
    raise exception 'Cada insumo de la receta debe usar una cantidad entera mayor que 0.' using errcode = '22023';
  end if;

  -- Bloqueo en orden fijo: dos servicios simultáneos no se traban entre sí.
  perform 1
     from public.insumo i
    where i.id = any (p_insumos) and i.organizacion_id = v_org
    order by i.id
      for update;

  select count(*) into v_faltan
    from (select distinct x from unnest(p_insumos) x) d
    left join public.insumo i on i.id = d.x and i.organizacion_id = v_org and i.activo
   where i.id is null;
  if v_faltan > 0 then
    raise exception 'Algún insumo de la receta no existe o está dado de baja.' using errcode = 'P0002';
  end if;

  for r in
    select i.nombre, i.unidad_base, sum(x.c)::bigint as usada, interno.saldo_granel(i.id) as saldo
      from unnest(p_insumos, p_cantidades) x(id, c)
      join public.insumo i on i.id = x.id
     group by i.id, i.nombre, i.unidad_base
  loop
    if r.usada > r.saldo then
      raise exception 'No hay stock suficiente de %: hay % a granel y el servicio usa %.',
        r.nombre, interno.texto_cantidad(r.saldo, r.unidad_base), interno.texto_cantidad(r.usada, r.unidad_base)
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.servicio (organizacion_id, operacion_id, nombre, tipo_vehiculo, observacion, usuario_id)
  values (v_org, v_op, btrim(p_nombre), btrim(p_tipo_vehiculo), nullif(btrim(p_observacion), ''), v_usuario);

  insert into public.movimiento
    (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, usuario_id)
  select v_org, v_op, 'CONSUMO', x.id, 'GRANEL', -sum(x.c)::bigint, v_usuario
    from unnest(p_insumos, p_cantidades) x(id, c)
   group by x.id;

  return v_op;
end;
$$;

-- =============================================================================
-- Vistas (las columnas nuevas van al final)
-- =============================================================================
create or replace view public.v_saldo_insumo with (security_invoker = true) as
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
  i.creado_en,
  i.punto_pedido,
  (i.punto_pedido is not null
    and coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'GRANEL'), 0) <= i.punto_pedido) as reponer
from public.insumo i
left join public.movimiento m on m.insumo_id = i.id
group by i.id;

create or replace view public.v_movimiento with (security_invoker = true) as
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
  m.registrado_en,
  s.nombre as servicio_nombre,
  s.tipo_vehiculo as servicio_vehiculo,
  cf.conteo as conteo_fisico,
  cf.saldo_sistema as conteo_saldo_sistema,
  o.tipo as tipo_origen
from public.movimiento m
join public.insumo i on i.id = m.insumo_id
left join public.presentacion p on p.id = m.presentacion_id
left join public.proveedor pr on pr.id = m.proveedor_id
left join public.miembro u on u.usuario_id = m.usuario_id
left join public.servicio s on s.operacion_id = m.operacion_id
left join public.conteo_fisico cf on cf.operacion_id = m.operacion_id
left join public.movimiento o on o.id = m.movimiento_origen_id;

create view public.v_conteo_fisico with (security_invoker = true) as
select
  c.id,
  c.organizacion_id,
  c.insumo_id,
  i.nombre as insumo_nombre,
  i.unidad_base,
  c.saldo_sistema,
  c.conteo,
  c.diferencia,
  c.operacion_id,
  c.observacion,
  c.usuario_id,
  u.nombre as usuario_nombre,
  c.registrado_en
from public.conteo_fisico c
join public.insumo i on i.id = c.insumo_id
left join public.miembro u on u.usuario_id = c.usuario_id;

-- =============================================================================
-- Seguridad
-- =============================================================================
alter table public.servicio      enable row level security;
alter table public.conteo_fisico enable row level security;

create policy servicio_lectura on public.servicio
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

create policy conteo_lectura on public.conteo_fisico
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

revoke all on public.servicio, public.conteo_fisico, public.v_conteo_fisico,
              public.v_saldo_insumo, public.v_movimiento
  from public, anon, authenticated;
grant select on public.servicio, public.conteo_fisico, public.v_conteo_fisico,
                public.v_saldo_insumo, public.v_movimiento
  to authenticated;

revoke execute on function
  interno.atribuir_registro(),
  interno.impedir_modificacion_registro(),
  interno.texto_cantidad(bigint, public.unidad_base),
  interno.saldo_granel(uuid)
from public, anon, authenticated;

revoke execute on function
  public.definir_punto_pedido(uuid, bigint),
  public.cambiar_estado_insumo(uuid, boolean),
  public.fraccionar(uuid, uuid[], integer[], text),
  public.registrar_conteo(uuid, bigint, text),
  public.registrar_servicio(text, text, uuid[], bigint[], text)
from public, anon;

grant execute on function
  public.definir_punto_pedido(uuid, bigint),
  public.cambiar_estado_insumo(uuid, boolean),
  public.fraccionar(uuid, uuid[], integer[], text),
  public.registrar_conteo(uuid, bigint, text),
  public.registrar_servicio(text, text, uuid[], bigint[], text)
to authenticated;

-- =============================================================================
-- Catálogo de GFK: insumos que usa el taller
-- =============================================================================
-- Se agregan a cada organización existente los que todavía no tenga (por
-- nombre, sin distinguir mayúsculas), con presentaciones de 1, 5 y 20 L.
-- No cambia ni borra insumos existentes. Una base nueva no tiene
-- organizaciones todavía, así que en ella no hace nada.
do $$
declare
  o record;
begin
  for o in
    select org.id as organizacion_id,
           (select m.usuario_id from public.miembro m
             where m.organizacion_id = org.id
             order by (m.rol = 'ADMINISTRADOR') desc, m.creado_en
             limit 1) as autor
      from public.organizacion org
  loop
    continue when o.autor is null;

    with nuevos as (
      insert into public.insumo (organizacion_id, nombre, unidad_base, creado_por)
      select o.organizacion_id, n.nombre, 'mL', o.autor
        from (values ('Mekasil Tradicional'), ('Mekasil Ultra'), ('BB Tradicional'),
                     ('BB Ultra'), ('Citrolimp'), ('Shampoo Siliconado')) as n (nombre)
       where not exists (select 1 from public.insumo i
                          where i.organizacion_id = o.organizacion_id
                            and lower(i.nombre) = lower(n.nombre))
      returning id
    )
    insert into public.presentacion (organizacion_id, insumo_id, capacidad_base, creado_por)
    select o.organizacion_id, nuevos.id, t.capacidad, o.autor
      from nuevos cross join (values (1000::bigint), (5000), (20000)) as t (capacidad);
  end loop;
end;
$$;
