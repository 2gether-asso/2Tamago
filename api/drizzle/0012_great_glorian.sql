CREATE TABLE "contest_entries" (
	"week" text NOT NULL,
	"kind" text NOT NULL,
	"player_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "contest_entries_week_kind_player_id_pk" PRIMARY KEY("week","kind","player_id")
);
--> statement-breakpoint
CREATE TABLE "contest_votes" (
	"week" text NOT NULL,
	"voter_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contest_votes_week_voter_id_pk" PRIMARY KEY("week","voter_id")
);
--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_votes" ADD CONSTRAINT "contest_votes_voter_id_players_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_votes" ADD CONSTRAINT "contest_votes_candidate_id_players_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contest_votes_candidate_idx" ON "contest_votes" USING btree ("week","candidate_id");