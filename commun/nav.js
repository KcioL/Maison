// ==========================================
// BARRE DE NAVIGATION ENTRE LES APPLIS
// Ajoutée automatiquement sur chaque page qui charge ce script.
//   <body data-app="...">         l'appli courante (mise en évidence)
//   <body data-nav="bandeau">     version bandeau en haut, pleine largeur
//                                  (pour les applis qui ont leurs propres barres)
// Sur ordinateur : barre en haut de la page.
// Sur téléphone  : barre d'onglets fixée en bas de l'écran, à portée de pouce
//                  (sauf en mode bandeau, qui reste en haut sur une ligne).
// Les liens marchent depuis n'importe quel dossier d'appli.
// Le bouton clair / sombre vient de commun/theme.js (à charger dans le <head>).
// ==========================================
import { APPS } from "./apps.js";

// racine du site = dossier parent de commun/
const racine = new URL("../", import.meta.url);
const current = document.body.dataset.app;
const bandeau = document.body.dataset.nav === "bandeau";

// Ouvert comme appli depuis l'écran d'accueil ?
const installee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Dans l'appli « Maison » (tout le site), on garde toujours la navigation.
// Seul le carnet de recettes installé à part (sa propre appli) cache son bandeau.
const MARQUE = "dans-appli-maison";
try { if (installee && !bandeau) sessionStorage.setItem(MARQUE, "1"); } catch (e) { }
let dansAppliMaison = false;
try { dansAppliMaison = sessionStorage.getItem(MARQUE) === "1"; } catch (e) { }

