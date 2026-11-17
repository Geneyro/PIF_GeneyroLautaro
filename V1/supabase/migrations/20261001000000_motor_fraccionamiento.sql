-- =============================================================================
-- GFK Estética Vehicular · Sistema de Control de Consumo de Insumos
-- Prototipo v1 (Iteración 1) · Motor de fraccionamiento transaccional
--
-- Cubre:
--   RF-02 / RF-03  Alta de insumo a granel en unidad base (mL | g) e ingreso
--                  con conversión de unidades (p. ej. 5 L -> 5000 mL).
--   RF-01          Fraccionamiento como movimiento de transformación que
--                  fuerza la conservación de cantidades:
--                      extraído del granel = Σ presentaciones + merma
--   RF-04          Consulta de saldos en unidad base (vistas).
--   RF-05          Inmutabilidad de Movimiento_Stock (triggers que bloquean
--                  UPDATE / DELETE / TRUNCATE).
--
-- Modelo contable: cada movimiento es una línea de un libro mayor. Una
-- "operación" (operacion_id) agrupa sus líneas. Las cantidades se guardan
-- SIEMPRE en unidad base y con signo, repartidas en tres compartimentos:
--   GRANEL        stock a granel (bidón, bolsa...)
--   PRESENTACION  stock fraccionado en presentaciones de venta
--   MERMA         sumidero de pérdidas declaradas
-- Un fraccionamiento es una transformación pura: sus líneas suman 0.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.unidad_base as enum ('mL', 'g');
create type public.tipo_movimiento as enum ('INGRESO', 'FRACCIONAMIENTO');
create type public.compartimento_stock as enum ('GRANEL', 'PRESENTACION', 'MERMA');

-- -----------------------------------------------------------------------------
-- Entidad: Insumo
-- -----------------------------------------------------------------------------
create table public.insumo (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  unidad_base public.unidad_base not null,
  creado_en   timestamptz not null default now(),
  constraint insumo_nombre_no_vacio check (length(btrim(nombre)) > 0),
  constraint insumo_nombre_unico unique (nombre)
);

comment on table public.insumo is
  'Insumo a granel. Todo su stock se contabiliza en unidad_base (mL o g).';

-- -----------------------------------------------------------------------------
-- Entidad: Presentacion_Venta
-- -----------------------------------------------------------------------------
create table public.presentacion_venta (
  id             uuid primary key default gen_random_uuid(),
  insumo_id      uuid not null references public.insumo (id) on delete restrict,
  nombre         text not null,
  contenido_base numeric(14, 3) not null,
  creado_en      timestamptz not null default now(),
  constraint presentacion_nombre_no_vacio check (length(btrim(nombre)) > 0),
  constraint presentacion_contenido_positivo check (contenido_base > 0),
  constraint presentacion_nombre_unico unique (insumo_id, nombre),
  -- Permite que Movimiento_Stock exija, vía FK compuesta, que la
  -- presentación pertenezca al mismo insumo del movimiento.
  constraint presentacion_id_insumo_unico unique (id, insumo_id)
);

comment on table public.presentacion_venta is
  'Presentación de venta de un insumo (p. ej. Botella 1 L = 1000 mL).';
comment on column public.presentacion_venta.contenido_base is
  'Contenido de una unidad de la presentación, expresado en la unidad base del insumo.';

-- -----------------------------------------------------------------------------
-- Entidad: Movimiento_Stock (libro mayor inmutable)
-- -----------------------------------------------------------------------------
create table public.movimiento_stock (
  id                bigint generated always as identity primary key,
  operacion_id      uuid not null,
  tipo              public.tipo_movimiento not null,
  insumo_id         uuid not null references public.insumo (id) on delete restrict,
  compartimento     public.compartimento_stock not null,
  presentacion_id   uuid,
  unidades          integer,
  cantidad_base     numeric(14, 3) not null,
  cantidad_original numeric(14, 3),
  unidad_original   text,
  observacion       text,
  registrado_en     timestamptz not null default now(),

  constraint movimiento_presentacion_fk
    foreign key (presentacion_id, insumo_id)
    references public.presentacion_venta (id, insumo_id) on delete restrict,

  -- Las líneas de PRESENTACION llevan presentación y unidades; el resto no.
  constraint movimiento_presentacion_coherente check (
    (compartimento = 'PRESENTACION' and presentacion_id is not null and unidades is not null and unidades > 0)
    or (compartimento <> 'PRESENTACION' and presentacion_id is null and unidades is null)
  ),

  -- Signo de cada línea según tipo y compartimento.
  constraint movimiento_signo_valido check (
    (tipo = 'INGRESO' and compartimento = 'GRANEL' and cantidad_base > 0)
    or (tipo = 'FRACCIONAMIENTO' and compartimento = 'GRANEL' and cantidad_base < 0)
    or (tipo = 'FRACCIONAMIENTO' and compartimento in ('PRESENTACION', 'MERMA') and cantidad_base > 0)
  )
);

