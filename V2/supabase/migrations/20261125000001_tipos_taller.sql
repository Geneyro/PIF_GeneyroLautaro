-- =============================================================================
-- DETAIL CONTROL · Tipos de movimiento del taller
--
--   AJUSTE   Diferencia entre el conteo físico (Auditoría) y el saldo del sistema.
--   CONSUMO  Insumo usado en un servicio del taller (Servicios).
--
-- Va en un archivo propio: PostgreSQL no permite usar un valor nuevo de un
-- enum en la misma transacción que lo agrega.
-- =============================================================================

alter type public.tipo_movimiento add value if not exists 'AJUSTE';
alter type public.tipo_movimiento add value if not exists 'CONSUMO';
