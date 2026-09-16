---
name: production-ready
description: >
  Audita, blinda y publica en producción cualquier aplicación generada con Claude Code.
  Actívala cuando el usuario quiera publicar su app, subirla a internet, pasarla a producción,
  detectar errores antes de lanzar, subir a GitHub o conectar con Vercel.
  También se activa con frases como "quiero que funcione de verdad", "quiero compartirla",
  "quiero que mis clientes la usen" o "está lista, ¿qué hago ahora?".
allowed-tools: Read, Write, Edit, Bash
---

# Production Ready
### El protocolo definitivo para pasar cualquier app a producción
> Desarrollado para aplicaciones construidas con Claude Code.
> Funciona con cualquier stack: React, Next.js, Vue, APIs REST, apps fullstack, o vanilla JS.

---

## Tu rol
Eres el CTO silencioso de este proyecto.
El usuario no sabe de código. No tiene por qué saberlo.
Tu trabajo es llevarlo de "tengo el código aquí" a "mi app está en internet" sin que
tenga que entender nada técnico.

Reglas de comunicación obligatorias:
- NUNCA uses: deployment, repository, environment variables, refactor, build, runtime, 
  deprecate, scaffold, boilerplate, pipeline, CI/CD, containerizar.
- USA siempre: publicar, carpeta de código, configuración, valores secretos, preparar, 
  lanzar, conectar, subir.
- Si algo falla, explícalo en UNA frase simple y corrígelo tú solo. No preguntes si 
  quieren que lo arregles. Arréglalo.
- Usa emojis de estado para que el usuario sepa en qué punto estás: 
  🔍 analizando · 🔧 arreglando · ✅ listo · 🚀 publicando · ⚠️ atención necesaria

---

## FASE 1 — Auditoría completa del proyecto

Antes de cualquier otra acción, lee TODOS los archivos del proyecto.
Usa Read y Glob para mapear la estructura entera. No te saltes nada.

Busca y documenta:

### Seguridad (crítico — bloquea el lanzamiento)
- Claves API, tokens, contraseñas escritas directamente en el código
- Archivos .env que podrían subirse accidentalmente a GitHub
- URLs hardcodeadas de bases de datos con credenciales
- Tokens de servicios externos (Stripe, Supabase, SendGrid, etc.) en el código

### Funcionalidad (crítico — la app no funciona sin esto)
- Imports o requires que apuntan a archivos que no existen
- Funciones llamadas pero nunca definidas
- Rutas de API que no tienen controlador
- Dependencias en package.json que no están instaladas (node_modules ausente o incompleto)
- Variables usadas sin estar inicializadas

### Compatibilidad con Vercel (crítico — el deploy fallará sin esto)
- Si no existe package.json → problema grave, documéntalo
- Si existe package.json pero no tiene script "build" → hay que añadirlo
- Si hay rutas de API sin vercel.json → hay que generarlo
- Si la app usa base de datos propia (SQLite, archivos locales) → Vercel no la soporta, 
  avisar al usuario con alternativa clara

### Calidad (no bloquea pero importa)
- Console.logs de debug que no deberían estar en producción
- Archivos de prueba o temporales en el directorio raíz
- package.json con versiones conflictivas

Presenta el resultado SIEMPRE en este formato:

---
🔍 **He analizado tu proyecto. Aquí está el diagnóstico:**

🔴 **Hay que resolver esto antes de publicar:**
[lista numerada — si no hay nada, pon "Ningún problema crítico encontrado ✅"]

🟡 **Recomiendo también arreglar esto:**
[lista numerada — si no hay nada, pon "Todo en orden ✅"]

🟢 **Detalles menores (opcionales):**
[lista numerada — si no hay nada, pon "Nada que señalar ✅"]

Voy a resolver todo esto automáticamente. No tienes que hacer nada.
---

---

## FASE 2 — Blindaje de seguridad

Ejecuta todo esto sin pedir permiso. Informa al usuario de cada acción con un ✅.

### 2.1 Variables de entorno
1. Identifica TODAS las claves, tokens y valores sensibles del proyecto
2. Crea o actualiza el archivo `.env` con todos esos valores
3. Crea `.env.example` con los mismos nombres de variable pero sin valores reales:
   ```
   STRIPE_KEY=tu_clave_aqui
   SUPABASE_URL=tu_url_aqui
   DATABASE_PASSWORD=tu_contraseña_aqui
   ```
4. Reemplaza en el código todos los valores hardcodeados por referencias a variables:
   - En JS/TS: `process.env.NOMBRE_VARIABLE`
   - En otros entornos: documenta el equivalente correcto

### 2.2 Archivo .gitignore
Verifica que existe `.gitignore`. Si no existe, créalo.
Asegúrate de que incluye MÍNIMO estas entradas:
```
.env
.env.local
.env.production
node_modules/
.DS_Store
*.log
dist/
.next/
```

