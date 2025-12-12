import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Salary data from frontend (Base salary data for Tier 1 cities)
const salaryData = {
  'Software Engineer': {
    '0-1 years': { min: 3.5, avg: 5.5, max: 8 },
    '1-3 years': { min: 5, avg: 8, max: 12 },
    '3-5 years': { min: 8, avg: 12, max: 18 },
    '5-8 years': { min: 12, avg: 18, max: 28 },
    '8+ years': { min: 18, avg: 28, max: 45 },
  },
  'Data Analyst': {
    '0-1 years': { min: 4, avg: 6, max: 9 },
    '1-3 years': { min: 5.5, avg: 7.5, max: 11 },
    '3-5 years': { min: 7, avg: 10, max: 15 },
    '5-8 years': { min: 10, avg: 15, max: 22 },
    '8+ years': { min: 15, avg: 22, max: 35 },
  },
  'Data Scientist': {
    '0-1 years': { min: 6, avg: 9, max: 14 },
    '1-3 years': { min: 9, avg: 14, max: 20 },
    '3-5 years': { min: 14, avg: 20, max: 30 },
    '5-8 years': { min: 20, avg: 30, max: 45 },
    '8+ years': { min: 30, avg: 45, max: 65 },
  },
  'UI/UX Designer': {
    '0-1 years': { min: 3, avg: 5, max: 8 },
    '1-3 years': { min: 5, avg: 7, max: 10 },
    '3-5 years': { min: 7, avg: 10, max: 14 },
    '5-8 years': { min: 10, avg: 15, max: 22 },
    '8+ years': { min: 15, avg: 22, max: 35 },
  },
  'Product Manager': {
    '0-1 years': { min: 8, avg: 12, max: 16 },
    '1-3 years': { min: 12, avg: 16, max: 22 },
    '3-5 years': { min: 16, avg: 22, max: 30 },
    '5-8 years': { min: 22, avg: 32, max: 45 },
    '8+ years': { min: 32, avg: 45, max: 70 },
  },
  'DevOps Engineer': {
    '0-1 years': { min: 4, avg: 6, max: 9 },
    '1-3 years': { min: 6, avg: 10, max: 14 },
    '3-5 years': { min: 10, avg: 15, max: 22 },
    '5-8 years': { min: 15, avg: 22, max: 32 },
    '8+ years': { min: 22, avg: 32, max: 50 },
  },
  'Marketing Executive': {
    '0-1 years': { min: 3, avg: 4.5, max: 7 },
    '1-3 years': { min: 4, avg: 6, max: 9 },
    '3-5 years': { min: 6, avg: 8, max: 12 },
    '5-8 years': { min: 8, avg: 12, max: 18 },
    '8+ years': { min: 12, avg: 18, max: 28 },
  },
  'Business Analyst': {
    '0-1 years': { min: 4, avg: 6, max: 9 },
    '1-3 years': { min: 6, avg: 9, max: 13 },
    '3-5 years': { min: 9, avg: 13, max: 18 },
    '5-8 years': { min: 13, avg: 18, max: 25 },
    '8+ years': { min: 18, avg: 25, max: 38 },
  },
  'HR Manager': {
    '0-1 years': { min: 3, avg: 4.5, max: 6 },
    '1-3 years': { min: 4.5, avg: 6.5, max: 9 },
    '3-5 years': { min: 6.5, avg: 9, max: 13 },
    '5-8 years': { min: 9, avg: 14, max: 20 },
    '8+ years': { min: 14, avg: 20, max: 30 },
  },
  'Frontend Developer': {
    '0-1 years': { min: 3, avg: 5, max: 7 },
    '1-3 years': { min: 5, avg: 8, max: 12 },
    '3-5 years': { min: 8, avg: 12, max: 18 },
    '5-8 years': { min: 12, avg: 18, max: 26 },
    '8+ years': { min: 18, avg: 26, max: 40 },
  },
  'Backend Developer': {
    '0-1 years': { min: 3.5, avg: 5.5, max: 8 },
    '1-3 years': { min: 5.5, avg: 9, max: 13 },
    '3-5 years': { min: 9, avg: 14, max: 20 },
    '5-8 years': { min: 14, avg: 20, max: 30 },
    '8+ years': { min: 20, avg: 30, max: 45 },
  },
  'QA Engineer': {
    '0-1 years': { min: 2.5, avg: 4, max: 6 },
    '1-3 years': { min: 4, avg: 6, max: 9 },
    '3-5 years': { min: 6, avg: 9, max: 13 },
    '5-8 years': { min: 9, avg: 13, max: 18 },
    '8+ years': { min: 13, avg: 18, max: 26 },
  },
};

// City multipliers
const cityMultipliers: Record<string, number> = {
  Bangalore: 1.0,
  Mumbai: 0.95,
  'Delhi NCR': 0.92,
  Hyderabad: 0.88,
  Pune: 0.85,
  Chennai: 0.82,
  Kolkata: 0.75,
  Ahmedabad: 0.72,
  'Other Tier 1': 0.8,
  'Tier 2 City': 0.65,
  Remote: 0.9,
};

