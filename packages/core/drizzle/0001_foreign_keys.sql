-- Foreign key fisik ditambahkan terpisah agar skema per-modul tidak
-- saling mengimpor (aturan isolasi modul di PRD §6.2).
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_zone_fk" FOREIGN KEY ("zone_id") REFERENCES "service_zones"("id") ON DELETE SET NULL;
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE;
ALTER TABLE "menu_schedule" ADD CONSTRAINT "menu_schedule_item_fk" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_window_fk" FOREIGN KEY ("delivery_window_id") REFERENCES "delivery_windows"("id") ON DELETE SET NULL;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_fk" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id");
ALTER TABLE "order_notes_internal" ADD CONSTRAINT "order_notes_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
ALTER TABLE "order_notes_internal" ADD CONSTRAINT "order_notes_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_window_fk" FOREIGN KEY ("window_id") REFERENCES "delivery_windows"("id") ON DELETE SET NULL;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_courier_fk" FOREIGN KEY ("courier_id") REFERENCES "staff_users"("id") ON DELETE SET NULL;
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "staff_users"("id") ON DELETE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_fk" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;
