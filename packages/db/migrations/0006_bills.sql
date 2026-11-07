CREATE TABLE "bill" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"expected_cents" bigint,
	"is_variable" boolean DEFAULT false NOT NULL,
	"schedule" jsonb NOT NULL,
	"category_id" uuid,
	"autopay" boolean DEFAULT false NOT NULL,
	"url" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"bill_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"bill_name" text NOT NULL,
	"category_id" uuid,
	"expected_cents" bigint,
	"is_variable" boolean NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_occurrence" ADD CONSTRAINT "bill_occurrence_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_occurrence" ADD CONSTRAINT "bill_occurrence_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_occurrence" ADD CONSTRAINT "bill_occurrence_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_space_id_idx" ON "bill" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_occurrence_bill_id_due_on_unique" ON "bill_occurrence" USING btree ("bill_id","due_on");--> statement-breakpoint
CREATE INDEX "bill_occurrence_space_id_due_on_idx" ON "bill_occurrence" USING btree ("space_id","due_on");--> statement-breakpoint
ALTER TABLE "bill_occurrence" ADD CONSTRAINT "bill_occurrence_state_check" CHECK ("state" IN ('open', 'settled', 'skipped'));
--> statement-breakpoint
-- A bill's category must be in the bill's own space, or in a household its owner belongs to.
CREATE FUNCTION check_bill_category() RETURNS trigger AS $$
BEGIN
	IF NEW."category_id" IS NULL THEN
		RETURN NEW;
	END IF;
	IF EXISTS (
		SELECT 1 FROM "category" c
		WHERE c."id" = NEW."category_id"
			AND (
				c."space_id" = NEW."space_id"
				OR c."space_id" IN (
					SELECT household."space_id"
					FROM "membership" owner
					JOIN "membership" household ON household."user_id" = owner."user_id"
					JOIN "space" s ON s."id" = household."space_id"
					WHERE owner."space_id" = NEW."space_id" AND s."kind" = 'shared'
				)
			)
	) THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'That category belongs to another space.' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER bill_category_in_reach BEFORE INSERT OR UPDATE OF "category_id", "space_id" ON "bill"
	FOR EACH ROW EXECUTE FUNCTION check_bill_category();
