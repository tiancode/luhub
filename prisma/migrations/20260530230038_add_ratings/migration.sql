-- CreateTable
CREATE TABLE "Rating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "visitorId" TEXT NOT NULL,
    "videoId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rating_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER NOT NULL,
    "sourceVodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "pic" TEXT,
    "remarks" TEXT,
    "year" INTEGER,
    "area" TEXT,
    "lang" TEXT,
    "actor" TEXT,
    "director" TEXT,
    "content" TEXT,
    "score" REAL,
    "categoryId" INTEGER,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ratingAvg" REAL,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Video_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Video_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("actor", "area", "categoryId", "content", "createdAt", "director", "id", "lang", "name", "pic", "releasedAt", "remarks", "score", "slug", "sourceId", "sourceVodId", "updatedAt", "year") SELECT "actor", "area", "categoryId", "content", "createdAt", "director", "id", "lang", "name", "pic", "releasedAt", "remarks", "score", "slug", "sourceId", "sourceVodId", "updatedAt", "year" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE INDEX "Video_categoryId_idx" ON "Video"("categoryId");
CREATE INDEX "Video_year_idx" ON "Video"("year");
CREATE INDEX "Video_area_idx" ON "Video"("area");
CREATE INDEX "Video_releasedAt_idx" ON "Video"("releasedAt");
CREATE INDEX "Video_ratingAvg_idx" ON "Video"("ratingAvg");
CREATE UNIQUE INDEX "Video_sourceId_sourceVodId_key" ON "Video"("sourceId", "sourceVodId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Rating_videoId_idx" ON "Rating"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_visitorId_videoId_key" ON "Rating"("visitorId", "videoId");
