# Punto 5 · Las plantillas de Meta

> El único de los cinco puntos del alta que **no se puede comprobar desde el
> código**, y el que falla más callado de todos.

## El fallo que se busca

Las tres plantillas llevan sus parámetros **por posición**: `{{1}}`, `{{2}}`,
`{{3}}`… El código los manda en un orden; el panel de Meta los aprueba en otro
si alguien redactó el cuerpo de otra forma. Cuando eso pasa:

- Meta **acepta** el envío y devuelve **200**.
- El mensaje **llega**.
- No hay código de error, ni reintento, ni una línea en el registro.
- Y el paciente lee **la fecha donde iba su nombre**.

No hay ninguna consulta, ninguna prueba y ningún endpoint que distinga ese caso
del correcto. Se ve leyéndolo en un móvil, y de ninguna otra forma.

---

## Las tres plantillas, con su cuerpo aprobado

Todas son **`utility`** y el idioma es **`es_ES`** (no `es`: si no coincide
exactamente, Meta devuelve `132001` y el mensaje no sale).

La categoría no es decoración: un recordatorio redactado como publicidad se
recategoriza a `marketing`, cuesta más, y el paciente que haya desactivado ese
tipo de mensajes **no recibe el recordatorio de su cita** (`131050`).

### `recordatorio_cita` — con dos botones de respuesta rápida

```
Hola {{1}}, te recordamos tu cita en {{2}} el {{3}} a las {{4}}.
```

| Hueco | Qué va | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del paciente | Lucía |
| `{{2}}` | Nombre de la clínica | Clínica Sonrisa Viva |
| `{{3}}` | Fecha | martes 22 de septiembre |
| `{{4}}` | Hora | 10:00 |

Botones, **en este orden**: `Confirmar` (índice 0) y `Cancelar` (índice 1).

### `confirmacion_cita` — sin botones

```
{{1}}, tu cita en {{2}} queda el {{3}} a las {{4}}. Si necesitas cambiarla,
llámanos al {{5}}.
```

`{{5}}` es el teléfono de recepción. Va como parámetro y no escrito dentro de
la plantilla porque cada clínica tiene el suyo y la plantilla se aprueba una vez.

### `aviso_escalado` — va al equipo, **no al paciente**

```
Aviso de {{1}}: hay una conversación que necesita a una persona.
Motivo: {{2}}. Asunto: {{3}}. Teléfono del paciente: {{4}}.
```

**Ni una palabra de lo que escribió el paciente, y no es por brevedad.** El
motivo y el asunto son los dos enums de `escalados`; el detalle se lee abriendo
la conversación, que es lo que la purga de 90 días se lleva. Meter el síntoma en
un WhatsApp lo sacaría de la única tabla que se borra y lo dejaría en el móvil
de recepción para siempre — justo lo que la migración 007 quitó de
`escalados.resumen`. Si alguien «mejora» esta plantilla añadiendo el texto del
paciente, ha reabierto ese agujero.

> La fuente de verdad de estos cuerpos es `src/lib/whatsapp/plantillas.ts`. Hay
> una comprobación que exige que la frase de `recordatorio_cita` siga siendo
> literalmente la misma aquí y allí: dos copias de una frase que nadie compara
> se separan solas.

---

## Cómo se comprueba, con un móvil delante

    pnpm alta:comprobar <slug> --plantilla +34XXXXXXXXX

Manda un **`recordatorio_cita` de verdad**, desde el número de esa clínica, por
la misma función que usa el trabajo de los recordatorios (`enviarPlantilla`), y
con **valores centinela** en vez de datos plausibles:

```
Hola UNO-NOMBRE, te recordamos tu cita en DOS-CLINICA el TRES-FECHA a las CUATRO-HORA.
```

**Por qué centinelas y no un nombre y una fecha de verdad:** con datos
plausibles, un orden cambiado se lee como una frase rara que cualquiera da por
buena a las ocho de la tarde. Con centinelas numerados no hay forma de
confundirse — si sale «te recordamos tu cita en UNO-NOMBRE», está mal, y se ve
desde el otro lado de la habitación.

### Lo que hay que mirar en el móvil

1. Los cuatro centinelas salen **en orden**: UNO, DOS, TRES, CUATRO.
2. Debajo se ven **los dos botones**, Confirmar y Cancelar, en ese orden.
3. **No pulses los botones.** El identificador de cita que va dentro es falso.

**Que Meta haya devuelto 200 no significa nada aquí.** Con el cuerpo cambiado
también devuelve 200. Lo único que lo dice es el móvil.

### Si sale mal

Se corrige **en el panel de Meta**, no en el código. El código manda el orden
correcto —hay una prueba que lo fija— y cambiarlo para que encaje con una
plantilla mal aprobada rompería a todas las demás clínicas.

---

## Antes de todo esto: aprobarlas

En el panel de Meta (WhatsApp Manager > Plantillas de mensajes), por cada
clínica y con su WABA:

1. Crear las tres con **el nombre exacto** de arriba, categoría **utility**,
   idioma **español (España)**.
2. Copiar el cuerpo **tal cual** de este documento.
3. En `recordatorio_cita`, añadir los dos botones de respuesta rápida
   `Confirmar` y `Cancelar`, en ese orden.
4. Esperar la aprobación (suele ser minutos; puede ser horas).
5. **Y entonces** mandar el centinela.

Una plantilla rechazada o en revisión no da error al dar de alta: da error el
día que haya que mandar el primer recordatorio, a las 8 de la mañana.
