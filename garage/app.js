// ==========================================
// GARAGE : carnet d'entretien des véhicules
// Appli chargée dans la page principale (voir commun/coquille.js).
//
// Pages internes :
//   #/garage              les entretiens et leurs alertes
//   #/garage/fiche        fiche technique (pressions, capacités, références)
//   #/garage/historique   historique des révisions
//
// Données (partagées comme les listes) :
//   vehicules/{id}                     un véhicule (name, ownerId, memberIds…)
//   vehicules/{id}/donnees/fiche       type, marque, modele, annee, immat, km, kmLe,
//                                      pneusAv, pneusAr, capacites [{id, nom, valeur}]
//   vehicules/{id}/entretiens/{id}     nom, intervalleKm, intervalleMois, dernierKm,
//                                      derniereDate, valeur, note, ordre
//   vehicules/{id}/historique/{id}     date, km, titre, details, cout, lieu, entretienId
// ==========================================
import { db } from "../commun/firebase.js";
import { compte } from "../commun/compte.js";
import { selecteurPartage, ecouterAvecReessai } from "../commun/selecteur.js";
import { esc, toast, ouvrirFeuille, confirmer } from "../commun/ui.js";
import {
    collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDocs, writeBatch
} from "../commun/firestore.js";
import { TYPES, typeDe, ENTRETIENS, CAPACITES } from "./modeles.js";

let racine, outils, zone, sel;
const FICHE_VIDE = () => ({ type: null, marque: "", modele: "", annee: null, immat: "", km: null, kmLe: null, pneusAv: null, pneusAr: null, capacites: [] });
const S = {
    vid: null, fiche: FICHE_VIDE(), ficheChargee: false,
    entretiens: [], entretiensCharges: false, historique: [], historiqueCharge: false,
    arrets: [], onglet: "entretiens"
};

const ref = {
    fiche: (v = S.vid) => doc(db, "vehicules", v, "donnees", "fiche"),
    entretiens: (v = S.vid) => collection(db, "vehicules", v, "entretiens"),
    historique: (v = S.vid) => collection(db, "vehicules", v, "historique")
};
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- Mise en forme ----------
const km = (n) => n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} km`;
const euros = (n) => { const v = Math.round((n || 0) * 100) / 100; return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 }); };
const bar = (n) => n == null ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} bar`;
const aujourdhuiISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const versDate = (s) => { if (!s) return null; const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; };
const dateCourte = (s) => versDate(s)?.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) || "";
function plusMois(s, n) {
    const d = versDate(s); if (!d) return null;
    const jour = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(jour, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
}
const entier = (v) => { if (v === "" || v == null) return null; const n = parseInt(String(v).replace(/\s/g, ""), 10); return Number.isFinite(n) && n >= 0 ? n : null; };
const decimal = (v) => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };

// ---------- État d'un entretien (alerte) ----------
// renvoie { niveau: "retard" | "bientot" | "jamais" | "ok", texte, avance (0 à 1) }
function etat(e) {
    const kmActuel = S.fiche.km;
    const jamais = e.dernierKm == null && !e.derniereDate;
    const morceaux = [];
    let niveau = "ok", avance = 0;
    if (e.intervalleKm && e.dernierKm != null && kmActuel != null) {
        const reste = e.dernierKm + e.intervalleKm - kmActuel;
        avance = Math.max(avance, 1 - reste / e.intervalleKm);
        if (reste <= 0) { niveau = "retard"; morceaux.push(`dépassé de ${km(-reste)}`); }
        else { if (reste <= Math.max(e.intervalleKm * 0.1, 100)) niveau = "bientot"; morceaux.push(`dans ${km(reste)}`); }
    }
    if (e.intervalleMois && e.derniereDate) {
        const echeance = plusMois(e.derniereDate, e.intervalleMois);
        const jours = Math.round((echeance - versDate(aujourdhuiISO())) / 864e5);
        avance = Math.max(avance, 1 - jours / (e.intervalleMois * 30.4));
        if (jours < 0) { niveau = "retard"; morceaux.push(`date dépassée (${echeance.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })})`); }
        else {
            if (jours <= Math.min(30, Math.max(3, e.intervalleMois * 4)) && niveau !== "retard") niveau = "bientot";
            morceaux.push(jours <= 60 ? `dans ${jours} jour${jours > 1 ? "s" : ""}` : `avant le ${echeance.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`);
        }
    }
    if (jamais) return { niveau: "jamais", texte: "Pas encore fait : touche « Fait » pour démarrer le suivi", avance: 0 };
    if (!morceaux.length) return { niveau: "ok", texte: e.intervalleKm && kmActuel == null ? "Indique le kilométrage du véhicule" : "Pas d'intervalle réglé", avance: 0 };
    return { niveau, texte: morceaux.join(niveau === "retard" ? " · " : " ou "), avance: Math.min(1, Math.max(0, avance)) };
}
const RANG = { retard: 0, bientot: 1, jamais: 2, ok: 3 };
const ETIQUETTE = { retard: "En retard", bientot: "Bientôt", jamais: "À renseigner", ok: "OK" };
const rappelIntervalle = (e) => [e.intervalleKm ? `tous les ${km(e.intervalleKm)}` : "", e.intervalleMois ? (e.intervalleMois === 1 ? "tous les mois" : e.intervalleMois === 12 ? "tous les ans" : `tous les ${e.intervalleMois} mois`) : ""].filter(Boolean).join(" ou ");

