import { db, conn } from './index.js';
import { metadataRoles, metadataCities, metadataExperienceLevels } from './schema/metadata.js';
import { sql } from 'drizzle-orm';

const ROLES = [
    { name: 'Software Engineer', category: 'engineering' },
    { name: 'Senior Software Engineer', category: 'engineering' },
    { name: 'Staff Software Engineer', category: 'engineering' },
    { name: 'Principal Software Engineer', category: 'engineering' },
    { name: 'Frontend Engineer', category: 'engineering' },
    { name: 'Backend Engineer', category: 'engineering' },
    { name: 'Full Stack Engineer', category: 'engineering' },
    { name: 'DevOps Engineer', category: 'engineering' },
    { name: 'Data Engineer', category: 'engineering' },
    { name: 'Product Manager', category: 'product' },
    { name: 'Senior Product Manager', category: 'product' },
    { name: 'Product Designer', category: 'design' },
    { name: 'Senior Product Designer', category: 'design' },
    { name: 'Engineering Manager', category: 'engineering' },
    { name: 'Director of Engineering', category: 'engineering' },
    { name: 'QA Engineer', category: 'engineering' },
    { name: 'Mobile Engineer', category: 'engineering' },
    { name: 'Data Scientist', category: 'data' },
    { name: 'Marketing Manager', category: 'marketing' },
    { name: 'Sales Development Rep', category: 'sales' },
    { name: 'Account Executive', category: 'sales' },
    { name: 'HR Manager', category: 'hr' },
    { name: 'Recruiter', category: 'hr' },
];

const CITIES = [
    { name: 'Bangalore', state: 'Karnataka', country: 'India' },
    { name: 'Mumbai', state: 'Maharashtra', country: 'India' },
    { name: 'Delhi NCR', state: 'Delhi', country: 'India' },
    { name: 'Hyderabad', state: 'Telangana', country: 'India' },
    { name: 'Pune', state: 'Maharashtra', country: 'India' },
    { name: 'Chennai', state: 'Tamil Nadu', country: 'India' },
    { name: 'San Francisco', state: 'California', country: 'USA' },
    { name: 'New York', state: 'New York', country: 'USA' },
    { name: 'London', state: null, country: 'UK' },
    { name: 'Berlin', state: null, country: 'Germany' },
    { name: 'Singapore', state: null, country: 'Singapore' },
    { name: 'Dubai', state: null, country: 'UAE' },
    { name: 'Remote', state: null, country: 'Global' },
];

const EXPERIENCE = [
    { label: 'Fresher (0-1 yrs)', minYears: 0, maxYears: 1 },
    { label: 'Junior (1-3 yrs)', minYears: 1, maxYears: 3 },
    { label: 'Mid-Level (3-5 yrs)', minYears: 3, maxYears: 5 },
    { label: 'Senior (5-8 yrs)', minYears: 5, maxYears: 8 },
    { label: 'Staff/Lead (8-12 yrs)', minYears: 8, maxYears: 12 },
    { label: 'Principal/Director (12+ yrs)', minYears: 12, maxYears: 99 },
];

async function seed() {
    console.log('🌱 Seeding database...');

    try {
        // Upsert Roles
        console.log('...seeding roles');
        await db.insert(metadataRoles)
            .values(ROLES)
            .onConflictDoNothing({ target: metadataRoles.name });

        // Upsert Cities
        console.log('...seeding cities');
        // Composite unique constraint check might need explicit SQL or just trust onConflictDoNothing works if defined
        // For now simple insert, skipping conflicts
        for (const city of CITIES) {
            await db.insert(metadataCities)
                .values(city)
                .onConflictDoNothing({ target: [metadataCities.name, metadataCities.country] }); // target composite
        }

        // Upsert Experience
        console.log('...seeding experience levels');
        await db.insert(metadataExperienceLevels)
            .values(EXPERIENCE)
            .onConflictDoNothing({ target: metadataExperienceLevels.label });

        console.log('✅ Seeding complete!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

seed();
