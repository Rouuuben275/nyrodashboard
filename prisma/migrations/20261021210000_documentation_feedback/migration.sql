CREATE TABLE "DocumentationFeedback" (
  "id" TEXT NOT NULL,
  "article" TEXT NOT NULL,
  "voterHash" TEXT NOT NULL,
  "helpful" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentationFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentationFeedback_article_voterHash_key" ON "DocumentationFeedback"("article", "voterHash");
CREATE INDEX "DocumentationFeedback_article_helpful_idx" ON "DocumentationFeedback"("article", "helpful");
