CREATE TABLE "favorites" (
	"player_id" uuid NOT NULL,
	"favorite_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_player_id_favorite_id_pk" PRIMARY KEY("player_id","favorite_id")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_favorite_id_players_id_fk" FOREIGN KEY ("favorite_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;