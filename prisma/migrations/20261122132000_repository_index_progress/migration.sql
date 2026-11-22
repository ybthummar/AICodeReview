ALTER TABLE "repository"
    ADD COLUMN "indexJobId" TEXT,
    ADD COLUMN "indexStatus" TEXT,
    ADD COLUMN "indexUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "indexFilesDone" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "indexFilesTotal" INTEGER,
    ADD COLUMN "indexRevision" TEXT,
    ADD COLUMN "indexVectorCount" INTEGER;
