CREATE TABLE "coffee_adjustments" (
	"kind" text DEFAULT 'manual' NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coffee_adjustments_kind" CHECK ("coffee_adjustments"."kind" in ('manual','initial'))
);
--> statement-breakpoint
CREATE TABLE "coffee_brews" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text NOT NULL,
	"method" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"rating" integer,
	"note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coffee_brews_quantity" CHECK ("coffee_brews"."quantity" > 0),
	CONSTRAINT "coffee_brews_rating" CHECK ("coffee_brews"."rating" between 1 and 10),
	CONSTRAINT "coffee_brews_unit" CHECK ("coffee_brews"."unit" in ('piece','tenth-gram')),
	CONSTRAINT "coffee_brews_method" CHECK ("coffee_brews"."method" in ('espresso','pour-over','aeropress','french-press','cezve','other','drip'))
);
--> statement-breakpoint
CREATE TABLE "coffee_items" (
	"position" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"set_id" text,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"initial_quantity" integer NOT NULL,
	"remaining" integer NOT NULL,
	"roaster" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"processing" text DEFAULT '' NOT NULL,
	"tasting_notes" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"roast_date" text,
	"opened_date" text,
	"best_before" text,
	"drip_weight" integer,
	"repeat" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coffee_items_format" CHECK ("coffee_items"."format" in ('beans','ground','drip')),
	CONSTRAINT "coffee_items_quantity" CHECK ("coffee_items"."initial_quantity" > 0 and "coffee_items"."remaining" >= 0),
	CONSTRAINT "coffee_items_drip_weight" CHECK ("coffee_items"."drip_weight" is null or ("coffee_items"."format" = 'drip' and "coffee_items"."drip_weight" > 0))
);
--> statement-breakpoint
CREATE TABLE "coffee_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coffee_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"roaster" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coffee_adjustments" ADD CONSTRAINT "coffee_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_adjustments" ADD CONSTRAINT "coffee_adjustments_item_id_coffee_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."coffee_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_brews" ADD CONSTRAINT "coffee_brews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_brews" ADD CONSTRAINT "coffee_brews_item_id_coffee_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."coffee_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_items" ADD CONSTRAINT "coffee_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_items" ADD CONSTRAINT "coffee_items_set_id_coffee_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."coffee_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_operations" ADD CONSTRAINT "coffee_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_sets" ADD CONSTRAINT "coffee_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coffee_adjustments_item_idx" ON "coffee_adjustments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "coffee_brews_owner_time_idx" ON "coffee_brews" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "coffee_brews_item_idx" ON "coffee_brews" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "coffee_items_owner_idx" ON "coffee_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coffee_items_set_idx" ON "coffee_items" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coffee_operations_owner_key" ON "coffee_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "coffee_sets_owner_idx" ON "coffee_sets" USING btree ("user_id");