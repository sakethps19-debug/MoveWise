-- CreateTable
CREATE TABLE "LessonCheckpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "lessonVersion" INTEGER NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "attempts" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonCheckpoint_userId_lessonId_key" ON "LessonCheckpoint"("userId", "lessonId");

-- AddForeignKey
ALTER TABLE "LessonCheckpoint" ADD CONSTRAINT "LessonCheckpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
