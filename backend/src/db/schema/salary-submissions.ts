import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const salarySubmissions = pgTable('salary_submissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    // DEPRECATED (task 4.6): always NULL. Submissions are anonymous; the code no longer writes it
    // and the migration cleared old values. Kept so the column drop ships as its own later change.
    userId: uuid('user_id').references(() => users.id),
    role: text('role').notNull(),
    city: text('city').notNull(),
    experienceYears: integer('experience_years').notNull(),
    ctc: integer('ctc').notNull(), // Cost to Company
    companyType: text('company_type', { enum: ['product', 'service', 'startup', 'mnc', 'other'] }).notNull(),
    companySize: text('company_size', { enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'] }),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    fingerprint: text('fingerprint'), // DEPRECATED (task 4.6): always NULL, see userId. The cooldown is in Redis.
}, (table) => {
    return {
        roleCityIdx: index('idx_salary_role_city').on(table.role, table.city),
        statusIdx: index('idx_salary_status').on(table.status),
    };
});

export type SalarySubmission = typeof salarySubmissions.$inferSelect;
export type NewSalarySubmission = typeof salarySubmissions.$inferInsert;
