/* =========================================================
   CARNET DE RECETTES
   Appli chargée dans la page principale (voir commun/coquille.js).
   Ses pages internes ont pour adresse :
     #/recettes                   le carnet
     #/recettes/recette/<id>      une recette
     #/recettes/ajouter           nouvelle recette
     #/recettes/modifier/<id>     modifier une recette
   Intercalaires : chaque recette a une liste « categories » (Sucré, Plat…) ;
   l'accueil les montre comme des onglets de classeur pour filtrer le carnet.
   Les recettes sont rangées dans des carnets partagés (comme les stocks et les listes) :
     carnets/{carnet}/recettes/{recette}/photos/{photo}
   Le compte et le partage sont communs au site (commun/compte.js, commun/partage.js).
   ========================================================= */

const TITRE = "Les recettes de Jenigger";

/* ========================================================= */

import { affiche } from "../commun/nouveautes.js";
import { lireCaptures, analyserTexte } from "./import.js";
import { detecterLangue, traduireLignes, LANGUES } from "./traduction.js";
import { db } from "../commun/firebase.js";
import { compte } from "../commun/compte.js";
import { ecouterMesPartages, creerPartage, ouvrirAcces, supprimerOuQuitter, renommerPartage } from "../commun/partage.js";
import { ouvrirFeuille, toast as toastSite } from "../commun/ui.js";
import {
  collection, doc, getDoc, getDocs, getDocsFromCache, getDocsFromServer, setDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, serverTimestamp,
} from "../commun/firestore.js";

let app;              // zone où s'affichent les pages du carnet
let racine;           // vue de l'appli
let outils;           // outils de la coquille (titre, adresse, défilement)
let cheminCourant = ""; // page interne affichée ("", "recette/<id>", "ajouter"…)
const $id = (id) => racine.querySelector("#" + id);
const PASTELS = ["lavande", "menthe", "peche", "beurre", "rose", "ciel"];

let recettesCache = null;        // liste des recettes du carnet ouvert, gardée en mémoire
let carnets = [];                // carnets que je possède ou qu'on m'a partagés
let carnetsCharges = false;
let carnetId = null;             // carnet ouvert
const carnet = () => carnets.find((c) => c.id === carnetId);
const recettesCol = () => collection(db, "carnets", carnetId, "recettes");
const nomCarnet = () => carnet()?.name || TITRE;
const photosCache = new Map();   // id de photo -> image (data URL)
let recherche = "";
let intercalaire = "";           // intercalaire ouvert ("" = toutes les recettes)
let scrollAccueil = 0;

/* ---------- Intercalaires ----------
   Ceux proposés d'office ; on peut en créer d'autres depuis une recette. */
const INTERCALAIRES = ["Sucré", "Salé", "Entrée", "Plat", "Dessert", "Protéiné", "Diet", "Apéro", "Petit-déj"];
const categoriesDe = (r) => (Array.isArray(r?.categories) ? r.categories : []);
// les intercalaires du carnet : ceux d'office, puis ceux créés (dans l'ordre d'apparition)
function intercalairesDu(recettes) {
  const liste = [...INTERCALAIRES];
  const vus = new Set(liste.map((n) => sansAccents(n)));
  recettes.forEach((r) => categoriesDe(r).forEach((c) => {
    if (!vus.has(sansAccents(c))) { vus.add(sansAccents(c)); liste.push(c); }
  }));
  return liste;
}
// nom propre : sans espaces en trop, majuscule au début, et l'écriture d'office si elle existe
function nomIntercalaire(brut, existants = INTERCALAIRES) {
  const t = String(brut || "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!t) return "";
  const deja = existants.find((n) => sansAccents(n) === sansAccents(t));
  return deja || t.charAt(0).toUpperCase() + t.slice(1);
}
const couleurIntercalaire = (i) => `c-${PASTELS[i % PASTELS.length]}`;
let wakeLock = null;
let toucheEchap = null;          // action de la touche Échap sur la page en cours

/* =========================================================
   Utilitaires
   ========================================================= */

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sansAccents = (s = "") => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Chaque recette garde toujours la même couleur pastel
function pastelDe(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `c-${PASTELS[h % PASTELS.length]}`;
}

const icones = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  retour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  loupe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  croix: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  coche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  poubelle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  crayon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  lien: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};

function toast(message) {
  const el = $id("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

// aller("recette/abc") ouvre une page du carnet ; aller("") revient au carnet
function aller(chemin, options) {
  outils.aller(chemin, options);
}
// adresse d'un lien vers une page du carnet
const lien = (chemin) => outils.lien(chemin);

function urlValide(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function libelleSource(url) {
  const u = urlValide(url);
  if (!u) return null;
  const hote = u.hostname.replace(/^www\./, "");
  if (hote.endsWith("instagram.com")) return "Voir la publication Instagram";
  if (hote.endsWith("tiktok.com")) return "Voir la vidéo TikTok";
  if (hote.endsWith("youtube.com") || hote === "youtu.be") return "Voir la vidéo YouTube";
  if (hote.includes("pinterest.")) return "Voir sur Pinterest";
  return `Voir la recette sur ${hote}`;
}

// Nettoie les lignes collées depuis Insta ou un site ("- ", "• ", "1. ", "Étape 2 :")
function lignes(texte, { numeros = false } = {}) {
  return texte
    .split("\n")
    .map((l) => {
      let s = l.trim().replace(/^[-•*–·]\s+/, "");
      if (numeros) s = s.replace(/^(?:étape|etape)\s*\d+\s*[:.\-–]?\s*/i, "").replace(/^\d+\s*[.)]\s+/, "");
      return s.trim();
    })
    .filter(Boolean);
}

/* ---------- Photos ----------
   Les photos sont stockées directement dans Firestore (en texte "data URL"),
   ce qui évite Cloud Storage, devenu payant (plan Blaze obligatoire).
   Un document Firestore est limité à 1 Mo, donc on réduit chaque photo. */

function chargerImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = source instanceof Blob ? URL.createObjectURL(source) : source;
    img.onload = () => {
      if (source instanceof Blob) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (source instanceof Blob) URL.revokeObjectURL(url);
      const nom = source.name ? `« ${source.name} » ` : "";
      reject(new Error(`La photo ${nom}n'a pas pu être lue. Essaie avec un fichier JPEG ou PNG`));
    };
    img.src = url;
  });
}