// ==========================================
// RENDU
// ==========================================
function rendre() {
    if (!zone) return;
    const entete = `<header><h1 class="titre-logo"><img src="commun/logos/garage-192.png" alt="" width="48" height="48"> Garage</h1></header>`;
    if (!sel.charge()) { zone.innerHTML = entete + `<p class="ga-vide chargement">Chargement…</p>`; return; }
    if (!sel.courant()) {
        zone.innerHTML = entete + `<div class="widget ga-vide-carte">
            <p class="ga-grand">Ton carnet d'entretien</p>
            <p class="muet">Note l'historique des révisions de ta moto, ta voiture ou ton vélo, règle des alertes au kilométrage (pression des pneus, graissage de la chaîne, vidange…) et garde les capacités exactes de ton modèle.</p>
            <button type="button" class="ga-bouton principal" data-action="creer">Ajouter mon véhicule</button>
            <p class="muet petit">Tu pourras le partager, par exemple pour la voiture du foyer.</p></div>`;
        return;
    }
    const v = sel.courant(), f = S.fiche, type = typeDe(f.type);
    outils.titre(`${v.name} · Garage`);
    if (!S.ficheChargee) { zone.innerHTML = entete + sel.barre() + `<p class="ga-vide chargement">Chargement…</p>`; sel.brancher(zone); return; }

    // pas encore de type : on commence par là
    if (!f.type) {
        zone.innerHTML = entete + sel.barre() + `<div class="widget ga-vide-carte">
            <p class="ga-grand">Quel type de véhicule ?</p>
            <div class="ga-types">${TYPES.map(t => `<button type="button" class="ga-type" data-type="${t.id}"><span>${t.emoji}</span>${esc(t.nom)}</button>`).join("")}</div>
            <p class="muet petit">On te proposera les entretiens courants pour ce type de véhicule.</p></div>`;
        sel.brancher(zone);
        return;
    }

    const alertes = S.entretiens.map(e => etat(e)).filter(x => x.niveau === "retard" || x.niveau === "bientot");
    const nbRetard = alertes.filter(x => x.niveau === "retard").length, nbBientot = alertes.length - nbRetard;
    const onglets = [["entretiens", "🔔 Entretiens"], ["fiche", "📋 Fiche<span class=\"ga-o-long\"> technique</span>"], ["historique", "🗂️ Historique"]];
    zone.innerHTML = entete + sel.barre() + `
        <section class="widget ga-vehicule">
            <span class="ga-vehicule-emoji">${type.emoji}</span>
            <div class="ga-vehicule-infos">
                <b>${esc([f.marque, f.modele].filter(Boolean).join(" ") || v.name)}</b>
                <span class="muet">${esc([f.annee, f.immat].filter(Boolean).join(" · ") || type.nom)}</span>
            </div>
            <button type="button" class="ga-km" data-action="km" title="Mettre à jour le kilométrage">
                <span class="ga-etiquette">Compteur</span><b>${km(f.km)}</b>
                <span class="muet petit">${f.kmLe ? `le ${dateCourte(f.kmLe)}` : "à indiquer"} · ✏️</span>
            </button>
            ${alertes.length ? `<p class="ga-resume ${nbRetard ? "retard" : "bientot"}">${nbRetard ? `⚠️ ${nbRetard} entretien${nbRetard > 1 ? "s" : ""} en retard` : ""}${nbRetard && nbBientot ? " · " : ""}${nbBientot ? `⏳ ${nbBientot} bientôt` : ""}</p>`
                : S.entretiens.length ? `<p class="ga-resume ok">✓ Tout est à jour</p>` : ""}
        </section>
        <nav class="ga-onglets" aria-label="Sections">
            ${onglets.map(([id, nom]) => `<a href="${outils.lien(id === "entretiens" ? "" : id)}" class="ga-onglet ${S.onglet === id ? "actif" : ""}" ${S.onglet === id ? 'aria-current="page"' : ""}>${nom}</a>`).join("")}
        </nav>
        <div class="ga-page">${S.onglet === "fiche" ? pageFiche() : S.onglet === "historique" ? pageHistorique() : pageEntretiens()}</div>`;
    sel.brancher(zone);
}

