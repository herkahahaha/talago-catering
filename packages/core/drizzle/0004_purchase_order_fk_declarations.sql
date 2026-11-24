-- Kedua FK sudah dibuat di 0001_foreign_keys.sql. Migrasi ini hanya menyamakan
-- snapshot Drizzle dengan deklarasi di quotations/schema.ts. DROP ... IF EXISTS
-- membuatnya idempoten, baik di database yang sudah punya FK maupun yang baru.
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_quotation_fk";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_order_fk";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
