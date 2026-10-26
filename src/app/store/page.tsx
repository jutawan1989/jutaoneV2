import { headers } from "next/headers";
import { MerchantDashboard } from "@/components/merchant-dashboard";
import { getMerchantOrders } from "@/lib/store";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Kedai saya — JutaOne.Biz",
  robots: { index: false, follow: false },
};

/**
 * Merchant dashboard.
 *
 * The merchant identity is the same pseudonymous hash used elsewhere, derived
 * from request headers. No login is required and no PII is stored, which is
 * also the limitation: the dashboard is only reachable from the same browser
 * and network that created it.
 */
export default async function StoreDashboard() {
  const requestHeaders = await headers();
  const owner = identifyVisitor(requestHeaders).visitorKey;
  const orders = await getMerchantOrders(owner);

  return (
    <MerchantDashboard
      initialOrders={orders.map((order) => ({
        invoiceNumber: order.invoice_number,
        customerName: order.customer_name,
        total: order.total_minor / 100,
        currency: order.currency,
        status: order.status,
        createdAt: order.created_at,
      }))}
    />
  );
}