function pageEntretiens() {
    if (!S.entretiensCharges) return `<p class="ga-vide chargement">Chargement…</p>`;
    const liste = S.entretiens.map(e => ({ e, st: etat(e) }))
        .sort((a, b) => RANG[a.st.niveau] - RANG[b.st.niveau] || b.st.avance - a.st.avance || (a.e.ordre || 0) - (b.e.ordre || 0));
    const type = S.fiche.type;
    const proposes = (ENTRETIENS[type] || []).filter(m => !S.entretiens.some(e => e.nom === m.nom));
    return `
        ${!S.entretiens.length ? `<div class="widget ga-modeles">
            <p><b>Entretiens courants pour ${esc(typeDe(type).nom.toLowerCase())}</b></p>
            <p class="muet petit">Valeurs indicatives : tu pourras les régler selon le carnet de ton modèle.</p>
            <button type="button" class="ga-bouton principal" data-action="modeles">Ajouter les ${proposes.length} entretiens courants</button>
        </div>` : ""}
        <ul class="ga-entretiens">
            ${liste.map(({ e, st }) => `<li class="widget ga-entretien ${st.niveau}" data-id="${esc(e.id)}">
                <div class="ga-ent-tete">
                    <div class="ga-ent-nom"><b>${esc(e.nom)}</b><span class="muet petit">${esc(rappelIntervalle(e) || "Sans alerte")}</span></div>
                    <span class="ga-pastille ${st.niveau}">${ETIQUETTE[st.niveau]}</span>
                </div>
                ${e.valeur ? `<p class="ga-valeur">📌 ${esc(e.valeur)}</p>` : ""}
                ${st.niveau !== "jamais" && (e.intervalleKm || e.intervalleMois) ? `<div class="ga-jauge"><span style="width:${Math.round(st.avance * 100)}%"></span></div>` : ""}
                <p class="ga-etat">${esc(st.texte)}</p>
                ${e.dernierKm != null || e.derniereDate ? `<p class="muet petit">Dernière fois : ${esc([e.derniereDate ? dateCourte(e.derniereDate) : "", e.dernierKm != null ? km(e.dernierKm) : ""].filter(Boolean).join(" · "))}</p>` : ""}
                ${e.note ? `<p class="ga-note">${esc(e.note)}</p>` : ""}
                <div class="ga-ent-actions">
                    <button type="button" class="ga-bouton principal petit" data-ent="fait">✓ Fait</button>
                    <button type="button" class="ga-icone" data-ent="modifier" aria-label="Modifier" title="Modifier">✏️</button>
                    <button type="button" class="ga-icone" data-ent="supprimer" aria-label="Supprimer" title="Supprimer">🗑️</button>
                </div>
            </li>`).join("")}
        </ul>
        <div class="ga-ajouts">
            <button type="button" class="ga-ajout" data-action="nouvel-entretien">+ Nouvel entretien</button>
            ${S.entretiens.length && proposes.length ? `<button type="button" class="ga-lien" data-action="modeles">Ajouter les entretiens courants manquants (${proposes.length})</button>` : ""}
        </div>`;
}

