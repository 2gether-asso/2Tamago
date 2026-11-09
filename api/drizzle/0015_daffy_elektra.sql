ALTER TABLE "players" ADD COLUMN "name_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "players" SET "name_by_admin" = true WHERE "name_locked";
