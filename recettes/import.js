/* =========================================================
   REMPLIR UNE RECETTE AUTOMATIQUEMENT
   À partir du texte d'une description (Instagram, site…), collé
   ou lu dans une capture d'écran.

   - lireCaptures(fichiers, progres) : lit le texte des images, directement
     sur le téléphone (Tesseract.js, gratuit, rien n'est envoyé à un serveur).
     Le moteur (~3 à 5 Mo) n'est téléchargé qu'à la première utilisation.
   - analyserTexte(texte) : range le texte en { titre, ingredients[], etapes[], portions }.
   ========================================================= */

const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

/* ---------- Lecture des captures ---------- */
let chargement = null;
function chargerTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = TESSERACT;
    s.onload = () => (window.Tesseract ? ok(window.Tesseract) : ko(new Error("lecteur indisponible")));
    s.onerror = () => { chargement = null; ko(new Error("Le lecteur de texte n'a pas pu être téléchargé. Vérifie ta connexion.")); };
    document.head.appendChild(s);
  });
  return chargement;
}

// Prépare l'image : niveaux de gris, et texte clair sur fond sombre (mode sombre d'Insta) inversé
async function preparer(fichier) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Cette image n'a pas pu être lue. Essaie avec une capture en PNG ou JPEG."));
      i.src = url;
    });
    // ni trop petite (texte illisible), ni trop grande (lent)
    const largeur = Math.min(2000, Math.max(1100, img.naturalWidth));
    const r = largeur / img.naturalWidth;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * r);
    c.height = Math.round(img.naturalHeight * r);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    let somme = 0;
    for (let i = 0; i < p.length; i += 4) {
      const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      p[i] = p[i + 1] = p[i + 2] = g;
      somme += g;
    }
    if (somme / (p.length / 4) < 110) for (let i = 0; i < p.length; i += 4) p[i] = p[i + 1] = p[i + 2] = 255 - p[i];
    ctx.putImageData(d, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// progres(texte) : petit message d'avancement (« Lecture 2/3… 40 % »)
export async function lireCaptures(fichiers, progres = () => {}) {
  progres("Préparation du lecteur…");
  const T = await chargerTesseract();
  let n = 0;
  const total = fichiers.length;
  const worker = await T.createWorker("fra", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") progres(`Lecture${total > 1 ? ` ${n}/${total}` : ""}… ${Math.round(m.progress * 100)} %`);
      else if (/loading|initializ/.test(m.status)) progres("Préparation du lecteur (la 1ʳᵉ fois, quelques secondes)…");
    },
  });
  try {
    const textes = [];
    for (const f of fichiers) {
      n++;
      const { data } = await worker.recognize(await preparer(f));
      textes.push(data.text || "");
    }
    return textes.join("\n");
  } finally {
    worker.terminate().catch(() => {});
  }
}

