import type { Schema } from '@google/generative-ai';

/**
 * Translate the canonical response schema into each provider's dialect.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Forcing the model to emit a known shape is the single highest-leverage thing in this
 * codebase: it took structured extraction from 4.2% to ~96%. Before it, the model invented
 * its own key names and returned 16 different shapes across 16 eval cases, none readable.
 *
 * Every provider supports that, and every provider spells it differently:
 *
 *   Gemini     `generationConfig.responseSchema`
 *   OpenAI     `response_format: { type: 'json_schema', json_schema: { strict: true } }`
 *   Anthropic  no JSON mode at all — you declare a tool and read `tool_use.input`
 *
 * Writing three schemas by hand guarantees drift: a field added to one and forgotten in
 * another fails silently, as a quietly-null column. So `GEMINI_RESPONSE_SCHEMA` stays the
 * one declaration and this module converts it.
 *
 * ── WHY NOT GENERATE FROM THE ZOD SCHEMA ─────────────────────────────────────
 * Tempting, since Zod v4 ships `z.toJSONSchema()`. Rejected, because the two schemas are
 * different artifacts that happen to share field names:
 *
 *   - `analysisResultSchema` is a LENIENT PARSER. It is `.preprocess`/`.catch` throughout
 *     because its job is to survive whatever a model actually sends — numbers as strings,
 *     nulls as empty strings, missing objects. Derived from it, the instruction to the model
 *     would say "anything goes", which is the opposite of the point.
 *   - The response schema is a STRICT INSTRUCTION, and its `description` fields are prompt
 *     engineering, not type information. "Expand magnitude words: '5 lakh' is 500000" is
 *     doing real work that no type system expresses.
 *
 * Deriving one from the other would lose the half that matters. Zod validates what arrives;
 * this describes what we asked for.
 *
 * The canonical schema is already JSON-Schema-shaped — Gemini's `SchemaType` values are the
 * JSON Schema type strings — so conversion is close to identity plus three fixups.
 */

export interface JsonSchemaNode {
    type?: string | string[];
    description?: string;
    enum?: string[];
    properties?: Record<string, JsonSchemaNode>;
    required?: string[];
    items?: JsonSchemaNode;
    additionalProperties?: boolean;
}

interface ConvertOptions {
    /**
     * OpenAI's strict structured-output mode, which imposes two extra rules:
     * every object must set `additionalProperties: false`, and `required` must name EVERY
     * property. Optionality is then expressed only through nullable types.
     *
     * Anthropic imposes neither, but both are harmless there and keep the two dialects
     * closer, so the only real difference is where the schema is attached.
     */
    strict: boolean;
}

/**
 * Recursively convert one node.
 *
 * Three fixups:
 *  1. `nullable: true` becomes a union type — `['string', 'null']` — which is how JSON
 *     Schema says it and how both providers read it.
 *  2. Gemini's `format: 'enum'` marker is dropped; `enum` alone carries the meaning, and
 *     OpenAI rejects the unknown format.
 *  3. Under `strict`, every property is listed in `required`. Our canonical schema requires
 *     only some (`['currency', 'baseSalary', 'totalCTC']` out of a dozen), so without this
 *     OpenAI refuses the schema outright. Safe here because almost every leaf is already
 *     nullable, so "required but may be null" preserves the original meaning.
 */
function convertNode(node: Schema, options: ConvertOptions): JsonSchemaNode {
    const source = node as Schema & {
        type?: string;
        nullable?: boolean;
        description?: string;
        enum?: string[];
        properties?: Record<string, Schema>;
        required?: string[];
        items?: Schema;
    };

    const baseType = String(source.type ?? 'string');
    const out: JsonSchemaNode = {
        type: source.nullable ? [baseType, 'null'] : baseType,
    };

    if (source.description) out.description = source.description;
    if (source.enum) out.enum = [...source.enum];

    if (source.properties) {
        out.properties = {};
        for (const [key, child] of Object.entries(source.properties)) {
            out.properties[key] = convertNode(child, options);
        }

        out.required = options.strict
            ? Object.keys(source.properties)
            : [...(source.required ?? [])];

        // Without this the model may add keys of its own invention, which is how the
        // 16-shapes problem started.
        out.additionalProperties = false;
    }

    if (source.items) out.items = convertNode(source.items, options);

    return out;
}

/**
 * OpenAI: `response_format.json_schema.schema`, with `strict: true`.
 *
 * Requires the full-`required` and `additionalProperties: false` treatment throughout, or
 * the API rejects the request rather than degrading.
 */
export function toOpenAiSchema(schema: Schema): JsonSchemaNode {
    return convertNode(schema, { strict: true });
}

/**
 * Anthropic: a tool's `input_schema`.
 *
 * There is no JSON response mode. The shape is enforced by declaring a single tool whose
 * input is the analysis, then forcing the model to call it — the arguments come back
 * already structured, which is more reliable than asking for JSON in prose and parsing it.
 */
export function toAnthropicSchema(schema: Schema): JsonSchemaNode {
    return convertNode(schema, { strict: false });
}
