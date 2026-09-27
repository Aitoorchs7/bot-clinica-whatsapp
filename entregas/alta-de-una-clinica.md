# Dar de alta una clínica

> **Un procedimiento, no cinco.** Hasta F8 esto eran cinco cosas sueltas que
> alguien tenía que recordar, y **cuatro de las cinco no dan ningún error
> cuando faltan**: la clínica queda creada, el panel se ve, la lista de
> tratamientos está bien, y el bot dice el mensaje de urgencia de otra clínica,
> o no manda recordatorios, o nadie puede entrar al panel. Un alta a medias no
> se ve. De ahí este documento y los dos comandos que lo ejecutan.

Son **tres pasos y una cosa manual**. El tercero no dice «apto»: dice cuatro de
cinco, y cuál falta.

---

## 1 · La entrevista → la ficha

    /alta-clinica <nombre de la clínica>

El guion de entrevista está en `.claude/commands/alta-clinica.md`. Pregunta de
una en una, en lenguaje de cliente, y termina escribiendo
**`fichas/<slug>.json`**, que es la única entrada del alta.

La plantilla comentada está en `fichas/ejemplo.json`. Las fichas de clínicas
reales **no se suben al repositorio** (`.gitignore`): llevan correos, teléfonos
y notas internas.

Lo que la entrevista tiene que sacar sí o sí, porque el alta se niega sin ello:

| En la ficha | Por qué se para el alta si falta |
|---|---|
| `wa_phone_number_id` | Sin él, el canal rechaza sus mensajes **y** se queda sin mandar recordatorios |
| `config.politica_privacidad` (pública) | La pide el bloque «05 · Aviso inicial» en el primer mensaje de cada conversación |
| `config.mensaje_urgencia` (público) | Es lo que recibe quien escribe con dolor. Sin ella sale el texto por defecto |
| `usuarios` (al menos un propietario) | Sin usuarios, la clínica tiene panel y no tiene con qué entrar |
| `publico` en **cada** fila de `config`, `tratamientos` y `faq` | No hay valor por defecto: decide si el bot lo ve, y eso no se adivina. Ante la duda, `false` |

**`publico: true` no es decoración.** Una clave obligatoria puesta con
`publico: false` existe en la base y **el bot no la recibe** —la RLS no se la
devuelve—, así que se comporta exactamente igual que si faltara, con la
diferencia de que mirando la base parece que está puesta. El validador lo
rechaza y el acta lo vuelve a mirar desde el lado del bot.

**Si la clínica pide un motivo de visita nuevo** («blanqueamiento», «urgencia
infantil»…), eso **no se apaña en la ficha**: `motivo_visita` es un enum de
Postgres y se amplía **en una migración**. Es lo que mantiene el sistema fuera
del artículo 9 del RGPD. El validador se niega y lo dice.

---

## 2 · El alta

    pnpm alta fichas/<slug>.json

Escribe, de una vez y en este orden: la clínica (con su `wa_phone_number_id`),
gabinetes, horarios, tratamientos, FAQ, `config`, los diez bloques de prompt
—con el mismo lector que usa `pnpm bloques`— y **los usuarios del panel**, con
`rol` y `clinica_id` en `app_metadata`.

De cada usuario no se limita a crearlo: **inicia sesión una vez de verdad** con
una contraseña de un solo uso que no se imprime en ningún sitio, comprueba que
el token emitido lleva sus permisos, y devuelve un **enlace de recuperación**
para que esa persona ponga su contraseña. El enlace caduca y es de un solo uso:
se manda por un canal privado, uno a uno.

Si algo se queda a medias, **se relanza**:

    pnpm alta fichas/<slug>.json --continuar

Completa lo que falte y **no pisa nada de lo que ya hay**. Una clínica que lleve
meses afinando sus respuestas desde el panel no puede perderlas porque alguien
relance el alta. Lo que diverge se informa; no se corrige solo.

El comando **nunca dice «alta completada»**. Termina diciendo lo que falta, que
es siempre esto:

### 2b · El par del canal, y el redespliegue

El alta imprime la línea exacta:

    "<phone_number_id>": "<clinica_id>"

