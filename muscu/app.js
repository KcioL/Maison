// ==========================================
// MUSCU : programmes, séances et mode séance avec minuteur de repos
// Appli chargée dans la page principale (voir commun/coquille.js).
//
// Pages internes :
//   #/muscu                  le programme (liste des séances)
//   #/muscu/seance/<id>      modifier une séance (ses exercices)
//   #/muscu/go/<id>          faire la séance (séries à cocher, minuteur de repos)
//
// Données (partagées comme les listes) :
//   programmes/{id}                      name, ownerId, memberIds, members, createdAt
//   programmes/{id}/seances/{id}         nom, ordre, exercices[], modifieLe, modifiePar
//   exercice : { id, nom, groupe, series, reps, poids, repos, video, note }
// ==========================================
import { db } from "../commun/firebase.js";
import { compte } from "../commun/compte.js";
import { ecouterMesPartages, creerPartage, ouvrirAcces, supprimerOuQuitter } from "../commun/partage.js";
import { esc, toast, ouvrirFeuille, confirmer } from "../commun/ui.js";
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, writeBatch, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { GROUPES, CATALOGUE, groupe, lienVideo } from "./exercices.js";

let racine, outils, zone;
const S = {
    programmes: [], charge: false, programmeId: null, voulu: null,
    seances: [], seancesChargees: false, arreterSeances: null,
    chemin: "",
    go: null,          // séance en cours : { sid, index, faites: {i: [bool]}, poids: {i: n} }
    minuteur: null,    // repos en cours : { fin, total }
    verrouEcran: null
};
const MEMO_PROG = "muscu-programme", MEMO_GO = "muscu-seance-en-cours";
const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } };

const programme = () => S.programmes.find(p => p.id === S.programmeId);
const seancesCol = (pid = S.programmeId) => collection(db, "programmes", pid, "seances");
const seance = (sid) => S.seances.find(s => s.id === sid);
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Mise en forme ----------
function fmtRepos(s) {
    s = Math.round(s || 0);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m} min ${String(r).padStart(2, "0")}` : `${m} min`;
}
const fmtPoids = (p) => (typeof p === "number" ? `${p.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg` : "");
const fmtMinuteur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// durée d'une série selon les répétitions ("10", "8-12", "45 s", "1 min")
function dureeSerie(reps) {
    const t = String(reps || "").toLowerCase();
    const n = Math.max(...(t.match(/\d+([.,]\d+)?/g) || ["10"]).map(x => parseFloat(x.replace(",", "."))));
    if (t.includes("min")) return n * 60;
    if (/\d\s*s\b/.test(t) || t.endsWith("s")) return n;
    return n * 3.5;
}
function dureeSeance(exos) {
    const s = exos.reduce((tot, e) => tot + (e.series || 0) * (dureeSerie(e.reps) + (e.repos || 0)) + 45, 0);
    return Math.max(5, Math.round(s / 60 / 5) * 5);
}
const totalSeries = (exos) => exos.reduce((t, e) => t + (e.series || 0), 0);
const pastille = (g) => `<span class="mu-pastille" style="--c:${groupe(g).couleur}">${esc(groupe(g).nom)}</span>`;

// ---------- Écoute des données ----------
function ecouterProgrammes() {
    ecouterMesPartages("programmes", liste => {
        const premier = !S.charge;
        S.programmes = liste; S.charge = true;
        let cible = S.programmeId;
        if (S.voulu && liste.some(p => p.id === S.voulu)) { cible = S.voulu; S.voulu = null; }
        else if (!cible || !liste.some(p => p.id === cible)) {
            const memo = lire(MEMO_PROG);
            cible = liste.some(p => p.id === memo) ? memo : (liste[0]?.id || null);
        }
        if (cible !== S.programmeId) ouvrirProgramme(cible);
        else if (premier || !S.chemin) rendre();
    }, () => { S.charge = true; zone.innerHTML = `<p class="mu-vide">Les programmes n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; });
}

function ouvrirProgramme(pid) {
    const avant = S.programmeId;
    S.arreterSeances?.(); S.arreterSeances = null;
    S.programmeId = pid; S.seances = []; S.seancesChargees = false;
    if (pid) ecrire(MEMO_PROG, pid);
    // en changeant de programme, on revient à sa liste de séances
    // (au premier chargement, on garde la page demandée, par exemple une séance en cours)
    if (S.chemin && avant) outils.aller("", { remplacer: true }); else rendre();
    if (pid) ecouterSeances(pid, 0);
}

