/**
 * Moodboard engine: anchor selection, cache key and analysis sanitizing.
 *   npm test -w packages/moodboard-engine
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeStyleProfile, type Product } from "@3dvista-assistant/catalog-engine";
import { moodboardKey, pickStyleAnchors, sanitizeAnalysis, type MoodboardProduct } from "../src/index.js";

function product(id: string, over: Partial<MoodboardProduct> = {}): MoodboardProduct {
  return {
    product_id: id,
    name: `Piece ${id}`,
    category: "divani",
    style: ["Contemporaneo"],
    colors: [],
    materials: [],
    finish: [],
    image_url: `assets/t/${id}.jpg`,
    ...over,
  };
}

test("only products carrying the dominant style qualify", () => {
  const catalog = [product("A", { style: ["Minimal"] }), product("B"), product("C", { style: ["Classico elegante"] })];
  const anchors = pickStyleAnchors(["A", "B", "C"], catalog, "Contemporaneo");
  assert.deepEqual(anchors.map((p) => p.product_id), ["B"]);
});

test("primary style tag outranks a secondary one", () => {
  const catalog = [
    product("SECONDARY", { style: ["Classico elegante", "Contemporaneo"], category: "tavoli" }),
    product("PRIMARY", { style: ["Contemporaneo", "Classico elegante"], category: "tavoli" }),
  ];
  const [first] = pickStyleAnchors(["PRIMARY", "SECONDARY"], catalog, "Contemporaneo");
  assert.equal(first.product_id, "PRIMARY");
});

test("ties go to the most recently saved product", () => {
  const catalog = [product("OLD"), product("NEW", { category: "tavoli" })];
  const [first] = pickStyleAnchors(["OLD", "NEW"], catalog, "Contemporaneo", 1);
  assert.equal(first.product_id, "NEW");
});

test("never two anchors with the same name or the same photo", () => {
  const catalog = [
    product("A", { name: "Divano Camden" }),
    product("B", { name: "Divano Camden", image_url: "assets/t/other.jpg" }),
    product("C", { name: "Boiserie", image_url: "assets/t/boiserie.jpg", category: "boiserie" }),
    product("D", { name: "Boiserie camino", image_url: "assets/t/boiserie.jpg", category: "boiserie" }),
  ];
  const anchors = pickStyleAnchors(["A", "B", "C", "D"], catalog, "Contemporaneo");
  assert.equal(anchors.length, 2);
  assert.notEqual(anchors[0].name, anchors[1].name);
  assert.notEqual(anchors[0].image_url, anchors[1].image_url);
});

test("the second anchor prefers a different category", () => {
  const catalog = [product("SOFA1"), product("SOFA2"), product("TABLE", { category: "tavoli" })];
  const anchors = pickStyleAnchors(["TABLE", "SOFA1", "SOFA2"], catalog, "Contemporaneo");
  assert.deepEqual(new Set(anchors.map((p) => p.category)), new Set(["divani", "tavoli"]));
});

test("a photographed piece beats a stronger photo-less one", () => {
  const catalog = [
    product("LOGO", { has_photo: false, colors: ["rosso"], materials: ["legno"], finish: ["X"] }),
    product("PHOTO", { style: ["Classico elegante", "Contemporaneo"], category: "tavoli" }),
  ];
  const anchors = pickStyleAnchors(["LOGO", "PHOTO"], catalog, "Contemporaneo");
  assert.deepEqual(anchors.map((p) => p.product_id), ["PHOTO", "LOGO"]);
});

test("two photo-less pieces sharing the stand-in image are still two pieces", () => {
  const stand = "assets/t/placeholder-product.png";
  const catalog = [
    product("A", { has_photo: false, image_url: stand }),
    product("B", { has_photo: false, image_url: stand, category: "tavoli" }),
  ];
  assert.equal(pickStyleAnchors(["A", "B"], catalog, "Contemporaneo").length, 2);
});

test("unknown or duplicated saved ids are ignored", () => {
  const catalog = [product("A")];
  assert.deepEqual(pickStyleAnchors(["GONE", "A", "A"], catalog, "Contemporaneo").map((p) => p.product_id), ["A"]);
});

test("key is order-independent and follows the anchors' catalog data", () => {
  const a = product("A");
  const b = product("B", { category: "tavoli" });
  const base = { tourId: "t", locale: "it" as const, style: "Contemporaneo" };
  assert.equal(moodboardKey({ ...base, anchors: [a, b] }), moodboardKey({ ...base, anchors: [b, a] }));
  assert.notEqual(
    moodboardKey({ ...base, anchors: [a, b] }),
    moodboardKey({ ...base, anchors: [{ ...a, colors: ["verde"] }, b] })
  );
  assert.notEqual(moodboardKey({ ...base, anchors: [a] }), moodboardKey({ ...base, style: "Minimal", anchors: [a] }));
  assert.match(moodboardKey({ ...base, anchors: [a] }), /^[a-f0-9]{32}$/);
});

test("sanitizeAnalysis enforces the template limits", () => {
  const clean = sanitizeAnalysis({
    motto: ['"Linee pulite, luce morbida."', "Il tuo spazio.", "extra"],
    description: " Toni caldi e legni chiari. ",
    palette: [
      { hex: "c8955a", name: "Noce", role: "dominant", weight: 40.4 },
      { hex: "#C8955A", name: "Dup", role: "secondary", weight: 10 },
      { hex: "#fff", name: "Bianco", role: "weird", weight: 150 },
      { hex: "not-a-color", name: "Bad", role: "accent", weight: 5 },
      { hex: "#1A1A1A", name: "Nero", role: "accent", weight: 5 },
      { hex: "#1E1C1F", name: "Quasi nero", role: "accent", weight: 5 },
    ],
    materials: [
      { name: "Lino", description: "trama fine", difficulty: "simple", texturePrompt: "linen" },
      { name: "", description: "", difficulty: "simple", texturePrompt: "x" },
      { name: "Marmo", description: "venato", difficulty: "hard", texturePrompt: "marble" },
    ],
  });
  assert.deepEqual(clean.motto, ["Linee pulite, luce morbida.", "Il tuo spazio."]);
  assert.equal(clean.description, "Toni caldi e legni chiari.");
  assert.deepEqual(clean.palette.map((c) => c.hex), ["#C8955A", "#FFFFFF", "#1A1A1A"]);
  assert.equal(clean.palette[1].role, "secondary");
  assert.equal(clean.palette[1].weight, 100);
  assert.deepEqual(clean.materials.map((m) => [m.name, m.difficulty]), [["Lino", "simple"], ["Marmo", "simple"]]);
});

test("sanitizeAnalysis rejects an analysis too thin to fill the board", () => {
  assert.throws(() => sanitizeAnalysis({ motto: ["x"], description: "y", palette: [], materials: [] }));
});

// Real catalog: the moodboard must be buildable from the very style the
// wishlist panel shows ("Il tuo stile: ..."), for every style in use.
test("febal-casa: every dominant style yields anchors that carry it", () => {
  const ROOT = path.resolve(import.meta.dirname, "../../..");
  const catalog = (JSON.parse(readFileSync(path.join(ROOT, "clients/febal-casa/catalog.json"), "utf8")) as Product[]).filter(
    (p) => p.active
  );
  const styles = [...new Set(catalog.flatMap((p) => p.style))];
  assert.ok(styles.length > 0);
  for (const style of styles) {
    const saved = catalog.filter((p) => p.style.includes(style)).map((p) => p.product_id);
    const { dominantStyle } = computeStyleProfile(saved, catalog);
    assert.ok(dominantStyle, `no dominant style for ${style}`);
    const anchors = pickStyleAnchors(saved, catalog, dominantStyle);
    assert.ok(anchors.length >= 1 && anchors.length <= 2, `${style}: ${anchors.length} anchors`);
    for (const a of anchors) assert.ok(a.style.includes(dominantStyle), `${a.product_id} lacks ${dominantStyle}`);
    assert.deepEqual(pickStyleAnchors(saved, catalog, dominantStyle), anchors, "selection must be deterministic");
  }
});
