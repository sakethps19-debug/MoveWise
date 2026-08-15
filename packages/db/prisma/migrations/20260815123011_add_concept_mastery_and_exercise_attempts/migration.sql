-- CreateTable
CREATE TABLE "UserConceptMastery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "exerciseConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gameApplicationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "nextRevisionDueAt" TIMESTAMP(3),

    CONSTRAINT "UserConceptMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "conceptIds" TEXT[],
    "correct" BOOLEAN NOT NULL,
    "wrongAnswerKey" TEXT,
    "hintLevelUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserConceptMastery_userId_idx" ON "UserConceptMastery"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserConceptMastery_userId_conceptId_key" ON "UserConceptMastery"("userId", "conceptId");

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_lessonId_idx" ON "ExerciseAttempt"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "ExerciseAttempt_userId_createdAt_idx" ON "ExerciseAttempt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserConceptMastery" ADD CONSTRAINT "UserConceptMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
