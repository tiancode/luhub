-- CreateTable
CREATE TABLE "Source" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'maccms_json',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'other',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CategoryMap" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER NOT NULL,
    "remoteTypeId" INTEGER NOT NULL,
    "remoteName" TEXT,
    "categoryId" INTEGER NOT NULL,
    CONSTRAINT "CategoryMap_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Video" (
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
    CONSTRAINT "Video_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Video_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaySource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "videoId" INTEGER NOT NULL,
    "fromName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PlaySource_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playSourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Episode_playSourceId_fkey" FOREIGN KEY ("playSourceId") REFERENCES "PlaySource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMap_sourceId_remoteTypeId_key" ON "CategoryMap"("sourceId", "remoteTypeId");

-- CreateIndex
CREATE INDEX "Video_categoryId_idx" ON "Video"("categoryId");

-- CreateIndex
CREATE INDEX "Video_year_idx" ON "Video"("year");

-- CreateIndex
CREATE INDEX "Video_area_idx" ON "Video"("area");

-- CreateIndex
CREATE INDEX "Video_releasedAt_idx" ON "Video"("releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Video_sourceId_sourceVodId_key" ON "Video"("sourceId", "sourceVodId");

-- CreateIndex
CREATE INDEX "PlaySource_videoId_idx" ON "PlaySource"("videoId");

-- CreateIndex
CREATE INDEX "Episode_playSourceId_idx" ON "Episode"("playSourceId");
