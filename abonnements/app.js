// ==========================================
// ABONNEMENTS : suivi des abonnements (Netflix, salle de sport…)
// Appli chargée dans la page principale (voir commun/coquille.js).
//
// Données (partagées comme les listes) :
//   abonnements/{id}                 une liste d'abonnements (name, ownerId, memberIds…)
//   abonnements/{id}/lignes/{id}     nom, montant, frequence, prochaine, categorie,
//                                    payePar, actif, note, creeLe, modifiePar
// ==========================================
import { db } from "../commun/firebase.js";
import { compte } from "../commun/compte.js";
import { selecteurPartage, ecouterAvecReessai } from "../commun/selecteur.js";
import { esc, toast, ouvrirFeuille, confirmer } from "../commun/ui.js";
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CATEGORIES = [
    { id: "streaming", nom: "Streaming / TV", emoji: "📺", couleur: "#e07a5f" },
    { id: "musique",   nom: "Musique",        emoji: "🎵", couleur: "#9b84b8" },
    { id: "sport",     nom: "Sport",          emoji: "🏋️", couleur: "#6a9a76" },
    { id: "telecom",   nom: "Téléphone / Internet", emoji: "📱", couleur: "#5b8fb9" },
    { id: "logiciel",  nom: "Logiciels / Cloud", emoji: "💻", couleur: "#3d8a8a" },
    { id: "jeux",      nom: "Jeux vidéo",     emoji: "🎮", couleur: "#7b80c8" },
    { id: "presse",    nom: "Presse / Lecture", emoji: "📰", couleur: "#c08552" },
    { id: "assurance", nom: "Assurances",     emoji: "🛡️", couleur: "#a5576b" },
    { id: "maison",    nom: "Maison / Énergie", emoji: "🏠", couleur: "#d4a017" },
    { id: "autre",     nom: "Autre",          emoji: "📦", couleur: "#8d8780" }
];
const cat = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

const FREQUENCES = [
    { id: "mois",      nom: "par mois",      parMois: 1 },
    { id: "trimestre", nom: "par trimestre", parMois: 1 / 3 },
    { id: "an",        nom: "par an",        parMois: 1 / 12 },
    { id: "semaine",   nom: "par semaine",   parMois: 52 / 12 }
];
const freq = (id) => FREQUENCES.find(f => f.id === id) || FREQUENCES[0];

// Quelques abonnements connus : le nom choisi pré-remplit la catégorie
const CONNUS = {
    "Netflix": "streaming", "Disney+": "streaming", "Amazon Prime": "streaming", "Canal+": "streaming",
    "Max": "streaming", "Apple TV+": "streaming", "Crunchyroll": "streaming", "Paramount+": "streaming",
    "Spotify": "musique", "Deezer": "musique", "Apple Music": "musique", "YouTube Premium": "musique",
    "Salle de sport": "sport", "Basic-Fit": "sport", "Fitness Park": "sport", "Strava": "sport",
    "Forfait mobile": "telecom", "Box internet": "telecom",
    "iCloud+": "logiciel", "Google One": "logiciel", "Microsoft 365": "logiciel", "Adobe Creative Cloud": "logiciel", "ChatGPT Plus": "logiciel",
    "Xbox Game Pass": "jeux", "PlayStation Plus": "jeux", "Nintendo Switch Online": "jeux",
    "Kindle Unlimited": "presse", "Audible": "presse",
    "Assurance habitation": "assurance", "Assurance auto": "assurance", "Mutuelle": "assurance",
    "Électricité": "maison", "Gaz": "maison"
};

let racine, outils, zone, sel;
const S = { gid: null, lignes: [], chargees: false, arret: null };

const lignesCol = (gid = S.gid) => collection(db, "abonnements", gid, "lignes");
const euros = (n) => { const v = Math.round((n || 0) * 100) / 100; return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 }); };
const parMois = (l) => (l.montant || 0) * freq(l.frequence).parMois;

