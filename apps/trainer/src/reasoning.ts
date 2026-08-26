/**
 * Stage four: the visual reasoning model's first pass.
 *
 * The pipeline is upload → YOLO detects → YOLO-seg outlines → **this** → main app
 * reports. Stages two and three produced geometry and nothing else. This is where
 * meaning is attached: what condition is visible, what it is costing, and what
 * ought to be done about it.
 *
 * The model does the work and a human confirms what it was unsure about. That is
 * the whole economics of the thing — a person cannot write a condition chain for
 * every photo on a site, but they can say yes or no to a draft in ten seconds, and
 * below the confidence threshold they are asked to do more than that.
 *
 * **Provider-agnostic on purpose.** `ReasoningProvider` is the contract; the
 * Bedrock adapter below is one implementation. Manus 1.6 was the intended model
 * here and does not currently expose a callable endpoint that returns structured
 * output per image — it is an agent product driven through its app, not a model
 * API. When it does, it becomes another adapter behind this interface and nothing
 * else changes. Hard-wiring stage four to any one vendor would have made that a
 * rewrite instead of a config change.
 *
 * What this may never do, enforced downstream in `guards.ts` and restated in the
 * prompt because a model reads the prompt and not the guards:
 *
 *   - never state a quantity, a count, or a percentage complete — that is the
 *     quantity model's job and a number from here would be a guess wearing a
 *     measurement's clothes
 *   - never touch a face-blur declaration
 *   - never claim a `measured` basis, because it has not seen a timesheet
 */

import { BedrockRuntimeClient, ConverseCommand, type Tool } from "@aws-sdk/client-bedrock-runtime";
import { sdkCredentials } from "./credentials.js";
import { CONDITION_TYPES, HARD_CASES, type ImpactBasis, type Severity, TRADES } from "./dataset.js";

/**
 * `ca.` prefix: the Canadian inference profile, matching the dashboard. A global
 * profile routes to any commercial region, which is exactly the residency
 * commitment this project treats as contractual (business plan §4.3, ADR-0001).
 * These are client jobsite photographs; the region is not a preference.
 */
const MODEL_ID = process.env.SITEWIREAI_REASONING_MODEL ?? "ca.amazon.nova-lite-v1:0";

/** Explicit. Unset defaults to the model maximum and reserves far more quota. */
const MAX_TOKENS = 700;

/** Bedrock rejects larger inline images; the caller downscales before sending. */
const MAX_IMAGE_BYTES = 4_000_000;

export interface ReasoningInput {
  /** The redacted render. Never an original frame — those never leave the tab. */
  imageBase64: string;
  trade: string;
  scopeDescription: string;
  area: string;
  /** What stages two and three found, as text the model can refer to. */
  geometry: { className: string; kind: string }[];
}

export interface DraftedChain {
  conditionType: string;
  severity: Severity;
  impact: {
    hoursLost: number | null;
    factorDelta: number | null;
    basis: ImpactBasis;
    note: string;
  };
  recommendation: string;
  /** The model's own confidence, 0..1. What the review threshold routes on. */
  modelConfidence: number;
  /** Prose for the labeller. Not stored on the chain; shown while confirming. */
  reading: string;
  /** Model identity, recorded as `proposedBy` on anything accepted. */
  model: string;
}

/**
 * What stage four can guess about a photo before anyone has typed a word.
 *
 * Deliberately the *qualitative* half of ground truth only: which trade, what
 * the scope looks like, which conditions and hard cases are visible. The
 * measured quantity and everything that backs it — unit, method, who measured
 * it, when, how uncertain — never appears here and never will; that is the one
 * number in this whole corpus that has to come from a person with a tape
 * measure, not a model looking at a photo.
 */
export interface ClassifyInput {
  imageBase64: string;
  area: string;
  /** What stages two and three found, as text the model can refer to. */
  geometry: { className: string; kind: string }[];
}

export interface DraftedClassification {
  /** One of TRADES' ids, or "" when the model cannot tell. */
  trade: string;
  scopeDescription: string;
  conditions: { type: string; severity: Severity; note: string }[];
  /** HARD_CASES ids. */
  hardCases: string[];
  /** The model's own confidence, 0..1. Shown to the labeller, not enforced. */
  confidence: number;
  /** Prose for the labeller. Not stored anywhere; shown while confirming. */
  reading: string;
  model: string;
}

