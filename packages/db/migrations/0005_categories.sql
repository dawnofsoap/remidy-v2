CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_space_id_name_unique" ON "category" USING btree ("space_id",lower("name"));--> statement-breakpoint
-- The starter set every space gets. People can rename or delete these like any other category.
CREATE FUNCTION starter_category_names() RETURNS text[] AS $$
	SELECT ARRAY['Housing', 'Utilities', 'Phone and internet', 'Insurance', 'Loans', 'Subscriptions',
		'Healthcare', 'Transportation', 'Other'];
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
CREATE FUNCTION add_starter_categories() RETURNS trigger AS $$
BEGIN
	INSERT INTO "category" ("space_id", "name")
		SELECT NEW."id", unnest(starter_category_names());
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER space_starter_categories AFTER INSERT ON "space"
	FOR EACH ROW EXECUTE FUNCTION add_starter_categories();
--> statement-breakpoint
INSERT INTO "category" ("space_id", "name")
	SELECT "space"."id", unnest(starter_category_names()) FROM "space";
