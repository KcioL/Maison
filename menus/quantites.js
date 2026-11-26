// ==========================================
// ADDITIONNER LES INGRÉDIENTS
// « 200 g de crème » + « 20 cl de crème » + « 100 g de crème »  ->  « 300 g + 20 cl de crème »
// « 1 oignon » + « 2 oignons »                                  ->  « 3 oignons »
// « 1 c. à s. de paprika » + « 2 c. à c. de paprika »           ->  « 25 ml de paprika »
//   (cuillère à soupe = 15 ml, cuillère à café = 5 ml)
//
//   lireIngredient("200 g de crème")  ->  { qte: 200, unite: "g", nom: "crème", lien: "de ", cle: "creme" }
//   additionner([{ texte, plat }, …]) ->  [{ texte, cle, plats, nb, detail }]
// ==========================================

const MOTS_NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, demi: 0.5, "demie": 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5 };
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

// Unités : famille (pour additionner), facteur vers l'unité de base, nom affiché (singulier, pluriel)
const UNITES = [
    { re: /^(?:kg|kilos?|kilogrammes?)\b\.?/i, famille: "masse", f: 1000 },
    { re: /^(?:mg|milligrammes?)\b\.?/i, famille: "masse", f: 0.001 },
    { re: /^(?:g|gr|grs|grammes?)\b\.?/i, famille: "masse", f: 1 },
    { re: /^(?:ml|millilitres?)\b\.?/i, famille: "volume", f: 1 },
    { re: /^(?:cl|centilitres?)\b\.?/i, famille: "volume", f: 10 },
    { re: /^(?:dl|décilitres?|decilitres?)\b\.?/i, famille: "volume", f: 100 },
    { re: /^(?:l|litres?)\b\.?/i, famille: "volume", f: 1000 },
    { re: /^(?:c\.?\s*à\s*s\.?|c\.?\s*a\s*s\.?|cas|cs|cuill?(?:è|e)res?\s+à\s+soupe|cuil\.?\s+à\s+soupe|tbsps?|tablespoons?|cucharadas?)(?=\s|$|[,.)])\.?/i, famille: "volume", f: 15, cuillere: true },   // cuillère à soupe = 15 ml
    { re: /^(?:c\.?\s*à\s*c\.?|c\.?\s*a\s*c\.?|cac|cc|cuill?(?:è|e)res?\s+à\s+(?:café|cafe|thé|the)|cuil\.?\s+à\s+café|tsps?|teaspoons?|cucharaditas?)(?=\s|$|[,.)])\.?/i, famille: "volume", f: 5, cuillere: true },    // cuillère à café = 5 ml
    { re: /^(?:oz|ounces?)\b\.?/i, famille: "oz", f: 1 },
    { re: /^(?:lbs?|pounds?)\b\.?/i, famille: "lb", f: 1 },
    { re: /^(?:cups?|tasses?)\b/i, famille: "tasse", f: 1 }
];
// unités qui se comptent (« 2 gousses d'ail ») : gardées telles quelles, au singulier
const UNITES_COMPTEES = ["gousse", "tranche", "boîte", "boite", "sachet", "pincée", "pincee", "verre", "pot", "filet", "brin", "feuille", "poignée", "poignee", "botte", "bouquet", "morceau", "paquet", "tablette", "barquette", "brique", "bouteille", "canette", "rouleau", "pavé", "pave", "branche", "tige", "zeste", "noix", "noisette", "carré", "carre", "clove", "slice", "can", "pinch", "handful", "scoop"];
const NOMS_UNITES = {
    masse: null, volume: null,
    oz: ["oz", "oz"], lb: ["lb", "lb"], tasse: ["tasse", "tasses"]
};

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// clé pour reconnaître un même ingrédient : sans accents, sans « de », au singulier, sans précisions
export function cleNom(nom, entier = false) {
    const t = sansAccents(nom);
    return (entier ? t.replace(/[,;]/g, " ") : t)
        .replace(/œ/g, "oe").replace(/æ/g, "ae")
        .replace(/\(.*?\)/g, " ")
        .split(/[,;]/)[0]
        .replace(/^(?:de\s+la|de\s+l['’]|du|des|de|d['’]|l['’]|le|la|les|of)\s*/i, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/).filter(Boolean)
        .map(m => m.length > 3 ? m.replace(/(?:s|x)$/, "") : m)
        .join(" ");
}

function lireNombre(t) {
    // « 1,5 », « 1.5 », « 1/2 », « 1 1/2 », « ½ », « 1½ », « deux »
    let m = t.match(/^(\d+)\s+(\d+)\/(\d+)(?=\s|$|[a-zA-Zµ])/);
    if (m) return { v: +m[1] + +m[2] / +m[3], reste: t.slice(m[0].length) };
    m = t.match(/^(\d+)\/(\d+)(?=\s|$|[a-zA-Z])/);
    if (m) return { v: +m[1] / +m[2], reste: t.slice(m[0].length) };
    m = t.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])/);
    if (m) return { v: (m[1] ? +m[1] : 0) + FRACTIONS[m[2]], reste: t.slice(m[0].length) };
    m = t.match(/^(\d+(?:[.,]\d+)?)(?!\s*[-–à]\s*\d)/);       // pas « 2-3 » ni « 2 à 3 »
    if (m && !/^\d+(?:[.,]\d+)?\s*[-–]\s*\d/.test(t)) return { v: parseFloat(m[1].replace(",", ".")), reste: t.slice(m[0].length) };
    m = t.match(/^([a-zéèê]+)\s+/i);
    if (m && MOTS_NOMBRES[m[1].toLowerCase()] != null) return { v: MOTS_NOMBRES[m[1].toLowerCase()], reste: t.slice(m[0].length), mot: true };
    return null;
}

