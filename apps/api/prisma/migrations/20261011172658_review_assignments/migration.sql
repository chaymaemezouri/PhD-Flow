-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateTable
CREATE TABLE "review_assignments" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'INVITED',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "invited_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_declarations" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "paper_id" UUID,
    "author_email" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "declared_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_assignments_token_hash_key" ON "review_assignments"("token_hash");

-- CreateIndex
CREATE INDEX "review_assignments_paper_id_reviewer_id_idx" ON "review_assignments"("paper_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "review_assignments_reviewer_id_status_idx" ON "review_assignments"("reviewer_id", "status");

-- CreateIndex
CREATE INDEX "conflict_declarations_conference_id_user_id_idx" ON "conflict_declarations"("conference_id", "user_id");

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declarations" ADD CONSTRAINT "conflict_declarations_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declarations" ADD CONSTRAINT "conflict_declarations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declarations" ADD CONSTRAINT "conflict_declarations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_declarations" ADD CONSTRAINT "conflict_declarations_declared_by_id_fkey" FOREIGN KEY ("declared_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
