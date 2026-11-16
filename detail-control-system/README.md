# DETAIL CONTROL

Sistema web para el control del consumo de insumos y el costeo de servicios en centros de estÃ©tica
vehicular. Cliente piloto: **GFK EstÃ©tica Vehicular** (Posadas, Misiones).

GFK compra insumos a granel, los fracciona en presentaciones menores y los vende o consume. El
sistema **conserva las cantidades**: un fraccionamiento solo se confirma si lo que sale del envase
de origen es exactamente igual a lo que entra en las presentaciones mÃ¡s la merma declarada.

Este proyecto es **independiente del prototipo** que vive en la raÃ­z del repositorio: tiene sus
propias dependencias, variables de entorno, base de datos, pruebas y despliegue, y no importa nada
del prototipo.

**Estado: IteraciÃ³n 1** (motor de existencias).

1. [Alcance](#1-alcance)
2. [Arquitectura](#2-arquitectura)
3. [InstalaciÃ³n](#3-instalaciÃ³n)
4. [ConfiguraciÃ³n](#4-configuraciÃ³n)
5. [Base de datos](#5-base-de-datos)
6. [Uso](#6-uso)
7. [Pruebas e integraciÃ³n continua](#7-pruebas-e-integraciÃ³n-continua)
8. [Despliegue y seguridad](#8-despliegue-y-seguridad)

---

## 1. Alcance

| Requisito | QuÃ© hace | DÃ³nde se impone |
|-----------|----------|-----------------|
| **RF-23** AutenticaciÃ³n | Inicio y cierre de sesiÃ³n; nada funciona sin sesiÃ³n; cada movimiento guarda el ID del usuario | `src/middleware.ts`, polÃ­ticas de seguridad por fila, trigger `trg_movimiento_atribuir` |
| **RF-02** CatÃ¡logo | Alta de insumo con unidad base (mL o g) y presentaciones de 1, 5, 20, 60 o 120 L | `crear_insumo()`, `agregar_presentacion()` |
| **RF-03** Ingreso | Ingreso convertido a unidad base, con proveedor y costo obligatorios | `registrar_ingreso()` |
| **RF-01** Fraccionamiento | Rechaza lo que no conserva la cantidad o excede el saldo, e informa la cantidad no explicada | `registrar_fraccionamiento()`, trigger `trg_movimiento_invariantes` |
| **RF-06** Merma | La merma de un fraccionamiento exige motivo | `registrar_fraccionamiento()`, restricciÃ³n `movimiento_forma_valida` |
| **RF-04** Saldo | Saldo en unidad base y equivalente por presentaciÃ³n; siempre es la suma de los movimientos | vistas `v_saldo_insumo`, `v_saldo_presentacion` |
| **RF-05** Inmutabilidad | Los movimientos no se editan ni se borran; se corrigen con una compensaciÃ³n que referencia al original | triggers `trg_movimiento_bloquear_*`, `compensar_operacion()` |
| **RNF-02** HTTPS | Cabecera HSTS y cabeceras de seguridad | `next.config.mjs` |
| **RNF-04** Organizaciones | Toda tabla lleva `organizacion_id`; un usuario solo ve su organizaciÃ³n | polÃ­ticas de seguridad por fila |

Reglas que atraviesan todo el sistema:

- Las cantidades son **enteros** en mL o g (`bigint`). La conversiÃ³n a litros ocurre solo al mostrar.
- El dinero es un **entero en centavos** de peso argentino. No hay decimales ni flotantes.
- El saldo **no se guarda**: se calcula sumando movimientos.
- Las reglas viven **en la base de datos**. La interfaz y la API no pueden saltearlas.

Pendiente para prÃ³ximas iteraciones: venta (RF-08), importaciÃ³n desde Excel (RF-21), conteo fÃ­sico y
desvÃ­o (RF-09), y el resto de la especificaciÃ³n.

## 2. Arquitectura

```
 Navegador (computadora / celular)
        â”‚  HTTPS
        â–¼
 Vercel Â· Next.js 14 (App Router)
   â”œâ”€ src/middleware.ts ....... exige sesiÃ³n en toda ruta
   â”œâ”€ src/app/(app)/ .......... pantallas: Saldos, Fraccionar, Ingresos, CatÃ¡logo, Movimientos
   â”œâ”€ src/app/login/ .......... inicio de sesiÃ³n
   â””â”€ src/app/acciones.ts ..... Server Actions â†’ funciones de la base
        â”‚  HTTPS Â· clave pÃºblica + sesiÃ³n del usuario
        â–¼
 Supabase Â· PostgreSQL 15
   â”œâ”€ Supabase Auth ........... usuarios (sin registro pÃºblico)
   â”œâ”€ funciones PL/pgSQL ...... Ãºnicas vÃ­as de escritura
   â”œâ”€ triggers ................ atribuciÃ³n, inmutabilidad y conservaciÃ³n
   â”œâ”€ polÃ­ticas por fila ...... solo usuarios autenticados, solo su organizaciÃ³n
   â””â”€ vistas .................. saldos = suma de movimientos
```

```
detail-control-system/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app/                    Rutas, Server Actions y estilos
â”‚   â”œâ”€â”€ components/             Formularios y navegaciÃ³n
â”‚   â”œâ”€â”€ lib/                    Lecturas, formato (enteros) y clientes de Supabase
â”‚   â””â”€â”€ middleware.ts
â”œâ”€â”€ supabase/
â”‚   â”œâ”€â”€ config.toml             ConfiguraciÃ³n local (puertos 5532x, PostgreSQL 17)
â”‚   â”œâ”€â”€ migrations/             Esquema, reglas y seguridad (SQL versionado)
â”‚   â””â”€â”€ seed.sql                Datos de prueba: solo local y CI, nunca producciÃ³n
â”œâ”€â”€ tests/
â”‚   â”œâ”€â”€ db/                     Criterios de aceptaciÃ³n contra las migraciones reales
â”‚   â”œâ”€â”€ api/                    Punta a punta contra la API de Supabase
â”‚   â””â”€â”€ unidad/                 Formato de cantidades y dinero
â””â”€â”€ README.md
```

`movimiento` es un libro mayor. Cada operaciÃ³n agrupa sus lÃ­neas por `operacion_id` y cada lÃ­nea
afecta un compartimento. Fraccionar 5.000 mL en 4 botellas de 1 L con 1.000 mL de merma genera:

| compartimento | unidades | cantidad_base |
|---------------|----------|---------------|
| GRANEL | â€” | âˆ’5000 |
| PRESENTACION (1 L) | 4 | +4000 |
| MERMA (Â«derrameÂ») | â€” | +1000 |

Las lÃ­neas de un fraccionamiento **suman 0**: esa es la conservaciÃ³n de cantidades.

## 3. InstalaciÃ³n

Requisitos: Node.js 20 o superior.

```bash
cd detail-control-system
npm ci
```

Todas las dependencias se instalan dentro de esta carpeta. No se instala nada en la raÃ­z del
repositorio.

## 4. ConfiguraciÃ³n

Las variables de entorno se definen en `.env.local` para desarrollo (no se versiona) y en
*Vercel â†’ Project â†’ Settings â†’ Environment Variables* (Production y Preview) para el despliegue.
`.env.example` lista los nombres con valores vacÃ­os.

| Variable | De dÃ³nde copiarla | DÃ³nde se usa |
|----------|-------------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase â†’ *Project Settings â†’ API* â†’ Project URL | Servidor y navegador |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase â†’ *Project Settings â†’ API Keys* â†’ clave *publishable* o *anon* | Servidor y navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase â†’ *Project Settings â†’ API Keys* â†’ clave *secret* o *service_role* | **Solo servidor.** La IteraciÃ³n 1 no la usa; queda reservada |

Ninguna clave se guarda en el repositorio. La clave `service_role` nunca lleva el prefijo
`NEXT_PUBLIC_` ni se importa desde cÃ³digo de cliente.

## 5. Base de datos

### Migraciones

| Archivo | Contenido |
|---------|-----------|
| `20261115000001_esquema.sql` | Tablas, tipos y restricciones |
| `20261115000002_reglas.sql` | Funciones PL/pgSQL, triggers y vistas |
| `20261115000003_seguridad.sql` | Seguridad por fila y permisos |

Aplicarlas al proyecto remoto (pide la contraseÃ±a de la base):

```bash
npx supabase login
npx supabase link --project-ref <reference-id>
npx supabase db push --dry-run   # muestra quÃ© se va a aplicar
npx supabase db push
```

`db push` aplica solo las migraciones. **`seed.sql` nunca se aplica a producciÃ³n.**

### Alta de usuarios

No hay registro pÃºblico. Para cada socio:

1. En Supabase â†’ *Authentication â†’ Users â†’ Add user*, crear el usuario con correo y contraseÃ±a
   (marcar *Auto Confirm User*).
2. En *SQL Editor*, asociarlo a la organizaciÃ³n (la primera vez, crear tambiÃ©n la organizaciÃ³n):

```sql
insert into public.organizacion (nombre) values ('GFK EstÃ©tica Vehicular');

insert into public.miembro (usuario_id, organizacion_id, nombre)
select u.id, o.id, 'Yanina'
  from auth.users u, public.organizacion o
 where u.email = 'correo-de-yanina@ejemplo.com' and o.nombre = 'GFK EstÃ©tica Vehicular';
```

En *Authentication â†’ Sign In / Providers* debe quedar desactivado *Allow new users to sign up*.

### Tipos de TypeScript

Para regenerar los tipos a partir de la base, con el proyecto vinculado:

```bash
npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

### Base local (opcional)

Con Docker disponible, `npx supabase start` levanta una base local con las migraciones y los datos
de prueba (`seed.sql`), y `npx supabase db reset` la reconstruye desde cero. No es necesario para
desarrollar: las pruebas de las reglas corren en memoria (secciÃ³n 7).

## 6. Uso

```bash
npm run dev     # http://localhost:3100
```

| Comando | QuÃ© hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo (puerto 3100) |
| `npm run build` / `npm run start` | CompilaciÃ³n y servidor de producciÃ³n |
| `npm run lint` | AnÃ¡lisis estÃ¡tico |
| `npm run typecheck` | Chequeo de tipos |
| `npm test` | Pruebas automatizadas |

### Caso del bidÃ³n de 5 L

| # | Pantalla | AcciÃ³n | Resultado |
|---|----------|--------|-----------|
| 1 | Inicio de sesiÃ³n | Ingresar con el correo y la contraseÃ±a de Yanina | Entra a *Saldos* |
| 2 | CatÃ¡logo | Nuevo insumo, *LÃ­quido (mL)*, presentaciÃ³n *1 L* | El insumo queda con una presentaciÃ³n de 1.000 mL |
| 3 | Ingresos | Cantidad `5`, unidad `L`, proveedor y costo | Â«Se registran 5.000 mLÂ». Saldo 5.000 mL |
| 4 | Fraccionar | Cantidad `5` L, presentaciÃ³n *1 L*, unidades `4` | **Rechazado**: Â«hay 1000 mL no explicadosÂ» |
| 5 | Fraccionar | Cambiar unidades a `5` | **Confirmado**. A granel 0 mL, fraccionado 5.000 mL |
| 6 | Cerrar sesiÃ³n e ingresar como Guido â†’ Movimientos | Ver el historial | Cada movimiento muestra quiÃ©n lo registrÃ³ |
| 7 | Movimientos | *Corregir* una operaciÃ³n, con motivo | Se agrega una compensaciÃ³n; el original queda intacto |

## 7. Pruebas e integraciÃ³n continua

```bash
npm test
```

| Carpeta | QuÃ© verifica | DÃ³nde corre |
|---------|--------------|-------------|
| `tests/db/` | Los criterios de aceptaciÃ³n de RF-23, RF-02, RF-03, RF-01, RF-06, RF-04, RF-05 y RNF-04, e intentos de **violar** cada regla con SQL directo | Siempre. Aplica las migraciones reales sobre un PostgreSQL en memoria (PGlite); no necesita Docker ni conexiÃ³n |
| `tests/unidad/` | Lectura y formato de cantidades y dinero sin flotantes | Siempre |
| `tests/api/` | El caso del bidÃ³n de punta a punta contra Supabase Auth y la API, con los dos usuarios | Solo si estÃ¡n definidas `PRUEBAS_SUPABASE_URL` y `PRUEBAS_SUPABASE_ANON_KEY`. **Nunca apuntarlas a producciÃ³n** |

`tests/db/soporte/supabase-simulado.sql` reproduce lo mÃ­nimo de la plataforma Supabase (roles de la
API y `auth.uid()`) para las pruebas en memoria.

El flujo `.github/workflows/detail-control.yml` se ejecuta solo cuando cambian archivos de esta
carpeta. Instala dependencias, corre lint y chequeo de tipos, levanta Supabase local (migraciones y
datos de prueba), corre todas las pruebas (incluidas las de `tests/api/`), compila la aplicaciÃ³n y
comprueba con `curl` que, sin sesiÃ³n, toda ruta redirige al inicio de sesiÃ³n. No usa secretos de
GitHub.

## 8. Despliegue y seguridad

### Vercel

- Proyecto propio, distinto del proyecto del prototipo, con **Root Directory = `detail-control-system`**.
- Variables de entorno de la secciÃ³n 4 cargadas en Production y Preview.
- Cada rama genera un despliegue de vista previa; `main` despliega a producciÃ³n.

### VerificaciÃ³n de HTTPS (RNF-02)

```bash
curl -sI http://<dominio>/            # debe responder 308 hacia https://
curl -sI https://<dominio>/login      # debe incluir strict-transport-security
curl -sI --tls-max 1.1 https://<dominio>/login   # debe fallar: no se acepta TLS anterior a 1.2
```

### Medidas de seguridad

- **Sin sesiÃ³n no hay acceso:** el middleware redirige toda ruta al inicio de sesiÃ³n, y el rol
  anÃ³nimo no tiene permisos de lectura ni de ejecuciÃ³n en la base.
- **Escritura solo por funciones:** los usuarios autenticados no tienen `INSERT`, `UPDATE` ni
  `DELETE` sobre ninguna tabla.
- **El autor lo fija la base:** un trigger asigna `usuario_id` a partir de la sesiÃ³n; el cliente no
  puede elegirlo.
- **Movimientos inmutables:** los triggers rechazan `UPDATE`, `DELETE` y `TRUNCATE` incluso para el
  dueÃ±o de la tabla y para la clave `service_role`.
- **Sin registro pÃºblico:** los usuarios los da de alta el responsable del sistema.
