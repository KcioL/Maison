/* =========================================================
   TRADUCTION EN FRANÇAIS (gratuite)
   - Chrome sur ordinateur : traducteur intégré au navigateur
     (Translator API), sur l'appareil, sans limite.
   - Ailleurs (iPhone, Android…) : service gratuit MyMemory
     (api.mymemory.translated.net), sans compte.
     Limite : environ 5 000 caractères par jour et par connexion internet,
     soit 2 à 4 recettes par jour.
   ========================================================= */

export const LANGUES = { fr: "français", en: "anglais", es: "espagnol", it: "italien", pt: "portugais", de: "allemand" };

// Mots très courants de chaque langue (dont ceux de la cuisine)
const MOTS = {
  fr: "le la les de des du et un une pour avec dans sur au aux est ou à cuire mélanger ajouter faire minutes cuillère sel poivre four farine sucre beurre oeufs œufs puis pendant",
  en: "the and of with for to in on cup cups tsp tbsp until till minutes add mix bake cook heat stir salt pepper oven flour sugar butter eggs then into chopped",
  es: "el la los las de del y con para en un una cucharada cucharadas taza hasta minutos añadir agregar mezclar cocinar horno harina azúcar mantequilla huevos sal pimienta luego",
  it: "il lo la gli le di del e con per in un una cucchiaio cucchiai tazza fino minuti aggiungere mescolare cuocere forno farina zucchero burro uova sale pepe poi",
  pt: "o a os as de do da e com para em um uma colher colheres xícara até minutos adicionar misturar cozinhar forno farinha açúcar manteiga ovos sal pimenta depois",
  de: "der die das und mit für in auf ein eine esslöffel teelöffel tasse bis minuten hinzufügen mischen kochen backofen mehl zucker butter eier salz pfeffer dann",
};
const ENSEMBLES = Object.fromEntries(Object.entries(MOTS).map(([l, m]) => [l, new Set(m.split(" "))]));

// Langue du texte, ou null si on ne sait pas (texte trop court)
export function detecterLangue(texte) {
  const mots = String(texte || "").toLowerCase().match(/\p{L}+/gu) || [];
  if (mots.length < 4) return null;
  const scores = Object.fromEntries(Object.keys(ENSEMBLES).map((l) => [l, 0]));
  for (const m of mots) for (const l in ENSEMBLES) if (ENSEMBLES[l].has(m)) scores[l]++;
  // indices sûrs
  if (/[ñ¿¡]/.test(texte)) scores.es += 3;
  if (/\b(?:tsp|tbsp|cups?)\b/i.test(texte)) scores.en += 3;
  const [meilleure, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (score < 2) return null;
  // à égalité ou presque avec le français : on garde le français
  return scores.fr >= score * 0.8 ? "fr" : meilleure;
}

/* ---------- Unités ---------- */
// Avant : des noms complets, mieux compris par les traducteurs
function preparer(l) {
  return l
    .replace(/\b(\d+(?:[.,]\d+)?)\s*tbsps?\b\.?/gi, "$1 tablespoons")
    .replace(/\b(\d+(?:[.,]\d+)?)\s*tsps?\b\.?/gi, "$1 teaspoons")
    .replace(/\btbsps?\b\.?/gi, "tablespoon")
    .replace(/\btsps?\b\.?/gi, "teaspoon");
}
// Après : les abréviations françaises habituelles
function finir(l) {
  return l
    .replace(/\b(?:cuill[eè]res?|cuil\.?|c\.)\s*(?:à|a)\s*(?:soupe|s\.?)(?=\s|$|[,.;)])/gi, "c. à s.")
    .replace(/\b(?:cuill[eè]res?|cuil\.?|c\.)\s*(?:à|a)\s*(?:caf[eé]|th[eé]|c\.?)(?=\s|$|[,.;)])/gi, "c. à c.")
    .replace(/\b(?:tablespoons?|cucharadas?|cucchiai[o]?|colheres? de sopa|essl[oö]ffel)\b/gi, "c. à s.")
    .replace(/\b(?:teaspoons?|cucharaditas?|cucchiaini?|colheres? de ch[aá]|teel[oö]ffel)\b/gi, "c. à c.")
    .replace(/(\d)\.(\d)/g, "$1,$2")              // 1.5 -> 1,5
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- Traducteur de Chrome (ordinateur) ---------- */
async function traducteurChrome(source) {
  try {
    if (!("Translator" in self)) return null;
    // seulement s'il est déjà installé (sinon il faudrait télécharger un modèle) ; jamais plus de 3 s d'attente
    const delai = (ms) => new Promise((_, ko) => setTimeout(() => ko(new Error("délai")), ms));
    const dispo = await Promise.race([self.Translator.availability({ sourceLanguage: source, targetLanguage: "fr" }), delai(3000)]);
    if (dispo !== "available") return null;
    return await Promise.race([self.Translator.create({ sourceLanguage: source, targetLanguage: "fr" }), delai(3000)]);
  } catch {
    return null;   // pas disponible ici (ou il faut un clic pour le télécharger)
  }
}

