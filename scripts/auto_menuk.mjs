// Automata menü-behúzó — a GitHub Action futtatja (ütemezve + az app gombjáról).
// Forrás-adapterek: Szalai (determinisztikus heti PDF -> Gemini PDF-olvasás),
// Vital + Soup4You (Wolt nem-hivatalos JSON -> Gemini normalizálás).
// Csak a saját éttermeit írja felül a menuk.json-ban; a kézzel feltöltötteket békén hagyja.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("HIÁNYZIK a GEMINI_API_KEY repo-secret — állítsd be: Settings → Secrets and variables → Actions.");
  process.exit(1);
}
const MODEL = "gemini-3.1-flash";   // ha "not found": gemini-3.1-flash-lite vagy gemini-3.5-flash
const FILE = "menuk.json";
// teszthez: WEEK_OFFSET=-1 -> egy héttel korábbi Szalai-PDF (pl. amikor tárgyhéten zárva)
const WEEK_OFFSET = parseInt(process.env.WEEK_OFFSET || "0", 10) || 0;

// Melyik étterem megy automatán? Töröld a sorát, ha inkább kézzel (képpel) akarod.
const AUTO = ["szalai", "vital", "soup4you"];

const WOLT_SLUG = { vital: "vital-cafe-bistro", soup4you: "soup4you-levesbr" };
const META = {
  szalai: {
    name: "Szalai Vendéglő",
    url: "https://www.szalaivendeglo.hu/index.php/hu/heti-menue",
    hint: "Heti tábla, naponta több variáns (A/B/C/D), mindegyik egy leves + egy főétel + ár. A variánst jelöld a 'variar' mezőben. Vasárnap zárva."
  },
  vital: {
    name: "Vital Café & Bistro",
    url: "https://www.vitalcafebistro.hu/hetimenu.html",
    hint: "Vega hely: 'vegán'/'gluténmentes' címke, ahol jelölt. A Wolt-lista a MAI kínálat — EGYETLEN napot adj vissza (a mai dátummal és hétköznappal). Az árak Wolt-árak. Ha egy ár irreálisan nagy (pl. 389000), 100-zal szorzott — normalizáld ezres nagyságrendű forintra."
  },
  soup4you: {
    name: "Soup4You",
    url: "https://www.facebook.com/soup4yougyor",
    hint: "Csak a levesek és a menük (választott leves + főétel) érdekesek, a különálló à la carte főételek NEM. A Wolt-lista a MAI kínálat — EGYETLEN napot adj vissza (a mai dátummal és hétköznappal). Az árak Wolt-árak. Ha egy ár irreálisan nagy (pl. 389000), 100-zal szorzott — normalizáld ezres nagyságrendű forintra."
  }
};

const SYSTEM = `Te egy éttermi menüt strukturáló motor vagy. A bemenet egy magyar étterem napi vagy heti menüje (szöveg, JSON vagy PDF). Kinyered a menüt és KIZÁRÓLAG egyetlen JSON objektumot adsz vissza — semmi bevezető, semmi magyarázat, semmi Markdown-kerítés.

Séma:
{"etterem":string,"idoszak":{"tol":"ÉÉÉÉ-HH-NN"|null,"ig":"ÉÉÉÉ-HH-NN"|null},"arak":{"leves":number|null,"foetel":number|null,"menu":number|null,"csomagolas":number|null},"napok":[{"nap":"hétfő"|"kedd"|"szerda"|"csütörtök"|"péntek"|"szombat"|"vasárnap"|null,"datum":"ÉÉÉÉ-HH-NN"|null,"zarva":boolean,"tetelek":[{"nev":string,"kategoria":"leves"|"főétel"|"menü"|"saláta"|"köret"|"desszert"|"egyéb","variar":"A"|"B"|"C"|"D"|null,"ar":number|null,"cimkek":string[]}]}]}

Szabályok:
- ÁRAK: ha kategóriánként közösek, az 'arak' mezőbe; ha tételenként vannak, a tételek 'ar' mezőjébe.
- Az 'ar' csak szám legyen forintban (1990, nem "1990 Ft").
- A 'cimkek' csak ténylegesen jelölt diétás jelölés lehet: "gluténmentes","laktózmentes","vegán","vegetáriánus".
- A/B/C/D variánsok külön tételek, a betű a 'variar'-ban.
- Zárt nap: "zarva":true, üres "tetelek".
- Ha az 'idoszak.tol' ismert, számold ki minden nap 'datum' mezőjét.
- Ismeretlen mező: null, üres tömb a címkéknél. Tömörített JSON, semmi a JSON előtt/után.`;

