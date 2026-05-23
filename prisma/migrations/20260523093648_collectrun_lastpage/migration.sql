-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CollectRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pages" INTEGER,
    "hours" INTEGER,
    "full" BOOLEAN NOT NULL DEFAULT false,
    "videos" INTEGER NOT NULL DEFAULT 0,
    "categories" INTEGER NOT NULL DEFAULT 0,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "CollectRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CollectRun" ("categories", "finishedAt", "full", "hours", "id", "message", "pages", "sourceId", "startedAt", "status", "videos") SELECT "categories", "finishedAt", "full", "hours", "id", "message", "pages", "sourceId", "startedAt", "status", "videos" FROM "CollectRun";
DROP TABLE "CollectRun";
ALTER TABLE "new_CollectRun" RENAME TO "CollectRun";
CREATE INDEX "CollectRun_sourceId_startedAt_idx" ON "CollectRun"("sourceId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
