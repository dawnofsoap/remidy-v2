CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_id" text,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_space_id_id_idx" ON "activity_log" USING btree ("space_id","id");--> statement-breakpoint
CREATE FUNCTION refuse_activity_log_change() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'The activity log can''t be changed.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER activity_log_append_only BEFORE UPDATE OR DELETE ON "activity_log"
	FOR EACH ROW EXECUTE FUNCTION refuse_activity_log_change();
