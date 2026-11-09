CREATE TABLE "gift_code_redemptions" (
	"code_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_code_redemptions_code_id_player_id_pk" PRIMARY KEY("code_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "gift_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"items" jsonb NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_code_id_gift_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."gift_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_redemptions" ADD CONSTRAINT "gift_code_redemptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_codes" ADD CONSTRAINT "gift_codes_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;