function ecouterSeances(pid, essai) {
    S.arreterSeances = onSnapshot(query(seancesCol(pid), orderBy("ordre", "asc")), snap => {
        if (pid !== S.programmeId) return;
        S.seances = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        S.seancesChargees = true;
        // pas de redessin pendant qu'on tape dans un champ de la page
        if (!(zone.contains(document.activeElement) && document.activeElement.matches("input, textarea"))) rendre();
    }, err => {
        // juste après une création ou un partage, le serveur peut ne pas encore connaître le programme
        if (err.code === "permission-denied" && essai < 4 && pid === S.programmeId) {
            setTimeout(() => { if (pid === S.programmeId) ecouterSeances(pid, essai + 1); }, 800 * (essai + 1));
        } else console.error("séances", err);
    });
}

// ---------- Écriture ----------
async function enregistrerExercices(sid, exercices) {
    try {
        await updateDoc(doc(seancesCol(), sid), { exercices, modifieLe: Date.now(), modifiePar: compte.uid });
        return true;
    } catch (e) { console.error(e); toast("Enregistrement impossible. Réessaie."); return false; }
}

async function viderProgramme(pid) {
    const snap = await getDocs(seancesCol(pid));
    for (let i = 0; i < snap.docs.length; i += 400) {
        const lot = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
        await lot.commit();
    }
}

async function creerProgramme(nom) {
    try {
        const id = await creerPartage("programmes", { name: nom });
        ecrire(MEMO_PROG, id);
        if (S.programmes.some(p => p.id === id)) ouvrirProgramme(id); else S.voulu = id;
        toast(`Programme « ${nom} » créé.`);
    } catch (e) { console.error(e); toast("Création impossible. Réessaie."); }
}

function demanderNom({ titre, etiquette, valeur = "", exemple = "", bouton = "Créer" }) {
    return new Promise(resolve => {
        let nom = null;
        const f = ouvrirFeuille({ titre, quandFerme: () => resolve(nom) });
        f.corps.innerHTML = `<form class="ligne-form" autocomplete="off">
            <label class="champ"><span>${esc(etiquette)}</span><input name="nom" maxlength="60" required placeholder="${esc(exemple)}" value="${esc(valeur)}"></label>
            <button class="bouton principal" type="submit">${esc(bouton)}</button></form>`;
        const input = f.corps.querySelector("input"); input.focus(); input.select();
        f.corps.querySelector("form").addEventListener("submit", e => {
            e.preventDefault();
            nom = input.value.trim() || null;
            f.fermer();
        });
    });
}

async function nouvelleSeance() {
    const lettre = String.fromCharCode(65 + (S.seances.length % 26));
    const nom = await demanderNom({ titre: "Nouvelle séance", etiquette: "Nom de la séance", valeur: `Séance ${lettre}`, exemple: "Ex. Haut du corps" });
    if (!nom) return;
    try {
        const ordre = S.seances.reduce((m, s) => Math.max(m, s.ordre || 0), 0) + 1;
        const ref = await addDoc(seancesCol(), { nom, ordre, exercices: [], modifieLe: Date.now(), modifiePar: compte.uid });
        outils.aller(`seance/${ref.id}`);
    } catch (e) { console.error(e); toast("Création impossible. Réessaie."); }
}

// ---------- Pages ----------
function rendre() {
    if (!zone) return;
    const [page, sid] = S.chemin.split("/");
    if (!S.charge) { zone.innerHTML = `<p class="mu-vide chargement">Ouverture des programmes…</p>`; return; }
    if (page === "seance" && sid) return pageSeance(sid);
    if (page === "go" && sid) return pageGo(sid);
    pageAccueil();
}

