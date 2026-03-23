/**
 * Batch ABAP Converter
 *
 * Intelligently routes objects between:
 *   - Anthropic Batch API (50% cheaper) for straightforward conversions
 *   - Individual API calls with full context for complex objects
 *
 * Flow:
 *   1. Pre-scan all objects to estimate conversion difficulty
 *   2. Objects with estimated confidence > 8 → Batch API
 *   3. Objects with confidence ≤ 8 → Individual streaming calls
 *   4. Track cost per object for billing purposes
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Messages } from "@anthropic-ai/sdk/resources";
import type { MigrationObject } from "@prisma/client";
import {
  ABAPConverter,
  parseABAP,
  ConversionError,
  type ConversionResult,
  type ConversionCost,
} from "./converter";

// ─── Pricing ──────────────────────────────────────────────────────────────────

/** claude-sonnet-4-5 batch rates (50% of standard) */
const BATCH_PRICING = {
  model: "claude-sonnet-4-5" as const,
  inputPerMillion: 1.5,
  outputPerMillion: 7.5,
};

/** Threshold: pre-scan confidence > this value → Batch API */
const BATCH_CONFIDENCE_THRESHOLD = 8;

const BATCH_POLL_INTERVAL_MS = 15_000;
const BATCH_MAX_WAIT_MS = 60 * 60 * 1_000; // 1 hour

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreScanResult {
  objectId: string;
  estimatedConfidence: number; // 1–10
  complexity: "low" | "medium" | "high";
  routedToBatch: boolean;
}

export interface BatchConversionSummary {
  totalObjects: number;
  batchProcessed: number;
  individualProcessed: number;
  succeeded: number;
  failed: number;
  totalCostUsd: number;
  costBreakdown: {
    batchCostUsd: number;
    individualCostUsd: number;
    savedVsIndividualUsd: number; // what we saved by using the batch API
  };
  results: Map<string, ConversionResult | Error>;
  preScanResults: PreScanResult[];
}

// ─── BatchConverter ───────────────────────────────────────────────────────────

export class BatchConverter {
  private readonly client: Anthropic;
  private readonly converter: ABAPConverter;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.converter = new ABAPConverter(apiKey);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Convert a list of objects, automatically routing between batch and
   * individual API based on pre-scan complexity estimates.
   */
  async convertBatch(
    objects: MigrationObject[],
    onProgress?: (done: number, total: number, currentName: string) => void,
  ): Promise<BatchConversionSummary> {
    if (objects.length === 0) return emptyBatchSummary();

    // ── Step 1: Pre-scan all objects ──────────────────────────────────────
    console.log(`[BatchConverter] Pre-scanning ${objects.length} objects…`);
    const preScanResults = await this.preScanAll(objects);

    const batchIds = new Set(
      preScanResults.filter((r) => r.routedToBatch).map((r) => r.objectId),
    );
    const batchObjects = objects.filter((o) => batchIds.has(o.id));
    const individualObjects = objects.filter((o) => !batchIds.has(o.id));

    console.log(
      `[BatchConverter] Routing: ${batchObjects.length} → Batch API, ` +
        `${individualObjects.length} → Individual`,
    );

    const results = new Map<string, ConversionResult | Error>();
    let batchCostUsd = 0;
    let individualCostUsd = 0;
    let done = 0;

    // ── Step 2: Batch API (easy objects) ──────────────────────────────────
    if (batchObjects.length > 0) {
      const batchResults = await this.processViaBatchAPI(batchObjects);
      for (const [objectId, result] of Array.from(batchResults.entries())) {
        results.set(objectId, result);
        if (!(result instanceof Error)) batchCostUsd += result.cost.estimatedCostUsd;
        done++;
        const obj = objects.find((o) => o.id === objectId);
        onProgress?.(done, objects.length, obj?.objectName ?? objectId);
      }
    }

    // ── Step 3: Individual calls (complex objects) ────────────────────────
    for (const object of individualObjects) {
      try {
        const result = await this.converter.convertObject(object);
        results.set(object.id, result);
        individualCostUsd += result.cost.estimatedCostUsd;
      } catch (err) {
        const error = err instanceof Error ? err : new ConversionError(String(err));
        results.set(object.id, error);
        console.error(
          `[BatchConverter] Failed: ${object.objectName} — ${error.message}`,
        );
      }
      done++;
      onProgress?.(done, objects.length, object.objectName);
    }

    const totalCostUsd = batchCostUsd + individualCostUsd;
    // Batch objects were billed at 50% rate — the saving is equal to the batch cost
    const savedVsIndividualUsd = batchCostUsd;

    const resultValues = Array.from(results.values());
    const succeeded = resultValues.filter((r) => !(r instanceof Error)).length;
    const failed = resultValues.filter((r) => r instanceof Error).length;

    return {
      totalObjects: objects.length,
      batchProcessed: batchObjects.length,
      individualProcessed: individualObjects.length,
      succeeded,
      failed,
      totalCostUsd: round6(totalCostUsd),
      costBreakdown: {
        batchCostUsd: round6(batchCostUsd),
        individualCostUsd: round6(individualCostUsd),
        savedVsIndividualUsd: round6(Math.max(0, savedVsIndividualUsd)),
      },
      results,
      preScanResults,
    };
  }

