// ==========================================
// LOYER & CHARGES : qui paie combien dans le foyer
// Appli chargée dans la page principale (voir commun/coquille.js).
//
// Le loyer se répartit à parts égales, selon les revenus ou selon la taille
// des chambres ; chaque charge (eau, électricité, wifi…) a la personne qui la
// paie, et se répartit à parts égales ou comme le loyer. L'appli calcule la
// part de chacun et qui doit combien à qui chaque mois.
//
// Données (partagées comme les listes) :
//   foyers/{id}                    un foyer (name, ownerId, memberIds…)
//   foyers/{id}/donnees/config     loyer, loyerPayePar, mode, communs,
//                                  personnes [{id, nom, revenu, surface}],
//                                  charges [{id, nom, montant, frequence, payePar, repartition}]
// ==========================================
import { db } from "../commun/firebase.js";
import { compte, nomDe } from "../commun/compte.js";
import { selecteurPartage, ecouterAvecReessai } from "../commun/selecteur.js";
import { esc, toast, confirmer } from "../commun/ui.js";
import { doc, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MODES = [
    { id: "egal",    nom: "À parts égales",      aide: "Chacun paie la même part du loyer." },
    { id: "revenus", nom: "Selon les revenus",   aide: "Chacun paie en proportion de ce qu'il gagne : plus on gagne, plus on paie." },
    { id: "surface", nom: "Selon les chambres",  aide: "Chacun paie en proportion de la surface de sa chambre ; les pièces communes sont partagées à parts égales." }
];
const FREQUENCES = [
    { id: "mois", nom: "par mois", parMois: 1 },
    { id: "2mois", nom: "tous les 2 mois", parMois: 1 / 2 },
    { id: "trimestre", nom: "par trimestre", parMois: 1 / 3 },
    { id: "an", nom: "par an", parMois: 1 / 12 }
];
const CHARGES_COURANTES = [
    { nom: "Électricité", emoji: "💡" }, { nom: "Eau", emoji: "🚿" }, { nom: "Internet / wifi", emoji: "📶" },
    { nom: "Gaz", emoji: "🔥" }, { nom: "Assurance habitation", emoji: "🛡️" }, { nom: "Charges de copropriété", emoji: "🏢" },
    { nom: "Taxe d'ordures ménagères", emoji: "🗑️" }, { nom: "Produits ménagers", emoji: "🧽" }
];
const VIDE = () => ({ loyer: null, loyerPayePar: null, mode: "egal", communs: null, personnes: [], charges: [] });

let racine, outils, zone, sel;
const S = { fid: null, cfg: VIDE(), charge: false, arret: null, minuteur: null, enAttente: null, dernierEnvoi: 0 };

const configRef = (fid = S.fid) => doc(db, "foyers", fid, "donnees", "config");
const uid = () => Math.random().toString(36).slice(2, 9);
const euros = (n) => { const v = Math.round((n || 0) * 100) / 100; return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 }); };
const nombre = (v) => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const freq = (id) => FREQUENCES.find(f => f.id === id) || FREQUENCES[0];
const nomPersonne = (id) => S.cfg.personnes.find(p => p.id === id)?.nom || "?";