function pageFiche() {
    const f = S.fiche;
    const proposes = (CAPACITES[f.type] || []).filter(n => !f.capacites.some(c => c.nom === n));
    return `<div class="ga-grille">
        <section class="widget ga-bloc">
            <h2 class="widget-title">🚘 Véhicule</h2>
            <div class="ga-champs2">
                <label class="ga-champ"><span>Marque</span><input data-fiche="marque" maxlength="40" value="${esc(f.marque)}" placeholder="Ex. Yamaha"></label>
                <label class="ga-champ"><span>Modèle</span><input data-fiche="modele" maxlength="40" value="${esc(f.modele)}" placeholder="Ex. MT-07"></label>
                <label class="ga-champ"><span>Année</span><input data-fiche="annee" type="number" min="1900" max="2100" inputmode="numeric" value="${f.annee ?? ""}"></label>
                <label class="ga-champ"><span>Immatriculation</span><input data-fiche="immat" maxlength="20" value="${esc(f.immat)}" placeholder="AB-123-CD"></label>
            </div>
            <label class="ga-champ"><span>Type</span><select data-fiche="type">${TYPES.map(t => `<option value="${t.id}" ${t.id === f.type ? "selected" : ""}>${t.emoji} ${esc(t.nom)}</option>`).join("")}</select></label>
        </section>
        <section class="widget ga-bloc">
            <h2 class="widget-title">🛞 Pression des pneus</h2>
            <div class="ga-pneus">
                <label class="ga-pneu"><span>Avant</span>
                    <div class="ga-pas"><button type="button" data-pneu="pneusAv" data-pas="-0.05" aria-label="Moins">−</button>
                    <input data-fiche="pneusAv" type="number" min="0" max="10" step="0.05" inputmode="decimal" value="${f.pneusAv ?? ""}" placeholder="2,25">
                    <button type="button" data-pneu="pneusAv" data-pas="0.05" aria-label="Plus">+</button></div><small>bar</small></label>
                <label class="ga-pneu"><span>Arrière</span>
                    <div class="ga-pas"><button type="button" data-pneu="pneusAr" data-pas="-0.05" aria-label="Moins">−</button>
                    <input data-fiche="pneusAr" type="number" min="0" max="10" step="0.05" inputmode="decimal" value="${f.pneusAr ?? ""}" placeholder="2,5">
                    <button type="button" data-pneu="pneusAr" data-pas="0.05" aria-label="Plus">+</button></div><small>bar</small></label>
            </div>
            <p class="muet petit">À froid. ${f.pneusAv != null && f.pneusAr != null ? `Soit ${Math.round(f.pneusAv * 14.504)} / ${Math.round(f.pneusAr * 14.504)} psi.` : ""}</p>
        </section>
        <section class="widget ga-bloc ga-large">
            <h2 class="widget-title">🛢️ Capacités et références</h2>
            <p class="muet petit">Quantités exactes et produits pour ton modèle (ex. « 3,1 L · 10W40 avec filtre »).</p>
            <ul class="ga-capacites">
                ${f.capacites.map(c => `<li class="ga-capacite" data-id="${esc(c.id)}">
                    <input class="ga-cap-nom" data-cap="nom" maxlength="40" value="${esc(c.nom)}" aria-label="Élément">
                    <input class="ga-cap-val" data-cap="valeur" maxlength="80" value="${esc(c.valeur || "")}" placeholder="Quantité, norme, référence…" aria-label="Valeur de ${esc(c.nom)}">
                    <button type="button" class="ga-icone" data-action="retirer-cap" aria-label="Retirer ${esc(c.nom)}" title="Retirer">✕</button>
                </li>`).join("")}
            </ul>
            <div class="ga-rapides">
                ${proposes.map(n => `<button type="button" class="ga-puce" data-cap-rapide="${esc(n)}">+ ${esc(n)}</button>`).join("")}
                <button type="button" class="ga-puce" data-cap-rapide="">+ Autre</button>
            </div>
        </section>
    </div>`;
}

function pageHistorique() {
    if (!S.historiqueCharge) return `<p class="ga-vide chargement">Chargement…</p>`;
    const liste = [...S.historique].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.km || 0) - (a.km || 0));
    const total = liste.reduce((t, h) => t + (h.cout || 0), 0);
    const annee = new Date().getFullYear();
    const cetteAnnee = liste.filter(h => (h.date || "").startsWith(String(annee))).reduce((t, h) => t + (h.cout || 0), 0);
    return `
        <div class="ga-hist-tete">
            ${total ? `<span class="ga-cout-total">💶 ${euros(cetteAnnee)} en ${annee} · ${euros(total)} au total</span>` : `<span></span>`}
            <button type="button" class="ga-bouton principal" data-action="nouvelle-intervention">+ Ajouter</button>
        </div>
        ${!liste.length ? `<div class="ga-vide">Aucune intervention notée. Ajoute la dernière révision avec « + Ajouter », ou touche « ✓ Fait » sur un entretien.</div>` : ""}
        <ol class="ga-historique">
            ${liste.map(h => `<li class="widget ga-hist" data-id="${esc(h.id)}">
                <div class="ga-hist-date"><b>${esc(dateCourte(h.date))}</b>${h.km != null ? `<span>${km(h.km)}</span>` : ""}</div>
                <div class="ga-hist-corps">
                    <b>${esc(h.titre)}</b>
                    ${h.details ? `<p>${esc(h.details)}</p>` : ""}
                    <span class="muet petit">${esc([h.lieu, h.cout != null ? euros(h.cout) : ""].filter(Boolean).join(" · "))}</span>
                </div>
                <div class="ga-hist-actions">
                    <button type="button" class="ga-icone" data-hist="modifier" aria-label="Modifier" title="Modifier">✏️</button>
                    <button type="button" class="ga-icone" data-hist="supprimer" aria-label="Supprimer" title="Supprimer">🗑️</button>
                </div>
            </li>`).join("")}
        </ol>`;
}

