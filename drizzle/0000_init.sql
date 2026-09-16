CREATE TABLE "access_requests" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "data_imports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"kind" text NOT NULL,
	"rows" integer NOT NULL,
	"inserted" integer NOT NULL,
	"updated" integer NOT NULL,
	"publications" integer NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_campaign_daily" (
	"date" date NOT NULL,
	"campaign" text NOT NULL,
	"source" text NOT NULL,
	"medium" text NOT NULL,
	"sessions" integer NOT NULL,
	"new_users" integer NOT NULL,
	"engaged_sessions" integer NOT NULL,
	CONSTRAINT "ga_campaign_daily_date_campaign_source_medium_pk" PRIMARY KEY("date","campaign","source","medium")
);
--> statement-breakpoint
CREATE TABLE "ga_channel_daily" (
	"date" date NOT NULL,
	"channel_group" text NOT NULL,
	"source" text NOT NULL,
	"medium" text NOT NULL,
	"sessions" integer NOT NULL,
	"active_users" integer NOT NULL,
	"new_users" integer NOT NULL,
	"engaged_sessions" integer NOT NULL,
	CONSTRAINT "ga_channel_daily_date_channel_group_source_medium_pk" PRIMARY KEY("date","channel_group","source","medium")
);
--> statement-breakpoint
CREATE TABLE "ga_event_daily" (
	"date" date NOT NULL,
	"event_name" text NOT NULL,
	"event_count" integer NOT NULL,
	"total_users" integer NOT NULL,
	CONSTRAINT "ga_event_daily_date_event_name_pk" PRIMARY KEY("date","event_name")
);
--> statement-breakpoint
CREATE TABLE "ga_page_daily" (
	"date" date NOT NULL,
	"page_path" text NOT NULL,
	"page_title" text NOT NULL,
	"views" integer NOT NULL,
	"active_users" integer NOT NULL,
	"sessions" integer NOT NULL,
	CONSTRAINT "ga_page_daily_date_page_path_page_title_pk" PRIMARY KEY("date","page_path","page_title")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"user_type" text,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_role_check" CHECK ("invites"."role" in ('viewer', 'editor', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "media_outlets" (
	"domain" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"name" text PRIMARY KEY NOT NULL,
	"authority_type" text NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_settings" (
	"page_key" text PRIMARY KEY NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_publications" (
	"case_number" text NOT NULL,
	"position" integer NOT NULL,
	"published_on" date,
	"url" text,
	"domain" text,
	CONSTRAINT "request_publications_case_number_position_pk" PRIMARY KEY("case_number","position")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"case_number" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"sf_id" varchar(18),
	"name" text,
	"description" text,
	"status" text,
	"organization" text,
	"owner" text,
	"handler" text,
	"journalist" text,
	"media_outlet" text,
	"topic" text,
	"entity_kind" text,
	"projects" text[] DEFAULT '{}'::text[] NOT NULL,
	"submitted_on" date,
	"deadline_on" date,
	"full_response_on" date,
	"extension_30_on" date,
	"extension_60_on" date,
	"third_party_on" date,
	"completeness" text,
	"response_format" text,
	"close_reason" text,
	"reminders_count" integer DEFAULT 0 NOT NULL,
	"legal_warnings_count" integer DEFAULT 0 NOT NULL,
	"petition_planned" boolean,
	"petition_filed_on" date,
	"petition_procedure" text,
	"petition_outcome" text,
	"court_case_number" text,
	"judge" text,
	"law_firm" text,
	"info_received_after_petition" boolean,
	"costs_awarded" integer,
	"costs_received" integer,
	"fee_refunded" boolean,
	"refusal_grounds" text[] DEFAULT '{}'::text[] NOT NULL,
	"refusal_notes" text,
	"sf_url" text,
	"fields" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sf_case" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"case_number" text,
	"record_type_id" varchar(18),
	"status" text,
	"owner_id" varchar(18),
	"created_date" timestamp with time zone,
	"closed_date" timestamp with time zone,
	"system_modstamp" timestamp with time zone NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sf_case_history" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"case_id" varchar(18) NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"data_type" text,
	"created_date" timestamp with time zone NOT NULL,
	"created_by_id" varchar(18),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sf_field_labels" (
	"sobject" text NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_field_labels_sobject_name_pk" PRIMARY KEY("sobject","name")
);
--> statement-breakpoint
CREATE TABLE "sf_record_type" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"sobject_type" text NOT NULL,
	"developer_name" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean NOT NULL,
	"system_modstamp" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sf_schema_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"report" jsonb NOT NULL,
	"markdown" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sf_user" (
	"id" varchar(18) PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"is_active" boolean NOT NULL,
	"system_modstamp" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_text_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"body" text NOT NULL,
	"saved_by" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_texts" (
	"key" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smoov_campaign_stats" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone,
	"sent" integer,
	"opens" integer,
	"clicks" integer,
	"bounces" integer,
	"unsubscribes" integer,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smoov_campaigns" (
	"id" integer PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"utm_campaign" text,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smoov_lists" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"contacts_count" integer,
	"data" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"picked_at" timestamp with time zone,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"object" text NOT NULL,
	"mode" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"upserted" integer,
	"deleted" integer,
	"api_usage" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"object" text PRIMARY KEY NOT NULL,
	"cursor" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"row_count" integer
);
--> statement-breakpoint
CREATE TABLE "user_types" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"pages" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"sub" text,
	"name" text,
	"picture" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"user_type" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_sub_unique" UNIQUE("sub"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('viewer', 'editor', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_type_user_types_key_fk" FOREIGN KEY ("user_type") REFERENCES "public"."user_types"("key") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "request_publications" ADD CONSTRAINT "request_publications_case_number_requests_case_number_fk" FOREIGN KEY ("case_number") REFERENCES "public"."requests"("case_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_user_type_user_types_key_fk" FOREIGN KEY ("user_type") REFERENCES "public"."user_types"("key") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_at_idx" ON "audit_log" USING btree ("actor","at");--> statement-breakpoint
CREATE INDEX "ga_campaign_daily_campaign_idx" ON "ga_campaign_daily" USING btree ("campaign","date");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_open_email_idx" ON "invites" USING btree ("email") WHERE accepted_at is null and revoked_at is null;--> statement-breakpoint
CREATE INDEX "request_publications_on_idx" ON "request_publications" USING btree ("published_on");--> statement-breakpoint
CREATE INDEX "requests_submitted_idx" ON "requests" USING btree ("submitted_on");--> statement-breakpoint
CREATE INDEX "requests_org_idx" ON "requests" USING btree ("organization");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sf_case_case_number_idx" ON "sf_case" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "sf_case_modstamp_idx" ON "sf_case" USING btree ("system_modstamp");--> statement-breakpoint
CREATE INDEX "sf_case_history_case_field_idx" ON "sf_case_history" USING btree ("case_id","field","created_date");--> statement-breakpoint
CREATE INDEX "site_text_versions_key_idx" ON "site_text_versions" USING btree ("key","id");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");