import { describe, it, expect } from 'vitest';
import { SchemaType, type Schema } from '@google/generative-ai';
import { toOpenAiSchema, toAnthropicSchema, type JsonSchemaNode } from './response-schema.js';
import { GEMINI_RESPONSE_SCHEMA } from '@/modules/analysis/analysis.zod.js';

/** Walk every object node in a converted schema. */
function objectNodes(node: JsonSchemaNode, found: JsonSchemaNode[] = []): JsonSchemaNode[] {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (types.includes('object')) found.push(node);
    if (node.properties) for (const child of Object.values(node.properties)) objectNodes(child, found);
    if (node.items) objectNodes(node.items, found);
    return found;
}

describe('toOpenAiSchema', () => {
    const converted = toOpenAiSchema(GEMINI_RESPONSE_SCHEMA);

    it('lists every property as required', () => {
        // OpenAI strict mode rejects a schema outright if `required` omits any property, so
        // this is not a style preference — the request 400s without it. Our canonical schema
        // requires only some fields (currency, baseSalary, totalCTC out of a dozen).
        for (const node of objectNodes(converted)) {
            expect(Object.keys(node.properties ?? {}).sort()).toEqual([...(node.required ?? [])].sort());
        }
    });

    it('closes every object to extra keys', () => {
        // Open objects are how the "16 different shapes" problem started.
        for (const node of objectNodes(converted)) {
            expect(node.additionalProperties).toBe(false);
        }
    });

    it('expresses optionality as a nullable union instead', () => {
        // Since everything is `required`, "may be absent" has to be carried by the type.
        const company = converted.properties?.extractedData?.properties?.companyName;
        expect(company?.type).toEqual(['string', 'null']);
    });

    it('keeps the descriptions, which are prompt engineering not type info', () => {
        const ctc = converted.properties?.extractedData?.properties?.compensation?.properties?.totalCTC;
        expect(ctc?.description).toContain('lakh');
    });

    it('preserves enums and drops the Gemini-only enum format marker', () => {
        const severity = converted.properties?.redFlags?.items?.properties?.severity;
        expect(severity?.enum).toContain('high');
        expect(severity).not.toHaveProperty('format');
    });

    it('converts array item schemas', () => {
        expect(converted.properties?.redFlags?.items?.properties?.matchedText).toBeDefined();
    });
});

describe('toAnthropicSchema', () => {
    const converted = toAnthropicSchema(GEMINI_RESPONSE_SCHEMA);

    it('keeps only the originally required fields', () => {
        // Anthropic does not impose strict mode, so the real contract is preserved rather
        // than widened.
        const comp = converted.properties?.extractedData?.properties?.compensation;
        expect(comp?.required).toEqual(['currency', 'baseSalary', 'totalCTC']);
    });

    it('still closes objects and keeps descriptions', () => {
        for (const node of objectNodes(converted)) {
            expect(node.additionalProperties).toBe(false);
        }
        expect(converted.properties?.extractedData?.description ?? '').not.toBe(undefined);
    });
});

describe('conversion of hand-built nodes', () => {
    it('handles a nullable object', () => {
        const schema = {
            type: SchemaType.OBJECT,
            properties: {
                inner: { type: SchemaType.OBJECT, nullable: true, properties: { a: { type: SchemaType.STRING } } },
            },
        } as Schema;

        const out = toOpenAiSchema(schema);
        expect(out.properties?.inner?.type).toEqual(['object', 'null']);
        expect(out.properties?.inner?.required).toEqual(['a']);
    });

    it('defaults a typeless node to string rather than emitting undefined', () => {
        const out = toOpenAiSchema({ properties: { a: {} } } as unknown as Schema);
        expect(out.properties?.a?.type).toBe('string');
    });

    it('does not share mutable state with the source schema', () => {
        // The canonical schema is a module-level constant reused on every request. A
        // converter that returned references into it could corrupt it for the next caller.
        const first = toOpenAiSchema(GEMINI_RESPONSE_SCHEMA);
        first.required?.push('injected');
        const second = toOpenAiSchema(GEMINI_RESPONSE_SCHEMA);
        expect(second.required).not.toContain('injected');
    });
});
