# DETAIL CONTROL: control de insumos y costeo de servicios para estética vehicular

Creado por: Lautaro Ezequiel Geneyro

El sistema vive en un solo repositorio, con dos aplicaciones independientes:

- **`V2/`** (DETAIL CONTROL, la que describe este manual): aplicación web en Next.js 14 + React 18 sobre Supabase (PostgreSQL 17, Auth y API): https://github.com/Geneyro/PIF_GeneyroLautaro/tree/main/V2
- **`V1/`**: el prototipo v1 de la Iteración 1 (motor de fraccionamiento, etiqueta `v1`). No hace falta para este manual.

---

**Este archivo es el manual de despliegue de la entrega** (versión `v1.0.0`; el mismo contenido va como PDF, `AE4_Geneyro_Manual.pdf`, con la sección 11 de problemas frecuentes). Correspondencia con las 11 secciones de la guía de despliegue:

| Sección de la guía | Dónde está en este manual |
|---|---|
| 1. Propósito y versión (etiqueta) | 1.1 |
| 2. Requisitos previos con versiones exactas | 1.2 y 3 |
| 3. Clonado y checkout de la etiqueta | 4.1 |
| 4. Configuración (`.env.example` con todas las variables) | 4.4 |
| 5. Base de datos: crear, migrar y cargar datos de prueba | 4.3 y 4.5 |
| 6. Ejecución: comando, puerto y cómo detenerla | 5 |
| 7. Usuario de demostración | 4.6 |
| 8. Verificación: prueba de humo y recorrido de los casos de uso Must | 6 |
| 9. Pruebas automatizadas y resultado esperado | 7 |
| 10. Problemas frecuentes | Sección 11 del manual en PDF |
| 11. Terceros e IA, coincidente con las bitácoras | 8 |

---

## 1. Identificación del proyecto y qué hace el sistema

### 1.1 Identificación

| Campo | Dato |
|---|---|
| Proyecto | DETAIL CONTROL: Sistema de control de consumo de insumos y costeo de servicios para centros de estética vehicular (cliente real: GFK Estética Vehicular, Posadas, Misiones) |
| Autor | Geneyro, Lautaro Ezequiel, DNI 41.821.082 |
| Comisión | A |
| Instancia | Proyecto Final de Grado, AE4 |
| Docente | PosDr. Darío Ezequiel Díaz |
| Versión | **v1.0.0**, la versión de entrega de la AE4: etiqueta anotada `v1.0.0` sobre el commit `e6ffa99` de `main` (26/11/2026), que se baja con `git checkout v1.0.0` (ver 4.1). La etiqueta anterior, `v1` (`ef43ad7`, 02/10/2026), es la del prototipo de la carpeta `V1/` y no es la que vale. Si apareciera un defecto después de la etiqueta, se crearía una etiqueta nueva (por ejemplo `v1.0.1`) y la entrega declararía cuál vale. El commit exacto lo muestra `git show v1.0.0` |
| En producción | https://detail-control.vercel.app (Vercel). Base de datos, autenticación y API en Supabase Cloud |

### 1.2 Versiones exactas del entorno

| Herramienta | Versión |
|---|---|
| Node.js | 22.x (probado con 22.23.5; el CI usa `node-version: 22`; `package.json` exige 20 o superior) |
| npm | 10.9.9 (la que trae Node 22.23.5) |
| PostgreSQL | 17 (`major_version = 17` en `supabase/config.toml`, igual que el proyecto de producción en Supabase). No se instala aparte: lo levanta la CLI de Supabase en Docker |
| Supabase CLI | 2.122.1 (dependencia de desarrollo; se usa con `npx supabase`) |
| Docker | Docker Desktop o Docker Engine con Docker Compose, corriendo (lo usa `npx supabase start`) |

### 1.3 Caso de uso vertical: fraccionamiento de un bidón con conservación de cantidades

GFK compra insumos a granel (Shampoo, Citrolimp, Mekasil, BB), los fracciona en envases de 1 a 120 L y los usa en los servicios del taller. Sin un sistema no sabe con exactitud cuánto stock le queda, cuánto se pierde ni cuánto insumo gasta cada servicio. DETAIL CONTROL resuelve eso con una regla central: **ningún mililitro aparece ni desaparece sin quedar registrado**.

Un usuario elige un insumo, una o varias presentaciones y la cantidad de unidades, ve cuánto se descuenta y cuánto quedará, y confirma. El recorrido atraviesa las cuatro capas:

| Estación | Dónde vive |
|---|---|
| Interfaz | `V2/src/app/(app)/fraccionar/page.tsx` y `V2/src/components/FormFraccionar.tsx` («Motor de Fraccionamiento») |
| Aplicación | `V2/src/app/acciones.ts` → Server Action `fraccionar()`, que solo lee el formulario y llama a la base por RPC |
| Lógica y persistencia (regla de conservación) | `V2/supabase/migrations/20261125000002_pestanas.sql` → función PL/pgSQL `public.fraccionar()`; tabla `movimiento` y trigger `trg_movimiento_invariantes` (`20261115000002_reglas.sql`) |
| Retorno a la interfaz | `V2/src/app/(app)/page.tsx` («Dashboard General», vista `v_saldo_insumo`) y `V2/src/app/(app)/movimientos/page.tsx` («Movimientos», vista `v_movimiento`) |