// Red flag rules from frontend
const redFlagRules = [
  {
    ruleId: 'training-bond',
    severity: 'high',
    title: 'Training Bond / Lock-in Detected',
    description:
      'This clause may require you to stay with the company for a fixed period or pay a penalty. Review the bond duration and penalty amount carefully.',
    keywords: [
      'bond',
      'service agreement',
      'training cost',
      'recover cost',
      'lock-in period',
    ],
  },
  {
    ruleId: 'non-compete',
    severity: 'high',
    title: 'Non-Compete Clause',
    description:
      'This restricts your ability to work with competitors after leaving. Such clauses are uncommon and may limit your career options.',
    keywords: [
      'non-compete',
      'not work with competitors',
      'competitive employment',
      'non compete',
    ],
  },
  {
    ruleId: 'bonus-clawback',
    severity: 'high',
    title: 'Bonus Clawback Clause',
    description:
      'You may be required to return your bonus under certain conditions. This poses a financial penalty risk.',
    keywords: [
      'recover bonus',
      'bonus clawback',
      'repay bonus',
      'return bonus',
      'forfeit bonus',
    ],
  },
  {
    ruleId: 'long-notice',
    severity: 'medium',
    title: 'Long Notice Period',
    description:
      'A 90-day notice period can delay your next opportunity. Consider negotiating a buyout clause or reduction.',
    keywords: [
      '90 days notice',
      '3 months notice',
      '90 day notice',
      'three months notice',
    ],
  },
  {
    ruleId: 'high-variable',
    severity: 'medium',
    title: 'High Variable Component',
    description:
      'A significant portion of your compensation is variable, which may lead to unstable take-home pay.',
    keywords: [
      'variable pay',
      'performance bonus',
      'incentive pay',
      'variable component',
    ],
  },
  {
    ruleId: 'extended-probation',
    severity: 'medium',
    title: 'Extended Probation Period',
    description:
      'A 6-month probation period is longer than standard. During this time, benefits and job security may be limited.',
    keywords: [
      'probation 6 months',
      '6 month probation',
      'six months probation',
      'extended probation',
    ],
  },
  {
    ruleId: 'gratuity-included',
    severity: 'low',
    title: 'Gratuity Included in CTC',
    description:
      "Gratuity is a statutory benefit that shouldn't be part of CTC. This inflates the apparent salary figure.",
    keywords: ['gratuity included', 'gratuity in ctc', 'ctc includes gratuity'],
  },
  {
    ruleId: 'reimbursement-heavy',
    severity: 'low',
    title: 'Reimbursement-Heavy CTC',
    description:
      'A significant portion of CTC may require expense claims. This affects your actual take-home amount.',
    keywords: [
      'reimbursements',
      'reimbursement',
      'expense claims',
      'fuel reimbursement',
      'travel reimbursement',
    ],
  },
];

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.featureRequestVote.deleteMany();
  await prisma.featureRequest.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.redFlagRule.deleteMany();
  await prisma.salaryBenchmark.deleteMany();
  await prisma.adminUser.deleteMany();

  // Seed salary benchmarks
  console.log('💰 Seeding salary benchmarks...');
  let salaryCount = 0;

  for (const [role, experienceLevels] of Object.entries(salaryData)) {
    for (const [experienceLevel, salaryRange] of Object.entries(
      experienceLevels
    )) {
      for (const [city, multiplier] of Object.entries(cityMultipliers)) {
        await prisma.salaryBenchmark.create({
          data: {
            role,
            experienceLevel,
            city,
            minSalary: salaryRange.min * multiplier,
            avgSalary: salaryRange.avg * multiplier,
            maxSalary: salaryRange.max * multiplier,
            effectiveDate: new Date(),
          },
        });
        salaryCount++;
      }
    }
  }

  console.log(`✅ Created ${salaryCount} salary benchmarks`);

  // Seed red flag rules
  console.log('🚩 Seeding red flag rules...');
  for (const rule of redFlagRules) {
    await prisma.redFlagRule.create({
      data: rule,
    });
  }
  console.log(`✅ Created ${redFlagRules.length} red flag rules`);

  // Create default admin user
  console.log('👤 Creating default admin user...');
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: hashedPassword,
      role: 'super_admin',
    },
  });
  console.log('✅ Created admin user (username: admin)');

  console.log('');
  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('Summary:');
  console.log(`  - ${salaryCount} salary benchmarks`);
  console.log(`  - ${redFlagRules.length} red flag rules`);
  console.log('  - 1 admin user');
  console.log('');
  console.log('Default admin credentials:');
  console.log('  Username: admin');
  console.log(`  Password: ${adminPassword}`);
  console.log('');
  console.log('⚠️  Remember to change the admin password in production!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
