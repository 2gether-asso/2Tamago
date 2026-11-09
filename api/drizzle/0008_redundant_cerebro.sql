CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposer_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"offer" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_proposer_id_players_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_target_id_players_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trades_target_idx" ON "trades" USING btree ("target_id","status");--> statement-breakpoint
CREATE INDEX "trades_proposer_idx" ON "trades" USING btree ("proposer_id","status");