**Requisitos:** RF-01 (fraccionamiento), RF-04 (saldo calculado) y RF-05 (inmutabilidad). **Regla de negocio:** las líneas de una operación suman 0: lo que sale del granel es exactamente lo que entra en las presentaciones más la merma declarada, y el saldo a granel nunca queda negativo.

### 1.4 Decisión arquitectónica probada y reglas vigentes

Es un **monolito modular en capas**, cliente-servidor, desplegado sobre servicios gestionados (serverless): presentación en Next.js (React) para computadora y celular; aplicación en Server Actions de Next.js en Vercel; datos y dominio en PostgreSQL sobre Supabase. Es un solo cliente, con pocos usuarios y un equipo de una persona: los microservicios agregarían complejidad sin beneficio. Se priorizó la **integridad del dato** por encima del rendimiento, porque el volumen de un taller es bajo; la disponibilidad se delega en Vercel y Supabase Cloud.

La decisión clave es que **las reglas viven en la base de datos**, no en la interfaz: ni la pantalla, ni la API, ni alguien con SQL directo pueden saltearlas.

- **Flujo de una acción** (fraccionar un bidón): el navegador envía el formulario; el middleware (`src/middleware.ts`) valida la sesión contra Supabase Auth y, si no hay, redirige a `/login`; la Server Action `fraccionar()` llama por RPC a `public.fraccionar()` con la sesión del usuario; la función valida la sesión y la organización, **bloquea la fila del insumo** (`FOR UPDATE`) para que dos operaciones simultáneas sobre el mismo insumo esperen en fila, verifica el saldo e inserta las líneas en `movimiento` con el mismo `operacion_id`. Después corren los triggers: uno fija el `usuario_id` a partir de la sesión; otro verifica las invariantes (las líneas suman 0, unidades × capacidad = cantidad y el saldo a granel no queda negativo); otro impide modificar o borrar movimientos. Todo ocurre en **una sola transacción**: si algo falla, no se guarda nada. Next.js revalida las pantallas y el cambio se ve enseguida en el Dashboard y en Movimientos.
- **`movimiento` es un libro mayor.** Cada línea afecta un compartimento (`GRANEL`, `PRESENTACION` o `MERMA`) y las líneas de una operación se agrupan por `operacion_id`. Fraccionar 5.000 mL en 4 botellas de 1 L con 1.000 mL de merma genera −5.000 en GRANEL, +4.000 en PRESENTACION (4 unidades de 1 L) y +1.000 en MERMA: suman 0.
- **Sin decimales:** las cantidades son enteros (`bigint`) en mL o g y el dinero, enteros en centavos. La conversión a litros ocurre solo al mostrar.
- **Saldo derivado:** el saldo no se guarda; lo calculan las vistas `v_saldo_insumo` y `v_saldo_presentacion` sumando movimientos, así que no puede desincronizarse.
- **Inmutabilidad (RF-05):** los triggers rechazan `UPDATE`, `DELETE` y `TRUNCATE` incluso para el dueño de la tabla y la clave `service_role`. Una operación se corrige con una **compensación** que referencia al original; un índice único impide compensar dos veces la misma línea. Lo mismo vale para los servicios y los conteos.
- **Restricciones CHECK y claves foráneas compuestas:** un ingreso exige proveedor y costo, la merma exige motivo, la capacidad de una presentación solo puede ser de 1, 5, 20, 60 o 120 L, y las claves `(id, organizacion_id)` impiden que un movimiento apunte a un insumo de otra organización.
- **Conteo físico (RF-09 y RF-10):** `registrar_conteo()` compara lo contado con el saldo del sistema y, si difieren, registra un movimiento `AJUSTE` atribuido al usuario que iguala el saldo a lo contado; un conteo igual queda registrado sin movimiento.
- **Servicios con receta (RF-15 y RF-16):** `registrar_servicio()` guarda el servicio (nombre y tipo de vehículo) y descuenta cada insumo de la receta con un movimiento `CONSUMO`, todo o nada: si uno no alcanza, no se descuenta ninguno.
- **Punto de pedido (RF-13):** `definir_punto_pedido()` fija un umbral en mL por insumo; el Dashboard muestra «Reponer» cuando el granel llega a ese umbral.
- **Baja lógica:** un insumo eliminado queda con `activo = false` y conserva su saldo e historial; volver a agregarlo con el mismo nombre lo reactiva (`agregar_insumo()`).
- **Cuentas y roles:** Administrador y Operario operan el stock por igual; solo el administrador aprueba o rechaza cuentas. Toda cuenta nueva queda como solicitud de acceso y no ve ni opera nada hasta que la aprueban; lo impone la base (trigger sobre `auth.users`, tabla `solicitud_acceso` y políticas por fila), no la interfaz. La primera cuenta del sistema entra directamente como administradora. El inicio con Google se quitó a pedido del cliente.
- **Pruebas automatizadas:** `V2/tests/db/motor.test.ts` (conservación, merma con motivo, inmutabilidad y aislamiento, con intentos de violar cada regla por SQL directo), `V2/tests/db/pestanas.test.ts` (Motor de Fraccionamiento, conteo y ajuste, servicios con receta, punto de pedido, alta y baja de insumos) y `V2/tests/db/cuentas.test.ts` (aprobación, roles y puesta en marcha).
- **Alternativas evaluadas y motivo de la elección:** Capítulo IX del informe final (matriz ponderada de arquitecturas) y Anexo III (ADR 1 a 6).

