/**
 * The assist layer: a Bedrock-backed helper that fills forms and explains numbers.
 *
 * It operates at ASSIST level, deliberately. Every action it returns is applied to
 * the UI for a human to see and submit — nothing commits itself, and three inputs
 * are off limits to it entirely:
 *
 *   - estimated quantity
 *   - the abstain flag
 *   - the "no people in frame" declaration
 *
 * Those are the integrity-bearing inputs. This product's whole claim is that it
 * does not invent quantities, does not quietly convert an abstention into a
 * number, and does not let a face-blur decision be made by something that cannot
 * see the photo. An assistant that could set them could undo all three silently,
 * so the tool schema simply does not expose them.
 *
 * Model output is untrusted input. Every field the model returns is validated
 * against an allowlist built from real data before it leaves this module.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import type { ScopeItem } from "./types.js";

/**
 * `ca.` prefix: the Canadian inference profile. A global profile would route to
 * any commercial region, which is exactly the residency commitment this project
 * treats as contractual (business plan §4.3, ADR-0001).
 */
const MODEL_ID = "ca.amazon.nova-lite-v1:0";

/** Explicit, always. Unset defaults to the model maximum and reserves far more quota. */
const MAX_TOKENS = 600;

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "ca-central-1",
  maxAttempts: 3,
  retryMode: "adaptive",
});

export interface AssistAction {
  type: "fill_capture_form" | "suggest_cost_code_mapping" | "navigate";
  fields?: Record<string, string>;
  costCode?: string;
  bidLine?: number;
  path?: string;
}

export interface AssistResult {
  reply: string;
  actions: AssistAction[];
}

const NAV_PATHS = ["/", "/productivity", "/alerts", "/capture", "/bid", "/data-quality"];
const ORIGINS = ["field", "self_measured", "simulated"];

function tools(scopeItems: ScopeItem[]): Tool[] {
  return [
    {
      toolSpec: {
        name: "fill_capture_form",
        description:
          "Fill fields on the capture form for the user to review. Cannot set estimated quantity, the abstain flag, or the no-people declaration — those are the operator's alone.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              scopeItemId: {
                type: "string",
                description: `One of: ${scopeItems.map((s) => s.id).join(", ")}`,
              },
              area: { type: "string", description: "Free text, e.g. 'L5 north corridor'" },
              capturedAt: { type: "string", description: "ISO date, YYYY-MM-DD" },
              origin: { type: "string", description: `One of: ${ORIGINS.join(", ")}` },
            },
          },
        },
      },
    },
    {
      toolSpec: {
        name: "suggest_cost_code_mapping",
        description:
          "Highlight a suggested cost-code to bid-line mapping on the bid page. The user still applies it; nothing is mapped automatically.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              costCode: { type: "string" },
              bidLine: { type: "number", description: "Bid line number" },
            },
            required: ["costCode", "bidLine"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "navigate",
        description: "Move the user to another page in the app.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              path: { type: "string", description: `One of: ${NAV_PATHS.join(", ")}` },
            },
            required: ["path"],
          },
        },
      },
    },
  ];
}

function systemPrompt(context: string): string {
  return [
    "You are the assistant inside Sitewire, a construction productivity tool.",
    "Help the user fill forms, find pages, and understand the numbers.",
    "",
    "Hard rules you must never break:",
    "- Never state or estimate an installed quantity. You cannot see the photos.",
    "- Never claim a model accuracy figure. The demo runs on simulated data, which may train a model but may never measure one.",
    "- A productivity factor is actual install rate divided by bid rate; below 1.00 is slower than bid.",
    "- An abstention means the model declined to guess. It is not zero.",
    "- Unmapped or duplicated cost codes are held back on purpose. Say so rather than guessing a mapping when it is ambiguous.",
    "- Only fill a field the user actually gave you. Never invent an area, a date, a scope item or an origin to fill a form out. If they did not say it, leave it out and say which field still needs them.",
    "",
    "Be brief — two or three sentences. Use a tool when the user asks for something a tool covers.",
    "",
    `Current page context: ${context}`,
  ].join("\n");
}

