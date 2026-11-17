-- =============================================================================
-- DETAIL CONTROL · Iteración 1 · Seguridad (RF-23, RNF-04)
--
--   * Row Level Security activada en todas las tablas de negocio.
--   * Lectura: solo usuarios autenticados y solo filas de su organización.
--   * Escritura directa: nadie. No hay políticas de INSERT/UPDATE/DELETE ni
--     permisos sobre las tablas; se escribe únicamente con las funciones.
--   * El rol anónimo (sin sesión) no puede leer ni ejecutar nada.
-- =============================================================================

alter table public.organizacion enable row level security;
alter table public.miembro      enable row level security;
alter table public.insumo       enable row level security;
alter table public.presentacion enable row level security;
alter table public.proveedor    enable row level security;
alter table public.movimiento   enable row level security;

create policy organizacion_lectura on public.organizacion
  for select to authenticated
  using (id = interno.organizacion_actual());

create policy miembro_lectura on public.miembro
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

create policy insumo_lectura on public.insumo
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

create policy presentacion_lectura on public.presentacion
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

create policy proveedor_lectura on public.proveedor
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

create policy movimiento_lectura on public.movimiento
  for select to authenticated
  using (organizacion_id = interno.organizacion_actual());

-- -----------------------------------------------------------------------------
-- Permisos sobre tablas y vistas
-- -----------------------------------------------------------------------------
revoke all on
  public.organizacion, public.miembro, public.insumo, public.presentacion,
  public.proveedor, public.movimiento,
  public.v_saldo_insumo, public.v_saldo_presentacion, public.v_movimiento
from public, anon, authenticated;

grant select on
  public.organizacion, public.miembro, public.insumo, public.presentacion,
  public.proveedor, public.movimiento,
  public.v_saldo_insumo, public.v_saldo_presentacion, public.v_movimiento
to authenticated;

-- -----------------------------------------------------------------------------
-- Permisos sobre funciones
-- -----------------------------------------------------------------------------
revoke all on schema interno from public, anon;
grant usage on schema interno to authenticated, service_role;

revoke execute on all functions in schema interno from public, anon;
grant execute on function interno.organizacion_actual() to authenticated, service_role;

revoke execute on function
  public.crear_insumo(text, text, integer[]),
  public.agregar_presentacion(uuid, integer),
  public.registrar_ingreso(uuid, bigint, text, text, bigint, text),
  public.registrar_fraccionamiento(uuid, bigint, uuid, integer, bigint, text, text),
  public.compensar_operacion(uuid, text)
from public, anon;

grant execute on function
  public.crear_insumo(text, text, integer[]),
  public.agregar_presentacion(uuid, integer),
  public.registrar_ingreso(uuid, bigint, text, text, bigint, text),
  public.registrar_fraccionamiento(uuid, bigint, uuid, integer, bigint, text, text),
  public.compensar_operacion(uuid, text)
to authenticated;
