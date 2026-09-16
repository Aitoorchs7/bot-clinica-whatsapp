# Prompt: Auditoría de Seguridad Completa del Proyecto

Eres un ingeniero de seguridad senior. Tu tarea es realizar una auditoría exhaustiva de seguridad de este proyecto. No asumas nada. Revisa cada archivo, cada ruta, cada variable, cada tabla. Sé paranoico. Si algo "probablemente está bien", NO está bien hasta que lo verifiques.

Genera un reporte final en formato markdown en la raíz de este proyecto con hallazgos categorizados por severidad: 🔴 CRÍTICO, 🟠 ALTO, 🟡 MEDIO, 🔵 BAJO.

---

## 1. VARIABLES DE ENTORNO Y DATOS SENSIBLES

### 1.1 Inventario de archivos de entorno

- Busca TODOS los archivos `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.staging`, `.env.test`, `.env.example` y cualquier variante en todo el proyecto (incluyendo subdirectorios).
- Para cada archivo encontrado, lista TODAS las variables que contiene.
- Clasifica cada variable como:
  - **SECRETA** (API keys, tokens, passwords, database URLs con credenciales, secrets de JWT, webhooks con tokens)
  - **PÚBLICA** (URLs base sin credenciales, nombres de app, feature flags no sensibles)
  - **AMBIGUA** (necesita revisión manual)

### 1.2 Detección de secrets hardcodeados