create index movimiento_stock_insumo_idx on public.movimiento_stock (insumo_id, compartimento);
create index movimiento_stock_operacion_idx on public.movimiento_stock (operacion_id);
create index movimiento_stock_presentacion_idx on public.movimiento_stock (presentacion_id);

comment on table public.movimiento_stock is
  'Libro mayor de stock. Inmutable: no admite UPDATE, DELETE ni TRUNCATE (RF-05).';
comment on column public.movimiento_stock.cantidad_base is
  'Cantidad con signo en unidad base del insumo (+ entra al compartimento, - sale).';

-- =============================================================================
-- RF-05 · Inmutabilidad de movimientos
-- =============================================================================
create or replace function public.impedir_modificacion_movimiento()
returns trigger
language plpgsql
as $$
begin
  if tg_level = 'ROW' then
    raise exception 'Movimiento_Stock es inmutable: no se permite % sobre el movimiento #%.', tg_op, old.id
      using errcode = 'P0001',
            hint = 'Para corregir un error registre un movimiento compensatorio; los movimientos nunca se editan ni se eliminan.';
  end if;
  raise exception 'Movimiento_Stock es inmutable: no se permite % sobre la tabla de movimientos.', tg_op
    using errcode = 'P0001';
end;
$$;

create trigger trg_movimiento_stock_bloquear_update
  before update on public.movimiento_stock
  for each row execute function public.impedir_modificacion_movimiento();

create trigger trg_movimiento_stock_bloquear_delete
  before delete on public.movimiento_stock
  for each row execute function public.impedir_modificacion_movimiento();

create trigger trg_movimiento_stock_bloquear_truncate
  before truncate on public.movimiento_stock
  for each statement execute function public.impedir_modificacion_movimiento();

-- =============================================================================
-- Red de seguridad: invariantes verificados al confirmar la transacción.
-- Aunque alguien inserte líneas sin pasar por las funciones, el COMMIT falla
-- si una operación de fraccionamiento no conserva cantidades, si una línea de
-- presentación no coincide con su contenido, o si el granel queda negativo.
-- =============================================================================
create or replace function public.verificar_invariantes_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_suma      numeric;
  v_saldo     numeric;
  v_contenido numeric;
begin
  if new.compartimento = 'PRESENTACION' then
    select contenido_base into v_contenido
      from public.presentacion_venta where id = new.presentacion_id;
    if new.cantidad_base <> new.unidades * v_contenido then
      raise exception 'Movimiento #% inválido: % unidades × % = %, pero se registraron %.',
        new.id, new.unidades, trim_scale(v_contenido),
        trim_scale(new.unidades * v_contenido), trim_scale(new.cantidad_base);
    end if;
  end if;

  if new.tipo = 'FRACCIONAMIENTO' then
    select sum(cantidad_base) into v_suma
      from public.movimiento_stock where operacion_id = new.operacion_id;
    if v_suma <> 0 then
      raise exception 'Conservación de cantidades violada en la operación %: sus líneas suman % (deben sumar 0).',
        new.operacion_id, trim_scale(v_suma);
    end if;
  end if;

  select coalesce(sum(cantidad_base), 0) into v_saldo
    from public.movimiento_stock
   where insumo_id = new.insumo_id and compartimento = 'GRANEL';
  if v_saldo < 0 then
    raise exception 'El saldo a granel del insumo % no puede ser negativo (quedaría en %).',
      new.insumo_id, trim_scale(v_saldo);
  end if;

  return null;
end;
$$;

create constraint trigger trg_movimiento_stock_invariantes
  after insert on public.movimiento_stock
  deferrable initially deferred
  for each row execute function public.verificar_invariantes_movimiento();

