CREATE TABLE "job_status" (
	"name" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
