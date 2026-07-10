import { describe, expect, it } from "vitest";

import {
  latestDatedPurchaseInvoice,
  latestWarrantyInvoice,
  standardWarrantyInvoiceFromPurchase,
  warrantyStatusSnapshot,
} from "../../frontend/src/features/invoices/warranty";

describe("invoice warranty rules", () => {
  it("selects the latest warranty by end date", () => {
    const older = { id: "old", invoice_type: "warranty_extension", warranty_end_date: "2026-01-01" };
    const newer = { id: "new", invoice_type: "warranty_extension", warranty_end_date: "2027-01-01" };

    expect(latestWarrantyInvoice([older, newer])).toEqual(newer);
  });

  it("derives the one-year manufacturer warranty from the latest dated purchase", () => {
    const first = { id: "first", invoice_type: "purchase", invoice_date: "2025-02-28" };
    const latest = { id: "latest", invoice_type: "purchase", invoice_date: "2026-07-10" };

    const purchase = latestDatedPurchaseInvoice([first, latest]);
    const warranty = standardWarrantyInvoiceFromPurchase(purchase, "Standard warranty");

    expect(warranty).toMatchObject({
      id: "standard-warranty-latest",
      warranty_start_date: "2026-07-10",
      warranty_end_date: "2027-07-10",
      warranty_duration_months: 12,
      is_estimated_warranty: true,
    });
  });

  it("reports remaining progress, warning and expired states deterministically", () => {
    const invoice = {
      invoice_type: "warranty_extension",
      warranty_start_date: "2026-01-01",
      warranty_end_date: "2027-01-01",
    };

    expect(warrantyStatusSnapshot(invoice, new Date("2026-07-01T12:00:00"))).toMatchObject({
      status: "active",
      daysLeft: 184,
      progress: 50,
    });
    expect(warrantyStatusSnapshot(invoice, new Date("2026-12-15T12:00:00"))?.status).toBe("warning");
    expect(warrantyStatusSnapshot(invoice, new Date("2027-01-02T12:00:00"))).toMatchObject({
      status: "expired",
      daysLeft: -1,
      progress: 0,
    });
  });
});
