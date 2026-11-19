// ==========================================
// MENUS DE LA SEMAINE
// Appli chargée dans la page principale (voir commun/coquille.js).
//
// Pages internes :
//   #/menus              la semaine en cours
//   #/menus/2026-11-23   la semaine qui contient ce jour
//
// Données (partagées comme les listes, par exemple « Menus de la maison ») :
//   menus/{id}                 name, ownerId, memberIds, members…
//   menus/{id}/repas/{id}      date (AAAA-MM-JJ), moment (midi | soir),
//                              titre, carnetId + recetteId (si c'est une recette du carnet),
//                              ingredients [] (copie, ou ce qu'il faut acheter pour un repas sans recette),
//                              note, ordre, creeLe, modifieLe, modifiePar
//
// « Ajouter à la liste de courses » : regroupe les ingrédients des repas de la
// semaine et les ajoute dans une liste de courses du dashboard (listes/{id}/articles).
// ==========================================
import { db } from "../commun/firebase.js";
import { compte } from "../commun/compte.js";
import { selecteurPartage, ecouterAvecReessai } from "../commun/selecteur.js";
import { ecouterMesPartages } from "../commun/partage.js";
import { esc, toast, ouvrirFeuille } from "../commun/ui.js";
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch, query, where, orderBy
} from "../commun/firestore.js";

