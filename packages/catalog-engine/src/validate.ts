import { CatalogSchema, type Product } from "./schema.js";
import type { ValidationIssue, ValidationReport } from "./types.js";

const RAW_HTML_PATTERN = /<[^>]+>/;
const JS_PROTOCOL_PATTERN = /javascript:/i;

function checkNoRawMarkup(product: Product, issues: ValidationIssue[]): void {
  const fields: Array<[string, string]> = [
    ["name", product.name],
    ["description", product.description],
  ];
  for (const [field, value] of fields) {
    if (RAW_HTML_PATTERN.test(value) || JS_PROTOCOL_PATTERN.test(value)) {
      issues.push({
        rule: "no-raw-markup",
        product_id: product.product_id,
        message: `Field "${field}" contains raw HTML/JS-like content, which is not allowed from an Excel-sourced catalog.`,
      });
    }
  }
}

/**
 * Validates a catalog against the rules in section 7 of the master context doc:
 * unique product_id, media_name must exist in the tour's known media list,
 * valid yaw/pitch/fov ranges (enforced by the zod schema itself), no raw
 * HTML/JS, and structural shape correctness.
 */
export function validateCatalog(rawRecords: unknown, knownMediaNames: string[]): ValidationReport {
  const issues: ValidationIssue[] = [];

  const parsed = CatalogSchema.safeParse(rawRecords);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        rule: "schema",
        message: `${err.path.join(".")}: ${err.message}`,
      });
    }
    return { ok: false, issues };
  }

  const products = parsed.data;
  const seenIds = new Set<string>();
  const mediaSet = new Set(knownMediaNames);

  for (const product of products) {
    if (seenIds.has(product.product_id)) {
      issues.push({
        rule: "unique-product-id",
        product_id: product.product_id,
        message: `Duplicate product_id "${product.product_id}".`,
      });
    }
    seenIds.add(product.product_id);

    if (!mediaSet.has(product.media_name)) {
      issues.push({
        rule: "known-media-name",
        product_id: product.product_id,
        message: `media_name "${product.media_name}" is not in the tour's known media list: [${knownMediaNames.join(", ")}].`,
      });
    }

    checkNoRawMarkup(product, issues);
  }

  return { ok: issues.length === 0, issues };
}
