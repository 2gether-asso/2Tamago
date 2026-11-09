CREATE TABLE "wish_asks" (
	"asker_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wish_asks_asker_id_target_id_item_id_pk" PRIMARY KEY("asker_id","target_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"player_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_player_id_item_id_pk" PRIMARY KEY("player_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "offer_coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "request_coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wish_asks" ADD CONSTRAINT "wish_asks_asker_id_players_id_fk" FOREIGN KEY ("asker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_asks" ADD CONSTRAINT "wish_asks_target_id_players_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;