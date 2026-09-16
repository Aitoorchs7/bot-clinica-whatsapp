---
name: deploy
description: "Prepara y despliega la app a producción en Vercel. Usa esta skill cuando el usuario diga 'deploy', 'producción', 'subir', 'publicar', 'ponlo en internet', 'go to production', 'ship it', o cualquier variación de querer que su app esté disponible online. También cuando pida revisar seguridad antes de publicar."
---

# Deploy a producción

Sigue estos pasos EN ORDEN. No te saltes ninguno. Explica al usuario qué haces en cada momento con lenguaje simple, sin tecnicismos innecesarios.

## Paso 1: Auditoría rápida

Busca secretos hardcodeados en el código:

```bash
grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  -E "(sk-|sk_live|password|secret|apikey|api_key|SERVICE_ROLE)" \
  --exclude-dir={node_modules,.next,.git} .
```

Si encuentras alguno:
1. Muévelo a `.env` como `NOMBRE_VARIABLE=valor`
2. En el código usa `process.env.NOMBRE_VARIABLE`
3. Verifica que `.env` está en `.gitignore`

Genera un `.env.example` (sin valores reales) para referencia:

```bash
grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  "process.env\." --exclude-dir={node_modules,.next,.git} . | \
  grep -oP 'process\.env\.\K[A-Z_0-9]+' | sort -u | \
  awk '{print $1"="}' > .env.example
```

## Paso 2: Seguridad básica

### Headers (Next.js)

Añade en `next.config.ts` (o `.js`) dentro de `nextConfig`:

```javascript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }];
},
```

### Supabase (si el proyecto lo usa)

Verifica que en el código del CLIENTE (carpetas `app/`, `components/`, archivos que NO están en `app/api/`) solo se usan:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Si encuentras `SERVICE_ROLE_KEY` en código del cliente, muévelo a una API route. Explica al usuario: "Esta clave da acceso total a tu base de datos. Solo puede estar en el servidor, nunca en el navegador."

Pregunta al usuario: "¿Has activado Row Level Security (RLS) en tus tablas de Supabase?" Si no sabe qué es, explícale brevemente y ofrécete a ayudarle a configurarlo.

### API Routes (si existen en `app/api/`)

Revisa cada ruta y asegúrate de que:
- Tiene un `try/catch` general que devuelve errores genéricos (nunca stack traces)
- Valida los datos que recibe antes de procesarlos
- Elimina cualquier `console.log` de debug

## Paso 3: Verificar que compila

```bash
npm run build
```

Si falla, arréglalo. No tiene sentido desplegar algo roto.

## Paso 4: Deploy a Vercel

```bash
# Instalar Vercel CLI si no está
which vercel || npm install -g vercel

# Login (se abre el navegador para registrarse/entrar)
vercel login

# Subir preview para probar
vercel --yes
```

Dale la URL de preview al usuario y dile que la pruebe.

Dile que configure las variables de entorno:
- "Ve a vercel.com → tu proyecto → Settings → Environment Variables"
- Lista TODAS las variables de su `.env` que necesita copiar

Cuando confirme que funciona:

```bash
vercel --prod --yes
```

## Después del deploy

Para re-desplegar tras cambios:
```bash
npm run build && vercel --prod --yes
```

Para ver si algo ha fallado:
```bash
vercel logs --follow
```