function pageAccueil() {
    outils.titre(programme() ? `${programme().name} · Muscu` : "Muscu · Maison");
    liberer();
    const entete = `<header><h1 class="titre-logo"><img src="commun/logos/muscu-192.png" alt="" width="48" height="48"> Muscu</h1></header>`;
    if (!S.programmes.length) {
        zone.innerHTML = entete + `<div class="widget mu-vide-carte">
            <p class="mu-grand">Crée ton programme d'entraînement</p>
            <p class="muet">Ajoute tes séances (par exemple « Haut du corps », « Jambes »), puis tes exercices avec les séries, les répétitions, le poids et le temps de repos.</p>
            <button type="button" class="mu-bouton principal" data-action="creer-programme">Créer mon programme</button>
            <p class="muet petit">Si quelqu'un t'a partagé son programme, il apparaîtra ici tout seul.</p></div>`;
        return;
    }
    const p = programme(), mien = p && p.ownerId === compte.uid;
    const enCours = S.go && seance(S.go.sid);
    zone.innerHTML = entete + `
        <div class="mu-outils">
            <select id="mu-choix" aria-label="Choisir le programme">
                ${S.programmes.map(x => `<option value="${esc(x.id)}" ${x.id === S.programmeId ? "selected" : ""}>${esc(x.name)}${x.ownerId !== compte.uid ? " (partagé)" : ""}</option>`).join("")}
                <option value="__nouveau">+ Nouveau programme…</option>
            </select>
            <button type="button" class="mu-bouton" data-action="partager">👥 Partager</button>
            <button type="button" class="mu-bouton icone" data-action="supprimer-programme" title="${mien ? "Supprimer ce programme" : "Quitter ce programme (il est partagé avec toi)"}" aria-label="${mien ? "Supprimer ce programme" : "Quitter ce programme"}">${mien ? "🗑️" : "🚪"}</button>
        </div>
        ${enCours ? `<a class="widget mu-reprendre" href="${outils.lien(`go/${S.go.sid}`)}">
            <span>▶ Séance en cours : <b>${esc(enCours.nom)}</b></span><span class="muet">Reprendre ›</span></a>` : ""}
        <div class="mu-seances">
            ${!S.seancesChargees ? `<p class="mu-vide chargement">Chargement des séances…</p>` : ""}
            ${S.seances.map(s => {
                const exos = s.exercices || [];
                const groupes = [...new Set(exos.map(e => e.groupe))];
                return `<article class="widget mu-seance">
                    <div class="mu-seance-tete"><h2>${esc(s.nom)}</h2>${exos.length ? `<span class="mu-duree">≈ ${dureeSeance(exos)} min</span>` : ""}</div>
                    ${groupes.length ? `<div class="mu-pastilles">${groupes.map(pastille).join("")}</div>` : ""}
                    <p class="muet">${exos.length ? `${exos.length} exercice${exos.length > 1 ? "s" : ""} · ${totalSeries(exos)} séries` : "Aucun exercice pour l'instant"}</p>
                    <div class="mu-actions">
                        ${exos.length ? `<a class="mu-bouton principal" href="${outils.lien(`go/${s.id}`)}">▶ Commencer</a>` : ""}
                        <a class="mu-bouton" href="${outils.lien(`seance/${s.id}`)}">${exos.length ? "Modifier" : "Ajouter des exercices"}</a>
                    </div>
                </article>`;
            }).join("")}
            ${S.seancesChargees ? `<button type="button" class="mu-ajout-tuile" data-action="nouvelle-seance">+ Nouvelle séance</button>` : ""}
        </div>`;
    const choix = zone.querySelector("#mu-choix");
    choix.addEventListener("change", async () => {
        if (choix.value === "__nouveau") {
            choix.value = S.programmeId;
            const nom = await demanderNom({ titre: "Nouveau programme", etiquette: "Nom du programme", exemple: "Ex. Programme prise de masse" });
            if (nom) creerProgramme(nom);
            return;
        }
        ouvrirProgramme(choix.value);
    });
}