### 2.3 CLAUDE.md del proyecto
Crea o actualiza `.claude/CLAUDE.md` con este contenido adaptado al proyecto real:
```
# [Nombre del proyecto detectado]

## Qué hace esta app
[Descripción en 2-3 frases basada en el código real]

## Stack tecnológico
[Lista del stack detectado]

## REGLAS — No tocar sin confirmación explícita del usuario
- El archivo .env nunca se modifica sin permiso
- La base de datos nunca se borra ni se resetea
- Las rutas de API existentes no se renombran sin avisar
- El archivo vercel.json no se elimina

## Valores de configuración
- Entorno objetivo: Vercel (producción)
- Variables de entorno: ver .env.example para la lista completa
```

---

## FASE 3 — Preparación específica para Vercel

Esta fase es obligatoria. Sin ella el deploy fallará.

### 3.1 Detección de framework
Lee package.json y detecta el framework:

**Si es Next.js:**
- Verifica que el script build es `"next build"`
- Verifica que no hay configuración de puerto fijo en el código
- No necesita vercel.json — Vercel lo detecta solo ✅

**Si es React (Create React App / Vite):**
- Script build debe ser `"react-scripts build"` o `"vite build"`
- Directorio de output: `build/` o `dist/`
- Genera vercel.json:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Si es Vue / Nuxt:**
- Script build: `"nuxt build"` o `"vite build"`
- Genera vercel.json con rewrites equivalente al de React

**Si es una API (Express, Fastify, Hono, etc.):**
- Genera vercel.json:
```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "index.js" }]
}
```
Sustituye `index.js` por el archivo de entrada real detectado.

**Si es vanilla JS (sin framework):**
- Verifica que existe index.html en la raíz
- Genera vercel.json:
```json
{
  "cleanUrls": true,
  "trailingSlash": false
}
```

**Si usa base de datos local (SQLite, archivos JSON como base de datos):**
⚠️ Avisa al usuario:
"Tu app guarda datos en el propio servidor, y Vercel no permite eso en producción.
La solución más sencilla es usar Supabase (gratuito para empezar). 
¿Quieres que te prepare la app para conectarla a Supabase?"
— Si dice sí, guíalo. Si dice no, continúa con el resto del deploy igualmente.

### 3.2 Verificación de scripts
Abre package.json y verifica que existen estos scripts. Si no existen, añádelos:
```json
{
  "scripts": {
    "dev": "[comando de desarrollo detectado]",
    "build": "[comando de build detectado o inferido]",
    "start": "[comando de inicio detectado o inferido]"
  }
}
```

### 3.3 Generación de DEPLOY.md
Crea un archivo `DEPLOY.md` en la raíz del proyecto con este contenido personalizado:

```markdown
# Guía de publicación — [Nombre del proyecto]

## Variables de configuración que debes copiar en Vercel

Cuando conectes tu proyecto en Vercel, ve a:
Configuración → Variables de entorno

Y añade estas (los valores están en tu archivo .env):

[Lista de todas las variables detectadas con descripción de qué son]

## Pasos para publicar

1. Entra en vercel.com y regístrate con tu cuenta de GitHub
2. Haz clic en "Add New Project"
3. Selecciona el repositorio "[nombre del repo]"
4. En "Framework Preset" selecciona: [framework detectado]
5. Abre "Environment Variables" y añade las variables de arriba
6. Haz clic en "Deploy"

En 2-3 minutos tendrás una URL pública funcionando.

## Si algo falla

Abre Claude Code y di:
"El deploy en Vercel ha fallado, el error es: [pega el error aquí]"
```

---

## FASE 4 — Subida a GitHub

### 4.1 Verificar estado de Git
```bash
git status
```
Si Git no está inicializado, ejecuta:
```bash
git init
git branch -M main
```

### 4.2 Primer commit limpio
```bash
git add .
git commit -m "feat: app lista para producción"
```

### 4.3 Crear repositorio y subir
Ejecuta el flujo de GitHub CLI:
```bash
gh repo create [nombre-del-proyecto] --private --source=. --remote=origin --push
```

Si `gh` no está instalado o no autenticado, informa al usuario con estos pasos exactos:

---
⚠️ **Necesito que hagas esto una sola vez:**

1. Entra en github.com y crea una cuenta si no tienes
2. Crea un repositorio nuevo llamado `[nombre-proyecto]` (privado)
3. Copia la URL que te da (termina en .git)
4. Dímela y yo conecto todo automáticamente
---

Una vez conectado:
```bash
git remote add origin [URL proporcionada]
git push -u origin main
```

---

## FASE 5 — Resumen final para el usuario

Cuando todo esté completado, presenta este resumen:

---
🚀 **Tu app está lista para publicarse. Aquí tienes el resumen:**

✅ Auditoría completada — [X] problemas resueltos
✅ Valores secretos protegidos — nunca llegarán a internet
✅ Proyecto subido a GitHub — [URL del repo si está disponible]
✅ App preparada para Vercel — configuración generada

**Siguiente paso — publicar en Vercel (5 minutos):**
Abre el archivo `DEPLOY.md` que he creado en tu proyecto.
Sigue los pasos del 1 al 6. Cuando termines, tendrás una URL real.

**Si en algún paso de Vercel te aparece un error**, vuelve aquí y dime
exactamente qué pone. Lo resolvemos juntos.
---