> **Limitaciones conocidas y qué cedería primero si la carga creciera diez veces.** Diez veces más usuarios en un taller sigue siendo poco; el riesgo real aparece con muchas organizaciones y años de movimientos acumulados. (1) **El cálculo del saldo:** las vistas suman todos los movimientos de cada insumo en cada consulta y el trigger de invariantes recalcula el saldo en cada inserción; es el diseño más seguro, pero su costo crece con el historial. Mejora: saldos periódicos (instantáneas o vistas materializadas por período) y sumar solo los movimientos posteriores, sin perder la regla de que el saldo se deriva de los movimientos. (2) **La contención por bloqueos:** `FOR UPDATE` sobre el insumo hace que varios operarios fraccionando el mismo insumo esperen en fila. (3) **Los límites del plan gratuito de Supabase:** conexiones, correos por hora (hace falta un SMTP propio) y el pooling de conexiones desde las funciones serverless. (4) **Pantallas sin paginar:** Movimientos carga los últimos 300 registros con un límite fijo; haría falta paginación o filtros por fecha.

### 1.5 Dónde está la documentación

Vive en el repositorio `PIF_GeneyroLautaro` y en la carpeta AE4 del Portafolio Digital:

| Documento | Ubicación |
|---|---|
| Archivo de lectura de DETAIL CONTROL (alcance, arquitectura, base de datos, uso, pruebas y seguridad) | `V2/README.md` |
| Archivo de lectura del repositorio (qué hay en `V1/` y `V2/` y los dos flujos de CI) | `README.md` |
| Migraciones (esquema, reglas, seguridad, cuentas, pestañas e insumos) | `V2/supabase/migrations/` |
| Datos de prueba (solo local y CI) | `V2/supabase/seed.sql` |
| Flujo de integración continua | `.github/workflows/detail-control.yml` |
| Informe final (Capítulos I a XIII y Anexos I a III) | Portafolio AE4 · `AE4_Geneyro_Informe.pdf` |
| Catálogo de requisitos vigente (v4, con el estado de construcción) | Portafolio AE4 · `Portafolio/Instrumentos/20261122_CatalogoRequisitos_Geneyro_v4.xlsx` |
| Bitácora individual acumulada (AE1, AE2 y AE4) con la declaración de IA | Portafolio AE4 · `AE4_Geneyro_Bitacora.pdf` |
| Evidencia de integración continua y constancia de verificación del manual | Portafolio AE4 · `Portafolio/20261122_EvidenciaCI_VerificacionManual_Geneyro_v1.pdf` |

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Lenguajes | TypeScript, SQL y PL/pgSQL | TypeScript 5.9.3 |
| Runtime | Node.js | 22.x (probado con 22.23.5) |
| Framework | Next.js (App Router) + React | 14.2.35 / 18.3.1 |
| Base de datos | PostgreSQL sobre Supabase (también provee Auth y la API) | 17 |
| Cliente de Supabase | `@supabase/supabase-js` + `@supabase/ssr` | 2.119.0 / 0.12.7 |
| Herramienta de base | Supabase CLI | 2.122.1 |
| Íconos | `lucide-react` | 0.460.0 |
| Tests | Vitest + PGlite (PostgreSQL en memoria) | 5.1.0 / 0.5.16 |
| Análisis estático | ESLint (`eslint-config-next`) | 8.57.1 |
| Autenticación | Supabase Auth: correo y contraseña con bcrypt, sesión en cookies | No aplica |
| Despliegue | Vercel (aplicación) y Supabase Cloud (base, Auth y API) | No aplica |
| CI | GitHub Actions | No aplica |

**Criterios de elección:** un solo lenguaje en el frontend y el backend; Supabase resuelve autenticación, contraseñas con bcrypt y seguridad por fila sin escribir un backend propio; PostgreSQL ofrece transacciones, restricciones y triggers, imprescindibles para la regla de conservación; Vercel da despliegue automático por rama con HTTPS incluido; todo tiene planes gratuitos para el desarrollo (la operación comercial requiere el plan Pro de Vercel, ver el Capítulo X del informe).

---

## 3. Requisitos previos

Funciona en Windows, macOS y Linux. Necesitás tener instalado:

