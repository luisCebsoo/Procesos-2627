# Procesos-2627

SaaS base (Hito 1). PBI-1: repositorio con GitHub Flow, CI en cada PR/push a `main` y CD automático a URL pública.

## Tecnologías
- **Node 20 + Express 4**: backend mínimo que sirve API REST y frontend estático desde el mismo origen (exigido por la arquitectura).
- **JS vanilla en cliente (com.js + app.js + index.html)**: sin bundler para mantener visible la frontera GUI/controlador vs comunicación.
- **node:test + assert (built-in)**: framework de tests sin dependencias extra; `npm test` corre todo con un solo comando.
- **GitHub Actions**: CI que ejecuta los tests en cada PR y push a `main` (ver `.github/workflows/ci.yml`).
- **Render (plan free, `render.yaml`)**: CD con Auto-Deploy desde `main` a URL pública.

## Arquitectura (fronteras)
- `servidor/api.js` (transporte) → `servidor/logica.js` (reglas) → `servidor/datos.js` (persistencia en memoria; en Hito 3 se cambia por BBDD sin tocar `logica.js`). `logica.js` nunca importa de `api.js`.
- `cliente/com.js` (único que llama a `/api/*`) ← `cliente/app.js` (GUI+controlador) ← `cliente/index.html`. El cliente jamás toca la BBDD.

## Correr en local
```sh
npm ci
cp .env.example .env   # opcional; por defecto PORT=3000
npm start
# abrir http://localhost:3000  (health: http://localhost:3000/api/health)
```

## Tests
```sh
npm test
```
PBI-1 incluye smoke tests del esqueleto; en PBI-2 se amplían a ≥5 tests de `logica.js` (felices + error).

## Variables de entorno
| Nombre | Uso |
|---|---|
| `PORT` | Puerto de escucha (en Render lo inyecta la plataforma) |

Ver `.env.example` (solo nombres, nunca valores secretos).

## Acceso como admin
Pendiente de PBI-6 (mecanismo seed/env/script). En PBI-1 no hay usuarios ni roles.

## CI/CD
- **CI**: workflow `CI` en `.github/workflows/ci.yml` (push a `main` + PRs hacia `main`): `npm ci` + `npm test`. No mergear en rojo.
- **CD**: Blueprint `render.yaml` ( `New > Blueprint` en Render conectado al repo, Auto-Deploy activado). Cada merge a `main` redespliega solo. URL pública: _(pegar aquí la URL de Render tras conectarlo)_.
- **Flujo**: rama por cambio (`pbi-N-...`) → push → PR hacia `main` (auto-revisado permitido) → CI verde → merge → despliegue automático.
