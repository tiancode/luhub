-- CreateTable
CREATE TABLE "CachedEpisode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "videoId" INTEGER NOT NULL,
    "lineName" TEXT NOT NULL,
    "epName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "format" TEXT,
    "localUrl" TEXT,
    "relPath" TEXT,
    "bytes" INTEGER,
    "error" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CachedEpisode_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CachedEpisode_videoId_status_idx" ON "CachedEpisode"("videoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CachedEpisode_videoId_lineName_epName_key" ON "CachedEpisode"("videoId", "lineName", "epName");