function pageSeance(sid) {
    const s = seance(sid);
    if (!s) {
        zone.innerHTML = S.seancesChargees ? `<div class="widget mu-vide-carte"><p>Cette séance n'existe plus.</p><a class="mu-bouton" href="${outils.lien("")}">← Retour au programme</a></div>`
            : `<p class="mu-vide chargement">Chargement…</p>`;
        return;
    }
    liberer();
    outils.titre(`${s.nom} · Muscu`);
    const exos = s.exercices || [];
    zone.innerHTML = `
        <a class="mu-retour" href="${outils.lien("")}">← ${esc(programme()?.name || "Programme")}</a>
        <div class="widget mu-entete-seance">
            <label class="mu-champ-titre"><span class="sr-only">Nom de la séance</span>
                <input id="mu-nom-seance" maxlength="60" value="${esc(s.nom)}"></label>
            <p class="muet">${exos.length ? `${exos.length} exercice${exos.length > 1 ? "s" : ""} · ${totalSeries(exos)} séries · ≈ ${dureeSeance(exos)} min` : "Ajoute tes exercices ci-dessous."}</p>
            <div class="mu-actions">
                ${exos.length ? `<a class="mu-bouton principal" href="${outils.lien(`go/${s.id}`)}">▶ Commencer la séance</a>` : ""}
                <button type="button" class="mu-bouton danger" data-action="supprimer-seance">Supprimer la séance</button>
            </div>
        </div>
        <ol class="mu-exos">
            ${exos.map((e, i) => `
            <li class="widget mu-exo" data-i="${i}">
                <div class="mu-exo-tete">
                    <span class="mu-num">${i + 1}</span>
                    <div class="mu-exo-nom"><b>${esc(e.nom)}</b>${pastille(e.groupe)}</div>
                </div>
                <div class="mu-stats">
                    <span><b>${e.series}</b> × <b>${esc(e.reps)}</b></span>
                    ${typeof e.poids === "number" ? `<span>🏋️ ${fmtPoids(e.poids)}</span>` : ""}
                    <span>⏱ ${fmtRepos(e.repos)} de repos</span>
                </div>
                ${e.note ? `<p class="mu-note">${esc(e.note)}</p>` : ""}
                <div class="mu-exo-actions">
                    <a class="mu-lien-video" href="${esc(lienVideo(e))}" target="_blank" rel="noopener noreferrer">▶ Vidéo</a>
                    <span class="mu-espace"></span>
                    <button type="button" class="mu-icone" data-ex="monter" aria-label="Monter" ${i === 0 ? "disabled" : ""}>↑</button>
                    <button type="button" class="mu-icone" data-ex="descendre" aria-label="Descendre" ${i === exos.length - 1 ? "disabled" : ""}>↓</button>
                    <button type="button" class="mu-icone" data-ex="modifier" aria-label="Modifier">✏️</button>
                    <button type="button" class="mu-icone" data-ex="supprimer" aria-label="Retirer">🗑️</button>
                </div>
            </li>`).join("")}
        </ol>
        <button type="button" class="mu-ajout-tuile" data-action="ajouter-exo">+ Ajouter un exercice</button>`;
    const nom = zone.querySelector("#mu-nom-seance");
    nom.addEventListener("change", async () => {
        const v = nom.value.trim();
        if (!v || v === s.nom) { nom.value = s.nom; return; }
        try { await updateDoc(doc(seancesCol(), sid), { nom: v, modifieLe: Date.now(), modifiePar: compte.uid }); toast("Séance renommée."); }
        catch { toast("Renommage impossible."); }
    });
    nom.addEventListener("keydown", e => { if (e.key === "Enter") nom.blur(); });
}

// ---------- Mode séance ----------
function etatGo(sid) {
    if (!S.go || S.go.sid !== sid) {
        let memo = null;
        try { memo = JSON.parse(lire(MEMO_GO) || "null"); } catch { }
        S.go = memo && memo.sid === sid ? memo : { sid, index: 0, faites: {}, poids: {}, debut: Date.now() };
    }
    return S.go;
}
const memoriserGo = () => ecrire(MEMO_GO, S.go ? JSON.stringify(S.go) : null);

