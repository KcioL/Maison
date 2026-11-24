// ==========================================
// MEUBLES : les meubles repérés, leurs photos, leurs prix
// et la comparaison des prix trouvés sur différents sites.
// Appli chargée dans la page principale (voir commun/coquille.js).
//
// Pages internes :
//   #/meubles             la liste (filtres par pièce et par statut)
//   #/meubles/m/<id>      la fiche d'un meuble
//
// Données (partagées comme les listes, par exemple « Meubles de l'appart ») :
//   meubles/{id}                              name, ownerId, memberIds, members…
//   meubles/{id}/articles/{id}                nom, reference, magasin, lien, piece, dimensions, couleur, note,
//                                             statut (hesite | acheter | achete), prix, historique [{ prix, le }],
//                                             offres [{ site, prix, livraison, lien, le }], photos [ids], miniature,
//                                             creeLe, modifieLe, modifiePar
//   meubles/{id}/articles/{id}/photos/{id}    data (photo réduite, en data URL)
//
// Comparer les prix : aucun service gratuit ne lit les prix des sites marchands,
// donc l'appli ouvre la recherche sur chaque site en un geste, et l'on note
// les prix trouvés ; le moins cher est calculé et mis en avant.
// ==========================================
import { db } from "../commun/firebase.js";
import { compte } from "../commun/compte.js";
import { selecteurPartage, ecouterAvecReessai } from "../commun/selecteur.js";
import { esc, toast, ouvrirFeuille, confirmer } from "../commun/ui.js";
import {
    collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, query, orderBy
} from "../commun/firestore.js";

let racine, outils, zone, sel;
const S = {
    lid: null, articles: [], charges: false, arret: null,
    vue: "liste", ouvert: null, piece: "", statut: "tous"
};
const photosCache = new Map();

export const STATUTS = [
    ["hesite", "🤔 J'hésite"],
    ["acheter", "🛒 À acheter"],
    ["achete", "✅ Acheté"]
];
const PIECES = ["Salon", "Chambre", "Cuisine", "Salle à manger", "Salle de bain", "Bureau", "Entrée", "Extérieur"];

// Sites pour chercher le meuble. {q} = la référence (ou le nom) du meuble.
// Pour les magasins dont l'adresse de recherche change souvent, on passe par Google (site:…).
export const SITES = [
    { id: "gshop", nom: "Google Shopping", url: "https://www.google.com/search?tbm=shop&q={q}", comparateur: true },
    { id: "idealo", nom: "Idealo", url: "https://www.idealo.fr/prechcat.html?q={q}", comparateur: true },
    { id: "ledenicheur", nom: "LeDénicheur", url: "https://ledenicheur.fr/search?search={q}", comparateur: true },
    { id: "ikea", nom: "IKEA", url: "https://www.ikea.com/fr/fr/search/?q={q}" },
    { id: "mdm", nom: "Maisons du Monde", url: "https://www.google.com/search?q=site%3Amaisonsdumonde.com+{q}" },
    { id: "conforama", nom: "Conforama", url: "https://www.google.com/search?q=site%3Aconforama.fr+{q}" },
    { id: "but", nom: "But", url: "https://www.google.com/search?q=site%3Abut.fr+{q}" },
    { id: "laredoute", nom: "La Redoute", url: "https://www.google.com/search?q=site%3Alaredoute.fr+{q}" },
    { id: "amazon", nom: "Amazon", url: "https://www.amazon.fr/s?k={q}" },
    { id: "leboncoin", nom: "Leboncoin (occasion)", url: "https://www.leboncoin.fr/recherche?text={q}" }
];
const lienSite = (s, q) => s.url.replace("{q}", encodeURIComponent(q));

