CREATE TABLE "community_claims" (
	"week" text NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_claims_week_player_id_pk" PRIMARY KEY("week","player_id")
);
--> statement-breakpoint
CREATE TABLE "community_goals" (
	"week" text PRIMARY KEY NOT NULL,
	"target" integer NOT NULL,
	"reached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_claims" ADD CONSTRAINT "community_claims_week_community_goals_week_fk" FOREIGN KEY ("week") REFERENCES "public"."community_goals"("week") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_claims" ADD CONSTRAINT "community_claims_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;