// ==========================================
// CALCUL
// ==========================================
function calculer(cfg) {
    const P = cfg.personnes, n = P.length;
    const res = { lignes: [], virements: [], alertes: [] };
    if (!n) return res;

    // poids de chacun pour le loyer
    let poids = P.map(() => 1);
    if (cfg.mode === "revenus") {
        const r = P.map(p => p.revenu || 0);
        if (r.some(x => !x)) res.alertes.push("Indique le revenu de chaque personne pour une répartition juste.");
        if (r.reduce((a, b) => a + b, 0) > 0) poids = r;
    } else if (cfg.mode === "surface") {
        const s = P.map(p => p.surface || 0);
        if (s.some(x => !x)) res.alertes.push("Indique la surface de la chambre de chaque personne.");
        const communs = (cfg.communs || 0) / n;
        if (s.reduce((a, b) => a + b, 0) + (cfg.communs || 0) > 0) poids = s.map(x => x + communs);
    }
    const totalPoids = poids.reduce((a, b) => a + b, 0) || 1;
    const loyer = cfg.loyer || 0;

    const du = P.map(() => 0), paye = P.map(() => 0), partLoyer = P.map(() => 0), partCharges = P.map(() => 0);
    P.forEach((p, i) => { partLoyer[i] = loyer * poids[i] / totalPoids; });
    // loyer : versé par une personne, ou chacun paie sa part directement
    const iLoyer = P.findIndex(p => p.id === cfg.loyerPayePar);
    P.forEach((p, i) => {
        du[i] += partLoyer[i];
        if (iLoyer < 0) paye[i] += partLoyer[i];
    });
    if (iLoyer >= 0) paye[iLoyer] += loyer;

    // charges
    for (const c of cfg.charges) {
        const m = (c.montant || 0) * freq(c.frequence).parMois;
        const parts = c.repartition === "loyer" ? poids.map(w => m * w / totalPoids) : P.map(() => m / n);
        const iPaie = P.findIndex(p => p.id === c.payePar);
        parts.forEach((x, i) => { partCharges[i] += x; du[i] += x; if (iPaie < 0) paye[i] += x; });
        if (iPaie >= 0) paye[iPaie] += m;
    }

    P.forEach((p, i) => res.lignes.push({
        id: p.id, nom: p.nom, loyer: partLoyer[i], charges: partCharges[i], total: du[i],
        pourcent: poids[i] / totalPoids * 100, solde: paye[i] - du[i]
    }));

    // qui doit combien à qui (on rembourse le plus gros créancier d'abord)
    const crediteurs = res.lignes.filter(l => l.solde > 0.005).map(l => ({ ...l, reste: l.solde })).sort((a, b) => b.reste - a.reste);
    const debiteurs = res.lignes.filter(l => l.solde < -0.005).map(l => ({ ...l, reste: -l.solde })).sort((a, b) => b.reste - a.reste);
    for (const d of debiteurs) {
        for (const c of crediteurs) {
            if (d.reste < 0.005) break;
            if (c.reste < 0.005) continue;
            const x = Math.min(d.reste, c.reste);
            res.virements.push({ de: d.nom, a: c.nom, montant: x });
            d.reste -= x; c.reste -= x;
        }
    }
    return res;
}

