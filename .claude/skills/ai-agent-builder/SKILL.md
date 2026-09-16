---
name: ai-agent-builder
description: Construye agentes de IA reales: con herramientas (tool use), memoria, RAG, evaluación y deploy. Usa Anthropic SDK / Vercel AI SDK / OpenAI según el caso. Usar cuando el usuario pida "crear un agente IA", "chatbot inteligente", "asistente con IA", "bot que haga X", "RAG", "agente con herramientas", "Claude con funciones", "conectar IA con mis datos" o quiera construir un producto AI. Entrega arquitectura + código funcional + prompts + evaluación.
---

# AI Agent Builder

Agentes que funcionan en producción. No demos de chat con 3 funciones: sistemas con tool use, memoria, guardrails, eval y observabilidad.

## Principios

1. **Un agente es un LLM en un bucle con herramientas**. Nada más místico.
2. **Empieza simple**: single-turn → multi-turn → tool use → multi-agent. No saltes pasos.
3. **El prompt es producto**. Versiona, testea, itera como código.
4. **Eval > intuición**. Sin dataset de casos, no sabes si mejora o empeora.
5. **Guardrails son capas**, no reglas en el prompt. Input check → LLM → Output check.

## Arquitectura base

```
Usuario input
   → Input guardrails (PII, prompt injection, off-topic)
   → Context retrieval (RAG si aplica)
   → LLM con tools
       ↺ Tool calling loop (máx N iteraciones)
   → Output guardrails (facts, safety, formato)
   → Response al usuario
   → Logging + eval dataset update
```

## Fase 1 — Definición del agente

Antes de codear, responde:

1. **¿Qué problema específico resuelve?** (una frase)
2. **¿Con quién habla?** (un solo persona, definido)
3. **¿Qué herramientas necesita?** (lista 3-8, no más al empezar)
4. **¿Qué conocimiento base?** (documentos, BBDD, APIs)
5. **¿Memoria entre sesiones?** (sí / no / resumen)
6. **¿Criterio de éxito?** (métrica medible)
7. **¿Fallback si no sabe?** (deriva a humano, "no puedo ayudar con eso")

## Fase 2 — Elección de stack

| Necesidad | Stack |
|---|---|
| Agente simple con tools | Anthropic SDK directo (Claude) |
| Streaming + multi-provider | Vercel AI SDK |
| Multi-agente con grafo | LangGraph |
| RAG sobre muchos docs | LlamaIndex + Pinecone/Supabase |
| Voice agent | Livekit + Cartesia + Deepgram |
| Agente con memoria larga | Mem0 o custom vector store |

**Default recomendado**: Anthropic SDK + Vercel AI SDK + Supabase (vector + DB).

## Fase 3 — Prompt del sistema

Estructura en secciones:

```
# Identity
Eres [nombre], asistente de [empresa] especializado en [dominio].

# Audience
Hablas con [persona]. Ellos saben [X], no saben [Y]. Les importa [Z].

# Capabilities
Puedes:
- [Capacidad 1]
- [Capacidad 2]

Herramientas disponibles:
- [tool_1]: úsala cuando [condición]
- [tool_2]: úsala cuando [condición]

# Constraints
NO puedes:
- Dar consejo [legal/médico/financiero] específico
- Acceder a datos de otros usuarios
- Prometer plazos sin verificar disponibilidad
- Inventar información: si no sabes, di "no tengo esa información".

# Style
- Tono: [profesional pero cercano / técnico / casual]
- Longitud: respuestas concisas (<150 palabras salvo que pidan detalle)
- Formato: markdown con listas cuando ayude
- Idioma: espejar el del usuario

# Safety
Si el usuario pide algo peligroso/ilegal/fuera de scope:
- Reconoce la pregunta
- Explica por qué no puedes
- Ofrece alternativa si hay

# Escalation
Si no puedes ayudar tras 2 intentos, usa tool `escalate_to_human` con resumen.
```

