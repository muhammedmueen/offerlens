import { pgTable, serial, text, integer, unique, index } from 'drizzle-orm/pg-core';

export const metadataRoles = pgTable('metadata_roles', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    category: text('category').notNull(),
});

export const metadataCities = pgTable('metadata_cities', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    state: text('state'),
    country: text('country').notNull().default('India'),
}, (table) => {
    return {
        uniqueCity: unique().on(table.name, table.country),
        countryIdx: index('idx_cities_country').on(table.country),
    };
});

export const metadataExperienceLevels = pgTable('metadata_experience_levels', {
    id: serial('id').primaryKey(),
    label: text('label').notNull().unique(),
    minYears: integer('min_years').notNull(),
    maxYears: integer('max_years').notNull(),
});

export type MetadataRole = typeof metadataRoles.$inferSelect;
export type MetadataCity = typeof metadataCities.$inferSelect;
export type MetadataExperienceLevel = typeof metadataExperienceLevels.$inferSelect;