| Programa | Versión | Cómo verificar |
|---|---|---|
| Git | 2.x | `git --version` |
| Node.js | 22.x (probado con 22.23.5; mínimo 20) | `node --version` |
| npm | 10.x (probado con 10.9.9) | `npm --version` |
| Docker | Docker Desktop (Windows y macOS) o Docker Engine (Linux), **abierto y corriendo** | `docker info` |

Además, conexión a internet la primera vez: `npx supabase start` descarga las imágenes de Supabase (unos 2 GB) y la compilación descarga la tipografía Inter.

> No hace falta ninguna cuenta externa (Supabase Cloud, Vercel ni correo) para correr el caso de uso vertical: todo corre en tu máquina. PostgreSQL tampoco se instala aparte: lo levanta Supabase en Docker.

---

## 4. Instalación paso a paso

Todos los comandos se escriben en una terminal. En Windows sirve Git Bash o PowerShell.

### 4.1 Clonar el repositorio

```bash
git clone https://github.com/Geneyro/PIF_GeneyroLautaro.git
cd PIF_GeneyroLautaro
```

Queda así:

```
PIF_GeneyroLautaro/
├── V1/              prototipo v1 (no se usa en este manual)
├── V2/              DETAIL CONTROL
└── .github/workflows/
```

Pasar el repositorio a la etiqueta de la entrega, `v1.0.0` (la versión que describe este manual), y entrar a la carpeta de la aplicación:

```bash
git checkout v1.0.0
git describe --tags
cd V2
```

`git describe --tags` tiene que imprimir `v1.0.0`. Git avisa que quedó en «detached HEAD» (cabeza separada): es lo esperado al pararse en una etiqueta y no hay que hacer nada. `git show v1.0.0` muestra el commit exacto (`e6ffa99`). No usar `v1`: es la del prototipo de la carpeta `V1/` (02/10/2026).

### 4.2 Instalar dependencias

```bash
npm ci
```

`npm ci` instala exactamente las versiones de `package-lock.json`, todo dentro de `V2/` (incluida la CLI de Supabase). Puede mostrar avisos de `npm audit`; no impiden seguir.

### 4.3 Levantar la base de datos local

Con Docker abierto:

```bash
npx supabase start
```

**Esperado** (la primera vez tarda varios minutos por la descarga):

```
Started supabase local development setup.

         API URL: http://127.0.0.1:55321
          DB URL: postgresql://postgres:postgres@127.0.0.1:55322/postgres
      Studio URL: http://127.0.0.1:55323
     Mailpit URL: http://127.0.0.1:55324
 Publishable key: sb_publishable_...
      Secret key: sb_secret_...
```

Según la versión de la CLI, las claves pueden aparecer como `anon key` y `service_role key`: son las mismas. Este comando crea una base PostgreSQL 17 vacía, aplica las siete migraciones y carga `seed.sql`. Los puertos son 55320 a 55329 para no chocar con otros proyectos.

### 4.4 Configurar variables de entorno

Copiar el archivo de ejemplo:

```bash
cp .env.example .env.local
```

