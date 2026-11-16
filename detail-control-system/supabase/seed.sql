-- =============================================================================
-- DETAIL CONTROL · Datos de prueba
--
-- SOLO para el entorno local y la integración continua (`supabase start` /
-- `supabase db reset`). NUNCA se aplica a producción: `supabase db push` no
-- ejecuta este archivo. La carga real se hará con «Importar Excel» (RF-21).
--
-- Los usuarios y la contraseña de abajo son ficticios (dominios .test) y solo
-- existen en bases descartables.
-- =============================================================================

-- Dos organizaciones: la de trabajo y otra para probar el aislamiento (RNF-04).
insert into public.organizacion (id, nombre) values
  ('0a000000-0000-4000-8000-000000000001', 'GFK Estética Vehicular (pruebas)'),
  ('0b000000-0000-4000-8000-000000000002', 'Otra organización (pruebas)');

-- Usuarios de prueba en Supabase Auth. «alta_manual» evita que el trigger de
-- cuentas nuevas los deje como solicitud: se asocian acá mismo.
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'yanina@gfk.test', 'Yanina', '0a000000-0000-4000-8000-000000000001'::uuid, 'ADMINISTRADOR'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'guido@gfk.test',  'Guido',  '0a000000-0000-4000-8000-000000000001'::uuid, 'OPERARIO'),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'ajeno@otra.test', 'Usuario ajeno', '0b000000-0000-4000-8000-000000000002'::uuid, 'ADMINISTRADOR')
    ) as t (id, correo, nombre, organizacion_id, rol)
  loop
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new)
    values
      ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.correo,
       extensions.crypt('detail-control-pruebas', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"],"alta_manual":true}', '{}', now(), now(),
       '', '', '', '');

    insert into auth.identities
      (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values
      (gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.correo, 'email_verified', true),
       'email', now(), now(), now());

    insert into public.miembro (usuario_id, organizacion_id, nombre, rol)
    values (u.id, u.organizacion_id, u.nombre, u.rol::public.rol_usuario);
  end loop;
end;
$$;

-- Insumos de GFK conocidos hasta ahora, con presentaciones de 1, 5 y 20 L.
-- Se crean con la función del sistema, bajo la sesión de un usuario de prueba.
-- (Faltan dos insumos y los precios: se agregan cuando el cliente los informe.)
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
  perform public.crear_insumo('Mekasil Tradicional', 'mL', '{1,5,20}');
  perform public.crear_insumo('BB', 'mL', '{1,5,20}');
  perform public.crear_insumo('Citrolimp', 'mL', '{1,5,20}');
  perform public.crear_insumo('Shampoo Siliconado', 'mL', '{1,5,20}');
end;
$$;
