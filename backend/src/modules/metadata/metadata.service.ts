import { db } from '@/db/index.js';
import { metadataRoles, metadataCities, metadataExperienceLevels } from '@/db/schema/metadata.js';
import { eq, ilike, and } from 'drizzle-orm';

export class MetadataService {
    async getRoles(query?: string, category?: string) {
        // Basic search and filter
        const filters = [];
        if (category) filters.push(eq(metadataRoles.category, category));
        if (query) filters.push(ilike(metadataRoles.name, `%${query}%`));

        return db.query.metadataRoles.findMany({
            where: filters.length ? and(...filters) : undefined,
            limit: 100,
        });
    }

    async getCities(query?: string, country?: string) {
        const filters = [];
        if (country) filters.push(eq(metadataCities.country, country));
        if (query) filters.push(ilike(metadataCities.name, `%${query}%`));

        return db.query.metadataCities.findMany({
            where: filters.length ? and(...filters) : undefined,
            limit: 100,
        });
    }

    async getExperienceLevels() {
        return db.query.metadataExperienceLevels.findMany();
    }
}