export interface ReasoningProvider {
  name(): string;
  available(): boolean;
  /** Returns null when the model declines to read the photo. */
  draft(input: ReasoningInput): Promise<DraftedChain | null>;
  /** Returns null when the model cannot make out anything worth suggesting. */
  classify(input: ClassifyInput): Promise<DraftedClassification | null>;
}

// ---- the structured-output contract ---------------------------------------

/**
 * One tool, because the output has to be parseable rather than persuasive.
 *
 * Note what the schema does *not* contain: any quantity field, any count, any
 * percentage. A schema is a stronger constraint than an instruction — the model
 * cannot return a quantity through a tool that has nowhere to put one.
 */
function chainTool(): Tool {
  return {
    toolSpec: {
      name: "draft_condition_chain",
      description:
        "Record one visible site condition, what it is likely costing, and what to do. " +
        "Call this at most once. If the photo is unclear, do not call it at all.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            condition_type: {
              type: "string",
              enum: CONDITION_TYPES.map((c) => c.id),
              description: "The condition visible in the photo.",
            },
            severity: { type: "string", enum: ["info", "warning", "critical"] },
            hours_lost: {
              type: ["number", "null"],
              description:
                "Crew-hours likely lost to this condition, or null if you cannot tell. " +
                "This is an estimate to be checked by a person, never a measurement.",
            },
            factor_delta: {
              type: ["number", "null"],
              description: "Likely change in the productivity factor, e.g. -0.15. Null if unclear.",
            },
            reasoning: {
              type: "string",
              description: "Why this condition costs what you say, in one or two sentences.",
            },
            recommendation: {
              type: "string",
              description: "The single most useful action to take. One sentence.",
            },
            confidence: {
              type: "number",
              description:
                "Your confidence in this whole chain, 0 to 1. Be honest and be harsh: " +
                "below the review threshold a person is asked to check it, which is the " +
                "correct outcome when you are unsure. A confident wrong answer is the " +
                "only genuinely bad one.",
            },
          },
          required: ["condition_type", "severity", "recommendation", "confidence", "reasoning"],
        },
      },
    },
  };
}

/**
 * The classification tool. Same discipline as `chainTool()`: no quantity,
 * count, unit, or percentage anywhere in the schema, because a labeller who
 * never looks closely at the measured-quantity field should still be unable
 * to get a guessed number into the corpus through this door instead.
 */
function classifyTool(): Tool {
  return {
    toolSpec: {
      name: "classify_photo",
      description:
        "Record which trade's work this photo shows, describe the scope, and tag any " +
        "visible conditions or hard cases. Call this at most once.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            trade: {
              type: "string",
              enum: [...TRADES.map((t) => t.id), ""],
              description: "The trade whose work is shown, or \"\" if you genuinely cannot tell.",
            },
            scope_description: {
              type: "string",
              description: "One sentence describing what the photo shows and where.",
            },
            conditions: {
              type: "array",
              description: "Zero or more conditions visible in the photo.",
              items: {
                type: "object",
                properties: {
                  condition_type: { type: "string", enum: CONDITION_TYPES.map((c) => c.id) },
                  severity: { type: "string", enum: ["info", "warning", "critical"] },
                  note: { type: "string", description: "One sentence, why you tagged this." },
                },
                required: ["condition_type", "severity"],
              },
            },
            hard_cases: {
              type: "array",
              description: "Zero or more of the fixed hard-case flags that apply to this photo.",
              items: { type: "string", enum: HARD_CASES.map((h) => h.id) },
            },
            confidence: {
              type: "number",
              description:
                "Your confidence in this whole classification, 0 to 1. A person reviews " +
                "every suggestion before it is saved, so be honest rather than confident.",
            },
          },
          required: ["trade", "scope_description", "confidence"],
        },
      },
    },
  };
}

const CLASSIFY_SYSTEM_PROMPT = [
  "You are the intake classification stage of SiteWireAi's pipeline, looking at a",
  "redacted construction site photograph from a client's project.",
  "",
  "A detector and a segmenter have already found and outlined whatever objects are",
  "visible. You are being asked which trade's work this photo shows, a one-sentence",
  "description of the scope, and which of a fixed set of conditions or hard-case",
  "flags apply — nothing more.",
  "",
  "Absolute rules:",
  "- NEVER state a quantity, a count, an area, or a percentage complete. A separate",
  "  model measures quantity, and a person with a tape measure checks it. A number",
  "  from you would be a guess presented as a measurement.",
  "- NEVER state or imply a unit of measure, a measurement method, or who measured",
  "  anything — those are set by the person labelling this photo, not you.",
  "- Mosaicked blocks are deliberate face redaction. Never comment on them and",
  "  never suggest anything about them.",
  "- If you cannot tell which trade this is, return an empty trade rather than",
  "  guessing confidently. A person reviews and can edit every field you return.",
].join("\n");

