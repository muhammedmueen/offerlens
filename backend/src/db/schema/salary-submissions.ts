import { pgTable, uuid, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const salarySubmissions = pgTable('salary_submissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id), // Optional: can be null for guest submissions
    role: text('role').notNull(),
    city: text('city').notNull(),
    experienceYears: integer('experience_years').notNull(),
    ctc: integer('ctc').notNull(), // Cost to Company
    companyType: text('company_type', { enum: ['product', 'service', 'startup', 'mnc', 'other'] }).notNull(),
    companySize: text('company_size', { enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'] }),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    fingerprint: text('fingerprint'), // To prevent spam from same device
}, (table) => {
    return {
        roleCityIdx: index('idx_salary_role_city').on(table.role, table.city),
        statusIdx: index('idx_salary_status').on(table.status),
    };
});

export type SalarySubmission = typeof salarySubmissions.$inferSelect;
export type NewSalarySubmission = typeof salarySubmissions.$inferInsert;
