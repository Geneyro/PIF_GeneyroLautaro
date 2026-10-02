# GFK Estética Vehicular · Sistema de Control de Consumo de Insumos

**Prototipo v1 — Iteración 1.** Esqueleto arquitectónico ejecutable de extremo a extremo que integra
interfaz (Next.js 14), lógica transaccional (PL/pgSQL), persistencia (Supabase / PostgreSQL 15) y
retorno de resultados, con integración continua en GitHub Actions.

El caso de uso vertical implementado es el **motor de fraccionamiento**: un bidón de 5 L se registra
como 5.000 mL y solo puede fraccionarse en presentaciones de venta si las cantidades se conservan
exactamente.

### Producción

| Componente | Enlace |
|------------|--------|
| Aplicación (Vercel) | <https://gfk-control-insumos.vercel.app> |
| Base de datos (Supabase Cloud) | <https://supabase.com/dashboard/project/dglnfpusnecnvbhmeowf> |
| Integración continua | <https://github.com/Geneyro/PIF_GeneyroLautaro/actions> |

Para redesplegar: `npx supabase db push` (migraciones nuevas) y `npx vercel deploy --prod`.
Variables de entorno en Vercel: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(Production y Preview). El archivo `.vercelignore` impide subir los `.env` locales.

---

## Índice