// ---------- Mise en forme ----------
const euros = (n) => {
    if (n == null || isNaN(n)) return "—";
    const v = Math.round(n * 100) / 100;
    return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
};
const prixDe = (txt) => {
    const v = parseFloat(String(txt ?? "").replace(/\s|€/g, "").replace(",", "."));
    return isNaN(v) || v < 0 ? null : Math.round(v * 100) / 100;
};
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateCourte = (s) => { if (!s) return ""; const d = new Date(s + "T00:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); };
const nomStatut = (s) => (STATUTS.find(x => x[0] === s) || STATUTS[0])[1];
const uid = () => Math.random().toString(36).slice(2, 10);
const urlValide = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const domaine = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// Le meilleur prix : le prix noté sur la fiche, ou l'offre la moins chère (livraison comprise)
export function meilleur(a) {
    const choix = [];
    if (a.prix != null) choix.push({ total: a.prix, site: a.magasin || "Prix noté", base: true });
    for (const o of a.offres || []) if (o.prix != null) choix.push({ total: o.prix + (o.livraison || 0), site: o.site, lien: o.lien });
    if (!choix.length) return null;
    return choix.sort((x, y) => x.total - y.total)[0];
}

const refArticles = (l = S.lid) => collection(db, "meubles", l, "articles");
const refArticle = (id, l = S.lid) => doc(db, "meubles", l, "articles", id);

// ---------- Photos (comme les recettes : réduites et rangées dans Firestore) ----------
function lireImage(fichier) {
    return new Promise((ok, ko) => {
        const img = new Image(), url = URL.createObjectURL(fichier);
        img.onload = () => { URL.revokeObjectURL(url); ok(img); };
        img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Cette photo n'a pas pu être lue. Essaie en JPEG ou PNG.")); };
        img.src = url;
    });
}
function reduire(img, taille, qualite) {
    const r = Math.min(1, taille / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", qualite);
}
async function preparerPhotos(fichier) {
    const img = await lireImage(fichier);
    let data = null;
    for (const [t, q] of [[1400, 0.8], [1200, 0.72], [1000, 0.65], [800, 0.6]]) { data = reduire(img, t, q); if (data.length < 750000) break; }
    return { data, miniature: reduire(img, 420, 0.72) };
}

// ==========================================
// AFFICHAGE
// ==========================================
function rendre() {
    if (!zone) return;
    const entete = `<header><h1 class="titre-logo"><img src="commun/logos/meubles-192.png" alt="" width="48" height="48"> Meubles</h1></header>`;
    if (!sel.charge()) { zone.innerHTML = entete + `<p class="mb-vide chargement">Chargement…</p>`; return; }
    if (!sel.courant()) {
        zone.innerHTML = entete + `<div class="widget mb-vide-carte">
            <p class="mb-grand">Tes meubles repérés</p>
            <p class="muet">Garde la référence, une photo et le prix des meubles qui te plaisent, compare les prix sur plusieurs sites et suis ce qu'il reste à acheter, pièce par pièce.</p>
            <button type="button" class="mb-bouton principal" data-action="creer">Commencer ma liste</button>
            <p class="muet petit">Tu pourras la partager, par exemple pour meubler l'appart à deux.</p></div>`;
        return;
    }
    if (S.vue === "fiche") return rendreFiche();
    rendreListe(entete);
}

function piecesDuCarnet() {
    const l = [...PIECES];
    S.articles.forEach(a => { if (a.piece && !l.includes(a.piece)) l.push(a.piece); });
    return l;
}

function rendreListe(entete) {
    outils.titre(`${sel.courant().name} · Meubles`);
    const tous = S.articles;
    const filtres = tous.filter(a => (!S.piece || a.piece === S.piece) && (S.statut === "tous" || a.statut === S.statut || (S.statut === "restant" && a.statut !== "achete")));
    const reste = tous.filter(a => a.statut !== "achete" && (!S.piece || a.piece === S.piece));
    const achetes = tous.filter(a => a.statut === "achete" && (!S.piece || a.piece === S.piece));
    const somme = (l) => l.reduce((t, a) => t + (meilleur(a)?.total || 0), 0);
    const pieces = piecesDuCarnet().filter(p => tous.some(a => a.piece === p));
    zone.innerHTML = entete + sel.barre() + `
        <section class="widget mb-resume">
            <div class="mb-chiffre"><span class="muet petit">Reste à acheter</span><b>${euros(somme(reste))}</b><small class="muet">${reste.length} meuble${reste.length > 1 ? "s" : ""}</small></div>
            <div class="mb-chiffre"><span class="muet petit">Déjà acheté</span><b>${euros(somme(achetes))}</b><small class="muet">${achetes.length} meuble${achetes.length > 1 ? "s" : ""}</small></div>
            <button type="button" class="mb-bouton principal" data-action="ajouter">+ Ajouter un meuble</button>
        </section>
        ${tous.length ? `<div class="mb-filtres">
            ${pieces.length ? `<div class="mb-puces" role="group" aria-label="Pièce">
                <button type="button" class="mb-puce ${!S.piece ? "actif" : ""}" data-piece="">Toutes les pièces</button>
                ${pieces.map(p => `<button type="button" class="mb-puce ${S.piece === p ? "actif" : ""}" data-piece="${esc(p)}">${esc(p)}</button>`).join("")}
            </div>` : ""}
            <div class="mb-puces" role="group" aria-label="Statut">
                ${[["tous", "Tout"], ["restant", "Pas encore acheté"], ...STATUTS].map(([id, nom]) => `<button type="button" class="mb-puce petite ${S.statut === id ? "actif" : ""}" data-statut="${id}">${nom}</button>`).join("")}
            </div>
        </div>` : ""}
        ${!S.charges ? `<p class="mb-vide chargement">Chargement…</p>` : !tous.length
            ? `<div class="widget mb-vide-carte"><p>Aucun meuble pour l'instant.</p><p class="muet petit">Touche « + Ajouter un meuble » pour noter le premier.</p></div>`
            : !filtres.length ? `<p class="mb-vide">Aucun meuble avec ces filtres.</p>` : `
        <ul class="mb-grille">
            ${filtres.map(a => {
                const m = meilleur(a);
                const baisse = a.prix != null && m && !m.base && m.total < a.prix ? Math.round((1 - m.total / a.prix) * 100) : 0;
                return `<li><a class="mb-carte widget ${a.statut}" href="${outils.lien(`m/${a.id}`)}">
                    <div class="mb-carte-photo">${a.miniature ? `<img src="${esc(a.miniature)}" alt="" loading="lazy">` : `<span aria-hidden="true">🛋️</span>`}
                        <span class="mb-statut ${a.statut}">${nomStatut(a.statut)}</span></div>
                    <div class="mb-carte-txt">
                        <b>${esc(a.nom)}</b>
                        <span class="muet petit">${esc([a.magasin, a.piece].filter(Boolean).join(" · ") || "—")}</span>
                        <span class="mb-prix">${m ? euros(m.total) : "Prix à noter"}${baisse ? ` <em>−${baisse} %</em>` : ""}</span>
                        ${m && !m.base ? `<span class="muet petit">chez ${esc(m.site)}</span>` : ""}
                    </div>
                </a></li>`;
            }).join("")}
        </ul>`}`;
    sel.brancher(zone);
}

function rendreFiche() {
    const a = S.articles.find(x => x.id === S.ouvert);
    if (!a) {
        if (!S.charges) { zone.innerHTML = `<p class="mb-vide chargement">Chargement…</p>`; return; }
        zone.innerHTML = `<p class="mb-vide">Ce meuble n'existe plus. <a href="${outils.lien("")}">Revenir à la liste</a></p>`; return;
    }
    outils.titre(`${a.nom} · Meubles`);
    const m = meilleur(a);
    const q = (a.reference || a.nom || "").trim();
    const offres = [...(a.offres || [])].map((o, i) => ({ ...o, i, total: (o.prix || 0) + (o.livraison || 0) })).sort((x, y) => x.total - y.total);
    const photos = a.photos || [];
    zone.innerHTML = `
        <nav class="mb-barre"><a class="mb-retour" href="${outils.lien("")}">‹ Meubles</a>
            <button type="button" class="mb-bouton petit" data-action="modifier">✏️ Modifier</button></nav>
        <section class="widget mb-fiche">
            <div class="mb-photos">
                ${photos.length ? `<div class="mb-defile">${photos.map((pid, i) => `<figure class="mb-photo">
                        <img data-photo="${esc(pid)}" ${photosCache.get(pid) || (i === 0 && a.miniature) ? `src="${esc(photosCache.get(pid) || a.miniature)}"` : ""} alt="${esc(a.nom)}, photo ${i + 1}">
                        <button type="button" class="mb-retirer-photo" data-retirer-photo="${esc(pid)}" aria-label="Retirer la photo ${i + 1}">✕</button>
                    </figure>`).join("")}</div>` : `<div class="mb-photo-vide" aria-hidden="true">🛋️</div>`}
                ${photos.length < 6 ? `<label class="mb-bouton petit mb-ajout-photo">📷 ${photos.length ? "Ajouter une photo" : "Ajouter des photos"}<input type="file" accept="image/*" multiple data-photos></label>` : ""}
            </div>
            <div class="mb-infos">
                <h2 class="mb-nom">${esc(a.nom)}</h2>
                ${a.reference ? `<p class="mb-ref">Réf. <b>${esc(a.reference)}</b> <button type="button" class="mb-copier" data-copier="${esc(a.reference)}" aria-label="Copier la référence">📋</button></p>` : ""}
                <div class="mb-statuts" role="group" aria-label="Statut">
                    ${STATUTS.map(([id, nom]) => `<button type="button" class="mb-puce ${a.statut === id ? "actif " + id : ""}" data-changer-statut="${id}" aria-pressed="${a.statut === id}">${nom}</button>`).join("")}
                </div>
                <dl class="mb-details">
                    ${[["Magasin", a.magasin], ["Pièce", a.piece], ["Dimensions", a.dimensions], ["Couleur / finition", a.couleur]].filter(x => x[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}
                    ${a.lien ? `<div><dt>Lien</dt><dd><a href="${esc(a.lien)}" target="_blank" rel="noopener">${esc(domaine(a.lien) || "Voir la page")} ↗</a></dd></div>` : ""}
                </dl>
                ${a.note ? `<p class="mb-note">${esc(a.note)}</p>` : ""}
            </div>
        </section>

        <section class="widget mb-bloc">
            <h2 class="widget-title">💶 Prix</h2>
            <div class="mb-prix-ligne">
                <div><span class="muet petit">Prix ${a.magasin ? `chez ${esc(a.magasin)}` : "noté"}</span><b class="mb-gros">${euros(a.prix)}</b></div>
                ${m && !m.base ? `<div class="mb-meilleur"><span class="muet petit">Meilleur prix trouvé</span><b class="mb-gros">${euros(m.total)}</b><small>chez ${esc(m.site)}${a.prix != null && m.total < a.prix ? ` · ${euros(a.prix - m.total)} d'économie` : ""}</small></div>` : ""}
                <button type="button" class="mb-bouton petit" data-action="prix">${a.prix == null ? "Noter le prix" : "Nouveau prix"}</button>
            </div>
            ${(a.historique || []).length > 1 ? `<details class="mb-historique"><summary>Historique du prix (${a.historique.length})</summary><ul>
                ${[...a.historique].reverse().map((h, i, l) => {
                    const avant = l[i + 1]; const diff = avant ? h.prix - avant.prix : 0;
                    return `<li><span>${dateCourte(h.le)}</span><b>${euros(h.prix)}</b>${diff ? `<em class="${diff < 0 ? "baisse" : "hausse"}">${diff < 0 ? "↓" : "↑"} ${euros(Math.abs(diff))}</em>` : ""}</li>`;
                }).join("")}</ul></details>` : ""}
        </section>

        <section class="widget mb-bloc">
            <h2 class="widget-title">🔎 Comparer les prix</h2>
            ${q ? `<p class="muet petit">Recherche de « ${esc(q)} » ${a.reference ? "(la référence)" : "(le nom : ajoute la référence pour des résultats plus précis)"} :</p>
            <div class="mb-sites">
                ${SITES.map(s => `<a class="mb-site ${s.comparateur ? "comparateur" : ""}" href="${esc(lienSite(s, q))}" target="_blank" rel="noopener">${esc(s.nom)}${s.comparateur ? " <small>comparateur</small>" : ""} ↗</a>`).join("")}
                <a class="mb-site" href="https://lens.google.com/" target="_blank" rel="noopener">Google Lens <small>par la photo</small> ↗</a>
            </div>` : ""}
            <h3 class="mb-sous-titre">Prix trouvés</h3>
            ${offres.length ? `<ul class="mb-offres">
                ${offres.map((o, k) => `<li class="${k === 0 ? "moins-cher" : ""}">
                    <div class="mb-offre-site"><b>${esc(o.site)}</b>${k === 0 && offres.length > 1 ? `<span class="mb-badge">Le moins cher</span>` : ""}
                        <small class="muet">${o.livraison ? `dont ${euros(o.livraison)} de livraison · ` : ""}${dateCourte(o.le)}</small></div>
                    <b class="mb-offre-prix">${euros(o.total)}</b>
                    <div class="mb-offre-actions">
                        ${o.lien ? `<a class="mb-icone" href="${esc(o.lien)}" target="_blank" rel="noopener" aria-label="Ouvrir l'offre ${esc(o.site)}">↗</a>` : ""}
                        <button type="button" class="mb-icone" data-offre="${o.i}" aria-label="Modifier l'offre ${esc(o.site)}">✏️</button>
                    </div>
                </li>`).join("")}
            </ul>` : `<p class="muet petit">Ouvre un site ci-dessus, puis note ici le prix trouvé : le moins cher sera mis en avant.</p>`}
            <button type="button" class="mb-bouton" data-action="offre">+ Noter un prix trouvé</button>
        </section>

        <p class="mb-supprimer"><button type="button" class="mb-lien danger" data-action="supprimer">Supprimer ce meuble</button></p>`;
    chargerPhotos(a);
}

async function chargerPhotos(a) {
    const manquantes = (a.photos || []).filter(p => !photosCache.has(p));
    if (!manquantes.length) return;
    try {
        const snap = await getDocs(collection(refArticle(a.id), "photos"));
        snap.forEach(d => photosCache.set(d.id, d.data().data));
        zone.querySelectorAll("img[data-photo]").forEach(img => { const d = photosCache.get(img.dataset.photo); if (d && img.src !== d) img.src = d; });
    } catch (e) { console.warn("photos", e); }
}

// ==========================================
// FICHES (fenêtres)
// ==========================================
function ficheMeuble(a = null) {
    const nouveau = !a;
    const x = a || { nom: "", reference: "", magasin: "", lien: "", piece: S.piece || "", dimensions: "", couleur: "", note: "", prix: null, statut: "acheter" };
    const f = ouvrirFeuille({ titre: nouveau ? "Nouveau meuble" : "Modifier le meuble" });
    f.corps.innerHTML = `<form class="mb-form" autocomplete="off">
        <label class="champ"><span>Nom</span><input name="nom" maxlength="120" required value="${esc(x.nom)}" placeholder="Ex. Canapé 3 places"></label>
        <div class="mb-form2">
            <label class="champ"><span>Référence</span><input name="reference" maxlength="80" value="${esc(x.reference || "")}" placeholder="Ex. KIVIK 394.405.87"></label>
            <label class="champ"><span>Magasin</span><input name="magasin" maxlength="60" value="${esc(x.magasin || "")}" placeholder="Ex. IKEA" list="mb-magasins"></label>
        </div>
        <datalist id="mb-magasins">${SITES.filter(s => !s.comparateur).map(s => `<option value="${esc(s.nom.replace(/ \(.*\)$/, ""))}">`).join("")}</datalist>
        ${nouveau ? `<div class="mb-form2">
            <label class="champ"><span>Prix (€)</span><input name="prix" inputmode="decimal" maxlength="12" placeholder="Ex. 499"></label>
            <label class="champ"><span>Statut</span><select name="statut">${STATUTS.map(([id, nom]) => `<option value="${id}" ${x.statut === id ? "selected" : ""}>${nom}</option>`).join("")}</select></label>
        </div>
        <label class="champ"><span>Photo (facultatif)</span><input name="photo" type="file" accept="image/*"></label>` : ""}
        <label class="champ"><span>Lien vers le produit</span><input name="lien" type="url" inputmode="url" maxlength="2000" value="${esc(x.lien || "")}" placeholder="https://…"></label>
        <div class="mb-form2">
            <label class="champ"><span>Pièce</span><input name="piece" maxlength="40" value="${esc(x.piece || "")}" list="mb-pieces" placeholder="Ex. Salon"></label>
            <label class="champ"><span>Dimensions</span><input name="dimensions" maxlength="80" value="${esc(x.dimensions || "")}" placeholder="L × P × H"></label>
        </div>
        <datalist id="mb-pieces">${piecesDuCarnet().map(p => `<option value="${esc(p)}">`).join("")}</datalist>
        <label class="champ"><span>Couleur / finition</span><input name="couleur" maxlength="80" value="${esc(x.couleur || "")}" placeholder="Ex. Gris clair, chêne"></label>
        <label class="champ"><span>Notes</span><textarea name="note" rows="3" maxlength="2000" placeholder="Ex. dispo en magasin, livraison 3 semaines…">${esc(x.note || "")}</textarea></label>
        <button class="bouton principal large" type="submit">${nouveau ? "Ajouter" : "Enregistrer"}</button>
    </form>`;
    const form = f.corps.querySelector("form");
    if (nouveau) setTimeout(() => form.nom.focus(), 50);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const lienBrut = form.lien.value.trim();
        if (lienBrut && !urlValide(lienBrut)) { toast("Le lien doit commencer par https://"); form.lien.focus(); return; }
        const d = {
            nom: form.nom.value.trim().slice(0, 120), reference: form.reference.value.trim() || null, magasin: form.magasin.value.trim() || null,
            lien: lienBrut ? urlValide(lienBrut) : null, piece: form.piece.value.trim() || null, dimensions: form.dimensions.value.trim() || null,
            couleur: form.couleur.value.trim() || null, note: form.note.value.trim() || null, modifieLe: Date.now(), modifiePar: compte.uid
        };
        if (!d.nom) return;
        const bouton = form.querySelector("button[type=submit]");
        bouton.disabled = true;
        try {
            if (nouveau) {
                const ref = doc(refArticles()), t = Date.now();
                const prix = prixDe(form.prix.value);
                let photos = [], miniature = null;
                const fichier = form.photo.files?.[0];
                if (fichier) {
                    bouton.textContent = "Envoi de la photo…";
                    const p = await preparerPhotos(fichier);
                    const pid = uid();
                    await setDoc(doc(ref, "photos", pid), { data: p.data });
                    photosCache.set(pid, p.data);
                    photos = [pid]; miniature = p.miniature;
                }
                await setDoc(ref, {
                    ...d, statut: form.statut.value, prix, historique: prix != null ? [{ prix, le: aujourdhui() }] : [],
                    offres: [], photos, miniature, creeLe: t
                });
                f.fermer();
                toast(`« ${d.nom} » ajouté.`);
                outils.aller(`m/${ref.id}`);
            } else {
                await updateDoc(refArticle(a.id), d);
                f.fermer();
                toast("Modifications enregistrées.");
            }
        } catch (err) {
            console.error(err);
            toast(err.message?.startsWith("Cette photo") ? err.message : "Enregistrement impossible. Réessaie.");
            bouton.disabled = false; bouton.textContent = nouveau ? "Ajouter" : "Enregistrer";
        }
    });
}

