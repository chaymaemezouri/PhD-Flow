CREATE TYPE "RemarkStatus" AS ENUM ('OPEN', 'ADDRESSED', 'VALIDATED');

CREATE TABLE "revision_remarks" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "status" "RemarkStatus" NOT NULL DEFAULT 'OPEN',
    "round" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "addressed_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "validated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revision_remarks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "revision_remarks_paper_id_round_sort_order_idx" ON "revision_remarks"("paper_id", "round", "sort_order");

ALTER TABLE "revision_remarks" ADD CONSTRAINT "revision_remarks_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "revision_remarks" ADD CONSTRAINT "revision_remarks_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;