  // ── Pre-scan ───────────────────────────────────────────────────────────────

  private async preScanAll(objects: MigrationObject[]): Promise<PreScanResult[]> {
    const results: PreScanResult[] = [];
    const needsApi: MigrationObject[] = [];

    for (const obj of objects) {
      const score = heuristicConfidence(obj);
      if (score !== null) {
        results.push({
          objectId: obj.id,
          estimatedConfidence: score,
          complexity: toComplexity(score),
          routedToBatch: score > BATCH_CONFIDENCE_THRESHOLD,
        });
      } else {
        needsApi.push(obj);
      }
    }

    if (needsApi.length > 0) {
      const apiResults = await this.preScanViaBatchAPI(needsApi);
      results.push(...apiResults);
    }

    return results;
  }

  /** Submit pre-scans as a Haiku batch — extremely cheap. */
  private async preScanViaBatchAPI(objects: MigrationObject[]): Promise<PreScanResult[]> {
    const requests = objects.map((obj) => ({
      custom_id: `ps-${obj.id}`,
      params: {
        model: "claude-haiku-4-5" as const,
        max_tokens: 128,
        system:
          'ABAP migration expert. Respond ONLY with JSON: {"confidence":<1-10>,"complexity":"low|medium|high"}',
        messages: [
          {
            role: "user" as const,
            content: `Rate S/4HANA difficulty for ${obj.objectType} "${obj.objectName}".\n${obj.sourceCode.slice(0, 2000)}`,
          },
        ],
      } as Messages.MessageCreateParamsNonStreaming,
    }));

    const batch = await this.client.messages.batches.create({ requests });
    const completed = await this.pollBatch(batch.id);

    const results: PreScanResult[] = [];
    const byId = new Map(objects.map((o) => [o.id, o]));

    for await (const item of await this.client.messages.batches.results(completed.id)) {
      const objectId = item.custom_id.replace("ps-", "");
      if (!byId.has(objectId)) continue;

      let confidence = 6;
      let complexity: "low" | "medium" | "high" = "medium";

      if (item.result.type === "succeeded") {
        const textBlock = item.result.message.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        const text = textBlock?.text ?? "";
        try {
          const parsed = JSON.parse(extractFirstJSON(text)) as {
            confidence: number;
            complexity: string;
          };
          confidence = Math.max(1, Math.min(10, Number(parsed.confidence)));
          complexity = (parsed.complexity as "low" | "medium" | "high") ?? "medium";
        } catch {
          /* keep defaults */
        }
      }

      results.push({
        objectId,
        estimatedConfidence: confidence,
        complexity,
        routedToBatch: confidence > BATCH_CONFIDENCE_THRESHOLD,
      });
    }

    return results;
  }

  // ── Batch Conversion ───────────────────────────────────────────────────────

