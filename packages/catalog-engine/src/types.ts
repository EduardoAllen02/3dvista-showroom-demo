import type { Product } from "./schema.js";

export interface NavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
}

export interface SearchFilters {
  category?: string;
  color?: string;
  material?: string;
  section?: string;
}

export interface SearchCandidate {
  product: Product;
  score: number;
}

export interface ValidationIssue {
  rule: string;
  product_id?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

export function toNavTarget(product: Product): NavTarget {
  return {
    media_name: product.media_name,
    yaw: product.yaw,
    pitch: product.pitch,
    fov: product.fov,
  };
}
