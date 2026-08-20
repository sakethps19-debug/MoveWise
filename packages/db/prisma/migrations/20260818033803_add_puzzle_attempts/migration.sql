-- AlterTable
ALTER TABLE "ExerciseAttempt" ADD COLUMN     "puzzleId" TEXT,
ALTER COLUMN "lessonId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_puzzleId_idx" ON "ExerciseAttempt"("userId", "puzzleId");
