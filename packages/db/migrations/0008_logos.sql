CREATE TABLE "logo" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logo_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "logo_id" uuid;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_logo_id_logo_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."logo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_logo_id_idx" ON "bill" USING btree ("logo_id");--> statement-breakpoint
-- Added by hand. The app checks these too, but the database is the last word: a logo is a small
-- image of a known type, and its stored bytes never change.
ALTER TABLE "logo" ADD CONSTRAINT "logo_size" CHECK (octet_length("bytes") BETWEEN 1 AND 262144);--> statement-breakpoint
ALTER TABLE "logo" ADD CONSTRAINT "logo_content_type" CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon'));--> statement-breakpoint
CREATE FUNCTION refuse_logo_change() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'A stored logo can''t be changed.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER logo_unchanging BEFORE UPDATE ON "logo"
	FOR EACH ROW EXECUTE FUNCTION refuse_logo_change();