Abrir `.env.local` y completar las tres variables con los valores que mostró `npx supabase start` (se vuelven a ver con `npx supabase status`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key o anon key>
SUPABASE_SERVICE_ROLE_KEY=<Secret key o service_role key>
```

`.env.example` lista todas las variables que lee la aplicación, que son estas tres. `SUPABASE_SERVICE_ROLE_KEY` es **solo de servidor**: nunca lleva el prefijo `NEXT_PUBLIC_` ni se importa desde código de cliente; se usa únicamente para crear las cuentas del formulario «Crear cuenta». `.env.local` no se versiona: ninguna clave queda en el repositorio.

> En PowerShell, si `cp` no funciona, usar `Copy-Item .env.example .env.local`.

### 4.5 Crear el esquema y cargar datos de demo

`npx supabase start` ya los aplicó. Para reconstruir la base desde cero en cualquier momento:

```bash
npx supabase db reset
```

**Esperado:**

```
Resetting local database...
Initialising schema...
Applying migration 20261115000001_esquema.sql...
Applying migration 20261115000002_reglas.sql...
Applying migration 20261115000003_seguridad.sql...
Applying migration 20261116000001_cuentas_y_roles.sql...
Applying migration 20261125000001_tipos_taller.sql...
Applying migration 20261125000002_pestanas.sql...
Applying migration 20261126000001_insumos.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch main.
```

`seed.sql` carga un escenario de demostración con datos inventados: dos organizaciones (*GFK Estética Vehicular (pruebas)* y *Otra organización (pruebas)*, para comprobar el aislamiento de RNF-04), tres usuarios (4.6) y los seis insumos de GFK (Mekasil Tradicional, Mekasil Ultra, BB Tradicional, BB Ultra, Citrolimp y Shampoo Siliconado) con saldo 0 y presentaciones de 1, 5 y 20 L. Los insumos que se agregan después desde la pestaña Insumos reciben las cinco presentaciones (1, 5, 20, 60 y 120 L). Solo para desarrollo y CI: **`seed.sql` nunca se aplica a producción** (`npx supabase db push` aplica solo las migraciones).

El esquema se prueba desde cero en cada corrida del canal de construcción (sección 9), que levanta Supabase local y aplica las siete migraciones sobre una base vacía. Las migraciones son archivos SQL versionados en `supabase/migrations/`; las reglas de negocio (funciones PL/pgSQL, triggers, vistas y políticas por fila) están en ellas.

### 4.6 Usuarios de demostración

Todos son datos inventados (dominios `.test`). Nunca cargarlos en la base de producción.

| Rol | Usuario | Contraseña de prueba | Organización | Cómo se crea |
|---------|---------|--------|-------|-----|
| Administradora | `yanina@gfk.test` | `detail-control-pruebas` | GFK Estética Vehicular (pruebas) | `seed.sql` |
| Operario | `guido@gfk.test` | `detail-control-pruebas` | GFK Estética Vehicular (pruebas) | `seed.sql` |
| Administrador ajeno | `ajeno@otra.test` | `detail-control-pruebas` | Otra organización (pruebas) | `seed.sql` |

En producción no hay usuarios de demostración: la primera cuenta que se registra en `/registro` entra como administradora de la organización y las siguientes esperan su aprobación.

---

## 5. Ejecutar la aplicación

Con la base local corriendo (4.3), en la carpeta `V2/`:

```bash
npm run dev
```

**Esperado:**

```
  ▲ Next.js 14.2.35
  - Local:        http://localhost:3100
  - Environments: .env.local

 ✓ Ready in ...
```

Abrir **http://localhost:3100** en el navegador. Para detenerla, `Ctrl+C` en la terminal; para detener la base local, `npx supabase stop` (los datos se conservan hasta el próximo `npx supabase db reset`).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (puerto 3100) |
| `npm run build` / `npm run start` | Compilación y servidor de producción (puerto 3100) |
| `npm run lint` | Análisis estático |
| `npm run typecheck` | Chequeo de tipos |
| `npm test` | Pruebas automatizadas |

---

## 6. Prueba del caso de uso vertical (punta a punta)

### 6.0 Prueba de humo

Con la base local y la aplicación corriendo (secciones 4.3 y 5):

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3100/movimientos
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/login
```

**Esperado:** el primero devuelve `307 http://localhost:3100/login` (sin sesión, toda pantalla redirige al inicio de sesión); el segundo, `200`. En el navegador, http://localhost:3100 muestra **Iniciar sesión** y se puede ingresar con `yanina@gfk.test` / `detail-control-pruebas`: se abre el **Dashboard General** con los seis insumos de GFK en 0 mL.

### 6.1 Ingresar y ver el menú

1. En http://localhost:3100 ingresar con `yanina@gfk.test` y `detail-control-pruebas`.
2. El menú lateral muestra las cinco pestañas: **Dashboard General**, **Motor de Fraccionamiento**, **Insumos**, **Servicios** y **Movimientos**.

### 6.2 Recorrido del bidón de 5 L

| # | Pestaña | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Insumos | Punto de pedido de Citrolimp: `4000` mL | Aparece la alerta «Reponer Citrolimp» (saldo 0) |
| 2 | Insumos | Conteo físico de Citrolimp: `5000` → **Confirmar conteo** | «Stock ajustado +5.000 mL». Dashboard: 5.000 mL a granel, estado *Normal* |
| 3 | Motor de Fraccionamiento | Citrolimp, presentación *1 L* × `2` | Mientras se carga: «Se descuenta −2.000 mL · Quedará 3.000 mL». Al confirmar, el Dashboard muestra 3.000 mL y la alerta *Reponer Citrolimp* |
| 4 | Servicios | «Lavado premium», «SUV», Citrolimp `100` mL | El Dashboard baja a 2.900 mL; Movimientos muestra el consumo con el servicio y el usuario |
| 5 | Insumos | Conteo físico de Citrolimp: `2850` | «Stock ajustado −50 mL»; el ajuste queda atribuido a Yanina en Movimientos |
| 6 | Movimientos | **Anular** una operación, con motivo | Se agrega una compensación; el original queda intacto y marcado como anulado |

### 6.3 Validación: la regla vive en la base, no en la pantalla

1. En **Motor de Fraccionamiento**, pedir más de lo que hay a granel (por ejemplo Citrolimp, *20 L* × `1` con 2.850 mL).
2. **Esperado:** «No hay stock suficiente de Citrolimp: hay 2.850 mL a granel y el fraccionamiento necesita 20.000 mL». No se registra nada.

Para comprobar que la regla no depende de la pantalla, las pruebas automáticas (sección 7) intentan insertar, modificar y borrar movimientos por SQL directo y verifican que la base los rechaza.

### 6.4 Verificar que el dato persiste en PostgreSQL

```bash
psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres" -c "SELECT tipo, compartimento, unidades, cantidad_base, registrado_en FROM public.movimiento ORDER BY id DESC LIMIT 8;"
```

Si no tenés `psql`, usar el editor SQL de Supabase Studio (http://127.0.0.1:55323). **Esperado:** las líneas del recorrido, con `AJUSTE`, `FRACCIONAMIENTO` (−2.000 en `GRANEL` y +2.000 en `PRESENTACION` con 2 unidades), `CONSUMO` (−100) y `COMPENSACION`. Si se reinicia la aplicación y se recarga el Dashboard, el saldo sigue siendo el mismo.

### 6.5 Recorrido de los casos de uso Must

Son los requisitos de prioridad Must del catálogo v4 (más RNF-04). La columna «Estado» dice si la versión `v1.0.0` los cubre por la interfaz, solo en la base o no los cubre; la cobertura con pruebas automatizadas está en la sección 7. Salvo que se diga otra cosa, con la administradora de demo (`yanina@gfk.test`).

| Requisito | Estado en v1.0.0 | Qué hacer | Esperado |
|-----|------|-----|------|
| RF-01 Fraccionamiento | Interfaz | Pasos 3 de 6.2 y 6.3 | Descuenta del granel lo que entra a las presentaciones; rechaza lo que excede el saldo |
| RF-02 Alta de insumo | Interfaz | Insumos > agregar «Cera Líquida», unidad mL | El insumo aparece con las presentaciones de 1, 5, 20, 60 y 120 L |
| RF-03 Ingreso con proveedor y costo | Solo en la base (`registrar_ingreso()`); la pantalla se quitó a pedido del cliente | Prueba `tests/db/motor.test.ts` | El ingreso se convierte a mL y exige proveedor y costo |
| RF-04 Saldo calculado | Interfaz | Dashboard General después de cada paso de 6.2 | El saldo a granel es la suma de los movimientos |
| RF-05 Inmutabilidad | Interfaz | Paso 6 de 6.2 | La corrección es una compensación; el original no cambia |
| RF-06 Merma con motivo | Solo en la base (`registrar_fraccionamiento()`); el Motor de Fraccionamiento opera sin merma | Prueba `tests/db/motor.test.ts` | Una merma sin motivo se rechaza |
| RF-08 Venta | No incluido en v1.0.0 | No aplica | Hoja de ruta, Capítulo XI del informe |
| RF-09 Conteo y desvío | Interfaz (desvío en mL, sin valorizar) | Pasos 2 y 5 de 6.2 | Muestra la diferencia entre lo contado y el saldo |
| RF-10 Ajuste atribuido | Interfaz | Pasos 2 y 5 de 6.2 y Movimientos | Ajuste `AJUSTE` con el usuario que lo hizo |
| RF-11 Costo medio por litro | No incluido en v1.0.0 | No aplica | Hoja de ruta |
| RF-13 Punto de reposición | Parcial: umbral manual por insumo, sin plazo de reposición | Paso 1 de 6.2 | Alerta «Reponer» en el Dashboard |
| RF-15 Servicio con receta | Parcial: receta por servicio prestado, sin precio | Paso 4 de 6.2 | El servicio guarda nombre, vehículo y receta |
| RF-16 Servicio prestado y consumo | Interfaz | Paso 4 de 6.2 | Descuenta cada insumo de la receta, todo o nada |
| RF-17 Costo y margen del servicio | No incluido en v1.0.0 | No aplica | Hoja de ruta |
| RF-21 Importación desde planilla | No incluido en v1.0.0 | No aplica | Hoja de ruta |
| RF-23 Autenticación y atribución | Interfaz | 6.0, y entrar como `guido@gfk.test` y registrar un servicio | Sin sesión no se entra; Movimientos muestra quién hizo cada operación |
| RNF-02 HTTPS | Producción | `curl -sI https://detail-control.vercel.app/login` | Incluye `strict-transport-security`; `http://` responde 308 hacia `https://` |
| RNF-04 Organizaciones | Interfaz y base | Entrar como `ajeno@otra.test` | Ve su organización vacía: ningún insumo ni movimiento de GFK |

---

## 7. Ejecutar los tests

### 7.1 Pruebas automatizadas

```bash
npm test
```

No necesitan Docker ni conexión: aplican las migraciones reales sobre un PostgreSQL en memoria (PGlite). `tests/db/soporte/supabase-simulado.sql` reproduce lo mínimo de la plataforma Supabase (roles de la API y `auth.uid()`).

**Esperado:**

```
 Test Files  6 passed | 2 skipped (8)
      Tests  85 passed | 10 skipped (95)
```

| Archivo | Pruebas | Qué verifica |
|---|---|---|
| `tests/db/motor.test.ts` | 32 | Conservación de cantidades, merma con motivo, ingreso, saldos, inmutabilidad, compensación y aislamiento entre organizaciones, con intentos de violar cada regla por SQL directo |
| `tests/db/pestanas.test.ts` | 19 | Motor de Fraccionamiento, conteo y ajuste, servicios con receta (todo o nada), punto de pedido, catálogo inicial de GFK y alta y baja de insumos con las cinco presentaciones |
| `tests/db/cuentas.test.ts` | 16 | Solicitudes de acceso, aprobación, rechazo, roles y puesta en marcha, incluidos los intentos de saltear la aprobación |
| `tests/unidad/cuentas.test.ts` | 8 | Validación del registro y de las contraseñas |
| `tests/unidad/formato.test.ts` | 7 | Lectura y formato de cantidades y dinero sin flotantes |
| `tests/unidad/registro.test.ts` | 3 | Armado del libro de auditoría unificado |
| `tests/api/extremo-a-extremo.test.ts` y `tests/api/cuentas.test.ts` | 4 + 6 (omitidas en local) | El caso del bidón contra Supabase Auth y la API con dos usuarios; registro, correo duplicado, aprobación, recuperación y cambio de contraseña |

Las 10 pruebas de `tests/api/` corren solo si están definidas `PRUEBAS_SUPABASE_URL`, `PRUEBAS_SUPABASE_ANON_KEY` y `PRUEBAS_SUPABASE_SERVICE_ROLE_KEY`; el canal de construcción las define con el Supabase local del runner y entonces corren las 95. Para correrlas a mano, con la base local levantada (4.3):

```bash
export PRUEBAS_SUPABASE_URL=http://127.0.0.1:55321
export PRUEBAS_SUPABASE_ANON_KEY=<Publishable key>
export PRUEBAS_SUPABASE_SERVICE_ROLE_KEY=<Secret key>
npm test
```

**Nunca apuntarlas a producción.**

### 7.2 Chequeo de tipos, lint y build

Corren en el canal de construcción y se pueden repetir a mano:

```bash
npm run lint && npm run typecheck && npm run build
```

**Esperado:** `✔ No ESLint warnings or errors`, el chequeo de tipos sin salida y la compilación con todas las rutas. No tiene que imprimir errores.

---

## 8. Declaración de uso de IA

En este proyecto se usó **Claude Code** (Anthropic) como asistente de programación, con los modelos **Claude Opus 5.5** y **Claude Fable 5.2**. Toda decisión de dominio (entidades, reglas, alcance, iteraciones y qué se quita a pedido del cliente) la tomó el autor; el detalle de cada decisión, las alternativas descartadas y en qué intervino la IA está en la Bitácora Individual acumulada (`AE4_Geneyro_Bitacora.pdf`, elemento 6 de cada entrada y tabla de declaración de IA) y en `V2/README.md`.

También se usó **Claude** (chat, Anthropic) sobre documentos (el informe final, los instrumentos 36 a 40, el libro de trabajo, las actas, la bitácora y este manual) y para ejecutar, con el navegador del autor, la búsqueda marcaria en el INPI y en NIC Argentina; ese uso está declarado en la bitácora y en el Anexo III del informe.

### 8.1 Cifras (calculadas con `git log`)

Corte: commit `e6ffa99` de `main` (26/11/2026), el de la etiqueta `v1.0.0`. No cuentan los commits posteriores.

| Concepto | Cantidad |
|---|---|
| Commits totales | 19 |
| Merges | 0 |
| Commit inicial creado desde la web de GitHub (el autor, 01/10/2026) | 1: `cf35177` |
| **Commits hechos con Claude Code** | **18** |
| de ellos, con la línea `Co-Authored-By: Claude …` | 18 |
| de ellos, sin la línea | 0 |

La línea de coautoría, por modelo:

| Modelo | Commits | Fechas | Carpeta |
|--------|---|-----|-----|
| `Co-Authored-By: Claude Opus 5.5` | 4 | 01 y 02/10/2026 | `V1/` (prototipo, etiqueta `v1`) |
| `Co-Authored-By: Claude Fable 5.2` | 7 | 15/11/2026 | `V2/` |
| `Co-Authored-By: Claude Opus 5.5` | 7 | 16, 25 y 26/11/2026 | `V2/` y reorganización del repositorio |

Comandos usados:

```bash
git rev-list --count HEAD
git rev-list --merges --count HEAD
git log --format='%B' | grep -i "^Co-Authored-By: Claude" | sort | uniq -c
git log --no-merges -i --invert-grep --grep='^Co-Authored-By: Claude' --oneline
```

### 8.2 Identidad de los commits

Los 4 commits de octubre llevan como autor «Lautaro Geneyro». Los 14 commits del 15 al 26/11/2026 figuran con la identidad de Git «Tu Nombre», que es la configuración por defecto del equipo donde se hicieron (no se había configurado `user.name`): los hizo Claude Code a pedido del autor, y cada uno lleva su línea `Co-Authored-By` con el modelo de la sesión. No se reescribió el historial para no alterar los hashes que cita la documentación.

### 8.3 Cambios de la AE4 hechos con Claude Code

| Fecha | Cambio | Commits | Modelo |
|----|----------|--------|-----|
| 15/11/2026 | Iteración 1 de DETAIL CONTROL: esquema, reglas, seguridad, despliegue en Vercel y PostgreSQL 17 | `caecf08`, `aa47dce`, `b71f1fa`, `03b755f`, `8b718c6`, `1bff38e`, `03343af` | Claude Fable 5.2 |
| 16/11/2026 | Registro con roles y aprobación, recuperación de contraseña; repositorio reorganizado en `V1/` y `V2/` | `a3a6a54`, `84e7bf0`, `150e3c7` | Claude Opus 5.5 |
| 25/11/2026 | Cinco pestañas, tema claro, conteo físico con ajuste, servicios con receta, punto de pedido y libro de movimientos | `e67aec4` | Claude Opus 5.5 |
| 26/11/2026 | Pestaña Insumos, presentaciones de 1 a 120 L y sin la sección Gestión (a pedido del cliente) | `c83695b` | Claude Opus 5.5 |
| 26/11/2026 | Sin inicio de sesión con Google (a pedido del cliente) | `bb1d96e` | Claude Opus 5.5 |
| 26/11/2026 | CI: tres intentos para levantar Supabase local | `e6ffa99` | Claude Opus 5.5 |

### 8.4 Terceros: servicios y librerías

Ninguno recibe datos de GFK en la instalación local de este manual.

| Tercero | Para qué se usa | Hace falta para el manual |
|---|---|---|
| Supabase (Cloud y CLI) | PostgreSQL de producción, Auth (contraseñas con bcrypt) y API; en local, la base en Docker | Solo la CLI y Docker (local) |
| Vercel | Hosting de la aplicación con HTTPS y vistas previas por rama | No |
| Docker | Contenedores de Supabase local | Sí |
| Google Fonts (`next/font`) | Tipografía Inter, descargada al compilar | Solo la descarga al compilar |
| GitHub y GitHub Actions | Repositorio y canal de construcción | Solo para clonar |
| Anthropic (Claude Code y Claude) | Asistente de programación y de redacción (sección 8) | No |

Las librerías de npm están fijadas en `V2/package-lock.json` (se instalan con `npm ci`); cada una se distribuye con la licencia de su paquete. Las principales están en la sección 2. El repositorio no tiene archivo de licencia: rigen todos los derechos reservados del autor. El uso de IA es el declarado en esta sección 8 y coincide con lo que dicen las entradas de la bitácora (Herramienta auxiliar, elemento 6).

---

## 9. Canal de construcción (CI)

Cada push o pull request que cambia archivos de `V2/` corre GitHub Actions con el flujo `.github/workflows/detail-control.yml`, sin secretos de GitHub. El registro de corridas está en:

- https://github.com/Geneyro/PIF_GeneyroLautaro/actions/workflows/detail-control.yml
- Corrida de la versión `v1.0.0`: «DETAIL CONTROL» #21 sobre `e6ffa99` en `main`, exitosa (26/11/2026, 2 min 19 s): https://github.com/Geneyro/PIF_GeneyroLautaro/actions/runs/45749157161

| Paso | Qué hace |
|---|---|
| 1 | `npm ci` con Node 22 |
| 2 | `npm run lint` y `npm run typecheck` |
| 3 | `npx supabase start` (hasta tres intentos): aplica las siete migraciones y `seed.sql` sobre una base vacía |
| 4 | Exporta las claves del Supabase local del runner (valores de desarrollo, no secretos) |
| 5 | `npm test`: las 95 pruebas, incluidas las 10 de `tests/api/` |
| 6 | Verifica que todas las contraseñas de `auth.users` estén guardadas con bcrypt |
| 7 | `npm run build` |
| 8 | Con `npm run start` y `curl`: sin sesión, `/`, `/fraccionar`, `/insumos`, `/servicios`, `/movimientos` y `/restablecer` redirigen a `/login`; `/login`, `/registro` y `/recuperar` responden 200; el inicio de sesión no ofrece Google |

El prototipo de `V1/` tiene su propio flujo (`.github/workflows/ci.yml`) y no interviene.

---

## 10. Build de producción

```bash
npm run build     # genera .next/
npm run start     # sirve la compilación en http://localhost:3100
```

Despliegue en Vercel: proyecto propio con **Root Directory = `V2`**, las tres variables de la sección 4.4 cargadas en *Project → Settings → Environment Variables* (Production y Preview) con los valores del proyecto de Supabase Cloud. Cada rama genera una vista previa y `main` despliega a producción. Las migraciones se aplican al proyecto remoto con:

```bash
npx supabase login
npx supabase link --project-ref <reference-id>
npx supabase db push --dry-run   # muestra qué se va a aplicar
npx supabase db push
```

En Supabase → *Authentication → URL Configuration* deben figurar la URL del sitio (`https://detail-control.vercel.app`) y, en *Redirect URLs*, la de producción, la de las vistas previas y `http://localhost:3100/**`. Para que el correo de recuperación llegue a cualquier usuario hace falta un SMTP propio (por ejemplo, Resend con un dominio verificado): el servicio incluido en Supabase solo entrega a los miembros del proyecto y con pocos correos por hora.

Verificación de HTTPS (RNF-02):

```bash
curl -sI http://detail-control.vercel.app/            # 308 hacia https://
curl -sI https://detail-control.vercel.app/login      # incluye strict-transport-security
```

Las cabeceras de seguridad están en `next.config.mjs`: `Strict-Transport-Security` (dos años, con subdominios), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy`.

---

**Última actualización:** 2026-11-26 (versión de entrega `v1.0.0`; ver 1.1)
