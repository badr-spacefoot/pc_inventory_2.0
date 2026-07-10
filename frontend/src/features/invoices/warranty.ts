import { addMonthsToDateOnly } from "../../domain/dates";

export type InvoiceType = "purchase" | "warranty_extension" | "repair" | "accessory" | "other" | string;
export type WarrantyStatus = "unknown" | "expired" | "warning" | "active";

export interface InvoiceRecord {
  id?: string;
  invoice_type?: string;
  invoice_date?: string;
  created_at?: string;
  purchase_price?: number | string | null;
  supplier?: string;
  warranty_provider?: string;
  warranty_start_date?: string;
  warranty_end_date?: string;
  warranty_duration_months?: number | string | null;
  is_estimated_warranty?: boolean;
  [key: string]: unknown;
}

export interface WarrantyStatusSnapshot {
  status: WarrantyStatus;
  daysLeft: number | null;
  progress: number;
  isEstimated: boolean;
}

const DAY_MS = 86_400_000;

export function invoiceTypeValue(invoice: InvoiceRecord | null | undefined): InvoiceType {
  return String(invoice?.invoice_type || "purchase").trim() || "purchase";
}

function descendingDate(left: InvoiceRecord, right: InvoiceRecord, selector: (invoice: InvoiceRecord) => unknown) {
  return String(selector(right) || "").localeCompare(String(selector(left) || ""));
}

export function latestWarrantyInvoice(invoices: readonly InvoiceRecord[]): InvoiceRecord | null {
  return (
    invoices
      .filter((invoice) => invoiceTypeValue(invoice) === "warranty_extension")
      .slice()
      .sort((left, right) =>
        descendingDate(
          left,
          right,
          (invoice) => invoice.warranty_end_date || invoice.invoice_date || invoice.created_at,
        ),
      )[0] || null
  );
}

export function latestDatedPurchaseInvoice(invoices: readonly InvoiceRecord[]): InvoiceRecord | null {
  return (
    invoices
      .filter((invoice) => invoiceTypeValue(invoice) === "purchase" && invoice.invoice_date)
      .slice()
      .sort((left, right) => descendingDate(left, right, (invoice) => invoice.invoice_date || invoice.created_at))[0] ||
    null
  );
}

export function latestPurchaseInvoice(invoices: readonly InvoiceRecord[]): InvoiceRecord | null {
  return (
    invoices.find((invoice) => invoiceTypeValue(invoice) === "purchase" && Number(invoice.purchase_price || 0) > 0) ||
    null
  );
}

export function standardWarrantyInvoiceFromPurchase(
  purchaseInvoice: InvoiceRecord | null | undefined,
  providerLabel: string,
): InvoiceRecord | null {
  if (!purchaseInvoice?.invoice_date) return null;
  const warrantyEndDate = addMonthsToDateOnly(purchaseInvoice.invoice_date, 12);
  if (!warrantyEndDate) return null;
  return {
    ...purchaseInvoice,
    id: `standard-warranty-${purchaseInvoice.id || purchaseInvoice.invoice_date}`,
    invoice_type: "warranty_extension",
    supplier: purchaseInvoice.supplier || providerLabel,
    warranty_provider: providerLabel,
    warranty_start_date: purchaseInvoice.invoice_date,
    warranty_end_date: warrantyEndDate,
    warranty_duration_months: 12,
    is_estimated_warranty: true,
  };
}

function localDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

function utcDateOnly(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function warrantyStatusSnapshot(
  invoice: InvoiceRecord | null | undefined,
  now = new Date(),
): WarrantyStatusSnapshot | null {
  if (invoiceTypeValue(invoice) !== "warranty_extension") return null;
  if (!invoice?.warranty_end_date) {
    return { status: "unknown", daysLeft: null, progress: 0, isEstimated: Boolean(invoice?.is_estimated_warranty) };
  }

  const todayUtc = utcDateOnly(now);
  const end = localDate(String(invoice.warranty_end_date));
  const endUtc = utcDateOnly(end);
  const daysLeft = Math.ceil((endUtc - todayUtc) / DAY_MS);
  const startText = String(invoice.warranty_start_date || "");
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startText) ? new Date(`${startText}T00:00:00`) : null;
  const startUtc = start ? utcDateOnly(start) : null;
  const totalDays = startUtc !== null ? Math.max(1, Math.ceil((endUtc - startUtc) / DAY_MS)) : Math.max(365, daysLeft);
  const progress = Math.max(0, Math.min(100, Math.round((Math.max(0, daysLeft) / totalDays) * 100)));
  const isEstimated = Boolean(invoice.is_estimated_warranty);

  if (daysLeft < 0) return { status: "expired", daysLeft, progress: 0, isEstimated };
  if (daysLeft <= 60) return { status: "warning", daysLeft, progress, isEstimated };
  return { status: "active", daysLeft, progress, isEstimated };
}
