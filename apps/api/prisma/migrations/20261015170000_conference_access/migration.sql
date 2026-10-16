ALTER TABLE "conferences" ADD COLUMN "access_password_hash" TEXT;

ALTER TABLE "sessions" ADD COLUMN "unlocked_conference_id" UUID;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_unlocked_conference_id_fkey" FOREIGN KEY ("unlocked_conference_id") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
