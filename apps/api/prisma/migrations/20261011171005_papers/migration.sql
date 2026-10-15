-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaperFileKind" AS ENUM ('MANUSCRIPT');

-- AlterTable
ALTER TABLE "conferences" ADD COLUMN     "next_paper_number" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "track_id" UUID,
    "public_id" TEXT,
    "title" TEXT NOT NULL,
    "abstract" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PaperStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_authors" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "affiliation" TEXT NOT NULL DEFAULT '',
    "corresponding" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "paper_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_files" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "kind" "PaperFileKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_status_events" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "from_status" "PaperStatus",
    "to_status" "PaperStatus" NOT NULL,
    "actor_id" UUID,
    "reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "papers_public_id_key" ON "papers"("public_id");

-- CreateIndex
CREATE INDEX "papers_conference_id_status_idx" ON "papers"("conference_id", "status");

-- CreateIndex
CREATE INDEX "papers_created_by_id_idx" ON "papers"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_authors_paper_id_position_key" ON "paper_authors"("paper_id", "position");

-- CreateIndex
CREATE INDEX "paper_files_paper_id_kind_idx" ON "paper_files"("paper_id", "kind");

-- CreateIndex
CREATE INDEX "paper_status_events_paper_id_created_at_idx" ON "paper_status_events"("paper_id", "created_at");

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_authors" ADD CONSTRAINT "paper_authors_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_files" ADD CONSTRAINT "paper_files_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_files" ADD CONSTRAINT "paper_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_status_events" ADD CONSTRAINT "paper_status_events_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_status_events" ADD CONSTRAINT "paper_status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
