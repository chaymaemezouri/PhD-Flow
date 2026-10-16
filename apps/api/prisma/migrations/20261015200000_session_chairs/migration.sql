ALTER TABLE "papers" ADD COLUMN "session_chair_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
