ALTER TYPE "PaperFileKind" ADD VALUE 'REVISION';
ALTER TYPE "PaperFileKind" ADD VALUE 'CAMERA_READY';
ALTER TYPE "PaperFileKind" ADD VALUE 'SIMILARITY';
ALTER TYPE "PaperFileKind" ADD VALUE 'COPYRIGHT';

CREATE TYPE "Recommendation" AS ENUM ('ACCEPT', 'WEAK_ACCEPT', 'BORDERLINE', 'WEAK_REJECT', 'REJECT');
CREATE TYPE "DecisionOutcome" AS ENUM ('ACCEPTED', 'CONDITIONALLY_ACCEPTED', 'REVISION_REQUIRED', 'REJECTED');
CREATE TYPE "DecisionStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "CopyrightStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');
CREATE TYPE "RegistrationStatus" AS ENUM ('REQUESTED', 'VERIFIED', 'REJECTED');
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VERIFIED');

ALTER TABLE "users" ADD COLUMN "mfa_secret" TEXT;

CREATE TABLE "review_forms" (
  "id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "recommendation" "Recommendation" NOT NULL,
  "score" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "comments_to_author" TEXT NOT NULL DEFAULT '',
  "comments_to_committee" TEXT NOT NULL DEFAULT '',
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_forms_assignment_id_key" ON "review_forms"("assignment_id");
ALTER TABLE "review_forms" ADD CONSTRAINT "review_forms_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "review_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "decisions" (
  "id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  "outcome" "DecisionOutcome" NOT NULL,
  "letter" TEXT NOT NULL DEFAULT '',
  "status" "DecisionStatus" NOT NULL DEFAULT 'DRAFT',
  "decided_by_id" UUID,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decisions_paper_id_key" ON "decisions"("paper_id");
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "similarity_reports" (
  "id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "similarity_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "similarity_reports_paper_id_key" ON "similarity_reports"("paper_id");
ALTER TABLE "similarity_reports" ADD CONSTRAINT "similarity_reports_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "copyright_records" (
  "id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  "status" "CopyrightStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copyright_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "copyright_records_paper_id_key" ON "copyright_records"("paper_id");
ALTER TABLE "copyright_records" ADD CONSTRAINT "copyright_records_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "registrations" (
  "id" UUID NOT NULL,
  "conference_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'REQUESTED',
  "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registrations_conference_id_user_id_key" ON "registrations"("conference_id", "user_id");
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "rooms" (
  "id" UUID NOT NULL,
  "conference_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 40,
  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "program_sessions" (
  "id" UUID NOT NULL,
  "conference_id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "program_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "presentations" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  CONSTRAINT "presentations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "presentations_paper_id_key" ON "presentations"("paper_id");
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "program_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
