ALTER TABLE "papers" ADD COLUMN "doi" TEXT;

CREATE UNIQUE INDEX "papers_doi_key" ON "papers"("doi");
