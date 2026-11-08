CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"walk_a" uuid NOT NULL,
	"walk_b" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encounters_walk_a_walk_b_pk" PRIMARY KEY("walk_a","walk_b")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"player_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_player_id_item_id_pk" PRIMARY KEY("player_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"coins" integer DEFAULT 50 NOT NULL,
	"last_daily_bonus_day" text,
	"reward_day" text,
	"reward_coins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "walks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_walk_a_walks_id_fk" FOREIGN KEY ("walk_a") REFERENCES "public"."walks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_walk_b_walks_id_fk" FOREIGN KEY ("walk_b") REFERENCES "public"."walks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_actor_id_players_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_player_idx" ON "activity" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "encounters_walk_b_idx" ON "encounters" USING btree ("walk_b");--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_one_caress_per_day" ON "interactions" USING btree ("actor_id","pet_id","day") WHERE "interactions"."kind" = 'caress';--> statement-breakpoint
CREATE INDEX "interactions_pet_idx" ON "interactions" USING btree ("pet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pets_one_alive_per_owner" ON "pets" USING btree ("owner_id") WHERE "pets"."status" = 'alive';--> statement-breakpoint
CREATE INDEX "pets_status_updated_idx" ON "pets" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "walks_time_idx" ON "walks" USING btree ("started_at","ends_at");