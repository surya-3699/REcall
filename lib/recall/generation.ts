import { ZodError } from "zod";
import { validateComparison, type Source, type Memory } from "./core";

// Only fixed validation messages may enter logs or the regeneration prompt.
const reasons = new Set([
  "Product names do not match the request.",
  "Unsupported source or memory citation.",
  "Duplicate comparison rows.",
  "A product fact is missing a source.",
  "Review summary is missing a source.",
  "Unsupported recommendation.",
  "Recommendation requires web evidence.",
]);
export class ComparisonOutputError extends Error {}

export async function generateValidatedComparison(
  generate: (feedback: string) => Promise<string>,
  context: { sources: Source[]; memories: Memory[]; products: string[] },
  onRejected: (reason: string, attempt: number) => void,
) {
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Provider/authentication/timeout errors must retain their original meaning.
    const output = await generate(feedback);
    try {
      return validateComparison(
        JSON.parse(output), context.sources, context.memories, context.products,
      );
    } catch (error) {
      const reason = error instanceof SyntaxError
        ? "The response was not valid JSON."
        : error instanceof ZodError
          ? "The response did not match the comparison schema."
          : error instanceof Error && reasons.has(error.message)
            ? error.message
            : "The comparison failed validation.";
      onRejected(reason, attempt);
      feedback = ` Regenerate from the supplied evidence. The previous output was rejected: ${reason} Keep requested product names exactly. Use only IDs from the supplied sources and memories. For any claim or review without evidence, use exactly "Not verified" and an empty citation array; put limitations in uncertainties. Never add citations merely to pass validation. If no supported choice exists, use exactly "Insufficient evidence". Return the full JSON object, without Markdown.`;
    }
  }
  throw new ComparisonOutputError(
    "The model could not produce a verifiable comparison after a retry. No recommendation was accepted. Please try again; this is a response-validation issue, not necessarily a problem with your product names.",
  );
}