Va en `WHATSAPP_CLINICAS`, **y hay que volver a publicar**. Las dos cosas o
ninguna: la variable sola no llega al sitio publicado hasta el siguiente
despliegue. Mientras tanto, esa clínica no contesta a nadie y **no manda ni un
recordatorio**, que es lo que no nota nadie hasta que un paciente no se presenta.

> Este mapa vive en el entorno y no en la base a propósito: la RLS del rol `bot`
> exige saber de qué clínica eres **antes** de poder leer nada, y resolverlo con
> una consulta sin identidad pediría `service_role` en el camino del bot. Está
> explicado en `src/lib/whatsapp/config.ts`.

---

## 3 · El acta

    pnpm alta:comprobar <slug>

Comprueba **cuatro de los cinco puntos** contra la base de datos de verdad y con
los datos de esa clínica, no contra un fixture:

1. **El canal**, en los dos sentidos: que la fila tenga su `wa_phone_number_id`
   y que `WHATSAPP_CLINICAS` lleve el par. El de ida lo usa el webhook; el de
   vuelta lo usan los recordatorios y la purga.
2. **`mensaje_urgencia`**, mirado en lo que devuelve el mensaje seguro de verdad.
3. **`politica_privacidad`**, mirada **en el prompt montado**, no en la fila.
4. **Los usuarios del panel**: con rol válido en `app_metadata` y —esto es lo
   importante— **ninguno** con `rol` o `clinica_id` en `user_metadata`, que lo
   edita el propio usuario desde el navegador.

Y una comprobación más, que no estaba en la lista de cinco y es la que cierra el
agujero más silencioso: **lo que la clínica marcó es lo que ve el bot**, fila por
fila **contra la ficha**. Lo que la ficha declaró público tiene que llegarle al
bot, y lo que declaró privado **no**. Aquí es donde se caza una FAQ confidencial
publicada por error, que desde dentro de la base **no se distingue** de una
pública: el bot la ve, la RLS funciona y el contador no tiene nada que retener.
Lo único que sabe la diferencia es lo que dijo la clínica, y eso está en la ficha
— por eso la ficha no es opcional aquí.

Y además pasa **la barandilla 4 con sus datos**: las mismas 30 preguntas
adversarias de `tests/fuga/`, contra esta clínica, con un **canario** —tres
filas confidenciales de verdad, con una marca única— sembrado antes y retirado
después, en la misma orden. Sin el canario, «el bot no ve nada confidencial»
podría ser cierto simplemente porque no hay nada confidencial que ver.

**El acta no siembra clínicas de prueba.** Corre con su propia configuración
(`vitest.alta.mts`), sin el `globalSetup` de la suite, precisamente para que se
pueda apuntar a la base donde vive una clínica de verdad.

Si el slug no existe, **el acta se para y lo dice**. No informa de «todo a cero»:
contra una clínica que no está, la RLS no devuelve nada, y cero filas es
indistinguible de «no hay nada que mirar». Es el fallo de la clínica fantasma de
F6, y aquí está cerrado por delante.

---

## 4 · Lo que no se puede comprobar desde el código

**Las plantillas de Meta.** `recordatorio_cita` lleva sus parámetros por
posición: si se aprobaron en otro orden, Meta devuelve 200, el mensaje llega, y
el paciente lee la fecha donde iba su nombre. Sin un solo error.

El procedimiento —y el centinela que lo hace imposible de pasar por alto— está
en **[`plantillas-meta.md`](plantillas-meta.md)**. Se hace una vez por clínica,
con un móvil delante.

---

## Resumen

```
/alta-clinica "Clínica X"          → fichas/clinica-x.json
pnpm alta fichas/clinica-x.json    → base de datos + usuarios del panel
  ↳ añadir el par a WHATSAPP_CLINICAS y VOLVER A PUBLICAR
pnpm alta:comprobar clinica-x      → acta: 4 de 5
  ↳ entregas/plantillas-meta.md    → el quinto, con un móvil delante
```

Mientras el acta no salga, la clínica está **creada**, que no es lo mismo que
**dada de alta**.
