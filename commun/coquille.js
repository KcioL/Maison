// ==========================================
// COQUILLE DU SITE (une seule page pour toutes les applis)
//
// - connexion : un seul compte pour tout le site (commun/compte.js)
// - barre du haut : bouton du compte + bouton clair / sombre
// - barre des applis : capsule flottante en bas, l'anneau glisse vers l'appli ouverte
// - lit l'adresse (#/stock, #/recettes/recette/abc…) et affiche la bonne appli,
//   avec un glissement vers la gauche ou la droite selon le sens
// - charge chaque appli une seule fois (vue.html + style.css + app.js),
//   puis la garde ouverte en arrière-plan : y revenir est instantané
// ==========================================
import { APPS, MENU } from "./apps.js";
import {
    compte, pret, probablementConnecte, surChangement, seConnecter, creerCompte, motDePasseOublie,
    messageErreur, deconnecter, changerNom, envoyerVerification, actualiserVerification
} from "./compte.js";
import { esc, toast, ouvrirFeuille } from "./ui.js";
import { avatar } from "./partage.js";

const TOUTES = [MENU, ...APPS];
const racineSite = new URL("../", import.meta.url);
const zoneVues = document.getElementById("vues");
const etats = new Map();   // id -> { def, conteneur, module, pret, titre, defilement }
let courant = null;        // id de l'appli affichée

// ---------- Barre du haut : compte + clair / sombre ----------
let boutonCompte;
function dessinerBarreHaut() {
    const barre = document.createElement("div");
    barre.className = "barre-haut";
    boutonCompte = document.createElement("button");
    boutonCompte.type = "button";
    boutonCompte.className = "puce-compte";
    boutonCompte.addEventListener("click", ouvrirMonCompte);
    barre.appendChild(boutonCompte);
    if (window.Theme) barre.appendChild(window.Theme.bouton("theme-toggle"));
    document.body.prepend(barre);
    majBoutonCompte();
    surChangement(majBoutonCompte);
}
function majBoutonCompte() {
    if (!boutonCompte) return;
    boutonCompte.hidden = !compte.uid;
    boutonCompte.innerHTML = `${avatar(compte.nom, compte.uid || "?")}<span class="puce-nom">${esc(compte.nom)}</span>`;
    boutonCompte.setAttribute("aria-label", `Mon compte (${compte.nom})`);
}