function fichePrix(a) {
    const f = ouvrirFeuille({ titre: a.prix == null ? "Prix" : "Nouveau prix" });
    f.corps.innerHTML = `<form class="mb-form" autocomplete="off">
        ${a.prix != null ? `<p class="muet">Prix actuel : <b>${euros(a.prix)}</b>. Le nouveau prix s'ajoute à l'historique.</p>` : ""}
        <label class="champ"><span>Prix ${a.magasin ? `chez ${esc(a.magasin)}` : ""} (€)</span><input name="prix" inputmode="decimal" maxlength="12" required placeholder="Ex. 449,99"></label>
        <button class="bouton principal large" type="submit">Enregistrer</button></form>`;
    const form = f.corps.querySelector("form");
    setTimeout(() => form.prix.focus(), 50);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const prix = prixDe(form.prix.value);
        if (prix == null) { toast("Indique un prix, par exemple 449,99."); return; }
        f.fermer();
        const historique = [...(a.historique || []), { prix, le: aujourdhui() }].slice(-60);
        try { await updateDoc(refArticle(a.id), { prix, historique, modifieLe: Date.now(), modifiePar: compte.uid }); toast(`Prix enregistré : ${euros(prix)}`); }
        catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    });
}

function ficheOffre(a, i = null) {
    const o = i != null ? a.offres[i] : { site: "", prix: null, livraison: null, lien: "" };
    const f = ouvrirFeuille({ titre: i != null ? "Modifier le prix trouvé" : "Prix trouvé" });
    f.corps.innerHTML = `<form class="mb-form" autocomplete="off">
        <label class="champ"><span>Site ou magasin</span><input name="site" maxlength="60" required value="${esc(o.site)}" list="mb-sites" placeholder="Ex. Amazon"></label>
        <datalist id="mb-sites">${SITES.map(s => `<option value="${esc(s.nom.replace(/ \(.*\)$/, ""))}">`).join("")}</datalist>
        <div class="mb-form2">
            <label class="champ"><span>Prix (€)</span><input name="prix" inputmode="decimal" maxlength="12" required value="${o.prix ?? ""}" placeholder="Ex. 429"></label>
            <label class="champ"><span>Livraison (€)</span><input name="livraison" inputmode="decimal" maxlength="12" value="${o.livraison ?? ""}" placeholder="0"></label>
        </div>
        <label class="champ"><span>Lien (facultatif)</span><input name="lien" type="url" inputmode="url" maxlength="2000" value="${esc(o.lien || "")}" placeholder="https://…"></label>
        <button class="bouton principal large" type="submit">Enregistrer</button>
        ${i != null ? `<button class="bouton danger large" type="button" data-supprimer>Supprimer ce prix</button>` : ""}
    </form>`;
    const form = f.corps.querySelector("form");
    if (i == null) setTimeout(() => form.site.focus(), 50);
    const enregistrer = async (offres) => {
        try { await updateDoc(refArticle(a.id), { offres, modifieLe: Date.now(), modifiePar: compte.uid }); }
        catch (err) { console.error(err); toast("Enregistrement impossible. Réessaie."); }
    };
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const prix = prixDe(form.prix.value);
        if (prix == null) { toast("Indique un prix, par exemple 429."); return; }
        const lienBrut = form.lien.value.trim();
        if (lienBrut && !urlValide(lienBrut)) { toast("Le lien doit commencer par https://"); return; }
        const nouvelle = { site: form.site.value.trim().slice(0, 60), prix, livraison: prixDe(form.livraison.value) || null, lien: lienBrut ? urlValide(lienBrut) : null, le: aujourdhui() };
        const offres = [...(a.offres || [])];
        if (i != null) offres[i] = nouvelle; else offres.push(nouvelle);
        f.fermer();
        await enregistrer(offres.slice(-30));
        toast(`Prix ${nouvelle.site} enregistré.`);
    });
    form.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
        f.fermer();
        await enregistrer((a.offres || []).filter((_, k) => k !== i));
        toast("Prix supprimé.");
    });
}

