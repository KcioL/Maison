// ==========================================
// COQUILLE DU SITE (une seule page pour toutes les applis)
//
// - dessine la barre des applis et le bouton clair / sombre
// - lit l'adresse (#/stock, #/recettes/recette/abc…) et affiche la bonne appli
// - charge chaque appli une seule fois (vue.html + style.css + app.js),
//   puis la garde ouverte en arrière-plan : y revenir est instantané
// - prépare les autres applis en arrière-plan juste après le démarrage
// ==========================================
import { APPS, MENU } from "./apps.js";

const TOUTES = [MENU, ...APPS];
const racineSite = new URL("../", import.meta.url);
const zoneVues = document.getElementById("vues");
const etats = new Map();   // id -> { def, conteneur, module, pret, titre, defilement }
let courant = null;        // id de l'appli affichée

// ---------- Barre des applis + bouton clair / sombre ----------
function dessinerBarres() {
    // petit bouton clair / sombre en haut (téléphone)
    const barreTheme = document.createElement("div");
    barreTheme.className = "barre-theme";
    if (window.Theme) barreTheme.appendChild(window.Theme.bouton("theme-toggle"));

    const nav = document.createElement("nav");
    nav.className = "app-nav";
    nav.setAttribute("aria-label", "Applis");

    // logo (ou emoji) + nom long (ordinateur) + nom court (téléphone)
    for (const a of TOUTES) {
        const lien = document.createElement("a");
        lien.href = a.id === "menu" ? "#/" : `#/${a.id}`;
        lien.dataset.appli = a.id;
        if (a.id === "menu") lien.classList.add("app-nav-home");
        lien.setAttribute("aria-label", a.name);
        const ico = document.createElement("span");
        ico.className = "nav-ico"; ico.setAttribute("aria-hidden", "true");
        if (a.logo) {
            const img = document.createElement("img");
            img.src = new URL(a.logo, racineSite).href; img.alt = ""; img.width = 28; img.height = 28;
            ico.appendChild(img);
        } else ico.textContent = a.icon;
        const long = document.createElement("span"); long.className = "nav-long"; long.textContent = a.name;
        const court = document.createElement("span"); court.className = "nav-court"; court.textContent = a.short || a.name;
        lien.append(ico, long, court);
        nav.appendChild(lien);
    }
    // sur ordinateur, le bouton clair / sombre est au bout de la barre
    if (window.Theme) nav.appendChild(window.Theme.bouton("app-nav-theme"));

    document.body.prepend(barreTheme, nav);
    document.body.classList.add("avec-onglets");
}

function majBarre(id) {
    document.querySelectorAll(".app-nav a[data-appli]").forEach(a => {
        const actif = a.dataset.appli === id;
        a.classList.toggle("active", actif && id !== "menu");
        if (actif) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
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
        // l'appli est-elle à l'écran ?
        visible: () => courant === def.id,
        // titre de l'onglet du navigateur (appliqué quand l'appli est affichée)
        titre: (t) => { etat.titre = t; if (courant === def.id) document.title = t; },
        // va à une adresse de cette appli (ex. "recette/abc"), remplacer = sans historique
        aller: (chemin, { remplacer = false } = {}) => {
            const adresse = `#/${def.id}${chemin ? "/" + chemin : ""}`;
            if (remplacer) { history.replaceState(null, "", adresse); router(); }
            else location.hash = adresse;
        },
        // adresse d'un lien vers une page de cette appli
        lien: (chemin) => `#/${def.id}${chemin ? "/" + chemin : ""}`,
        // fait défiler la page seulement si l'appli est affichée
        defiler: (y) => { if (courant === def.id) window.scrollTo(0, y); },
        racineSite
    };

    const dossier = new URL(`${def.dossier}/`, racineSite);
    etat.pret = (async () => {
        const [, html, module] = await Promise.all([
            chargerCss(new URL("style.css", dossier).href),
            fetch(new URL("vue.html", dossier)).then(r => r.text()),
            import(new URL("app.js", dossier).href)
        ]);
        conteneur.innerHTML = html;
        etat.module = module.default || module;
        if (etat.module.demarrer) await etat.module.demarrer(conteneur, outils);
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

async function router() {
    const { def, chemin } = lireAdresse();
    const etat = await charger(def);
    // l'adresse a pu changer pendant le chargement
    if (lireAdresse().def.id !== def.id) return;

    if (courant === def.id) {
        etat.module?.afficher?.(chemin);   // navigation interne à l'appli
        return;
    }

    const ancien = courant ? etats.get(courant) : null;
    const changer = async () => {
        if (ancien) {
            ancien.defilement = window.scrollY;
            ancien.module?.masquer?.();
            ancien.conteneur.hidden = true;
        }
        courant = def.id;
        etat.conteneur.hidden = false;
        document.body.className = document.body.className.replace(/\bappli-\S+/g, "").trim();
        document.body.classList.add(`appli-${def.id}`);
        majBarre(def.id);
        document.title = etat.titre;
        // l'appli se met à jour (sans attendre plus de 0,3 s pour l'animation)
        const affichage = Promise.resolve(etat.module?.afficher?.(chemin));
        await Promise.race([affichage, attendre(300)]);
        window.scrollTo(0, etat.defilement || 0);
    };

    if (ancien && document.startViewTransition && !animationsReduites.matches) {
        document.startViewTransition(changer);
    } else {
        await changer();
    }
}

// ---------- Démarrage ----------
dessinerBarres();
window.addEventListener("hashchange", router);
router().then(() => {
    // une fois la première appli affichée, on prépare les autres en arrière-plan
    const preparer = () => TOUTES.reduce((p, def) => p.then(() => charger(def)), Promise.resolve());
    if ("requestIdleCallback" in window) requestIdleCallback(preparer, { timeout: 2000 });
    else setTimeout(preparer, 800);
});
