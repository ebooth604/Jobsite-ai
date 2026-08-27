/**
 * The whole visual pipeline, in one call.
 *
 * This replaces four moving parts: a YOLO11 detect pass, a YOLO11-seg segment
 * pass, a local Python sidecar to host them, and a Bedrock adapter with a
 * credential bridge to reach a model. A frontier multimodal model reads the
 * photograph directly and returns the classification, so the geometry stages that
 * existed only to feed a model we were going to train no longer have a consumer.
 *
 * Auth is an API key in `ANTHROPIC_API_KEY`. That is the entire configuration —
 * no `aws login`, no fifteen-minute credential export, no region pinning, and no
 * second process to keep alive.
 *
 * The output shape is enforced by a schema rather than requested in prose. That
 * is deliberate and carried over from the previous design: a schema the model
 * cannot express a value through is a stronger constraint than an instruction it
 * can drift away from.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CONDITION_TYPES, type Classification, SEVERITIES, TRADES } from "./domain.js";

/**
 * Sonnet rather than Opus: this runs over every photo on a site, so per-photo
 * cost and latency are the constraints that actually bind, and vision
 * classification into a fixed vocabulary is well within Sonnet's range.
 *
 * Set `SITEWIREAI_MODEL=claude-opus-5` to trade cost back for judgement. That is
 * the knob worth reaching for if readings start looking shallow on hard frames —
 * poor light, heavy occlusion, several trades in one shot.
 */
const MODEL = process.env.SITEWIREAI_MODEL ?? "claude-sonnet-5";

/** The API rejects larger inline images; the caller downscales before sending. */
const MAX_IMAGE_BYTES = 4_000_000;

const tradeIds = TRADES.map((t) => t.id) as [string, ...string[]];
const conditionIds = CONDITION_TYPES.map((c) => c.id) as [string, ...string[]];

/**
 * The output contract.
 *
 * Note what has no field here: any quantity, count, area or percentage complete.
 * A number produced by looking at a photograph is a guess, and a guess that
 * reaches a change-order package wearing a measurement's clothes is the single
 * most expensive mistake this product could make. Keeping the schema silent on
 * the subject is what makes that structurally impossible rather than merely
 * discouraged.
 */
const ClassificationSchema = z.object({
  trade: z
    .enum(tradeIds)
    .nullable()
    .describe("The trade whose work is shown, or null if you cannot tell."),
  scope_description: z.string().describe("One sentence: what this photo shows and where."),
  conditions: z
    .array(
      z.object({
        condition_type: z.enum(conditionIds),
        severity: z.enum(SEVERITIES),
        note: z.string().describe("One sentence on why this was tagged."),
      }),
    )
    .describe("Conditions visible in the photo. Empty array if none apply."),
  recommendation: z
    .string()
    .describe("The single most useful action to take, in one sentence. Empty if nothing to advise."),
  confidence: z.number().min(0).max(1).describe("Your confidence in this reading, 0 to 1."),
  reading: z
    .string()
    .describe("Two or three sentences explaining what you see and what it means for the crew."),
});

const SYSTEM_PROMPT = [
  "You are the visual classification stage of SiteWireAi, looking at a photograph",
  "from a live construction site.",
  "",
  "Your job: identify which trade's work is shown, describe the scope in a sentence,",
  "tag any conditions that are costing the crew time, and say what should be done.",
  "",
  "Absolute rules:",
  "- NEVER state a quantity, a count, an area, or a percentage complete. Not in the",
  "  scope description, not in the reading, not in the recommendation. Estimating a",
  "  number from a photograph produces a guess that reads like a measurement, and it",
  "  ends up in a change order. Describe what is there, never how much of it.",
  "- If you cannot tell which trade this is, return null for trade rather than",
  "  guessing. An honest null is more useful than a confident wrong label.",
  "- Be harsh with your confidence. A person reads this alongside the photo.",
  "- Conditions are only worth tagging when they are visibly costing time. An empty",
  "  list is a good answer for a clean, well-run site.",
].join("\n");

export interface ClassifyInput {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  projectRef: string;
  area: string;
}

export function modelName(): string {
  return MODEL;
}

/** True when a key is configured. The UI uses this to explain itself when not. */
export function classifierAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  // Constructed lazily so the server starts, and the library still lists photos,
  // on a machine with no key configured.
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Classifies one photograph.
 *
 * Throws on transport, auth and rate-limit failures — the caller turns those into
 * a readable message rather than retrying, because the person who clicked the
 * button is sitting there waiting for an answer either way.
 */
export async function classify(input: ClassifyInput): Promise<Classification> {
  const bytes = Buffer.from(input.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
  if (bytes.length === 0) throw new Error("empty image");
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("image too large — downscale before sending");
  }

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(ClassificationSchema) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: [
              `Project: ${input.projectRef || "unspecified"}`,
              `Area: ${input.area || "unspecified"}`,
              "",
              "Classify this photograph.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("the model returned nothing that matched the expected shape");
  }

  return {
    trade: parsed.trade ?? "",
    scopeDescription: parsed.scope_description.slice(0, 500),
    conditions: parsed.conditions.map((c) => ({
      type: c.condition_type,
      severity: c.severity,
      note: c.note.slice(0, 500),
    })),
    recommendation: parsed.recommendation.slice(0, 1000),
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    reading: parsed.reading.slice(0, 2000),
    model: MODEL,
    classifiedAt: new Date().toISOString(),
  };
}

/** Turns an SDK error into one sentence a person can act on. */
export function explainError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "ANTHROPIC_API_KEY is missing or invalid. Set it and restart the server.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the API. Wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return `The model API returned ${err.status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
