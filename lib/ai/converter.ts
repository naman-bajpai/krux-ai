/**
 * AI ABAP → S/4HANA Converter
 *
 * Prerequisites:
 *   npm install @anthropic-ai/sdk
 *   ANTHROPIC_API_KEY=sk-ant-... in your .env
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { MigrationObject, ObjectType } from "@prisma/client";

// ─── Pricing (claude-sonnet-4-5) ─────────────────────────────────────────────

const PRICING = {
  model: "claude-sonnet-4-5" as const,
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
  cacheReadPerMillion: 0.3, // 10% of input — prompt cache hit
};

// ─── S/4HANA Table Renames ────────────────────────────────────────────────────

const S4_TABLE_RENAMES: Record<string, string> = {
  // Universal Journal (FI) — direct SELECT on these is blocked in S/4
  BSEG: "ACDOCA",
  BSID: "ACDOCA",
  BSAD: "ACDOCA",
  BSIK: "ACDOCA",
  BSAK: "ACDOCA",
  BSIS: "ACDOCA",
  BSAS: "ACDOCA",
  GLT0: "ACDOCA",
  // Material Documents (MM)
  MKPF: "MATDOC",
  MSEG: "MATDOC",
  // Pricing / Conditions
  KONV: "PRCD_ELEMENTS",
  KONP: "PRCD_ELEMENTS",
  // Sales order scheduling
  VBEP: "VBEP", // still exists but structure changed
};

// ─── Object-type labels ───────────────────────────────────────────────────────

const OBJECT_TYPE_LABELS: Record<string, string> = {
  PROGRAM: "ABAP Program",
  REPORT: "ABAP Report",
  FUNCTION_MODULE: "Function Group / Module",
  CLASS: "ABAP Class",
  INTERFACE: "ABAP Interface",
  TABLE: "Database Table Definition",
  VIEW: "Database View Definition",
  DATA_ELEMENT: "Data Element",
  DOMAIN: "Domain",
  INCLUDE: "Include Program",
  METHOD: "Class Method",
  FORM_ROUTINE: "FORM Routine",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ABAPAnalysis {
  functionModules: string[];
  bapis: string[];
  databaseSelects: string[]; // table names in SELECT ... FROM
  databaseInserts: string[];
  databaseUpdates: string[];
  databaseDeletes: string[];
  calledTransactions: string[];
  enhancementSpots: string[];
  userExits: string[];
  includePrograms: string[];
  classDefinitions: string[];
  hasObsoleteSyntax: boolean;
  obsoleteSyntaxPatterns: string[];
  s4ImpactedTables: Array<{ original: string; replacement: string }>;
}

export interface ConversionCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface ConversionResult {
  convertedCode: string;
  confidenceScore: number; // 1–10 (10 = highest)
  confidenceReasoning: string;
  breakingChanges: string[];
  manualReviewRequired: boolean;
  reviewReasons: string[];
  transformationNotes: string[];
  cost: ConversionCost;
  abapAnalysis: ABAPAnalysis;
}

// Zod schema to validate Claude's raw JSON response
const ClaudeResponseSchema = z.object({
  converted_code: z.string(),
  confidence_score: z.number().int().min(1).max(10),
  confidence_reasoning: z.string(),
  breaking_changes: z.array(z.string()),
  manual_review_required: z.boolean(),
  review_reasons: z.array(z.string()),
  transformation_notes: z.array(z.string()),
});

export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

// ─── ABAP Parser ──────────────────────────────────────────────────────────────

const OBSOLETE_CHECKS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bENDSELECT\b/i, label: "Nested SELECT loop (ENDSELECT)" },
  { pattern: /\bSELECT\s+\*/i, label: "SELECT * (should use explicit field list)" },
  { pattern: /\bMOVE-CORRESPONDING\b/i, label: "MOVE-CORRESPONDING (use CORRESPONDING)" },
  { pattern: /\bCONCATENATE\b/i, label: "CONCATENATE (use && string operator)" },
  { pattern: /\bCALL\s+SCREEN\b/i, label: "CALL SCREEN (dynpro — review for Fiori)" },
  { pattern: /\bSET\s+PF-STATUS\b/i, label: "SET PF-STATUS (dynpro-specific)" },
  { pattern: /\bINPUT\s+FIELD\b/i, label: "INPUT FIELD (classic dynpro)" },
  { pattern: /\bREFRESH\s+\w/i, label: "REFRESH itab (use CLEAR instead)" },
  { pattern: /\bFREE\s+\w/i, label: "FREE itab (use CLEAR instead)" },
];