1. [Alcance funcional](#1-alcance-funcional)
2. [Arquitectura y estructura del repositorio](#2-arquitectura-y-estructura-del-repositorio)
3. [Requisitos previos](#3-requisitos-previos)
4. [Puesta en marcha local (paso a paso)](#4-puesta-en-marcha-local-paso-a-paso)
5. [Ejecutar el caso de prueba en la interfaz](#5-ejecutar-el-caso-de-prueba-en-la-interfaz)
6. [Verificar la base de datos desde la terminal](#6-verificar-la-base-de-datos-desde-la-terminal)
7. [Alternativa: usar Supabase Cloud](#7-alternativa-usar-supabase-cloud)
8. [Cifrado de las comunicaciones (HTTPS)](#8-cifrado-de-las-comunicaciones-https)
9. [Integración continua](#9-integración-continua)
10. [Modelo de datos y lógica transaccional](#10-modelo-de-datos-y-lógica-transaccional)
11. [Scripts disponibles](#11-scripts-disponibles)
12. [Solución de problemas](#12-solución-de-problemas)
13. [Servidor MCP de Supabase (asistentes de IA)](#13-servidor-mcp-de-supabase-asistentes-de-ia)

---

## 1. Alcance funcional

| Requisito | Descripción | Dónde se implementa |
|-----------|-------------|---------------------|
| **RF-02** | Alta de insumo a granel en unidad base (mL o g) | `crear_insumo()` · formulario «1 · Alta de insumo» |
| **RF-03** | Ingreso con conversión a unidad base (5 L → 5.000 mL) | `registrar_ingreso()` + `convertir_a_unidad_base()` · formulario «2 · Ingreso» |
| **RF-01** | Fraccionamiento como transformación que conserva cantidades | `registrar_fraccionamiento()` + trigger de invariantes · formulario «4 · Fraccionamiento» |
| **RF-04** | Consulta de saldo en unidad base | vistas `v_saldo_insumo`, `v_saldo_presentacion` · tabla «Saldos» |
| **RF-05** | Inmutabilidad de movimientos | triggers `BEFORE UPDATE/DELETE/TRUNCATE` sobre `movimiento_stock` · botones *Editar/Eliminar* |
| Seguridad | Cifrado de comunicaciones | HTTPS (Supabase Cloud, `next dev --experimental-https`, HSTS) |

Toda regla de negocio crítica vive **en la base de datos**: aunque se usara otro cliente distinto de
la aplicación web, no sería posible registrar un fraccionamiento que no conserve cantidades ni
modificar un movimiento.

---

## 2. Arquitectura y estructura del repositorio

```
 Navegador (PC / celular)
        │  HTTPS
        ▼
 Next.js 14 (App Router)
   ├─ app/page.tsx ............ Server Component: consulta saldos (RF-04)
   ├─ components/*.tsx ........ formularios (Client Components, useFormState)
   └─ app/actions.ts .......... Server Actions → supabase.rpc(...)
        │  HTTPS / PostgREST (clave pública, solo en el servidor)
        ▼
 Supabase · PostgreSQL 15
   ├─ funciones PL/pgSQL ...... únicas vías de escritura (SECURITY DEFINER)
   ├─ triggers ................ inmutabilidad + invariantes de conservación
   └─ vistas .................. saldos en unidad base
```

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
│   ├── config.toml                   Configuración del Supabase local (PostgreSQL 15)
│   ├── migrations/
│   │   └── 20261001000000_motor_fraccionamiento.sql   Esquema, funciones, triggers, vistas, permisos
│   ├── tests/
│   │   └── motor_fraccionamiento.test.sql             Test de aceptación en SQL
│   └── ci/roles.sql                  Roles de Supabase para el Postgres del CI
├── .env.example                      Plantilla de variables de entorno
├── next.config.mjs                   Cabeceras de seguridad (HSTS, etc.)
└── package.json
```

---

## 3. Requisitos previos

| Herramienta | Versión | Para qué | Verificar con |
|-------------|---------|----------|---------------|
| **Node.js** | 20 LTS o superior | Ejecutar Next.js y el CLI de Supabase vía `npx` | `node -v` |
| **npm** | 10 o superior (viene con Node) | Instalar dependencias | `npm -v` |
| **Docker Desktop** | reciente, **en ejecución** | Supabase local corre en contenedores | `docker info` |
| **Git** | cualquiera | Clonar el repositorio | `git --version` |

> Descargas: Node.js → <https://nodejs.org> (versión LTS) · Docker Desktop → <https://www.docker.com/products/docker-desktop/>
>
> En **Windows** abra Docker Desktop y espere a que indique *Engine running* antes de continuar.
> Los comandos de esta guía funcionan en PowerShell, CMD, Git Bash, macOS y Linux salvo que se
> indique lo contrario.

No hace falta instalar el CLI de Supabase globalmente: viene como dependencia de desarrollo
(`supabase` en `package.json`), se instala con `npm ci` y se ejecuta con `npx supabase ...`.

> Windows: Node.js se puede instalar desde la terminal con
> `winget install --id OpenJS.NodeJS.LTS -e` (luego abra una terminal nueva).

---

## 4. Puesta en marcha local (paso a paso)

### Paso 1 — Clonar el repositorio

```bash
git clone <URL-del-repositorio> PIF_GeneyroLautaro
cd PIF_GeneyroLautaro
```

### Paso 2 — Instalar dependencias

```bash
npm ci
```

`npm ci` instala exactamente las versiones fijadas en `package-lock.json` (Next.js 14.2, React 18,
`@supabase/supabase-js` 2). Si prefiere, `npm install` también funciona.

### Paso 3 — Levantar Supabase local (PostgreSQL 15)

Con Docker Desktop en ejecución, desde la raíz del proyecto:

```bash
npx supabase start
```

- La **primera vez** descarga las imágenes de Docker (puede tardar varios minutos).
- Al arrancar, **aplica automáticamente** la migración de `supabase/migrations/` (tablas,
  funciones, triggers, vistas y permisos).
- Al terminar imprime un resumen con las URLs y claves. Los datos relevantes son:

| Dato | Valor local por defecto |
|------|-------------------------|
| API URL | `http://127.0.0.1:54321` |
| DB URL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (panel web) | `http://127.0.0.1:54323` |
| anon key / Publishable key | se muestra en pantalla (cadena larga) |

Puede volver a ver estos datos en cualquier momento con:

```bash
npx supabase status
```

Para **reiniciar la base desde cero** (borra los datos y reaplica la migración):

```bash
npx supabase db reset
```

### Paso 4 — Configurar las variables de entorno

Copie la plantilla:

```bash
# macOS / Linux / Git Bash
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Edite `.env.local` y complete:

| Variable | Valor en local | Valor en Supabase Cloud |
|----------|----------------|-------------------------|
| `SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<ref-del-proyecto>.supabase.co` |
| `SUPABASE_ANON_KEY` | la **anon key** (o **Publishable key**) que muestra `npx supabase status` | *Project Settings → API Keys* → anon / publishable |

Ejemplo de `.env.local` para entorno local:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....   # copiar el valor completo
```

> Atajo: `npx supabase status -o env` imprime las variables en formato `CLAVE=valor`;
> copie el valor de `ANON_KEY` (o `PUBLISHABLE_KEY`) en `SUPABASE_ANON_KEY` y el de `API_URL`
> en `SUPABASE_URL`.

Notas de seguridad:

- Las variables **no** llevan el prefijo `NEXT_PUBLIC_`: solo se leen en el servidor (Server
  Actions y Server Components) y nunca se envían al navegador.
- Se usa la clave **pública** a propósito: con ella la aplicación solo puede *leer* tablas y
  *ejecutar* las funciones del motor. No necesita (ni debe usar) la `service_role key`.
- `.env.local` está en `.gitignore`: nunca se sube al repositorio.

### Paso 5 — Iniciar el servidor de desarrollo

```bash
npm run dev
```

Abra <http://localhost:3000>. Para probar desde el celular en la misma red Wi-Fi, use
`http://<IP-de-la-PC>:3000`.

Versión con HTTPS local (ver [sección 8](#8-cifrado-de-las-comunicaciones-https)):

```bash
npm run dev:https      # → https://localhost:3000
```

### Paso 6 (opcional) — Build de producción

```bash
npm run build
npm start              # sirve el build en http://localhost:3000
```

### Detener todo

```bash
# Ctrl + C en la terminal de Next.js, y luego:
npx supabase stop
```

---

## 5. Ejecutar el caso de prueba en la interfaz

La pantalla incluye una guía desplegable «Caso de prueba de la Iteración 1». Pasos y resultados
esperados:

| # | Acción | Resultado esperado |
|---|--------|--------------------|
| 1 | **Alta de insumo**: nombre `Shampoo neutro`, unidad base `mL` → *Dar de alta* | «Insumo creado con unidad base mL». Aparece en *Saldos* con 0 mL. |
| 2 | **Ingreso**: cantidad `5`, unidad `L` → *Registrar ingreso* | Vista previa «5 L = 5.000 mL». Mensaje con saldo a granel **5.000 mL**, consultado en la base. |
| 3 | **Presentación**: nombre `Botella 1 L`, contenido `1` `L` → *Crear presentación* | La presentación queda con contenido 1.000 mL. |
| 4 | **Fraccionamiento**: extraído `5000`, presentación *Botella 1 L*, unidades `4`, merma `0` → *Registrar fraccionamiento* | **Rechazado** por la base de datos: «Fraccionamiento rechazado: **hay 1000 mL no explicados**. Se extrajeron 5000 mL del granel, pero las presentaciones suman 4000 mL (4 × Botella 1 L) y la merma declarada es 0 mL.» El saldo no cambia. |
| 5 | Cambiar unidades a `5` → *Registrar fraccionamiento* | **Confirmado**. Saldos persistidos: granel **0 mL**, presentaciones **5.000 mL** (5 botellas), total 5.000 mL. Recargar la página (F5) muestra los mismos valores: están en la base. |
| 6 | En **Movimientos de stock**, pulsar *Editar* o *Eliminar* en cualquier fila | **Rechazado**: «Movimiento_Stock es inmutable: no se permite UPDATE/DELETE sobre el movimiento #N.» |

Casos adicionales que también se pueden probar: fraccionar 1.500 mL en 1 botella declarando
500 mL de merma (se acepta y suma a *Merma acumulada*), producir más de lo extraído (rechazo «las
salidas exceden en …») o extraer más que el saldo a granel (rechazo «Saldo a granel insuficiente»).

> El recuadro de balance del formulario de fraccionamiento es solo una vista previa: el botón
> envía igualmente el movimiento y **la decisión la toma la función PL/pgSQL**.

---

## 6. Verificar la base de datos desde la terminal

### Test de aceptación automatizado

`supabase/tests/motor_fraccionamiento.test.sql` reproduce el caso de prueba completo dentro de una
transacción que se revierte (no deja datos). Con Supabase local levantado:

```bash
# Opción A: con psql instalado
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/motor_fraccionamiento.test.sql

# Opción B: sin psql, usando el contenedor de la base (macOS / Linux / Git Bash / CMD)
docker exec -i supabase_db_gfk-insumos psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/motor_fraccionamiento.test.sql
```

> En PowerShell la redirección `<` no existe; use:
> `Get-Content supabase/tests/motor_fraccionamiento.test.sql | docker exec -i supabase_db_gfk-insumos psql -U postgres -v ON_ERROR_STOP=1`

Salida esperada (resumida):

```
NOTICE:  OK  RF-03  Bidón de 5 L convertido a 5000 mL
NOTICE:  OK  RF-01  Rechazo: Fraccionamiento rechazado: hay 1000 mL no explicados. ...
NOTICE:  OK  RF-04  Granel 0 mL · Presentaciones 5000 mL (5 u.) · Total 5000 mL
NOTICE:  OK  RF-05  Movimiento_Stock es inmutable: no se permite UPDATE sobre el movimiento #...
NOTICE:  ==> Todos los tests del motor de fraccionamiento pasaron.
```

### Comprobación manual en Supabase Studio

Abra <http://127.0.0.1:54323> → *SQL Editor* y ejecute, por ejemplo:

```sql
select * from v_saldo_insumo;                         -- RF-04
update movimiento_stock set cantidad_base = 0;        -- RF-05 → ERROR: Movimiento_Stock es inmutable
delete from movimiento_stock;                         -- RF-05 → ERROR: Movimiento_Stock es inmutable
```

El bloqueo aplica incluso al usuario `postgres` (dueño de la tabla), porque lo imponen triggers y no
solo permisos.

---

## 7. Alternativa: usar Supabase Cloud

Si no puede usar Docker, la aplicación funciona igual contra un proyecto en la nube (PostgreSQL 15
o superior):

1. Cree un proyecto en <https://supabase.com/dashboard>.
2. Aplique la migración, con **una** de estas opciones:
   - **SQL Editor:** pegue el contenido completo de
     `supabase/migrations/20261001000000_motor_fraccionamiento.sql` y pulse *Run*.
   - **CLI:**
     ```bash
     npx supabase login
     npx supabase link --project-ref <ref-del-proyecto>
     npx supabase db push
     ```
3. En *Project Settings → API Keys* copie la URL del proyecto y la clave anon/publishable en
   `.env.local` (ver paso 4).
4. `npm run dev`.

La URL de Supabase Cloud es `https://…`: la comunicación entre Next.js y la base viaja cifrada con
TLS.

---

## 8. Cifrado de las comunicaciones (HTTPS)

- **Navegador ↔ Next.js:**
  - Desarrollo: `npm run dev:https` levanta `https://localhost:3000` con un certificado local que
    Next.js genera automáticamente (carpeta `certificates/`, ignorada por git). La primera vez
    puede pedir permisos para instalar la autoridad certificante local.
  - Producción: desplegar detrás de TLS (por ejemplo Vercel, que sirve HTTPS por defecto, o un
    proxy inverso con certificado). `next.config.mjs` envía la cabecera
    `Strict-Transport-Security` (HSTS) para que el navegador use siempre HTTPS, además de
    `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`.
- **Next.js ↔ Supabase:** en la nube la API es `https://<ref>.supabase.co`. En local la API
  escucha en `127.0.0.1` (tráfico que no sale de la máquina).
- Las credenciales de Supabase solo existen en el servidor; el navegador nunca las recibe.

---

## 9. Integración continua

`.github/workflows/ci.yml` se ejecuta en cada *push* y *pull request* con dos jobs:

| Job | Qué hace |
|-----|----------|
| **Next.js · lint, tipos y build** | `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` sobre Node 20 |
| **PostgreSQL 15 · migraciones y tests PL/pgSQL** | Levanta un servicio `postgres:15`, crea los roles de Supabase (`supabase/ci/roles.sql`), aplica todas las migraciones y ejecuta `supabase/tests/motor_fraccionamiento.test.sql`. Si alguna regla (conservación, inmutabilidad, saldos) se rompe, el pipeline falla. |

El build no necesita variables de entorno: la página es dinámica y consulta la base solo en tiempo
de ejecución.

---

## 10. Modelo de datos y lógica transaccional

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

## 11. Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo en `http://localhost:3000` |
| `npm run dev:https` | Servidor de desarrollo con HTTPS en `https://localhost:3000` |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm run typecheck` | Verificación de tipos TypeScript |
| `npx supabase start` / `stop` | Levanta / detiene Supabase local |
| `npx supabase status` | Muestra URLs y claves locales |
| `npx supabase db reset` | Recrea la base local y reaplica la migración |

---

## 12. Solución de problemas

| Síntoma | Causa y solución |
|---------|------------------|
| La página muestra «No se pudo conectar con la base de datos — Faltan las variables SUPABASE_URL…» | No existe `.env.local` o le faltan valores. Repita el [paso 4](#paso-4--configurar-las-variables-de-entorno) y **reinicie** `npm run dev` (Next.js lee las variables al arrancar). |
| «No se pudo consultar la base de datos: fetch failed» | Supabase no está levantado o la URL es incorrecta. Ejecute `npx supabase status`. |
| «Invalid API key» / «No API key found» | La clave copiada está incompleta o es de otro proyecto. Copie de nuevo la anon/publishable key completa. |
| «relation "v_saldo_insumo" does not exist» / «Could not find the function …» | La migración no se aplicó. Ejecute `npx supabase db reset` (local) o aplique el SQL en la nube (sección 7). |
| `npx supabase start` falla con un error de Docker | Docker Desktop no está en ejecución. Ábralo y espere a *Engine running*. |
| `npx supabase start` informa puertos ocupados (54321–54323) | Otro proyecto Supabase está corriendo: deténgalo con `npx supabase stop --project-id <id>` o libere los puertos. |
| El puerto 3000 está ocupado | `npm run dev -- -p 3001` |
| `npm ci` falla por versión de Node | Instale Node 20 LTS o superior (`node -v`). |

---

## 13. Servidor MCP de Supabase (asistentes de IA)

El repositorio incluye `.mcp.json`, que conecta clientes MCP (Claude Code, Cursor, VS Code…) al
servidor MCP que expone **Supabase local** en `http://127.0.0.1:54321/mcp`:

```json
{
  "mcpServers": {
    "supabase": { "type": "http", "url": "http://127.0.0.1:54321/mcp" }
  }
}
```

- Requiere Supabase local en ejecución (`npx supabase start`). No necesita claves.
- Herramientas disponibles: `list_tables`, `execute_sql`, `apply_migration`, `list_migrations`,
  `get_advisors`, `query_logs`, `generate_typescript_types`, `get_project_url`,
  `get_publishable_keys`, `list_extensions`, `search_docs`.
- En Claude Code, al abrir el proyecto se pide aprobar el servidor; verifique con `/mcp`.
- Los triggers de inmutabilidad también protegen frente a `execute_sql`: ningún agente puede editar
  ni borrar movimientos.

Para un proyecto en **Supabase Cloud**, use el servidor remoto (autenticación OAuth en el navegador,
`read_only=true` recomendado):

```bash
claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<ref-del-proyecto>&read_only=true"
```