- Busca en TODOS los archivos del proyecto (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.json`, `.yaml`, `.yml`, `.toml`, `.xml`, `.sql`, `.sh`, `.config`, `.cfg`) patrones como:
  - Strings que parezcan API keys (patrones como `sk-`, `pk_`, `ghp_`, `xoxb-`, `AIza`, `AKIA`, `eyJ`)
  - URLs con credenciales embebidas (`postgres://user:password@`, `mongodb+srv://user:pass@`)
  - Tokens JWT hardcodeados
  - Passwords en texto plano
  - Cualquier string de alta entropía (>4.5 bits/char) asignada a variables con nombres sugestivos (`secret`, `key`, `token`, `password`, `credential`, `auth`)
- Revisa también los archivos de configuración de Docker (`Dockerfile`, `docker-compose.yml`) buscando `ARG`, `ENV` o `--build-arg` con secrets.
- Revisa archivos de CI/CD (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`) para detectar secrets que NO usen el mecanismo de secrets del CI (ej: variables inline en lugar de `${{ secrets.VAR }}`).

### 1.3 Exposición al cliente (CRÍTICO para frameworks como Next.js, Nuxt, Vite, etc.)

- Identifica el framework del proyecto y su convención de variables públicas:
  - **Next.js**: solo `NEXT_PUBLIC_*` se expone al navegador
  - **Vite**: solo `VITE_*` se expone
  - **Create React App**: solo `REACT_APP_*` se expone
  - **Nuxt**: variables en `runtimeConfig.public`
- Verifica que NINGUNA variable secreta use estos prefijos.
- Busca imports directos de `process.env.VARIABLE_SECRETA` en archivos que se ejecuten en el cliente (`page.tsx`, componentes client-side, hooks, etc.).
- Revisa si existe algún endpoint API que devuelva `process.env` completo o un dump de configuración.

---

## 2. ARCHIVOS EN .gitignore

### 2.1 Validación del .gitignore

- Lee el archivo `.gitignore` de la raíz del proyecto (y cualquier `.gitignore` en subdirectorios).
- Verifica que estén incluidos TODOS los siguientes patrones. Si alguno falta, repórtalo:

```
# Variables de entorno
.env
.env.local
.env.development
.env.development.local
.env.test
.env.test.local
.env.production
.env.production.local
.env.staging

# Dependencias
node_modules/
__pycache__/
venv/
.venv/

# Archivos de IDE/Editor con posibles configs locales
.idea/
.vscode/settings.json
.vscode/launch.json
*.swp
*.swo
.DS_Store

# Build outputs que pueden contener secrets interpolados
.next/
.nuxt/
dist/
build/
out/

# Logs que pueden contener datos sensibles
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Archivos de base de datos local
*.sqlite
*.sqlite3
*.db

# Certificados y llaves
*.pem
*.key
*.crt
*.p12
*.pfx

# Archivos de Terraform/IaC con state
*.tfstate
*.tfstate.backup
.terraform/

# Docker
.docker/
```

### 2.2 Detección de secrets ya commiteados

- Ejecuta el siguiente comando (o equivalente) para detectar si algún archivo sensible fue commiteado en el historial de git:

```bash
# Buscar archivos .env en el historial completo
git log --all --full-history -- "**/.env*"
git log --all --full-history -- "**/*.pem"
git log --all --full-history -- "**/*.key"
```

- Si encuentras archivos sensibles en el historial, repórtalo como 🔴 CRÍTICO y recomienda:
  1. Rotar TODOS los secrets que hayan sido expuestos.
  2. Usar `git filter-repo` o `BFG Repo-Cleaner` para purgar el historial.

### 2.3 Archivos de ejemplo

- Si existe `.env.example` (o `.env.template`), verifica que:
  - NO contenga valores reales (solo placeholders como `tu_api_key_aqui`, `xxxxxxx`, `changeme`)
  - Documente TODAS las variables requeridas que existan en `.env`
  - Esté versionado en git (SÍ debe estar en el repo)

---

## 3. PROTECCIÓN DE RUTAS CON AUTENTICACIÓN (PROXY / MIDDLEWARE)

### 3.1 Mapa completo de rutas

- Construye un inventario COMPLETO de todas las rutas de la aplicación:
  - **Páginas/Vistas**: Cada archivo en `app/`, `pages/`, `src/routes/`, etc.
  - **API Routes**: Cada archivo en `app/api/`, `pages/api/`, `server/routes/`, etc.
  - **Rutas dinámicas**: `[id]`, `[slug]`, `[...catchAll]`, etc.
  - **Rutas de archivos estáticos** que podrían exponer datos

- Para cada ruta, clasifícala como:
  - ✅ **PÚBLICA** (no requiere auth): login, registro, landing, pricing, docs públicos, health checks
  - 🔒 **PROTEGIDA** (requiere auth): dashboard, perfil, settings, datos de usuario, admin
  - 🔑 **API PROTEGIDA** (requiere auth via token/session): endpoints CRUD, webhooks
  - ❓ **SIN CLASIFICAR** (no tiene protección explícita y no está claro si debería)

### 3.2 Proxy / Middleware de autenticación

- Localiza el archivo de intercepción de requests. Según el framework:
  - **Next.js 16+**: `proxy.ts` o `proxy.js` en la raíz o `src/` (exporta una función llamada `proxy`). En Next.js 16, `middleware.ts` está **deprecado** y renombrado a `proxy.ts`. El runtime de Proxy es Node.js (no Edge). Si el proyecto aún usa `middleware.ts`, repórtalo como 🟡 MEDIO (deprecado, debe migrarse a `proxy.ts`).
    - Verifica que la función exportada se llame `proxy`, no `middleware`.
    - Si el proyecto usa Clerk, next-intl u otro paquete que wrappea el middleware, verifica que el wrapper se haya actualizado para ser compatible con la convención `proxy`.
    - Codemod oficial de migración: `npx @next/codemod@canary upgrade latest`
  - **Next.js 13-15 (legacy)**: `middleware.ts` o `middleware.js` en la raíz o `src/`
  - **Express**: `app.use()` con middleware de auth
  - **Nuxt**: `server/middleware/` o `middleware/`
  - **Django**: `MIDDLEWARE` en `settings.py`
  - **Laravel**: `Kernel.php` middleware groups
  - **FastAPI**: dependencies de auth

- Revisa la configuración del proxy/middleware:
  - ¿Tiene un `matcher` (en `export const config`) o equivalente que cubra TODAS las rutas protegidas?
  - ¿Usa un approach de allowlist (solo deja pasar rutas públicas) o blocklist (bloquea rutas específicas)?
    - **Allowlist es preferible**. Si usa blocklist, verifica que no falte ninguna ruta.
  - ¿Qué pasa cuando la autenticación falla? ¿Redirige a login o devuelve 401/403?
  - ¿Maneja correctamente los edge cases?
    - Tokens expirados
    - Tokens malformados
    - Ausencia total de token/cookie
    - Tokens con firma inválida
  - **Importante para Next.js 16**: El proxy NO debe usarse para lógica pesada de autenticación (consultas a BD en cada request). Úsalo para verificar la existencia de un JWT/cookie. La validación completa de sesión debe hacerse en API routes o Server Components. Si el proxy hace consultas pesadas a BD en cada request (incluyendo assets estáticos), repórtalo como 🟡 MEDIO por impacto en rendimiento.

### 3.3 Validación de sesiones y tokens

- Identifica el mecanismo de autenticación (JWT, sessions, cookies, OAuth, etc.).
- Verifica:
  - **JWT**: ¿Se valida la firma? ¿Se verifica el `exp`? ¿Se usa `HS256` o `RS256`? ¿El secret es suficientemente fuerte?
  - **Cookies**: ¿Tienen `HttpOnly`, `Secure`, `SameSite`? ¿Se valida la sesión server-side?
  - **OAuth/Supabase Auth**: ¿Se valida el token con el servidor de auth en cada request o solo client-side?
- Busca rutas API que NO validen autenticación pero acceden a datos de usuario.
- Busca endpoints que confíen en datos del cliente (como `user_id` del body) en lugar de extraerlo del token/sesión.

### 3.4 Autorización (más allá de autenticación)

- ¿Existe control de roles? (admin, user, editor, etc.)
- Si existe, verifica que:
  - Las rutas de admin NO sean accesibles por usuarios normales
  - Los endpoints API de admin validen el rol server-side (no solo ocultar el botón en el UI)
  - No se pueda escalar privilegios manipulando el request
- Busca vulnerabilidades IDOR (Insecure Direct Object Reference):
  - Endpoints como `/api/users/[id]` donde un usuario puede acceder a datos de otro cambiando el ID
  - Cualquier endpoint que use un ID del URL/body sin verificar que pertenezca al usuario autenticado

---

## 4. ROW LEVEL SECURITY (RLS) EN SUPABASE

### 4.1 Inventario de tablas

- Conecta a Supabase (o revisa los archivos de migración en `supabase/migrations/`) y lista TODAS las tablas del schema `public`.
- Para cada tabla, determina:
  - ¿Tiene RLS habilitado? (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
  - ¿Cuántas políticas tiene?
  - ¿Para qué operaciones? (SELECT, INSERT, UPDATE, DELETE)

### 4.2 Tablas sin RLS (CRÍTICO)

- Cualquier tabla en `public` sin RLS habilitado es un 🔴 CRÍTICO.
- Sin RLS, cualquier usuario con la `anon key` puede leer/escribir TODA la tabla directamente desde el cliente.
- Reporta cada tabla sin RLS y qué datos contiene.

### 4.3 Auditoría de políticas RLS

Para cada tabla CON RLS habilitado, revisa cada política y verifica:

- **SELECT (lectura)**:
  - ¿Los usuarios solo pueden ver sus propios datos? → `auth.uid() = user_id`
  - Si hay datos compartidos, ¿la política es correcta? (ej: miembros del mismo equipo/organización)
  - ¿Hay alguna política que permita lectura a `anon` (usuarios no autenticados)? Si sí, ¿es intencional?

- **INSERT (creación)**:
  - ¿Se fuerza que `user_id` sea `auth.uid()`? → Para evitar que un usuario cree registros "como" otro usuario
  - ¿Hay validaciones de campos requeridos a nivel de política?

- **UPDATE (modificación)**:
  - ¿Los usuarios solo pueden modificar sus propios registros?
  - ¿Se previene que modifiquen campos que no deberían? (ej: cambiar su propio `role` a `admin`)
  - ¿El `USING` y el `WITH CHECK` son ambos correctos?

- **DELETE (eliminación)**:
  - ¿Los usuarios solo pueden eliminar sus propios registros?
  - ¿Hay tablas donde DELETE debería estar prohibido para todos? (ej: logs de auditoría)

### 4.4 Bypass de RLS

- Busca en el código del proyecto si se usa `supabase.rpc()` con funciones que tengan `SECURITY DEFINER` → estas ejecutan como el creador de la función, IGNORANDO RLS.
  - Revisa cada función `SECURITY DEFINER` y verifica que:
    - Valide `auth.uid()` internamente
    - No permita inyección SQL
    - No exponga datos que el usuario no debería ver
- Busca si se usa el `service_role` key en algún lugar del cliente. Esto BYPASEA RLS completamente.
  - `service_role` key solo debe usarse en el backend/server-side.
  - Si aparece en código del cliente o en variables `NEXT_PUBLIC_*` → 🔴 CRÍTICO.
- Revisa si hay tablas con políticas que usen `true` como condición (acceso total):
  ```sql
  CREATE POLICY "allow_all" ON tabla FOR ALL USING (true);
  ```
  Esto efectivamente desactiva RLS para esa tabla.

### 4.5 Storage buckets

- Si el proyecto usa Supabase Storage, revisa:
  - ¿Los buckets son públicos o privados?
  - ¿Tienen políticas RLS en la tabla `storage.objects`?
  - ¿Un usuario puede acceder a archivos de otro usuario manipulando la URL?
  - ¿Hay validación de tipo de archivo y tamaño máximo?

### 4.6 Realtime subscriptions

- Si se usan suscripciones en tiempo real de Supabase:
  - ¿RLS se aplica a los canales?
  - ¿Un usuario puede suscribirse a cambios en datos que no le pertenecen?

---

## 5. VERIFICACIONES ADICIONALES

### 5.1 Dependencias

- Ejecuta `npm audit` o equivalente y reporta vulnerabilidades de severidad alta y crítica.
- Verifica que no haya dependencias abandonadas o con vulnerabilidades conocidas.

### 5.2 Headers de seguridad

- Verifica la presencia de headers como:
  - `Content-Security-Policy`
  - `X-Frame-Options` o `frame-ancestors` en CSP
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`

### 5.3 CORS

- Revisa la configuración de CORS:
  - ¿Permite `*` como origin? Si sí, ¿es intencional?
  - ¿Los origins permitidos son específicos y correctos?

### 5.4 Rate limiting

- ¿Hay rate limiting en los endpoints API?
- Especialmente en: login, registro, reset de password, endpoints públicos.

### 5.5 Validación de inputs

- ¿Se validan y sanitizan los inputs del usuario? (zod, joi, yup, etc.)
- Busca posibles vectores de:
  - SQL injection (queries raw sin parametrizar)
  - XSS (renderizado de HTML sin sanitizar)
  - Path traversal (uso de params del usuario en rutas de archivos)

---

## FORMATO DEL REPORTE FINAL

Genera el reporte con esta estructura:

```
# 🔒 Reporte de Auditoría de Seguridad
## Proyecto: [nombre]
## Fecha: [fecha]
## Resumen ejecutivo
- Total de hallazgos: X
- 🔴 Críticos: X
- 🟠 Altos: X
- 🟡 Medios: X
- 🔵 Bajos: X

## Hallazgos detallados

### [SEVERIDAD] [Título del hallazgo]
- **Ubicación**: archivo:línea
- **Descripción**: qué encontraste
- **Impacto**: qué podría pasar si se explota
- **Remediación**: pasos exactos para arreglarlo, con código si aplica

## Mapa de rutas y protección
[Tabla con todas las rutas, su estado de protección, y observaciones]

## Estado de RLS por tabla
[Tabla con todas las tablas, si tienen RLS, y resumen de políticas]

## Checklist final
- [ ] Todas las variables sensibles en .env y excluidas de git
- [ ] No hay secrets en el historial de git
- [ ] No hay secrets hardcodeados en el código
- [ ] Todas las rutas protegidas tienen proxy/middleware de auth
- [ ] Proxy/Middleware usa allowlist (no blocklist)
- [ ] (Next.js 16+) Se usa `proxy.ts` en lugar del deprecado `middleware.ts`
- [ ] Todas las tablas de Supabase tienen RLS habilitado
- [ ] Las políticas RLS son correctas para cada operación
- [ ] No se usa service_role key en el cliente
- [ ] Las funciones SECURITY DEFINER son seguras
- [ ] Los inputs se validan y sanitizan
- [ ] CORS está configurado correctamente
- [ ] Headers de seguridad están presentes
```