// ---------- Dates de renouvellement ----------
const aujourdHui = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const versDate = (s) => { if (!s) return null; const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; };
function ajouter(d, f) {
    const r = new Date(d);
    if (f === "semaine") r.setDate(r.getDate() + 7);
    else {
        const mois = f === "an" ? 12 : f === "trimestre" ? 3 : 1;
        const jour = r.getDate();
        r.setDate(1); r.setMonth(r.getMonth() + mois);
        const dernier = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
        r.setDate(Math.min(jour, dernier));
    }
    return r;
}
// prochaine échéance à partir d'aujourd'hui (la date enregistrée avance toute seule)
function prochaine(l) {
    let d = versDate(l.prochaine);
    if (!d) return null;
    const auj = aujourdHui();
    let garde = 0;
    while (d < auj && garde++ < 600) d = ajouter(d, l.frequence);
    return d;
}
const joursAvant = (d) => Math.round((d - aujourdHui()) / 864e5);
function quand(d) {
    const j = joursAvant(d);
    if (j === 0) return "aujourd'hui";
    if (j === 1) return "demain";
    if (j < 7) return `dans ${j} jours`;
    return "le " + d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: j > 300 ? "numeric" : undefined });
}

// ---------- Rendu ----------
function rendre() {
    if (!zone) return;
    const entete = `<header><h1 class="titre-logo"><img src="commun/logos/abonnements-192.png" alt="" width="48" height="48"> Abonnements</h1></header>`;
    if (!sel.charge()) { zone.innerHTML = entete + `<p class="ab-vide chargement">Chargement…</p>`; return; }
    if (!sel.courant()) {
        zone.innerHTML = entete + `<div class="widget ab-vide-carte">
            <p class="ab-grand">Suis tes abonnements</p>
            <p class="muet">Netflix, salle de sport, forfait mobile… Note ce que tu paies et quand ça se renouvelle : tu vois ce que ça coûte par mois et par an.</p>
            <button type="button" class="ab-bouton principal" data-action="creer">Commencer ma liste</button>
            <p class="muet petit">Tu pourras la partager, par exemple avec ta copine pour les abonnements du foyer.</p></div>`;
        return;
    }
    outils.titre(`${sel.courant().name} · Abonnements`);
    const actifs = S.lignes.filter(l => l.actif !== false);
    const mois = actifs.reduce((t, l) => t + parMois(l), 0);
    const avecDate = actifs.map(l => ({ l, d: prochaine(l) })).filter(x => x.d).sort((a, b) => a.d - b.d);
    const bientot = avecDate.filter(x => joursAvant(x.d) <= 30);

    // par catégorie
    const parCat = {};
    actifs.forEach(l => { parCat[l.categorie] = (parCat[l.categorie] || 0) + parMois(l); });
    const cats = Object.entries(parCat).sort((a, b) => b[1] - a[1]);
    // par personne qui paie
    const parPayeur = {};
    actifs.forEach(l => { const p = (l.payePar || "").trim(); if (p) parPayeur[p] = (parPayeur[p] || 0) + parMois(l); });
    const payeurs = Object.entries(parPayeur).sort((a, b) => b[1] - a[1]);

    // tous les abonnements : actifs triés par prochaine échéance, puis ceux en pause
    const ordre = [...S.lignes].sort((a, b) => {
        if ((a.actif !== false) !== (b.actif !== false)) return a.actif !== false ? -1 : 1;
        const da = prochaine(a), dbb = prochaine(b);
        if (da && dbb) return da - dbb;
        if (da) return -1; if (dbb) return 1;
        return (a.nom || "").localeCompare(b.nom || "", "fr");
    });

    zone.innerHTML = entete + sel.barre() + `
        <div class="ab-grille">
            <section class="widget ab-total">
                <span class="ab-etiquette">Par mois</span>
                <span class="ab-montant">${euros(mois)}</span>
                <span class="ab-an"><b>${euros(mois * 12)}</b> par an · ${actifs.length} abonnement${actifs.length > 1 ? "s" : ""}</span>
                ${payeurs.length ? `<div class="ab-payeurs">${payeurs.map(([p, m]) => `<span>${esc(p)} : <b>${euros(m)}</b>/mois</span>`).join("")}</div>` : ""}
            </section>
            <section class="widget ab-bientot">
                <h2 class="widget-title">🔔 Prochains renouvellements</h2>
                ${bientot.length ? `<ul>${bientot.slice(0, 6).map(({ l, d }) => `
                    <li><span class="ab-emoji">${cat(l.categorie).emoji}</span>
                        <span class="ab-nom">${esc(l.nom)}</span>
                        <span class="ab-quand ${joursAvant(d) <= 3 ? "proche" : ""}">${quand(d)}</span>
                        <b>${euros(l.montant)}</b></li>`).join("")}</ul>`
                    : `<p class="muet">Rien dans les 30 prochains jours.</p>`}
            </section>
            ${cats.length ? `<section class="widget ab-cats">
                <h2 class="widget-title">📊 Par catégorie</h2>
                ${cats.map(([c, m]) => `<div class="ab-cat">
                    <span class="ab-cat-nom">${cat(c).emoji} ${esc(cat(c).nom)}</span><b>${euros(m)}</b>
                    <span class="ab-barre"><span style="width:${mois ? Math.max(3, m / mois * 100) : 0}%;background:${cat(c).couleur}"></span></span>
                </div>`).join("")}
            </section>` : ""}
        </div>

        <section class="ab-liste-zone">
            <div class="ab-liste-tete">
                <h2>Mes abonnements</h2>
                <button type="button" class="ab-bouton principal" data-action="ajouter">+ Ajouter</button>
            </div>
            ${!S.chargees ? `<p class="ab-vide chargement">Chargement…</p>` : !ordre.length ? `<div class="ab-vide">Aucun abonnement pour l'instant. Ajoute le premier avec « + Ajouter ».</div>` : ""}
            <ul class="ab-liste">
                ${ordre.map(l => {
                    const d = prochaine(l), c = cat(l.categorie), pause = l.actif === false;
                    return `<li class="widget ab-ligne ${pause ? "pause" : ""}" data-id="${esc(l.id)}">
                        <span class="ab-pastille" style="--c:${c.couleur}">${c.emoji}</span>
                        <div class="ab-infos">
                            <b>${esc(l.nom)}</b>
                            <span class="muet">${euros(l.montant)} ${esc(freq(l.frequence).nom)}${l.frequence !== "mois" ? ` · ${euros(parMois(l))}/mois` : ""}</span>
                            <span class="ab-details">
                                ${pause ? `<span class="ab-chip">⏸ En pause</span>` : d ? `<span class="ab-chip ${joursAvant(d) <= 3 ? "proche" : ""}">🔄 ${quand(d)}</span>` : ""}
                                ${l.payePar ? `<span class="ab-chip">💳 ${esc(l.payePar)}</span>` : ""}
                            </span>
                            ${l.note ? `<span class="ab-note">${esc(l.note)}</span>` : ""}
                        </div>
                        <div class="ab-actions">
                            <button type="button" class="ab-icone" data-ligne="pause" title="${pause ? "Réactiver" : "Mettre en pause"}" aria-label="${pause ? "Réactiver" : "Mettre en pause"}">${pause ? "▶️" : "⏸️"}</button>
                            <button type="button" class="ab-icone" data-ligne="modifier" title="Modifier" aria-label="Modifier">✏️</button>
                            <button type="button" class="ab-icone" data-ligne="supprimer" title="Supprimer" aria-label="Supprimer">🗑️</button>
                        </div>
                    </li>`;
                }).join("")}
            </ul>
        </section>`;
    sel.brancher(zone);
}

// ---------- Fiche d'un abonnement ----------
function fiche(ligne) {
    const nouveau = !ligne;
    const l = ligne || { nom: "", montant: null, frequence: "mois", prochaine: null, categorie: "streaming", payePar: compte.nom || "", actif: true, note: null };
    const payeurs = [...new Set([compte.nom, ...S.lignes.map(x => x.payePar)].filter(Boolean))];
    const f = ouvrirFeuille({ titre: nouveau ? "Nouvel abonnement" : "Modifier l'abonnement" });
    f.corps.innerHTML = `<form class="ab-fiche" autocomplete="off">
        <label class="champ"><span>Nom</span><input name="nom" list="ab-connus" maxlength="60" required value="${esc(l.nom)}" placeholder="Ex. Netflix, salle de sport…"></label>
        <datalist id="ab-connus">${Object.keys(CONNUS).map(n => `<option value="${esc(n)}">`).join("")}</datalist>
        <div class="ab-fiche-ligne">
            <label class="champ"><span>Prix (€)</span><input name="montant" type="number" min="0" max="100000" step="0.01" required value="${l.montant ?? ""}" inputmode="decimal" placeholder="13,49"></label>
            <label class="champ"><span>Fréquence</span><select name="frequence">${FREQUENCES.map(x => `<option value="${x.id}" ${x.id === l.frequence ? "selected" : ""}>${esc(x.nom)}</option>`).join("")}</select></label>
        </div>
        <label class="champ"><span>Prochain renouvellement</span><input name="prochaine" type="date" value="${esc(l.prochaine || "")}"></label>
        <label class="champ"><span>Catégorie</span><select name="categorie">${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === l.categorie ? "selected" : ""}>${c.emoji} ${esc(c.nom)}</option>`).join("")}</select></label>
        <label class="champ"><span>Payé par (facultatif)</span><input name="payePar" list="ab-payeurs" maxlength="40" value="${esc(l.payePar || "")}" placeholder="Qui paie ?"></label>
        <datalist id="ab-payeurs">${payeurs.map(p => `<option value="${esc(p)}">`).join("")}</datalist>
        <label class="champ"><span>Note (facultatif)</span><input name="note" maxlength="200" value="${esc(l.note || "")}" placeholder="Ex. offre famille, résiliable en ligne"></label>
        <button class="bouton principal large" type="submit">${nouveau ? "Ajouter" : "Enregistrer"}</button>
    </form>`;
    const form = f.corps.querySelector("form");
    form.nom.addEventListener("change", () => { if (CONNUS[form.nom.value]) form.categorie.value = CONNUS[form.nom.value]; });
    if (nouveau) setTimeout(() => form.nom.focus(), 50);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const montant = Math.round(parseFloat(String(form.montant.value).replace(",", ".")) * 100) / 100;
        if (!Number.isFinite(montant) || montant < 0) { toast("Indique un prix valable."); form.montant.focus(); return; }
        const donnees = {
            nom: form.nom.value.trim(), montant, frequence: form.frequence.value,
            prochaine: form.prochaine.value || null, categorie: form.categorie.value,
            payePar: form.payePar.value.trim() || null, actif: l.actif !== false,
            note: form.note.value.trim() || null, modifiePar: compte.uid
        };
        f.fermer();
        try {
            if (nouveau) await addDoc(lignesCol(), { ...donnees, creeLe: Date.now() });
            else await updateDoc(doc(lignesCol(), ligne.id), donnees);
            toast(nouveau ? `« ${donnees.nom} » ajouté.` : "Abonnement mis à jour.");
        } catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    });
}