function redimensionner(img, tailleMax, qualite) {
  const ratio = Math.min(1, tailleMax / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", qualite);
}

async function preparerPhoto(source) {
  const img = await chargerImage(source);
  // on essaie la meilleure qualité qui tient sous ~750 Ko
  for (const [taille, qualite] of [[1400, 0.8], [1200, 0.72], [1000, 0.65], [800, 0.6]]) {
    const data = redimensionner(img, taille, qualite);
    if (data.length < 750_000) return data;
  }
  return redimensionner(img, 640, 0.55);
}

async function preparerMiniature(source) {
  return redimensionner(await chargerImage(source), 480, 0.72);
}

/* =========================================================
   Données Firestore
   recettes/{id}                  titre, ingredients[], etapes[], source, notes,
                                  photos[] (ids dans l'ordre), miniature, creeLe, modifieLe
   recettes/{id}/photos/{photoId} data
   ========================================================= */

const requeteRecettes = () => query(recettesCol(), orderBy("creeLe", "desc"));
const versListe = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const empreinte = (liste) => JSON.stringify(liste.map((r) => [r.id, r.modifieLe?.seconds ?? 0, r.miniature?.length ?? 0]));

async function chargerRecettes({ forcer = false } = {}) {
  if (recettesCache && !forcer) return recettesCache;
  if (!forcer) {
    // 1. affichage immédiat avec les recettes gardées sur le téléphone
    try {
      const enCache = await getDocsFromCache(requeteRecettes());
      if (!enCache.empty) {
        recettesCache = versListe(enCache);
        actualiserEnArrierePlan();
        return recettesCache;
      }
    } catch { /* rien en cache : on passe par le serveur */ }
  }
  // 2. sinon (première ouverture), on attend le serveur
  recettesCache = versListe(await getDocs(requeteRecettes()));
  return recettesCache;
}

// Récupère la version à jour ; ne réaffiche le carnet que si quelque chose a changé
// et si on est toujours sur l'accueil sans être en train de chercher ou sélectionner.
function actualiserEnArrierePlan() {
  const pour = carnetId;
  getDocsFromServer(requeteRecettes())
    .then((snap) => {
      if (pour !== carnetId) return;
      const fraiches = versListe(snap);
      if (empreinte(fraiches) === empreinte(recettesCache || [])) return;
      recettesCache = fraiches;
      const surAccueil = !cheminCourant;
      const occupe = document.activeElement?.id === "recherche" || racine.querySelector(".en-selection");
      if (surAccueil && !occupe) {
        if (outils.visible()) scrollAccueil = window.scrollY;
        route();
      }
    })
    .catch(() => {});
}

async function chargerRecette(id) {
  const trouvee = recettesCache?.find((r) => r.id === id);
  if (trouvee) return trouvee;
  const snap = await getDoc(doc(recettesCol(), id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function chargerPhotos(recette) {
  const manquantes = recette.photos.filter((id) => !photosCache.has(id));
  if (manquantes.length) {
    const snap = await getDocs(collection(recettesCol(), recette.id, "photos"));
    snap.forEach((d) => photosCache.set(d.id, d.data().data));
  }
  return recette.photos.map((id) => ({ id, data: photosCache.get(id) })).filter((p) => p.data);
}

// Supprime une ou plusieurs recettes avec leurs photos
async function supprimerRecettes(liste, progression = () => {}) {
  if (!navigator.onLine) throw new Error("Pas de connexion internet : impossible de supprimer pour l'instant");
  let i = 0;
  for (const r of liste) {
    progression(++i, liste.length);
    const ref = doc(recettesCol(), r.id);
    const photosSnap = await getDocs(collection(ref, "photos"));
    const batch = writeBatch(db);
    photosSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    (r.photos || []).forEach((pid) => photosCache.delete(pid));
    if (recettesCache) recettesCache = recettesCache.filter((x) => x.id !== r.id);
  }
}


/* =========================================================
   Carnets (partagés comme les listes et les stocks)
   ========================================================= */

const MEMO_CARNET = "carnet-courant";
const lireMemo = () => { try { return localStorage.getItem(MEMO_CARNET); } catch { return null; } };
const ecrireMemo = (v) => { try { localStorage.setItem(MEMO_CARNET, v); } catch {} };

// Choix du carnet + bouton de partage, sous le titre
function outilsCarnet() {
  return `<div class="carnet-outils">
      <select id="choix-carnet" aria-label="Choisir le carnet">
        ${carnets.map((c) => `<option value="${esc(c.id)}" ${c.id === carnetId ? "selected" : ""}>${esc(c.name)}${c.ownerId !== compte.uid ? " (partagé)" : ""}</option>`).join("")}
        <option value="__nouveau">+ Nouveau carnet…</option>
      </select>
      <button type="button" class="btn btn-clair" id="partager-carnet">👥 Partager</button>
      ${carnet()?.ownerId === compte.uid ? `<button type="button" class="btn btn-clair btn-icone" id="renommer-carnet" title="Renommer ce carnet" aria-label="Renommer ce carnet">${icones.crayon}</button>` : ""}
      ${boutonSupprimerCarnet()}
    </div>`;
}

// « Supprimer » si le carnet est à moi, « Quitter » s'il m'a été partagé
function boutonSupprimerCarnet() {
  const c = carnet();
  if (!c) return "";
  const mien = c.ownerId === compte.uid;
  const titre = mien ? "Supprimer ce carnet" : "Quitter ce carnet (il est partagé avec toi)";
  return `<button type="button" class="btn btn-clair btn-icone" id="supprimer-carnet" title="${esc(titre)}" aria-label="${esc(titre)}">${mien ? icones.poubelle : "🚪"}</button>`;
}

function brancherOutilsCarnet() {
  brancherChoix();
  $id("renommer-carnet")?.addEventListener("click", () => {
    renommerPartage({ collection: "carnets", partage: carnet(), quoi: "ce carnet" });
  });
  $id("supprimer-carnet")?.addEventListener("click", () => {
    supprimerOuQuitter({ collection: "carnets", partage: carnet(), quoi: "ce carnet", supprimerContenu: viderCarnet });
  });
  $id("partager-carnet")?.addEventListener("click", () => {
    if (!carnetId) return;
    ouvrirAcces({ collection: "carnets", id: carnetId, quoi: "ce carnet", supprimerContenu: viderCarnet });
  });
}

function brancherChoix() {
  const choix = $id("choix-carnet");
  choix?.addEventListener("change", () => {
    if (choix.value === "__nouveau") { choix.value = carnetId || ""; nouveauCarnet(); return; }
    changerCarnet(choix.value);
  });
}

function changerCarnet(id) {
  if (id === carnetId) return;
  carnetId = id;
  affiche("carnets", id);   // pour le petit rond « nouveau » du dock
  if (id) ecrireMemo(id);
  recettesCache = null;
  recherche = "";
  intercalaire = "";
  scrollAccueil = 0;
  if (cheminCourant) aller("", { remplacer: true }); else route();
}

function nouveauCarnet() {
  const f = ouvrirFeuille({ titre: "Nouveau carnet de recettes" });
  f.corps.innerHTML = `<form class="ligne-form" autocomplete="off">
      <label class="champ"><span>Nom</span><input name="nom" maxlength="60" required placeholder="Ex. Recettes de famille"></label>
      <button class="bouton principal" type="submit">Créer</button></form>
    <p class="muet petit">Ensuite, « Partager » pour choisir qui peut le voir et ajouter des recettes.</p>`;
  const input = f.corps.querySelector("input"); input.focus();
  f.corps.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nom = input.value.trim(); if (!nom) return;
    f.fermer();
    await creerCarnet(nom);
  });
}

async function creerCarnet(nom) {
  try {
    // (la promesse se termine quand le carnet est bien enregistré sur le serveur)
    const id = await creerPartage("carnets", { name: nom });
    ecrireMemo(id);
    if (carnets.some((c) => c.id === id)) changerCarnet(id);
    else carnetVoulu = id;   // il s'ouvrira dès qu'il arrive par l'écoute
    toastSite(`Carnet « ${nom} » créé.`);
  } catch (e) { console.error(e); toastSite("Création impossible. Réessaie."); }
}
let carnetVoulu = null;

// Supprime toutes les recettes (et leurs photos) d'un carnet
async function viderCarnet(id) {
  const recettes = await getDocs(collection(db, "carnets", id, "recettes"));
  for (const r of recettes.docs) {
    const photos = await getDocs(collection(r.ref, "photos"));
    const lot = writeBatch(db);
    photos.forEach((p) => lot.delete(p.ref));
    lot.delete(r.ref);
    await lot.commit();
  }
}

// Pas encore de carnet
function pageSansCarnet() {
  outils.titre("Recettes");
  app.innerHTML = `
    <header class="entete seyes avec-marge">
      <div class="entete-inner"><h1 class="titre-carnet">Recettes</h1></div>
    </header>
    <main class="page">
      <div class="vide seyes avec-marge">
        <p>Tu n'as pas encore de carnet.<br>Crée le tien pour y ranger tes recettes.</p>
        <button type="button" class="btn" id="creer-carnet">${icones.plus}<span>Créer mon carnet</span></button>
        <p class="muet petit-texte">Si quelqu'un t'a partagé son carnet, il apparaîtra ici tout seul.</p>
      </div>
    </main>`;
  $id("creer-carnet").addEventListener("click", (e) => { e.currentTarget.disabled = true; creerCarnet("Les recettes de Jenigger"); });
}

/* =========================================================
   Routeur (page interne d'après cheminCourant)
   ========================================================= */

async function route() {
  libererEcran();
  toucheEchap = null;
  const parties = cheminCourant.split("/").filter(Boolean);
  if (!carnetsCharges) { app.innerHTML = `<p class="chargement">Ouverture du carnet…</p>`; return; }
  if (!carnetId) return pageSansCarnet();
  try {
    if (parties.length === 0) return await pageAccueil();
    if (parties[0] === "recette" && parties[1]) return await pageRecette(parties[1]);
    if (parties[0] === "ajouter") return await pageFormulaire();
    if (parties[0] === "modifier" && parties[1]) return await pageFormulaire(parties[1]);
    aller("", { remplacer: true });
  } catch (err) {
    console.error(err);
    pageErreur(err);
  }
}

/* =========================================================
   Pages
   ========================================================= */

async function pageAccueil() {
  outils.titre(nomCarnet());
  if (!recettesCache) app.innerHTML = `<p class="chargement">Ouverture du carnet…</p>`;
  const recettes = await chargerRecettes();

  app.innerHTML = `
    <header class="entete seyes avec-marge">
      <div class="entete-inner">
        <h1 class="titre-carnet">${esc(nomCarnet())}</h1>
        <a class="btn" href="${lien("ajouter")}">${icones.plus}<span>Ajouter</span></a>
      </div>
      ${outilsCarnet()}
    </header>
    <main class="page" id="page">
      ${
        recettes.length === 0
          ? `<div class="vide seyes avec-marge">
               <p>Le carnet est encore vide.<br>Ajoute ta première recette.</p>
               <a class="btn" href="${lien("ajouter")}">${icones.plus}<span>Ajouter une recette</span></a>
             </div>`
          : `<label class="recherche">
               ${icones.loupe}
               <span class="sr-only">Rechercher</span>
               <input id="recherche" type="search" placeholder="Une recette, un ingrédient…" value="${esc(recherche)}" autocomplete="off">
             </label>
             <nav class="intercalaires" id="intercalaires" aria-label="Intercalaires"></nav>
             <div class="classeur" id="classeur">
               <div class="ligne-compteur">
                 <p class="compteur" id="compteur" aria-live="polite"></p>
                 <button type="button" class="lien" id="btn-selectionner">Sélectionner</button>
               </div>
               <ul class="grille" id="grille"></ul>
             </div>`
      }
    </main>
    <div class="barre-bas barre-selection" id="barre-selection" hidden>
      <div class="barre-bas-inner">
        <button type="button" class="btn btn-clair" id="annuler-selection">Annuler</button>
        <button type="button" class="btn btn-clair" id="ranger-selection" disabled>🔖 <span>Ranger</span></button>
        <button type="button" class="btn btn-supprimer" id="supprimer-selection" disabled>${icones.poubelle}<span id="texte-supprimer">Supprimer</span></button>
      </div>
    </div>`;

  brancherOutilsCarnet();
  if (recettes.length === 0) return;

  const page = $id("page");
  const grille = $id("grille");
  const compteur = $id("compteur");
  const champ = $id("recherche");
  const barre = $id("barre-selection");
  const btnSelectionner = $id("btn-selectionner");
  const btnAnnuler = $id("annuler-selection");
  const btnSupprimer = $id("supprimer-selection");
  const texteSupprimer = $id("texte-supprimer");
  const btnRanger = $id("ranger-selection");
  const zoneOnglets = $id("intercalaires");
  const classeur = $id("classeur");
  if (intercalaire && !intercalairesDu(recettes).includes(intercalaire)) intercalaire = "";

  const selection = new Set();
  let modeSelection = false;
  let nbAffichees = recettes.length;

  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  const majCompteur = () => {
    if (modeSelection) {
      compteur.textContent = selection.size
        ? `${pluriel(selection.size, "recette")} sélectionnée${selection.size > 1 ? "s" : ""}`
        : "Touche les recettes à supprimer";
    } else if (recherche.trim()) {
      compteur.textContent = `${pluriel(nbAffichees, "recette")} trouvée${nbAffichees > 1 ? "s" : ""}${intercalaire ? ` dans « ${intercalaire} »` : ""}`;
    } else {
      compteur.textContent = pluriel(nbAffichees, "recette");
    }
  };

  const majSelection = () => {
    page.classList.toggle("en-selection", modeSelection);
    barre.hidden = !modeSelection;
    btnSelectionner.hidden = modeSelection;
    btnSupprimer.disabled = selection.size === 0;
    btnRanger.disabled = selection.size === 0;
    texteSupprimer.textContent = selection.size ? `Supprimer (${selection.size})` : "Supprimer";
    grille.querySelectorAll(".fiche").forEach((el) => {
      const choisie = selection.has(el.dataset.id);
      el.classList.toggle("est-selectionnee", choisie);
      el.querySelector(".etat-selection").textContent = modeSelection ? (choisie ? ", sélectionnée" : ", non sélectionnée") : "";
    });
    majCompteur();
  };

  const entrerSelection = (id) => {
    modeSelection = true;
    if (id) selection.add(id);
    navigator.vibrate?.(15); // petite vibration sur Android
    majSelection();
  };

  const quitterSelection = () => {
    modeSelection = false;
    selection.clear();
    majSelection();
  };
  toucheEchap = () => modeSelection && quitterSelection();

  // les onglets du classeur : « Toutes » puis un par intercalaire, avec leur nombre de recettes
  const dessinerOnglets = () => {
    const noms = intercalairesDu(recettes);
    const nb = (n) => recettes.filter((r) => categoriesDe(r).includes(n)).length;
    const onglet = (nom, libelle, n, couleur) => `
      <button type="button" class="onglet ${couleur} ${intercalaire === nom ? "actif" : ""} ${n ? "" : "vide"}" data-onglet="${esc(nom)}" aria-pressed="${intercalaire === nom}">
        <span>${esc(libelle)}</span><small>${n}</small>
      </button>`;
    zoneOnglets.innerHTML = onglet("", "Toutes", recettes.length, "c-lavande") + noms.map((n, i) => onglet(n, n, nb(n), couleurIntercalaire(i + 1))).join("");
    const actif = zoneOnglets.querySelector(".onglet.actif");
    classeur.className = `classeur ${actif ? [...actif.classList].find((c) => c.startsWith("c-")) : "c-lavande"}`;
  };
  zoneOnglets.addEventListener("click", (e) => {
    const b = e.target.closest("[data-onglet]");
    if (!b) return;
    intercalaire = b.dataset.onglet;
    afficher();
    b.scrollIntoView?.({ inline: "nearest", block: "nearest", behavior: "smooth" });
  });

  const afficher = () => {
    const q = sansAccents(recherche.trim());
    let liste = intercalaire ? recettes.filter((r) => categoriesDe(r).includes(intercalaire)) : recettes;
    if (q) liste = liste.filter((r) => sansAccents([r.titre, ...r.ingredients].join(" ")).includes(q));
    nbAffichees = liste.length;
    dessinerOnglets();

    grille.innerHTML = liste
      .map(
        (r) => `
        <li>
          <a class="fiche ${pastelDe(r.id)}" href="${lien(`recette/${r.id}`)}" data-id="${r.id}" draggable="false">
            <div class="fiche-visuel">
              ${
                r.miniature
                  ? `<img class="fiche-photo" src="${esc(r.miniature)}" alt="" loading="lazy" draggable="false">`
                  : `<div class="fiche-vide seyes" aria-hidden="true">${esc(r.titre.trim().charAt(0).toUpperCase())}</div>`
              }
              <span class="fiche-coche" aria-hidden="true">${icones.coche}</span>
            </div>
            <h2 class="fiche-titre">${esc(r.titre)}<span class="sr-only etat-selection"></span></h2>
          </a>
        </li>`
      )
      .join("") || (intercalaire && !q
        ? `<li class="grille-vide">Aucune recette dans « ${esc(intercalaire)} » pour l'instant.<br>
             Pour en ranger : <b>Sélectionner</b> des recettes puis <b>🔖 Ranger</b>, ou <b>Modifier</b> une recette.</li>`
        : q ? `<li class="grille-vide">Aucune recette trouvée${intercalaire ? ` dans « ${esc(intercalaire)} »` : ""}.</li>` : "");
    majSelection();
  };

  /* ---- appui long pour sélectionner (téléphone) ---- */
  let appui = null;          // { minuteur, x, y }
  let ignorerClic = false;   // le clic qui suit un appui long ne doit pas ouvrir la recette
  let dernierAppuiLong = 0;

  const appuiLong = (id) => {
    dernierAppuiLong = Date.now();
    ignorerClic = true;
    if (!modeSelection) entrerSelection(id);
    else {
      selection.add(id);
      majSelection();
    }
  };
  const annulerAppui = () => {
    if (appui) clearTimeout(appui.minuteur);
    appui = null;
  };

  grille.addEventListener("pointerdown", (e) => {
    ignorerClic = false;
    const fiche = e.target.closest(".fiche");
    if (!fiche || e.button !== 0) return;
    annulerAppui();
    appui = {
      x: e.clientX,
      y: e.clientY,
      minuteur: setTimeout(() => {
        appui = null;
        appuiLong(fiche.dataset.id);
      }, 450),
    };
  });
  grille.addEventListener("pointermove", (e) => {
    if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10) annulerAppui(); // elle fait défiler
  });
  grille.addEventListener("pointerup", annulerAppui);
  grille.addEventListener("pointercancel", annulerAppui);

  // Android (appui long) et clic droit sur ordinateur : pas de menu, on sélectionne
  grille.addEventListener("contextmenu", (e) => {
    const fiche = e.target.closest(".fiche");
    if (!fiche) return;
    e.preventDefault();
    if (Date.now() - dernierAppuiLong > 1000) {
      annulerAppui();
      appuiLong(fiche.dataset.id);
    }
  });

  grille.addEventListener("click", (e) => {
    const fiche = e.target.closest(".fiche");
    if (!fiche) return;
    if (ignorerClic) {
      e.preventDefault();
      ignorerClic = false;
      return;
    }
    if (modeSelection) {
      e.preventDefault();
      const id = fiche.dataset.id;
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
      majSelection();
      return;
    }
    scrollAccueil = window.scrollY;
  });

  btnSelectionner.addEventListener("click", () => entrerSelection());

  // Ranger les recettes sélectionnées dans des intercalaires
  btnRanger.addEventListener("click", () => {
    const choisies = recettes.filter((r) => selection.has(r.id));
    if (!choisies.length) return;
    let ecritures = Promise.resolve();
    const f = ouvrirFeuille({
      titre: choisies.length === 1 ? `Ranger « ${choisies[0].titre} »` : `Ranger ${choisies.length} recettes`,
      quandFerme: () => ecritures.then(() => { quitterSelection(); afficher(); }),
    });
    const dessiner = () => {
      const noms = intercalairesDu(recettes);
      f.corps.innerHTML = `<div class="ranger-feuille">
          <p class="muet petit">Touche un intercalaire pour y ranger ${choisies.length > 1 ? "ces recettes" : "la recette"} (ou l'en retirer). Une recette peut être dans plusieurs.</p>
          <div class="puces-intercalaires">${noms.map((n) => {
            const dans = choisies.filter((r) => categoriesDe(r).includes(n)).length;
            const etat = dans === choisies.length ? "tout" : dans ? "partiel" : "";
            return `<button type="button" class="puce-intercalaire ${etat}" data-ranger="${esc(n)}" aria-pressed="${etat === "tout"}">${etat === "tout" ? "✓ " : etat ? "– " : ""}${esc(n)}</button>`;
          }).join("")}</div>
          <form class="nouvel-intercalaire" autocomplete="off">
            <input name="nom" maxlength="24" placeholder="Nouvel intercalaire (ex. Végé)" aria-label="Nouvel intercalaire">
            <button type="submit" class="bouton">Ajouter</button>
          </form>
          <button type="button" class="bouton principal large" data-fini>Terminé</button>
        </div>`;
    };
    const ranger = (nom, mettre) => {
      choisies.forEach((r) => {
        const avant = categoriesDe(r);
        r.categories = mettre ? (avant.includes(nom) ? avant : [...avant, nom].slice(0, 12)) : avant.filter((c) => c !== nom);
      });
      dessiner();
      // enregistrement en lot (les écritures se suivent, dans l'ordre)
      const lot = choisies.map((r) => [r.id, [...r.categories]]);
      ecritures = ecritures.then(async () => {
        const batch = writeBatch(db);
        lot.forEach(([id, cats]) => batch.update(doc(recettesCol(), id), { categories: cats, modifieLe: serverTimestamp() }));
        await batch.commit();
      }).catch((err) => { console.error(err); toast("Le rangement n'a pas pu être enregistré. Réessaie."); });
    };
    f.corps.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ranger]");
      if (b) ranger(b.dataset.ranger, !b.classList.contains("tout"));
      if (e.target.closest("[data-fini]")) f.fermer();
    });
    f.corps.addEventListener("submit", (e) => {
      e.preventDefault();
      const nom = nomIntercalaire(e.target.nom.value, intercalairesDu(recettes));
      if (nom) ranger(nom, true);
    });
    dessiner();
  });
  btnAnnuler.addEventListener("click", quitterSelection);

  btnSupprimer.addEventListener("click", async () => {
    const choisies = recettes.filter((r) => selection.has(r.id));
    if (!choisies.length) return;
    const question = choisies.length === 1 ? `Supprimer « ${choisies[0].titre} » ?` : `Supprimer ces ${choisies.length} recettes ?`;
    if (!confirm(`${question} Cette action est définitive.`)) return;

    btnSupprimer.disabled = true;
    btnAnnuler.disabled = true;
    scrollAccueil = window.scrollY;
    try {
      await supprimerRecettes(choisies, (i, n) => {
        texteSupprimer.textContent = n > 1 ? `Suppression ${i}/${n}…` : "Suppression…";
      });
      toast(choisies.length === 1 ? "Recette supprimée" : `${choisies.length} recettes supprimées`);
    } catch (err) {
      console.error(err);
      toast(err.message.startsWith("Pas de connexion") ? err.message : "La suppression n'a pas pu aller jusqu'au bout. Réessaie.");
    }
    route(); // réaffiche le carnet à jour
  });

  champ.addEventListener("input", () => {
    recherche = champ.value;
    afficher();
  });

  afficher();
  requestAnimationFrame(() => outils.defiler(scrollAccueil));
}

