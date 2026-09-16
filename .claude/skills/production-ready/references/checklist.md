# Checklist de producción — Referencia interna

## Seguridad
- [ ] No hay claves API en el código
- [ ] .env existe y está en .gitignore
- [ ] .env.example generado sin valores reales
- [ ] node_modules en .gitignore

## Funcionalidad
- [ ] Todos los imports resueltos
- [ ] Todas las funciones definidas
- [ ] Dependencias instaladas
- [ ] Sin rutas rotas

## Vercel
- [ ] Script "build" existe en package.json
- [ ] Framework detectado y configurado
- [ ] vercel.json generado si necesario
- [ ] Sin base de datos local (o usuario avisado)

## Git
- [ ] .gitignore completo
- [ ] CLAUDE.md creado
- [ ] DEPLOY.md generado
- [ ] Commit limpio realizado
- [ ] Repositorio en GitHub

## Entregado al usuario
- [ ] DEPLOY.md con pasos claros
- [ ] Lista de variables para copiar en Vercel
- [ ] Resumen final presentado
