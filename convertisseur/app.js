// ==========================================
// CONVERTISSEUR DE RECETTES
// Appli chargée dans la page principale (voir commun/coquille.js).
// Trois outils, sans base de données :
//   Portions  multiplie les quantités d'une liste d'ingrédients
//             (collée, ou prise dans un carnet de recettes)
//   Mesures   cups, cuillères, onces… <-> grammes et millilitres, et °F <-> °C
//   Moule     adapte une recette à un moule d'une autre taille
// Pages internes : #/convertisseur, #/convertisseur/mesures, #/convertisseur/moule
// ==========================================
import { db } from "../commun/firebase.js";
import { ecouterMesPartages } from "../commun/partage.js";
import { esc, toast } from "../commun/ui.js";
import {
    collection, getDocs, getDocsFromCache, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------- Ingrédients : grammes pour 1 cup (240 ml) ----------
const INGREDIENTS = [
    { id: "eau", nom: "Eau, lait, jus", gCup: 240 },
    { id: "farine", nom: "Farine", gCup: 125 },
    { id: "sucre", nom: "Sucre en poudre", gCup: 200 },
    { id: "cassonade", nom: "Cassonade / sucre roux", gCup: 220 },
    { id: "glace", nom: "Sucre glace", gCup: 120 },
    { id: "beurre", nom: "Beurre", gCup: 227 },
    { id: "huile", nom: "Huile", gCup: 218 },
    { id: "creme", nom: "Crème liquide", gCup: 240 },
    { id: "miel", nom: "Miel, sirop", gCup: 340 },
    { id: "cacao", nom: "Cacao en poudre", gCup: 85 },
    { id: "maizena", nom: "Maïzena / fécule", gCup: 128 },
    { id: "amandes", nom: "Poudre d'amandes", gCup: 96 },
    { id: "avoine", nom: "Flocons d'avoine", gCup: 90 },
    { id: "riz", nom: "Riz cru", gCup: 185 },
    { id: "pepites", nom: "Pépites de chocolat", gCup: 170 },
    { id: "noix", nom: "Noix, noisettes hachées", gCup: 120 },
    { id: "sel", nom: "Sel fin", gCup: 288 },
    { id: "fromage", nom: "Fromage râpé", gCup: 100 }
];
// Unités : volume en ml, ou masse en g
const UNITES = [
    { id: "g", nom: "grammes (g)", g: 1 },
    { id: "kg", nom: "kilogrammes (kg)", g: 1000 },
    { id: "ml", nom: "millilitres (ml)", ml: 1 },
    { id: "cl", nom: "centilitres (cl)", ml: 10 },
    { id: "l", nom: "litres (l)", ml: 1000 },
    { id: "cup", nom: "cup (tasse US)", ml: 240 },
    { id: "cas", nom: "cuillère à soupe (tbsp)", ml: 15 },
    { id: "cac", nom: "cuillère à café (tsp)", ml: 5 },
    { id: "floz", nom: "fl oz (once liquide)", ml: 29.57 },
    { id: "verre", nom: "verre (≈ 20 cl)", ml: 200 },
    { id: "oz", nom: "oz (once)", g: 28.35 },
    { id: "lb", nom: "lb (livre US)", g: 453.6 }
];
const unite = (id) => UNITES.find(u => u.id === id);

// ---------- Nombres ----------
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅕": 0.2 };
function lireNombre(t) {
    t = String(t).trim().replace(",", ".");
    let m;
    if ((m = t.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅕])$/))) return +m[1] + FRACTIONS[m[2]];
    if (FRACTIONS[t] !== undefined) return FRACTIONS[t];
    if ((m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = t.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}
// écrit un nombre joliment : 1,5 → « 1 ½ » pour les petites quantités sans unité métrique
function ecrire(n, { fraction = false, unite: u = "" } = {}) {
    if (!Number.isFinite(n)) return "";
    const metrique = /^(g|kg|ml|cl|l|dl|mg)$/i.test(u);
    if (/^(kg|l)$/i.test(u) && n < 10) return (Math.round(n * 20) / 20).toLocaleString("fr-FR");   // 0,75 kg
    if (metrique) {
        if (n >= 100) n = Math.round(n / 5) * 5;
        else if (n >= 10) n = Math.round(n);
        else n = Math.round(n * 10) / 10;
        return n.toLocaleString("fr-FR");
    }
    if (fraction && n < 20) {
        const entier = Math.floor(n), reste = n - entier;
        const choix = [[0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"], [1, ""]];
        let meilleur = choix[0];
        for (const c of choix) if (Math.abs(reste - c[0]) < Math.abs(reste - meilleur[0])) meilleur = c;
        if (Math.abs(reste - meilleur[0]) < 0.035) {
            const e = entier + (meilleur[0] === 1 ? 1 : 0);
            if (!meilleur[1]) return String(e);
            return e ? `${e} ${meilleur[1]}` : meilleur[1];
        }
    }
    return (Math.round(n * 100) / 100).toLocaleString("fr-FR");
}

// Multiplie la première quantité d'une ligne d'ingrédient (« 200 g de farine », « 1/2 citron », « 2-3 œufs »)
const MOTIF = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*[½¼¾⅓⅔⅛⅕]|[½¼¾⅓⅔⅛⅕]|\d+(?:[.,]\d+)?)(\s*(?:-|à)\s*(\d+(?:[.,]\d+)?))?(\s*)([a-zA-Zµ]+)?/;
function convertirLigne(ligne, facteur) {
    const m = ligne.match(MOTIF);
    if (!m) return { texte: ligne, change: false };
    const u = m[5] || "";
    const a = lireNombre(m[1]);
    if (a === null) return { texte: ligne, change: false };
    let q = ecrire(a * facteur, { fraction: true, unite: u });
    if (m[3]) q += ` à ${ecrire(lireNombre(m[3]) * facteur, { fraction: true, unite: u })}`;
    const avant = ligne.slice(0, m.index), apres = ligne.slice(m.index + m[1].length + (m[2] || "").length);
    return { avant, quantite: q, apres, change: true };
}

let racine, outils, zone;
const S = {
    onglet: "portions",
    portions: { de: 4, a: 6, facteur: null, texte: "", source: "" },
    mesures: { quantite: 1, unite: "cup", ingredient: "farine", temp: 180, tempUnite: "c" },
    moule: { de: { forme: "rond", a: 24, b: 24 }, vers: { forme: "rond", a: 28, b: 28 } },
    carnets: [], recettes: {}
};

const facteurPortions = () => S.portions.facteur ?? ((S.portions.a || 0) / (S.portions.de || 1));

// ---------- Rendu ----------
function rendre() {
    const onglets = [["portions", "🍽️ Portions"], ["mesures", "⚖️ Mesures"], ["moule", "🥧 Moule"]];
    zone.innerHTML = `
        <header><h1 class="titre-logo"><img src="commun/logos/convertisseur-192.png" alt="" width="48" height="48"> Convertisseur</h1></header>
        <nav class="cv-onglets" aria-label="Outils">
            ${onglets.map(([id, nom]) => `<a href="${outils.lien(id === "portions" ? "" : id)}" class="cv-onglet ${S.onglet === id ? "actif" : ""}" ${S.onglet === id ? 'aria-current="page"' : ""}>${nom}</a>`).join("")}
        </nav>
        <div class="cv-page">${S.onglet === "mesures" ? pageMesures() : S.onglet === "moule" ? pageMoule() : pagePortions()}</div>`;
    if (S.onglet === "portions") { majPortions(); remplirCarnets(); }
    if (S.onglet === "mesures") majMesures();
    if (S.onglet === "moule") majMoule();
}

function pagePortions() {
    const p = S.portions;
    return `<div class="cv-grille">
        <section class="widget cv-bloc">
            <h2 class="widget-title">Ingrédients</h2>
            <div class="cv-carnet">
                <select id="cv-carnet" aria-label="Carnet"><option value="">📖 Prendre une recette du carnet…</option></select>
                <select id="cv-recette" aria-label="Recette" hidden></select>
            </div>
            <textarea id="cv-texte" rows="9" placeholder="Colle ou écris les ingrédients, un par ligne :&#10;200 g de farine&#10;3 œufs&#10;1/2 citron&#10;2 c. à soupe de sucre">${esc(p.texte)}</textarea>
            <p class="muet petit" id="cv-source">${p.source ? `Recette : ${esc(p.source)}` : ""}</p>
        </section>
        <section class="widget cv-bloc">
            <h2 class="widget-title">Nouvelle quantité</h2>
            ${p.facteur != null ? `<div class="cv-facteur-moule">
                    <span>Quantités multipliées par <b>× ${ecrire(p.facteur)}</b> (taille du moule)</span>
                    <button type="button" class="cv-lien" data-action="annuler-facteur">Revenir aux personnes</button></div>`
                : `<div class="cv-personnes">
                    <label class="cv-champ"><span>Recette pour</span><input id="cv-de" type="number" min="1" max="100" inputmode="numeric" value="${p.de}"></label>
                    <span class="cv-fleche">→</span>
                    <label class="cv-champ"><span>Je veux pour</span>
                        <div class="cv-pas"><button type="button" data-pas="-1" aria-label="Une personne de moins">−</button>
                        <input id="cv-a" type="number" min="1" max="100" inputmode="numeric" value="${p.a}">
                        <button type="button" data-pas="1" aria-label="Une personne de plus">+</button></div></label>
                    <span class="muet">personnes</span>
                </div>`}
            <p class="cv-coef" id="cv-coef"></p>
            <ul class="cv-resultat" id="cv-resultat"></ul>
            <button type="button" class="cv-bouton" data-action="copier" id="cv-copier" hidden>📋 Copier la liste</button>
        </section>
    </div>`;
}

function majPortions() {
    const f = facteurPortions();
    const lignes = S.portions.texte.split("\n").map(l => l.trim()).filter(Boolean);
    const coef = zone.querySelector("#cv-coef"), ul = zone.querySelector("#cv-resultat");
    coef.innerHTML = Number.isFinite(f) && f > 0 ? `Toutes les quantités × <b>${ecrire(f)}</b>` : "";
    if (!lignes.length) { ul.innerHTML = `<li class="muet">Les quantités ajustées s'afficheront ici.</li>`; zone.querySelector("#cv-copier").hidden = true; return; }
    ul.innerHTML = lignes.map(l => {
        const r = convertirLigne(l, f);
        return r.change ? `<li>${esc(r.avant)}<mark>${esc(r.quantite)}</mark>${esc(r.apres)}</li>` : `<li class="muet">${esc(l)}</li>`;
    }).join("");
    zone.querySelector("#cv-copier").hidden = false;
}

function pageMesures() {
    const m = S.mesures;
    return `<div class="cv-grille">
        <section class="widget cv-bloc">
            <h2 class="widget-title">Poids et volumes</h2>
            <div class="cv-mesure">
                <label class="cv-champ"><span>Quantité</span><input id="cv-q" inputmode="decimal" value="${esc(String(m.quantite))}" placeholder="1, 1/2, 1 ½…"></label>
                <label class="cv-champ"><span>Unité</span><select id="cv-u">${UNITES.map(u => `<option value="${u.id}" ${u.id === m.unite ? "selected" : ""}>${esc(u.nom)}</option>`).join("")}</select></label>
            </div>
            <label class="cv-champ"><span>Ingrédient (pour passer du volume au poids)</span>
                <select id="cv-i">${INGREDIENTS.map(i => `<option value="${i.id}" ${i.id === m.ingredient ? "selected" : ""}>${esc(i.nom)}</option>`).join("")}</select></label>
            <div class="cv-table" id="cv-table"></div>
            <p class="muet petit">Les poids des volumes sont des moyennes : une cup de farine tassée pèse plus lourd qu'une cup bien aérée.</p>
        </section>
        <section class="widget cv-bloc">
            <h2 class="widget-title">🌡️ Température du four</h2>
            <div class="cv-mesure">
                <label class="cv-champ"><span>Température</span><input id="cv-t" type="number" inputmode="numeric" value="${m.temp}"></label>
                <label class="cv-champ"><span>En</span><select id="cv-tu">
                    <option value="c" ${m.tempUnite === "c" ? "selected" : ""}>°C</option>
                    <option value="f" ${m.tempUnite === "f" ? "selected" : ""}>°F</option>
                    <option value="th" ${m.tempUnite === "th" ? "selected" : ""}>thermostat</option></select></label>
            </div>
            <div class="cv-temp" id="cv-temp"></div>
            <h3 class="cv-sous-titre">Repères</h3>
            <ul class="cv-reperes">
                <li><span>Four doux</span><span>150 °C · 300 °F · th. 5</span></li>
                <li><span>Gâteaux</span><span>180 °C · 350 °F · th. 6</span></li>
                <li><span>Rôtis, gratins</span><span>200 °C · 400 °F · th. 7</span></li>
                <li><span>Pizza, pain</span><span>230 °C · 450 °F · th. 8</span></li>
            </ul>
        </section>
    </div>`;
}

function majMesures() {
    const m = S.mesures, q = lireNombre(m.quantite), u = unite(m.unite), ing = INGREDIENTS.find(i => i.id === m.ingredient);
    const densite = ing.gCup / 240;   // g par ml
    const tab = zone.querySelector("#cv-table");
    if (q === null || !u) { tab.innerHTML = `<p class="muet">Indique une quantité.</p>`; }
    else {
        const g = u.g ? q * u.g : q * u.ml * densite;
        const ml = u.ml ? q * u.ml : q * u.g / densite;
        // unités affichées : les courantes, plus kg / l / cl quand ça a du sens
        const voulues = ["g", "ml", "cup", "cas", "cac", "oz", "floz", "lb"];
        if (g >= 1000) voulues.splice(1, 0, "kg");
        if (ml >= 1000) voulues.splice(2, 0, "l");
        else if (ml >= 10) voulues.splice(2, 0, "cl");
        const cible = UNITES.filter(x => voulues.includes(x.id) && x.id !== u.id);
        tab.innerHTML = cible.map(x => {
            const v = x.g ? g / x.g : ml / x.ml;
            const sym = { g: "g", kg: "kg", ml: "ml", cl: "cl", l: "l", cup: "cup", cas: "c. à soupe", cac: "c. à café", floz: "fl oz", verre: "verre", oz: "oz", lb: "lb" }[x.id];
            return `<div class="cv-case"><b>${ecrire(v, { fraction: ["cup", "cas", "cac", "verre"].includes(x.id), unite: x.id })}</b><span>${esc(sym)}</span></div>`;
        }).join("");
    }
    const t = parseFloat(m.temp), c = m.tempUnite === "f" ? (t - 32) * 5 / 9 : m.tempUnite === "th" ? t * 30 : t;
    zone.querySelector("#cv-temp").innerHTML = Number.isFinite(c) ? `
        <div class="cv-case"><b>${Math.round(c)}</b><span>°C</span></div>
        <div class="cv-case"><b>${Math.round(c * 9 / 5 + 32)}</b><span>°F</span></div>
        <div class="cv-case"><b>${ecrire(Math.round(c / 30 * 2) / 2)}</b><span>thermostat</span></div>` : "";
}

const FORMES = [["rond", "Rond"], ["carre", "Carré"], ["rect", "Rectangle"]];
function champMoule(cle, titre) {
    const m = S.moule[cle];
    return `<div class="cv-moule" data-moule="${cle}">
        <h3 class="cv-sous-titre">${titre}</h3>
        <div class="cv-formes">${FORMES.map(([id, nom]) => `<button type="button" class="cv-forme ${m.forme === id ? "actif" : ""}" data-forme="${id}">${dessinForme(id)}<span>${nom}</span></button>`).join("")}</div>
        <div class="cv-mesure">
            <label class="cv-champ"><span>${m.forme === "rond" ? "Diamètre" : m.forme === "carre" ? "Côté" : "Longueur"} (cm)</span><input type="number" min="1" max="100" step="0.5" inputmode="decimal" data-dim="a" value="${m.a}"></label>
            ${m.forme === "rect" ? `<label class="cv-champ"><span>Largeur (cm)</span><input type="number" min="1" max="100" step="0.5" inputmode="decimal" data-dim="b" value="${m.b}"></label>` : ""}
        </div>
    </div>`;
}
const dessinForme = (id) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${
    id === "rond" ? '<circle cx="12" cy="12" r="8"/>' : id === "carre" ? '<rect x="4" y="4" width="16" height="16" rx="2"/>' : '<rect x="2" y="6" width="20" height="12" rx="2"/>'}</svg>`;
const surface = (m) => m.forme === "rond" ? Math.PI * (m.a / 2) ** 2 : m.forme === "carre" ? m.a * m.a : m.a * m.b;

function pageMoule() {
    return `<div class="cv-grille">
        <section class="widget cv-bloc">
            <h2 class="widget-title">Taille du moule</h2>
            ${champMoule("de", "Moule de la recette")}
            ${champMoule("vers", "Mon moule")}
        </section>
        <section class="widget cv-bloc cv-moule-res" id="cv-moule-res"></section>
    </div>`;
}

function majMoule() {
    const a = surface(S.moule.de), b = surface(S.moule.vers);
    const box = zone.querySelector("#cv-moule-res");
    if (!(a > 0 && b > 0)) { box.innerHTML = `<p class="muet">Indique les dimensions des deux moules.</p>`; return; }
    const f = b / a;
    box.innerHTML = `<h2 class="widget-title">Résultat</h2>
        <p class="cv-gros">× ${ecrire(f)}</p>
        <p>Multiplie toutes les quantités par <b>${ecrire(f)}</b> pour garder la même épaisseur.</p>
        <p class="muet petit">Moule de la recette : ${Math.round(a)} cm² · ton moule : ${Math.round(b)} cm².
        ${f > 1.15 ? "Ton moule est plus grand : surveille la cuisson, elle peut demander quelques minutes de plus." : f < 0.85 ? "Ton moule est plus petit : la cuisson sera un peu plus courte." : "Les deux moules sont presque pareils."}</p>
        <button type="button" class="cv-bouton principal" data-action="vers-portions">Appliquer aux ingrédients →</button>`;
}

// ---------- Carnets de recettes (pour prendre les ingrédients) ----------
function remplirCarnets() {
    const choix = zone.querySelector("#cv-carnet"); if (!choix) return;
    choix.hidden = !S.carnets.length;
    choix.innerHTML = `<option value="">📖 Prendre une recette du carnet…</option>` + S.carnets.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
}
async function chargerRecettes(cid) {
    if (S.recettes[cid]) return S.recettes[cid];
    const q = query(collection(db, "carnets", cid, "recettes"), orderBy("titre"));
    let snap;
    try { snap = await getDocsFromCache(q); if (snap.empty) throw 0; } catch { snap = await getDocs(q); }
    S.recettes[cid] = snap.docs.map(d => ({ id: d.id, titre: d.data().titre, ingredients: d.data().ingredients || [] }));
    return S.recettes[cid];
}

// ---------- Actions ----------
function brancher() {
    zone.addEventListener("input", (e) => {
        const t = e.target;
        if (t.id === "cv-texte") { S.portions.texte = t.value; S.portions.source = ""; zone.querySelector("#cv-source").textContent = ""; majPortions(); }
        else if (t.id === "cv-de") { S.portions.de = Math.max(1, parseInt(t.value, 10) || 1); majPortions(); }
        else if (t.id === "cv-a") { S.portions.a = Math.max(1, parseInt(t.value, 10) || 1); majPortions(); }
        else if (t.id === "cv-q") { S.mesures.quantite = t.value; majMesures(); }
        else if (t.id === "cv-u") { S.mesures.unite = t.value; majMesures(); }
        else if (t.id === "cv-i") { S.mesures.ingredient = t.value; majMesures(); }
        else if (t.id === "cv-t") { S.mesures.temp = t.value; majMesures(); }
        else if (t.id === "cv-tu") { S.mesures.tempUnite = t.value; majMesures(); }
        else if (t.dataset.dim) { S.moule[t.closest("[data-moule]").dataset.moule][t.dataset.dim] = parseFloat(t.value) || 0; majMoule(); }
    });
    zone.addEventListener("change", async (e) => {
        const t = e.target;
        if (t.id === "cv-carnet") {
            const r = zone.querySelector("#cv-recette");
            if (!t.value) { r.hidden = true; return; }
            r.hidden = false; r.innerHTML = `<option>Chargement…</option>`;
            try {
                const liste = await chargerRecettes(t.value);
                r.innerHTML = `<option value="">Choisis une recette…</option>` + liste.map(x => `<option value="${esc(x.id)}">${esc(x.titre)}</option>`).join("");
            } catch { r.innerHTML = `<option value="">Impossible de charger les recettes</option>`; }
        } else if (t.id === "cv-recette" && t.value) {
            const rec = (S.recettes[zone.querySelector("#cv-carnet").value] || []).find(x => x.id === t.value);
            if (!rec) return;
            S.portions.texte = rec.ingredients.join("\n");
            const ta = zone.querySelector("#cv-texte"); ta.value = S.portions.texte;
            S.portions.source = rec.titre;
            zone.querySelector("#cv-source").textContent = `Recette : ${rec.titre}`;
            majPortions();
            toast(`Ingrédients de « ${rec.titre} » chargés.`);
        }
    });
    zone.addEventListener("click", async (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.pas) {
            S.portions.a = Math.max(1, S.portions.a + Number(b.dataset.pas));
            zone.querySelector("#cv-a").value = S.portions.a; majPortions();
        } else if (b.dataset.action === "copier") {
            const texte = [...zone.querySelectorAll("#cv-resultat li")].map(li => li.textContent).join("\n");
            try { await navigator.clipboard.writeText(texte); toast("Liste copiée ✔"); }
            catch { toast("Copie impossible : sélectionne le texte à la main."); }
        } else if (b.dataset.action === "annuler-facteur") { S.portions.facteur = null; rendre(); }
        else if (b.dataset.action === "vers-portions") {
            S.portions.facteur = Math.round(surface(S.moule.vers) / surface(S.moule.de) * 100) / 100;
            outils.aller("");
        } else if (b.dataset.forme) {
            const cle = b.closest("[data-moule]").dataset.moule;
            S.moule[cle].forme = b.dataset.forme;
            rendre();
        }
    });
}

// ---------- Cycle de vie (coquille) ----------
export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur; outils = outilsCoquille;
    zone = racine.querySelector("#cv-app");
    brancher();
    rendre();
    ecouterMesPartages("carnets", (liste) => { S.carnets = liste; S.recettes = {}; if (S.onglet === "portions") remplirCarnets(); });
}

export function afficher(chemin = "") {
    const onglet = ["mesures", "moule"].includes(chemin) ? chemin : "portions";
    outils.titre("Convertisseur · Maison");
    if (onglet !== S.onglet || !zone.innerHTML) { S.onglet = onglet; rendre(); }
}

// pour les tests
export { convertirLigne, lireNombre, ecrire };