-- =============================================================================
-- Conversión de unidades (RF-03)
-- =============================================================================
create or replace function public.convertir_a_unidad_base(
  p_cantidad    numeric,
  p_unidad      text,
  p_unidad_base public.unidad_base
)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_unidad_base = 'mL' then
    case p_unidad
      when 'mL' then return p_cantidad;
      when 'L'  then return p_cantidad * 1000;
      else null;
    end case;
  elsif p_unidad_base = 'g' then
    case p_unidad
      when 'g'  then return p_cantidad;
      when 'kg' then return p_cantidad * 1000;
      else null;
    end case;
  end if;
  raise exception 'La unidad "%" no es compatible con la unidad base %.', p_unidad, p_unidad_base
    using errcode = '22023';
end;
$$;

-- =============================================================================
-- Operaciones (únicas vías de escritura para los clientes)
-- =============================================================================

-- RF-02 · Alta de insumo -------------------------------------------------------
create or replace function public.crear_insumo(
  p_nombre      text,
  p_unidad_base public.unidad_base
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'El nombre del insumo es obligatorio.' using errcode = '22023';
  end if;
  if p_unidad_base is null then
    raise exception 'La unidad base es obligatoria (mL o g).' using errcode = '22023';
  end if;

  insert into public.insumo (nombre, unidad_base)
  values (btrim(p_nombre), p_unidad_base)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un insumo llamado "%".', btrim(p_nombre) using errcode = '23505';
end;
$$;

-- Alta de presentación de venta ---------------------------------------------------
create or replace function public.crear_presentacion(
  p_insumo_id uuid,
  p_nombre    text,
  p_contenido numeric,
  p_unidad    text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad_base public.unidad_base;
  v_contenido   numeric;
  v_id          uuid;
begin
  select unidad_base into v_unidad_base from public.insumo where id = p_insumo_id;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'El nombre de la presentación es obligatorio.' using errcode = '22023';
  end if;
  if p_contenido is null or p_contenido <= 0 then
    raise exception 'El contenido de la presentación debe ser mayor que 0.' using errcode = '22023';
  end if;

  v_contenido := round(public.convertir_a_unidad_base(p_contenido, p_unidad, v_unidad_base), 3);

  insert into public.presentacion_venta (insumo_id, nombre, contenido_base)
  values (p_insumo_id, btrim(p_nombre), v_contenido)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Ese insumo ya tiene una presentación llamada "%".', btrim(p_nombre) using errcode = '23505';
end;
$$;

-- RF-03 · Ingreso de stock a granel ------------------------------------------------
create or replace function public.registrar_ingreso(
  p_insumo_id   uuid,
  p_cantidad    numeric,
  p_unidad      text,
  p_observacion text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad_base public.unidad_base;
  v_cantidad    numeric;
  v_op          uuid := gen_random_uuid();
begin
  select unidad_base into v_unidad_base from public.insumo where id = p_insumo_id for update;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad ingresada debe ser mayor que 0.' using errcode = '22023';
  end if;

  v_cantidad := round(public.convertir_a_unidad_base(p_cantidad, p_unidad, v_unidad_base), 3);

  insert into public.movimiento_stock
    (operacion_id, tipo, insumo_id, compartimento, cantidad_base, cantidad_original, unidad_original, observacion)
  values
    (v_op, 'INGRESO', p_insumo_id, 'GRANEL', v_cantidad, p_cantidad, p_unidad, nullif(btrim(p_observacion), ''));

  return v_op;
end;
$$;

-- RF-01 · Fraccionamiento transaccional ------------------------------------------
-- Extrae p_cantidad_extraida del granel y la transforma en p_unidades de la
-- presentación indicada más p_merma. Rechaza el movimiento completo si
--     p_cantidad_extraida <> p_unidades × contenido + p_merma
-- informando cuántas unidades base quedan sin explicar (o sobran).
create or replace function public.registrar_fraccionamiento(
  p_insumo_id         uuid,
  p_cantidad_extraida numeric,
  p_presentacion_id   uuid,
  p_unidades          integer,
  p_merma             numeric default 0,
  p_observacion       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad_base public.unidad_base;
  v_contenido   numeric;
  v_nombre_pres text;
  v_extraido    numeric := round(p_cantidad_extraida, 3);
  v_merma       numeric := round(coalesce(p_merma, 0), 3);
  v_salida      numeric;
  v_saldo       numeric;
  v_diferencia  numeric;
  v_op          uuid := gen_random_uuid();
begin
  -- Bloqueo del insumo: serializa operaciones concurrentes sobre su saldo.
  select unidad_base into v_unidad_base from public.insumo where id = p_insumo_id for update;
  if not found then
    raise exception 'El insumo indicado no existe.' using errcode = 'P0002';
  end if;

  select contenido_base, nombre into v_contenido, v_nombre_pres
    from public.presentacion_venta
   where id = p_presentacion_id and insumo_id = p_insumo_id;
  if not found then
    raise exception 'La presentación indicada no existe o no pertenece a este insumo.' using errcode = 'P0002';
  end if;

  if v_extraido is null or v_extraido <= 0 then
    raise exception 'La cantidad extraída del granel debe ser mayor que 0.' using errcode = '22023';
  end if;
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'La cantidad de unidades producidas debe ser mayor que 0.' using errcode = '22023';
  end if;
  if v_merma < 0 then
    raise exception 'La merma no puede ser negativa.' using errcode = '22023';
  end if;

  select coalesce(sum(cantidad_base), 0) into v_saldo
    from public.movimiento_stock
   where insumo_id = p_insumo_id and compartimento = 'GRANEL';
  if v_extraido > v_saldo then
    raise exception 'Saldo a granel insuficiente: se intentan extraer % % y el saldo es % %.',
      trim_scale(v_extraido), v_unidad_base, trim_scale(v_saldo), v_unidad_base
      using errcode = 'P0001';
  end if;

  -- Ley de conservación: extraído = salidas + merma
  v_salida     := p_unidades * v_contenido;
  v_diferencia := v_extraido - (v_salida + v_merma);

  if v_diferencia > 0 then
    raise exception 'Fraccionamiento rechazado: hay % % no explicados. Se extrajeron % % del granel, pero las presentaciones suman % % (% × %) y la merma declarada es % %.',
      trim_scale(v_diferencia), v_unidad_base,
      trim_scale(v_extraido), v_unidad_base,
      trim_scale(v_salida), v_unidad_base, p_unidades, v_nombre_pres,
      trim_scale(v_merma), v_unidad_base
      using errcode = 'P0001',
            hint = 'Declare la diferencia como merma o corrija la cantidad de unidades producidas.';
  elsif v_diferencia < 0 then
    raise exception 'Fraccionamiento rechazado: las salidas exceden en % % lo extraído. Se extrajeron % % del granel, pero las presentaciones suman % % y la merma declarada es % %.',
      trim_scale(-v_diferencia), v_unidad_base,
      trim_scale(v_extraido), v_unidad_base,
      trim_scale(v_salida), v_unidad_base,
      trim_scale(v_merma), v_unidad_base
      using errcode = 'P0001',
            hint = 'No se puede producir más cantidad que la extraída del contenedor de origen.';
  end if;

  -- Todas las líneas de la transformación se insertan en una única sentencia:
  -- la operación nunca existe a medias, ni siquiera dentro de la transacción.
  insert into public.movimiento_stock
    (operacion_id, tipo, insumo_id, compartimento, presentacion_id, unidades, cantidad_base, observacion)
  select v_op, 'FRACCIONAMIENTO', p_insumo_id, l.compartimento, l.presentacion_id, l.unidades, l.cantidad,
         nullif(btrim(p_observacion), '')
    from (values
      ('GRANEL'::public.compartimento_stock,       null::uuid,        null::integer, -v_extraido),
      ('PRESENTACION'::public.compartimento_stock, p_presentacion_id, p_unidades,    v_salida),
      ('MERMA'::public.compartimento_stock,        null::uuid,        null::integer, v_merma)
    ) as l (compartimento, presentacion_id, unidades, cantidad)
   where l.cantidad <> 0;

  return v_op;
end;
$$;

-- Demostración de RF-05 desde la interfaz ----------------------------------------
-- Ejecuta un UPDATE o DELETE real con privilegios del dueño de la tabla, para
-- evidenciar que el bloqueo lo impone el trigger y no un permiso de API.
create or replace function public.demo_intentar_alterar_movimiento(
  p_movimiento_id bigint,
  p_operacion     text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_operacion = 'UPDATE' then
    update public.movimiento_stock set cantidad_base = cantidad_base + 1 where id = p_movimiento_id;
  elsif p_operacion = 'DELETE' then
    delete from public.movimiento_stock where id = p_movimiento_id;
  else
    raise exception 'Operación no soportada: % (use UPDATE o DELETE).', p_operacion using errcode = '22023';
  end if;

  if not found then
    raise exception 'El movimiento #% no existe.', p_movimiento_id using errcode = 'P0002';
  end if;
end;
$$;

-- =============================================================================
-- RF-04 · Consulta de saldos (siempre en unidad base)
-- =============================================================================
create view public.v_saldo_insumo with (security_invoker = true) as
select
  i.id          as insumo_id,
  i.nombre,
  i.unidad_base,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'GRANEL'), 0)                       as saldo_granel,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'PRESENTACION'), 0)                 as saldo_presentaciones,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento in ('GRANEL', 'PRESENTACION')), 0)    as saldo_total,
  coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'MERMA'), 0)                        as merma_acumulada,
  i.creado_en