function ouvrirMonCompte() {
    const f = ouvrirFeuille({ titre: "Mon compte" });
    const dessiner = () => {
        f.corps.innerHTML = `
            <div class="personne">${avatar(compte.nom, compte.uid)}
                <div class="personne-txt"><b>${esc(compte.nom)}</b><small>${esc(compte.email)}</small></div></div>
            ${compte.verifie ? `
            <form class="ligne-form" autocomplete="off">
                <label class="champ"><span>Ton prénom (vu par les personnes avec qui tu partages)</span>
                <input name="nom" maxlength="40" required value="${esc(compte.nom)}"></label>
                <button class="bouton" type="submit">Enregistrer</button>
            </form>` : `
            <div class="note">
                <span><b>Vérifie ton adresse e-mail</b> pour que les autres puissent te partager leurs listes, stocks et carnets, et pour choisir ton prénom.</span>
                <span class="boutons"><button type="button" class="bouton petit" data-action="envoyer">Envoyer l'e-mail</button>
                <button type="button" class="bouton petit" data-action="verifie">J'ai cliqué sur le lien</button></span></div>`}
            <hr class="separation">
            <div><button type="button" class="bouton danger petit" data-action="deconnexion">Se déconnecter</button></div>`;
        f.corps.querySelector("form")?.addEventListener("submit", async e => {
            e.preventDefault();
            try { if (await changerNom(e.target.nom.value)) { toast("Prénom enregistré."); dessiner(); } }
            catch { toast("Enregistrement impossible. Réessaie."); }
        });
        f.corps.querySelector('[data-action="envoyer"]')?.addEventListener("click", () =>
            envoyerVerification().then(() => toast(`E-mail envoyé à ${compte.email} (regarde aussi les spams).`))
                .catch(e => toast(e.code === "auth/too-many-requests" ? "Déjà envoyé il y a peu : attends quelques minutes." : "Envoi impossible pour le moment.")));
        f.corps.querySelector('[data-action="verifie"]')?.addEventListener("click", async () => {
            toast(await actualiserVerification() ? "E-mail vérifié ✔" : "Pas encore vérifié : clique sur le lien reçu par e-mail, puis réessaie.");
            dessiner();
        });
        f.corps.querySelector('[data-action="deconnexion"]').addEventListener("click", deconnecter);
    };
    dessiner();
}

// ---------- Barre des applis (capsule flottante) ----------
const ICONE_MENU = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/>
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>`;
let dock, anneau;

function dessinerDock() {
    dock = document.createElement("nav");
    dock.className = "dock";
    dock.setAttribute("aria-label", "Applis");
    anneau = document.createElement("span");
    anneau.className = "dock-anneau";
    anneau.setAttribute("aria-hidden", "true");
    dock.appendChild(anneau);

    for (const a of TOUTES) {
        const lien = document.createElement("a");
        lien.href = a.id === "menu" ? "#/" : `#/${a.id}`;
        lien.dataset.appli = a.id;
        lien.className = "dock-appli" + (a.id === "menu" ? " dock-menu" : "");
        lien.setAttribute("aria-label", a.name);
        lien.title = a.name;
        if (a.id === "menu") lien.innerHTML = ICONE_MENU;
        else {
            if (a.logo) {
                const img = document.createElement("img");
                img.src = new URL(a.logo, racineSite).href; img.alt = ""; img.width = 44; img.height = 44;
                lien.appendChild(img);
            } else lien.textContent = a.icon;
            const point = document.createElement("span");
            point.className = "dock-point";
            point.style.setProperty("--c", a.color || "var(--accent)");
            lien.appendChild(point);
        }
        dock.appendChild(lien);
        if (a.id === "menu") {
            const sep = document.createElement("span");
            sep.className = "dock-sep"; sep.setAttribute("aria-hidden", "true");
            dock.appendChild(sep);
        }
    }
    document.body.appendChild(dock);
    window.addEventListener("resize", () => placerAnneau(false));
}

function placerAnneau(anime = true) {
    const actif = dock?.querySelector(`.dock-appli[data-appli="${courant}"]`);
    if (!actif) return;
    if (!anime) anneau.style.transition = "none";
    anneau.style.width = actif.offsetWidth + "px";
    anneau.style.height = actif.offsetHeight + "px";
    anneau.style.transform = `translate(${actif.offsetLeft}px, ${actif.offsetTop}px)`;
    anneau.classList.add("visible");
    if (!anime) { anneau.getBoundingClientRect(); anneau.style.transition = ""; }
}

function majDock(id) {
    dock.querySelectorAll(".dock-appli").forEach(a => {
        const actif = a.dataset.appli === id;
        a.classList.toggle("active", actif);
        if (actif) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    placerAnneau(true);
}

// ---------- Écran de connexion ----------
function afficherConnexion() {
    document.body.classList.remove("connecte");
    document.body.classList.add("non-connecte");
    let inscription = false;
    const vue = document.createElement("div");
    vue.className = "vue vue-connexion style-maison";
    vue.innerHTML = `
        <div class="widget carte-connexion">
            <img class="connexion-logo" src="commun/logos/maison-192.png" srcset="commun/logos/maison-512.png 2x" alt="" width="110" height="110">
            <h1>Maison</h1>
            <p class="muet" data-intro>Connecte-toi pour retrouver tes listes, ton stock et tes recettes.</p>
            <form autocomplete="on">
                <label class="champ"><span>E-mail</span><input name="email" type="email" required autocomplete="email"></label>
                <label class="champ"><span>Mot de passe</span><input name="mdp" type="password" required minlength="6" autocomplete="current-password"></label>
                <p class="erreur" hidden></p>
                <button class="bouton principal large" type="submit">Se connecter</button>
            </form>
            <div class="connexion-liens">
                <button type="button" class="lien-bouton" data-action="basculer">Pas encore de compte ? Créer un compte</button>
                <button type="button" class="lien-bouton" data-action="oubli">Mot de passe oublié ?</button>
            </div>
        </div>`;
    zoneVues.innerHTML = "";
    zoneVues.appendChild(vue);
    const form = vue.querySelector("form"), erreur = vue.querySelector(".erreur");
    const montrerErreur = (m) => { erreur.textContent = m; erreur.hidden = !m; };
    vue.querySelector('[data-action="basculer"]').addEventListener("click", (e) => {
        inscription = !inscription;
        form.querySelector('[type="submit"]').textContent = inscription ? "Créer mon compte" : "Se connecter";
        e.target.textContent = inscription ? "J'ai déjà un compte : me connecter" : "Pas encore de compte ? Créer un compte";
        vue.querySelector("[data-intro]").textContent = inscription
            ? "Crée ton compte. Tu recevras un e-mail pour le vérifier."
            : "Connecte-toi pour retrouver tes listes, ton stock et tes recettes.";
        form.mdp.autocomplete = inscription ? "new-password" : "current-password";
        montrerErreur("");
    });
    vue.querySelector('[data-action="oubli"]').addEventListener("click", async () => {
        const email = form.email.value.trim();
        if (!email) { montrerErreur("Écris ton e-mail ci-dessus, puis clique à nouveau sur « Mot de passe oublié ? »."); return; }
        try { await motDePasseOublie(email); montrerErreur(""); toast("E-mail de réinitialisation envoyé (pense à regarder les spams)."); }
        catch (e) { montrerErreur(messageErreur(e, "Envoi impossible. Vérifie l'adresse.")); }
    });
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const bouton = form.querySelector('[type="submit"]');
        bouton.disabled = true; montrerErreur("");
        try {
            if (inscription) await creerCompte(form.email.value.trim(), form.mdp.value);
            else await seConnecter(form.email.value.trim(), form.mdp.value);
            location.reload();   // on démarre le site connecté, proprement
        } catch (err) {
            montrerErreur(messageErreur(err));
            bouton.disabled = false;
        }
    });
    document.title = "Maison";
}

// ---------- Chargement d'une appli (une seule fois) ----------
function chargerCss(href) {
    return new Promise(resolve => {
        const lien = document.createElement("link");
        lien.rel = "stylesheet"; lien.href = href;
        lien.onload = lien.onerror = () => resolve();
        document.head.appendChild(lien);
    });
}

function charger(def) {
    if (etats.has(def.id)) return etats.get(def.id).pret;
    const conteneur = document.createElement("div");
    conteneur.className = `vue vue-${def.id}` + (def.style === "maison" ? " style-maison" : "");
    conteneur.hidden = true;
    zoneVues.appendChild(conteneur);

    const etat = { def, conteneur, module: null, titre: def.titre || `${def.name} · Maison`, defilement: 0 };
    const outils = {
        compte,                                   // { uid, email, nom, verifie }
        visible: () => courant === def.id,        // l'appli est-elle à l'écran ?
        // titre de l'onglet du navigateur (appliqué quand l'appli est affichée)
        titre: (t) => { etat.titre = t; if (courant === def.id) document.title = t; },
        // va à une page interne de l'appli (ex. "recette/abc"), remplacer = sans historique
        aller: (chemin, { remplacer = false } = {}) => {
            const adresse = `#/${def.id}${chemin ? "/" + chemin : ""}`;
            if (remplacer) { history.replaceState(null, "", adresse); router(); }
            else location.hash = adresse;
        },
        lien: (chemin) => `#/${def.id}${chemin ? "/" + chemin : ""}`,
        // fait défiler la page seulement si l'appli est affichée
        defiler: (y) => { if (courant === def.id) window.scrollTo(0, y); },
        racineSite
    };

    const dossier = new URL(`${def.dossier}/`, racineSite);
    etat.pret = (async () => {
        const sansCompte = def.id === "menu";   // le menu s'affiche sans attendre Firebase
        const [, html, module, utilisateur] = await Promise.all([
            chargerCss(new URL("style.css", dossier).href),
            fetch(new URL("vue.html", dossier)).then(r => r.text()),
            import(new URL("app.js", dossier).href),
            sansCompte ? null : pret
        ]);
        conteneur.innerHTML = html;
        etat.module = module.default || module;
        // les autres applis démarrent seulement avec un compte connecté
        if ((utilisateur || sansCompte) && etat.module.demarrer) await etat.module.demarrer(conteneur, outils);
        return etat;
    })().catch(err => {
        console.error(`Appli « ${def.id} » :`, err);
        conteneur.innerHTML = `<p style="padding:2rem;text-align:center">Cette appli n'a pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`;
        return etat;
    });
    etats.set(def.id, etat);
    return etat.pret;
}

// ---------- Adresse -> appli ----------
function lireAdresse() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [id, ...reste] = h.split("/");
    const def = TOUTES.find(a => a.id === id);
    return def ? { def, chemin: reste.join("/") } : { def: MENU, chemin: "" };
}

const animationsReduites = window.matchMedia("(prefers-reduced-motion: reduce)");
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
let finirGlissement = null;   // termine tout de suite un glissement en cours

async function router() {
    if (!document.body.classList.contains("connecte")) return;
    const { def, chemin } = lireAdresse();
    const etat = await charger(def);
    if (lireAdresse().def.id !== def.id) return;   // l'adresse a changé entre-temps

    if (courant === def.id) {
        etat.module?.afficher?.(chemin);   // page interne de la même appli
        return;
    }

    finirGlissement?.();
    const ancien = courant ? etats.get(courant) : null;
    const sens = ancien && TOUTES.indexOf(def) < TOUTES.indexOf(ancien.def) ? "precedent" : "suivant";
    const departY = window.scrollY;
    if (ancien) {
        ancien.defilement = departY;
        ancien.module?.masquer?.();
    }
    courant = def.id;
    etat.conteneur.hidden = false;
    document.body.className = document.body.className.replace(/\bappli-\S+/g, "").trim();
    document.body.classList.add(`appli-${def.id}`);
    majDock(def.id);
    document.title = etat.titre;
    // l'appli se met à jour (sans attendre plus de 0,15 s)
    await Promise.race([Promise.resolve(etat.module?.afficher?.(chemin)), attendre(150)]);
    const arriveeY = etat.defilement || 0;
    window.scrollTo(0, arriveeY);

    if (!ancien) return;
    if (animationsReduites.matches) { ancien.conteneur.hidden = true; return; }

    // Glissement : l'ancienne vue part d'un côté pendant que la nouvelle arrive de l'autre
    const vieux = ancien.conteneur, neuf = etat.conteneur;
    zoneVues.dataset.sens = sens;
    vieux.style.top = `${arriveeY - departY}px`;
    vieux.classList.add("sortie");
    neuf.classList.add("entree");
    let fini = false;
    finirGlissement = () => {
        if (fini) return; fini = true;
        vieux.classList.remove("sortie"); vieux.style.top = ""; vieux.hidden = courant !== ancien.def.id;
        neuf.classList.remove("entree");
        finirGlissement = null;
    };
    setTimeout(() => finirGlissement?.(), 340);
}

// ---------- Démarrage ----------
dessinerBarreHaut();
dessinerDock();
window.addEventListener("hashchange", router);

function demarrerSite() {
    document.body.classList.add("connecte");
    document.body.classList.remove("non-connecte");
    router().then(() => {
        // une fois la première appli affichée, on prépare les autres en arrière-plan
        const preparer = () => TOUTES.reduce((p, def) => p.then(() => charger(def)), Promise.resolve());
        if ("requestIdleCallback" in window) requestIdleCallback(preparer, { timeout: 2000 });
        else setTimeout(preparer, 800);
    });
}

// Déjà connecté sur cet appareil : on affiche le site tout de suite,
// sans attendre la confirmation de Firebase (les applis, elles, l'attendent).
if (probablementConnecte()) demarrerSite();
pret.then(u => {
    if (!u) afficherConnexion();
    else if (!document.body.classList.contains("connecte")) demarrerSite();
});
