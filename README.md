# Procesos-2627

SaaS base (Hito 1). PBI-1: repositorio con GitHub Flow, CI en cada PR/push a `main` y CD automático a URL pública. PBI-2: gestión básica de usuarios (alta, listado, estado, eliminación) en memoria.

## API de usuarios (PBI-2)
| Método | Ruta | Respuestas |
|---|---|---|
| `POST` | `/api/users` `{ email, nombre? }` | `201` creado (pendiente) · `400` email inválido · `409` duplicado · `403` cuenta eliminada |
| `GET` | `/api/users` | `200` lista de `{ email, rol, estado }` |
| `GET` | `/api/users/:email/active` | `200` `{ email, active }` · `404` no existe |
| `DELETE` | `/api/users/:email` | `200` `{ email, eliminado: true }` · `404` no existe |

Alcance honesto: sin contraseñas (llegan con hash en PBI-3, nunca en plano), sin sesiones (PBI-3/4) y sin enforcement de roles en servidor (PBI-6: listar/`isActive` solo admin; borrado admin→cualquiera, usuario→solo sí mismo). El alta crea `pendiente`; `activar()` la usará el enlace de PBI-7; el eliminado no vuelve a entrar (tumba en memoria).

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
PBI-1 incluye smoke tests del esqueleto; PBI-2 añade 8 tests unitarios de `logica.js` (felices + error: duplicado, email inválido, inexistente, realta tras borrado) y 5 de endpoints `/api/users`. Total: 17 tests.

## Variables de entorno
| Nombre | Uso |
|---|---|
| `PORT` | Puerto de escucha (en Render lo inyecta la plataforma) |

Ver `.env.example` (solo nombres, nunca valores secretos).

## Acceso como admin
Pendiente de PBI-6 (mecanismo seed/env/script). Desde PBI-2 ya existen usuarios con `rol` (`usuario`) y `estado` (`pendiente`/`activo`), pero sin login todavía.

## CI/CD
- **CI**: workflow `CI` en `.github/workflows/ci.yml` (push a `main` + PRs hacia `main`): `npm ci` + `npm test`. No mergear en rojo.
- **CD**: Blueprint `render.yaml` ( `New > Blueprint` en Render conectado al repo, Auto-Deploy activado). Cada merge a `main` redespliega solo. URL pública: _(pegar aquí la URL de Render tras conectarlo)_.
- **Flujo**: rama por cambio (`pbi-N-...`) → push → PR hacia `main` (auto-revisado permitido) → CI verde → merge → despliegue automático.
