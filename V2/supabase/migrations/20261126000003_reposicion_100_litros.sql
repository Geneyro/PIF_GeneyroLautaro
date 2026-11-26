-- =============================================================================
-- Dashboard · alerta de reposición por debajo de 100 L
--
-- Todo insumo con menos de 100 L (100.000 mL, o 100.000 g) a granel queda
-- marcado para reponer, tenga o no punto de pedido. El punto de pedido sigue
-- valiendo como un mínimo propio: si es mayor que 100 L, la alerta salta al
-- llegar a él. Solo cambia la columna `reponer`; las demás quedan iguales.
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
  (coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'GRANEL'), 0) < 100000
    or (i.punto_pedido is not null
        and coalesce(sum(m.cantidad_base) filter (where m.compartimento = 'GRANEL'), 0) <= i.punto_pedido)) as reponer
from public.insumo i
left join public.movimiento m on m.insumo_id = i.id
group by i.id;

comment on column public.v_saldo_insumo.reponer is
  'Verdadero cuando el granel está por debajo de 100.000 (100 L) o llegó al punto de pedido del insumo.';