function pageGo(sid) {
    const s = seance(sid);
    if (!s) { pageSeance(sid); return; }
    const exos = s.exercices || [];
    if (!exos.length) { outils.aller(`seance/${sid}`, { remplacer: true }); return; }
    const g = etatGo(sid);
    g.index = Math.min(g.index, exos.length - 1);
    const i = g.index, e = exos[i];
    const faites = g.faites[i] || (g.faites[i] = Array(e.series).fill(false));
    while (faites.length < e.series) faites.push(false);
    const poids = g.poids[i] ?? e.poids;
    const toutesFaites = exos.every((x, k) => (g.faites[k] || []).filter(Boolean).length >= x.series);
    const fait = Object.values(g.faites).flat().filter(Boolean).length, total = totalSeries(exos);
    outils.titre(`${s.nom} · Muscu`);
    garderEcranAllume();

    zone.innerHTML = `
        <div class="mu-go-tete">
            <a class="mu-retour" href="${outils.lien("")}">← Programme</a>
            <span class="muet">${fait}/${total} séries</span>
        </div>
        <div class="mu-progression"><span style="width:${total ? Math.round(fait / total * 100) : 0}%"></span></div>
        <h2 class="mu-go-seance">${esc(s.nom)} · exercice ${i + 1}/${exos.length}</h2>
        <div class="widget mu-go-exo">
            ${pastille(e.groupe)}
            <h1 class="mu-go-nom">${esc(e.nom)}</h1>
            <a class="mu-lien-video" href="${esc(lienVideo(e))}" target="_blank" rel="noopener noreferrer">▶ Voir la vidéo</a>
            ${e.note ? `<p class="mu-note">${esc(e.note)}</p>` : ""}
            <div class="mu-go-infos">
                <div><span class="mu-etiquette">Répétitions</span><b>${esc(e.reps)}</b></div>
                <div><span class="mu-etiquette">Poids</span>
                    <div class="mu-poids">
                        <button type="button" class="mu-icone" data-go="moins" aria-label="Moins lourd">−</button>
                        <b>${typeof poids === "number" ? fmtPoids(poids) : "—"}</b>
                        <button type="button" class="mu-icone" data-go="plus" aria-label="Plus lourd">+</button>
                    </div></div>
                <div><span class="mu-etiquette">Repos</span><b>${fmtRepos(e.repos)}</b></div>
            </div>
            <div class="mu-series">
                ${faites.slice(0, e.series).map((ok, k) => `<button type="button" class="mu-serie ${ok ? "faite" : ""}" data-serie="${k}" aria-pressed="${ok}">
                    <span>Série ${k + 1}</span><span class="mu-coche">${ok ? "✓" : ""}</span></button>`).join("")}
            </div>
        </div>
        <div class="mu-go-nav">
            <button type="button" class="mu-bouton" data-go="precedent" ${i === 0 ? "disabled" : ""}>← Précédent</button>
            ${i < exos.length - 1
                ? `<button type="button" class="mu-bouton principal" data-go="suivant">Suivant →</button>`
                : `<button type="button" class="mu-bouton principal" data-go="terminer">${toutesFaites ? "Terminer ✓" : "Terminer la séance"}</button>`}
        </div>
        <div class="mu-go-liste">
            ${exos.map((x, k) => {
                const n = (g.faites[k] || []).filter(Boolean).length;
                return `<button type="button" class="mu-go-item ${k === i ? "actif" : ""} ${n >= x.series ? "fini" : ""}" data-aller="${k}">
                    <span>${k + 1}. ${esc(x.nom)}</span><span class="muet">${n}/${x.series}</span></button>`;
            }).join("")}
        </div>`;
}

function cocherSerie(k) {
    const s = seance(S.go.sid), exos = s.exercices, i = S.go.index, e = exos[i];
    const faites = S.go.faites[i];
    faites[k] = !faites[k];
    memoriserGo();
    if (faites[k]) {
        const finiExo = faites.filter(Boolean).length >= e.series;
        const finiTout = exos.every((x, j) => (S.go.faites[j] || []).filter(Boolean).length >= x.series);
        if (finiTout) { arreterMinuteur(); toast("Toutes les séries sont faites, bravo ! 💪"); }
        else lancerMinuteur(e.repos || 60);
        if (finiExo && !finiTout && i < exos.length - 1) S.go.index = i + 1;   // on passe à l'exercice suivant
        memoriserGo();
    }
    pageGo(S.go.sid);
}

async function terminerSeance() {
    const s = seance(S.go.sid);
    const changes = (s.exercices || []).map((e, i) => S.go.poids[i] !== undefined && S.go.poids[i] !== e.poids);
    const nbChanges = changes.filter(Boolean).length;
    const fait = Object.values(S.go.faites).flat().filter(Boolean).length;
    const minutes = Math.max(1, Math.round((Date.now() - (S.go.debut || Date.now())) / 60000));
    let garder = false;
    if (nbChanges) {
        garder = await confirmer({
            titre: "Séance terminée 💪",
            message: `${fait} séries en ${minutes} min. Tu as changé le poids de ${nbChanges} exercice${nbChanges > 1 ? "s" : ""} : les garder dans le programme pour la prochaine fois ?`,
            bouton: "Garder les nouveaux poids"
        });
    } else toast(`Séance terminée : ${fait} séries en ${minutes} min 💪`);
    if (garder) {
        const exos = s.exercices.map((e, i) => (changes[i] ? { ...e, poids: S.go.poids[i] } : e));
        if (await enregistrerExercices(s.id, exos)) toast("Nouveaux poids enregistrés ✔");
    }
    S.go = null; memoriserGo(); arreterMinuteur(); liberer();
    outils.aller("");
}

