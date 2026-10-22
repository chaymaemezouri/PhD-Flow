CREATE TYPE "SimilarityStatus" AS ENUM ('LOCKED', 'OPEN', 'DEPOSITED', 'VALIDATED');

ALTER TABLE "papers" ADD COLUMN "similarity_status" "SimilarityStatus" NOT NULL DEFAULT 'LOCKED';