let racine, outils, zone, sel;
const S = {
    mid: null, lundi: lundiDe(new Date()), repas: [], repasCharges: false, arret: null,
    carnets: [], listes: []
};
const MOMENTS = [["midi", "☀️ Midi"], ["soir", "🌙 Soir"]];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// ---------- Dates (en heure locale) ----------
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function versDate(s) { const [a, m, j] = s.split("-").map(Number); return new Date(a, m - 1, j); }
function lundiDe(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); }
function plusJours(s, n) { const d = versDate(s); d.setDate(d.getDate() + n); return iso(d); }
const joursSemaine = () => Array.from({ length: 7 }, (_, i) => plusJours(S.lundi, i));
const jourCourt = (s) => versDate(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
function titreSemaine() {
    const auj = lundiDe(new Date());
    if (S.lundi === auj) return "Cette semaine";
    if (S.lundi === plusJours(auj, 7)) return "La semaine prochaine";
    if (S.lundi === plusJours(auj, -7)) return "La semaine dernière";
    return `Semaine du ${jourCourt(S.lundi)}`;
}

const repasDuCreneau = (date, moment) => S.repas.filter(r => r.date === date && r.moment === moment)
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
const refRepas = (m = S.mid) => collection(db, "menus", m, "repas");

// ==========================================
// AFFICHAGE
// ==========================================
function rendre() {
    if (!zone) return;
    const entete = `<header><h1 class="titre-logo"><img src="commun/logos/menus-192.png" alt="" width="48" height="48"> Menus</h1></header>`;
    if (!sel.charge()) { zone.innerHTML = entete + `<p class="me-vide chargement">Chargement…</p>`; return; }
    if (!sel.courant()) {
        zone.innerHTML = entete + `<div class="widget me-vide-carte">
            <p class="me-grand">Les menus de la semaine</p>
            <p class="muet">Prévois les repas du midi et du soir, avec tes recettes ou sans, puis envoie tous les ingrédients dans ta liste de courses en un geste.</p>
            <button type="button" class="me-bouton principal" data-action="creer">Commencer mes menus</button>
            <p class="muet petit">Tu pourras les partager, par exemple avec le foyer.</p></div>`;
        return;
    }
    outils.titre(`${titreSemaine()} · Menus`);
    const auj = iso(new Date());
    const nbRepas = S.repas.length, nbIng = ingredientsDeLaSemaine().length;
    zone.innerHTML = entete + sel.barre() + `
        <nav class="me-semaine widget" aria-label="Semaine">
            <a class="me-fleche" href="${outils.lien(plusJours(S.lundi, -7))}" aria-label="Semaine précédente">‹</a>
            <div class="me-semaine-titre">
                <b>${esc(titreSemaine())}</b>
                <span class="muet petit">du ${jourCourt(S.lundi)} au ${jourCourt(plusJours(S.lundi, 6))}</span>
            </div>
            <a class="me-fleche" href="${outils.lien(plusJours(S.lundi, 7))}" aria-label="Semaine suivante">›</a>
        </nav>
        ${S.lundi !== lundiDe(new Date()) ? `<p class="me-retour"><a href="${outils.lien("")}">↩ Revenir à cette semaine</a></p>` : ""}
        <div class="me-courses widget">
            <button type="button" class="me-bouton principal" data-action="courses" ${nbIng ? "" : "disabled"}>🛒 Ajouter les ingrédients aux courses</button>
            <span class="muet petit">${nbRepas ? `${nbRepas} plat${nbRepas > 1 ? "s" : ""} prévu${nbRepas > 1 ? "s" : ""}${nbIng ? ` · ${nbIng} ingrédient${nbIng > 1 ? "s" : ""}` : ""}` : "Touche « + » pour prévoir un repas."}</span>
        </div>
        ${!S.repasCharges ? `<p class="me-vide chargement">Chargement…</p>` : `
        <ol class="me-jours">
            ${joursSemaine().map((d, i) => `<li class="widget me-jour ${d === auj ? "aujourdhui" : ""} ${d < auj ? "passe" : ""}">
                <h2 class="me-jour-titre"><span>${JOURS[i]}</span><small>${jourCourt(d)}${d === auj ? " · aujourd'hui" : ""}</small></h2>
                ${MOMENTS.map(([m, nom]) => `<div class="me-creneau">
                    <span class="me-moment">${nom}</span>
                    <ul class="me-plats">
                        ${repasDuCreneau(d, m).map(r => `<li><button type="button" class="me-plat ${r.recetteId ? "recette" : ""}" data-repas="${esc(r.id)}">
                            ${r.recetteId ? "📖 " : ""}${esc(r.titre)}${r.ingredients?.length ? `<small>${r.ingredients.filter(x => !estSousTitre(x)).length}</small>` : ""}
                        </button></li>`).join("")}
                        <li><button type="button" class="me-ajout" data-ajout="${d}|${m}" aria-label="Ajouter au ${nom.slice(3).toLowerCase()} du ${JOURS[i].toLowerCase()}">+</button></li>
                    </ul>
                </div>`).join("")}
            </li>`).join("")}
        </ol>`}`;
    sel.brancher(zone);
}

// ==========================================
// RECETTES DES CARNETS (lues à la demande)
// ==========================================
let recettesCache = null;   // [{ carnetId, carnet, id, titre, ingredients, miniature }]
async function chargerRecettes(forcer = false) {
    if (recettesCache && !forcer) return recettesCache;
    const toutes = [];
    for (const c of S.carnets) {
        try {
            const snap = await getDocs(query(collection(db, "carnets", c.id, "recettes"), orderBy("creeLe", "desc")));
            snap.forEach(d => {
                const r = d.data();
                toutes.push({ carnetId: c.id, carnet: c.name, id: d.id, titre: r.titre || "Sans titre", ingredients: r.ingredients || [], miniature: r.miniature || null, categories: r.categories || [] });
            });
        } catch (e) { console.warn("carnet", c.id, e); }
    }
    recettesCache = toutes;
    return toutes;
}
const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const estSousTitre = (x) => /^—.*—$/.test(String(x).trim());

// ==========================================
// FICHES
// ==========================================
function ficheAjout(date, moment) {
    const i = joursSemaine().indexOf(date);
    const nomMoment = MOMENTS.find(m => m[0] === moment)[1].slice(3);
    const f = ouvrirFeuille({ titre: `${JOURS[i] || jourCourt(date)} ${nomMoment.toLowerCase()}` });
    let onglet = S.carnets.length ? "recette" : "libre";
    let recherche = "";
    const dessiner = async () => {
        f.corps.innerHTML = `<div class="me-form">
            <div class="me-onglets" role="tablist">
                <button type="button" role="tab" class="me-onglet ${onglet === "recette" ? "actif" : ""}" data-onglet="recette" aria-selected="${onglet === "recette"}">📖 Une recette</button>
                <button type="button" role="tab" class="me-onglet ${onglet === "libre" ? "actif" : ""}" data-onglet="libre" aria-selected="${onglet === "libre"}">✏️ Sans recette</button>
            </div>
            <div class="me-panneau"></div></div>`;
        const p = f.corps.querySelector(".me-panneau");
        if (onglet === "libre") {
            p.innerHTML = `<form class="me-form" autocomplete="off">
                <label class="champ"><span>Au menu</span><input name="titre" maxlength="120" required placeholder="Ex. Restes, Pizza, Resto…"></label>
                <label class="champ"><span>À acheter (facultatif, un par ligne)</span><textarea name="ingredients" rows="4" placeholder="1 pâte à pizza&#10;200 g de mozzarella"></textarea></label>
                <button class="bouton principal large" type="submit">Ajouter au menu</button></form>`;
            const form = p.querySelector("form");
            setTimeout(() => form.titre.focus(), 50);
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const titre = form.titre.value.trim(); if (!titre) return;
                f.fermer();
                ajouterRepas({ date, moment, titre, ingredients: lignes(form.ingredients.value) });
            });
            return;
        }
        if (!S.carnets.length) { p.innerHTML = `<p class="muet">Tu n'as pas encore de carnet de recettes. Ajoute un repas « Sans recette », ou crée des recettes dans l'appli Recettes.</p>`; return; }
        p.innerHTML = `<label class="me-recherche"><span class="sr-only">Rechercher une recette</span>
                <input type="search" placeholder="🔍 Une recette, un ingrédient…" value="${esc(recherche)}" autocomplete="off"></label>
            <ul class="me-recettes"><li class="muet petit">Chargement des recettes…</li></ul>`;
        const champ = p.querySelector("input"), ul = p.querySelector("ul");
        const lister = (toutes) => {
            const q = sansAccents(recherche.trim());
            const liste = q ? toutes.filter(r => sansAccents([r.titre, ...r.ingredients, ...r.categories].join(" ")).includes(q)) : toutes;
            ul.innerHTML = liste.length ? liste.slice(0, 80).map(r => `<li><button type="button" class="me-recette" data-recette="${esc(r.carnetId)}|${esc(r.id)}">
                    ${r.miniature ? `<img src="${esc(r.miniature)}" alt="" loading="lazy">` : `<span class="me-recette-vide" aria-hidden="true">${esc(r.titre.charAt(0).toUpperCase())}</span>`}
                    <span class="me-recette-txt"><b>${esc(r.titre)}</b><small>${esc(S.carnets.length > 1 ? r.carnet + " · " : "")}${r.ingredients.filter(x => !estSousTitre(x)).length} ingrédients</small></span>
                </button></li>`).join("")
                : `<li class="muet petit">${toutes.length ? "Aucune recette trouvée." : "Tes carnets sont encore vides."} Tu peux ajouter un repas « Sans recette ».</li>`;
        };
        chargerRecettes().then(lister);
        champ.addEventListener("input", () => { recherche = champ.value; if (recettesCache) lister(recettesCache); });
        setTimeout(() => { if (matchMedia("(pointer: fine)").matches) champ.focus(); }, 50);
    };
    f.corps.addEventListener("click", (e) => {
        const o = e.target.closest("[data-onglet]");
        if (o) { onglet = o.dataset.onglet; dessiner(); return; }
        const b = e.target.closest("[data-recette]");
        if (b) {
            const [carnetId, recetteId] = b.dataset.recette.split("|");
            const r = recettesCache?.find(x => x.carnetId === carnetId && x.id === recetteId); if (!r) return;
            f.fermer();
            ajouterRepas({ date, moment, titre: r.titre, carnetId, recetteId, ingredients: r.ingredients });
        }
    });
    dessiner();
}