from public.insumo i
left join public.movimiento_stock m on m.insumo_id = i.id
group by i.id;

create view public.v_saldo_presentacion with (security_invoker = true) as
select
  p.id                                as presentacion_id,
  p.insumo_id,
  i.nombre                            as insumo_nombre,
  i.unidad_base,
  p.nombre,
  p.contenido_base,
  coalesce(sum(m.unidades), 0)        as unidades,
  coalesce(sum(m.cantidad_base), 0)   as saldo_base
from public.presentacion_venta p
join public.insumo i on i.id = p.insumo_id
left join public.movimiento_stock m
  on m.presentacion_id = p.id and m.compartimento = 'PRESENTACION'
group by p.id, i.id;

create view public.v_movimiento with (security_invoker = true) as
select
  m.id,
  m.operacion_id,
  m.tipo,
  m.compartimento,
  m.insumo_id,
  i.nombre      as insumo_nombre,
  i.unidad_base,
  m.presentacion_id,
  p.nombre      as presentacion_nombre,
  m.unidades,
  m.cantidad_base,
  m.cantidad_original,
  m.unidad_original,
  m.observacion,
  m.registrado_en
from public.movimiento_stock m
join public.insumo i on i.id = m.insumo_id
left join public.presentacion_venta p on p.id = m.presentacion_id;