**Claves del prompt**:
- Usa XML tags (Claude responde mejor con estructura XML)
- Pon ejemplos few-shot para casos edge
- Reglas en positivo: "haz X" > "no hagas Y"
- Evita "NO HAGAS X BAJO NINGÚN CONCEPTO" (los LLMs lo interpretan raro)

## Fase 4 — Tool use

Cada herramienta tiene:

```typescript
{
  name: "search_orders",
  description: "Busca órdenes del usuario por fecha, estado o ID. Usar cuando el usuario pregunta por el estado de sus compras.",
  input_schema: {
    type: "object",
    properties: {
      order_id: { type: "string", description: "ID numérico de la orden" },
      date_from: { type: "string", format: "date" },
      status: { type: "string", enum: ["pending", "shipped", "delivered"] }
    }
  }
}
```

**Principios**:
- **Descripción rica**: el LLM elige la tool por su description. Escríbelas como si fueran para otro dev.
- **Inputs tipados**: usa `enum` donde puedas, restringe formatos
- **Errores ricos**: devuelve tool_result con mensaje útil si falla, no "error"
- **Idempotencia**: tools de escritura deben tener idempotency key
- **Confirmación para destructivas**: tools que borran/mueven $$, pide confirm al usuario primero

## Fase 5 — RAG (si aplica)

Cuándo SÍ usar RAG:
- Knowledge base propia con >20 documentos
- Info cambia frecuentemente (no querer re-entrenar)
- Usuarios preguntan "sobre tu producto/docs/policies"

Cuándo NO usar RAG:
- Problema se resuelve con 1 prompt + 2k tokens de contexto estático
- Solo tienes 5 documentos (mételos en system prompt)
- El task es razonamiento, no recuperación

**Pipeline RAG mínimo viable**:

```
1. Ingest:
   - Chunk docs (500-1000 tokens, overlap 100)
   - Embed con text-embedding-3-small (cheap + good)
   - Store en Supabase pgvector / Pinecone

2. Query time:
   - Embed query
   - Retrieve top-k (k=5-10) por similitud
   - Rerank opcional (Cohere Rerank, bge-reranker)
   - Inyectar en prompt como contexto

3. Respuesta:
   - LLM responde citando fuentes
   - Si no hay match relevante (score <threshold): "no tengo información sobre eso"
```

**Mejoras avanzadas**:
- **Query rewriting**: LLM reformula query antes de embedar
- **Hybrid search**: BM25 + vector (bge-m3 hace ambos)
- **Metadata filtering**: filtra por user_id, fecha, categoría antes de semantic
- **Parent-child chunking**: chunks pequeños para recall + parent grande para context

## Fase 6 — Memoria

Tipos:

- **Sesión**: conversación actual, en contexto directo
- **Resumen conversacional**: tras N turns, resume y reemplaza historia
- **Hechos usuario**: fact extraction → vector store personal ("el usuario prefiere respuestas cortas")
- **Episodic**: eventos pasados ("el 3 de marzo pidió refund")

Implementación básica con Mem0:

```typescript
import { Mem0Client } from "mem0ai";
const mem0 = new Mem0Client();

// Al inicio de cada turn
const memories = await mem0.search({ user_id, query: userMessage, limit: 5 });
const context = memories.map(m => m.text).join("\n");

// En el prompt:
// "Context about user: {context}"

// Después del turn
await mem0.add({ user_id, messages: [...] });
```

## Fase 7 — Guardrails

**Input guardrails** (antes del LLM):
- Prompt injection: detectar "ignore previous instructions", etc.
- PII: detectar y redactar DNIs, tarjetas, emails si no deben pasar
- Topic: si mensaje off-topic, responde fuera de scope
- Toxicity: filtro de lenguaje abusivo

**Output guardrails** (tras el LLM):
- Hallucination: verificar citas / facts si es crítico
- Formato: validar que cumple schema esperado
- Safety: filtro de outputs peligrosos
- Coherencia: si la respuesta contradice contexto, re-generar

