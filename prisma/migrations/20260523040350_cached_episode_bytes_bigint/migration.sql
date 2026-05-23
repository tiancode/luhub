/*
  Warnings:

  - You are about to alter the column `bytes` on the `CachedEpisode` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CachedEpisode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "videoId" INTEGER NOT NULL,
    "lineName" TEXT NOT NULL,
    "epName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "format" TEXT,
    "localUrl" TEXT,
    "relPath" TEXT,
    "bytes" BIGINT,
    "error" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CachedEpisode_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CachedEpisode" ("bytes", "createdAt", "epName", "error", "format", "id", "lineName", "localUrl", "relPath", "sortOrder", "sourceUrl", "status", "updatedAt", "videoId") SELECT "bytes", "createdAt", "epName", "error", "format", "id", "lineName", "localUrl", "relPath", "sortOrder", "sourceUrl", "status", "updatedAt", "videoId" FROM "CachedEpisode";
DROP TABLE "CachedEpisode";
ALTER TABLE "new_CachedEpisode" RENAME TO "CachedEpisode";
CREATE INDEX "CachedEpisode_videoId_status_idx" ON "CachedEpisode"("videoId", "status");
CREATE UNIQUE INDEX "CachedEpisode_videoId_lineName_epName_key" ON "CachedEpisode"("videoId", "lineName", "epName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
