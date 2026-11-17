-- =============================================================================
-- Test de aceptación del motor de fraccionamiento (Iteración 1)
--
-- Reproduce el caso de prueba vertical y verifica RF-01 a RF-05 directamente
-- en PostgreSQL. Se ejecuta en CI y localmente con:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/motor_fraccionamiento.test.sql
-- Todo corre dentro de una transacción que se revierte al final: no deja datos.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

do $$
declare
  v_insumo   uuid;
  v_botella  uuid;
  v_granel   numeric;
  v_pres     numeric;
  v_total    numeric;
  v_unidades bigint;
  v_mov      bigint;
  v_cant     integer;
  v_msg      text;
begin
  -- RF-02 / RF-03: alta del insumo en mL e ingreso de un bidón de 5 L --------
  v_insumo := public.crear_insumo('TEST Shampoo neutro', 'mL');
  perform public.registrar_ingreso(v_insumo, 5, 'L', 'Bidón 5 L');

  select saldo_granel into v_granel from public.v_saldo_insumo where insumo_id = v_insumo;
  assert v_granel = 5000, format('Se esperaba saldo a granel 5000 mL, se obtuvo %s', v_granel);
  raise notice 'OK  RF-03  Bidón de 5 L convertido a % mL', trim_scale(v_granel);

  v_botella := public.crear_presentacion(v_insumo, 'Botella 1 L', 1, 'L');

  -- RF-01: 4 botellas de 1 L sin merma -> rechazo con 1000 mL no explicados --
  begin
    perform public.registrar_fraccionamiento(v_insumo, 5000, v_botella, 4, 0);
    raise exception 'FALLO: el fraccionamiento 5000 -> 4 x 1000 debió ser rechazado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like '%hay 1000 mL no explicados%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  RF-01  Rechazo: %', v_msg;
  end;

  select saldo_granel into v_granel from public.v_saldo_insumo where insumo_id = v_insumo;
  assert v_granel = 5000, 'Un fraccionamiento rechazado no debe alterar el saldo';
  select count(*) into v_cant from public.movimiento_stock where insumo_id = v_insumo;
  assert v_cant = 1, format('Solo debe existir el ingreso, hay %s movimientos', v_cant);

  -- Salidas mayores que lo extraído también se rechazan ----------------------
  begin
    perform public.registrar_fraccionamiento(v_insumo, 5000, v_botella, 6, 0);
    raise exception 'FALLO: 5000 -> 6 x 1000 debió ser rechazado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like '%exceden en 1000 mL%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  RF-01  Rechazo por exceso: %', v_msg;
  end;

  -- No se puede extraer más de lo que hay a granel ----------------------------
  begin
    perform public.registrar_fraccionamiento(v_insumo, 6000, v_botella, 6, 0);
    raise exception 'FALLO: extraer 6000 de un saldo de 5000 debió ser rechazado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like 'Saldo a granel insuficiente%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  RF-01  Rechazo por saldo: %', v_msg;
  end;

  -- RF-01: 5 botellas de 1 L -> se confirma ------------------------------------
  perform public.registrar_fraccionamiento(v_insumo, 5000, v_botella, 5, 0);
  set constraints all immediate; -- fuerza ahora los invariantes diferidos

  -- RF-04: saldos en unidad base ---------------------------------------------
  select saldo_granel, saldo_presentaciones, saldo_total
    into v_granel, v_pres, v_total
    from public.v_saldo_insumo where insumo_id = v_insumo;
  assert v_granel = 0,    format('Saldo a granel esperado 0, se obtuvo %s', v_granel);
  assert v_pres   = 5000, format('Saldo en presentaciones esperado 5000, se obtuvo %s', v_pres);
  assert v_total  = 5000, format('Saldo total esperado 5000, se obtuvo %s', v_total);
  select unidades into v_unidades from public.v_saldo_presentacion where presentacion_id = v_botella;
  assert v_unidades = 5, format('Se esperaban 5 botellas, hay %s', v_unidades);
  raise notice 'OK  RF-04  Granel % mL · Presentaciones % mL (% u.) · Total % mL',
    trim_scale(v_granel), trim_scale(v_pres), v_unidades, trim_scale(v_total);

  -- Fraccionamiento con merma declarada ----------------------------------------
  perform public.registrar_ingreso(v_insumo, 1500, 'mL');
  perform public.registrar_fraccionamiento(v_insumo, 1500, v_botella, 1, 500, 'Derrame');
  set constraints all immediate;
  select saldo_granel, merma_acumulada into v_granel, v_pres from public.v_saldo_insumo where insumo_id = v_insumo;
  assert v_granel = 0 and v_pres = 500, 'La merma declarada debe registrarse';
  raise notice 'OK  RF-01  1500 mL = 1 x 1000 mL + 500 mL de merma';

  -- RF-05: inmutabilidad -------------------------------------------------------
  select min(id) into v_mov from public.movimiento_stock where insumo_id = v_insumo;

  begin
    update public.movimiento_stock set cantidad_base = 1 where id = v_mov;
    raise exception 'FALLO: UPDATE sobre movimiento_stock debió ser bloqueado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like 'Movimiento_Stock es inmutable%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  RF-05  %', v_msg;
  end;

  begin
    delete from public.movimiento_stock where id = v_mov;
    raise exception 'FALLO: DELETE sobre movimiento_stock debió ser bloqueado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like 'Movimiento_Stock es inmutable%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  RF-05  %', v_msg;
  end;

  begin
    truncate public.movimiento_stock;
    raise exception 'FALLO: TRUNCATE sobre movimiento_stock debió ser bloqueado';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like 'Movimiento_Stock es inmutable%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  RF-05  %', v_msg;
  end;

  -- Red de seguridad: inserción directa que no conserva cantidades -----------
  begin
    perform public.registrar_ingreso(v_insumo, 100, 'mL');
    insert into public.movimiento_stock (operacion_id, tipo, insumo_id, compartimento, cantidad_base)
    values (gen_random_uuid(), 'FRACCIONAMIENTO', v_insumo, 'GRANEL', -100);
    set constraints all immediate;
    raise exception 'FALLO: una operación que no suma 0 debió ser rechazada';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO:%' then raise; end if;
    assert v_msg like 'Conservación de cantidades violada%', format('Mensaje inesperado: %s', v_msg);
    raise notice 'OK  Invariante diferido: %', v_msg;
  end;

  raise notice '==> Todos los tests del motor de fraccionamiento pasaron.';
end;
$$;

rollback;