async function ajouterPhotos(a, fichiers) {
    const place = 6 - (a.photos || []).length;
    const liste = [...fichiers].slice(0, place);
    if (!liste.length) return;
    toast(liste.length > 1 ? `Envoi de ${liste.length} photos…` : "Envoi de la photo…");
    try {
        const ids = [...(a.photos || [])];
        let miniature = a.miniature;
        for (const fichier of liste) {
            const p = await preparerPhotos(fichier);
            const pid = uid();
            await setDoc(doc(refArticle(a.id), "photos", pid), { data: p.data });
            photosCache.set(pid, p.data);
            ids.push(pid);
            if (!miniature) miniature = p.miniature;
        }
        await updateDoc(refArticle(a.id), { photos: ids, miniature, modifieLe: Date.now(), modifiePar: compte.uid });
        toast(liste.length > 1 ? "Photos ajoutées." : "Photo ajoutée.");
    } catch (err) { console.error(err); toast(err.message?.startsWith("Cette photo") ? err.message : "Envoi impossible. Réessaie."); }
}

async function retirerPhoto(a, pid) {
    if (!await confirmer({ titre: "Retirer cette photo ?", bouton: "Retirer", danger: true })) return;
    const ids = (a.photos || []).filter(x => x !== pid);
    try {
        // la miniature suit la première photo
        let miniature = a.miniature;
        if (a.photos[0] === pid) {
            miniature = null;
            const suivante = ids[0] && photosCache.get(ids[0]);
            if (suivante) { const img = new Image(); img.src = suivante; await img.decode().catch(() => {}); miniature = reduire(img, 420, 0.72); }
        }
        await updateDoc(refArticle(a.id), { photos: ids, miniature, modifieLe: Date.now(), modifiePar: compte.uid });
        await deleteDoc(doc(refArticle(a.id), "photos", pid)).catch(() => {});
        photosCache.delete(pid);
        toast("Photo retirée.");
    } catch (err) { console.error(err); toast("Impossible de retirer la photo."); }
}