async function pageRecette(id) {
  outils.defiler(0);
  if (!recettesCache) app.innerHTML = `<p class="chargement">Ouverture de la recette…</p>`;
  const r = await chargerRecette(id);
  if (!r) {
    toast("Cette recette n'existe plus.");
    return aller("", { remplacer: true });
  }
  outils.titre(`${r.titre} | ${nomCarnet()}`);

  const couleur = pastelDe(r.id);
  const source = libelleSource(r.source);
  const ecranDispo = "wakeLock" in navigator;

  app.innerHTML = `
    <nav class="barre">
      <a class="retour" href="${lien("")}">${icones.retour}<span>Recettes</span></a>
      <div class="barre-actions">
        <button type="button" class="btn btn-supprimer" id="supprimer-recette">${icones.poubelle}<span class="texte-bouton">Supprimer</span></button>
        <a class="btn btn-clair" href="${lien(`modifier/${r.id}`)}">${icones.crayon}<span class="texte-bouton">Modifier</span></a>
      </div>
    </nav>

    ${
      r.photos.length
        ? `<div class="photos-wrap ${couleur}">
             <div class="photos" id="photos">
               ${r.photos
                 .map((pid, i) => {
                   // la miniature s'affiche tout de suite, la vraie photo arrive juste après
                   const src = photosCache.get(pid) || (i === 0 ? r.miniature : "");
                   return `<img data-photo="${esc(pid)}" ${src ? `src="${esc(src)}"` : ""} alt="${esc(r.titre)}, photo ${i + 1}">`;
                 })
                 .join("")}
             </div>
             ${r.photos.length > 1 ? `<span class="photos-compteur" id="photos-compteur">1 / ${r.photos.length}</span>` : ""}
           </div>`
        : ""
    }

    <header class="titre-bloc seyes avec-marge ${couleur}">
      <div class="titre-bloc-inner">
        <h1 class="titre-recette">${esc(r.titre)}</h1>
        ${categoriesDe(r).length
          ? `<p class="etiquettes">${categoriesDe(r).map((c) => `<a class="etiquette" href="${lien("")}" data-aller-intercalaire="${esc(c)}">🔖 ${esc(c)}</a>`).join("")}</p>`
          : ""}
        ${
          source || ecranDispo
            ? `<div class="actions">
                 ${source ? `<a class="btn" href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">${icones.lien}<span>${esc(source)}</span></a>` : ""}
                 ${
                   ecranDispo
                     ? `<label class="interrupteur">
                          <input type="checkbox" id="ecran">
                          <span class="piste" aria-hidden="true"></span>
                          <span>Garder l'écran allumé</span>
                        </label>`
                     : ""
                 }
               </div>`
            : ""
        }
      </div>
    </header>

    <main class="contenu">
      <section class="ingredients" aria-labelledby="t-ingredients">
        <h2 class="section-titre" id="t-ingredients">Ingrédients</h2>
        ${
          r.ingredients.length
            ? `<ul class="liste-ingredients">
                 ${r.ingredients.map((ing) => {
                   // « — Pour la sauce — » : un sous-titre, pas un ingrédient à cocher
                   const g = ing.match(/^—\s*(.+?)\s*—$/);
                   return g ? `<li class="ing-groupe">${esc(g[1])}</li>` : `<li><label><input type="checkbox"><span>${esc(ing)}</span></label></li>`;
                 }).join("")}
               </ul>`
            : `<p class="muet">Aucun ingrédient noté.</p>`
        }
      </section>

      <section class="preparation" aria-labelledby="t-etapes">
        <h2 class="section-titre" id="t-etapes">Préparation</h2>
        ${
          r.etapes.length
            ? `<ol class="liste-etapes">${r.etapes.map((e) => `<li>${esc(e)}</li>`).join("")}</ol>`
            : `<p class="muet">Aucune étape notée.</p>`
        }
        ${r.notes ? `<aside class="notes"><h3>Notes</h3>${esc(r.notes)}</aside>` : ""}
      </section>
    </main>`;

  $id("supprimer-recette").addEventListener("click", async (e) => {
    if (!confirm(`Supprimer « ${r.titre} » ? Cette action est définitive.`)) return;
    const bouton = e.currentTarget;
    bouton.disabled = true;
    try {
      await supprimerRecettes([r]);
      toast("Recette supprimée");
      aller("", { remplacer: true });
    } catch (err) {
      console.error(err);
      bouton.disabled = false;
      toast(err.message.startsWith("Pas de connexion") ? err.message : "La suppression a échoué. Réessaie.");
    }
  });

  // photos en pleine qualité
  if (r.photos.length) {
    chargerPhotos(r)
      .then((photos) => {
        for (const p of photos) {
          const img = app.querySelector(`img[data-photo="${CSS.escape(p.id)}"]`);
          if (img) img.src = p.data;
        }
      })
      .catch((err) => console.warn("Photos non chargées", err));
  }

  const photosEl = $id("photos");
  const compteurPhotos = $id("photos-compteur");
  if (photosEl && compteurPhotos) {
    photosEl.addEventListener(
      "scroll",
      () => {
        const i = Math.round(photosEl.scrollLeft / photosEl.clientWidth);
        compteurPhotos.textContent = `${i + 1} / ${r.photos.length}`;
      },
      { passive: true }
    );
  }

  const interrupteur = $id("ecran");
  if (interrupteur) {
    interrupteur.addEventListener("change", async () => {
      if (interrupteur.checked) {
        try {
          wakeLock = await navigator.wakeLock.request("screen");
        } catch {
          interrupteur.checked = false;
          toast("Ton navigateur n'a pas autorisé l'écran allumé.");
        }
      } else {
        libererEcran();
      }
    });
  }
}

