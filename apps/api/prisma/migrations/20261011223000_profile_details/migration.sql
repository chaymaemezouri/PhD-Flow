ALTER TABLE "profiles" ADD COLUMN "biography" TEXT;
ALTER TABLE "profiles" ADD COLUMN "photo_path" TEXT;
ALTER TABLE "profiles" ADD COLUMN "education" JSONB NOT NULL DEFAULT '[]';