/* ---------- MyMemory (partout) ---------- */
class QuotaAtteint extends Error {}
const decoder = (s) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };
async function myMemory(texte, source) {
  // 500 octets maximum par demande : les lignes trop longues sont coupées aux phrases
  const morceaux = [];
  let courant = "";
  for (const phrase of texte.split(/(?<=[.!?;])\s+/)) {
    const essai = courant ? courant + " " + phrase : phrase;
    if (new TextEncoder().encode(essai).length > 450 && courant) { morceaux.push(courant); courant = phrase; }
    else courant = essai;
  }
  if (courant) morceaux.push(courant);
  const traduits = [];
  for (const m of morceaux) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(m.slice(0, 450))}&langpair=${source}%7Cfr&mt=1`;
    const rep = await fetch(url);
    if (!rep.ok) throw new Error(rep.status === 429 ? "quota" : "réseau");
    const json = await rep.json();
    if (json.quotaFinished || /QUOTA|LIMIT/i.test(json.responseDetails || "") && Number(json.responseStatus) !== 200) throw new QuotaAtteint();
    if (Number(json.responseStatus) !== 200) throw new Error(json.responseDetails || "traduction refusée");
    traduits.push(decoder(json.responseData?.translatedText || m));
  }
  return traduits.join(" ");
}

/* ---------- Traduire une liste de lignes ----------
   lignes : tableau de textes ; renvoie le même nombre de lignes, en français.
   progres(fait, total) pour afficher l'avancement. */
export async function traduireLignes(lignes, source, progres = () => {}) {
  const chrome = await traducteurChrome(source);
  const resultat = new Array(lignes.length);
  let fait = 0;
  const total = lignes.filter((l) => l && l.trim()).length;
  const une = async (l) => {
    // « — Pour la sauce — » : on ne traduit que le nom
    const g = l.match(/^—\s*(.+?)\s*—$/);
    const texte = preparer(g ? g[1] : l);
    let t;
    if (chrome) t = await chrome.translate(texte);
    else t = await myMemory(texte, source);
    t = finir(t);
    return g ? `— ${t} —` : t;
  };
  // 3 demandes à la fois
  let i = 0;
  const ouvrier = async () => {
    while (i < lignes.length) {
      const k = i++;
      const l = lignes[k];
      if (!l || !l.trim()) { resultat[k] = l; continue; }
      resultat[k] = await une(l);
      progres(++fait, total);
    }
  };
  try {
    await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
  } catch (e) {
    if (e instanceof QuotaAtteint || e.message === "quota") throw new Error("La traduction gratuite du jour est épuisée (environ 5 000 caractères par jour). Réessaie demain, ou traduis à la main.");
    throw new Error("La traduction n'a pas pu se faire (connexion ou service indisponible). Réessaie dans un moment.");
  } finally {
    chrome?.destroy?.();
  }
  return resultat;
}
