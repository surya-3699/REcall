import { z } from "zod";
import dataset from "../../data/team-history.json";
export const teams = [
  { id: "studio", name: "Design studio" },
  { id: "operations", name: "Operations team" },
] as const;
export type Memory = { id: string; text: string };
export type Source = { id: string; url: string; title: string };
export const sampleMemories: Record<string, Memory[]> = dataset;
export const requestSchema = z
  .object({
    action: z.enum(["compare", "history", "seed", "remember", "verify"]),
    team: z.enum(["studio", "operations"]),
    category: z.enum(["laptops", "monitors", "headsets"]),
    products: z.array(z.string().trim().min(2).max(150)).max(3),
    market: z.string().trim().min(2).max(80),
    requirements: z.string().trim().max(1800),
    note: z.string().trim().max(2500).optional(),
    kind: z.enum(["requirement", "decision", "correction"]).optional(),
    requestId: z.string().uuid(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.action === "compare" &&
      (v.products.length < 2 || v.requirements.length < 10)
    )
      c.addIssue({
        code: "custom",
        message:
          "Enter two products and at least 10 characters of requirements.",
      });
    if (
      new Set(v.products.map((x) => x.toLowerCase())).size !== v.products.length
    )
      c.addIssue({ code: "custom", message: "Enter different products." });
    if (v.action === "remember" && (!v.kind || !v.note || v.note.length < 10))
      c.addIssue({
        code: "custom",
        message:
          "Enter a requirement, decision, or correction of at least 10 characters.",
      });
  });
export type AgentInput = z.infer<typeof requestSchema>;
const text = z.string().min(1).max(4000);
const ids = z.array(z.string().min(1).max(250)).max(30);
export const comparisonSchema = z
  .object({
    products: z
      .array(
        z
          .object({
            name: text,
            claims: z
              .array(
                z.object({ label: text, value: text, sourceIds: ids }).strict(),
              )
              .min(1)
              .max(8),
            reviewSummary: text,
            reviewSourceIds: ids,
            uncertainties: z.array(text).max(8),
          })
          .strict(),
      )
      .min(2)
      .max(3),
    recommendation: z
      .object({ choice: text, reason: text, sourceIds: ids, memoryIds: ids })
      .strict(),
    memoryImpact: text,
  })
  .strict();
export type Comparison = z.infer<typeof comparisonSchema>;
const str = { type: "string" };
const list = { type: "array", items: str };
export const comparisonJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: str,
          claims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { label: str, value: str, sourceIds: list },
              required: ["label", "value", "sourceIds"],
            },
          },
          reviewSummary: str,
          reviewSourceIds: list,
          uncertainties: list,
        },
        required: [
          "name",
          "claims",
          "reviewSummary",
          "reviewSourceIds",
          "uncertainties",
        ],
      },
    },
    recommendation: {
      type: "object",
      additionalProperties: false,
      properties: {
        choice: str,
        reason: str,
        sourceIds: list,
        memoryIds: list,
      },
      required: ["choice", "reason", "sourceIds", "memoryIds"],
    },
    memoryImpact: str,
  },
  required: ["products", "recommendation", "memoryImpact"],
};
export function bankFor(team: string, prefix: string) {
  if (
    !teams.some((t) => t.id === team) ||
    !/^[a-zA-Z0-9_-]{1,60}$/.test(prefix)
  )
    throw new Error("Invalid team or memory namespace.");
  return `${prefix}-buying-${team}`;
}
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hostname === "localhost" ||
      !u.hostname.includes(".") ||
      /^\d+(\.\d+){3}$/.test(u.hostname)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function validateComparison(
  raw: unknown,
  sources: Source[],
  memories: Memory[],
  products: string[],
): Comparison {
  const p = comparisonSchema.parse(raw);
  const sourceIds = new Set(sources.map((s) => s.id));
  const memoryIds = new Set(memories.map((m) => m.id));
  const actual = p.products.map((x) => x.name.toLowerCase()).sort();
  const expected = products.map((x) => x.toLowerCase()).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Product names do not match the request.");
  const cited = [
    ...p.products.flatMap((x) => [
      ...x.claims.flatMap((c) => c.sourceIds),
      ...x.reviewSourceIds,
    ]),
    ...p.recommendation.sourceIds,
  ];
  if (
    cited.some((id) => !sourceIds.has(id)) ||
    p.recommendation.memoryIds.some((id) => !memoryIds.has(id))
  )
    throw new Error("Unsupported source or memory citation.");
  for (const product of p.products) {
    if (
      new Set(product.claims.map((c) => c.label)).size !== product.claims.length
    )
      throw new Error("Duplicate comparison rows.");
    for (const c of product.claims)
      if (
        !c.sourceIds.length &&
        !/^(not verified|unknown|unavailable|not found)[.!]?$/i.test(c.value)
      )
        throw new Error("A product fact is missing a source.");
    if (
      !product.reviewSourceIds.length &&
      !/^(not verified|unknown|unavailable|not found)[.!]?$/i.test(
        product.reviewSummary,
      )
    )
      throw new Error("Review summary is missing a source.");
  }
  if (
    p.recommendation.choice !== "Insufficient evidence" &&
    !products.some(
      (x) => x.toLowerCase() === p.recommendation.choice.toLowerCase(),
    )
  )
    throw new Error("Unsupported recommendation.");
  if (
    p.recommendation.choice !== "Insufficient evidence" &&
    !p.recommendation.sourceIds.length
  )
    throw new Error("Recommendation requires web evidence.");
  // Keep table columns stable when switching between the two memory views.
  p.products = products.map((name) => ({
    ...p.products.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )!,
    name,
  }));
  if (p.recommendation.choice !== "Insufficient evidence")
    p.recommendation.choice = products.find(
      (name) => name.toLowerCase() === p.recommendation.choice.toLowerCase(),
    )!;
  return p;
}
export const examples = [
  {
    label: "Compare work laptops",
    category: "laptops",
    products: ["Lenovo ThinkPad E14 Gen 6", "Dell Latitude 3450"],
    requirements:
      "Choose laptops for a small business team. Compare specifications, India pricing, warranty, repairability, and credible review findings. Confirm exact configurations.",
  },
  {
    label: "Compare office monitors",
    category: "monitors",
    products: ["Dell P2425H", "HP E24 G5"],
    requirements:
      "Choose office monitors for an eight-person team. Compare screen specifications, ergonomics, India pricing, warranty, and independent reviews.",
  },
  {
    label: "Compare meeting headsets",
    category: "headsets",
    products: ["Jabra Evolve2 40", "Logitech Zone Wired"],
    requirements:
      "Choose wired headsets for business video meetings. Compare microphone evidence, comfort, compatibility, India pricing, and warranty.",
  },
] as const;
