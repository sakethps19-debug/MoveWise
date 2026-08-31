-- AlterTable
ALTER TABLE "UserConceptMastery" ADD COLUMN     "evidenceConfidence" DOUBLE PRECISION,
ADD COLUMN     "evidenceLevel" TEXT,
ADD COLUMN     "evidenceSource" TEXT,
ADD COLUMN     "evidenceUpdatedAt" TIMESTAMP(3);
