import { db, conn } from './index.js';
import { metadataRoles, metadataCities, metadataExperienceLevels } from './schema/metadata.js';
import { ROLES, CITIES, EXPERIENCE } from './seed-data.js';

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