async function supprimerMeuble(a) {
    if (!await confirmer({ titre: `Supprimer « ${a.nom} » ?`, message: "Ses photos et ses prix seront supprimés aussi.", bouton: "Supprimer", danger: true })) return;
    try {
        const photos = await getDocs(collection(refArticle(a.id), "photos"));
        const lot = writeBatch(db);
        photos.forEach(p => lot.delete(p.ref));
        lot.delete(refArticle(a.id));
        await lot.commit();
        outils.aller("");
        toast("Meuble supprimé.");
    } catch (err) { console.error(err); toast("Suppression impossible. Réessaie."); }
}

async function viderListe(lid) {
    const snap = await getDocs(refArticles(lid));
    for (const d of snap.docs) {
        const photos = await getDocs(collection(d.ref, "photos"));
        const lot = writeBatch(db);
        photos.forEach(p => lot.delete(p.ref));
        lot.delete(d.ref);
        await lot.commit();
    }
}

// ==========================================
// DONNÉES ET ACTIONS
// ==========================================
function ecouter() {
    S.arret?.(); S.arret = null;
    S.articles = []; S.charges = false;
    if (!S.lid) return;
    const lid = S.lid, valable = () => lid === S.lid;
    S.arret = ecouterAvecReessai((ko) => onSnapshot(query(refArticles(lid), orderBy("creeLe", "desc")), snap => {
        if (!valable()) return;
        S.articles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        S.charges = true;
        if (!saisieEnCours()) rendre();
    }, ko), valable);
}
const saisieEnCours = () => zone?.contains(document.activeElement) && document.activeElement.matches("input, textarea, select");

