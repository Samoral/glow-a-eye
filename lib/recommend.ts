import catalogue from "@/data/products.json";

export type Finding = { type: string; raw: number | null; ui: number };
export type Product = { id: string; brand: string; name: string; purpose: string; keyIngredients: string[]; targets: string[]; price: number | null; buyUrl?: string };

export const LABEL: Record<string, string> = {
  acne: "blemishes", pore: "visible pores", texture: "uneven texture", wrinkle: "fine lines and wrinkles",
  moisture: "low hydration", oiliness: "excess oiliness", redness: "redness", age_spot: "dark spots",
  dark_circle_v2: "dark circles", radiance: "dullness", firmness: "reduced firmness", eye_bag: "eye bags",
};
// Higher YouCam score = healthier. I use raw_score (YouCam says ui_score is inflated for motivation).
export const THRESHOLD = 60;
const score = (f: Finding) => f.raw ?? f.ui;
export const weakConcerns = (fs: Finding[]) => fs.filter(f => LABEL[f.type] && score(f) < THRESHOLD).sort((a, b) => score(a) - score(b));
export const hasPrices = (catalogue as Product[]).some(p => p.price != null);
export const buyUrl = (p: Product) => p.buyUrl || `https://www.amazon.com/s?k=${encodeURIComponent(p.brand + " " + p.name)}`;
export const list = (xs: string[]) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

export function recommend(fs: Finding[], prefs: { allergies: string[]; budget: number | null }) {
  const weak = weakConcerns(fs);
  const ranked = (catalogue as Product[])
    .map(p => {
      const hits = weak.filter(w => p.targets.includes(w.type));
      return { p, hits, pts: hits.reduce((n, w) => n + (THRESHOLD - score(w)), 0) };
    })
    .filter(x => x.pts > 0)
    .filter(x => !prefs.allergies.some(a => x.p.keyIngredients.some(i => i.toLowerCase().includes(a) || a.includes(i.toLowerCase()))))
    .filter(x => prefs.budget == null || x.p.price == null || x.p.price <= prefs.budget)
    .sort((a, b) => b.pts - a.pts);
  return ranked.map(x => ({ product: x.p, reasons: x.hits.map(h => LABEL[h.type]) }));
}