// ---------- Données ----------
function ouvrir(groupe) {
    const gid = groupe?.id || null;
    if (gid === S.gid) { rendre(); return; }
    S.arret?.(); S.arret = null;
    S.gid = gid; S.lignes = []; S.chargees = false;
    rendre();
    if (!gid) return;
    S.arret = ecouterAvecReessai(
        (ko) => onSnapshot(lignesCol(gid), snap => {
            if (gid !== S.gid) return;
            S.lignes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            S.chargees = true;
            rendre();
        }, ko),
        () => gid === S.gid
    );
}

async function vider(gid) {
    const snap = await getDocs(lignesCol(gid));
    for (let i = 0; i < snap.docs.length; i += 400) {
        const lot = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
        await lot.commit();
    }
}

// ---------- Cycle de vie (coquille) ----------
export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur; outils = outilsCoquille;
    zone = racine.querySelector("#ab-app");
    sel = selecteurPartage({
        collection: "abonnements", quoi: "cette liste", nomNouveau: "Nouvelle liste d'abonnements",
        etiquette: "Nom de la liste", exemple: "Ex. Abonnements du foyer", memo: "abonnements-courant",
        supprimerContenu: vider,
        quandChange: (groupe) => ouvrir(groupe),
        quandErreur: () => { zone.innerHTML = `<p class="ab-vide">Les abonnements n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; }
    });
    rendre();
    zone.addEventListener("click", async (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.action === "creer") { b.disabled = true; await sel.creer("Mes abonnements"); b.disabled = false; }
        else if (b.dataset.action === "ajouter") fiche(null);
        else if (b.dataset.ligne) {
            const l = S.lignes.find(x => x.id === b.closest(".ab-ligne").dataset.id); if (!l) return;
            if (b.dataset.ligne === "modifier") fiche(l);
            else if (b.dataset.ligne === "pause") {
                updateDoc(doc(lignesCol(), l.id), { actif: l.actif === false, modifiePar: compte.uid })
                    .then(() => toast(l.actif === false ? `« ${l.nom} » réactivé.` : `« ${l.nom} » en pause : il ne compte plus dans le total.`))
                    .catch(() => toast("Modification impossible."));
            } else if (b.dataset.ligne === "supprimer") {
                if (!await confirmer({ titre: `Supprimer « ${l.nom} » ?`, message: "Il disparaîtra de la liste pour tout le monde.", bouton: "Supprimer", danger: true })) return;
                deleteDoc(doc(lignesCol(), l.id)).then(() => toast("Abonnement supprimé.")).catch(() => toast("Suppression impossible."));
            }
        }
    });
}

export function afficher() { rendre(); }
