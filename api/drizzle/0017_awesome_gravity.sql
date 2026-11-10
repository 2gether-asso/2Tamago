ALTER TABLE "players" ADD COLUMN "discord_name" text;--> statement-breakpoint
UPDATE "players" SET "discord_name" = "display_name" WHERE NOT "name_locked";
