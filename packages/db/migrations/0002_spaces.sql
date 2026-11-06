CREATE TYPE "public"."space_kind" AS ENUM('personal', 'shared');--> statement-breakpoint
CREATE TYPE "public"."space_role" AS ENUM('member', 'manager', 'owner');--> statement-breakpoint
CREATE TABLE "membership" (
	"user_id" text NOT NULL,
	"space_id" uuid NOT NULL,
	"role" "space_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_user_id_space_id_pk" PRIMARY KEY("user_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "space" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"kind" "space_kind" NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;