function ficheRepas(r) {
    const f = ouvrirFeuille({ titre: r.titre });
    const jours = joursSemaine();
    f.corps.innerHTML = `<form class="me-form" autocomplete="off">
        ${r.recetteId ? `<p class="me-info">📖 Recette du carnet${S.carnets.find(c => c.id === r.carnetId) ? ` « ${esc(S.carnets.find(c => c.id === r.carnetId).name)} »` : ""}. Les ingrédients sont repris de la recette au moment des courses.</p>` : ""}
        <label class="champ"><span>Au menu</span><input name="titre" maxlength="120" required value="${esc(r.titre)}"></label>
        <div class="me-form2">
            <label class="champ"><span>Jour</span><select name="date">
                ${(jours.includes(r.date) ? jours : [r.date, ...jours]).map((d) => `<option value="${d}" ${d === r.date ? "selected" : ""}>${esc(JOURS[jours.indexOf(d)] || "")} ${jourCourt(d)}</option>`).join("")}
            </select></label>
            <label class="champ"><span>Repas</span><select name="moment">
                ${MOMENTS.map(([m, n]) => `<option value="${m}" ${m === r.moment ? "selected" : ""}>${n.slice(3)}</option>`).join("")}
            </select></label>
        </div>
        ${r.recetteId ? "" : `<label class="champ"><span>À acheter (un par ligne)</span><textarea name="ingredients" rows="4">${esc((r.ingredients || []).join("\n"))}</textarea></label>`}
        <label class="champ"><span>Note (facultatif)</span><input name="note" maxlength="300" value="${esc(r.note || "")}" placeholder="Ex. doubler les quantités"></label>
        <button class="bouton principal large" type="submit">Enregistrer</button>
        <button class="bouton danger large" type="button" data-retirer>Retirer du menu</button>
    </form>`;
    const form = f.corps.querySelector("form");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const d = { titre: form.titre.value.trim() || r.titre, date: form.date.value, moment: form.moment.value, note: form.note.value.trim() || null, modifieLe: Date.now(), modifiePar: compte.uid };
        if (!r.recetteId) d.ingredients = lignes(form.ingredients.value);
        f.fermer();
        try { await updateDoc(doc(refRepas(), r.id), d); toast("Repas mis à jour."); }
        catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    });
    form.querySelector("[data-retirer]").addEventListener("click", async () => {
        f.fermer();
        try { await deleteDoc(doc(refRepas(), r.id)); toast(`« ${r.titre} » retiré du menu.`); }
        catch (err) { console.error(err); toast("Impossible de retirer ce repas."); }
    });
}

