CREATE TYPE "PresentationModality" AS ENUM ('IN_PERSON', 'ONLINE');

ALTER TABLE "presentations" ADD COLUMN "modality" "PresentationModality" NOT NULL DEFAULT 'IN_PERSON';
ALTER TABLE "presentations" ADD COLUMN "presented_at" TIMESTAMP(3);
