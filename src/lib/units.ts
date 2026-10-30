export type WeightUnit = "kg" | "lb";
export type LengthUnit = "cm" | "in";
const r1 = (n: number) => Math.round(n * 10) / 10;

export const toKg = (v: number, u: WeightUnit) => r1(u === "kg" ? v : v * 0.45359237);
export const toCm = (v: number, u: LengthUnit) => r1(u === "cm" ? v : v * 2.54);
export const fromKg = (kg: number, u: WeightUnit) => r1(u === "kg" ? kg : kg / 0.45359237);
export const fromCm = (cm: number, u: LengthUnit) => r1(u === "cm" ? cm : cm / 2.54);

export function ageFromBirthDate(birth: string, today: Date = new Date()): number {
  const b = new Date(birth + "T00:00:00Z");
  if (Number.isNaN(b.getTime())) throw new RangeError("invalid birth date");
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age--;
  if (age < 0 || age > 120) throw new RangeError("age out of range");
  return age;
}