-- =============================================================================
-- Seguridad: los clientes (anon / authenticated) solo leen. Toda escritura
-- pasa por las funciones SECURITY DEFINER anteriores, que validan las reglas.
-- =============================================================================
alter table public.insumo enable row level security;
alter table public.presentacion_venta enable row level security;
alter table public.movimiento_stock enable row level security;

create policy insumo_lectura on public.insumo
  for select to anon, authenticated using (true);
create policy presentacion_lectura on public.presentacion_venta
  for select to anon, authenticated using (true);
create policy movimiento_lectura on public.movimiento_stock
  for select to anon, authenticated using (true);

revoke all on public.insumo, public.presentacion_venta, public.movimiento_stock from public, anon, authenticated;
revoke all on public.v_saldo_insumo, public.v_saldo_presentacion, public.v_movimiento from public, anon, authenticated;

grant select on public.insumo, public.presentacion_venta, public.movimiento_stock to anon, authenticated;
grant select on public.v_saldo_insumo, public.v_saldo_presentacion, public.v_movimiento to anon, authenticated;

revoke execute on function
  public.crear_insumo(text, public.unidad_base),
  public.crear_presentacion(uuid, text, numeric, text),
  public.registrar_ingreso(uuid, numeric, text, text),
  public.registrar_fraccionamiento(uuid, numeric, uuid, integer, numeric, text),
  public.demo_intentar_alterar_movimiento(bigint, text)
from public;

grant execute on function
  public.crear_insumo(text, public.unidad_base),
  public.crear_presentacion(uuid, text, numeric, text),
  public.registrar_ingreso(uuid, numeric, text, text),
  public.registrar_fraccionamiento(uuid, numeric, uuid, integer, numeric, text),
  public.demo_intentar_alterar_movimiento(bigint, text)
to anon, authenticated, service_role;
