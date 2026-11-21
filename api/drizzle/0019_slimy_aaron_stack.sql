CREATE TABLE "pet_flowers" (
	"pet_id" uuid NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_flowers_pet_id_day_pk" PRIMARY KEY("pet_id","day")
);
--> statement-breakpoint
ALTER TABLE "pet_flowers" ADD CONSTRAINT "pet_flowers_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;