const SYSTEM_PROMPT = [
  "You are the interpretation stage of SiteWireAi's pipeline, looking at a redacted",
  "construction site photograph from a client's project.",
  "",
  "A detector has already found the objects and a segmenter has already outlined",
  "them. You are not being asked to find things. You are being asked what the scene",
  "means for the crew's productivity: what is in the way, what it is costing, and",
  "what should be done.",
  "",
  "Absolute rules:",
  "- NEVER state a quantity, a count, an area, or a percentage complete. A separate",
  "  model measures quantity. A number from you would be a guess presented as a",
  "  measurement, and it would end up in a change-order package.",
  "- Hours lost and factor delta ARE within scope, because they are explicitly",
  "  estimates a person will check — but return null rather than inventing one.",
  "- Mosaicked blocks are deliberate face redaction. Never comment on them and",
  "  never suggest anything about them.",
  "- If the photo does not clearly show a condition worth recording, write one",
  "  sentence saying so and do not call the tool. An empty answer is a good answer.",
  "- Your confidence routes the work. Low confidence sends this to a human, which",
  "  costs two minutes. Overconfidence sends a wrong recommendation to a foreman.",
].join("\n");

// ---- the Bedrock adapter ---------------------------------------------------

let client: BedrockRuntimeClient | null = null;

function bedrock(): BedrockRuntimeClient {
  if (!client) {
    const region = process.env.AWS_REGION ?? "ca-central-1";
    if (!/^ca-/.test(region)) {
      throw new Error(
        `refusing to send client jobsite photos to ${region}: Canadian residency is ` +
          "contractual — set AWS_REGION to a ca-* region.",
      );
    }
    client = new BedrockRuntimeClient({
      region,
      maxAttempts: 3,
      retryMode: "adaptive",
      // Refreshes itself. An `aws login` session hands out fifteen-minute
      // credentials, so a client holding a snapshot stops working mid-session.
      ...sdkCredentials(),
    });
  }
  return client;
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, n));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Strips the model's scratchpad markup out of labeller-facing prose.
 *
 * Nova emits `<thinking>…</thinking>` around its reasoning, and shown raw it reads
 * as a malfunction to the person being asked to confirm the draft. The dashboard's
 * assist layer solves this the same way; the duplication is three lines and the
 * alternative is importing across two apps for a regex.
 */
function cleanText(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<\/?[a-z_]+>/gi, "")
    .trim();
}

