import type {
  RepairVerificationInput,
  RepairVerificationResult,
} from "./healing.types.js";

export function verifyRepair(
  input: RepairVerificationInput,
): RepairVerificationResult {
  if (!input.repairSucceeded) {
    return { recovered: false, reason: "Bright Data repair did not succeed" };
  }

  if (!input.scrapeCompleted) {
    return { recovered: false, reason: "Verification scrape did not complete" };
  }

  if (!input.health) {
    return { recovered: false, reason: "Verification health result is missing" };
  }

  if (input.health.status !== "healthy") {
    return {
      recovered: false,
      reason: `Verification health is ${input.health.status}`,
    };
  }

  return { recovered: true, reason: "Repaired scrape passed health verification" };
}

export function canAttemptHealing(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}

export function finalHealingStatus(
  recovered: boolean,
  attempts: number,
  maxAttempts: number,
): "recovered" | "escalated" | "repairing" {
  if (recovered) {
    return "recovered";
  }

  return attempts >= maxAttempts ? "escalated" : "repairing";
}