function lignes(t) {
    return String(t || "").split("\n").map(l => l.trim().replace(/^[-•*–·]\s+/, "")).filter(Boolean).slice(0, 200).map(l => l.slice(0, 200));
}

async function ajouterRepas({ date, moment, titre, carnetId = null, recetteId = null, ingredients = [] }) {
    const t = Date.now();
    try {
        await addDoc(refRepas(), {
            date, moment, titre: titre.slice(0, 120), carnetId, recetteId,
            ingredients: (ingredients || []).slice(0, 200).map(x => String(x).slice(0, 200)), note: null,
            ordre: t, creeLe: t, modifieLe: t, modifiePar: compte.uid
        });
        toast(`« ${titre} » ajouté au menu.`);
    } catch (e) { console.error(e); toast("Ajout impossible. Réessaie."); }
}

// ==========================================
// LISTE DE COURSES
// ==========================================
const PLACARD = /^(?:du\s+|de\s+l['’]\s*|de\s+la\s+)?(?:sel|poivre|sel\s*(?:,|et)\s*poivre|eau|huile(?:\s+d['’]olive)?|sucre|farine|vinaigre|épices?)\b(?!\s+\d)/i;

// les ingrédients de la semaine : [{ texte, plats: [titres], nb }]
function ingredientsDeLaSemaine(source = S.repas) {
    const parTexte = new Map();
    for (const r of source) {
        for (const brut of r.ingredients || []) {
            const texte = String(brut).trim();
            if (!texte || estSousTitre(texte)) continue;
            const k = sansAccents(texte).replace(/\s+/g, " ");
            const e = parTexte.get(k) || { texte, plats: [], nb: 0 };
            e.nb++; if (!e.plats.includes(r.titre)) e.plats.push(r.titre);
            parTexte.set(k, e);
        }
    }
    return [...parTexte.values()];
}