export function lireIngredient(texte) {
    const brut = String(texte || "").trim().replace(/\s+/g, " ");
    if (!brut) return null;
    const n = lireNombre(brut);
    // sans quantité (« Sel, poivre ») : on garde tout le texte pour le reconnaître
    if (!n) return { qte: null, unite: null, famille: null, nom: brut, lien: "", cle: cleNom(brut, true), texte: brut };
    let reste = n.reste.trim();
    let unite = null, famille = null, f = 1, cuillere = false;
    for (const u of UNITES) {
        const m = reste.match(u.re);
        if (m) { famille = u.famille; f = u.f; cuillere = !!u.cuillere; reste = reste.slice(m[0].length).trim(); break; }
    }
    if (!famille) {
        const m = reste.match(/^([a-zàâäéèêëîïôöùûüç]+)(?=\s|$)/i);
        const mot = m && sansAccents(m[1]).replace(/(?:s|x)$/, "");
        const compte = mot && UNITES_COMPTEES.find(u => sansAccents(u) === mot);
        // « 2 gousses d'ail » : unité comptée seulement si un complément suit (« de », « d' »)
        if (compte && /^\S+\s+(?:de|d['’]|du|des|of)\b/i.test(reste)) {
            famille = "u:" + sansAccents(compte); unite = compte; reste = reste.slice(m[0].length).trim();
        }
    }
    const lienM = reste.match(/^(de\s+la\s+|de\s+l['’]|du\s+|des\s+|de\s+|d['’]|of\s+)/i);
    const lien = famille ? (lienM ? lienM[0].replace(/\s+$/, " ").replace(/^de la /i, "de ").replace(/^du /i, "de ").replace(/^des /i, "de ") : "") : "";
    const nom = (lienM && famille ? reste.slice(lienM[0].length) : reste).trim();
    if (!nom) return { qte: null, unite: null, famille: null, nom: brut, lien: "", cle: cleNom(brut, true), texte: brut };
    return { qte: n.v * f, unite, famille: famille || "piece", nom, lien, cle: cleNom(nom), texte: brut, cuillere };
}

// ---------- Écriture des quantités ----------
const nombre = (v) => {
    const r = Math.round(v * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 0.01) return String(Math.round(r));
    if (Math.abs(r - 0.5) < 0.01) return "½";
    return r.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
};
function quantite(famille, v, unite) {
    if (famille === "masse") return v >= 1000 ? `${nombre(v / 1000)} kg` : `${nombre(v)} g`;
    // petites quantités en ml (cuillères), puis cl, puis l
    if (famille === "volume") return v >= 1000 ? `${nombre(v / 1000)} l` : v >= 100 && Math.abs(v / 10 - Math.round(v / 10)) < 0.01 ? `${nombre(v / 10)} cl` : `${nombre(v)} ml`;
    if (famille === "piece") return nombre(v);
    if (famille.startsWith("u:")) return `${nombre(v)} ${v > 1 && !/[sx]$/.test(unite) ? unite + "s" : unite}`;
    const [s, p] = NOMS_UNITES[famille] || [famille, famille];
    return `${nombre(v)} ${v > 1 ? p : s}`;
}
// « pâte brisée » -> « pâtes brisées », « pomme de terre » -> « pommes de terre » (on s'arrête à « de », « à »…)
function pluriel(nom) {
    const mots = nom.split(" ");
    for (let i = 0; i < mots.length; i++) {
        if (/^(?:de|du|des|d['’].*|à|au|aux|en|pour|avec|sans|of|with)$/i.test(mots[i])) break;
        if (/[a-zàâäéèêëîïôöùûüç]$/i.test(mots[i]) && !/[sxz]$/i.test(mots[i])) mots[i] += "s";
    }
    return mots.join(" ");
}

// ---------- Additionner ----------
// entrees : [{ texte, plat }] -> [{ texte, cle, plats, nb, detail }]
export function additionner(entrees) {
    const groupes = new Map();
    for (const { texte, plat } of entrees) {
        const ing = lireIngredient(texte);
        if (!ing) continue;
        const g = groupes.get(ing.cle) || { cle: ing.cle, premier: ing, lien: "", par: new Map(), sans: [], plats: [], nb: 0, textes: [] };
        g.nb++;
        if (plat && !g.plats.includes(plat)) g.plats.push(plat);
        g.textes.push(ing.texte);
        if (ing.qte == null) g.sans.push(ing);
        else {
            const k = ing.famille;
            const q = g.par.get(k) || { famille: ing.famille, v: 0, unite: ing.unite, n: 0, maxOrig: 0 };
            q.v += ing.qte; q.n++; q.maxOrig = Math.max(q.maxOrig, ing.qte);
            g.par.set(k, q);
            if (g.premier.qte == null) g.premier = ing;
            if (!g.lien && ing.lien) g.lien = ing.lien;
        }
        groupes.set(ing.cle, g);
    }
    const out = [];
    for (const g of groupes.values()) {
        let texte;
        if (!g.par.size) texte = g.premier.texte;                       // aucune quantité : « Sel, poivre »
        else if (g.nb === 1 && !g.premier.cuillere) texte = g.premier.texte;   // une seule fois : texte d'origine (sauf cuillères -> ml)
        else {
            const morceaux = [...g.par.values()];
            const avecUnite = morceaux.filter(q => q.famille !== "piece");
            const pieces = morceaux.find(q => q.famille === "piece");
            const parties = morceaux.map(q => quantite(q.famille, q.v, q.unite));
            let nom = g.premier.nom;
            if (!avecUnite.length && pieces && pieces.v > 1 && pieces.maxOrig <= 1) nom = pluriel(nom);
            const lien = avecUnite.length ? (g.lien || "") : "";
            texte = `${parties.join(" + ")} ${lien}${nom}`.replace(/\s+/g, " ").trim();
        }
        out.push({ texte: texte.slice(0, 200), cle: g.cle, plats: g.plats, nb: g.nb, detail: g.nb > 1 ? g.textes : null });
    }
    return out;
}
