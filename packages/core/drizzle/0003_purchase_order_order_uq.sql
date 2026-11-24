DROP INDEX "purchase_orders_order_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_order_uq" ON "purchase_orders" USING btree ("order_id");