/**
 * Nova wraps output in pseudo-XML — `<thinking>` for scratch work, `<response>`
 * around the answer. The thinking is not an answer and reads as a malfunction if
 * shown; the wrapper tags are noise. Strip the thinking blocks entirely, then any
 * remaining tags, so a user sees prose.
 */
function cleanText(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<\/?[a-z_]+>/gi, "")
    .trim();
}

/** Model output is untrusted: everything here is checked against real data. */
function validate(
  name: string,
  input: Record<string, unknown>,
  scopeItems: ScopeItem[],
): AssistAction | null {
  if (name === "navigate") {
    const path = String(input.path ?? "");
    return NAV_PATHS.includes(path) ? { type: "navigate", path } : null;
  }

  if (name === "suggest_cost_code_mapping") {
    const costCode = String(input.costCode ?? "").trim();
    const bidLine = Number(input.bidLine);
    if (!costCode || costCode.length > 40 || !Number.isInteger(bidLine) || bidLine < 1) return null;
    return { type: "suggest_cost_code_mapping", costCode, bidLine };
  }

  if (name === "fill_capture_form") {
    const fields: Record<string, string> = {};

    const scopeItemId = input.scopeItemId ? String(input.scopeItemId) : "";
    if (scopeItemId && scopeItems.some((s) => s.id === scopeItemId)) {
      fields.scopeItemId = scopeItemId;
    }

    const area = input.area ? String(input.area).slice(0, 120) : "";
    if (area) fields.area = area;

    // A well-formed date is not necessarily a real one. Models reach for a date
    // from their training data when asked to fill a form — clamp to a plausible
    // window so an invented 2023 date cannot land on a 2026 capture.
    const capturedAt = input.capturedAt ? String(input.capturedAt) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) {
      const when = Date.parse(`${capturedAt}T00:00:00Z`);
      const now = Date.now();
      const year = 365 * 24 * 60 * 60 * 1000;
      if (Number.isFinite(when) && when > now - year && when < now + 7 * 24 * 60 * 60 * 1000) {
        fields.capturedAt = capturedAt;
      }
    }

    const origin = input.origin ? String(input.origin) : "";
    if (ORIGINS.includes(origin)) fields.origin = origin;

    return Object.keys(fields).length > 0 ? { type: "fill_capture_form", fields } : null;
  }

  return null;
}

export async function assist(
  userMessage: string,
  context: string,
  scopeItems: ScopeItem[],
): Promise<AssistResult> {
  const trimmed = userMessage.trim().slice(0, 2000);
  if (!trimmed) return { reply: "Ask me something about this project.", actions: [] };

  const messages: Message[] = [{ role: "user", content: [{ text: trimmed }] }];

  const response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt(context) }],
      messages,
      inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0.2 },
      toolConfig: { tools: tools(scopeItems) },
    }),
  );

  const blocks = response.output?.message?.content ?? [];
  const actions: AssistAction[] = [];
  let reply = "";

  for (const block of blocks) {
    if (block.text) reply += cleanText(block.text);
    if (block.toolUse?.name) {
      const action = validate(
        block.toolUse.name,
        (block.toolUse.input ?? {}) as Record<string, unknown>,
        scopeItems,
      );
      if (action) actions.push(action);
    }
  }

  // A tool-only turn can come back with no prose. The fallback has to match what
  // actually happened — telling someone to "review the fields" after a navigation
  // sends them looking for fields that are not there.
  if (!reply.trim()) {
    const first = actions[0]?.type;
    reply =
      first === "navigate"
        ? "Opening that page."
        : first === "suggest_cost_code_mapping"
          ? "Suggested a mapping — change it if that is wrong."
          : first === "fill_capture_form"
            ? "Filled what you gave me. Review before queueing."
            : "I could not work that one out. Try rephrasing?";
  }

  return { reply: reply.trim(), actions };
}

