-- CreateTable
CREATE TABLE "Favorite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "visitorId" TEXT NOT NULL,
    "videoId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "visitorId" TEXT NOT NULL,
    "videoId" INTEGER NOT NULL,
    "lineName" TEXT,
    "epName" TEXT,
    "epIndex" INTEGER NOT NULL DEFAULT 0,
    "position" REAL NOT NULL DEFAULT 0,
    "duration" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchHistory_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Favorite_visitorId_createdAt_idx" ON "Favorite"("visitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_visitorId_videoId_key" ON "Favorite"("visitorId", "videoId");

-- CreateIndex
CREATE INDEX "WatchHistory_visitorId_updatedAt_idx" ON "WatchHistory"("visitorId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchHistory_visitorId_videoId_key" ON "WatchHistory"("visitorId", "videoId");
