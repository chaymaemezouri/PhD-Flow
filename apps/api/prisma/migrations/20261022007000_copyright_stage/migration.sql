CREATE TYPE "CopyrightStageStatus" AS ENUM ('LOCKED', 'OPEN', 'DEPOSITED', 'VALIDATED');

ALTER TABLE "papers" ADD COLUMN "copyright_stage_status" "CopyrightStageStatus" NOT NULL DEFAULT 'LOCKED';