// ==========================================
// FENÊTRES
// ==========================================
function ficheKm() {
    const f = ouvrirFeuille({ titre: "Kilométrage du compteur" });
    f.corps.innerHTML = `<form class="ga-form" autocomplete="off">
        <label class="champ"><span>Kilométrage actuel</span><input name="km" type="number" min="0" max="2000000" inputmode="numeric" required value="${S.fiche.km ?? ""}" placeholder="Ex. 12 450"></label>
        <button class="bouton principal large" type="submit">Enregistrer</button></form>`;
    const form = f.corps.querySelector("form"); form.km.focus(); form.km.select();
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const n = entier(form.km.value); if (n == null) return;
        if (S.fiche.km != null && n < S.fiche.km && !await confirmer({ titre: "Kilométrage plus bas ?", message: `Le compteur indiquait ${km(S.fiche.km)}. Corriger en ${km(n)} ?`, bouton: "Corriger" })) return;
        f.fermer();
        await enregistrerFiche({ km: n, kmLe: aujourdhuiISO() });
        toast(`Compteur : ${km(n)}`);
    });
}

function ficheEntretien(e) {
    const nouveau = !e;
    const x = e || { nom: "", intervalleKm: null, intervalleMois: null, dernierKm: null, derniereDate: null, valeur: null, note: null };
    const f = ouvrirFeuille({ titre: nouveau ? "Nouvel entretien" : "Modifier l'entretien" });
    f.corps.innerHTML = `<form class="ga-form" autocomplete="off">
        <label class="champ"><span>Entretien</span><input name="nom" maxlength="60" required value="${esc(x.nom)}" placeholder="Ex. Graissage de la chaîne"></label>
        <div class="ga-form2">
            <label class="champ"><span>Tous les… (km)</span><input name="intervalleKm" type="number" min="0" max="500000" inputmode="numeric" value="${x.intervalleKm ?? ""}" placeholder="Ex. 500"></label>
            <label class="champ"><span>ou tous les… (mois)</span><input name="intervalleMois" type="number" min="0" max="240" inputmode="numeric" value="${x.intervalleMois ?? ""}" placeholder="—"></label>
        </div>
        <label class="champ"><span>Rappel (valeur, produit…)</span><input name="valeur" maxlength="80" value="${esc(x.valeur || "")}" placeholder="Ex. AV 2,25 bar · AR 2,5 bar"></label>
        <div class="ga-form2">
            <label class="champ"><span>Fait la dernière fois à (km)</span><input name="dernierKm" type="number" min="0" inputmode="numeric" value="${x.dernierKm ?? ""}" placeholder="—"></label>
            <label class="champ"><span>le</span><input name="derniereDate" type="date" value="${esc(x.derniereDate || "")}"></label>
        </div>
        <label class="champ"><span>Note (facultatif)</span><input name="note" maxlength="200" value="${esc(x.note || "")}"></label>
        <button class="bouton principal large" type="submit">${nouveau ? "Ajouter" : "Enregistrer"}</button></form>`;
    const form = f.corps.querySelector("form");
    if (nouveau) setTimeout(() => form.nom.focus(), 50);
    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const d = {
            nom: form.nom.value.trim(),
            intervalleKm: entier(form.intervalleKm.value) || null, intervalleMois: entier(form.intervalleMois.value) || null,
            dernierKm: entier(form.dernierKm.value), derniereDate: form.derniereDate.value || null,
            valeur: form.valeur.value.trim() || null, note: form.note.value.trim() || null, modifiePar: compte.uid
        };
        f.fermer();
        try {
            if (nouveau) await addDoc(ref.entretiens(), { ...d, ordre: Date.now(), creeLe: Date.now() });
            else await updateDoc(doc(ref.entretiens(), e.id), d);
            toast(nouveau ? `« ${d.nom} » ajouté.` : "Entretien mis à jour.");
        } catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    });
}