export const bedrockProvider: ReasoningProvider = {
  name: () => MODEL_ID,

  // Credentials are checked at call time rather than here: the SDK resolves them
  // lazily, and an `aws login` session that the SDK cannot read looks identical to
  // no credentials until something is actually sent.
  available: () => Boolean(process.env.AWS_REGION ?? "ca-central-1"),

  async draft(input: ReasoningInput): Promise<DraftedChain | null> {
    const bytes = Buffer.from(input.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
    if (bytes.length === 0) throw new Error("empty image");
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error("image too large — downscale before sending");
    }

    const found = input.geometry.length
      ? input.geometry.map((g) => `${g.className} (${g.kind})`).join(", ")
      : "nothing confirmed yet";

    const response = await bedrock().send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [
              { image: { format: "jpeg", source: { bytes } } },
              {
                text: [
                  `Trade: ${input.trade || "unspecified"}`,
                  `Scope: ${input.scopeDescription || "unspecified"}`,
                  `Area: ${input.area || "unspecified"}`,
                  `Already found by the detector and segmenter: ${found}`,
                  "",
                  "What condition is visible, what is it costing this crew, and what should",
                  "be done about it?",
                ].join("\n"),
              },
            ],
          },
        ],
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0.2 },
        toolConfig: { tools: [chainTool()] },
      }),
    );

    const blocks = response.output?.message?.content ?? [];
    let reading = "";
    let drafted: Record<string, unknown> | null = null;

    for (const block of blocks) {
      if (block.text) reading += block.text;
      if (block.toolUse?.name === "draft_condition_chain") {
        drafted = (block.toolUse.input ?? {}) as Record<string, unknown>;
      }
    }

    // The model was told to call nothing when the photo is unclear. Honour that
    // rather than manufacturing an empty chain — "no condition here" is a real
    // answer and the corpus is better for containing it as a skip than as noise.
    if (!drafted) return null;

    const conditionType = String(drafted.condition_type ?? "");
    if (!CONDITION_TYPES.some((c) => c.id === conditionType)) return null;

    const severity = String(drafted.severity ?? "warning");

    return {
      conditionType,
      severity: (["info", "warning", "critical"] as const).includes(severity as Severity)
        ? (severity as Severity)
        : "warning",
      impact: {
        hoursLost: numberOrNull(drafted.hours_lost),
        factorDelta: numberOrNull(drafted.factor_delta),
        // Always inferred. This model has not seen a timesheet, and `measured` is
        // reserved for figures reconciled against real labour hours — the only
        // basis allowed to back a reported number.
        basis: "inferred",
        note: cleanText(String(drafted.reasoning ?? "")).slice(0, 2000),
      },
      recommendation: cleanText(String(drafted.recommendation ?? "")).slice(0, 2000),
      modelConfidence: clampConfidence(drafted.confidence),
      reading: cleanText(reading),
      model: MODEL_ID,
    };
  },

  async classify(input: ClassifyInput): Promise<DraftedClassification | null> {
    const bytes = Buffer.from(input.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
    if (bytes.length === 0) throw new Error("empty image");
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error("image too large — downscale before sending");
    }

    const found = input.geometry.length
      ? input.geometry.map((g) => `${g.className} (${g.kind})`).join(", ")
      : "nothing confirmed yet";

    const response = await bedrock().send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: CLASSIFY_SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [
              { image: { format: "jpeg", source: { bytes } } },
              {
                text: [
                  `Area: ${input.area || "unspecified"}`,
                  `Already found by the detector and segmenter: ${found}`,
                  "",
                  "Which trade's work does this photo show, what is the scope, and which",
                  "conditions or hard cases apply?",
                ].join("\n"),
              },
            ],
          },
        ],
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0.2 },
        toolConfig: { tools: [classifyTool()] },
      }),
    );

    const blocks = response.output?.message?.content ?? [];
    let reading = "";
    let drafted: Record<string, unknown> | null = null;

    for (const block of blocks) {
      if (block.text) reading += block.text;
      if (block.toolUse?.name === "classify_photo") {
        drafted = (block.toolUse.input ?? {}) as Record<string, unknown>;
      }
    }

    if (!drafted) return null;

    const trade = String(drafted.trade ?? "");

    const rawConditions = Array.isArray(drafted.conditions) ? drafted.conditions : [];
    const conditions = rawConditions
      .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
      .filter((c): c is Record<string, unknown> => c !== null)
      .map((c) => {
        const type = String(c.condition_type ?? "");
        if (!CONDITION_TYPES.some((t) => t.id === type)) return null;
        const severity = String(c.severity ?? "warning");
        return {
          type,
          severity: (["info", "warning", "critical"] as const).includes(severity as Severity)
            ? (severity as Severity)
            : "warning",
          note: cleanText(String(c.note ?? "")).slice(0, 500),
        };
      })
      .filter((c): c is { type: string; severity: Severity; note: string } => c !== null);

    const rawHardCases = Array.isArray(drafted.hard_cases) ? drafted.hard_cases : [];
    const hardCases = rawHardCases
      .map((h) => String(h))
      .filter((h) => HARD_CASES.some((hc) => hc.id === h));

    return {
      // "" (the model's own "I can't tell") and an unrecognised value are both
      // treated as no suggestion — a labeller sees an empty field either way,
      // never a value that silently doesn't match TRADES.
      trade: TRADES.some((t) => t.id === trade) ? trade : "",
      scopeDescription: cleanText(String(drafted.scope_description ?? "")).slice(0, 500),
      conditions,
      hardCases,
      confidence: clampConfidence(drafted.confidence),
      reading: cleanText(reading),
      model: MODEL_ID,
    };
  },
};

/** The provider stage four uses. One line to swap when Manus exposes an endpoint. */
export const reasoningProvider: ReasoningProvider = bedrockProvider;