/**
 * Vision-assisted capture description.
 *
 * This is the one place an image leaves the browser, and it is deliberately
 * narrow:
 *
 *   - Only the REDACTED render is ever sent. The client gates the button on the
 *     same redaction check that gates queueing, so an unredacted photo has no
 *     path here at all.
 *   - It goes to the Canadian inference profile, so a jobsite photo does not
 *     leave the residency boundary.
 *   - It may propose an AREA and a SCOPE ITEM, and describe what is visible.
 *     It may not propose a quantity. Quantity belongs to a calibrated per-trade
 *     model with an abstention threshold (technical plan §5), not to a general
 *     model that always answers. A number invented here would flow into a
 *     productivity factor and then into a change-order package, which is exactly
 *     the fabrication this product exists to avoid.
 */
export interface VisionResult {
  description: string;
  fields: Record<string, string>;
}

export async function describeCapture(
  imageBase64: string,
  scopeItems: ScopeItem[],
): Promise<VisionResult> {
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length === 0) throw new Error("empty image");
  if (bytes.length > 4_000_000) throw new Error("image too large — downscale before sending");

  const scopeList = scopeItems
    .map((s) => `${s.id} = ${s.trade}, ${s.description} (${s.unitOfMeasure})`)
    .join("\n");

  const response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [
        {
          text: [
            "You are looking at a redacted construction site photo for Sitewire.",
            "",
            "Describe in two sentences what trade work is visible and any obstruction,",
            "stacked trade, or access problem. Then, if you can tell, use the tool to",
            "propose which scope item it belongs to and a short area label.",
            "",
            "Absolute rules:",
            "- NEVER state or estimate a quantity, count, area measurement or percentage",
            "  complete. You are not the quantity model, and a number from you would be",
            "  a guess presented as a measurement.",
            "- If the photo is unclear, say so plainly and propose nothing.",
            "- Mosaicked blocks are deliberate face redaction. Do not comment on them.",
            "",
            "Scope items on this project:",
            scopeList,
          ].join("\n"),
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            { image: { format: "jpeg", source: { bytes } } },
            { text: "Describe this capture and propose the scope item and area if clear." },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 400, temperature: 0.2 },
      toolConfig: { tools: [tools(scopeItems)[0] as Tool] },
    }),
  );

  const blocks = response.output?.message?.content ?? [];
  let description = "";
  let fields: Record<string, string> = {};

  for (const block of blocks) {
    if (block.text) description += cleanText(block.text);
    if (block.toolUse?.name === "fill_capture_form") {
      const action = validate(
        "fill_capture_form",
        (block.toolUse.input ?? {}) as Record<string, unknown>,
        scopeItems,
      );
      if (action?.fields) {
        // Belt and braces: the tool has no quantity field, and these are stripped
        // again here in case the schema is ever widened without revisiting this.
        const { scopeItemId, area } = action.fields;
        fields = {
          ...(scopeItemId ? { scopeItemId } : {}),
          ...(area ? { area } : {}),
        };
      }
    }
  }

  const text = description.trim();

  // Placeholder areas are the model filling a slot rather than reading a photo.
  // "Unspecified area" in a change-order package is worse than a blank field,
  // because a blank field is obviously unfinished and a placeholder looks answered.
  const PLACEHOLDER = /^(unspecified|unknown|n\/?a|none|not specified|area)\b/i;
  if (fields.area && PLACEHOLDER.test(fields.area)) delete fields.area;

  // The model was told to propose nothing when the photo is unclear. If it came
  // back with no prose at all it did not describe anything, so its tool call is
  // not grounded in a reading of the image — drop the proposals with it.
  if (!text) {
    return {
      description: "No clear read on this photo — nothing proposed.",
      fields: {},
    };
  }

  return { description: text, fields };
}