// « Fait » : on note l'intervention dans l'historique et l'alerte repart à zéro
function ficheFait(e) {
    const f = ouvrirFeuille({ titre: `✓ ${e.nom}` });
    f.corps.innerHTML = `<form class="ga-form" autocomplete="off">
        <div class="ga-form2">
            <label class="champ"><span>Date</span><input name="date" type="date" required value="${aujourdhuiISO()}"></label>
            <label class="champ"><span>Kilométrage</span><input name="km" type="number" min="0" inputmode="numeric" value="${S.fiche.km ?? ""}" placeholder="—"></label>
        </div>
        <div class="ga-form2">
            <label class="champ"><span>Coût (€, facultatif)</span><input name="cout" type="number" min="0" step="0.01" inputmode="decimal" placeholder="—"></label>
            <label class="champ"><span>Où (facultatif)</span><input name="lieu" maxlength="60" placeholder="Moi, garage…"></label>
        </div>
        <label class="champ"><span>Détails (facultatif)</span><input name="details" maxlength="300" value="${esc(e.valeur || "")}" placeholder="Produits, pièces, remarques…"></label>
        <label class="ga-case"><input type="checkbox" name="historique" checked><span>Ajouter à l'historique</span></label>
        <button class="bouton principal large" type="submit">Enregistrer</button></form>`;
    const form = f.corps.querySelector("form");
    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const date = form.date.value || aujourdhuiISO(), k = entier(form.km.value);
        f.fermer();
        try {
            await updateDoc(doc(ref.entretiens(), e.id), { dernierKm: k, derniereDate: date, modifiePar: compte.uid });
            if (form.historique.checked) await addDoc(ref.historique(), {
                date, km: k, titre: e.nom, details: form.details.value.trim() || null,
                cout: decimal(form.cout.value), lieu: form.lieu.value.trim() || null,
                entretienId: e.id, creeLe: Date.now(), creePar: compte.uid
            });
            if (k != null && (S.fiche.km == null || k > S.fiche.km)) await enregistrerFiche({ km: k, kmLe: date });
            toast(`« ${e.nom} » noté ✔`);
        } catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    });
}

function ficheIntervention(h) {
    const nouveau = !h;
    const x = h || { date: aujourdhuiISO(), km: S.fiche.km, titre: "", details: null, cout: null, lieu: null };
    const f = ouvrirFeuille({ titre: nouveau ? "Nouvelle intervention" : "Modifier l'intervention" });
    f.corps.innerHTML = `<form class="ga-form" autocomplete="off">
        <label class="champ"><span>Intervention</span><input name="titre" maxlength="80" required value="${esc(x.titre)}" placeholder="Ex. Révision des 12 000 km" list="ga-noms"></label>
        <datalist id="ga-noms">${S.entretiens.map(e => `<option value="${esc(e.nom)}">`).join("")}</datalist>
        <div class="ga-form2">
            <label class="champ"><span>Date</span><input name="date" type="date" required value="${esc(x.date || "")}"></label>
            <label class="champ"><span>Kilométrage</span><input name="km" type="number" min="0" inputmode="numeric" value="${x.km ?? ""}" placeholder="—"></label>
        </div>
        <div class="ga-form2">
            <label class="champ"><span>Coût (€)</span><input name="cout" type="number" min="0" step="0.01" inputmode="decimal" value="${x.cout ?? ""}" placeholder="—"></label>
            <label class="champ"><span>Où</span><input name="lieu" maxlength="60" value="${esc(x.lieu || "")}" placeholder="Moi, garage…"></label>
        </div>
        <label class="champ"><span>Détails</span><textarea name="details" maxlength="300" rows="3" placeholder="Pièces changées, produits utilisés…">${esc(x.details || "")}</textarea></label>
        <button class="bouton principal large" type="submit">${nouveau ? "Ajouter" : "Enregistrer"}</button></form>`;
    const form = f.corps.querySelector("form");
    if (nouveau) setTimeout(() => form.titre.focus(), 50);
    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const d = {
            date: form.date.value || aujourdhuiISO(), km: entier(form.km.value), titre: form.titre.value.trim(),
            details: form.details.value.trim() || null, cout: decimal(form.cout.value), lieu: form.lieu.value.trim() || null
        };
        f.fermer();
        try {
            if (nouveau) await addDoc(ref.historique(), { ...d, entretienId: null, creeLe: Date.now(), creePar: compte.uid });
            else await updateDoc(doc(ref.historique(), h.id), d);
            if (d.km != null && (S.fiche.km == null || d.km > S.fiche.km)) await enregistrerFiche({ km: d.km, kmLe: d.date });
            toast(nouveau ? "Intervention ajoutée." : "Intervention mise à jour.");
        } catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    });
}