// ==========================================
// RENDU
// ==========================================
function rendre() {
    if (!zone) return;
    const entete = `<header><h1 class="titre-logo"><img src="commun/logos/loyer-192.png" alt="" width="48" height="48"> Loyer &amp; charges</h1></header>`;
    if (!sel.charge()) { zone.innerHTML = entete + `<p class="lo-vide chargement">Chargement…</p>`; return; }
    if (!sel.courant()) {
        zone.innerHTML = entete + `<div class="widget lo-vide-carte">
            <p class="lo-grand">Partage le loyer et les charges</p>
            <p class="muet">Indique le loyer, les personnes du foyer et les factures (eau, électricité, wifi…). L'appli calcule la part de chacun : à parts égales, selon les revenus ou selon la taille des chambres.</p>
            <button type="button" class="lo-bouton principal" data-action="creer">Créer mon foyer</button>
            <p class="muet petit">Tu pourras le partager avec tes colocs ou ta copine.</p></div>`;
        return;
    }
    outils.titre(`${sel.courant().name} · Loyer & charges`);
    const cfg = S.cfg, P = cfg.personnes;
    const optionsPersonnes = (choisi, vide) => `<option value="">${esc(vide)}</option>`
        + P.map(p => `<option value="${esc(p.id)}" ${p.id === choisi ? "selected" : ""}>${esc(p.nom || "Sans nom")}</option>`).join("");
    const mode = MODES.find(m => m.id === cfg.mode) || MODES[0];

    zone.innerHTML = entete + sel.barre() + (!S.charge ? `<p class="lo-vide chargement">Chargement…</p>` : `
    <div class="lo-grille">
        <div class="lo-colonne">
            <section class="widget lo-bloc">
                <h2 class="widget-title">🏠 Loyer</h2>
                <div class="lo-ligne2">
                    <label class="lo-champ"><span>Loyer par mois (€)</span>
                        <input type="number" min="0" step="0.01" inputmode="decimal" data-champ="loyer" value="${cfg.loyer ?? ""}" placeholder="Ex. 950"></label>
                    <label class="lo-champ"><span>Versé au propriétaire par</span>
                        <select data-champ="loyerPayePar">${optionsPersonnes(cfg.loyerPayePar, "Chacun paie sa part")}</select></label>
                </div>
            </section>

            <section class="widget lo-bloc">
                <h2 class="widget-title">👥 Personnes du foyer</h2>
                ${!P.length ? `<p class="muet">Ajoute les personnes qui partagent le logement.</p>
                    ${Object.keys(sel.courant().members || {}).length > 1 ? `<button type="button" class="lo-bouton" data-action="membres">Ajouter les personnes du partage</button>` : ""}` : ""}
                <ul class="lo-personnes">
                    ${P.map((p, i) => `<li class="lo-personne" data-id="${esc(p.id)}">
                        <label class="lo-champ lo-nom"><span>Nom</span><input maxlength="30" data-personne="nom" value="${esc(p.nom)}" placeholder="Prénom"></label>
                        ${cfg.mode === "revenus" ? `<label class="lo-champ"><span>Revenu net / mois (€)</span><input type="number" min="0" step="1" inputmode="decimal" data-personne="revenu" value="${p.revenu ?? ""}" placeholder="—"></label>` : ""}
                        ${cfg.mode === "surface" ? `<label class="lo-champ"><span>Chambre (m²)</span><input type="number" min="0" step="0.1" inputmode="decimal" data-personne="surface" value="${p.surface ?? ""}" placeholder="—"></label>` : ""}
                        <button type="button" class="lo-icone" data-action="retirer-personne" aria-label="Retirer ${esc(p.nom || "cette personne")}" title="Retirer">✕</button>
                    </li>`).join("")}
                </ul>
                <button type="button" class="lo-ajout" data-action="ajouter-personne">+ Ajouter une personne</button>
            </section>

            <section class="widget lo-bloc">
                <h2 class="widget-title">⚖️ Répartition du loyer</h2>
                <div class="lo-segments" role="radiogroup" aria-label="Mode de répartition">
                    ${MODES.map(m => `<button type="button" role="radio" aria-checked="${m.id === cfg.mode}" class="lo-segment ${m.id === cfg.mode ? "actif" : ""}" data-mode="${m.id}">${esc(m.nom)}</button>`).join("")}
                </div>
                <p class="muet petit">${esc(mode.aide)}</p>
                ${cfg.mode === "surface" ? `<label class="lo-champ lo-court"><span>Pièces communes (m²)</span>
                    <input type="number" min="0" step="0.1" inputmode="decimal" data-champ="communs" value="${cfg.communs ?? ""}" placeholder="Salon, cuisine…"></label>` : ""}
            </section>

            <section class="widget lo-bloc">
                <h2 class="widget-title">💡 Charges</h2>
                <ul class="lo-charges">
                    ${cfg.charges.map(c => `<li class="lo-charge" data-id="${esc(c.id)}">
                        <div class="lo-charge-haut">
                            <input class="lo-charge-nom" maxlength="40" data-charge="nom" value="${esc(c.nom)}" aria-label="Nom de la charge" list="lo-courantes">
                            <button type="button" class="lo-icone" data-action="retirer-charge" aria-label="Retirer ${esc(c.nom)}" title="Retirer">✕</button>
                        </div>
                        <div class="lo-ligne3">
                            <label class="lo-champ"><span>Montant (€)</span><input type="number" min="0" step="0.01" inputmode="decimal" data-charge="montant" value="${c.montant ?? ""}" placeholder="—"></label>
                            <label class="lo-champ"><span>Fréquence</span><select data-charge="frequence">${FREQUENCES.map(f => `<option value="${f.id}" ${f.id === c.frequence ? "selected" : ""}>${esc(f.nom)}</option>`).join("")}</select></label>
                            <label class="lo-champ"><span>Payée par</span><select data-charge="payePar">${optionsPersonnes(c.payePar, "Chacun sa part")}</select></label>
                            <label class="lo-champ"><span>Répartie</span><select data-charge="repartition">
                                <option value="egal" ${c.repartition !== "loyer" ? "selected" : ""}>à parts égales</option>
                                <option value="loyer" ${c.repartition === "loyer" ? "selected" : ""}>comme le loyer</option></select></label>
                        </div>
                    </li>`).join("")}
                </ul>
                <datalist id="lo-courantes">${CHARGES_COURANTES.map(c => `<option value="${esc(c.nom)}">`).join("")}</datalist>
                <div class="lo-rapides">
                    ${CHARGES_COURANTES.filter(x => !cfg.charges.some(c => c.nom === x.nom)).slice(0, 6)
                        .map(x => `<button type="button" class="lo-puce" data-rapide="${esc(x.nom)}">${x.emoji} ${esc(x.nom)}</button>`).join("")}
                    <button type="button" class="lo-puce" data-rapide="">+ Autre charge</button>
                </div>
            </section>
        </div>

        <section class="widget lo-resultat" id="lo-resultat"></section>
    </div>`);
    sel.brancher(zone);
    if (S.charge) rendreResultat();
}