if (!(bandeau && installee && !dansAppliMaison)) {
    const style = document.createElement("style");
    style.textContent = `
.app-nav {
    display: flex; align-items: center; gap: 0.3rem;
    max-width: 1200px; margin: -0.5rem auto 2rem; padding: 0.5rem;
    background: var(--glass, rgba(255, 255, 255, 0.85));
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    border-radius: 999px; box-shadow: var(--card-shadow, 0 12px 35px rgba(138, 121, 104, 0.08));
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.2;
}
.app-nav a, .app-nav button {
    display: inline-flex; align-items: center; gap: 0.4rem;
    text-decoration: none; color: var(--text-main, #4a443c); font: inherit; font-weight: 500;
    padding: 0.5rem 1rem; border: none; background: none; cursor: pointer;
    border-radius: 999px; white-space: nowrap;
    transition: background 0.2s, color 0.2s;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.app-nav a:hover, .app-nav button:hover { background: var(--hover-bg, #f4eee8); }
.app-nav a:focus-visible, .app-nav button:focus-visible { outline: 2px solid var(--accent, #e07a5f); outline-offset: 2px; }
.app-nav .app-nav-home { background: var(--strong-bg, #4a443c); color: var(--strong-text, #fff); font-weight: 700; margin-right: 0.5rem; }
.app-nav .app-nav-home:hover { background: var(--strong-hover, #2d2924); }
.app-nav a.active { background: var(--accent, #e07a5f); color: var(--on-accent, #fff); }
.app-nav .app-nav-theme { margin-left: auto; }
.app-nav .nav-court { display: none; }
.app-nav .nav-ico img { width: 22px; height: 22px; display: block; border-radius: 50%; }
.app-nav .app-nav-home .nav-ico img { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6); }

/* Bandeau (applis avec leurs propres barres) */
.app-nav.bandeau {
    max-width: none; margin: 0; border-radius: 0; box-shadow: none;
    border-bottom: 1px solid var(--hover-bg, rgba(0, 0, 0, 0.06)); background: var(--card-bg, #fff);
    padding: calc(0.4rem + env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) 0.4rem max(12px, env(safe-area-inset-left, 0px));
    font-size: 14px; overflow-x: auto; scrollbar-width: none;
}
.app-nav.bandeau::-webkit-scrollbar { display: none; }
.app-nav.bandeau a, .app-nav.bandeau button { padding: 0.35rem 0.8rem; }

@media (max-width: 700px) {
    .app-nav .nav-long { display: none; }
    .app-nav .nav-court { display: inline; }

    /* Barre d'onglets en bas de l'écran */
    .app-nav.onglets {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000;
        max-width: none; margin: 0; border-radius: 0; gap: 0;
        padding: 0.35rem max(6px, env(safe-area-inset-right, 0px)) calc(0.35rem + env(safe-area-inset-bottom, 0px)) max(6px, env(safe-area-inset-left, 0px));
        background: var(--card-bg, #fff);
        border-top: 1px solid var(--line, #eee);
        box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.08);
    }
    .app-nav.onglets a, .app-nav.onglets button {
        flex: 1 1 0; min-width: 0; flex-direction: column; gap: 0.15rem;
        padding: 0.35rem 0.1rem; margin: 0; border-radius: 14px;
        font-size: 11px; font-weight: 600; color: var(--text-muted, #a3988f);
    }
    .app-nav.onglets .nav-ico {
        font-size: 1.3rem; line-height: 1; width: 3.2rem; height: 2.1rem; border-radius: 999px;
        display: grid; place-items: center;
        transition: background 0.2s;
    }
    .app-nav.onglets .nav-ico img { width: 28px; height: 28px; box-shadow: none; }
    .app-nav.onglets a:hover, .app-nav.onglets button:hover { background: none; }
    .app-nav.onglets .app-nav-home, .app-nav.onglets .app-nav-home:hover { background: none; color: var(--text-muted, #a3988f); }
    .app-nav.onglets a.active { background: none; color: var(--accent, #e07a5f); }
    .app-nav.onglets a.active .nav-ico { background: color-mix(in srgb, var(--accent, #e07a5f) 18%, transparent); }
    .app-nav.onglets .app-nav-theme { margin-left: 0; }
    body.avec-onglets { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)) !important; }

    .app-nav.bandeau { gap: 0.15rem; }
    .app-nav.bandeau .app-nav-home { margin-right: 0.2rem; }
    .app-nav.bandeau a, .app-nav.bandeau button { padding: 0.35rem 0.6rem; }
}
@media (prefers-reduced-motion: reduce) { .app-nav * { transition: none !important; } }`;
    document.head.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "app-nav " + (bandeau ? "bandeau" : "onglets");
    nav.setAttribute("aria-label", "Applis");

    // icône + nom long (ordinateur) + nom court (téléphone)
    const lien = (href, icone, logo, nom, court, classe) => {
        const a = document.createElement("a");
        a.href = href;
        if (classe) a.className = classe;
        const i = document.createElement("span"); i.className = "nav-ico"; i.setAttribute("aria-hidden", "true");
        if (logo) {
            const img = document.createElement("img");
            img.src = new URL(logo, racine).href; img.alt = ""; img.width = 28; img.height = 28;
            i.appendChild(img);
        } else i.textContent = icone;
        const l = document.createElement("span"); l.className = "nav-long"; l.textContent = nom;
        const c = document.createElement("span"); c.className = "nav-court"; c.textContent = court || nom;
        a.append(i, l, c);
        a.setAttribute("aria-label", nom);
        return a;
    };

    nav.appendChild(lien(new URL("index.html", racine).href, "☰", "commun/logos/maison-192.png", "Menu", "Menu", "app-nav-home"));
    APPS.forEach(a => {
        const el = lien(new URL(a.href, racine).href, a.icon, a.logo, a.name, a.short, a.id === current ? "active" : "");
        if (a.id === current) el.setAttribute("aria-current", "page");
        nav.appendChild(el);
    });

    // bouton clair / sombre (commun/theme.js)
    if (window.Theme) nav.appendChild(window.Theme.bouton("app-nav-theme"));

    if (bandeau) document.body.prepend(nav);
    else {
        document.body.prepend(nav);
        document.body.classList.add("avec-onglets");
    }
}
