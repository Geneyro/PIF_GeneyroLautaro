# GFK Estética Vehicular · Sistema de Control de Consumo de Insumos

**Prototipo v1 — Iteración 1.** Esqueleto arquitectónico ejecutable de extremo a extremo que integra
interfaz (Next.js 14), lógica transaccional (PL/pgSQL), persistencia (Supabase / PostgreSQL 15) y
retorno de resultados, con integración continua en GitHub Actions.

La aplicación está desplegada en **Vercel** y la base de datos en **Supabase Cloud**.

El caso de uso vertical implementado es el **motor de fraccionamiento**: un bidón de 5 L se registra
como 5.000 mL y solo puede fraccionarse en presentaciones de venta si las cantidades se conservan
exactamente.

---

## Índice

1. [Alcance funcional](#1-alcance-funcional)
2. [Arquitectura](#2-arquitectura)
3. [Despliegue en producción](#3-despliegue-en-producción)
4. [Probar el caso de prueba en producción](#4-probar-el-caso-de-prueba-en-producción)
5. [Verificar la base de datos en Supabase Cloud](#5-verificar-la-base-de-datos-en-supabase-cloud)
6. [Seguridad y cifrado (HTTPS)](#6-seguridad-y-cifrado-https)
7. [Integración continua](#7-integración-continua)
8. [Modelo de datos y lógica transaccional](#8-modelo-de-datos-y-lógica-transaccional)
9. [Solución de problemas](#9-solución-de-problemas)
10. [Enlaces](#10-enlaces)

---

## 1. Alcance funcional

| Requisito | Descripción | Dónde se implementa |
|-----------|-------------|---------------------|
| **RF-02** | Alta de insumo a granel en unidad base (mL o g) | `crear_insumo()` · formulario «1 · Alta de insumo» |
| **RF-03** | Ingreso con conversión a unidad base (5 L → 5.000 mL) | `registrar_ingreso()` + `convertir_a_unidad_base()` · formulario «2 · Ingreso» |
| **RF-01** | Fraccionamiento como transformación que conserva cantidades | `registrar_fraccionamiento()` + trigger de invariantes · formulario «4 · Fraccionamiento» |
| **RF-04** | Consulta de saldo en unidad base | vistas `v_saldo_insumo`, `v_saldo_presentacion` · tabla «Saldos» |
| **RF-05** | Inmutabilidad de movimientos | triggers `BEFORE UPDATE/DELETE/TRUNCATE` sobre `movimiento_stock` · botones *Editar/Eliminar* |
| Seguridad | Cifrado de comunicaciones | HTTPS en Vercel y Supabase Cloud + cabecera HSTS |

Toda regla de negocio crítica vive **en la base de datos**: aunque se usara otro cliente distinto de
la aplicación web, no sería posible registrar un fraccionamiento que no conserve cantidades ni
modificar un movimiento.

---

## 2. Arquitectura

```
 Navegador (PC / celular)
        │  HTTPS
        ▼
 Vercel · Next.js 14 (App Router)
   ├─ app/page.tsx ............ Server Component: consulta saldos (RF-04)
   ├─ components/*.tsx ........ formularios (Client Components, useFormState)
   └─ app/actions.ts .......... Server Actions → supabase.rpc(...)
        │  HTTPS / PostgREST (clave pública, solo en el servidor)
        ▼
 Supabase Cloud · PostgreSQL 15
   ├─ funciones PL/pgSQL ...... únicas vías de escritura (SECURITY DEFINER)
   ├─ triggers ................ inmutabilidad + invariantes de conservación
   └─ vistas .................. saldos en unidad base
```

### Estructura del repositorio

```
.
├── .github/workflows/ci.yml          Pipeline de integración continua
├── app/
│   ├── actions.ts                    Server Actions (llaman a las funciones PL/pgSQL)
│   ├── globals.css                   Estilos (adaptable a celular)
│   ├── layout.tsx
│   └── page.tsx                      Pantalla única del prototipo
├── components/                       Formularios y tabla de movimientos
├── lib/
│   ├── datos.ts                      Consultas de saldos y movimientos
│   ├── format.ts                     Formato de cantidades
│   ├── supabase.ts                   Cliente Supabase (solo servidor)
│   └── types.ts
├── supabase/
│   ├── config.toml                   Configuración del CLI de Supabase
│   ├── migrations/
│   │   └── 20261001000000_motor_fraccionamiento.sql   Esquema, funciones, triggers, vistas, permisos
│   ├── tests/
│   │   └── motor_fraccionamiento.test.sql             Test de aceptación en SQL
│   └── ci/roles.sql                  Roles de Supabase para el Postgres del CI
├── .env.example                      Plantilla de variables de entorno
├── .vercelignore                     Evita subir archivos .env al desplegar
├── next.config.mjs                   Cabeceras de seguridad (HSTS, etc.)
└── package.json
```

---

## 3. Despliegue en producción

### Requisitos

| Necesario | Para qué |
|-----------|----------|
| Cuenta en [Supabase](https://supabase.com) con un proyecto creado | Base de datos PostgreSQL 15 en la nube |
| Cuenta en [Vercel](https://vercel.com) | Alojar la aplicación Next.js |
| Node.js 20 LTS o superior y Git | Ejecutar los CLIs (`npx supabase`, `npx vercel`) |

Clonar el repositorio e instalar dependencias (incluye el CLI de Supabase):

```bash
git clone https://github.com/Geneyro/PIF_GeneyroLautaro.git
cd PIF_GeneyroLautaro
npm ci
```

### 3.1 Base de datos en Supabase Cloud

1. Iniciar sesión en el CLI (abre el navegador; también se puede usar un token personal de
   <https://supabase.com/dashboard/account/tokens> con `npx supabase login --token <token>`):

   ```bash
   npx supabase login
   ```

2. Vincular el repositorio con el proyecto remoto. El *Reference ID* está en
   *Project Settings → General*; la contraseña es la de la base de datos del proyecto:

   ```bash
   npx supabase link --project-ref <reference-id> -p "<contraseña-de-la-base>"
   ```

3. Aplicar las migraciones (tablas, triggers de inmutabilidad, funciones PL/pgSQL, vistas y
   permisos). Conviene revisar primero qué se aplicará con `--dry-run`:

   ```bash
   npx supabase db push --dry-run
   npx supabase db push
   ```

> Alternativa sin CLI: en el dashboard, *SQL Editor* → pegar el contenido completo de
> `supabase/migrations/20261001000000_motor_fraccionamiento.sql` → *Run*.

### 3.2 Aplicación en Vercel

1. Iniciar sesión y vincular el proyecto:

   ```bash
   npx vercel login
   npx vercel link
   ```

2. Definir las variables de entorno para **Production** y **Preview** (el CLI pide el valor):

   ```bash
   npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
   npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview
   npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
   ```

   | Variable | Valor | Dónde obtenerlo |
   |----------|-------|-----------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<reference-id>.supabase.co` | *Project Settings → API* |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave *publishable* (`sb_publishable_…`) o *anon* | *Project Settings → API Keys* |

   También pueden cargarse desde el dashboard de Vercel: *Project → Settings → Environment
   Variables*.

3. Desplegar a producción:

   ```bash
   npx vercel deploy --prod
   ```

Notas:

- Las variables se leen **solo en el servidor** (Server Actions y Server Components, en
  `lib/supabase.ts`, marcado como `server-only`), por lo que no se incluyen en el código que
  descarga el navegador.
- Se usa la clave **pública** a propósito: con ella la aplicación solo puede *leer* tablas y
  *ejecutar* las funciones del motor. No necesita (ni debe usar) la `service_role` / `secret key`.
- `.vercelignore` y `.gitignore` excluyen los archivos `.env*`: ninguna credencial se sube al
  repositorio ni al despliegue.

### 3.3 Despliegue continuo (opcional)

Para que cada *push* a `main` se despliegue automáticamente, conecte el repositorio en
*Vercel → Project → Settings → Git* (requiere instalar la app de Vercel en GitHub). Mientras tanto,
cada nueva versión se publica con:

```bash
npx supabase db push        # solo si hay migraciones nuevas
npx vercel deploy --prod
```

### 3.4 Versión entregada

La entrega de la Iteración 1 está marcada con la etiqueta anotada `v1`:

```bash
git checkout v1
```

---

## 4. Probar el caso de prueba en producción

Abra la [aplicación en producción](#10-enlaces), desde la computadora o el celular. La pantalla
incluye una guía desplegable «Caso de prueba de la Iteración 1». Pasos y resultados esperados:

| # | Acción | Resultado esperado |
|---|--------|--------------------|
| 1 | **Alta de insumo**: nombre `Shampoo neutro`, unidad base `mL` → *Dar de alta* | «Insumo creado con unidad base mL». Aparece en *Saldos* con 0 mL. |
| 2 | **Ingreso**: cantidad `5`, unidad `L` → *Registrar ingreso* | Vista previa «5 L = 5.000 mL». Mensaje con saldo a granel **5.000 mL**, consultado en la base. |
| 3 | **Presentación**: nombre `Botella 1 L`, contenido `1` `L` → *Crear presentación* | La presentación queda con contenido 1.000 mL. |
| 4 | **Fraccionamiento**: extraído `5000`, presentación *Botella 1 L*, unidades `4`, merma `0` → *Registrar fraccionamiento* | **Rechazado** por la base de datos: «Fraccionamiento rechazado: **hay 1000 mL no explicados**. Se extrajeron 5000 mL del granel, pero las presentaciones suman 4000 mL (4 × Botella 1 L) y la merma declarada es 0 mL.» El saldo no cambia. |
| 5 | Cambiar unidades a `5` → *Registrar fraccionamiento* | **Confirmado**. Saldos persistidos: granel **0 mL**, presentaciones **5.000 mL** (5 botellas), total 5.000 mL. Recargar la página muestra los mismos valores: están en la base. |
| 6 | En **Movimientos de stock**, pulsar *Editar* o *Eliminar* en cualquier fila | **Rechazado**: «Movimiento_Stock es inmutable: no se permite UPDATE/DELETE sobre el movimiento #N.» |

Casos adicionales: fraccionar 1.500 mL en 1 botella declarando 500 mL de merma (se acepta y suma a
*Merma acumulada*), producir más de lo extraído (rechazo «las salidas exceden en …») o extraer más
que el saldo a granel (rechazo «Saldo a granel insuficiente»).

> El nombre del insumo es único: si «Shampoo neutro» ya existe en producción, use otro nombre
> (por ejemplo «Shampoo neutro 2») para repetir la prueba. Los movimientos no se pueden borrar.
>
> El recuadro de balance del formulario de fraccionamiento es solo una vista previa: el botón
> envía igualmente el movimiento y **la decisión la toma la función PL/pgSQL**.

---

## 5. Verificar la base de datos en Supabase Cloud

Abra el [dashboard del proyecto](#10-enlaces):

- **Table Editor:** muestra `insumo`, `presentacion_venta` y `movimiento_stock` con los datos
  cargados desde la aplicación.
- **SQL Editor:** permite comprobar las reglas directamente:

  ```sql
  select * from v_saldo_insumo;                         -- RF-04: saldos en unidad base
  update movimiento_stock set cantidad_base = 0;        -- RF-05 → ERROR: Movimiento_Stock es inmutable
  delete from movimiento_stock;                         -- RF-05 → ERROR: Movimiento_Stock es inmutable
  ```

  El bloqueo aplica incluso al usuario `postgres` (dueño de la tabla), porque lo imponen triggers y
  no solo permisos.

### Test de aceptación automatizado

`supabase/tests/motor_fraccionamiento.test.sql` reproduce el caso de prueba completo dentro de una
transacción que **se revierte al final** (no deja datos). Se ejecuta en cada corrida del CI y
también puede lanzarse contra Supabase Cloud con `psql`, usando la cadena de conexión de
*Connect → Session pooler* del dashboard:

```bash
psql "<cadena-de-conexión>" -v ON_ERROR_STOP=1 -f supabase/tests/motor_fraccionamiento.test.sql
```

Salida esperada (resumida):

```
NOTICE:  OK  RF-03  Bidón de 5 L convertido a 5000 mL
NOTICE:  OK  RF-01  Rechazo: Fraccionamiento rechazado: hay 1000 mL no explicados. ...
NOTICE:  OK  RF-04  Granel 0 mL · Presentaciones 5000 mL (5 u.) · Total 5000 mL
NOTICE:  OK  RF-05  Movimiento_Stock es inmutable: no se permite UPDATE sobre el movimiento #...
NOTICE:  ==> Todos los tests del motor de fraccionamiento pasaron.
```

---

## 6. Seguridad y cifrado (HTTPS)

- **Navegador ↔ Vercel:** Vercel sirve la aplicación exclusivamente por HTTPS y redirige las
  peticiones HTTP (308). `next.config.mjs` envía la cabecera `Strict-Transport-Security` (HSTS)
  para que el navegador use siempre HTTPS, además de `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` y `Permissions-Policy`.
- **Vercel ↔ Supabase:** la API de Supabase Cloud es `https://<reference-id>.supabase.co`; todo el
  tráfico entre la aplicación y la base viaja cifrado con TLS.
- **Credenciales:** la clave de Supabase solo existe en el servidor de Vercel; el navegador nunca la
  recibe.
- **Permisos en la base:** con la clave pública solo se puede leer y ejecutar las funciones del
  motor; cualquier `INSERT`, `UPDATE` o `DELETE` directo sobre las tablas devuelve
  `permission denied`.

---

## 7. Integración continua

`.github/workflows/ci.yml` se ejecuta en cada *push* y *pull request* con dos jobs:

| Job | Qué hace |
|-----|----------|
| **Next.js · lint, tipos y build** | `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` sobre Node 20 |
| **PostgreSQL 15 · migraciones y tests PL/pgSQL** | Levanta un servicio `postgres:15`, crea los roles de Supabase (`supabase/ci/roles.sql`), aplica todas las migraciones y ejecuta `supabase/tests/motor_fraccionamiento.test.sql`. Si alguna regla (conservación, inmutabilidad, saldos) se rompe, el pipeline falla. |

El build no necesita variables de entorno: la página es dinámica y consulta la base solo en tiempo
de ejecución. El estado de cada corrida se ve en la [pestaña Actions](#10-enlaces).

---

## 8. Modelo de datos y lógica transaccional

### Entidades

```
insumo (1) ──< presentacion_venta (N)
   │                    │
   └──< movimiento_stock >┘   FK simple a insumo + FK compuesta (presentacion_id, insumo_id)
                              → la presentación siempre pertenece al mismo insumo del movimiento
```

| Tabla | Campos clave |
|-------|--------------|
| `insumo` | `id`, `nombre` (único), `unidad_base` (`mL` \| `g`) |
| `presentacion_venta` | `id`, `insumo_id` → insumo, `nombre`, `contenido_base` (> 0, en unidad base) |
| `movimiento_stock` | `id`, `operacion_id`, `tipo` (`INGRESO` \| `FRACCIONAMIENTO`), `insumo_id`, `compartimento` (`GRANEL` \| `PRESENTACION` \| `MERMA`), `presentacion_id`, `unidades`, `cantidad_base` (con signo), `cantidad_original`/`unidad_original` (trazabilidad del ingreso), `registrado_en` |

`movimiento_stock` es un **libro mayor**: cada operación genera una o más líneas agrupadas por
`operacion_id`, con cantidades siempre en unidad base. Un fraccionamiento de 5.000 mL en 5 botellas
genera:

| compartimento | presentación | unidades | cantidad_base |
|---------------|--------------|----------|---------------|
| GRANEL | — | — | −5000 |
| PRESENTACION | Botella 1 L | 5 | +5000 |
| *(MERMA, solo si hay merma)* | — | — | +merma |

Las líneas de una transformación **suman exactamente 0**: esa es la conservación de cantidades.

### Garantías en la base de datos

| Mecanismo | Garantía |
|-----------|----------|
| `registrar_fraccionamiento()` | Bloquea el insumo (`FOR UPDATE`), valida saldo y pertenencia de la presentación, y exige `extraído = unidades × contenido + merma`. Si no se cumple, lanza una excepción que informa la diferencia exacta («hay 1000 mL no explicados» o «las salidas exceden en …»). Todas las líneas se insertan en una única sentencia: la operación es atómica. |
| Trigger de restricción diferido `trg_movimiento_stock_invariantes` | Al confirmar la transacción verifica, para cualquier inserción (incluso manual): que cada fraccionamiento sume 0, que las líneas de presentación coincidan con `unidades × contenido` y que el saldo a granel nunca sea negativo. |
| Triggers `trg_movimiento_stock_bloquear_update/delete/truncate` | Impiden modificar o borrar movimientos (RF-05). Las correcciones se hacen con movimientos compensatorios. |
| `CHECK` constraints | Signo coherente por tipo/compartimento; líneas de presentación con unidades > 0. |
| Permisos + RLS | `anon` y `authenticated` solo tienen `SELECT` sobre tablas y vistas y `EXECUTE` sobre las funciones del motor. No pueden hacer `INSERT/UPDATE/DELETE` directos. |

### Funciones expuestas (RPC)

| Función | Uso |
|---------|-----|
| `crear_insumo(p_nombre, p_unidad_base)` | Alta de insumo |
| `crear_presentacion(p_insumo_id, p_nombre, p_contenido, p_unidad)` | Alta de presentación (convierte L→mL, kg→g) |
| `registrar_ingreso(p_insumo_id, p_cantidad, p_unidad, p_observacion)` | Ingreso a granel con conversión |
| `registrar_fraccionamiento(p_insumo_id, p_cantidad_extraida, p_presentacion_id, p_unidades, p_merma, p_observacion)` | Motor de fraccionamiento |
| `demo_intentar_alterar_movimiento(p_movimiento_id, p_operacion)` | Solo para demostrar RF-05 desde la interfaz: ejecuta un UPDATE/DELETE real con privilegios del dueño de la tabla, que el trigger rechaza |

---

## 9. Solución de problemas

| Síntoma | Causa y solución |
|---------|------------------|
| La página muestra «No se pudo conectar con la base de datos — Faltan las variables…» | Faltan `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel. Cárguelas (sección 3.2) y **vuelva a desplegar**: las variables se aplican en el siguiente despliegue. |
| «Invalid API key» / «No API key found» | La clave está incompleta o es de otro proyecto. Copie de nuevo la clave *publishable* / *anon* completa desde *Project Settings → API Keys*. |
| «relation "v_saldo_insumo" does not exist» / «Could not find the function …» | Las migraciones no se aplicaron en Supabase Cloud. Ejecute `npx supabase db push` (sección 3.1). |
| `npx supabase link` / `db push` piden token | Ejecute `npx supabase login` (o `npx supabase login --token <token>`). |
| `npx supabase db push` falla con error de autenticación | La contraseña de la base es incorrecta. Puede restablecerla en *Project Settings → Database*. |
| «Ya existe un insumo llamado …» | El nombre del insumo es único. Use otro nombre para repetir el caso de prueba. |
| El CI falla en GitHub | Abra la corrida en la pestaña *Actions*: el job indica si falló el build de Next.js o una regla del motor en el test SQL. |

---

## 10. Enlaces

| Recurso | Enlace |
|---------|--------|
| Aplicación en producción (Vercel) | <https://gfk-control-insumos.vercel.app/> |
| Base de datos (Supabase Cloud) | <https://supabase.com/dashboard/project/dglnfpusnecnvbhmeowf> |
| Repositorio (GitHub) | <https://github.com/Geneyro/PIF_GeneyroLautaro> |
| Integración continua (GitHub Actions) | <https://github.com/Geneyro/PIF_GeneyroLautaro/actions> |
| Versión entregada (etiqueta `v1`) | <https://github.com/Geneyro/PIF_GeneyroLautaro/releases/tag/v1> |