// ---------- Minuteur de repos ----------
let tic = null, audio = null;
function lancerMinuteur(secondes) {
    S.minuteur = { fin: Date.now() + secondes * 1000, total: secondes };
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch { }
    clearInterval(tic);
    tic = setInterval(majMinuteur, 250);
    majMinuteur();
}
function arreterMinuteur() {
    S.minuteur = null; clearInterval(tic); tic = null;
    const m = racine.querySelector("#mu-minuteur"); if (m) m.hidden = true;
}
function majMinuteur() {
    const m = racine.querySelector("#mu-minuteur");
    if (!S.minuteur) { m.hidden = true; return; }
    const reste = Math.max(0, Math.ceil((S.minuteur.fin - Date.now()) / 1000));
    m.hidden = false;
    m.querySelector(".mu-min-temps").textContent = fmtMinuteur(reste);
    m.querySelector(".mu-min-barre span").style.width = `${Math.min(100, 100 - (reste / S.minuteur.total) * 100)}%`;
    if (reste <= 0) {
        arreterMinuteur();
        sonner();
        toast("Repos terminé : c'est reparti ! 💪");
    }
}
function sonner() {
    try { navigator.vibrate?.([250, 120, 250]); } catch { }
    try {
        if (!audio) return;
        [0, 0.25, 0.5].forEach(t => {
            const o = audio.createOscillator(), gain = audio.createGain();
            o.frequency.value = 880; gain.gain.value = 0.15;
            o.connect(gain); gain.connect(audio.destination);
            o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.15);
        });
    } catch { }
}

// ---------- Écran allumé pendant la séance ----------
async function garderEcranAllume() {
    if (S.verrouEcran || !("wakeLock" in navigator) || !outils.visible()) return;
    try { S.verrouEcran = await navigator.wakeLock.request("screen"); S.verrouEcran.addEventListener?.("release", () => { S.verrouEcran = null; }); } catch { }
}
function liberer() { S.verrouEcran?.release?.().catch(() => { }); S.verrouEcran = null; }

