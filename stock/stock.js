// ==========================================
// APPLI GESTION DES STOCKS
// Firebase Auth (comptes e-mail) + Firestore
//
// Données :
//   stocks/{stockId}                      nom, propriétaire, membres
//   stocks/{stockId}/storages/{id}        rangements (frigo, placard…)
//   stocks/{stockId}/items/{id}           produits
//   stockDirectory/{email}                annuaire : e-mail → compte (pour partager)
// ==========================================
import { app, db } from "../commun/firebase.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, doc, query, where, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
    getDoc, getDocs, writeBatch, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const auth = getAuth(app);

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
const AVATAR_COLORS = ["#e07a5f", "#5b8fb9", "#6a9a76", "#c08552", "#9b84b8", "#a5576b", "#3d8a8a"];

// ------------------------------------------
// État
// ------------------------------------------
const S = {
    user: null, verified: false, myName: "",
    stocks: new Map(), stockId: null,
    storages: new Map(), items: new Map(), loadedS: false, loadedI: false,
    view: null, q: "", pending: {}, confirm: null, editing: null,
    names: {}, unsubStocks: null, unsubStock: [], signupMode: false
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const now = () => Date.now();
const stock = () => S.stocks.get(S.stockId);
const isOwner = () => !!stock() && stock().ownerId === S.user?.uid;
const emailKey = e => String(e || "").trim().toLowerCase();
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
    if (S.names[uid]) return S.names[uid];
    const email = stock()?.members?.[uid];
    return email ? email.split("@")[0] : "un ancien membre";
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

// ==========================================
// CONNEXION
// ==========================================
const AUTH_ERRORS = {
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect.",
    "auth/wrong-password": "E-mail ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail : connecte-toi.",
    "auth/weak-password": "Le mot de passe doit faire au moins 6 caractères.",
    "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
    "auth/too-many-requests": "Trop d'essais. Attends quelques minutes avant de réessayer.",
    "auth/network-request-failed": "Pas de connexion internet."
};
function authError(msg) { const el = $("auth-error"); el.textContent = msg; el.hidden = !msg; }
function setAuthMode(signup) {
    S.signupMode = signup;
    $("auth-submit").textContent = signup ? "Créer mon compte" : "Se connecter";
    $("auth-toggle").textContent = signup ? "J'ai déjà un compte : me connecter" : "Pas encore de compte ? Créer un compte";
    $("auth-intro").textContent = signup ? "Crée ton compte. Tu recevras un e-mail pour le vérifier." : "Connecte-toi avec ton compte pour retrouver ton stock.";
    $("auth-password").autocomplete = signup ? "new-password" : "current-password";
    authError("");
}
$("auth-toggle").onclick = () => setAuthMode(!S.signupMode);
$("auth-forgot").onclick = async () => {
    const email = $("auth-email").value.trim();
    if (!email) { authError("Écris ton e-mail ci-dessus, puis clique à nouveau sur « Mot de passe oublié ? »."); return; }
    try { await sendPasswordResetEmail(auth, email); authError(""); toast("E-mail de réinitialisation envoyé (pense à regarder les spams)."); }
    catch (e) { authError(AUTH_ERRORS[e.code] || "Envoi impossible. Vérifie l'adresse."); }
};
$("auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("auth-email").value.trim(), pass = $("auth-password").value;
    $("auth-submit").disabled = true; authError("");
    try {
        if (S.signupMode) {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            try { await sendEmailVerification(cred.user); } catch { }
            toast("Compte créé. Un e-mail de vérification t'a été envoyé.");
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
        $("auth-password").value = "";
    } catch (err) {
        authError(AUTH_ERRORS[err.code] || "Connexion impossible. Réessaie.");
    } finally { $("auth-submit").disabled = false; }
});
$("btn-logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
    $("boot").hidden = true;
    stopAll();
    S.user = u;
    if (!u) {
        $("auth-view").hidden = false; $("app-view").hidden = true;
        return;
    }
    $("auth-view").hidden = true; $("app-view").hidden = false;
    $("account-email").textContent = `Connecté : ${u.email}`;
    S.verified = !!u.emailVerified;
    S.view = null; S.q = ""; $("search").value = "";
    renderAll();
    subscribeStocks();
    ensureDirectory();
});