// ==========================================
// ÉCRITURES
// ==========================================
let minuteurFiche = null;
async function enregistrerFiche(modifs = {}, { attendre = false } = {}) {
    Object.assign(S.fiche, modifs);
    clearTimeout(minuteurFiche);
    const vid = S.vid, envoyer = () => {
        minuteurFiche = null;
        const f = S.fiche;
        return setDoc(ref.fiche(vid), {
            type: f.type, marque: f.marque || "", modele: f.modele || "", annee: f.annee ?? null, immat: f.immat || "",
            km: f.km ?? null, kmLe: f.kmLe || null, pneusAv: f.pneusAv ?? null, pneusAr: f.pneusAr ?? null,
            capacites: f.capacites, modifieLe: Date.now(), modifiePar: compte.uid
        }).catch(e => { console.error(e); toast("Modification non enregistrée. Réessaie."); });
    };
    if (attendre) { minuteurFiche = setTimeout(envoyer, 700); return; }
    return envoyer();
}

async function ajouterModeles() {
    const proposes = (ENTRETIENS[S.fiche.type] || []).filter(m => !S.entretiens.some(e => e.nom === m.nom));
    if (!proposes.length) return;
    const lot = writeBatch(db), t = Date.now();
    proposes.forEach((m, i) => lot.set(doc(ref.entretiens()), {
        nom: m.nom, intervalleKm: m.km, intervalleMois: m.mois, dernierKm: null, derniereDate: null,
        valeur: m.valeur, note: null, ordre: t + i, creeLe: t, modifiePar: compte.uid
    }));
    try { await lot.commit(); toast(`${proposes.length} entretiens ajoutés. Touche « ✓ Fait » pour noter la dernière fois.`); }
    catch (e) { console.error(e); toast("Ajout impossible. Réessaie."); }
}

async function viderVehicule(vid) {
    for (const col of [ref.entretiens(vid), ref.historique(vid)]) {
        const snap = await getDocs(col);
        for (let i = 0; i < snap.docs.length; i += 400) {
            const lot = writeBatch(db);
            snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
            await lot.commit();
        }
    }
    await deleteDoc(ref.fiche(vid));
}

// ==========================================
// ACTIONS
// ==========================================
function brancher() {
    zone.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button"); if (!b) return;
        const a = b.dataset.action;
        if (a === "creer") { b.disabled = true; await sel.creer("Mon véhicule"); b.disabled = false; }
        else if (b.dataset.type) { await enregistrerFiche({ type: b.dataset.type }); }
        else if (a === "km") ficheKm();
        else if (a === "modeles") ajouterModeles();
        else if (a === "nouvel-entretien") ficheEntretien(null);
        else if (a === "nouvelle-intervention") ficheIntervention(null);
        else if (b.dataset.ent) {
            const e = S.entretiens.find(x => x.id === b.closest(".ga-entretien").dataset.id); if (!e) return;
            if (b.dataset.ent === "fait") ficheFait(e);
            else if (b.dataset.ent === "modifier") ficheEntretien(e);
            else if (b.dataset.ent === "supprimer") {
                if (!await confirmer({ titre: `Supprimer « ${e.nom} » ?`, message: "L'alerte disparaît ; l'historique déjà noté est gardé.", bouton: "Supprimer", danger: true })) return;
                deleteDoc(doc(ref.entretiens(), e.id)).then(() => toast("Entretien supprimé.")).catch(() => toast("Suppression impossible."));
            }
        }
        else if (b.dataset.hist) {
            const h = S.historique.find(x => x.id === b.closest(".ga-hist").dataset.id); if (!h) return;
            if (b.dataset.hist === "modifier") ficheIntervention(h);
            else if (await confirmer({ titre: "Supprimer cette intervention ?", message: `« ${h.titre} » du ${dateCourte(h.date)}`, bouton: "Supprimer", danger: true }))
                deleteDoc(doc(ref.historique(), h.id)).then(() => toast("Intervention supprimée.")).catch(() => toast("Suppression impossible."));
        }
        else if (b.dataset.pneu) {
            const champ = b.dataset.pneu, v = S.fiche[champ] == null ? 2 : Math.max(0, Math.round((S.fiche[champ] + Number(b.dataset.pas)) * 100) / 100);
            zone.querySelector(`[data-fiche="${champ}"]`).value = v;
            enregistrerFiche({ [champ]: v }, { attendre: true });
        }
        else if (b.dataset.capRapide !== undefined) {
            S.fiche.capacites.push({ id: uid(), nom: b.dataset.capRapide || "Autre", valeur: "" });
            await enregistrerFiche();
            rendre();
            const champs = zone.querySelectorAll(b.dataset.capRapide ? '[data-cap="valeur"]' : '[data-cap="nom"]');
            champs[champs.length - 1]?.focus();
        }
        else if (a === "retirer-cap") {
            const id = b.closest(".ga-capacite").dataset.id;
            S.fiche.capacites = S.fiche.capacites.filter(c => c.id !== id);
            await enregistrerFiche(); rendre();
        }
    });
    // champs de la fiche : enregistrés après une petite pause
    zone.addEventListener("input", (ev) => {
        const t = ev.target;
        if (t.dataset.fiche) {
            const c = t.dataset.fiche;
            const v = ["annee"].includes(c) ? entier(t.value) : ["pneusAv", "pneusAr"].includes(c) ? decimal(t.value) : t.value;
            if (c === "type") { enregistrerFiche({ type: v }); return; }
            enregistrerFiche({ [c]: v }, { attendre: true });
        } else if (t.dataset.cap) {
            const cap = S.fiche.capacites.find(x => x.id === t.closest(".ga-capacite").dataset.id);
            if (cap) { cap[t.dataset.cap] = t.value; enregistrerFiche({}, { attendre: true }); }
        }
    });
    zone.addEventListener("focusout", () => setTimeout(() => {
        if (minuteurFiche && !zone.contains(document.activeElement)) { clearTimeout(minuteurFiche); enregistrerFiche(); }
    }, 0));
}

