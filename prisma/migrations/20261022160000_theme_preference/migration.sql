ALTER TABLE "User" ADD COLUMN "themePreference" TEXT CHECK ("themePreference" IN ('dark', 'light', 'system'));
