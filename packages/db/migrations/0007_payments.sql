CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_by" text,
	"source" text NOT NULL,
	"confirmation" text,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_occurrence_id_bill_occurrence_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."bill_occurrence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_occurrence_id_idx" ON "payment" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "payment_space_id_paid_on_idx" ON "payment" USING btree ("space_id","paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "one_autopay_per_occurrence" ON "payment" USING btree ("occurrence_id") WHERE "payment"."source" = 'autopay' and "payment"."voided_at" is null;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_positive" CHECK ("amount_cents" > 0);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_source_check" CHECK ("source" IN ('manual', 'autopay', 'v1_archive'));
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_void_complete" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL));
--> statement-breakpoint
-- A payment is never deleted, and the only change allowed is voiding it once. Corrections are a
-- void and a new payment, so the history shows what happened.
CREATE FUNCTION refuse_payment_change() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'A payment can''t be deleted. Void it instead.';
	END IF;
	IF OLD."voided_at" IS NOT NULL
		OR NEW."voided_at" IS NULL
		OR (NEW."occurrence_id", NEW."space_id", NEW."paid_on", NEW."amount_cents", NEW."paid_by",
			NEW."source", NEW."confirmation", NEW."notes", NEW."created_at")
			IS DISTINCT FROM
			(OLD."occurrence_id", OLD."space_id", OLD."paid_on", OLD."amount_cents", OLD."paid_by",
			OLD."source", OLD."confirmation", OLD."notes", OLD."created_at")
	THEN
		RAISE EXCEPTION 'A payment can only be voided, once.';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payment_void_only BEFORE UPDATE OR DELETE ON "payment"
	FOR EACH ROW EXECUTE FUNCTION refuse_payment_change();