/* ---------- Rangement du texte ---------- */
const EMOJI = /(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}](?:️|‍[\p{Extended_Pictographic}])*|\d️?⃣)/gu;
const PUCE = /^[\s\-–—•·*▪▫◦●○►▶➡→>✓✔☑+]+/u;
const sansAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TITRE_ING = /^(?:les\s+|mes\s+|the\s+)?ingr[eé]dients?\b|^(?:il\s+)?(?:te|vous|nous)\s+faut\b|^liste\s+(?:des\s+)?courses\b|^you(?:'ll)?\s+need\b/i;
const TITRE_ETAPES = /^(?:la\s+)?(?:pr[eé]paration|[eé]tapes?|instructions?|m[eé]thode|method|directions?|steps?|r[eé]alisation|d[eé]roul[eé]|comment\s+(?:la\s+)?faire|how\s+to\s+make|recette)\b/i;
const PORTIONS = /(?:pour\s+)?\d+\s*(?:à|-)?\s*\d*\s*(?:personnes?|pers\.?|parts?|portions?|servings?)\b|\b(?:makes|serves)\s+\d+(?:\s*-\s*\d+)?/i;
const NB = String.raw`(?:\d+(?:[.,/]\d+)?|[½¼¾⅓⅔⅛]|une?|deux|trois|quatre|cinq|six|sept|huit|dix|douze|quelques|demi|one|two|three|four|five|six|half)`;
const QTE = new RegExp(String.raw`^${NB}(?=[\s\dgkmlc½¼¾]|$)`, "i");
const UNITE = /\d\s?(?:g|gr|kg|mg|ml|cl|dl|l|oz|lbs?)\b|\b(?:c\.?\s?à\s?[sc]|cs|cc|cuill[eè]res?|tasses?|pinc[eé]es?|sachets?|tranches?|gousses?|bo[iî]tes?|pots?|verres?|filets?|brins?|feuilles?|poign[eé]es?|noix|zestes?|tsps?|tbsps?|teaspoons?|tablespoons?|cups?|cloves?|slices?|pinch|handful|scoops?|cans?)\b/i;
// les valeurs nutritives (« 578 Calories | 55g Protein ») vont dans les notes
const MACRO = /\b(?:k?cal(?:ories)?|prot[eé]ines?|proteins?|glucides|carbs?|carbohydrates|lipides|fats?|fibres?)\b/gi;
const estNutrition = (l) => /^(?:macros?|valeurs?\s+nutritives?|nutrition)\b/i.test(l) || /\d/.test(l) && ((l.match(MACRO) || []).length >= 2 || /\d+\s*(?:k?cal|calories)\b/i.test(l));
// lignes à jeter : interface d'Instagram et du téléphone, hashtags, mentions…
const BRUIT = /^(?:#|@[\w.]{3,})|^\d{1,2}:\d{2}\b|^(?:voir\s+(?:la\s+)?traduction|see\s+translation|traduire|j['’]aime|r[eé]pondre|reply|afficher\s+(?:les|plus)|\.\.\.\s*(?:plus|more)|plus$|more$|suivre|follow|abonn[eé]|enregistr|saved?$|partager|envoyer|ajouter un commentaire|il\s+y\s+a\s+\d)|^\d+\s*(?:j['’]aime|likes?|commentaires?|comments?|r[eé]ponses?|vues?|views?)\b|^\d+\s*(?:h|min|s|j|sem|w|d)\.?(?:\s|$)|\bj['’]aime\b.*\br[eé]pondre\b|^(?:bon\s+app[eé]tit|r[eé]galez[- ]vous|enjoy|miam)\b/i;

// Sur une capture, les emojis sont lus comme des signes au hasard (« @@ », « ®@ », « £s », « ô »…) :
// on retire ces petits morceaux en début et en fin de ligne.
const MOTS_COURTS = new Set(["a", "à", "y", "un", "le", "la", "les", "de", "du", "des", "au", "en", "et", "ou", "1/2", "of", "or", "an", "the"]);
const parasite = (m) => m.length <= 3 && !MOTS_COURTS.has(m.toLowerCase())
  && (/[^\p{L}\d]/u.test(m) || (m.length === 1 && /\p{L}/u.test(m)) || /^[\p{L}]{2,3}$/u.test(m) && /[^a-zA-Zàâäéèêëîïôöùûüç]/.test(m));
function nettoyer(l) {
  let t = l
    .replace(EMOJI, " ")
    .replace(PUCE, "")
    .replace(/(\d)\s?m[|Il]{1,2}\b/g, "$1ml")       // « 300m|I » lu à la place de « 300ml »
    .replace(/\s\|\s/g, " · ")                       // « 578 Calories | 55g Protein »
    .replace(/[|]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mots = t.split(" ");
  while (mots.length > 1 && parasite(mots[0]) && !/^\d/.test(mots[0])) mots.shift();
  // « 25 1 boîte de… », « A 1 c. à s. » : un signe lu à la place de l'emoji, juste avant la quantité
  while (mots.length > 2 && /^\S{1,3}$/.test(mots[0]) && (/[^\p{L}]/u.test(mots[0]) || mots[0].length === 1) && !/^(?:à)$/i.test(mots[0])
    && /^\d/.test(mots[1]) && !/^\d+\/\d+/.test(mots[1]) && !/^\d+[.,]\d/.test(mots[0] + mots[1])) mots.shift();
  while (mots.length > 1 && parasite(mots[mots.length - 1]) && !/^[\d!?.:)]+$/.test(mots[mots.length - 1])) mots.pop();
  return mots.join(" ").replace(PUCE, "").replace(/\s+([,.;:!?)])/g, "$1").trim();
}
// « 1. Faire… », « 2) Mix… », « Étape 3 : … » (mais pas « 1.5 Tsp »)
const NUM_ETAPE = /^(?:(?:[eé]tape|step)\s*)?\d{1,2}\s*(?:[.)]\s+|[-–:]\s+)(?=\D)/i;
const ressembleIngredient = (l) => (QTE.test(l) || UNITE.test(l)) && !NUM_ETAPE.test(l) && l.length < 100;
const commenceMinuscule = (l) => /^[a-zàâäéèêëîïôöùûüç(]/.test(l);
const MOTS_DE_LIAISON = /\b(?:de|du|des|d['’]|à|au|aux|et|ou|le|la|les|un|une|avec|pour|the|to|of|and|with|for|a|in|on)$/i;

// Une ligne « 🥕 2 carottes 🧅 1 oignon 🧄 2 gousses d'ail » -> trois lignes
function decouper(brute) {
  const morceaux = brute.split(EMOJI).map((m) => m.trim()).filter(Boolean);
  if (morceaux.length > 1 && morceaux.filter((m) => QTE.test(m) || UNITE.test(m)).length >= 2) return morceaux;
  return [brute];
}
const majuscule = (s) => s.replace(/^./, (c) => c.toUpperCase());

export function analyserTexte(texte) {
  const sortie = { titre: "", ingredients: [], etapes: [], portions: "", nutrition: "" };

  // 1. lignes nettoyées
  const lignes = [];
  for (const brute of String(texte || "").replace(/\r/g, "").split("\n")) {
    for (const morceau of decouper(brute)) {
      let l = nettoyer(morceau);
      if (!l || l.length < 2 || BRUIT.test(l) || /^[^\p{L}\d]+$/u.test(l)) continue;
      l = l.replace(/(?:\s#[\p{L}\d_]+)+\s*$/u, "").trim();   // hashtags en fin de ligne
      if (l) lignes.push(l);
    }
  }
  const enTeteIng = (l) => TITRE_ING.test(l) && (l.length < 60 || /^[^:]{0,40}:/.test(l));
  const enTeteEtapes = (l) => !enTeteIng(l) && TITRE_ETAPES.test(l) && (l.length < 40 || /:/.test(l.slice(0, 20)));
  const aUnEnTeteIng = lignes.some(enTeteIng);

  // 2. rangement. mode « ing » : ingrédients et étapes peuvent alterner
  //    (« Poulet : … ingrédients… • Cuire 5 min… Pommes de terre : … »)
  let mode = "avant", groupe = "", groupeAnnonce = false, dernier = null;
  const avant = [], nutrition = [];
  const ajouterIngredient = (l) => {
    if (groupe && !groupeAnnonce) { sortie.ingredients.push(`— ${groupe} —`); groupeAnnonce = true; }
    sortie.ingredients.push(l); dernier = "ing";
  };
  const ajouterEtape = (l) => {
    l = l.replace(NUM_ETAPE, "");
    sortie.etapes.push(groupe ? `${groupe} : ${l}` : l); dernier = "etape";
  };
  const prolonger = (l) => {
    const liste = dernier === "ing" ? sortie.ingredients : sortie.etapes;
    liste[liste.length - 1] += " " + l;
  };

  for (const l of lignes) {
    if (enTeteIng(l) || enTeteEtapes(l)) {
      mode = enTeteIng(l) ? "ing" : "etapes";
      groupe = ""; dernier = null;
      const p = l.match(PORTIONS);
      if (p && !sortie.portions) sortie.portions = majuscule(p[0]);
      const reste = l.includes(":") ? l.slice(l.indexOf(":") + 1).trim() : "";
      if (reste) (mode === "ing" ? reste.split(/\s*[,;]\s*/) : [reste]).filter(Boolean).forEach(mode === "ing" ? ajouterIngredient : ajouterEtape);
      continue;
    }
    if (estNutrition(l)) { nutrition.push(l); continue; }
    if (PORTIONS.test(l) && l.length < 40 && !UNITE.test(l)) { if (!sortie.portions) sortie.portions = majuscule(l); continue; }

    if (mode === "avant") {
      // pas d'en-tête « Ingrédients » dans le texte : la liste commence au premier ingrédient
      if (!aUnEnTeteIng && ressembleIngredient(l)) mode = "ing";
      else { avant.push(l); continue; }
    }

    // sous-titre d'une partie (« Honey BBQ Chicken: », « Pour la sauce : »)
    if (/:$/.test(l) && l.length <= 50 && !ressembleIngredient(l)) {
      groupe = l.replace(/\s*:$/, "").replace(/^pour\s+(?:la|le|les|l['’])\s*/i, (m) => m).trim();
      groupe = majuscule(groupe); groupeAnnonce = false; dernier = null;
      continue;
    }

    const precedent = dernier === "ing" ? sortie.ingredients.at(-1) : dernier === "etape" ? sortie.etapes.at(-1) : "";
    // suite d'une ligne coupée en deux
    if (precedent && commenceMinuscule(l) && !ressembleIngredient(l)
      && (dernier === "etape" ? !/[.!?]$/.test(precedent) || /^(?:and|et|puis|then|for|pour)\b/i.test(l) : MOTS_DE_LIAISON.test(precedent) || /[,(]$/.test(precedent))) {
      prolonger(l); continue;
    }

    if (mode === "etapes") { ajouterEtape(l); continue; }
    // mode « ing »
    if (ressembleIngredient(l)) ajouterIngredient(l);
    else if (NUM_ETAPE.test(l) || l.length > 32) ajouterEtape(l);
    else if (dernier !== "etape") ajouterIngredient(l);        // « Sel, poivre », « Persil »
    else ajouterEtape(l);
  }

  // 3. le titre : la première ligne courte avant la liste
  const titre = avant.find((l) => l.length >= 3 && l.length <= 70 && !ressembleIngredient(l) && !MOTS_DE_LIAISON.test(l) && !/^[a-zàâäéèêëîïôöùûüç]/.test(l.replace(/^[a-z0-9._]{3,30}\s+/, "X")));
  if (titre) {
    sortie.titre = majuscule(titre
      .replace(/^[a-z0-9._]{3,30}(?=\s)/, (m) => (/[._\d]/.test(m) ? "" : m))   // le pseudo du compte (« jenigger.cuisine »)
      .replace(/[\s:–-]+$/, "").trim());
  }
  sortie.nutrition = nutrition.join("\n");

  // 4. finitions : pas de point final aux ingrédients, pas de numéro aux étapes (l'appli numérote)
  sortie.ingredients = sortie.ingredients.map((x) => x.replace(/[.;,]+$/, "").trim()).filter((x) => x.length > 1);
  sortie.etapes = sortie.etapes.map((x) => x.trim()).filter((x) => x.length > 2);
  return sortie;
}