Implementación: segundo LLM más barato (Haiku, GPT-4o-mini) que valida.

## Fase 8 — Evaluación

Un agente sin eval es un agente roto que no sabes cuándo romper más.

**Crea un dataset de eval** desde el día 1:
- 20-50 casos reales (copia de logs)
- Cada caso: input + expected behavior (no necesariamente output exacto)

**Tipos de eval**:
- **Exact match**: para tasks estructurados (extract email → email correcto)
- **LLM-as-judge**: otro LLM puntúa respuesta 1-5 según criterio
- **Pairwise**: comparar versión A vs B, humano elige cuál es mejor
- **Trajectory**: en agentes con tools, validar secuencia de tool calls

Tools: Braintrust, Langsmith, Langfuse, Humanloop o custom script.

**Regla**: no hagas cambios al prompt sin correr eval antes Y después.

## Fase 9 — Observabilidad

Loguea cada request:
- Input completo
- System prompt version
- Tools disponibles
- Tool calls y sus resultados
- Output final
- Latencia, tokens, coste
- Feedback usuario (thumbs up/down)

Herramientas: Langfuse (open source, self-host), Helicone, Datadog LLM, OpenTelemetry + Logfire.

## Fase 10 — Deploy

- **Backend**: Next.js API routes / Vercel Edge / Cloudflare Workers / Modal
- **Streaming**: usa Server-Sent Events o Vercel AI SDK's `streamText`
- **Rate limiting**: por user_id (Upstash Redis)
- **Caching**: Anthropic Prompt Caching para system prompts largos (-90% coste)
- **Fallbacks**: si provider cae, fallback a otro

## Patrón de código (Anthropic SDK + tools)

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const tools = [/* ver Fase 4 */];

async function runAgent(userMessage: string, history: any[]) {
  const messages = [...history, { role: "user", content: userMessage }];

  for (let i = 0; i < 10; i++) { // max 10 iteraciones
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools,
      messages
    });

    if (response.stop_reason === "end_turn") {
      return response.content;
    }

    if (response.stop_reason === "tool_use") {
      const toolUse = response.content.find(c => c.type === "tool_use");
      const result = await executeTool(toolUse.name, toolUse.input);
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        }]
      });
    }
  }

  throw new Error("Agent exceeded max iterations");
}
```

## Anti-patrones

- Prompt de 3000 palabras con 50 reglas (los LLMs olvidan)
- Tools con nombres vagos ("do_thing")
- RAG para responder "hola, ¿cómo estás?"
- Sin eval: "parece que funciona mejor ahora"
- Sin logging: "un usuario dice que el bot dijo algo raro ayer, ¿qué pasó?"
- Agentes "super-generalistas": uno que hace de todo, hace todo mal
- No limitar iteraciones: agente loopea y gasta $100 en una request
- Exponer API key en cliente: NEVER. Siempre backend.
- No cachear system prompt: pagas 100% de tokens cada request

## Checklist pre-producción

- [ ] System prompt versionado en Git
- [ ] Dataset de eval >20 casos con passing rate medido
- [ ] Logging completo en Langfuse/similar
- [ ] Rate limiting por usuario
- [ ] Input guardrails (injection, PII)
- [ ] Output guardrails (safety, format)
- [ ] Fallback a humano si agente no puede
- [ ] Prompt caching activado (Anthropic/OpenAI)
- [ ] Monitorización de coste por request
- [ ] Feedback loop: thumbs up/down en UI
- [ ] Plan para añadir nuevos casos a eval dataset semanalmente

## Cuándo NO construir un agente

- Un flujo determinístico resuelve el 90% de casos
- El task tiene <5 variantes reales (use case de form)
- No tienes presupuesto para mantenerlo (el 80% del coste es post-lanzamiento)
- Los usuarios no tolerarían errores (finanza, salud sin supervisión humana)
