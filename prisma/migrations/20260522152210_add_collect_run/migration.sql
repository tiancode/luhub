-- CreateTable
CREATE TABLE "CollectRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pages" INTEGER,
    "hours" INTEGER,
    "full" BOOLEAN NOT NULL DEFAULT false,
    "videos" INTEGER NOT NULL DEFAULT 0,
    "categories" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "CollectRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CollectRun_sourceId_startedAt_idx" ON "CollectRun"("sourceId", "startedAt");
