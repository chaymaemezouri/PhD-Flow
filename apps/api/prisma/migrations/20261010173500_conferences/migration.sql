-- CreateEnum
CREATE TYPE "ConferenceVisibility" AS ENUM ('PUBLIC', 'UNLISTED');

-- CreateEnum
CREATE TYPE "ConferenceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('SINGLE_BLIND', 'DOUBLE_BLIND', 'OPEN');

-- CreateEnum
CREATE TYPE "ConferenceRole" AS ENUM ('CHAIR', 'ADMINISTRATOR', 'COMMITTEE', 'REVIEWER', 'AUTHOR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED', 'REMOVED');

-- CreateEnum
CREATE TYPE "DeadlineKind" AS ENUM ('SUBMISSION', 'REVIEW', 'NOTIFICATION', 'CAMERA_READY', 'REGISTRATION');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('INVITATION', 'DECISION_LETTER', 'COPYRIGHT', 'NOTIFICATION');

-- CreateTable
CREATE TABLE "conferences" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "website" TEXT,
    "city" TEXT,
    "country" TEXT,
    "starts_on" DATE,
    "ends_on" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "visibility" "ConferenceVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "ConferenceStatus" NOT NULL DEFAULT 'DRAFT',
    "review_mode" "ReviewMode" NOT NULL DEFAULT 'DOUBLE_BLIND',
    "payments_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "track_id" UUID,
    "kind" "DeadlineKind" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "due_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_templates" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "language" "AccountLanguage" NOT NULL DEFAULT 'en',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conference_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ConferenceRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_invitations" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ConferenceRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "invited_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conference_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conferences_slug_key" ON "conferences"("slug");

-- CreateIndex
CREATE INDEX "conferences_status_visibility_idx" ON "conferences"("status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_conference_id_code_key" ON "tracks"("conference_id", "code");

-- CreateIndex
CREATE INDEX "deadlines_conference_id_due_at_idx" ON "deadlines"("conference_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "conference_templates_conference_id_kind_language_key" ON "conference_templates"("conference_id", "kind", "language");

-- CreateIndex
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_conference_id_user_id_key" ON "memberships"("conference_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conference_invitations_token_hash_key" ON "conference_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "conference_invitations_conference_id_email_idx" ON "conference_invitations"("conference_id", "email");

-- AddForeignKey
ALTER TABLE "conferences" ADD CONSTRAINT "conferences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_templates" ADD CONSTRAINT "conference_templates_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_invitations" ADD CONSTRAINT "conference_invitations_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_invitations" ADD CONSTRAINT "conference_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
