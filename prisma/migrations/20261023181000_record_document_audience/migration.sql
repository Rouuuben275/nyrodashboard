-- Extend the original audience guard without changing any stored document.
ALTER TABLE "Document" DROP CONSTRAINT "Document_audience_check";
ALTER TABLE "Document" ADD CONSTRAINT "Document_audience_check" CHECK (("targetType" IS NULL AND "audience" IN ('TEAM','MANAGERS')) OR ("targetType" IS NOT NULL AND "audience" = 'RECORD'));
