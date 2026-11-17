# PIF · Geneyro Lautaro

Proyecto integrador para **GFK Estética Vehicular**: control del consumo de insumos y costeo de servicios.

| Carpeta | Contenido | Producción |
|---|---|---|
| [`V1/`](V1/) | Prototipo v1 (Iteración 1): motor de fraccionamiento. | Proyecto Vercel `gfk-control-insumos` |
| [`V2/`](V2/) | **DETAIL CONTROL**, el sistema: cuentas y roles, catálogo, ingresos, fraccionamiento, movimientos y saldos. | https://detail-control.vercel.app |

Cada carpeta es una aplicación independiente (Next.js 14 + Supabase), con su propio `package.json`,
migraciones y README. Para trabajar en una, entrá a su carpeta y seguí su README:

```bash
cd V2
npm ci
npm run dev
```

## Integración continua

| Flujo | Carpeta | Qué verifica |
|---|---|---|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | `V1/` | Lint, tipos, build y prueba del motor en PL/pgSQL |
| [`.github/workflows/detail-control.yml`](.github/workflows/detail-control.yml) | `V2/` | Lint, tipos, pruebas contra Supabase local, contraseñas con bcrypt, build y rutas protegidas |
