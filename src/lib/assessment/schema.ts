import { z } from "zod";

const scale = z.coerce.number().int().min(1).max(5);
export const assessmentSchema = z.object({
  personal: z.object({
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    sexForFormulas: z.enum(["male", "female", "unspecified"]),
    occupation: z.string().max(120).optional().default(""),
    workType: z.enum(["sedentary", "mixed", "active"]),
    sittingHours: z.coerce.number().min(0).max(24),
    activityLevel: z.enum(["sedentary", "light", "moderate", "high", "veryHigh"]),
    sleepQuality: scale,
    stress: scale,
  }),
  training: z.object({
    experienceYears: z.coerce.number().min(0).max(70),
    weeklyFrequency: z.coerce.number().int().min(0).max(14),
    sessionMinutes: z.coerce.number().int().min(10).max(240),
    location: z.enum(["gym", "home", "outdoor", "mixed"]),
    equipment: z.string().max(300).optional().default(""),
    avoidExercises: z.string().max(300).optional().default(""),
  }),
  goals: z.object({
    goals: z.array(z.enum(["hypertrophy", "strength", "fat_loss", "endurance", "recomposition", "mobility", "general_health", "sport", "return_to_training"])).min(1, "Elige al menos un objetivo"),
    timeframe: z.string().max(120).optional().default(""),
    motivation: z.string().max(300).optional().default(""),
  }),
  health: z.object({
    chestPainDuringExercise: z.boolean(),
    dizzinessOrFainting: z.boolean(),
    unusualBreathlessness: z.boolean(),
    cardiovascularHistory: z.boolean(),
    medicalRestriction: z.boolean(),
    medicalClearance: z.boolean(),
    pregnancyStatus: z.enum(["not_applicable", "pregnant", "postpartum"]),
    eatingDisorderHistory: z.boolean(),
    currentPain: z.coerce.number().int().min(0).max(10),
    injuries: z.string().max(500).optional().default(""),
    surgeries: z.string().max(500).optional().default(""),
    conditions: z.string().max(500).optional().default(""),
    medications: z.string().max(500).optional().default(""),
  }),
  habits: z.object({
    sleepHours: z.coerce.number().min(0).max(16),
    recovery: scale,
    barriers: z.string().max(300).optional().default(""),
  }),
});
export type AssessmentData = z.infer<typeof assessmentSchema>;
