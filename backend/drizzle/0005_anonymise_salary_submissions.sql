-- Task 4.6: salary submissions are anonymous. New rows never carry these (the code stopped
-- writing them); this clears the ones already stored. The columns stay, always NULL, and are
-- dropped in a later change (expand-contract). Also unblocks account deletion (follow-up F5).
UPDATE "salary_submissions" SET "user_id" = NULL, "fingerprint" = NULL;
