/**
 * The programmatic entry point. Thin on purpose.
 *
 * Validate, call `clean()`, return the result. No orchestration lives here — the
 * browser path calls the same function with the same arguments, and a second code
 * path would mean two answers to the same question.
 *
 * This route exists for scripting and for anyone who wants the engine without the
 * UI. It is *not* how the app works: the default run happens client-side, which is
 * what lets an uploaded CSV stay on the machine it came from.
 */

import { z } from "zod";
import { clean } from "@/lib/clean/run";
import { DEFAULT_CONFIG } from "@/lib/clean/config";
import { parseLeadFile } from "@/lib/csv/mapping";

const Row = z.object({
  id: z.string().min(1),
  mapped: z
    .object({
      fullName: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      website: z.string().optional(),
      title: z.string().optional(),
      source: z.string().optional(),
      updatedAt: z.string().optional(),
    })
    .default({}),
  raw: z.record(z.string(), z.string()).default({}),
  truePersonId: z.string().optional(),
});

const Constraint = z.object({
  kind: z.enum(["link", "must-not-link"]),
  a: z.string().min(1),
  b: z.string().min(1),
  by: z.enum(["derived", "human"]).default("human"),
  note: z.string().optional(),
});

const Body = z
  .object({
    /** Structured rows, or raw CSV text — one or the other. */
    rows: z.array(Row).optional(),
    csv: z.string().optional(),
    config: z
      .object({
        reviewThreshold: z.number().min(0).max(1).optional(),
        nameGate: z.number().min(0).max(1).optional(),
        sourceTrust: z.array(z.string()).optional(),
        blocking: z.boolean().optional(),
        maxBlockSize: z.number().int().min(2).optional(),
        defaultPhoneRegion: z.string().optional(),
      })
      .optional(),
    constraints: z.array(Constraint).optional(),
  })
  .refine((body) => body.rows !== undefined || body.csv !== undefined, {
    message: "provide either `rows` or `csv`",
  });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    // The caller gets the field-level reason rather than a bare 400 — the whole
    // project is about explaining decisions, and this is one of them.
    return Response.json(
      { error: "invalid request", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { rows, csv, config, constraints } = parsed.data;
  const input = rows ?? parseLeadFile(csv!).rows;

  if (input.length === 0) {
    return Response.json({ error: "no rows to clean" }, { status: 400 });
  }

  const result = clean(input, { ...DEFAULT_CONFIG, ...config }, constraints ?? []);
  return Response.json(result);
}
