# Procesos-2627

SaaS base. PBI-1: repositorio con GitHub Flow, CI en cada PR/push a `main` y CD automático a URL pública. PBI-2: gestión básica de usuarios en memoria. PBI-3 (Hito 2): registro y login locales con hash y sesión. PBI-4: sesión persistente, logout y rutas protegidas. PBI-5 (Hito 3): persistencia MongoDB y secretos fuera del código. PBI-6: roles y administración (listar/consultar solo admin; borrado admin→cualquiera, usuario→solo sí mismo; seed del primer admin por entorno; logs). PBI-7 (Hito 4): confirmación por email con enlace único (pendiente→activo). PBI-8: login con GitHub (OAuth) con alta directa en activo y sesión válida.

## Login con GitHub (PBI-8)
| Ruta | Respuestas |
|---|---|
| `GET /api/auth/oauth/github` | `302` a GitHub · `501` sin credenciales |
| `GET /api/auth/oauth/github/callback?code=…` | `302 /?token=…&email=…` (activo + sesión) · `302 /?oauth_error=…` si falla |

Flujo: el botón lleva a GitHub, autorizas, GitHub devuelve un `code` a nuestro callback (la URL debe estar registrada exacta), lo canjeamos por tu email verificado y entras directo como `activo` (el proveedor ya verificó el email: sin enlace de confirmación). Si ya existías (incluso pendiente), se activa y conserva tu rol; si estabas eliminado, no entras. Sin `GITHUB_*` el botón da 501 honesto en vez de redirigir a roto.
```sh
# GitHub > Settings > Developer settings > OAuth Apps > New:
#   Homepage URL: http://localhost:3000  (y luego la de Render)
#   Callback URL: http://localhost:3000/api/auth/oauth/github/callback
# Añade ADEMÁS la de Render: https://TU-APP.onrender.com/api/auth/oauth/github/callback
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...   # solo en .env / Render Environment, jamás en el repo
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/oauth/github/callback
```

## Confirmación por email (PBI-7)
| Método | Ruta | Respuestas |
|---|---|---|
| `GET` | `/api/auth/verificar/:token` | `200` cuenta activada · `404` falso/usado |
| `POST` | `/api/auth/reenviar` `{ email }` | `200` nuevo enlace · `400` ya activa/inexistente |

Flujo: registrarse genera un token único y envía `APP_URL/verificar.html?token=…` con el servicio SMTP de las variables (`SMTP_HOST/PORT/USER/PASS/FROM`, p. ej. Brevo; en Render free el SMTP directo está bloqueado y hay que mirar el spam). Sin SMTP no se toca la red: el enlace sale por el log (modo desarrollo/CI). Si el correo falla, el registro sigue devolviendo 201 y se deja log (el enlace se puede reenviar). El token es de un solo uso y no distingue falso de usado (`404` idéntico).

## Persistencia MongoDB (PBI-5)
`servidor/datos.js` mantiene su interfaz síncrona intacta (`logica.js` no cambió): lee siempre de caché en memoria y, si hay `MONGODB_URI`, refleja cada escritura en Mongo en diferido (colecciones `usuarios`, `eliminados`, `sesiones`; `upsert` por email/token). Al arrancar, `conectarDB()` hidrata la caché: los datos sobreviven al reinicio. Sin `MONGODB_URI` → modo memoria (tests y CI, sin red).
```sh
# Local con Mongo:  copia .env.example a .env y pon tu URI real (jamás commiteada)
MONGODB_URI=mongodb://localhost:27017/procesos2627
npm start
# Render: Dashboard del servicio > Environment > añadir MONGODB_URI (Atlas) > redeploy
```

## Roles y administración (PBI-6)
Solo el `admin` puede listar (`GET /api/users`) y consultar activo (`GET /:email/active`): con sesión pero sin rol → `403`; sin sesión → `401`. Borrado: admin borra a cualquiera; usuario solo su propia cuenta (`403` en otro caso). Todo validado **en el servidor** (lógica + middleware `requerirAdmin` con lectura fresca del rol; el cliente solo muestra/oculta).
```sh
# Primer admin: al arrancar, si hay ADMIN_EMAIL se crea activo
# (o se asciende si ya existe, conservando su contraseña).
ADMIN_EMAIL=jefa@ejemplo.com
ADMIN_PASSWORD=una-clave-larga-segura
npm start
# Render: las mismas variables en Dashboard > Environment. Las credenciales
# reales de prueba se envían aparte, nunca en el repo.
```
Logs estructurados (una línea JSON) en arranques, altas, logins, logouts, borrados, seed de admin y denegaciones (`warn`).

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

Alcance honesto: sin contraseñas (llegaron con hash en PBI-3, nunca en plano) y sin sesiones (PBI-3/4). Desde PBI-6, listar/`isActive` solo admin y borrado admin→cualquiera, usuario→solo sí mismo, todo enforced en servidor. El alta crea `pendiente`; `activar()` la usará el enlace de PBI-7; el eliminado no vuelve a entrar.

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
PBI-1 incluye smoke tests del esqueleto; PBI-2 añade 8 tests unitarios de `logica.js` y 6 de `/api/users` (incluido 401 sin token). PBI-3 añade 7 de registro/login y 3 de `/api/auth/*`. PBI-4 añade 6 de sesión (revalidación, logout, ciclo HTTP, 401). PBI-5 añade 6 de persistencia con stubs (sin BBDD real). PBI-6 añade 6 de roles en lógica y 3 de control de rol en endpoints. PBI-7 añade 6 de verificación y 4 de email/activación (con stub, cero SMTP real). PBI-8 añade 6 de login externo y 4 de flujo OAuth (con stub, cero red). Total: 69 tests.

## Variables de entorno
| Nombre | Uso |
|---|---|
| `PORT` | Puerto de escucha (en Render lo inyecta la plataforma) |
| `BCRYPT_COST` | Coste del hash bcrypt (10 por defecto; tests usan 4) |
| `MONGODB_URI` | URI de MongoDB. Vacía = modo memoria. En local va en `.env` (jamás commiteado); en Render, en Dashboard > Environment |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed del primer admin al arrancar (se crea activo o se asciende). Solo nombres en `.env.example`; valores reales aparte, nunca en el repo |

Ver `.env.example` (solo nombres, nunca valores secretos).

## Acceso como admin
Mecanismo seed por entorno (PBI-6, justificado: explícito, sin secretos en código, funciona igual en local y Render): define `ADMIN_EMAIL` (+ `ADMIN_PASSWORD` si aún no existe) y arranca. Desde PBI-3 hay registro/login locales: el alta es `pendiente` y solo entra al estar `activo`.

## CI/CD
- **CI**: workflow `CI` en `.github/workflows/ci.yml` (push a `main` + PRs hacia `main`): `npm ci` + `npm test`. No mergear en rojo.
- **CD**: Blueprint `render.yaml` ( `New > Blueprint` en Render conectado al repo, Auto-Deploy activado). Cada merge a `main` redespliega solo. URL pública: _(pegar aquí la URL de Render tras conectarlo)_.
- **Flujo**: rama por cambio (`pbi-N-...`) → push → PR hacia `main` (auto-revisado permitido) → CI verde → merge → despliegue automático.
