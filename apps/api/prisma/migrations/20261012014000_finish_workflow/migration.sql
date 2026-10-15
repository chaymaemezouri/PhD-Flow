ALTER TABLE "email_outbox" ADD COLUMN "subject" TEXT NOT NULL DEFAULT '';
ALTER TABLE "email_outbox" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';

ALTER TABLE "similarity_reports" ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "presentations" ADD COLUMN "score" INTEGER;
ALTER TABLE "presentations" ADD COLUMN "comment" TEXT NOT NULL DEFAULT '';