function rendreResultat() {
    const box = zone.querySelector("#lo-resultat"); if (!box) return;
    const r = calculer(S.cfg);
    const total = r.lignes.reduce((t, l) => t + l.total, 0);
    if (!r.lignes.length) {
        box.innerHTML = `<h2 class="widget-title">📋 Chaque mois</h2><p class="muet">Ajoute les personnes du foyer pour voir la part de chacun.</p>`;
        return;
    }
    box.innerHTML = `<h2 class="widget-title">📋 Chaque mois</h2>
        ${r.alertes.map(a => `<p class="lo-alerte">⚠️ ${esc(a)}</p>`).join("")}
        <div class="lo-tableau">
            <table>
                <thead><tr><th>Personne</th><th>Loyer</th><th>Charges</th><th>Total</th></tr></thead>
                <tbody>${r.lignes.map(l => `<tr>
                    <td><b>${esc(l.nom || "Sans nom")}</b>${S.cfg.mode !== "egal" ? `<small>${Math.round(l.pourcent)} % du loyer</small>` : ""}</td>
                    <td>${euros(l.loyer)}</td><td>${euros(l.charges)}</td><td><b>${euros(l.total)}</b></td></tr>`).join("")}</tbody>
                <tfoot><tr><td>Total</td><td>${euros(S.cfg.loyer)}</td><td>${euros(r.lignes.reduce((t, l) => t + l.charges, 0))}</td><td><b>${euros(total)}</b></td></tr></tfoot>
            </table>
        </div>
        <h3 class="lo-sous-titre">💸 Pour équilibrer</h3>
        ${r.virements.length
            ? `<ul class="lo-virements">${r.virements.map(v => `<li><b>${esc(v.de || "?")}</b> donne <b class="lo-somme">${euros(v.montant)}</b> à <b>${esc(v.a || "?")}</b></li>`).join("")}</ul>
               <p class="muet petit">Chaque mois, pour que chacun ait payé exactement sa part.</p>`
            : `<p class="lo-ok">✓ Personne ne doit rien : chacun paie directement sa part.</p>`}`;
}

// ==========================================
// MODIFICATIONS
// ==========================================
function enregistrer(tout_de_suite = false) {
    clearTimeout(S.minuteur);
    const fid = S.fid;
    const envoi = () => {
        if (fid !== S.fid) return;
        const c = S.cfg;
        S.minuteur = null;
        S.dernierEnvoi = Date.now();
        setDoc(configRef(fid), {
            loyer: c.loyer, loyerPayePar: c.loyerPayePar, mode: c.mode, communs: c.communs,
            personnes: c.personnes, charges: c.charges, modifieLe: S.dernierEnvoi, modifiePar: compte.uid
        }).catch(e => { console.error(e); toast("Modification non enregistrée. Réessaie."); });
    };
    if (tout_de_suite) envoi(); else S.minuteur = setTimeout(envoi, 700);
}

// changement de structure : on redessine tout et on enregistre tout de suite
function modifier(fn) { fn(S.cfg); rendre(); enregistrer(true); }

