# DETAIL CONTROL

Sistema web para el control del consumo de insumos y el costeo de servicios en centros de estética
vehicular. Cliente piloto: **GFK Estética Vehicular** (Posadas, Misiones).

GFK compra insumos a granel, los fracciona en presentaciones menores y los vende o consume. El
sistema **conserva las cantidades**: un fraccionamiento solo se confirma si lo que sale del envase
de origen es exactamente igual a lo que entra en las presentaciones más la merma declarada.

Este proyecto es **independiente del prototipo** que vive en la raíz del repositorio: tiene sus
propias dependencias, variables de entorno, base de datos, pruebas y despliegue, y no importa nada
del prototipo.

**Estado: Iteración 1** (motor de existencias).

1. [Alcance](#1-alcance)
2. [Arquitectura](#2-arquitectura)
3. [Instalación](#3-instalación)
4. [Configuración](#4-configuración)
5. [Base de datos](#5-base-de-datos)
6. [Uso](#6-uso)
7. [Pruebas e integración continua](#7-pruebas-e-integración-continua)
8. [Despliegue y seguridad](#8-despliegue-y-seguridad)

---

## 1. Alcance

| Requisito | Qué hace | Dónde se impone |
|-----------|----------|-----------------|
| **RF-23** Autenticación | Inicio y cierre de sesión; nada funciona sin sesión; cada movimiento guarda el ID del usuario | `src/middleware.ts`, políticas de seguridad por fila, trigger `trg_movimiento_atribuir` |
| Cuentas | Registro con rol (Administrador / Operario), inicio con Google, recuperación de contraseña por correo; toda cuenta nueva espera la aprobación de un administrador | `src/lib/cuentas.ts`, `src/app/acciones.ts`, migración `cuentas_y_roles` |
| **RF-02** Catálogo | Alta de insumo con unidad base (mL o g) y presentaciones de 1, 5, 20, 60 o 120 L | `crear_insumo()`, `agregar_presentacion()` |
| **RF-03** Ingreso | Ingreso convertido a unidad base, con proveedor y costo obligatorios | `registrar_ingreso()` |
| **RF-01** Fraccionamiento | Rechaza lo que no conserva la cantidad o excede el saldo, e informa la cantidad no explicada | `registrar_fraccionamiento()`, trigger `trg_movimiento_invariantes` |
| **RF-06** Merma | La merma de un fraccionamiento exige motivo | `registrar_fraccionamiento()`, restricción `movimiento_forma_valida` |
| **RF-04** Saldo | Saldo en unidad base y equivalente por presentación; siempre es la suma de los movimientos | vistas `v_saldo_insumo`, `v_saldo_presentacion` |
| **RF-05** Inmutabilidad | Los movimientos no se editan ni se borran; se corrigen con una compensación que referencia al original | triggers `trg_movimiento_bloquear_*`, `compensar_operacion()` |
| **RNF-02** HTTPS | Cabecera HSTS y cabeceras de seguridad | `next.config.mjs` |
| **RNF-04** Organizaciones | Toda tabla lleva `organizacion_id`; un usuario solo ve su organización | políticas de seguridad por fila |

Reglas que atraviesan todo el sistema:

- Las cantidades son **enteros** en mL o g (`bigint`). La conversión a litros ocurre solo al mostrar.
- El dinero es un **entero en centavos** de peso argentino. No hay decimales ni flotantes.
- El saldo **no se guarda**: se calcula sumando movimientos.
- Las reglas viven **en la base de datos**. La interfaz y la API no pueden saltearlas.

Pendiente para próximas iteraciones: venta (RF-08), importación desde Excel (RF-21), conteo físico y
desvío (RF-09), y el resto de la especificación.

## 2. Arquitectura

```
 Navegador (computadora / celular)
        │  HTTPS
        ▼
 Vercel · Next.js 14 (App Router)
   ├─ src/middleware.ts ....... exige sesión en toda ruta
   ├─ src/app/(app)/ .......... pantallas: Saldos, Fraccionar, Ingresos, Catálogo, Movimientos
   ├─ src/app/login/ .......... inicio de sesión
   └─ src/app/acciones.ts ..... Server Actions → funciones de la base
        │  HTTPS · clave pública + sesión del usuario
        ▼
 Supabase · PostgreSQL 17
   ├─ Supabase Auth ........... usuarios (sin registro público)
   ├─ funciones PL/pgSQL ...... únicas vías de escritura
   ├─ triggers ................ atribución, inmutabilidad y conservación
   ├─ políticas por fila ...... solo usuarios autenticados, solo su organización
   └─ vistas .................. saldos = suma de movimientos
```

```
detail-control-system/
├── src/
│   ├── app/                    Rutas, Server Actions y estilos
│   ├── components/             Formularios y navegación
│   ├── lib/                    Lecturas, formato (enteros) y clientes de Supabase
│   └── middleware.ts
├── supabase/
│   ├── config.toml             Configuración local (puertos 5532x, PostgreSQL 17)
│   ├── migrations/             Esquema, reglas y seguridad (SQL versionado)
│   └── seed.sql                Datos de prueba: solo local y CI, nunca producción
├── tests/
│   ├── db/                     Criterios de aceptación contra las migraciones reales
│   ├── api/                    Punta a punta contra la API de Supabase
│   └── unidad/                 Formato de cantidades y dinero
└── README.md
```

`movimiento` es un libro mayor. Cada operación agrupa sus líneas por `operacion_id` y cada línea
afecta un compartimento. Fraccionar 5.000 mL en 4 botellas de 1 L con 1.000 mL de merma genera:

| compartimento | unidades | cantidad_base |
|---------------|----------|---------------|
| GRANEL | — | −5000 |
| PRESENTACION (1 L) | 4 | +4000 |
| MERMA («derrame») | — | +1000 |

Las líneas de un fraccionamiento **suman 0**: esa es la conservación de cantidades.

## 3. Instalación

Requisitos: Node.js 20 o superior.

```bash
cd detail-control-system
npm ci
```

Todas las dependencias se instalan dentro de esta carpeta. No se instala nada en la raíz del
repositorio.

## 4. Configuración

Las variables de entorno se definen en `.env.local` para desarrollo (no se versiona) y en
*Vercel → Project → Settings → Environment Variables* (Production y Preview) para el despliegue.
`.env.example` lista los nombres con valores vacíos.

| Variable | De dónde copiarla | Dónde se usa |
|----------|-------------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → *Project Settings → API* → Project URL | Servidor y navegador |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → *Project Settings → API Keys* → clave *publishable* o *anon* | Servidor y navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → *Project Settings → API Keys* → clave *secret* o *service_role* | **Solo servidor.** Únicamente para dar de alta usuarios (`src/lib/supabase/admin.ts`) |

Ninguna clave se guarda en el repositorio. La clave `service_role` nunca lleva el prefijo
`NEXT_PUBLIC_` ni se importa desde código de cliente.

**Google OAuth.** `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` no van en Vercel: con Supabase Auth,
las credenciales de Google se guardan en Supabase, que es quien habla con Google. Para habilitar
«Continuar con Google»:

1. En Google Cloud Console → *APIs y servicios → Credenciales*, crear un **ID de cliente de OAuth**
   de tipo *Aplicación web*, con la URI de redirección autorizada
   `https://<reference-id>.supabase.co/auth/v1/callback`.
2. Completar en `.env.local` `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_ACCESS_TOKEN` y
   `SUPABASE_PROJECT_REF` (ver `.env.example`).
3. Ejecutar `npm run auth:google`. El script habilita Google en Supabase y permite que cree cuentas
   nuevas, que igual quedan pendientes de aprobación.

Mientras Google no esté habilitado, el botón muestra un aviso en lugar de fallar.

## 5. Base de datos

### Migraciones

| Archivo | Contenido |
|---------|-----------|
| `20261115000001_esquema.sql` | Tablas, tipos y restricciones |
| `20261115000002_reglas.sql` | Funciones PL/pgSQL, triggers y vistas |
| `20261115000003_seguridad.sql` | Seguridad por fila y permisos |
| `20261116000001_cuentas_y_roles.sql` | Roles, solicitudes de acceso, aprobación y puesta en marcha |

Aplicarlas al proyecto remoto (pide la contraseña de la base):

```bash
npx supabase login
npx supabase link --project-ref <reference-id>
npx supabase db push --dry-run   # muestra qué se va a aplicar
npx supabase db push
```

`db push` aplica solo las migraciones. **`seed.sql` nunca se aplica a producción.**

### Cuentas y acceso

| Pantalla | Qué hace |
|----------|----------|
| `/login` | Correo electrónico y contraseña, «¿Olvidaste tu contraseña?» y «Continuar con Google» |
| `/registro` | Nombre completo, correo, contraseña (dos veces) y rol: Administrador u Operario |
| `/recuperar` | Envía por correo un enlace seguro, de un solo uso, para restablecer la contraseña |
| `/restablecer` | Se abre desde ese enlace y guarda la contraseña nueva |
| *Usuarios* | Los administradores aprueban (con el rol que elijan) o rechazan las cuentas nuevas |

Reglas:

- **Registro con aprobación.** Toda cuenta nueva, del formulario o de Google, queda como solicitud
  de acceso y no ve ni opera ningún dato hasta que un administrador la aprueba. El rol elegido al
  registrarse es un pedido: lo confirma quien aprueba. Lo impone la base (trigger sobre
  `auth.users`, tabla `solicitud_acceso` y políticas por fila), no la interfaz.
- **Puesta en marcha.** La primera cuenta del sistema entra directamente como administradora de la
  organización. A partir de ahí, todas esperan aprobación.
- **Roles.** Administrador y Operario operan existencias por igual. Solo el administrador aprueba o
  rechaza cuentas.
- **Contraseñas.** Las guarda Supabase Auth con **bcrypt** en `auth.users`. Las tablas de la
  aplicación nunca las reciben. Mínimo 8 caracteres; máximo 72 bytes, el límite de bcrypt.
- **Correos duplicados.** Supabase Auth no admite dos cuentas con el mismo correo. El formulario lo
  informa con un mensaje claro.
- **Recuperación.** El enlace usa el flujo PKCE de Supabase Auth: es de un solo uso, vence en una
  hora y debe abrirse en el mismo navegador donde se pidió. El mensaje de confirmación es el mismo
  exista o no la cuenta, para no revelar qué correos están registrados.

En Supabase → *Authentication → URL Configuration* deben figurar la URL del sitio
(`https://detail-control.vercel.app`) y, en *Redirect URLs*, la de producción, la de las vistas
previas (`https://detail-control-*-<equipo>.vercel.app/**`) y `http://localhost:3100/**`.

**Envío de correos.** El servicio de correo incluido en Supabase solo entrega a los miembros del
equipo del proyecto y con un límite de pocos correos por hora. Para que la recuperación llegue a
cualquier usuario, configurar un SMTP propio en *Authentication → Emails → SMTP Settings* (por
ejemplo, Resend con un dominio verificado).

### Tipos de TypeScript

Para regenerar los tipos a partir de la base, con el proyecto vinculado:

```bash
npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

### Base local (opcional)

Con Docker disponible, `npx supabase start` levanta una base local con las migraciones y los datos
de prueba (`seed.sql`), y `npx supabase db reset` la reconstruye desde cero. No es necesario para
desarrollar: las pruebas de las reglas corren en memoria (sección 7).

## 6. Uso

```bash
npm run dev     # http://localhost:3100
```

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo (puerto 3100) |
| `npm run build` / `npm run start` | Compilación y servidor de producción |
| `npm run lint` | Análisis estático |
| `npm run typecheck` | Chequeo de tipos |
| `npm test` | Pruebas automatizadas |

### Caso del bidón de 5 L

| # | Pantalla | Acción | Resultado |
|---|----------|--------|-----------|
| 0 | Registro (solo la primera vez) | Yanina crea su cuenta en «Regístrate»; Guido crea la suya y Yanina la aprueba en *Usuarios* | Los dos socios tienen acceso |
| 1 | Inicio de sesión | Ingresar con el correo y la contraseña de Yanina | Entra a *Saldos* |
| 2 | Catálogo | Nuevo insumo, *Líquido (mL)*, presentación *1 L* | El insumo queda con una presentación de 1.000 mL |
| 3 | Ingresos | Cantidad `5`, unidad `L`, proveedor y costo | «Se registran 5.000 mL». Saldo 5.000 mL |
| 4 | Fraccionar | Cantidad `5` L, presentación *1 L*, unidades `4` | **Rechazado**: «hay 1000 mL no explicados» |
| 5 | Fraccionar | Cambiar unidades a `5` | **Confirmado**. A granel 0 mL, fraccionado 5.000 mL |
| 6 | Cerrar sesión e ingresar como Guido → Movimientos | Ver el historial | Cada movimiento muestra quién lo registró |
| 7 | Movimientos | *Corregir* una operación, con motivo | Se agrega una compensación; el original queda intacto |

## 7. Pruebas e integración continua

```bash
npm test
```

| Carpeta | Qué verifica | Dónde corre |
|---------|--------------|-------------|
| `tests/db/` | Los criterios de aceptación de RF-23, RF-02, RF-03, RF-01, RF-06, RF-04, RF-05 y RNF-04, e intentos de **violar** cada regla con SQL directo | Siempre. Aplica las migraciones reales sobre un PostgreSQL en memoria (PGlite); no necesita Docker ni conexión |
| `tests/unidad/` | Lectura y formato de cantidades y dinero sin flotantes | Siempre |
| `tests/db/cuentas.test.ts` | Solicitudes de acceso, aprobación, rechazo, roles y puesta en marcha, incluidos los intentos de saltear la aprobación | Siempre |
| `tests/api/` | El caso del bidón de punta a punta contra Supabase Auth y la API con los dos usuarios; registro, correo duplicado, aprobación, recuperación y cambio de contraseña | Solo si están definidas `PRUEBAS_SUPABASE_URL`, `PRUEBAS_SUPABASE_ANON_KEY` y `PRUEBAS_SUPABASE_SERVICE_ROLE_KEY`. **Nunca apuntarlas a producción** |

`tests/db/soporte/supabase-simulado.sql` reproduce lo mínimo de la plataforma Supabase (roles de la
API y `auth.uid()`) para las pruebas en memoria.

El flujo `.github/workflows/detail-control.yml` se ejecuta solo cuando cambian archivos de esta
carpeta. Instala dependencias, corre lint y chequeo de tipos, levanta Supabase local (migraciones y
datos de prueba), corre todas las pruebas (incluidas las de `tests/api/`), compila la aplicación y
comprueba con `curl` que, sin sesión, toda ruta redirige al inicio de sesión. No usa secretos de
GitHub.

## 8. Despliegue y seguridad

### Vercel

- Proyecto propio, distinto del proyecto del prototipo, con **Root Directory = `detail-control-system`**.
- Variables de entorno de la sección 4 cargadas en Production y Preview.
- Cada rama genera un despliegue de vista previa; `main` despliega a producción.

### Verificación de HTTPS (RNF-02)

```bash
curl -sI http://<dominio>/            # debe responder 308 hacia https://
curl -sI https://<dominio>/login      # debe incluir strict-transport-security
curl -sI --tls-max 1.1 https://<dominio>/login   # debe fallar: no se acepta TLS anterior a 1.2
```

### Medidas de seguridad

- **Sin sesión no hay acceso:** el middleware redirige toda ruta al inicio de sesión, y el rol
  anónimo no tiene permisos de lectura ni de ejecución en la base.
- **Escritura solo por funciones:** los usuarios autenticados no tienen `INSERT`, `UPDATE` ni
  `DELETE` sobre ninguna tabla.
- **El autor lo fija la base:** un trigger asigna `usuario_id` a partir de la sesión; el cliente no
  puede elegirlo.
- **Movimientos inmutables:** los triggers rechazan `UPDATE`, `DELETE` y `TRUNCATE` incluso para el
  dueño de la tabla y para la clave `service_role`.
- **Registro con aprobación:** cualquiera puede crear una cuenta, pero no ve ni opera nada hasta que
  un administrador la aprueba. La primera cuenta del sistema es la única que entra sola.
- **Contraseñas con bcrypt:** las guarda Supabase Auth. El CI verifica que todas las contraseñas de
  `auth.users` tengan formato bcrypt.