async function pageFormulaire(id = null) {
  outils.defiler(0);
  let r = null;
  let photos = []; // { id, data } pour les photos enregistrées, { fichier, apercu } pour les nouvelles

  if (id) {
    app.innerHTML = `<p class="chargement">Ouverture de la recette…</p>`;
    r = await chargerRecette(id);
    if (!r) return aller("", { remplacer: true });
    photos = await chargerPhotos(r);
  }
  outils.titre(`${r ? "Modifier" : "Nouvelle recette"} | ${nomCarnet()}`);
  const aSupprimer = [];

  app.innerHTML = `
    <nav class="barre">
      <a class="retour" href="${lien(r ? `recette/${r.id}` : "")}">${icones.retour}<span>Annuler</span></a>
    </nav>

    <form class="form" id="form-recette" novalidate>
      <h1>${r ? "Modifier la recette" : "Nouvelle recette"}</h1>
      <div id="erreur-form"></div>

      <section class="import-auto" aria-labelledby="t-import">
        <p class="import-titre" id="t-import">✨ Remplir automatiquement</p>
        <p class="aide">Depuis une description Instagram (ou d'un site) : les ingrédients et les étapes se rangent tout seuls, tu vérifies ensuite.</p>
        <div class="import-boutons">
          <label class="btn btn-clair import-capture">📷 <span>Depuis une capture</span>
            <input type="file" id="import-fichiers" accept="image/*" multiple>
          </label>
          <button type="button" class="btn btn-clair" id="import-coller">📋 <span>Coller le texte</span></button>
        </div>
        <button type="button" class="lien import-lien" id="traduire-recette" hidden>🌍 Traduire cette recette en français</button>
        <p class="aide import-etat" id="import-etat" aria-live="polite"></p>
      </section>

      <div class="champ">
        <label for="titre">Nom de la recette</label>
        <input id="titre" type="text" required maxlength="200" value="${esc(r?.titre || "")}" placeholder="Tarte aux poireaux">
      </div>

      <div class="champ">
        <span class="label">Intercalaires</span>
        <p class="aide">Où ranger la recette dans le carnet. Tu peux en choisir plusieurs.</p>
        <div class="puces-intercalaires" id="choix-intercalaires"></div>
        <div class="nouvel-intercalaire">
          <input id="nouvel-intercalaire" type="text" maxlength="24" placeholder="Nouvel intercalaire (ex. Végé)" aria-label="Nouvel intercalaire">
          <button type="button" class="btn btn-clair" id="ajouter-intercalaire">Ajouter</button>
        </div>
      </div>

      <div class="champ">
        <span class="label">Photos</span>
        <p class="aide">Touche une photo pour la mettre en couverture.</p>
        <div class="vignettes" id="vignettes"></div>
      </div>

      <div class="champ">
        <label for="ingredients">Ingrédients</label>
        <p class="aide">Un ingrédient par ligne. Pour un sous-titre, écris-le entre tirets : « — Pour la sauce — ».</p>
        <textarea id="ingredients" placeholder="3 poireaux&#10;200 g de crème fraîche&#10;1 pâte brisée">${esc((r?.ingredients || []).join("\n"))}</textarea>
      </div>

      <div class="champ">
        <label for="etapes">Préparation</label>
        <p class="aide">Une étape par ligne. Les numéros sont ajoutés automatiquement.</p>
        <textarea id="etapes" style="min-height:12rem" placeholder="Émincer les poireaux et les faire fondre 15 min.&#10;Mélanger avec la crème et les œufs.">${esc((r?.etapes || []).join("\n"))}</textarea>
      </div>

      <div class="champ">
        <label for="source">Lien d'inspiration</label>
        <p class="aide">Publication Instagram, vidéo, site de recettes…</p>
        <input id="source" type="url" inputmode="url" value="${esc(r?.source || "")}" placeholder="https://www.instagram.com/p/…">
      </div>

      <div class="champ">
        <label for="notes">Notes <span class="muet">(facultatif)</span></label>
        <textarea id="notes" style="min-height:6rem" placeholder="Moins de sucre la prochaine fois">${esc(r?.notes || "")}</textarea>
      </div>

      <div class="barre-enregistrer">
        <div class="barre-enregistrer-inner">
          ${r ? `<button type="button" class="btn btn-danger" id="supprimer">Supprimer</button>` : ""}
          <button type="submit" class="btn" id="enregistrer">Enregistrer la recette</button>
        </div>
      </div>
    </form>`;

  // intercalaires de la recette
  const choisis = new Set(categoriesDe(r));
  const tousIntercalaires = () => {
    const liste = intercalairesDu(recettesCache || []);
    choisis.forEach((c) => { if (!liste.includes(c)) liste.push(c); });
    return liste;
  };
  const zoneIntercalaires = $id("choix-intercalaires");
  const dessinerIntercalaires = () => {
    zoneIntercalaires.innerHTML = tousIntercalaires().map((n) =>
      `<button type="button" class="puce-intercalaire ${choisis.has(n) ? "tout" : ""}" data-choix="${esc(n)}" aria-pressed="${choisis.has(n)}">${choisis.has(n) ? "✓ " : ""}${esc(n)}</button>`).join("");
  };
  dessinerIntercalaires();
  zoneIntercalaires.addEventListener("click", (e) => {
    const b = e.target.closest("[data-choix]");
    if (!b) return;
    const n = b.dataset.choix;
    if (choisis.has(n)) choisis.delete(n); else choisis.add(n);
    dessinerIntercalaires();
  });
  const ajouterIntercalaire = () => {
    const champ = $id("nouvel-intercalaire");
    const nom = nomIntercalaire(champ.value, tousIntercalaires());
    if (!nom) return champ.focus();
    if (choisis.size < 12) choisis.add(nom);
    champ.value = "";
    dessinerIntercalaires();
  };
  $id("ajouter-intercalaire").addEventListener("click", ajouterIntercalaire);
  $id("nouvel-intercalaire").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); ajouterIntercalaire(); }
  });

  /* ---- Remplir automatiquement (capture ou texte collé) ---- */
  const etatImport = $id("import-etat");
  // traduit en français les morceaux d'une recette { titre, ingredients, etapes, portions, nutrition }
  const traduireRecette = async (a, langue, afficher) => {
    a.portions = (a.portions || "")
      .replace(/^makes\s+(\d+(?:\s*-\s*\d+)?)/i, "Pour $1").replace(/^serves\s+(\d+(?:\s*-\s*\d+)?)/i, "Pour $1 personnes")
      .replace(/^(\d+)\s+servings?$/i, "$1 portions");
    const lignes = [a.titre || "", ...a.ingredients, ...a.etapes, ...(a.nutrition ? a.nutrition.split("\n") : []), /^pour\s+\d/i.test(a.portions) ? "" : a.portions];
    const t = await traduireLignes(lignes, langue, (fait, total) => afficher(`Traduction de l'${LANGUES[langue]}… ${fait}/${total}`));
    let k = 0;
    a.titre = t[k++] || a.titre;
    a.ingredients = a.ingredients.map(() => t[k++]);
    a.etapes = a.etapes.map(() => t[k++]);
    if (a.nutrition) a.nutrition = a.nutrition.split("\n").map(() => t[k++]).join("\n");
    if (!/^pour\s+\d/i.test(a.portions)) a.portions = t[k] || a.portions;
    return a;
  };

  const remplirDepuis = async (texte, { traduire = null, afficher = () => {} } = {}) => {
    let a = analyserTexte(texte);
    if (!a.ingredients.length && !a.etapes.length) {
      etatImport.textContent = "Je n'ai reconnu ni ingrédients ni étapes. Vérifie le texte, ou recopie-le dans les champs.";
      return false;
    }
    let noteTraduction = "";
    if (traduire) {
      try { a = await traduireRecette(a, traduire, afficher); noteTraduction = ` (traduit de l'${LANGUES[traduire]})`; }
      catch (err) { console.error(err); noteTraduction = ` — non traduit : ${err.message}`; }
    }
    const completer = (id, liste) => {
      if (!liste.length) return;
      const champ = $id(id);
      const avant = champ.value.trim();
      champ.value = (avant ? avant + "\n" : "") + liste.join("\n");
      champ.classList.add("vient-d-etre-rempli");
      setTimeout(() => champ.classList.remove("vient-d-etre-rempli"), 2500);
    };
    if (a.titre && !$id("titre").value.trim()) { $id("titre").value = a.titre.slice(0, 200); $id("titre").classList.add("vient-d-etre-rempli"); }
    completer("ingredients", a.ingredients);
    completer("etapes", a.etapes);
    const infos = [a.portions, a.nutrition].filter(Boolean).join("\n");
    if (infos && !$id("notes").value.includes(infos)) $id("notes").value = ($id("notes").value.trim() ? $id("notes").value.trim() + "\n" : "") + infos;
    const pluriel = (n, m) => `${n} ${m}${n > 1 ? "s" : ""}`;
    const nbIng = a.ingredients.filter((x) => !/^—.*—$/.test(x)).length;
    etatImport.textContent = `✔ ${pluriel(nbIng, "ingrédient")} et ${pluriel(a.etapes.length, "étape")} ajoutés${noteTraduction} : relis avant d'enregistrer.`;
    toast("Recette remplie : relis avant d'enregistrer");
    majBoutonTraduire();
    $id("ingredients").scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  };
  // fenêtre où l'on voit (et corrige) le texte avant de remplir la recette
  const ouvrirTexte = (texte = "", depuisCapture = false) => {
    const f = ouvrirFeuille({ titre: depuisCapture ? "Texte lu sur la capture" : "Coller la description" });
    f.corps.innerHTML = `<form class="import-feuille" autocomplete="off">
        <p class="muet petit">${depuisCapture
          ? "Corrige si besoin ce qui a été mal lu, puis remplis la recette."
          : "Sur Instagram : appuie longuement sur la description (ou sur le texte d'une capture) › Copier, puis colle ici."}</p>
        <label class="champ"><span>Texte</span><textarea name="texte" rows="10" placeholder="Ingrédients :&#10;200 g de farine&#10;3 œufs&#10;…">${esc(texte)}</textarea></label>
        <label class="import-traduire" hidden><input type="checkbox" name="traduire"><span>🌍 Traduire en français <small></small></span></label>
        <button class="bouton principal large" type="submit">Remplir la recette</button>
      </form>`;
    const form = f.corps.querySelector("form");
    if (!depuisCapture) setTimeout(() => form.texte.focus(), 50);
    // langue du texte : si ce n'est pas du français, on propose (et on coche) la traduction
    const caseTraduire = form.querySelector(".import-traduire");
    let langue = null, coche = null;
    const majLangue = () => {
      langue = detecterLangue(form.texte.value);
      const etrangere = langue && langue !== "fr";
      caseTraduire.hidden = !etrangere;
      if (etrangere) {
        caseTraduire.querySelector("small").textContent = `(texte en ${LANGUES[langue]})`;
        form.traduire.checked = coche ?? true;
      }
    };
    majLangue();
    form.texte.addEventListener("input", majLangue);
    form.traduire.addEventListener("change", () => { coche = form.traduire.checked; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const bouton = form.querySelector("button[type=submit]");
      const traduire = !caseTraduire.hidden && form.traduire.checked ? langue : null;
      bouton.disabled = true;
      const ok = await remplirDepuis(form.texte.value, { traduire, afficher: (m) => { bouton.textContent = m; } });
      bouton.disabled = false; bouton.textContent = "Remplir la recette";
      if (ok) f.fermer();
      else form.insertAdjacentHTML("afterbegin", `<p class="erreur">Je n'ai reconnu ni ingrédients ni étapes dans ce texte.</p>`);
    });
  };
  $id("import-coller").addEventListener("click", () => ouvrirTexte());

  // recette déjà remplie dans une autre langue : on la traduit sur place
  const btnTraduire = $id("traduire-recette");
  const langueDesChamps = () => detecterLangue([$id("titre").value, $id("ingredients").value, $id("etapes").value].join("\n"));
  const majBoutonTraduire = () => { const l = langueDesChamps(); btnTraduire.hidden = !l || l === "fr"; if (!btnTraduire.hidden) btnTraduire.textContent = `🌍 Traduire cette recette de l'${LANGUES[l]} en français`; };
  ["titre", "ingredients", "etapes"].forEach((id) => $id(id).addEventListener("input", majBoutonTraduire));
  majBoutonTraduire();
  btnTraduire.addEventListener("click", async () => {
    const l = langueDesChamps();
    if (!l || l === "fr") return;
    const zone = racine.querySelector(".import-auto");
    zone.classList.add("en-cours"); btnTraduire.disabled = true;
    try {
      const a = await traduireRecette({
        titre: $id("titre").value.trim(), ingredients: lignes($id("ingredients").value), etapes: lignes($id("etapes").value, { numeros: true }),
        portions: "", nutrition: "",
      }, l, (m) => { etatImport.textContent = m; });
      $id("titre").value = a.titre.slice(0, 200);
      $id("ingredients").value = a.ingredients.join("\n");
      $id("etapes").value = a.etapes.join("\n");
      ["titre", "ingredients", "etapes"].forEach((id) => { $id(id).classList.add("vient-d-etre-rempli"); setTimeout(() => $id(id).classList.remove("vient-d-etre-rempli"), 2500); });
      etatImport.textContent = `✔ Recette traduite de l'${LANGUES[l]} : relis avant d'enregistrer.`;
      majBoutonTraduire();
    } catch (err) {
      console.error(err);
      etatImport.textContent = err.message;
    } finally {
      zone.classList.remove("en-cours"); btnTraduire.disabled = false;
    }
  });
  $id("import-fichiers").addEventListener("change", async (e) => {
    const fichiers = [...e.target.files];
    e.target.value = "";
    if (!fichiers.length) return;
    const zone = racine.querySelector(".import-auto");
    zone.classList.add("en-cours");
    try {
      const texte = await lireCaptures(fichiers, (m) => { etatImport.textContent = m; });
      etatImport.textContent = "";
      if (!texte.trim()) etatImport.textContent = "Aucun texte trouvé sur cette image.";
      else ouvrirTexte(texte, true);
    } catch (err) {
      console.error(err);
      etatImport.textContent = err.message || "La lecture de la capture a échoué. Réessaie.";
    } finally {
      zone.classList.remove("en-cours");
    }
  });

  const vignettes = $id("vignettes");
  const zoneErreur = $id("erreur-form");
  const montrerErreur = (message) => {
    zoneErreur.innerHTML = `<p class="erreur">${esc(message)}</p>`;
    outils.defiler(0);
  };

  const dessinerVignettes = () => {
    vignettes.innerHTML =
      photos
        .map(
          (p, i) => `
        <div class="vignette">
          <button type="button" class="couv" data-couv="${i}" aria-label="Mettre la photo ${i + 1} en couverture">
            <img src="${esc(p.apercu || p.data)}" alt="">
          </button>
          ${i === 0 ? `<span class="badge">Couverture</span>` : ""}
          <button type="button" class="retirer" data-retirer="${i}" aria-label="Retirer la photo ${i + 1}">${icones.croix}</button>
        </div>`
        )
        .join("") +
      (photos.length < 12
        ? `<label class="ajout-photo">
             ${icones.photo}
             <span>Ajouter des photos</span>
             <input type="file" id="fichiers" accept="image/*" multiple>
           </label>`
        : "");
  };
  dessinerVignettes();

  vignettes.addEventListener("click", (e) => {
    const retirer = e.target.closest("[data-retirer]");
    const couv = e.target.closest("[data-couv]");
    if (retirer) {
      const [p] = photos.splice(Number(retirer.dataset.retirer), 1);
      if (p.id) aSupprimer.push(p.id);
      if (p.apercu) URL.revokeObjectURL(p.apercu);
      dessinerVignettes();
    } else if (couv && couv.dataset.couv !== "0") {
      const [p] = photos.splice(Number(couv.dataset.couv), 1);
      photos.unshift(p);
      dessinerVignettes();
    }
  });

  vignettes.addEventListener("change", (e) => {
    if (e.target.id !== "fichiers") return;
    for (const fichier of [...e.target.files].slice(0, 12 - photos.length)) {
      photos.push({ fichier, apercu: URL.createObjectURL(fichier) });
    }
    dessinerVignettes();
  });

  if (r) {
    $id("supprimer").addEventListener("click", async () => {
      if (!confirm(`Supprimer « ${r.titre} » ? Cette action est définitive.`)) return;
      try {
        await supprimerRecettes([r]);
        toast("Recette supprimée");
        aller("", { remplacer: true });
      } catch (err) {
        console.error(err);
        montrerErreur(err.message.startsWith("Pas de connexion") ? err.message : `La suppression a échoué (${err.code || err.message}).`);
      }
    });
  }

  $id("form-recette").addEventListener("submit", async (e) => {
    e.preventDefault();
    zoneErreur.innerHTML = "";
    const bouton = $id("enregistrer");
    const titre = $id("titre").value.trim();
    const sourceBrute = $id("source").value.trim();

    if (!titre) {
      montrerErreur("Donne un nom à la recette pour l'enregistrer.");
      return $id("titre").focus();
    }
    if (sourceBrute && !urlValide(sourceBrute)) {
      montrerErreur("Le lien d'inspiration doit commencer par https://");
      return $id("source").focus();
    }
    if (!navigator.onLine) {
      return montrerErreur("Pas de connexion internet : la recette ne peut pas être enregistrée pour l'instant.");
    }

    bouton.disabled = true;
    const ref = r ? doc(recettesCol(), r.id) : doc(recettesCol());
    const envoyees = [];

    try {
      // 1. envoyer les nouvelles photos (un document par photo)
      const nouvelles = photos.filter((p) => p.fichier);
      let n = 0;
      for (const p of nouvelles) {
        bouton.textContent = `Envoi des photos (${++n}/${nouvelles.length})…`;
        const data = await preparerPhoto(p.fichier);
        const photoRef = doc(collection(ref, "photos"));
        await setDoc(photoRef, { data });
        envoyees.push(photoRef);
        photosCache.set(photoRef.id, data);
        p.id = photoRef.id;
        p.data = data;
      }

      // 2. la miniature de couverture (réutilisée si la couverture n'a pas changé)
      bouton.textContent = "Enregistrement…";
      let miniature = null;
      if (photos.length) {
        miniature = r?.miniature && r.photos[0] === photos[0].id ? r.miniature : await preparerMiniature(photos[0].data);
      }

      // 3. la recette
      const donnees = {
        titre,
        ingredients: lignes($id("ingredients").value),
        etapes: lignes($id("etapes").value, { numeros: true }),
        source: sourceBrute || null,
        notes: $id("notes").value.trim() || null,
        categories: [...choisis].slice(0, 12),
        photos: photos.map((p) => p.id),
        miniature,
        modifieLe: serverTimestamp(),
      };
      if (r) await updateDoc(ref, donnees);
      else await setDoc(ref, { ...donnees, creeLe: serverTimestamp() });

      // 4. supprimer les photos retirées
      if (aSupprimer.length) {
        const batch = writeBatch(db);
        aSupprimer.forEach((pid) => {
          batch.delete(doc(ref, "photos", pid));
          photosCache.delete(pid);
        });
        await batch.commit().catch((err) => console.warn("Nettoyage des photos", err));
      }

      photos.forEach((p) => p.apercu && URL.revokeObjectURL(p.apercu));
      await chargerRecettes({ forcer: true });
      toast(r ? "Modifications enregistrées" : "Recette enregistrée");
      aller(`recette/${ref.id}`, { remplacer: true });
    } catch (err) {
      console.error(err);
      // on retire les photos envoyées pour rien
      if (envoyees.length) {
        const batch = writeBatch(db);
        envoyees.forEach((pr) => batch.delete(pr));
        batch.commit().catch(() => {});
      }
      photos.forEach((p) => {
        if (p.fichier) { delete p.id; delete p.data; }
      });
      const detail = err.code === "permission-denied" ? "accès refusé par les règles Firestore" : err.message;
      montrerErreur(`L'enregistrement a échoué : ${detail}.`);
      bouton.disabled = false;
      bouton.textContent = "Enregistrer la recette";
    }
  });
}