  private async processViaBatchAPI(
    objects: MigrationObject[],
  ): Promise<Map<string, ConversionResult | Error>> {
    const requests = objects.map((obj) => ({
      custom_id: `cv-${obj.id}`,
      params: buildBatchConversionRequest(obj),
    }));

    const batch = await this.client.messages.batches.create({ requests });
    console.log(
      `[BatchConverter] Submitted conversion batch ${batch.id} (${objects.length} objects)`,
    );

    const completed = await this.pollBatch(batch.id);
    console.log(
      `[BatchConverter] Batch ${batch.id} done — ` +
        `${completed.request_counts.succeeded} ok, ` +
        `${completed.request_counts.errored} errored`,
    );

    const results = new Map<string, ConversionResult | Error>();
    const byId = new Map(objects.map((o) => [o.id, o]));

    for await (const item of await this.client.messages.batches.results(completed.id)) {
      const objectId = item.custom_id.replace("cv-", "");
      const obj = byId.get(objectId);

      if (item.result.type === "errored") {
        results.set(
          objectId,
          new ConversionError(`Batch errored: ${item.result.error.type}`),
        );
        continue;
      }
      if (item.result.type === "expired" || item.result.type === "canceled") {
        results.set(objectId, new ConversionError(`Batch request ${item.result.type}`));
        continue;
      }
      if (!obj) {
        results.set(objectId, new ConversionError("Object not in original list"));
        continue;
      }

      try {
        const textBlock = item.result.message.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        results.set(
          objectId,
          parseBatchResult(textBlock?.text ?? "", item.result.message.usage, obj),
        );
      } catch (err) {
        results.set(
          objectId,
          new ConversionError(
            `Parse failed for ${obj.objectName}: ${err instanceof Error ? err.message : String(err)}`,
            err,
          ),
        );
      }
    }

    return results;
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  private async pollBatch(batchId: string): Promise<Messages.MessageBatch> {
    const deadline = Date.now() + BATCH_MAX_WAIT_MS;
    let interval = BATCH_POLL_INTERVAL_MS;

    while (Date.now() < deadline) {
      const batch = await this.client.messages.batches.retrieve(batchId);
      if (batch.processing_status === "ended") return batch;

      console.log(
        `[BatchConverter] Batch ${batchId}: ${batch.request_counts.processing} processing…`,
      );

      await sleep(interval);
      interval = Math.min(interval * 1.5, 5 * 60 * 1_000); // exponential, capped at 5 min
    }

    throw new ConversionError(`Batch ${batchId} timed out`);
  }
}

// ─── Prompt Builder for Batch Requests ────────────────────────────────────────

const BATCH_SYSTEM_PROMPT =
  `You are an expert SAP ABAP developer specializing in S/4HANA migrations. ` +
  `Convert legacy ABAP to S/4HANA compatible ABAP 7.5+. ` +
  `Apply all transformation rules (new SELECT syntax, table renames, obsolete statement replacement). ` +
  `Respond ONLY with valid JSON: ` +
  `{"converted_code":"...","confidence_score":<1-10>,"confidence_reasoning":"...","breaking_changes":[],"manual_review_required":<bool>,"review_reasons":[],"transformation_notes":[]}`;

function buildBatchConversionRequest(
  obj: MigrationObject,
): Messages.MessageCreateParamsNonStreaming {
  const analysis = parseABAP(obj.sourceCode);
  const notes: string[] = [
    `Object: ${obj.objectType} / ${obj.objectName}`,
  ];
  if (analysis.s4ImpactedTables.length > 0) {
    notes.push(
      `S/4 impacted tables: ${analysis.s4ImpactedTables.map((t) => `${t.original}→${t.replacement}`).join(", ")}`,
    );
  }
  if (analysis.userExits.length > 0) {
    notes.push(`User exits (→ BADIs): ${analysis.userExits.join(", ")}`);
  }
  if (analysis.hasObsoleteSyntax) {
    notes.push(`Obsolete syntax: ${analysis.obsoleteSyntaxPatterns.join("; ")}`);
  }
  notes.push(`\nSource:\n\`\`\`abap\n${obj.sourceCode}\n\`\`\`\n\nReturn ONLY JSON.`);

  return {
    model: BATCH_PRICING.model,
    max_tokens: 8192,
    system: BATCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: notes.join("\n") }],
  };
}

// ─── Result Parser ────────────────────────────────────────────────────────────

function parseBatchResult(
  text: string,
  usage: Anthropic.Usage,
  obj: MigrationObject,
): ConversionResult {
  const raw = JSON.parse(extractFirstJSON(text)) as Record<string, unknown>;

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cost: ConversionCost = {
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: round6(
      (inputTokens / 1_000_000) * BATCH_PRICING.inputPerMillion +
        (outputTokens / 1_000_000) * BATCH_PRICING.outputPerMillion,
    ),
  };

  const confidenceScore = Math.max(1, Math.min(10, Number(raw.confidence_score ?? 5)));
  const manualReviewRequired =
    Boolean(raw.manual_review_required) || confidenceScore < 7;

  return {
    convertedCode: String(raw.converted_code ?? ""),
    confidenceScore,
    confidenceReasoning: String(raw.confidence_reasoning ?? ""),
    breakingChanges: Array.isArray(raw.breaking_changes) ? (raw.breaking_changes as string[]) : [],
    manualReviewRequired,
    reviewReasons: Array.isArray(raw.review_reasons) ? (raw.review_reasons as string[]) : [],
    transformationNotes: Array.isArray(raw.transformation_notes)
      ? (raw.transformation_notes as string[])
      : [],
    cost,
    abapAnalysis: parseABAP(obj.sourceCode),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function heuristicConfidence(obj: MigrationObject): number | null {
  const analysis = parseABAP(obj.sourceCode.slice(0, 3000));
  const lines = obj.sourceCode.split("\n").length;
  const isDDIC = ["TABLE", "VIEW", "DATA_ELEMENT", "DOMAIN"].includes(obj.objectType);
  const hasImpacted = analysis.s4ImpactedTables.length > 0;
  const hasExits = analysis.userExits.length > 0 || analysis.enhancementSpots.length > 0;

  if (isDDIC) return 9;
  if (lines < 30 && !hasImpacted && !hasExits) return 9;
  if (hasExits && hasImpacted) return 3;
  if (hasImpacted && lines > 200) return 4;
  if (hasExits) return 5;
  return null; // ambiguous — use API
}

function toComplexity(c: number): "low" | "medium" | "high" {
  if (c >= 8) return "low";
  if (c >= 5) return "medium";
  return "high";
}

function extractFirstJSON(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found");
  return text.substring(start, end + 1);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyBatchSummary(): BatchConversionSummary {
  return {
    totalObjects: 0,
    batchProcessed: 0,
    individualProcessed: 0,
    succeeded: 0,
    failed: 0,
    totalCostUsd: 0,
    costBreakdown: { batchCostUsd: 0, individualCostUsd: 0, savedVsIndividualUsd: 0 },
    results: new Map(),
    preScanResults: [],
  };
}
