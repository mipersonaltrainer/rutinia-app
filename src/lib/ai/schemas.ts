import { z } from "zod";

// Schemas are intentionally minimal (types only): numeric ranges, lengths and membership are enforced by deterministic validators, not trusted to the model.
export const PlanDraftSchema = z.object({
  title: z.string(), rationale: z.string(),
  sessions: z.array(z.object({
    name: z.string(), weekday: z.number().int().nullable(), warmup_notes: z.string().nullable(),
    exercises: z.array(z.object({ code: z.string(), sets: z.number().int(), reps_min: z.number().int(), reps_max: z.number().int(), rest_sec: z.number().int(), rir: z.number().int().nullable(), client_notes: z.string().nullable() })),
  })),
  assumptions: z.array(z.string()), questions_for_trainer: z.array(z.string()),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

export const ReportTextSchema = z.object({ observations: z.string(), next_goals: z.string(), caveats: z.array(z.string()) });
export type ReportText = z.infer<typeof ReportTextSchema>;

export const ClientAnswerSchema = z.object({ answer: z.string(), sources: z.array(z.string()), needs_trainer: z.boolean() });
export type ClientAnswer = z.infer<typeof ClientAnswerSchema>;