// ==========================================
// DONNÉES
// ==========================================
const saisieEnCours = () => zone.contains(document.activeElement) && document.activeElement.matches("input, select, textarea");

function ouvrir(vehicule) {
    const vid = vehicule?.id || null;
    if (vid === S.vid) { if (!saisieEnCours()) rendre(); return; }
    S.arrets.forEach(f => f()); S.arrets = [];
    Object.assign(S, { vid, fiche: FICHE_VIDE(), ficheChargee: false, entretiens: [], entretiensCharges: false, historique: [], historiqueCharge: false });
    rendre();
    if (!vid) return;
    const valable = () => vid === S.vid;
    // la fiche : pas de redessin pendant une saisie
    S.arrets.push(ecouterAvecReessai((ko) => onSnapshot(ref.fiche(vid), snap => {
        if (!valable()) return;
        const d = snap.exists() ? snap.data() : {};
        const premier = !S.ficheChargee;
        S.ficheChargee = true;
        if (!premier && (minuteurFiche || saisieEnCours())) return;
        S.fiche = { ...FICHE_VIDE(), ...d, capacites: (d.capacites || []).map(c => ({ ...c })) };
        rendre();
    }, ko), valable));
    S.arrets.push(ecouterAvecReessai((ko) => onSnapshot(ref.entretiens(vid), snap => {
        if (!valable()) return;
        S.entretiens = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.entretiensCharges = true;
        if (S.onglet !== "fiche") rendre();
    }, ko), valable));
    S.arrets.push(ecouterAvecReessai((ko) => onSnapshot(ref.historique(vid), snap => {
        if (!valable()) return;
        S.historique = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.historiqueCharge = true;
        if (S.onglet === "historique") rendre();
    }, ko), valable));
}

// ---------- Cycle de vie (coquille) ----------
export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur; outils = outilsCoquille;
    zone = racine.querySelector("#ga-app");
    sel = selecteurPartage({
        collection: "vehicules", quoi: "ce véhicule", nomNouveau: "Nouveau véhicule",
        etiquette: "Nom du véhicule", exemple: "Ex. Ma moto, la Clio…", memo: "vehicule-courant",
        supprimerContenu: viderVehicule,
        quandChange: (v) => ouvrir(v),
        quandErreur: () => { zone.innerHTML = `<p class="ga-vide">Les véhicules n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; }
    });
    brancher();
    rendre();
}

export function afficher(chemin = "") {
    const onglet = ["fiche", "historique"].includes(chemin) ? chemin : "entretiens";
    S.onglet = onglet;
    if (zone) rendre();
}

// pour les tests
export { etat };
