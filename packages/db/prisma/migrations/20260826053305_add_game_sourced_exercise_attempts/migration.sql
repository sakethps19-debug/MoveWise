-- AlterTable
ALTER TABLE "ExerciseAttempt" ADD COLUMN     "gameId" TEXT;

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_gameId_idx" ON "ExerciseAttempt"("userId", "gameId");
