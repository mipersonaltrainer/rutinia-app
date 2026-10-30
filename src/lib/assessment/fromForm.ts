export function formToAssessment(fd: FormData) {
  const s = (k: string) => (fd.get(k) as string | null) ?? "";
  const b = (k: string) => fd.get(k) === "on";
  return {
    personal: { birthDate: s("birthDate"), sexForFormulas: s("sexForFormulas"), occupation: s("occupation"), workType: s("workType"), sittingHours: s("sittingHours"), activityLevel: s("activityLevel"), sleepQuality: s("sleepQuality"), stress: s("stress") },
    training: { experienceYears: s("experienceYears"), weeklyFrequency: s("weeklyFrequency"), sessionMinutes: s("sessionMinutes"), location: s("location"), equipment: s("equipment"), avoidExercises: s("avoidExercises") },
    goals: { goals: fd.getAll("goals") as string[], timeframe: s("timeframe"), motivation: s("motivation") },
    health: {
      chestPainDuringExercise: b("chestPainDuringExercise"), dizzinessOrFainting: b("dizzinessOrFainting"), unusualBreathlessness: b("unusualBreathlessness"),
      cardiovascularHistory: b("cardiovascularHistory"), medicalRestriction: b("medicalRestriction"), medicalClearance: b("medicalClearance"),
      pregnancyStatus: s("pregnancyStatus") || "not_applicable", eatingDisorderHistory: b("eatingDisorderHistory"), currentPain: s("currentPain") || "0",
      injuries: s("injuries"), surgeries: s("surgeries"), conditions: s("conditions"), medications: s("medications"),
    },
    habits: { sleepHours: s("sleepHours"), recovery: s("recovery"), barriers: s("barriers") },
  };
}
