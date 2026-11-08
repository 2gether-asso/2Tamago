CREATE TABLE "daycares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"caretaker_id" uuid NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "daycares" ADD CONSTRAINT "daycares_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycares" ADD CONSTRAINT "daycares_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycares" ADD CONSTRAINT "daycares_caretaker_id_players_id_fk" FOREIGN KEY ("caretaker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daycares_one_open_per_pet" ON "daycares" USING btree ("pet_id") WHERE "daycares"."status" <> 'ended';--> statement-breakpoint
CREATE INDEX "daycares_caretaker_idx" ON "daycares" USING btree ("caretaker_id","status");--> statement-breakpoint
CREATE INDEX "daycares_owner_idx" ON "daycares" USING btree ("owner_id","status");