// ---------- Fiche d'un exercice (ajout / modification) ----------
const REPOS = [30, 45, 60, 90, 120, 180];
function ficheExercice({ titre, exo, quandValide }) {
    const f = ouvrirFeuille({ titre });
    f.corps.innerHTML = `<form class="mu-fiche" autocomplete="off">
        <label class="champ"><span>Exercice</span><input name="nom" maxlength="80" required value="${esc(exo.nom)}"></label>
        <label class="champ"><span>Muscle travaillé</span><select name="groupe">
            ${GROUPES.map(g => `<option value="${g.id}" ${g.id === exo.groupe ? "selected" : ""}>${esc(g.nom)}</option>`).join("")}</select></label>
        <div class="mu-fiche-ligne">
            <label class="champ"><span>Séries</span><input name="series" type="number" min="1" max="20" required value="${exo.series}" inputmode="numeric"></label>
            <label class="champ"><span>Répétitions</span><input name="reps" maxlength="20" required value="${esc(exo.reps)}" placeholder="10, 8-12, 30 s…"></label>
            <label class="champ"><span>Poids (kg)</span><input name="poids" type="number" min="0" max="1000" step="0.5" value="${typeof exo.poids === "number" ? exo.poids : ""}" placeholder="—" inputmode="decimal"></label>
        </div>
        <div class="champ"><span>Repos entre les séries</span>
            <div class="mu-choix-repos">
                ${REPOS.map(r => `<button type="button" class="mu-puce ${r === exo.repos ? "active" : ""}" data-repos="${r}">${fmtRepos(r)}</button>`).join("")}
                <label class="mu-repos-libre"><input name="repos" type="number" min="0" max="900" step="5" value="${exo.repos}" inputmode="numeric" aria-label="Repos en secondes"> s</label>
            </div></div>
        <label class="champ"><span>Lien vidéo (facultatif)</span><input name="video" type="url" inputmode="url" value="${esc(exo.video || "")}" placeholder="https://… (sinon : recherche YouTube)"></label>
        <label class="champ"><span>Note (facultatif)</span><input name="note" maxlength="200" value="${esc(exo.note || "")}" placeholder="Ex. coudes serrés, descendre lentement"></label>
        <button class="bouton principal large" type="submit">Enregistrer</button>
    </form>`;
    const form = f.corps.querySelector("form");
    form.querySelectorAll("[data-repos]").forEach(b => b.addEventListener("click", () => {
        form.repos.value = b.dataset.repos;
        form.querySelectorAll("[data-repos]").forEach(x => x.classList.toggle("active", x === b));
    }));
    form.repos.addEventListener("input", () => form.querySelectorAll("[data-repos]").forEach(x => x.classList.toggle("active", x.dataset.repos === form.repos.value)));
    form.addEventListener("submit", e => {
        e.preventDefault();
        const video = form.video.value.trim();
        if (video && !/^https?:\/\//i.test(video)) { toast("Le lien vidéo doit commencer par https://"); form.video.focus(); return; }
        const poids = form.poids.value === "" ? null : Math.round(parseFloat(form.poids.value.replace(",", ".")) * 100) / 100;
        quandValide({
            ...exo,
            nom: form.nom.value.trim(),
            groupe: form.groupe.value,
            series: Math.min(20, Math.max(1, parseInt(form.series.value, 10) || 1)),
            reps: form.reps.value.trim() || "10",
            poids: Number.isFinite(poids) ? poids : null,
            repos: Math.min(900, Math.max(0, parseInt(form.repos.value, 10) || 0)),
            video: video || null,
            note: form.note.value.trim() || null
        });
        f.fermer();
    });
    return f;
}

// Catalogue : chercher un exercice, ou en créer un
function ouvrirCatalogue(sid) {
    const f = ouvrirFeuille({ titre: "Ajouter un exercice" });
    let filtre = "", g = "tous";
    f.corps.innerHTML = `
        <input type="search" class="mu-recherche" placeholder="Chercher un exercice…" aria-label="Chercher un exercice">
        <div class="mu-filtres">
            <button type="button" class="mu-puce active" data-g="tous">Tous</button>
            ${GROUPES.map(x => `<button type="button" class="mu-puce" data-g="${x.id}" style="--c:${x.couleur}">${esc(x.nom)}</button>`).join("")}
        </div>
        <div class="mu-catalogue"></div>`;
    const liste = f.corps.querySelector(".mu-catalogue");
    const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const dessiner = () => {
        const q = norm(filtre.trim());
        const res = CATALOGUE.filter(x => (g === "tous" || x.groupe === g) && (!q || norm(x.nom).includes(q)));
        liste.innerHTML = (filtre.trim() ? `<button type="button" class="mu-cat-item perso" data-perso="1">
                <span><b>+ Créer « ${esc(filtre.trim())} »</b><small>Ton propre exercice</small></span></button>` : "")
            + res.map(x => `<button type="button" class="mu-cat-item" data-nom="${esc(x.nom)}">
                <span><b>${esc(x.nom)}</b><small>${esc(x.materiel)}</small></span>${pastille(x.groupe)}</button>`).join("")
            + (!res.length && !filtre.trim() ? `<p class="muet">Aucun exercice dans ce groupe.</p>` : "");
    };
    dessiner();
    const recherche = f.corps.querySelector(".mu-recherche");
    recherche.addEventListener("input", () => { filtre = recherche.value; dessiner(); });
    f.corps.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => {
        g = b.dataset.g;
        f.corps.querySelectorAll("[data-g]").forEach(x => x.classList.toggle("active", x === b));
        dessiner();
    }));
    liste.addEventListener("click", ev => {
        const b = ev.target.closest(".mu-cat-item"); if (!b) return;
        const modele = b.dataset.perso
            ? { nom: filtre.trim(), groupe: g === "tous" ? "pecs" : g, reps: "10" }
            : CATALOGUE.find(x => x.nom === b.dataset.nom);
        f.fermer();
        const leger = ["abdos", "cardio"].includes(modele.groupe);
        ficheExercice({
            titre: "Nouvel exercice",
            exo: { id: uid(), nom: modele.nom, groupe: modele.groupe, series: leger ? 3 : 4, reps: modele.reps, poids: null, repos: leger ? 45 : 90, video: null, note: null },
            quandValide: async (exo) => {
                const s = seance(sid); if (!s) return;
                if (await enregistrerExercices(sid, [...(s.exercices || []), exo])) toast(`« ${exo.nom} » ajouté.`);
            }
        });
    });
    setTimeout(() => recherche.focus(), 50);
}