function pageErreur(err) {
  if (err.code === "permission-denied") {
    app.innerHTML = `
      <main class="ecran seyes">
        <div class="carte avec-marge">
          <h1>Accès refusé</h1>
          <p>Firestore a bloqué la lecture des recettes. Vérifie que les règles du fichier firestore.rules (à la racine du dépôt) sont bien publiées dans la console Firebase.</p>
          <button class="btn" id="reessayer">Réessayer</button>
        </div>
      </main>`;
    $id("reessayer").addEventListener("click", () => {
      recettesCache = null;
      route();
    });
    return;
  }
  app.innerHTML = `
    <main class="ecran seyes">
      <div class="carte avec-marge">
        <h1>Oups</h1>
        <p>${navigator.onLine ? `Le carnet n'a pas pu se charger (${esc(err.code || err.message || "erreur inconnue")}).` : "Pas de connexion internet. Reconnecte-toi puis réessaie."}</p>
        <button class="btn" id="reessayer">Réessayer</button>
      </div>
    </main>`;
  $id("reessayer").addEventListener("click", () => {
    recettesCache = null;
    route();
  });
}

function libererEcran() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && toucheEchap && outils?.visible()) toucheEchap();
});

// l'écran allumé est coupé quand on change d'appli : on le redemande au retour
document.addEventListener("visibilitychange", async () => {
  if (!racine) return;
  const interrupteur = $id("ecran");
  if (document.visibilityState === "visible" && interrupteur?.checked && outils?.visible()) {
    try { wakeLock = await navigator.wakeLock.request("screen"); } catch {}
  }
});

/* =========================================================
   Démarrage
   ========================================================= */

// Appelée une seule fois par la coquille : prépare le carnet (même caché)
export function demarrer(conteneur, outilsCoquille) {
  racine = conteneur;
  outils = outilsCoquille;
  app = $id("app");
  outils.titre("Recettes");
  // étiquette d'une recette -> ouvre le carnet sur cet intercalaire
  racine.addEventListener("click", (e) => {
    const a = e.target.closest("[data-aller-intercalaire]");
    if (a) { intercalaire = a.dataset.allerIntercalaire; scrollAccueil = 0; }
  });
  route();
  // carnets que je possède ou qu'on m'a partagés (en direct)
  ecouterMesPartages("carnets", (liste) => {
    const premier = !carnetsCharges;
    carnets = liste;
    carnetsCharges = true;
    let cible = carnetId;
    if (carnetVoulu && carnets.some((c) => c.id === carnetVoulu)) { cible = carnetVoulu; carnetVoulu = null; }
    else if (!cible || !carnets.some((c) => c.id === cible)) {
      const memo = lireMemo();
      cible = carnets.some((c) => c.id === memo) ? memo : (carnets[0]?.id || null);
    }
    if (cible !== carnetId) changerCarnet(cible);
    else if (premier) route();
    else if (!cheminCourant) {
      // nom ou partage modifié : on rafraîchit l'en-tête de l'accueil
      const titre = racine.querySelector(".titre-carnet");
      if (titre && carnet()) titre.textContent = carnet().name;
      const choix = $id("choix-carnet");
      if (choix) { choix.outerHTML = outilsCarnet().match(/<select[\s\S]*<\/select>/)[0]; brancherChoix(); }
    }
  }, () => { carnetsCharges = true; app.innerHTML = `<p class="chargement">Les carnets n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; });
}

// À chaque ouverture du carnet ou changement de page interne
export function afficher(chemin = "") {
  cheminCourant = chemin;
  return route();
}

// En quittant le carnet : on rend la main à la mise en veille de l'écran
export function masquer() {
  libererEcran();
  const interrupteur = $id("ecran");
  if (interrupteur) interrupteur.checked = false;
}
