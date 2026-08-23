-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "playerColor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "endReason" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisAllowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAnalysis" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveAnalysis" (
    "id" TEXT NOT NULL,
    "gameAnalysisId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "moveNumber" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "playedMove" TEXT NOT NULL,
    "bestMove" TEXT NOT NULL,
    "evalBefore" DOUBLE PRECISION NOT NULL,
    "evalAfter" DOUBLE PRECISION NOT NULL,
    "evalLoss" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL,
    "conceptIds" TEXT[],
    "explanation" TEXT,

    CONSTRAINT "MoveAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_userId_idx" ON "Game"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameAnalysis_gameId_key" ON "GameAnalysis"("gameId");

-- CreateIndex
CREATE INDEX "MoveAnalysis_gameAnalysisId_idx" ON "MoveAnalysis"("gameAnalysisId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAnalysis" ADD CONSTRAINT "GameAnalysis_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveAnalysis" ADD CONSTRAINT "MoveAnalysis_gameAnalysisId_fkey" FOREIGN KEY ("gameAnalysisId") REFERENCES "GameAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
