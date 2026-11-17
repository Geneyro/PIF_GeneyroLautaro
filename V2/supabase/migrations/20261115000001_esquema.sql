-- =============================================================================
-- DETAIL CONTROL · Iteración 1 · Esquema
--
-- Reglas de dominio que fija este archivo:
--   * Cantidades SIEMPRE enteras (bigint) en unidad base: mL o g.
--   * Dinero en pesos argentinos como entero en centavos (bigint).
--   * Toda tabla de negocio lleva organizacion_id no nulo (RNF-04).
--   * El saldo no se guarda: es la suma de los movimientos (RN-05).
--   * Baja lógica (columna activo), nunca física.
--
-- Modelo contable: `movimiento` es un libro mayor. Una operación
-- (operacion_id) agrupa sus líneas; cada línea afecta un compartimento:
--   GRANEL        existencia a granel del insumo
--   PRESENTACION  existencia ya fraccionada en una presentación
--   MERMA         pérdidas declaradas (sumidero)
-- Un fraccionamiento es una transformación pura: sus líneas suman 0 (RN-01).
-- =============================================================================

-- Esquema para funciones auxiliares y de trigger. No se expone por la API.
create schema interno;

create type public.unidad_base as enum ('mL', 'g');
create type public.tipo_movimiento as enum ('INGRESO', 'FRACCIONAMIENTO', 'COMPENSACION');
create type public.compartimento as enum ('GRANEL', 'PRESENTACION', 'MERMA');

-- -----------------------------------------------------------------------------
-- Organización y sus miembros (usuarios de Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.organizacion (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  creado_en timestamptz not null default now(),
  constraint organizacion_nombre_no_vacio check (length(btrim(nombre)) > 0)
);

-- Cada usuario pertenece a una única organización. No hay perfiles
-- diferenciados: todos los miembros operan de forma indistinta (RF-23).
create table public.miembro (
  usuario_id      uuid primary key references auth.users (id) on delete restrict,
  organizacion_id uuid not null references public.organizacion (id) on delete restrict,
  nombre          text not null,
  creado_en       timestamptz not null default now(),
  constraint miembro_nombre_no_vacio check (length(btrim(nombre)) > 0)
);

create index miembro_organizacion_idx on public.miembro (organizacion_id);

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.insumo (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id) on delete restrict,
  nombre          text not null,
  unidad_base     public.unidad_base not null,
  activo          boolean not null default true,
  creado_por      uuid not null references auth.users (id) on delete restrict,
  creado_en       timestamptz not null default now(),
  constraint insumo_nombre_no_vacio check (length(btrim(nombre)) > 0),
  constraint insumo_id_organizacion_unico unique (id, organizacion_id)
);

create unique index insumo_nombre_unico on public.insumo (organizacion_id, lower(nombre));

comment on table public.insumo is
  'Insumo a granel. Todas sus cantidades se contabilizan en unidad_base (mL o g), como enteros.';

create table public.presentacion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  insumo_id       uuid not null,
  capacidad_base  bigint not null,
  activo          boolean not null default true,
  creado_por      uuid not null references auth.users (id) on delete restrict,
  creado_en       timestamptz not null default now(),
  constraint presentacion_insumo_fk
    foreign key (insumo_id, organizacion_id)
    references public.insumo (id, organizacion_id) on delete restrict,
  -- RF-02: presentaciones de 1, 5, 20, 60 o 120 L (o kg), en unidad base.
  constraint presentacion_capacidad_admitida
    check (capacidad_base in (1000, 5000, 20000, 60000, 120000)),
  constraint presentacion_capacidad_unica unique (insumo_id, capacidad_base),
  constraint presentacion_id_insumo_unico unique (id, insumo_id)
);

comment on column public.presentacion.capacidad_base is
  'Capacidad de una unidad de la presentación, en la unidad base del insumo (5 L = 5000 mL).';

create table public.proveedor (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id) on delete restrict,
  nombre          text not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  constraint proveedor_nombre_no_vacio check (length(btrim(nombre)) > 0),
  constraint proveedor_id_organizacion_unico unique (id, organizacion_id)
);

create unique index proveedor_nombre_unico on public.proveedor (organizacion_id, lower(nombre));

-- -----------------------------------------------------------------------------
-- Libro de movimientos (inmutable; ver la migración de reglas)
-- -----------------------------------------------------------------------------
create table public.movimiento (
  id                  bigint generated always as identity primary key,
  organizacion_id     uuid not null,
  operacion_id        uuid not null,
  tipo                public.tipo_movimiento not null,
  insumo_id           uuid not null,
  compartimento       public.compartimento not null,
  presentacion_id     uuid,
  unidades            integer,
  cantidad_base       bigint not null,
  proveedor_id        uuid,
  costo_centavos      bigint,
  motivo              text,
  observacion         text,
  movimiento_origen_id bigint references public.movimiento (id) on delete restrict,
  usuario_id          uuid not null references auth.users (id) on delete restrict,
  registrado_en       timestamptz not null default now(),

  constraint movimiento_insumo_fk
    foreign key (insumo_id, organizacion_id)
    references public.insumo (id, organizacion_id) on delete restrict,
  -- La presentación siempre pertenece al mismo insumo del movimiento.
  constraint movimiento_presentacion_fk
    foreign key (presentacion_id, insumo_id)
    references public.presentacion (id, insumo_id) on delete restrict,
  constraint movimiento_proveedor_fk
    foreign key (proveedor_id, organizacion_id)
    references public.proveedor (id, organizacion_id) on delete restrict,

  constraint movimiento_cantidad_no_cero check (cantidad_base <> 0),

  -- Solo las líneas de PRESENTACION llevan presentación y unidades.
  constraint movimiento_presentacion_coherente check (
    (compartimento = 'PRESENTACION' and presentacion_id is not null and unidades is not null and unidades <> 0)
    or (compartimento <> 'PRESENTACION' and presentacion_id is null and unidades is null)
  ),

  -- Forma de cada línea según su tipo.
  constraint movimiento_forma_valida check (
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
  )
);

create index movimiento_insumo_idx on public.movimiento (insumo_id, compartimento);
create index movimiento_operacion_idx on public.movimiento (operacion_id);
create index movimiento_presentacion_idx on public.movimiento (presentacion_id);
create index movimiento_organizacion_idx on public.movimiento (organizacion_id, id desc);
-- Una línea solo puede compensarse una vez.
create unique index movimiento_origen_unico
  on public.movimiento (movimiento_origen_id) where movimiento_origen_id is not null;

comment on table public.movimiento is
  'Libro mayor de existencias. Inmutable: no admite UPDATE, DELETE ni TRUNCATE (RN-04).';
comment on column public.movimiento.cantidad_base is
  'Cantidad entera con signo, en unidad base del insumo (+ entra al compartimento, - sale).';
comment on column public.movimiento.costo_centavos is
  'Costo total del ingreso en centavos de peso argentino.';
comment on column public.movimiento.usuario_id is
  'Usuario autenticado que registró el movimiento. Lo fija la base, no el cliente.';