const ymd = d => d.toISOString().slice(0, 10);
function monday() {
  const n = new Date();
  const m = new Date(n);
  m.setUTCDate(n.getUTCDate() - ((n.getUTCDay() + 6) % 7) + WEEK_OFFSET * 7);
  return m;
}

async function gemini(parts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4096 }
      })
    }
  );
  if (!res.ok) throw new Error("Gemini " + res.status + " — " + (await res.text()).slice(0, 200));
  const j = await res.json();
  const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
  return JSON.parse(t);
}

/* --- Szalai: heti PDF determinisztikus URL-ről, Gemini olvassa a PDF-et --- */
async function fetchSzalai() {
  const url = `https://www.szalaivendeglo.hu/heti_menu/heti_menu_${ymd(monday()).replaceAll("-", "")}.pdf`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("PDF " + r.status + " (" + url + ")");
  const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
  return gemini([
    { text: SYSTEM },
    { inline_data: { mime_type: "application/pdf", data: b64 } },
    { text: `Étterem: ${META.szalai.name}. ${META.szalai.hint} Mai dátum: ${ymd(new Date())}.` }
  ]);
}

/* --- Wolt: NEM hivatalos végpontok — ha a Wolt változtat, ITT kell igazítani --- */
async function fetchWolt(id) {
  const slug = WOLT_SLUG[id];
  const tries = [
    `https://restaurant-api.wolt.com/v4/venues/slug/${slug}/menu/data`,
    `https://restaurant-api.wolt.com/v3/venues/slug/${slug}`
  ];
  let raw = null;
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
      if (r.ok) { raw = await r.json(); break; }
    } catch {}
  }
  if (!raw) throw new Error("Wolt API nem elérhető (" + slug + ")");
  // védekező vágás: csak név/leírás/ár hármasokat küldünk, bárhol is vannak a fában
  const items = [];
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (o.name && (o.baseprice != null || o.price != null))
        items.push({ name: o.name, description: o.description || "", price: o.baseprice ?? o.price });
      Object.values(o).forEach(walk);
    }
  })(raw);
  const payload = items.length ? JSON.stringify(items) : JSON.stringify(raw).slice(0, 60000);
  return gemini([
    { text: SYSTEM },
    { text: `Étterem: ${META[id].name}. ${META[id].hint} Mai dátum: ${ymd(new Date())}.\n\nWolt nyers adat (JSON):\n${payload.slice(0, 60000)}` }
  ]);
}

/* --- fő menet: csak a saját étterem-kulcsait írja felül --- */
const current = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf-8") || "{}") : {};
let changed = false;

for (const id of AUTO) {
  try {
    const obj = id === "szalai" ? await fetchSzalai() : await fetchWolt(id);
    obj.etterem = obj.etterem || META[id].name;
    obj.forras = META[id].url;
    obj.auto = true;
    obj.frissitve = new Date().toISOString();
    current[id] = obj;
    changed = true;
    console.log("OK:", id);
  } catch (e) {
    console.warn("KIHAGYVA:", id, "—", e.message);
  }
}

if (changed) {
  writeFileSync(FILE, JSON.stringify(current, null, 1));
  console.log("menuk.json frissítve");
} else {
  console.log("nincs változás");
}