async function ficheCourses() {
    const courses = S.listes.filter(l => l.type === "courses");
    const f = ouvrirFeuille({ titre: "🛒 Ajouter aux courses" });
    if (!courses.length) {
        f.corps.innerHTML = `<p>Tu n'as pas encore de liste de courses. Crée-la dans le <a href="#/dashboard">Dashboard</a>, puis reviens ici.</p>`;
        return;
    }
    f.corps.innerHTML = `<p class="muet">Préparation de la liste…</p>`;
    // ingrédients à jour depuis les recettes (si on y a accès), sinon la copie gardée dans le menu
    const repas = await Promise.all(S.repas.map(async (r) => {
        if (!r.recetteId || !r.carnetId) return r;
        try {
            const snap = await getDoc(doc(db, "carnets", r.carnetId, "recettes", r.recetteId));
            if (snap.exists()) return { ...r, ingredients: snap.data().ingredients || r.ingredients };
        } catch { /* carnet non partagé avec moi : on garde la copie */ }
        return r;
    }));
    const items = ingredientsDeLaSemaine(repas);
    let listeId = (() => { try { const m = localStorage.getItem("liste-courses"); return courses.some(c => c.id === m) ? m : courses[0].id; } catch { return courses[0].id; } })();
    let deja = new Set();
    const choix = new Map();   // texte normalisé -> coché ?
    const cle = (t) => sansAccents(t).replace(/\s+/g, " ");
    const texteFinal = (it) => (it.nb > 1 ? `${it.texte} (×${it.nb})` : it.texte).slice(0, 200);

    async function chargerDeja() {
        try {
            const snap = await getDocs(collection(db, "listes", listeId, "articles"));
            deja = new Set(snap.docs.filter(d => !d.data().coche).map(d => cle(d.data().texte.replace(/\s*\(×\d+\)$/, ""))));
        } catch { deja = new Set(); }
    }
    const coche = (it) => choix.has(cle(it.texte)) ? choix.get(cle(it.texte)) : !deja.has(cle(it.texte)) && !PLACARD.test(it.texte);

    function dessiner() {
        const n = items.filter(coche).length;
        f.corps.innerHTML = `<div class="me-form">
            ${courses.length > 1 ? `<label class="champ"><span>Dans la liste</span><select name="liste">
                ${courses.map(c => `<option value="${esc(c.id)}" ${c.id === listeId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>` : `<p class="muet petit">Dans la liste « ${esc(courses[0].name)} ».</p>`}
            <p class="muet petit">Décoche ce que tu as déjà. Le sel, le poivre, l'huile… et ce qui est déjà dans la liste sont décochés d'office.</p>
            <ul class="me-ingredients">
                ${items.map((it, i) => `<li><label class="me-case">
                    <input type="checkbox" data-i="${i}" ${coche(it) ? "checked" : ""}>
                    <span><b>${esc(it.texte)}${it.nb > 1 ? ` <em>×${it.nb}</em>` : ""}</b>
                    <small>${esc(it.plats.join(" · "))}${deja.has(cle(it.texte)) ? " · déjà dans la liste" : ""}</small></span>
                </label></li>`).join("")}
            </ul>
            <button type="button" class="bouton principal large" data-ajouter ${n ? "" : "disabled"}>Ajouter ${n} article${n > 1 ? "s" : ""} à la liste</button>
        </div>`;
    }
    f.corps.addEventListener("change", async (e) => {
        if (e.target.name === "liste") {
            listeId = e.target.value; choix.clear();
            try { localStorage.setItem("liste-courses", listeId); } catch { }
            await chargerDeja(); dessiner(); return;
        }
        if (e.target.dataset.i != null) { choix.set(cle(items[+e.target.dataset.i].texte), e.target.checked); dessiner(); }
    });
    f.corps.addEventListener("click", async (e) => {
        if (!e.target.closest("[data-ajouter]")) return;
        const aAjouter = items.filter(coche);
        if (!aAjouter.length) return;
        const b = e.target.closest("[data-ajouter]"); b.disabled = true; b.textContent = "Ajout…";
        try {
            const t = Date.now();
            for (let i = 0; i < aAjouter.length; i += 400) {
                const lot = writeBatch(db);
                aAjouter.slice(i, i + 400).forEach((it, k) => lot.set(doc(collection(db, "listes", listeId, "articles")), {
                    texte: texteFinal(it), coche: false, creeLe: t + i + k, creePar: compte.uid
                }));
                await lot.commit();
            }
            f.fermer();
            const nom = courses.find(c => c.id === listeId)?.name || "courses";
            toast(`${aAjouter.length} article${aAjouter.length > 1 ? "s" : ""} ajouté${aAjouter.length > 1 ? "s" : ""} à « ${nom} » ✔`);
        } catch (err) {
            console.error(err);
            b.disabled = false; b.textContent = "Réessayer";
            toast("L'ajout à la liste n'a pas marché. Réessaie.");
        }
    });
    await chargerDeja();
    dessiner();
}

// ==========================================
// DONNÉES
// ==========================================
function ecouterSemaine() {
    S.arret?.(); S.arret = null;
    S.repas = []; S.repasCharges = false;
    if (!S.mid) return;
    const mid = S.mid, lundi = S.lundi, valable = () => mid === S.mid && lundi === S.lundi;
    S.arret = ecouterAvecReessai((ko) => onSnapshot(
        query(refRepas(mid), where("date", ">=", lundi), where("date", "<=", plusJours(lundi, 6))),
        snap => { if (!valable()) return; S.repas = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.repasCharges = true; rendre(); },
        ko), valable);
}

async function viderMenu(mid) {
    const snap = await getDocs(refRepas(mid));
    for (let i = 0; i < snap.docs.length; i += 400) {
        const lot = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
        await lot.commit();
    }
}

function brancher() {
    zone.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.dataset.action === "creer") { b.disabled = true; await sel.creer("Menus de la maison"); b.disabled = false; }
        else if (b.dataset.action === "courses") ficheCourses();
        else if (b.dataset.ajout) { const [d, m] = b.dataset.ajout.split("|"); ficheAjout(d, m); }
        else if (b.dataset.repas) { const r = S.repas.find(x => x.id === b.dataset.repas); if (r) ficheRepas(r); }
    });
}

export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur; outils = outilsCoquille;
    zone = racine.querySelector("#me-app");
    sel = selecteurPartage({
        collection: "menus", quoi: "ces menus", nomNouveau: "Nouveaux menus",
        etiquette: "Nom", exemple: "Ex. Menus de la maison", memo: "menus-courant",
        supprimerContenu: viderMenu,
        quandChange: (m) => {
            const id = m?.id || null;
            if (id !== S.mid) { S.mid = id; ecouterSemaine(); }
            rendre();
        },
        quandErreur: () => { zone.innerHTML = `<p class="me-vide">Les menus n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; }
    });
    // carnets (pour choisir une recette) et listes de courses
    ecouterMesPartages("carnets", (l) => { S.carnets = l; recettesCache = null; });
    ecouterMesPartages("listes", (l) => { S.listes = l; });
    brancher();
    rendre();
}

export function afficher(chemin = "") {
    const voulu = /^\d{4}-\d{2}-\d{2}$/.test(chemin) ? lundiDe(versDate(chemin)) : lundiDe(new Date());
    if (voulu !== S.lundi) { S.lundi = voulu; ecouterSemaine(); }
    recettesCache = null;   // les recettes ont pu changer depuis la dernière fois
    if (zone) rendre();
}

// pour les tests
export { ingredientsDeLaSemaine, lundiDe };