function brancher() {
    // saisies : on met à jour le calcul en direct, et on enregistre après une petite pause
    zone.addEventListener("input", (e) => {
        const t = e.target;
        const val = t.type === "number" ? nombre(t.value) : t.value;
        if (t.dataset.champ) S.cfg[t.dataset.champ] = t.tagName === "SELECT" ? (val || null) : val;
        else if (t.dataset.personne) {
            const p = S.cfg.personnes.find(x => x.id === t.closest(".lo-personne").dataset.id);
            if (p) p[t.dataset.personne] = t.dataset.personne === "nom" ? String(val).slice(0, 30) : val;
        } else if (t.dataset.charge) {
            const c = S.cfg.charges.find(x => x.id === t.closest(".lo-charge").dataset.id);
            if (c) c[t.dataset.charge] = t.tagName === "SELECT" && t.dataset.charge === "payePar" ? (val || null) : val;
        } else return;
        if (t.tagName === "SELECT" || t.dataset.personne === "nom") { rendreResultat(); enregistrer(true); majListesPersonnes(); }
        else { rendreResultat(); enregistrer(); }
    });
    // si une modification d'un autre membre est arrivée pendant la saisie, on l'affiche après
    zone.addEventListener("focusout", () => setTimeout(() => {
        if (zone.contains(document.activeElement)) return;
        if (S.minuteur) enregistrer(true);   // on envoie tout de suite ce qui vient d'être tapé
        else if (S.enAttente) { S.cfg = S.enAttente; S.enAttente = null; rendre(); }
    }, 0));
    zone.addEventListener("click", async (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.action === "creer") { b.disabled = true; await sel.creer("Mon foyer"); b.disabled = false; }
        else if (b.dataset.mode) modifier(c => { c.mode = b.dataset.mode; });
        else if (b.dataset.action === "ajouter-personne") {
            modifier(c => c.personnes.push({ id: uid(), nom: c.personnes.length ? "" : (compte.nom || ""), revenu: null, surface: null }));
            const champs = zone.querySelectorAll('[data-personne="nom"]'); champs[champs.length - 1]?.focus();
        }
        else if (b.dataset.action === "membres") {
            const f = sel.courant();
            modifier(c => {
                for (const [u, email] of Object.entries(f.members || {})) {
                    const nom = u === compte.uid ? (compte.nom || "Moi") : nomDe(u, email);
                    if (!c.personnes.some(p => p.nom === nom)) c.personnes.push({ id: uid(), nom, revenu: null, surface: null });
                }
            });
        }
        else if (b.dataset.action === "retirer-personne") {
            const id = b.closest(".lo-personne").dataset.id, p = S.cfg.personnes.find(x => x.id === id);
            if (p?.nom && !await confirmer({ titre: `Retirer ${p.nom} ?`, message: "Ses parts seront réparties entre les autres personnes.", bouton: "Retirer", danger: true })) return;
            modifier(c => {
                c.personnes = c.personnes.filter(x => x.id !== id);
                if (c.loyerPayePar === id) c.loyerPayePar = null;
                c.charges.forEach(ch => { if (ch.payePar === id) ch.payePar = null; });
            });
        }
        else if (b.dataset.rapide !== undefined) {
            modifier(c => c.charges.push({ id: uid(), nom: b.dataset.rapide || "Nouvelle charge", montant: null, frequence: "mois", payePar: null, repartition: "egal" }));
            const montants = zone.querySelectorAll('[data-charge="montant"]');
            if (b.dataset.rapide) montants[montants.length - 1]?.focus();
            else { const noms = zone.querySelectorAll('[data-charge="nom"]'); noms[noms.length - 1]?.select(); }
        }
        else if (b.dataset.action === "retirer-charge") {
            const id = b.closest(".lo-charge").dataset.id;
            modifier(c => { c.charges = c.charges.filter(x => x.id !== id); });
        }
    });
}

// les menus « payé par » suivent les noms tapés, sans tout redessiner
function majListesPersonnes() {
    zone.querySelectorAll('select[data-champ="loyerPayePar"], select[data-charge="payePar"]').forEach(s => {
        [...s.options].forEach(o => { if (o.value) o.textContent = nomPersonne(o.value) || "Sans nom"; });
    });
}

// ==========================================
// DONNÉES
// ==========================================
function ouvrir(foyer) {
    const fid = foyer?.id || null;
    if (fid === S.fid) { rendre(); return; }
    clearTimeout(S.minuteur);
    S.arret?.(); S.arret = null;
    S.fid = fid; S.cfg = VIDE(); S.charge = false; S.enAttente = null;
    rendre();
    if (!fid) return;
    S.arret = ecouterAvecReessai(
        (ko) => onSnapshot(configRef(fid), snap => {
            if (fid !== S.fid) return;
            const d = snap.exists() ? snap.data() : {};
            const cfg = { ...VIDE(), ...d, personnes: [...(d.personnes || [])].map(p => ({ ...p })), charges: [...(d.charges || [])].map(c => ({ ...c })) };
            const premier = !S.charge;
            S.charge = true;
            // notre propre enregistrement qui revient : l'écran est déjà à jour
            if (!premier && d.modifiePar === compte.uid && d.modifieLe <= S.dernierEnvoi) return;
            // pas de redessin pendant une saisie : on l'appliquera en sortant du champ
            if (!premier && zone.contains(document.activeElement) && document.activeElement.matches("input, select")) { S.enAttente = cfg; return; }
            S.cfg = cfg;
            rendre();
        }, ko),
        () => fid === S.fid
    );
}

// ---------- Cycle de vie (coquille) ----------
export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur; outils = outilsCoquille;
    zone = racine.querySelector("#lo-app");
    sel = selecteurPartage({
        collection: "foyers", quoi: "ce foyer", nomNouveau: "Nouveau foyer",
        etiquette: "Nom du foyer", exemple: "Ex. Coloc rue Victor Hugo", memo: "foyer-courant",
        supprimerContenu: async (fid) => { await deleteDoc(configRef(fid)); },
        quandChange: (foyer) => ouvrir(foyer),
        quandErreur: () => { zone.innerHTML = `<p class="lo-vide">Les foyers n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; }
    });
    brancher();
    rendre();
}

export function afficher() { if (!zone.contains(document.activeElement)) rendre(); }

// pour les tests : le calcul seul
export { calculer };
