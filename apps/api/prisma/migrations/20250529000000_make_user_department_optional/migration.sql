-- Make departmentId optional on User to allow ADMIN accounts without a department
ALTER TABLE "User" ALTER COLUMN "departmentId" DROP NOT NULL;
