CREATE TABLE "daily_missions" (
	"player_id" uuid NOT NULL,
	"day" text NOT NULL,
	"missions" jsonb NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_missions_player_id_day_pk" PRIMARY KEY("player_id","day")
);
--> statement-breakpoint
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;