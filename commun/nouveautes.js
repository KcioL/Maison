// ==========================================
// NOUVEAUTÉS : le petit rond à côté du logo de chaque appli
//
// Il n'apparaît que si quelqu'un d'autre a changé quelque chose
// (un article ajouté dans la liste de courses, une recette, un entretien…)
// et disparaît dès qu'on a ouvert l'élément concerné.
//
// Comment ça marche :
//   - chaque écriture dans le contenu d'un élément partagé (listes/{id}/articles/…)
//     met à jour, sur l'élément, le champ  activite: { le, par }   (voir commun/firestore.js) ;
//   - pour chaque compte, vus/{uid} retient la dernière activité vue de chaque élément
//     (sur tous ses appareils) ;
//   - une appli dit quel élément elle affiche :  affiche("listes", id, "courses") ;
//     quand cette appli est à l'écran, l'élément est marqué comme vu.
// ==========================================
import { db } from "./firebase.js";
import { compte } from "./compte.js";
import { ecouterMesPartages } from "./partage.js";
import { doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// collection partagée -> appli qui l'affiche
export const COLLECTIONS = {
    listes: "dashboard", stocks: "stock", carnets: "recettes", programmes: "muscu",
    abonnements: "abonnements", foyers: "loyer", vehicules: "garage"
};

const elements = {};          // collection -> [{ id, ownerId, activite }]
let vus = null;               // { "listes__abc": le } ; null tant que pas chargé
let vusExiste = false;
let arrets = [];
const affiches = new Map();   // "collection|emplacement" -> id
let appliActive = null;
const ecouteurs = new Set();
const cle = (col, id) => `${col}__${id}`;
const refVus = () => doc(db, "vus", compte.uid);

// ---------- Lecture ----------
// L'élément a-t-il du nouveau pour moi ?
export function aDuNouveau(col, el) {
    if (!vus || !el) return false;
    const v = vus[cle(col, el.id)], a = el.activite;
    if (!a) return v === undefined && el.ownerId !== compte.uid;   // tout juste partagé avec moi
    if (a.par === compte.uid) return false;                         // c'est moi qui ai changé
    return v !== a.le;
}
export function nouveauPour(col, id) {
    return aDuNouveau(col, (elements[col] || []).find(x => x.id === id));
}
// { dashboard: true, stock: false, … }
export function etatApplis() {
    const r = {};
    for (const [col, app] of Object.entries(COLLECTIONS)) r[app] = (elements[col] || []).some(x => aDuNouveau(col, x));
    return r;
}
export function surNouveautes(fn) { ecouteurs.add(fn); fn(etatApplis()); return () => ecouteurs.delete(fn); }

// ---------- Ce qu'on regarde ----------
export function affiche(col, id, emplacement = "") {
    const k = `${col}|${emplacement}`;
    if (affiches.get(k) === (id || null)) return;
    if (id) affiches.set(k, id); else affiches.delete(k);
    verifier();
}
export function appliAffichee(id) { appliActive = id; verifier(); }

// Marque comme vu ce que l'appli à l'écran affiche
function verifier() {
    if (vus && document.visibilityState === "visible") {
        const nouveaux = {};
        for (const [k, id] of affiches) {
            const col = k.split("|")[0];
            if (COLLECTIONS[col] !== appliActive) continue;
            const el = (elements[col] || []).find(x => x.id === id);
            if (el && aDuNouveau(col, el)) nouveaux[cle(col, id)] = el.activite?.le ?? 0;
        }
        if (Object.keys(nouveaux).length) {
            Object.assign(vus, nouveaux);
            setDoc(refVus(), { m: nouveaux }, { merge: true }).catch(e => console.warn("vus", e));
        }
    }
    prevenir();
}

let dernierEtat = "";
function prevenir() {
    const e = etatApplis(), s = JSON.stringify(e);
    if (s !== dernierEtat) { dernierEtat = s; ecouteurs.forEach(fn => fn(e)); }
    marquerOptions();
}

// Dans les listes déroulantes (choix de la liste, du carnet…), « ● » devant ce qui a du nouveau
function marquerOptions() {
    const ids = new Set();
    for (const [col, liste] of Object.entries(elements)) liste.forEach(x => { if (aDuNouveau(col, x)) ids.add(x.id); });
    document.querySelectorAll("#vues select option").forEach(o => {
        const avait = o.dataset.nouveau === "1", a = ids.has(o.value);
        if (avait === a) return;
        if (a) { o.dataset.nouveau = "1"; o.textContent = "● " + o.textContent; }
        else { delete o.dataset.nouveau; o.textContent = o.textContent.replace(/^● /, ""); }
    });
}
let attenteOptions = 0;
const observateur = new MutationObserver(() => {
    if (attenteOptions) return;
    attenteOptions = requestAnimationFrame(() => { attenteOptions = 0; marquerOptions(); });
});

// ---------- Démarrage ----------
let attendus = 0;
export function demarrer() {
    arreter();
    if (!compte.uid) return;
    const cols = Object.keys(COLLECTIONS);
    attendus = cols.length;
    const recus = new Set();
    for (const col of cols) {
        arrets.push(ecouterMesPartages(col, (liste) => {
            elements[col] = liste.map(x => ({ id: x.id, ownerId: x.ownerId, activite: x.activite || null }));
            if (!recus.has(col)) { recus.add(col); attendus--; }
            pret();
            verifier();
        }, () => { if (!recus.has(col)) { recus.add(col); attendus--; pret(); } }));
    }
    arrets.push(onSnapshot(refVus(), snap => {
        vusExiste = snap.exists();
        vus = { ...(vus || {}), ...(snap.data()?.m || {}) };
        pret();
        verifier();
    }, e => console.warn("vus", e)));
    const zone = document.getElementById("vues");
    if (zone) observateur.observe(zone, { childList: true, subtree: true });
}

// Première fois (aucun « vu » enregistré) : tout ce qui existe déjà compte comme vu
let initialise = false;
function pret() {
    if (initialise || vus === null || vusExiste || attendus > 0) return;
    initialise = true;
    const m = {};
    for (const [col, liste] of Object.entries(elements)) liste.forEach(x => { m[cle(col, x.id)] = x.activite?.le ?? 0; });
    Object.assign(vus, m);
    setDoc(refVus(), { m }, { merge: true }).catch(e => console.warn("vus", e));
}

export function arreter() {
    arrets.forEach(f => f?.()); arrets = [];
    for (const k of Object.keys(elements)) delete elements[k];
    vus = null; vusExiste = false; initialise = false;
    observateur.disconnect();
    prevenir();
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") verifier(); else viderSignaux(); });

// ---------- Écriture : « il s'est passé quelque chose ici » ----------
// Appelé par commun/firestore.js à chaque ajout / modification dans un élément partagé.
// On regroupe les écritures rapprochées (2 s) en un seul signal.
const enAttente = new Map();   // "col/id" -> minuteur
export function signalerChemin(chemin) {
    const p = String(chemin || "").split("/");
    if (p.length < 3 || !COLLECTIONS[p[0]] || !compte.uid) return;
    const k = `${p[0]}/${p[1]}`;
    clearTimeout(enAttente.get(k));
    enAttente.set(k, setTimeout(() => envoyer(k), 2000));
}
function envoyer(k) {
    enAttente.delete(k);
    const [col, id] = k.split("/");
    const le = Date.now();
    updateDoc(doc(db, col, id), { activite: { le, par: compte.uid } }).catch(() => { /* élément supprimé entre-temps */ });
}
function viderSignaux() {
    for (const [k, t] of enAttente) { clearTimeout(t); envoyer(k); }
}
