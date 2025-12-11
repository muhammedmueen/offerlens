export interface SalaryRange {
  min: number;
  avg: number;
  max: number;
}

export interface RoleSalaryData {
  [experience: string]: SalaryRange;
}

export interface SalaryDataset {
  [role: string]: RoleSalaryData;
}

// Base salary data (Tier 1 cities like Bangalore, Mumbai, Delhi NCR)
export const salaryData: SalaryDataset = {
  "Software Engineer": {
    "0-1 years": { min: 3.5, avg: 5.5, max: 8 },
    "1-3 years": { min: 5, avg: 8, max: 12 },
    "3-5 years": { min: 8, avg: 12, max: 18 },
    "5-8 years": { min: 12, avg: 18, max: 28 },
    "8+ years": { min: 18, avg: 28, max: 45 },
  },
  "Data Analyst": {
    "0-1 years": { min: 4, avg: 6, max: 9 },
    "1-3 years": { min: 5.5, avg: 7.5, max: 11 },
    "3-5 years": { min: 7, avg: 10, max: 15 },
    "5-8 years": { min: 10, avg: 15, max: 22 },
    "8+ years": { min: 15, avg: 22, max: 35 },
  },
  "Data Scientist": {
    "0-1 years": { min: 6, avg: 9, max: 14 },
    "1-3 years": { min: 9, avg: 14, max: 20 },
    "3-5 years": { min: 14, avg: 20, max: 30 },
    "5-8 years": { min: 20, avg: 30, max: 45 },
    "8+ years": { min: 30, avg: 45, max: 65 },
  },
  "UI/UX Designer": {
    "0-1 years": { min: 3, avg: 5, max: 8 },
    "1-3 years": { min: 5, avg: 7, max: 10 },
    "3-5 years": { min: 7, avg: 10, max: 14 },
    "5-8 years": { min: 10, avg: 15, max: 22 },
    "8+ years": { min: 15, avg: 22, max: 35 },
  },
  "Product Manager": {
    "0-1 years": { min: 8, avg: 12, max: 16 },
    "1-3 years": { min: 12, avg: 16, max: 22 },
    "3-5 years": { min: 16, avg: 22, max: 30 },
    "5-8 years": { min: 22, avg: 32, max: 45 },
    "8+ years": { min: 32, avg: 45, max: 70 },
  },
  "DevOps Engineer": {
    "0-1 years": { min: 4, avg: 6, max: 9 },
    "1-3 years": { min: 6, avg: 10, max: 14 },
    "3-5 years": { min: 10, avg: 15, max: 22 },
    "5-8 years": { min: 15, avg: 22, max: 32 },
    "8+ years": { min: 22, avg: 32, max: 50 },
  },
  "Marketing Executive": {
    "0-1 years": { min: 3, avg: 4.5, max: 7 },
    "1-3 years": { min: 4, avg: 6, max: 9 },
    "3-5 years": { min: 6, avg: 8, max: 12 },
    "5-8 years": { min: 8, avg: 12, max: 18 },
    "8+ years": { min: 12, avg: 18, max: 28 },
  },
  "Business Analyst": {
    "0-1 years": { min: 4, avg: 6, max: 9 },
    "1-3 years": { min: 6, avg: 9, max: 13 },
    "3-5 years": { min: 9, avg: 13, max: 18 },
    "5-8 years": { min: 13, avg: 18, max: 25 },
    "8+ years": { min: 18, avg: 25, max: 38 },
  },
  "HR Manager": {
    "0-1 years": { min: 3, avg: 4.5, max: 6 },
    "1-3 years": { min: 4.5, avg: 6.5, max: 9 },
    "3-5 years": { min: 6.5, avg: 9, max: 13 },
    "5-8 years": { min: 9, avg: 14, max: 20 },
    "8+ years": { min: 14, avg: 20, max: 30 },
  },
  "Frontend Developer": {
    "0-1 years": { min: 3, avg: 5, max: 7 },
    "1-3 years": { min: 5, avg: 8, max: 12 },
    "3-5 years": { min: 8, avg: 12, max: 18 },
    "5-8 years": { min: 12, avg: 18, max: 26 },
    "8+ years": { min: 18, avg: 26, max: 40 },
  },
  "Backend Developer": {
    "0-1 years": { min: 3.5, avg: 5.5, max: 8 },
    "1-3 years": { min: 5.5, avg: 9, max: 13 },
    "3-5 years": { min: 9, avg: 14, max: 20 },
    "5-8 years": { min: 14, avg: 20, max: 30 },
    "8+ years": { min: 20, avg: 30, max: 45 },
  },
  "QA Engineer": {
    "0-1 years": { min: 2.5, avg: 4, max: 6 },
    "1-3 years": { min: 4, avg: 6, max: 9 },
    "3-5 years": { min: 6, avg: 9, max: 13 },
    "5-8 years": { min: 9, avg: 13, max: 18 },
    "8+ years": { min: 13, avg: 18, max: 26 },
  },
};

// City-based salary multipliers
export const cityMultipliers: Record<string, number> = {
  "Bangalore": 1.0,
  "Mumbai": 0.95,
  "Delhi NCR": 0.92,
  "Hyderabad": 0.88,
  "Pune": 0.85,
  "Chennai": 0.82,
  "Kolkata": 0.75,
  "Ahmedabad": 0.72,
  "Other Tier 1": 0.8,
  "Tier 2 City": 0.65,
  "Remote": 0.9,
};

export const roles = Object.keys(salaryData);

export const experienceLevels = ["0-1 years", "1-3 years", "3-5 years", "5-8 years", "8+ years"];

export const cities = Object.keys(cityMultipliers);

export function getSalaryComparison(
  role: string,
  experience: string,
  offeredCTC: number,
  city: string = "Bangalore"
): {
  range: SalaryRange;
  comparison: "below" | "aligned" | "above";
  difference: number;
  message: string;
} {
  const baseRange = salaryData[role]?.[experience] || { min: 0, avg: 0, max: 0 };
  const multiplier = cityMultipliers[city] || 1.0;
  
  const range: SalaryRange = {
    min: Math.round(baseRange.min * multiplier * 10) / 10,
    avg: Math.round(baseRange.avg * multiplier * 10) / 10,
    max: Math.round(baseRange.max * multiplier * 10) / 10,
  };
  
  const difference = offeredCTC - range.avg;
  const threshold = range.avg * 0.1; // 10% threshold for "aligned"

  let comparison: "below" | "aligned" | "above";
  let message: string;

  if (offeredCTC < range.avg - threshold) {
    comparison = "below";
    message = `Your offer is below market average by ${Math.abs(difference).toFixed(1)} LPA`;
  } else if (offeredCTC > range.avg + threshold) {
    comparison = "above";
    message = `Your offer exceeds market average by ${difference.toFixed(1)} LPA`;
  } else {
    comparison = "aligned";
    message = "Your offer is aligned with market standards";
  }

  return { range, comparison, difference, message };
}

export function calculateTakeHome(ctc: number): number {
  return (ctc * 0.7 * 100000) / 12;
}
