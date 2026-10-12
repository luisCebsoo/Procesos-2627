# Procesos-2627

SaaS base. PBI-1: repositorio con GitHub Flow, CI en cada PR/push a `main` y CD automático a URL pública. PBI-2: gestión básica de usuarios en memoria. PBI-3 (Hito 2): registro y login locales con hash y sesión. PBI-4: sesión persistente, logout y rutas protegidas. PBI-5 (Hito 3): persistencia MongoDB y secretos fuera del código.

## Persistencia MongoDB (PBI-5)
`servidor/datos.js` mantiene su interfaz síncrona intacta (`logica.js` no cambió): lee siempre de caché en memoria y, si hay `MONGODB_URI`, refleja cada escritura en Mongo en diferido (colecciones `usuarios`, `eliminados`, `sesiones`; `upsert` por email/token). Al arrancar, `conectarDB()` hidrata la caché: los datos sobreviven al reinicio. Sin `MONGODB_URI` → modo memoria (tests y CI, sin red).
```sh
# Local con Mongo:  copia .env.example a .env y pon tu URI real (jamás commiteada)
MONGODB_URI=mongodb://localhost:27017/procesos2627
npm start
# Render: Dashboard del servicio > Environment > añadir MONGODB_URI (Atlas) > redeploy
```

## Auth local (PBI-3)
| Método | Ruta | Respuestas |
|---|---|---|
| `POST` | `/api/auth/registro` `{ email, password, nombre? }` | `201` creado (pendiente, sin token) · `400` email/contraseña inválidos · `409` duplicado · `403` cuenta eliminada |
| `POST` | `/api/auth/login` `{ email, password }` | `200` `{ token, usuario }` · `401` credenciales inválidas · `403` pendiente/eliminada |

Reglas: contraseña mínimo 8 con hash **bcrypt** (`bcryptjs`, coste `BCRYPT_COST`, 10 por defecto); el hash jamás sale en respuestas; el recién registrado es `pendiente` y no entra hasta `activo` (PBI-7); login no distingue inexistente de password mal (no enumera).

## Sesión y rutas protegidas (PBI-4)
| Método | Ruta | Respuestas |
|---|---|---|
| `GET` | `/api/auth/me` (protegida) | `200` perfil · `401` sin token/token muerto |
| `POST` | `/api/auth/logout` (protegida) | `200` `{ ok: true }` · `401` sin token |

Flujo: el login entrega token `randomUUID`→email (memoria servidor + `localStorage` cliente, reenviado como `Bearer`). Tras F5, el cliente revalida con `GET /me`; si el token murió (logout), el servidor da 401 y el cliente limpia la sesión. El middleware `requerirAuth` protege `GET /api/users`, `GET /:email/active`, `DELETE /:email`, `/me` y `/logout`: sin `Bearer` válido, 401. (`POST /api/users` y `/api/auth/*` públicas siguen abiertas; el reparto admin/usuario llega en PBI-6.)

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
- **bcryptjs (bcrypt, coste 10)**: hash irreversible de contraseñas sin compilación nativa (seguro en CI y Render free).
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
PBI-1 incluye smoke tests del esqueleto; PBI-2 añade 8 tests unitarios de `logica.js` y 6 de `/api/users` (incluido 401 sin token). PBI-3 añade 7 de registro/login y 3 de `/api/auth/*`. PBI-4 añade 6 de sesión (revalidación, logout, ciclo HTTP, 401). PBI-5 añade 6 de persistencia con stubs (sin BBDD real). Total: 40 tests.

## Variables de entorno
| Nombre | Uso |
|---|---|
| `PORT` | Puerto de escucha (en Render lo inyecta la plataforma) |
| `BCRYPT_COST` | Coste del hash bcrypt (10 por defecto; tests usan 4) |
| `MONGODB_URI` | URI de MongoDB. Vacía = modo memoria. En local va en `.env` (jamás commiteado); en Render, en Dashboard > Environment |

Ver `.env.example` (solo nombres, nunca valores secretos).

## Acceso como admin
Pendiente de PBI-6 (mecanismo seed/env/script). Desde PBI-3 hay registro/login locales: el alta es `pendiente` y solo entra al estar `activo`.

## CI/CD
- **CI**: workflow `CI` en `.github/workflows/ci.yml` (push a `main` + PRs hacia `main`): `npm ci` + `npm test`. No mergear en rojo.
- **CD**: Blueprint `render.yaml` ( `New > Blueprint` en Render conectado al repo, Auto-Deploy activado). Cada merge a `main` redespliega solo. URL pública: _(pegar aquí la URL de Render tras conectarlo)_.
- **Flujo**: rama por cambio (`pbi-N-...`) → push → PR hacia `main` (auto-revisado permitido) → CI verde → merge → despliegue automático.
