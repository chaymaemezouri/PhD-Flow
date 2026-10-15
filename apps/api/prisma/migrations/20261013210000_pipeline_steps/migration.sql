ALTER TYPE "PaperFileKind" ADD VALUE 'EDITABLE';

ALTER TABLE "papers" ADD COLUMN "template_validated_at" TIMESTAMP(3);