/** Collect all regex group-1 captures into a deduplicated array. */
function matchAll1(source: string, pattern: RegExp): string[] {
  return Array.from(
    new Set(Array.from(source.matchAll(pattern)).map((m) => m[1])),
  );
}

export function parseABAP(sourceCode: string): ABAPAnalysis {
  const upper = sourceCode.toUpperCase();

  // ── Function modules ─────────────────────────────────────────────────────
  const functionModules = matchAll1(upper, /CALL\s+FUNCTION\s+'([^']+)'/g);
  const bapis = functionModules.filter((fm) => fm.startsWith("BAPI_"));

  // ── Database operations ──────────────────────────────────────────────────
  const SKIP = new Set(["INTO", "WHERE", "AND", "OR"]);
  const databaseSelects = matchAll1(upper, /\bFROM\s+(\w+)/g).filter(
    (t) => !SKIP.has(t),
  );
  const databaseInserts = matchAll1(upper, /\bINSERT\s+(?:INTO\s+)?(\w+)/g);
  const databaseUpdates = matchAll1(upper, /\bUPDATE\s+(\w+)\s+(?:SET|FROM)/g);
  const databaseDeletes = matchAll1(upper, /\bDELETE\s+(?:FROM\s+)?(\w+)/g);

  // ── Transactions ─────────────────────────────────────────────────────────
  const calledTransactions = matchAll1(upper, /\bCALL\s+TRANSACTION\s+'([^']+)'/g);

  // ── Enhancement spots ────────────────────────────────────────────────────
  const enhancementSpots = matchAll1(upper, /\bENHANCEMENT-SPOT\s+(\w+)/g);

  // ── User exits ───────────────────────────────────────────────────────────
  const userExits = matchAll1(upper, /\bCALL\s+CUSTOMER-FUNCTION\s+'(\d+)'/g);

  // ── Include programs ─────────────────────────────────────────────────────
  const includePrograms = matchAll1(upper, /^\s*INCLUDE\s+(\w+)\s*\./gm);

  // ── Class definitions ────────────────────────────────────────────────────
  const classDefinitions = matchAll1(upper, /\bCLASS\s+(\w+)\s+DEFINITION/g);

  // ── Obsolete syntax ──────────────────────────────────────────────────────
  const obsoleteSyntaxPatterns: string[] = [];
  for (const check of OBSOLETE_CHECKS) {
    if (check.pattern.test(sourceCode)) {
      obsoleteSyntaxPatterns.push(check.label);
    }
  }

  // ── S/4HANA impacted tables ──────────────────────────────────────────────
  const allTables = [
    ...databaseSelects,
    ...databaseInserts,
    ...databaseUpdates,
    ...databaseDeletes,
  ];
  const seenTables = new Map<string, { original: string; replacement: string }>();
  for (const t of allTables) {
    if (S4_TABLE_RENAMES[t] && !seenTables.has(t)) {
      seenTables.set(t, { original: t, replacement: S4_TABLE_RENAMES[t] });
    }
  }
  const s4ImpactedTables = Array.from(seenTables.values());

  return {
    functionModules,
    bapis,
    databaseSelects,
    databaseInserts,
    databaseUpdates,
    databaseDeletes,
    calledTransactions,
    enhancementSpots,
    userExits,
    includePrograms,
    classDefinitions,
    hasObsoleteSyntax: obsoleteSyntaxPatterns.length > 0,
    obsoleteSyntaxPatterns,
    s4ImpactedTables,
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert SAP ABAP developer with 20+ years of experience specializing in S/4HANA migrations.

Your task is to convert legacy ABAP code to be fully compatible with SAP S/4HANA using ABAP 7.5+ syntax.

TRANSFORMATION RULES:
1. SELECT syntax: Replace old-style nested SELECT/ENDSELECT loops with SELECT ... INTO TABLE with FOR ALL ENTRIES or JOINs. Use inline declarations (@DATA or @FINAL).
2. String handling: Replace CONCATENATE with && operator. Replace WRITE TO with string templates \`{ value }\`.
3. Internal tables: Replace REFRESH with CLEAR. Use modern table expressions.
4. Type-safe field symbols and data references: Use CAST and ASSIGN COMPONENT OF STRUCTURE.
5. S/4HANA table access: Never use direct SELECT on compatibility views (BSEG, BSID, BSAD, BSIK, BSAK, BSIS, BSAS, GLT0). Use ACDOCA via CDS views or standard APIs. MKPF/MSEG → use MATDOC. KONV/KONP → use PRCD_ELEMENTS.
6. BAPIs and function modules: Recommend modern OData/CDS/BOPF APIs where BAPI equivalents exist.
7. Enhancements and user exits: Flag these prominently — they require manual review in S/4HANA.
8. Transactions: Flag hardcoded transaction codes that may be replaced by Fiori apps.
9. Authorization checks: Preserve all AUTHORITY-CHECK statements.
10. Performance: Add PACKAGE SIZE for large data reads. Use parallel processing hints where applicable.

CRITICAL INSTRUCTION:
Respond ONLY with a single valid JSON object. No markdown, no code fences, no explanation text outside the JSON.
The JSON must match this exact schema:
{
  "converted_code": "<full converted ABAP source as a string — escape newlines as \\n>",
  "confidence_score": <integer 1-10 where 10=trivial/fully automated, 1=requires complete rewrite>,
  "confidence_reasoning": "<one paragraph explaining the score>",
  "breaking_changes": ["<list each breaking change as a string>"],
  "manual_review_required": <true|false>,
  "review_reasons": ["<reason why manual review is needed>"],
  "transformation_notes": ["<note about each transformation applied>"]
}`;
}