// ---------- Actions ----------
function brancherActions() {
    racine.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button"); if (!b || !zone.contains(b) && !racine.querySelector("#mu-minuteur").contains(b)) return;
        const [page, sid] = S.chemin.split("/");
        const a = b.dataset.action;

        if (a === "creer-programme") { b.disabled = true; await creerProgramme("Mon programme"); b.disabled = false; }
        else if (a === "partager" && S.programmeId) ouvrirAcces({ collection: "programmes", id: S.programmeId, quoi: "ce programme", supprimerContenu: viderProgramme });
        else if (a === "supprimer-programme") supprimerOuQuitter({ collection: "programmes", partage: programme(), quoi: "ce programme", supprimerContenu: viderProgramme });
        else if (a === "nouvelle-seance") nouvelleSeance();
        else if (a === "ajouter-exo") ouvrirCatalogue(sid);
        else if (a === "supprimer-seance") {
            const s = seance(sid); if (!s) return;
            if (!await confirmer({ titre: `Supprimer « ${s.nom} » ?`, message: "La séance et ses exercices seront effacés.", bouton: "Supprimer", danger: true })) return;
            try { await deleteDoc(doc(seancesCol(), sid)); outils.aller(""); toast("Séance supprimée."); }
            catch { toast("Suppression impossible."); }
        }
        else if (a === "min-plus" && S.minuteur) { S.minuteur.fin += 15000; S.minuteur.total += 15; majMinuteur(); }
        else if (a === "min-passer") arreterMinuteur();

        // exercices d'une séance
        else if (b.dataset.ex) {
            const s = seance(sid); if (!s) return;
            const i = Number(b.closest(".mu-exo").dataset.i), exos = [...(s.exercices || [])];
            if (b.dataset.ex === "monter" && i > 0) { [exos[i - 1], exos[i]] = [exos[i], exos[i - 1]]; enregistrerExercices(sid, exos); }
            else if (b.dataset.ex === "descendre" && i < exos.length - 1) { [exos[i + 1], exos[i]] = [exos[i], exos[i + 1]]; enregistrerExercices(sid, exos); }
            else if (b.dataset.ex === "supprimer") {
                exos.splice(i, 1);
                if (await enregistrerExercices(sid, exos)) toast(`« ${s.exercices[i].nom} » retiré.`);
            }
            else if (b.dataset.ex === "modifier") {
                ficheExercice({ titre: "Modifier l'exercice", exo: exos[i], quandValide: (exo) => { exos[i] = exo; enregistrerExercices(sid, exos); } });
            }
        }

        // mode séance
        else if (page === "go" && S.go) {
            const s = seance(sid), e = s?.exercices?.[S.go.index]; if (!e) return;
            if (b.dataset.serie !== undefined) cocherSerie(Number(b.dataset.serie));
            else if (b.dataset.go === "suivant") { S.go.index++; memoriserGo(); pageGo(sid); outils.defiler(0); }
            else if (b.dataset.go === "precedent") { S.go.index = Math.max(0, S.go.index - 1); memoriserGo(); pageGo(sid); outils.defiler(0); }
            else if (b.dataset.aller !== undefined) { S.go.index = Number(b.dataset.aller); memoriserGo(); pageGo(sid); outils.defiler(0); }
            else if (b.dataset.go === "terminer") terminerSeance();
            else if (b.dataset.go === "plus" || b.dataset.go === "moins") {
                const actuel = S.go.poids[S.go.index] ?? e.poids ?? 0;
                const pas = actuel >= 20 ? 2.5 : 1;
                S.go.poids[S.go.index] = Math.max(0, Math.round((actuel + (b.dataset.go === "plus" ? pas : -pas)) * 100) / 100);
                memoriserGo(); pageGo(sid);
            }
        }
    });
}

// ---------- Cycle de vie (coquille) ----------
export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur;
    outils = outilsCoquille;
    zone = racine.querySelector("#muscu-app");
    try { S.go = JSON.parse(lire(MEMO_GO) || "null"); } catch { S.go = null; }
    brancherActions();
    rendre();
    ecouterProgrammes();
    // l'écran allumé est coupé quand on change d'appli sur le téléphone : on le redemande au retour
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && S.chemin.startsWith("go/") && outils.visible()) garderEcranAllume();
    });
}

export function afficher(chemin = "") {
    S.chemin = chemin;
    rendre();
}

export function masquer() { liberer(); }