function brancher() {
    zone.addEventListener("click", async (ev) => {
        const copier = ev.target.closest("[data-copier]");
        if (copier) {
            try { await navigator.clipboard.writeText(copier.dataset.copier); toast("Référence copiée."); } catch { toast(copier.dataset.copier); }
            return;
        }
        const b = ev.target.closest("button"); if (!b) return;
        const a = S.articles.find(x => x.id === S.ouvert);
        const action = b.dataset.action;
        if (action === "creer") { b.disabled = true; await sel.creer("Meubles de l'appart"); b.disabled = false; }
        else if (action === "ajouter") ficheMeuble();
        else if (b.dataset.piece != null) { S.piece = b.dataset.piece; rendre(); }
        else if (b.dataset.statut) { S.statut = b.dataset.statut; rendre(); }
        else if (!a) return;
        else if (action === "modifier") ficheMeuble(a);
        else if (action === "prix") fichePrix(a);
        else if (action === "offre") ficheOffre(a);
        else if (action === "supprimer") supprimerMeuble(a);
        else if (b.dataset.offre != null) ficheOffre(a, +b.dataset.offre);
        else if (b.dataset.retirerPhoto) retirerPhoto(a, b.dataset.retirerPhoto);
        else if (b.dataset.changerStatut && b.dataset.changerStatut !== a.statut) {
            try { await updateDoc(refArticle(a.id), { statut: b.dataset.changerStatut, modifieLe: Date.now(), modifiePar: compte.uid }); }
            catch (err) { console.error(err); toast("Changement impossible. Réessaie."); }
        }
    });
    zone.addEventListener("change", (ev) => {
        if (!ev.target.matches("[data-photos]")) return;
        const a = S.articles.find(x => x.id === S.ouvert);
        if (a) ajouterPhotos(a, ev.target.files);
        ev.target.value = "";
    });
}

export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur; outils = outilsCoquille;
    zone = racine.querySelector("#mb-app");
    sel = selecteurPartage({
        collection: "meubles", quoi: "cette liste de meubles", nomNouveau: "Nouvelle liste de meubles",
        etiquette: "Nom de la liste", exemple: "Ex. Meubles de l'appart", memo: "meubles-courant",
        supprimerContenu: viderListe,
        quandChange: (l) => {
            const id = l?.id || null;
            if (id !== S.lid) { S.lid = id; S.piece = ""; ecouter(); }
            rendre();
        },
        quandErreur: () => { zone.innerHTML = `<p class="mb-vide">Les meubles n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; }
    });
    brancher();
    rendre();
}

export function afficher(chemin = "") {
    const m = chemin.match(/^m\/([\w-]+)$/);
    S.vue = m ? "fiche" : "liste";
    S.ouvert = m ? m[1] : null;
    if (zone) { rendre(); outils.defiler?.(0); }
}
