// ==========================================
// APPLI GESTION DES STOCKS
// Chargée dans la page principale (voir commun/coquille.js) :
// demarrer() est appelée une seule fois, avec la vue de l'appli,
// une fois le compte connecté (géré par la page principale).
//
// Données :
//   stocks/{stockId}                      nom, propriétaire, membres
//   stocks/{stockId}/storages/{id}        rangements (frigo, placard…)
//   stocks/{stockId}/items/{id}           produits
// La connexion et le partage sont communs à tout le site :
//   commun/compte.js (compte connecté) et commun/partage.js (qui a accès)
// ==========================================
import { db } from "../commun/firebase.js";
import { compte, nomDe } from "../commun/compte.js";
import { ecouterMesPartages, creerPartage, ouvrirAcces, renommerPartage } from "../commun/partage.js";
import {
    collection, doc, query, where, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
    getDoc, getDocs, writeBatch, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let racine, outils;

export function demarrer(conteneur, outilsCoquille) {
    racine = conteneur;
    outils = outilsCoquille;

    // ------------------------------------------
    // Constantes
    // ------------------------------------------
    const TYPES = [
        { id: "frigo",   label: "Réfrigérateur",  icon: "🥛" },
        { id: "congel",  label: "Congélateur",    icon: "❄️" },
        { id: "placard", label: "Placard",        icon: "🚪" },
        { id: "cellier", label: "Cellier / cave", icon: "🍷" },
        { id: "etagere", label: "Étagère",        icon: "🫙" },
        { id: "tiroir",  label: "Tiroir / bac",   icon: "🗄️" },
        { id: "autre",   label: "Autre",          icon: "📦" }
    ];
    const T = Object.fromEntries(TYPES.map(t => [t.id, t]));
    const typeOf = id => T[id] || T.autre;
    const colorVar = id => `var(--t-${typeOf(id).id})`;
    const UNITS = ["pcs", "g", "kg", "ml", "L", "boîte", "paquet", "bouteille", "pot", "sachet"];

    // ------------------------------------------
    // État
    // ------------------------------------------
    const S = {
        user: { uid: compte.uid, email: compte.email },
        stocks: new Map(), stockId: null, listesCourses: [],
        storages: new Map(), items: new Map(), loadedS: false, loadedI: false,
        view: null, q: "", pending: {}, confirm: null, editing: null,
        unsubStocks: null, unsubStock: []
    };

    const $ = id => racine.querySelector("#" + id);
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const now = () => Date.now();
    const stock = () => S.stocks.get(S.stockId);
    const isOwner = () => !!stock() && stock().ownerId === S.user?.uid;
    const storeGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
    const storeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

    // ------------------------------------------
    // Produits : quantités, seuils, DLC
    // ------------------------------------------
    const stepFor = u => (u === "g" || u === "ml") ? 50 : (u === "kg" || u === "L") ? 0.5 : 1;
    const round = n => Math.round(n * 100) / 100;
    const fmtQty = n => Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    const qtyOf = it => (S.pending[it.id] ? S.pending[it.id].qty : Number(it.qty) || 0);
    const numOrNull = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".")); return isFinite(n) && n >= 0 ? round(n) : null; };

    function daysTo(d) {
        if (!d) return null;
        const t = new Date(d + "T00:00:00"); if (isNaN(t)) return null;
        const n = new Date(); n.setHours(0, 0, 0, 0);
        return Math.round((t - n) / 864e5);
    }
    function statusOf(it) {
        const q = qtyOf(it), d = daysTo(it.expiry), hasMin = typeof it.min === "number";
        return { out: q <= 0, low: q > 0 && hasMin && q <= it.min, expired: d !== null && d < 0, soon: d !== null && d >= 0 && d <= 3, d };
    }
    function dlcFlag(st, expiry) {
        if (st.d === null) return "";
        if (st.expired) return `<span class="st-flag danger">Périmé</span>`;
        if (st.soon) return `<span class="st-flag danger">${st.d === 0 ? "DLC aujourd'hui" : st.d === 1 ? "DLC demain" : `DLC dans ${st.d} j`}</span>`;
        const dt = new Date(expiry + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: st.d > 300 ? "numeric" : undefined });
        return `<span class="st-flag neutral">DLC ${esc(dt)}</span>`;
    }
    const itemsOf = sid => [...S.items.values()].filter(i => i.storageId === sid).sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
    const sortedStorages = () => [...S.storages.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const sortedStocks = () => [...S.stocks.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    function nameOf(uid) {
        if (!uid) return "";
        if (uid === S.user?.uid) return "toi";
        return nomDe(uid, stock()?.members?.[uid], () => { if (S.view) renderDetail(); });
    }

    // ------------------------------------------
    // Messages
    // ------------------------------------------
    let toastT;
    function toast(msg) {
        const t = $("toast"); t.textContent = msg; t.hidden = false;
        clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3800);
    }
    function onWriteErr(e) {
        console.error(e);
        if (e && e.code === "permission-denied") toast("Action refusée : tu n'as peut-être plus accès à ce stock.");
        else if (e && e.code === "unavailable") toast("Pas de connexion : la modification sera envoyée dès que possible.");
        else toast("Modification non enregistrée. Réessaie dans un instant.");
    }
    const chain = {};
    function queue(key, fn) {
        const p = (chain[key] || Promise.resolve()).then(async () => {
            try { await fn(); return true; } catch (e) { onWriteErr(e); return false; }
        });
        chain[key] = p; return p;
    }

    // ------------------------------------------
    // Références Firestore
    // ------------------------------------------
    const stockRef = id => doc(db, "stocks", id);
    const storagesCol = () => collection(db, "stocks", S.stockId, "storages");
    const itemsCol = () => collection(db, "stocks", S.stockId, "items");
    const storageRef = id => doc(db, "stocks", S.stockId, "storages", id);
    const itemRef = id => doc(db, "stocks", S.stockId, "items", id);

    // Le compte est déjà connecté (page principale) : on affiche tout de suite
    // ce qu'il y a en cache, puis les données à jour arrivent.
    // ==========================================
    // ABONNEMENTS FIRESTORE
    // ==========================================
    function stopStock() {
        S.unsubStock.forEach(f => f()); S.unsubStock = [];
        S.storages = new Map(); S.items = new Map(); S.loadedS = S.loadedI = false; S.pending = {};
    }

    let stocksLoaded = false;
    function subscribeStocks() {
        stocksLoaded = false;
        S.unsubStocks = ecouterMesPartages("stocks", liste => {
            stocksLoaded = true;
            S.stocks = new Map(liste.map(d => [d.id, d]));
            let target = S.stockId;
            if (S.wantStock && S.stocks.has(S.wantStock)) { target = S.wantStock; S.wantStock = null; }
            else if (!target || !S.stocks.has(target)) {
                const saved = storeGet("stock-current");
                target = saved && S.stocks.has(saved) ? saved : (sortedStocks()[0]?.id || null);
            }
            if (target !== S.stockId) openStock(target);
            else renderAll();
        }, err => {
            console.error(err);
            stocksLoaded = true;
            showBanner(err.code === "permission-denied"
                ? "Accès refusé par la base : publie les nouvelles règles Firestore (fichier firestore.rules)."
                : "Impossible de charger tes stocks. Vérifie ta connexion puis recharge la page.");
        });
    }

    function openStock(id) {
        stopStock();
        S.stockId = id; S.view = null; S.confirm = null; S.editing = null;
        hide("item-editor", "edit-storage", "add-storage");
        if (id) storeSet("stock-current", id);
        renderAll();
        if (!id) return;
        S.unsubStock.push(onSnapshot(storagesCol(), snap => {
            S.storages = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
            S.loadedS = true; renderAll();
        }, stockErr));
        S.unsubStock.push(onSnapshot(itemsCol(), snap => {
            S.items = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
            S.loadedI = true; renderAll();
        }, stockErr));
    }
    function stockErr(err) {
        console.error(err);
        if (err.code !== "permission-denied") showBanner("Le stock n'a pas pu se mettre à jour. Recharge la page.");
    }

    // ==========================================
    // RENDU
    // ==========================================
    function hide(...ids) { ids.forEach(id => $(id).hidden = true); }
    function showBanner(msg) { const b = $("banner"); b.textContent = msg; b.hidden = !msg; }

    function renderAll() {
        if (!S.user) return;
        renderChrome();
        if (S.view) renderDetail(); else renderHome();
    }

    function renderChrome() {
        const s = stock();
        $("stock-title").textContent = s ? s.name : "Stocks";
        outils.titre(s ? `${s.name} · Stocks` : "Gestion des stocks");
        const nSt = S.storages.size, nIt = S.items.size;
        $("subline").textContent = !stocksLoaded ? "Chargement de tes stocks…"
            : !s ? "Aucun stock pour l'instant"
            : !S.loadedS ? "Chargement des rangements…"
            : `${nSt} rangement${nSt > 1 ? "s" : ""} · ${nIt} produit${nIt > 1 ? "s" : ""} · ${Object.keys(s.members || {}).length} personne${Object.keys(s.members || {}).length > 1 ? "s" : ""}`;

        const sel = $("stock-select");
        sel.hidden = !stocksLoaded || S.stocks.size === 0;
        sel.innerHTML = sortedStocks().map(x => `<option value="${esc(x.id)}" ${x.id === S.stockId ? "selected" : ""}>${esc(x.name)}${x.ownerId !== S.user.uid ? " (partagé)" : ""}</option>`).join("")
            + `<option value="__new">+ Nouveau stock…</option>`;
        $("btn-access").hidden = !s;
        $("btn-rename").hidden = !s || s.ownerId !== S.user.uid;   // seul le propriétaire renomme
        $("btn-add-storage").hidden = !s;
        $("home-view").hidden = !!S.view;
        $("detail-view").hidden = !S.view;
    }

    function renderHome() {
        const grid = $("grid"), s = stock();
        if (!stocksLoaded) { grid.innerHTML = `<div class="st-empty chargement"><h3>Chargement…</h3></div>`; hide("watch", "results"); return; }
        if (!s) {
            hide("watch", "results");
            grid.innerHTML = `<div class="st-empty">
                <h2>Bienvenue dans la gestion des stocks 👋</h2>
                <p style="max-width:48ch">Crée ton premier stock (par exemple « Maison »), puis ajoute ton frigo, tes placards et ton congélateur.
                Si quelqu'un t'a partagé son stock, il apparaîtra ici automatiquement.</p>
                <button class="st-btn st-primary" type="button" data-action="new-stock">+ Créer mon stock</button></div>`;
            return;
        }
        const storages = sortedStorages();
        if (!S.loadedS) grid.innerHTML = `<div class="st-empty chargement"><h3>Chargement des rangements…</h3></div>`;
        else if (!storages.length) {
            grid.innerHTML = `<div class="st-empty"><h2>Aucun rangement pour l'instant</h2>
                <p style="max-width:44ch">Ajoute ton frigo ou un placard, puis ouvre-le pour y ranger tes produits.</p>
                <button class="st-btn st-primary" type="button" data-action="add-storage">+ Ajouter un rangement</button></div>`;
        } else {
            grid.innerHTML = storages.map(st => {
                const its = itemsOf(st.id), t = typeOf(st.type);
                let low = 0, dlc = 0;
                its.forEach(i => { const x = statusOf(i); if (x.out || x.low) low++; if (x.expired || x.soon) dlc++; });
                return `<button class="st-card" type="button" data-open="${esc(st.id)}" style="--c:${colorVar(t.id)}">
                    <span class="st-card-top"><span class="st-ico">${t.icon}</span>${esc(t.label)}</span>
                    <span class="st-card-name">${esc(st.name)}</span>
                    <span class="st-card-stats"><span><b>${its.length}</b> produit${its.length > 1 ? "s" : ""}</span>
                        ${low ? `<span class="st-flag warn">${low} à racheter</span>` : ""}
                        ${dlc ? `<span class="st-flag danger">${dlc} DLC proche${dlc > 1 ? "s" : ""}</span>` : ""}
                        ${!low && !dlc && its.length ? `<span class="st-flag ok">OK</span>` : ""}</span>
                </button>`;
            }).join("") + `<button class="st-add-tile" type="button" data-action="add-storage">+ Ajouter un rangement</button>`;
        }
        renderWatch(); renderResults();
    }

    function rowHTML(i) {
        const st = S.storages.get(i.storageId), x = statusOf(i);
        const flag = x.expired || x.soon ? dlcFlag(x, i.expiry) : x.out ? `<span class="st-flag warn">Épuisé</span>` : x.low ? `<span class="st-flag warn">À racheter</span>` : "";
        return `<button type="button" class="st-watch-item" data-open="${esc(i.storageId)}" style="--c:${st ? colorVar(st.type) : "var(--t-autre)"}">
            <span class="st-dot"></span><span class="nm">${esc(i.name)}<br><small>${esc(st ? st.name : "Sans rangement")} · ${fmtQty(qtyOf(i))} ${esc(i.unit || "")}</small></span>${flag}</button>`;
    }
    function renderWatch() {
        const w = $("watch");
        if (S.q || !S.loadedI) { w.hidden = true; return; }
        const rank = x => x.expired ? 0 : x.soon ? 1 : x.out ? 2 : 3;
        const list = [...S.items.values()].filter(i => { const x = statusOf(i); return x.out || x.low || x.expired || x.soon; })
            .sort((a, b) => rank(statusOf(a)) - rank(statusOf(b)) || String(a.name).localeCompare(String(b.name), "fr"));
        if (!list.length) { w.hidden = true; return; }
        w.hidden = false;
        w.innerHTML = `<h2 class="widget-title" style="margin-bottom:0">👀 À surveiller (${list.length})</h2><div class="st-watch-list">${list.slice(0, 12).map(rowHTML).join("")}</div>`;
    }
    function renderResults() {
        const r = $("results");
        if (!S.q) { r.hidden = true; $("grid").hidden = false; return; }
        const q = norm(S.q);
        const list = [...S.items.values()].filter(i => norm(i.name).includes(q)).sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
        r.hidden = false; $("grid").hidden = true;
        r.innerHTML = list.length
            ? `<div class="st-watch-list">${list.map(rowHTML).join("")}</div>`
            : `<div class="st-empty"><h3>Aucun produit ne correspond</h3><p>Essaie un autre mot, ou ajoute le produit dans un rangement.</p></div>`;
    }

    function renderDetail() {
        const st = S.storages.get(S.view);
        if (!st) { if (S.loadedS) { S.view = null; renderAll(); } return; }
        const t = typeOf(st.type), its = itemsOf(st.id);
        const head = $("detail-head");
        head.style.setProperty("--c", colorVar(t.id));
        const armed = S.confirm === "storage:" + st.id;
        head.innerHTML = `<span class="st-ico">${t.icon}</span>
            <div class="ttl"><div>${esc(t.label)}</div><h2>${esc(st.name)}</h2><span class="st-muted">${its.length} produit${its.length > 1 ? "s" : ""}</span></div>
            <div class="st-top-actions"><button class="st-btn st-small" type="button" data-action="edit-storage">Modifier</button>
            <button class="st-btn st-small st-danger ${armed ? "armed" : ""}" type="button" data-action="del-storage">${armed ? `Supprimer avec ${its.length} produit${its.length > 1 ? "s" : ""} ?` : "Supprimer"}</button></div>`;

        const act = document.activeElement;
        const key = act && act.dataset && act.dataset.act ? [act.dataset.act, act.dataset.id] : null;
        const list = $("item-list");
        if (!its.length) {
            list.innerHTML = `<div class="st-empty"><h3>Ce rangement est vide</h3><p>Ajoute ton premier produit avec « Ajouter un produit ».</p></div>`;
        } else {
            list.innerHTML = `<div class="st-items">${its.map(i => {
                const x = statusOf(i), q = qtyOf(i), by = nameOf(i.updatedBy);
                const conf = S.confirm === "item:" + i.id;
                return `<div class="st-item ${x.out ? "out" : ""}">
                    <div class="st-item-main"><div class="st-item-name">${esc(i.name)}</div>
                        <div class="st-item-meta">${x.out ? `<span class="st-flag warn">Épuisé</span>` : x.low ? `<span class="st-flag warn">À racheter</span>` : ""}
                            ${dlcFlag(x, i.expiry)}
                            ${typeof i.min === "number" ? `<span>seuil ${fmtQty(i.min)} ${esc(i.unit || "")}</span>` : ""}
                            ${by ? `<span>· modifié par ${esc(by)}</span>` : ""}</div></div>
                    <div class="st-stepper"><button type="button" data-act="dec" data-id="${esc(i.id)}" aria-label="Retirer" ${q <= 0 ? "disabled" : ""}>−</button>
                        <span class="st-qty">${fmtQty(q)} <small>${esc(i.unit || "")}</small></span>
                        <button type="button" data-act="inc" data-id="${esc(i.id)}" aria-label="Ajouter">+</button></div>
                    <div class="st-item-actions">
                        ${x.out || x.low ? `<button type="button" class="st-link st-act" data-act="shop" data-id="${esc(i.id)}" aria-label="Ajouter aux courses"><span aria-hidden="true">🛒</span><span class="st-lbl">Aux courses</span></button>` : ""}
                        <button type="button" class="st-link st-act" data-act="edit" data-id="${esc(i.id)}" aria-label="Modifier"><span aria-hidden="true">✏️</span><span class="st-lbl">Modifier</span></button>
                        <button type="button" class="st-link st-act ${conf ? "armed" : ""}" data-act="del" data-id="${esc(i.id)}" aria-label="${conf ? "Confirmer la suppression" : "Supprimer"}"><span aria-hidden="true">🗑️</span><span class="st-lbl">${conf ? "Confirmer" : "Supprimer"}</span></button></div>
                </div>`;
            }).join("")}</div>`;
        }
        if (key) {
            const el = list.querySelector(`[data-act="${key[0]}"][data-id="${CSS.escape(key[1])}"]`);
            if (el && !el.disabled) el.focus();
        }
    }

    // ==========================================
    // ACTIONS
    // ==========================================
    function chipsHTML(name) {
        return TYPES.map((t, i) => `<label class="st-chip" style="--c:${colorVar(t.id)}"><input type="radio" name="${name}" value="${t.id}" ${i === 0 ? "checked" : ""}><span>${t.icon} ${esc(t.label)}</span></label>`).join("");
    }
    $("as-types").innerHTML = chipsHTML("as-type");
    $("es-types").innerHTML = chipsHTML("es-type");
    const unitOpts = UNITS.map(u => `<option value="${u}">${u}</option>`).join("");
    $("ai-unit").innerHTML = unitOpts; $("ie-unit").innerHTML = unitOpts;

    function openStorage(id) {
        S.view = id; S.confirm = null; S.editing = null;
        hide("item-editor", "edit-storage", "add-storage");
        $("add-item").classList.remove("ouvert");
        renderAll(); outils.defiler(0);
    }
    function goHome() { S.view = null; S.confirm = null; renderAll(); }
    let confirmT;
    function arm(key) {
        S.confirm = key; clearTimeout(confirmT);
        confirmT = setTimeout(() => { S.confirm = null; renderAll(); }, 4000);
        renderAll();
    }
    function showForm(id, focusId) { $("add-item").classList.remove("ouvert"); const f = $(id); f.hidden = false; f.scrollIntoView({ block: "nearest", behavior: "smooth" }); if (focusId) $(focusId).focus({ preventScroll: true }); }

    // Quantités : on regroupe les clics rapides en une seule écriture
    const timers = {};
    function bump(id, dir) {
        const it = S.items.get(id); if (!it) return;
        const q = Math.max(0, round(qtyOf(it) + dir * stepFor(it.unit)));
        S.pending[id] = { qty: q }; renderDetail();
        clearTimeout(timers[id]); timers[id] = setTimeout(() => flushQty(id), 600);
    }
    function flushQty(id) {
        const p = S.pending[id]; if (!p) return; const q = p.qty, sid = S.stockId;
        queue("item-" + id, () => updateDoc(doc(db, "stocks", sid, "items", id), { qty: q, updatedAt: now(), updatedBy: S.user.uid }))
            .then(ok => { if (!ok || (S.pending[id] && S.pending[id].qty === q)) { delete S.pending[id]; renderAll(); } });
    }

    // Supprime des documents par paquets (Firestore : 500 max par lot)
    async function deleteRefs(refs) {
        for (let i = 0; i < refs.length; i += 400) {
            const b = writeBatch(db);
            refs.slice(i, i + 400).forEach(r => b.delete(r));
            await b.commit();
        }
    }

    racine.addEventListener("click", e => {
        const el = e.target.closest("[data-open],[data-action],[data-act],[data-close]"); if (!el || !S.user) return;
        if (el.dataset.close) { $(el.dataset.close).hidden = true; if (el.dataset.close === "item-editor") S.editing = null; return; }
        if (el.dataset.open) { openStorage(el.dataset.open); return; }
        const a = el.dataset.action, act = el.dataset.act, id = el.dataset.id;

        if (a === "home") goHome();
        else if (a === "open-add-item") { $("add-item").classList.add("ouvert"); $("ai-name").focus(); }
        else if (a === "close-add-item") $("add-item").classList.remove("ouvert");
        else if (a === "new-stock") showForm("new-stock", "ns-name");
        else if (a === "add-storage") { if (S.view) goHome(); showForm("add-storage", "as-name"); }
        else if (a === "edit-storage") {
            const st = S.storages.get(S.view); if (!st) return;
            $("es-name").value = st.name;
            const r = $("es-types").querySelector(`input[value="${typeOf(st.type).id}"]`); if (r) r.checked = true;
            showForm("edit-storage", "es-name");
        }
        else if (a === "del-storage") {
            const key = "storage:" + S.view; if (S.confirm !== key) { arm(key); return; }
            const sid = S.view, refs = itemsOf(sid).map(i => itemRef(i.id)).concat([storageRef(sid)]);
            S.confirm = null; goHome();
            queue("del-" + sid, () => deleteRefs(refs)).then(ok => { if (ok) toast("Rangement supprimé."); });
        }
        else if (act === "inc") bump(id, 1);
        else if (act === "dec") bump(id, -1);
        else if (act === "shop") {
            const it = S.items.get(id); if (!it) return;
            // la liste de courses choisie en dernier dans le Dashboard (sinon la première)
            const choisie = storeGet("liste-courses");
            const liste = S.listesCourses.find(l => l.id === choisie) || S.listesCourses[0];
            if (!liste) { toast("Crée d'abord une liste de courses dans le Dashboard."); return; }
            queue("courses", () => addDoc(collection(db, "listes", liste.id, "articles"),
                { texte: String(it.name).slice(0, 200), coche: false, creeLe: now(), creePar: S.user.uid }))
                .then(ok => { if (ok) toast(`« ${it.name} » ajouté à « ${liste.name} » 🛒`); });
        }
        else if (act === "edit") {
            const i = S.items.get(id); if (!i) return; S.editing = id;
            $("ie-name").value = i.name || ""; $("ie-qty").value = qtyOf(i);
            $("ie-unit").value = UNITS.includes(i.unit) ? i.unit : "pcs";
            $("ie-min").value = typeof i.min === "number" ? i.min : ""; $("ie-exp").value = i.expiry || "";
            $("ie-storage").innerHTML = sortedStorages().map(s => `<option value="${esc(s.id)}" ${s.id === i.storageId ? "selected" : ""}>${esc(s.name)}</option>`).join("");
            showForm("item-editor", "ie-name");
        }
        else if (act === "del") {
            const key = "item:" + id; if (S.confirm !== key) { arm(key); return; }
            S.confirm = null;
            queue("item-" + id, () => deleteDoc(itemRef(id))).then(ok => { if (ok) toast("Produit supprimé."); });
        }
    });

    // Échap ferme le panneau ouvert (sur téléphone, ils s'affichent par-dessus la page)
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape" || !outils.visible()) return;
        const ouvert = ["item-editor", "edit-storage", "add-storage", "new-stock"].find(id => !$(id).hidden);
        if (ouvert) { $(ouvert).hidden = true; if (ouvert === "item-editor") S.editing = null; }
        else $("add-item").classList.remove("ouvert");
    });

    $("stock-select").addEventListener("change", e => {
        const v = e.target.value;
        if (v === "__new") { e.target.value = S.stockId || ""; showForm("new-stock", "ns-name"); return; }
        openStock(v);
    });
    $("btn-rename").onclick = () => renommerPartage({ collection: "stocks", partage: stock(), quoi: "ce stock" });
    $("btn-add-storage").onclick = () => { if (S.view) goHome(); showForm("add-storage", "as-name"); };
    // Qui a accès : panneau commun à tout le site
    $("btn-access").onclick = () => {
        if (!S.stockId) return;
        ouvrirAcces({
            collection: "stocks", id: S.stockId, quoi: "ce stock",
            supprimerContenu: async (sid) => {
                const [a1, a2] = await Promise.all([getDocs(collection(db, "stocks", sid, "items")), getDocs(collection(db, "stocks", sid, "storages"))]);
                await deleteRefs([...a1.docs, ...a2.docs].map(d => d.ref));
            }
        });
    };
    $("search").addEventListener("input", e => { S.q = e.target.value.trim(); renderWatch(); renderResults(); });

    // Formulaires
    racine.addEventListener("submit", async e => {
        const f = e.target; if (!S.user) return;
        e.preventDefault();

        if (f.id === "new-stock") {
            const name = $("ns-name").value.trim(); if (!name) return;
            f.hidden = true;
            try {
                const id = await creerPartage("stocks", { name });
                storeSet("stock-current", id);
                if (S.stocks.has(id)) openStock(id); else S.wantStock = id;
                toast(`Stock « ${name} » créé.`);
            } catch (err) { onWriteErr(err); }
        }
        else if (f.id === "add-storage") {
            const name = $("as-name").value.trim(); if (!name || !S.stockId) return;
            const type = (f.querySelector('input[name="as-type"]:checked') || {}).value || "autre";
            f.hidden = true; $("as-name").value = "";
            queue("new-storage", () => addDoc(storagesCol(), { name, type, createdAt: now(), createdBy: S.user.uid }))
                .then(ok => { if (ok) toast(`« ${name} » ajouté.`); });
        }
        else if (f.id === "edit-storage") {
            const sid = S.view; const name = $("es-name").value.trim(); if (!sid || !name) return;
            const type = (f.querySelector('input[name="es-type"]:checked') || {}).value || "autre";
            f.hidden = true;
            queue("storage-" + sid, () => updateDoc(storageRef(sid), { name, type }))
                .then(ok => { if (ok) toast("Rangement mis à jour."); });
        }
        else if (f.id === "add-item") {
            const sid = S.view; const name = $("ai-name").value.trim(); if (!sid || !name) return;
            const d = { storageId: sid, name, qty: numOrNull($("ai-qty").value) ?? 0, unit: $("ai-unit").value, min: numOrNull($("ai-min").value), expiry: $("ai-exp").value || null, createdAt: now(), updatedAt: now(), updatedBy: S.user.uid };
            $("ai-name").value = ""; $("ai-qty").value = "1"; $("ai-min").value = ""; $("ai-exp").value = ""; $("ai-name").focus();
            queue("new-item", () => addDoc(itemsCol(), d));
        }
        else if (f.id === "item-editor") {
            const id = S.editing; const name = $("ie-name").value.trim(); if (!id || !name) return;
            const patch = { name, qty: numOrNull($("ie-qty").value) ?? 0, unit: $("ie-unit").value, min: numOrNull($("ie-min").value), expiry: $("ie-exp").value || null, storageId: $("ie-storage").value || S.view, updatedAt: now(), updatedBy: S.user.uid };
            clearTimeout(timers[id]); delete S.pending[id];
            f.hidden = true; S.editing = null;
            queue("item-" + id, () => updateDoc(itemRef(id), patch))
                .then(ok => { if (ok) toast(patch.storageId !== S.view ? "Produit déplacé." : "Produit mis à jour."); });
        }
    });

    // ==========================================
    // DÉMARRAGE
    // ==========================================
    renderAll();
    subscribeStocks();
    // listes de courses du compte (pour le bouton « Aux courses »)
    ecouterMesPartages("listes", listes => { S.listesCourses = listes.filter(l => l.type === "courses"); });
}
