CREATE TABLE "mcp_clients" (
	"client_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mcp_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_email" text NOT NULL,
	"client_id" uuid,
	"tool" text NOT NULL,
	"args" jsonb,
	"result_rows" integer,
	"result_bytes" integer,
	"latency_ms" integer,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mcp_token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_client_id_mcp_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_usage" ADD CONSTRAINT "mcp_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_codes_expires_idx" ON "mcp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_usage_at_idx" ON "mcp_usage" USING btree ("at");--> statement-breakpoint
CREATE INDEX "mcp_usage_user_idx" ON "mcp_usage" USING btree ("user_id","at");