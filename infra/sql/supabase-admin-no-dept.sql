-- Make ADMIN accounts department-agnostic.
-- Safe to run multiple times (idempotent).

-- 1. Allow NULL on the column if not already nullable
ALTER TABLE "User" ALTER COLUMN "departmentId" DROP NOT NULL;

-- 2. Clear the department association for all ADMIN users
UPDATE "User" SET "departmentId" = NULL, "managerId" = NULL
WHERE role = 'ADMIN';
