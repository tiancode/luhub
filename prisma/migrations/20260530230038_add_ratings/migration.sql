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

-- AlterTable: 直接加列（SQLite 支持 ADD COLUMN，免整表重建/锁；NOT NULL 列带 DEFAULT 即可）
ALTER TABLE "Video" ADD COLUMN "ratingAvg" REAL;
ALTER TABLE "Video" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Video_createdAt_idx" ON "Video"("createdAt");
CREATE INDEX "Video_ratingAvg_idx" ON "Video"("ratingAvg");
CREATE INDEX "Rating_videoId_idx" ON "Rating"("videoId");
CREATE UNIQUE INDEX "Rating_visitorId_videoId_key" ON "Rating"("visitorId", "videoId");