function buildConversionPrompt(
  object: Pick<MigrationObject, "objectType" | "objectName" | "packageName" | "sourceCode">,
  analysis: ABAPAnalysis,
): string {
  const typeLabel = OBJECT_TYPE_LABELS[object.objectType] ?? object.objectType;

  const sections: string[] = [
    `## Object Metadata`,
    `- Type: ${typeLabel} (${object.objectType})`,
    `- Name: ${object.objectName}`,
    `- Package: ${object.packageName ?? "(unknown)"}`,
    ``,
    `## Static Analysis Results`,
  ];

  if (analysis.functionModules.length > 0) {
    sections.push(`- Function Modules called: ${analysis.functionModules.slice(0, 20).join(", ")}`);
  }
  if (analysis.bapis.length > 0) {
    sections.push(`- BAPIs used (consider modern API replacements): ${analysis.bapis.join(", ")}`);
  }
  if (analysis.databaseSelects.length > 0) {
    sections.push(`- Tables accessed (SELECT): ${analysis.databaseSelects.slice(0, 30).join(", ")}`);
  }
  if (analysis.databaseInserts.length > 0) {
    sections.push(`- Tables written (INSERT): ${analysis.databaseInserts.slice(0, 10).join(", ")}`);
  }
  if (analysis.databaseUpdates.length > 0) {
    sections.push(`- Tables updated (UPDATE): ${analysis.databaseUpdates.slice(0, 10).join(", ")}`);
  }
  if (analysis.databaseDeletes.length > 0) {
    sections.push(`- Tables deleted (DELETE): ${analysis.databaseDeletes.slice(0, 10).join(", ")}`);
  }
  if (analysis.calledTransactions.length > 0) {
    sections.push(`- Hardcoded transactions (may be replaced by Fiori): ${analysis.calledTransactions.join(", ")}`);
  }
  if (analysis.enhancementSpots.length > 0) {
    sections.push(`⚠️  Enhancement spots (require S/4 review): ${analysis.enhancementSpots.join(", ")}`);
  }
  if (analysis.userExits.length > 0) {
    sections.push(`⚠️  User exits (require re-implementation as BADIs): ${analysis.userExits.join(", ")}`);
  }
  if (analysis.s4ImpactedTables.length > 0) {
    const impacted = analysis.s4ImpactedTables
      .map((t) => `${t.original}→${t.replacement}`)
      .join(", ");
    sections.push(`🔴 S/4HANA incompatible tables: ${impacted}`);
  }
  if (analysis.hasObsoleteSyntax) {
    sections.push(`⚠️  Obsolete syntax detected: ${analysis.obsoleteSyntaxPatterns.join("; ")}`);
  }

  sections.push(
    ``,
    `## Source Code to Convert`,
    `\`\`\`abap`,
    object.sourceCode,
    `\`\`\``,
    ``,
    `Convert the above to S/4HANA-compatible ABAP 7.5+. Apply all applicable transformation rules. Return ONLY the JSON response.`,
  );

  return sections.join("\n");
}

