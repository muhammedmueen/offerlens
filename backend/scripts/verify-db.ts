import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyDatabase() {
  console.log('🔍 Verifying database setup...\n');

  try {
    // Test connection
    console.log('1️⃣  Testing database connection...');
    await prisma.$connect();
    console.log('   ✅ Database connection successful\n');

    // Check salary benchmarks
    console.log('2️⃣  Checking salary benchmarks...');
    const salaryCount = await prisma.salaryBenchmark.count();
    console.log(`   ✅ Found ${salaryCount} salary benchmark records\n`);

    // Check red flag rules
    console.log('3️⃣  Checking red flag rules...');
    const redFlagCount = await prisma.redFlagRule.count();
    const activeRules = await prisma.redFlagRule.count({
      where: { active: true },
    });
    console.log(`   ✅ Found ${redFlagCount} red flag rules (${activeRules} active)\n`);

    // Check admin users
    console.log('4️⃣  Checking admin users...');
    const adminCount = await prisma.adminUser.count();
    console.log(`   ✅ Found ${adminCount} admin user(s)\n`);

    // Sample queries
    console.log('5️⃣  Testing sample queries...');
    
    const sampleSalary = await prisma.salaryBenchmark.findFirst({
      where: {
        role: 'Software Engineer',
        experienceLevel: '3-5 years',
        city: 'Bangalore',
      },
    });
    
    if (sampleSalary) {
      console.log('   ✅ Sample salary query successful');
      console.log(`      Software Engineer (3-5 years) in Bangalore:`);
      console.log(`      Range: ${sampleSalary.minSalary} - ${sampleSalary.maxSalary} LPA`);
      console.log(`      Average: ${sampleSalary.avgSalary} LPA\n`);
    }

    const sampleRedFlag = await prisma.redFlagRule.findFirst({
      where: { severity: 'high' },
    });
    
    if (sampleRedFlag) {
      console.log('   ✅ Sample red flag query successful');
      console.log(`      Rule: ${sampleRedFlag.title}`);
      console.log(`      Severity: ${sampleRedFlag.severity}\n`);
    }

    console.log('🎉 Database verification completed successfully!\n');
    console.log('Your database is ready to use. You can now:');
    console.log('  - Start the development server: npm run dev');
    console.log('  - Open Prisma Studio: npm run prisma:studio');
    console.log('  - View database docs: cat DATABASE.md\n');

  } catch (error) {
    console.error('❌ Database verification failed:', error);
    console.log('\nTroubleshooting steps:');
    console.log('  1. Ensure PostgreSQL is running: docker-compose ps');
    console.log('  2. Check DATABASE_URL in .env file');
    console.log('  3. Run migrations: npm run prisma:migrate');
    console.log('  4. Seed database: npm run prisma:seed\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDatabase();