// L'annuaire permet aux autres de te retrouver par e-mail pour te partager un stock.
// Il faut un e-mail vérifié pour s'y inscrire (personne ne peut se faire passer pour toi).
async function ensureDirectory() {
    const u = S.user; if (!u || !u.email) return;
    S.myName = u.email.split("@")[0];
    if (!S.verified) return;
    try {
        const ref = doc(db, "stockDirectory", emailKey(u.email));
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().uid === u.uid) {
            S.myName = snap.data().name || S.myName;
        } else {
            await setDoc(ref, { uid: u.uid, name: S.myName.slice(0, 40) });
        }
    } catch (e) { console.warn("Annuaire :", e); }
    if (!$("access-panel").hidden) renderAccess();
}

// ==========================================
// ABONNEMENTS FIRESTORE
// ==========================================
function stopAll() {
    if (S.unsubStocks) { S.unsubStocks(); S.unsubStocks = null; }
    stopStock();
    S.stocks = new Map(); S.stockId = null; S.names = {};
}
function stopStock() {
    S.unsubStock.forEach(f => f()); S.unsubStock = [];
    S.storages = new Map(); S.items = new Map(); S.loadedS = S.loadedI = false; S.pending = {};
}

let stocksLoaded = false;
function subscribeStocks() {
    stocksLoaded = false;
    const q = query(collection(db, "stocks"), where("memberIds", "array-contains", S.user.uid));
    S.unsubStocks = onSnapshot(q, snap => {
        stocksLoaded = true;
        S.stocks = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
        let target = S.stockId;
        if (S.wantStock && S.stocks.has(S.wantStock)) { target = S.wantStock; S.wantStock = null; }
        else if (!target || !S.stocks.has(target)) {
            const saved = storeGet("stock-current");
            target = saved && S.stocks.has(saved) ? saved : (sortedStocks()[0]?.id || null);
        }
        if (target !== S.stockId) openStock(target);
        else { loadNames(); renderAll(); }
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
    loadNames();
}
function stockErr(err) {
    console.error(err);
    if (err.code !== "permission-denied") showBanner("Le stock n'a pas pu se mettre à jour. Recharge la page.");
}

// Prénoms des membres, lus dans l'annuaire
async function loadNames() {
    const s = stock(); if (!s || !s.members) return;
    const todo = Object.entries(s.members).filter(([uid]) => !(uid in S.names) && uid !== S.user.uid);
    if (!todo.length) return;
    await Promise.all(todo.map(async ([uid, email]) => {
        try {
            const snap = await getDoc(doc(db, "stockDirectory", email));
            S.names[uid] = snap.exists() && snap.data().uid === uid && snap.data().name ? snap.data().name : email.split("@")[0];
        } catch { S.names[uid] = email.split("@")[0]; }
    }));
    renderAll();
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
    if (!$("access-panel").hidden) renderAccess();
}

function renderChrome() {
    const s = stock();
    $("stock-title").textContent = s ? s.name : "Stocks";
    document.title = s ? `${s.name} · Stocks` : "Gestion des stocks";
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
    $("btn-add-storage").hidden = !s;
    $("home-view").hidden = !!S.view;
    $("detail-view").hidden = !S.view;
}

function renderHome() {
    const grid = $("grid"), s = stock();
    if (!stocksLoaded) { grid.innerHTML = `<div class="st-empty"><h3>Chargement…</h3></div>`; hide("watch", "results"); return; }
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
    if (!S.loadedS) grid.innerHTML = `<div class="st-empty"><h3>Chargement des rangements…</h3></div>`;
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

function avatar(name, uid) {
    let h = 0; for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `<span class="st-avatar" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc((name || "?").charAt(0).toUpperCase())}</span>`;
}

function renderAccess() {
    const p = $("access-panel"), s = stock();
    if (!s) { p.hidden = true; return; }
    const me = S.user.uid, owner = isOwner();
    const members = Object.entries(s.members || {}).sort(([a], [b]) => (a === s.ownerId ? -1 : b === s.ownerId ? 1 : 0));
    const people = members.map(([uid, email]) => {
        const nm = uid === me ? `${S.myName} (toi)` : (S.names[uid] || email.split("@")[0]);
        const conf = S.confirm === "member:" + uid;
        return `<div class="st-person">${avatar(nm, uid)}
            <div class="st-person-txt"><b>${esc(nm)}</b><small>${esc(email)}</small></div>
            ${uid === s.ownerId ? `<span class="st-flag ok">Propriétaire</span>` : `<span class="st-flag neutral">Membre</span>`}
            ${owner && uid !== me ? `<button type="button" class="st-link ${conf ? "armed" : ""}" data-act="remove-member" data-id="${esc(uid)}">${conf ? "Confirmer le retrait" : "Retirer"}</button>` : ""}
        </div>`;
    }).join("");

    const verifyNote = S.verified ? "" : `<div class="st-note">
        <span><b>Vérifie ton adresse e-mail</b> pour que les autres puissent te partager leur stock.</span>
        <span style="display:flex;gap:0.5rem;flex-wrap:wrap"><button type="button" class="st-btn st-small" data-action="send-verify">Envoyer l'e-mail de vérification</button>
        <button type="button" class="st-btn st-small" data-action="check-verify">J'ai cliqué sur le lien</button></span></div>`;

    const confDel = S.confirm === "stock:" + s.id, confLeave = S.confirm === "leave:" + s.id;
    p.innerHTML = `<div class="st-panel-head"><h2 class="st-h2">👥 Qui a accès à « ${esc(s.name)} »</h2><button type="button" class="st-link" data-close="access-panel">Fermer</button></div>
        <div class="st-people">${people}</div>
        ${owner ? `<form id="add-member" class="st-row" autocomplete="off">
            <label class="st-field st-grow"><span class="st-label">Donner l'accès à</span><input id="am-email" type="email" required placeholder="E-mail de son compte"></label>
            <button class="st-btn st-primary" type="submit">Donner l'accès</button></form>
            <p class="st-muted" style="font-size:0.88rem">La personne doit avoir un compte, avoir ouvert l'appli Stock une fois et vérifié son e-mail. Elle verra alors ce stock et pourra le modifier.</p>`
            : `<p class="st-muted" style="font-size:0.9rem">Seul le propriétaire peut donner ou retirer l'accès.</p>`}
        ${verifyNote}
        <hr class="st-divider">
        <form id="my-name" class="st-row" autocomplete="off">
            <label class="st-field st-grow"><span class="st-label">Ton prénom (vu par les autres)</span><input id="mn-name" maxlength="40" value="${esc(S.myName)}" ${S.verified ? "" : "disabled"}></label>
            <button class="st-btn" type="submit" ${S.verified ? "" : "disabled"}>Enregistrer</button></form>
        ${owner ? `<form id="rename-stock" class="st-row" autocomplete="off">
            <label class="st-field st-grow"><span class="st-label">Nom du stock</span><input id="rs-name" maxlength="60" required value="${esc(s.name)}"></label>
            <button class="st-btn" type="submit">Renommer</button></form>` : ""}
        <div>${owner
            ? `<button type="button" class="st-btn st-small st-danger ${confDel ? "armed" : ""}" data-action="del-stock">${confDel ? "Supprimer définitivement ce stock et tout son contenu ?" : "Supprimer ce stock"}</button>`
            : `<button type="button" class="st-btn st-small st-danger ${confLeave ? "armed" : ""}" data-action="leave-stock">${confLeave ? "Confirmer : quitter ce stock" : "Quitter ce stock"}</button>`}</div>`;
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
    renderAll(); window.scrollTo(0, 0);
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

document.addEventListener("click", e => {
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
    else if (a === "send-verify") {
        sendEmailVerification(S.user).then(() => toast("E-mail envoyé à " + S.user.email + " (regarde aussi les spams)."))
            .catch(err => toast(err.code === "auth/too-many-requests" ? "Déjà envoyé il y a peu : attends quelques minutes." : "Envoi impossible pour le moment."));
    }
    else if (a === "check-verify") {
        (async () => {
            await S.user.reload(); await S.user.getIdToken(true);
            S.verified = !!auth.currentUser.emailVerified;
            if (S.verified) { toast("E-mail vérifié ✔"); await ensureDirectory(); renderAll(); }
            else toast("Pas encore vérifié : clique sur le lien reçu par e-mail, puis réessaie.");
        })();
    }
    else if (a === "del-stock") {
        const s = stock(); if (!s || !isOwner()) return;
        const key = "stock:" + s.id; if (S.confirm !== key) { arm(key); return; }
        S.confirm = null; $("access-panel").hidden = true;
        const sid = s.id;
        queue("stock-" + sid, async () => {
            const [a1, a2] = await Promise.all([getDocs(collection(db, "stocks", sid, "items")), getDocs(collection(db, "stocks", sid, "storages"))]);
            await deleteRefs([...a1.docs, ...a2.docs].map(d => d.ref));
            await deleteDoc(stockRef(sid));
        }).then(ok => { if (ok) toast("Stock supprimé."); });
    }
    else if (a === "leave-stock") {
        const s = stock(); if (!s) return;
        const key = "leave:" + s.id; if (S.confirm !== key) { arm(key); return; }
        S.confirm = null; $("access-panel").hidden = true;
        const me = S.user.uid;
        queue("stock-" + s.id, () => updateDoc(stockRef(s.id), { memberIds: s.memberIds.filter(x => x !== me), ["members." + me]: deleteField() }))
            .then(ok => { if (ok) toast("Tu as quitté ce stock."); });
    }
    else if (act === "inc") bump(id, 1);
    else if (act === "dec") bump(id, -1);
    else if (act === "shop") {
        const it = S.items.get(id); if (!it) return;
        queue("courses", () => addDoc(collection(db, "courses"), { text: String(it.name).slice(0, 200), checked: false, createdAt: new Date() }))
            .then(ok => { if (ok) toast(`« ${it.name} » ajouté à la liste de courses 🛒`); });
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
    else if (act === "remove-member") {
        const s = stock(); if (!s || !isOwner()) return;
        const key = "member:" + id; if (S.confirm !== key) { arm(key); return; }
        S.confirm = null;
        queue("stock-" + s.id, () => updateDoc(stockRef(s.id), { memberIds: s.memberIds.filter(x => x !== id), ["members." + id]: deleteField() }))
            .then(ok => { if (ok) toast("Accès retiré."); });
    }
});

// Échap ferme le panneau ouvert (sur téléphone, ils s'affichent par-dessus la page)
document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const ouvert = ["item-editor", "edit-storage", "add-storage", "new-stock", "access-panel"].find(id => !$(id).hidden);
    if (ouvert) { $(ouvert).hidden = true; if (ouvert === "item-editor") S.editing = null; }
    else $("add-item").classList.remove("ouvert");
});

$("stock-select").addEventListener("change", e => {
    const v = e.target.value;
    if (v === "__new") { e.target.value = S.stockId || ""; showForm("new-stock", "ns-name"); return; }
    $("access-panel").hidden = true;
    openStock(v);
});
$("btn-add-storage").onclick = () => { if (S.view) goHome(); showForm("add-storage", "as-name"); };
$("btn-access").onclick = () => { const p = $("access-panel"); p.hidden = !p.hidden; if (!p.hidden) { renderAccess(); loadNames(); } };
$("search").addEventListener("input", e => { S.q = e.target.value.trim(); renderWatch(); renderResults(); });

// Formulaires
document.addEventListener("submit", async e => {
    const f = e.target; if (!S.user) return;
    e.preventDefault();

    if (f.id === "new-stock") {
        const name = $("ns-name").value.trim(); if (!name) return;
        const uid = S.user.uid;
        f.hidden = true;
        try {
            const ref = await addDoc(collection(db, "stocks"), { name, ownerId: uid, memberIds: [uid], members: { [uid]: emailKey(S.user.email) }, createdAt: now() });
            storeSet("stock-current", ref.id);
            if (S.stocks.has(ref.id)) openStock(ref.id); else S.wantStock = ref.id;
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
    else if (f.id === "add-member") {
        const s = stock(); if (!s || !isOwner()) return;
        const key = emailKey($("am-email").value);
        if (!key) return;
        if (Object.values(s.members || {}).includes(key)) { toast("Cette personne a déjà accès."); return; }
        try {
            const snap = await getDoc(doc(db, "stockDirectory", key));
            if (!snap.exists()) {
                toast("Aucun compte trouvé. La personne doit ouvrir l'appli Stock une fois et vérifier son e-mail.");
                return;
            }
            const uid = snap.data().uid;
            S.names[uid] = snap.data().name || key.split("@")[0];
            await updateDoc(stockRef(s.id), { memberIds: [...s.memberIds, uid], ["members." + uid]: key });
            $("am-email").value = "";
            toast(`${S.names[uid]} a maintenant accès à « ${s.name} ».`);
        } catch (err) { onWriteErr(err); }
    }
    else if (f.id === "my-name") {
        const name = $("mn-name").value.trim().slice(0, 40); if (!name || !S.verified) return;
        try {
            await setDoc(doc(db, "stockDirectory", emailKey(S.user.email)), { uid: S.user.uid, name });
            S.myName = name; toast("Prénom enregistré.");
        } catch (err) { onWriteErr(err); }
    }
    else if (f.id === "rename-stock") {
        const s = stock(); const name = $("rs-name").value.trim(); if (!s || !name) return;
        queue("stock-" + s.id, () => updateDoc(stockRef(s.id), { name })).then(ok => { if (ok) toast("Stock renommé."); });
    }
});