// ─── Cost Calculator ──────────────────────────────────────────────────────────

function calculateCost(usage: Anthropic.Usage): ConversionCost {
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheReadTokens =
    ((usage as unknown) as Record<string, number>).cache_read_input_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  // Tokens read from cache are charged at the cache-read rate, not the full input rate
  const billableInputTokens = inputTokens - cacheReadTokens;
  const estimatedCostUsd =
    (billableInputTokens / 1_000_000) * PRICING.inputPerMillion +
    (cacheReadTokens / 1_000_000) * PRICING.cacheReadPerMillion +
    (outputTokens / 1_000_000) * PRICING.outputPerMillion;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    totalTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000, // 6 decimal places
  };
}

// ─── JSON Extractor ───────────────────────────────────────────────────────────

function extractJSON(text: string): string {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new ConversionError(`No JSON object found in Claude response. Raw: ${text.slice(0, 200)}`);
  }
  return stripped.substring(start, end + 1);
}

// ─── ABAPConverter ────────────────────────────────────────────────────────────

export class ABAPConverter {
  private readonly client: Anthropic;
  private readonly systemPrompt: string;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.systemPrompt = buildSystemPrompt();
  }

  /**
   * Convert a single MigrationObject using Claude.
   * Streams the response to avoid HTTP timeouts on large code files.
   */
  async convertObject(object: MigrationObject): Promise<ConversionResult> {
    const analysis = parseABAP(object.sourceCode);
    const userPrompt = buildConversionPrompt(object, analysis);

    // Stream to avoid timeouts — finalMessage() collects the full response
    const stream = this.client.messages.stream({
      model: PRICING.model,
      max_tokens: 8192,
      // Cache the system prompt across calls (5-min TTL, ~90% cheaper on cache hits)
      system: [
        {
          type: "text" as const,
          text: this.systemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    let response: Anthropic.Message;
    try {
      response = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new ConversionError("Claude rate limit hit — retry after backoff", err);
      }
      if (err instanceof Anthropic.APIError) {
        throw new ConversionError(`Claude API error ${err.status}: ${err.message}`, err);
      }
      throw new ConversionError("Unexpected error calling Claude", err);
    }

    // Extract text from the response
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      throw new ConversionError("Claude returned no text content");
    }

    // Parse and validate the JSON response
    let parsed: z.infer<typeof ClaudeResponseSchema>;
    try {
      const jsonStr = extractJSON(textBlock.text);
      const raw = JSON.parse(jsonStr);
      parsed = ClaudeResponseSchema.parse(raw);
    } catch (err) {
      throw new ConversionError(
        `Failed to parse Claude's JSON response: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    const cost = calculateCost(response.usage);

    // Automatically flag for review if confidence < 7
    const manualReviewRequired =
      parsed.manual_review_required ||
      parsed.confidence_score < 7 ||
      analysis.enhancementSpots.length > 0 ||
      analysis.userExits.length > 0;

    const reviewReasons = [...parsed.review_reasons];
    if (parsed.confidence_score < 7 && !reviewReasons.includes("Low confidence score")) {
      reviewReasons.unshift(
        `Low confidence score (${parsed.confidence_score}/10) — automated conversion may be incomplete`,
      );
    }
    if (analysis.enhancementSpots.length > 0) {
      reviewReasons.push("Contains enhancement spots requiring S/4HANA re-implementation");
    }
    if (analysis.userExits.length > 0) {
      reviewReasons.push("Contains user exits that must be migrated to BADIs");
    }

    return {
      convertedCode: parsed.converted_code,
      confidenceScore: parsed.confidence_score,
      confidenceReasoning: parsed.confidence_reasoning,
      breakingChanges: parsed.breaking_changes,
      manualReviewRequired,
      reviewReasons,
      transformationNotes: parsed.transformation_notes,
      cost,
      abapAnalysis: analysis,
    };
  }

  /** Quick pre-scan: estimate conversion complexity using a short prompt + Haiku. */
  async preScan(
    object: Pick<MigrationObject, "id" | "objectName" | "objectType" | "sourceCode">,
  ): Promise<{ objectId: string; estimatedConfidence: number; complexity: "low" | "medium" | "high" }> {
    const snippet = object.sourceCode.slice(0, 3000);
    const analysis = parseABAP(snippet);

    // Use heuristics first to avoid an API call for trivial objects
    const heuristicScore = computeHeuristicScore(analysis, object.sourceCode);
    if (heuristicScore !== null) {
      return {
        objectId: object.id,
        estimatedConfidence: heuristicScore,
        complexity: confidenceToComplexity(heuristicScore),
      };
    }

    // Fall back to Haiku for ambiguous objects
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 128,
      system:
        'You are an ABAP migration expert. Respond ONLY with valid JSON: {"confidence": <1-10>, "complexity": "low|medium|high"}',
      messages: [
        {
          role: "user",
          content: `Rate S/4HANA conversion difficulty for this ${object.objectType} named "${object.objectName}". Confidence 10=trivial, 1=full rewrite. Snippet:\n${snippet}`,
        },
      ],
    });

    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    try {
      const { confidence, complexity } = JSON.parse(extractJSON(text));
      return {
        objectId: object.id,
        estimatedConfidence: Number(confidence),
        complexity,
      };
    } catch {
      // Default to medium if parse fails
      return { objectId: object.id, estimatedConfidence: 6, complexity: "medium" };
    }
  }
}

// ─── Heuristics ───────────────────────────────────────────────────────────────

/** Returns a confidence estimate without an API call, or null if uncertain. */
function computeHeuristicScore(analysis: ABAPAnalysis, source: string): number | null {
  const lines = source.split("\n").length;
  const hasImpactedTables = analysis.s4ImpactedTables.length > 0;
  const hasExits = analysis.userExits.length > 0 || analysis.enhancementSpots.length > 0;
  const isMetaOnly = ["TABLE", "VIEW", "DATA_ELEMENT", "DOMAIN"].some((t) =>
    source.toUpperCase().includes(`* SAP ${t}`),
  );

  if (isMetaOnly) return 9; // DDIC metadata serializations — easy
  if (lines < 30 && !hasImpactedTables && !hasExits) return 9;
  if (hasExits && hasImpactedTables) return 3;
  if (hasImpactedTables && lines > 200) return 4;
  if (hasExits) return 5;
  return null; // Need API pre-scan
}

function confidenceToComplexity(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 8) return "low";
  if (confidence >= 5) return "medium";
  return "high";
}
