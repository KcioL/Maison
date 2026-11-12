// ==========================================
// BARRE DE NAVIGATION ENTRE LES APPLIS (la même partout)
// Ajoutée automatiquement sur chaque page qui charge ce script.
//   <body data-app="...">            l'appli courante (mise en évidence)
//   <body data-nav="pleine-page">    pour une appli sans marges autour de la page
//                                     (ex. recettes) : la barre ajoute les siennes
// Sur ordinateur : barre en haut de la page.
// Sur téléphone  : barre d'onglets fixée en bas de l'écran, à portée de pouce.
// Le petit bouton clair / sombre est toujours en haut de l'appli.
// Il vient de commun/theme.js (à charger dans le <head>).
// ==========================================
import { APPS } from "./apps.js";

// racine du site = dossier parent de commun/
const racine = new URL("../", import.meta.url);
const current = document.body.dataset.app;
const pleinePage = document.body.dataset.nav === "pleine-page";

// Ouvert comme appli depuis l'écran d'accueil ?
const installee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Dans l'appli « Maison » (tout le site), la barre est toujours là.
// Seul le carnet de recettes installé à part (sa propre appli, sans le reste du site) la cache.
const MARQUE = "dans-appli-maison";
try { if (installee && current !== "recettes") sessionStorage.setItem(MARQUE, "1"); } catch (e) { }
let dansAppliMaison = false;
try { dansAppliMaison = sessionStorage.getItem(MARQUE) === "1"; } catch (e) { }
const avecBarre = !(installee && current === "recettes" && !dansAppliMaison);

const style = document.createElement("style");
style.textContent = `
/* ---------- Couleurs de la barre : identiques dans toutes les applis ---------- */
:root {
    --nav-fond: #ffffff; --nav-verre: rgba(255, 255, 255, 0.88); --nav-texte: #4a443c; --nav-doux: #a3988f;
    --nav-survol: #f4eee8; --nav-ligne: #eeeeee; --nav-accent: #e07a5f; --nav-sur-accent: #ffffff;
    --nav-fort: #4a443c; --nav-fort-survol: #2d2924; --nav-sur-fort: #ffffff;
    --nav-ombre: 0 12px 35px rgba(138, 121, 104, 0.12);
}
:root[data-theme="sombre"] {
    --nav-fond: #26211d; --nav-verre: rgba(38, 33, 29, 0.88); --nav-texte: #efe7dd; --nav-doux: #a99d91;
    --nav-survol: #3a322c; --nav-ligne: #3b342e; --nav-accent: #e98a6e; --nav-sur-accent: #1b1714;
    --nav-fort: #efe7dd; --nav-fort-survol: #ffffff; --nav-sur-fort: #1b1714;
    --nav-ombre: 0 12px 35px rgba(0, 0, 0, 0.35);
}

/* ---------- Barre des applis (ordinateur : en haut) ---------- */
.app-nav {
    display: flex; align-items: center; gap: 0.3rem;
    max-width: 1200px; margin: -0.5rem auto 2rem; padding: 0.5rem;
    background: var(--nav-verre);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    border-radius: 999px; box-shadow: var(--nav-ombre);
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.2;
}
.app-nav.pleine-page { margin: 1rem auto 1rem; width: calc(100% - 2rem); }
.app-nav a, .app-nav button {
    display: inline-flex; align-items: center; gap: 0.4rem;
    text-decoration: none; color: var(--nav-texte); font: inherit; font-weight: 500;
    padding: 0.5rem 1rem; border: none; background: none; cursor: pointer;
    border-radius: 999px; white-space: nowrap;
    transition: background 0.2s, color 0.2s;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.app-nav a:hover, .app-nav button:hover { background: var(--nav-survol); }
.app-nav a:focus-visible, .app-nav button:focus-visible { outline: 2px solid var(--nav-accent); outline-offset: 2px; }
.app-nav .app-nav-home { background: var(--nav-fort); color: var(--nav-sur-fort); font-weight: 700; margin-right: 0.5rem; }
.app-nav .app-nav-home:hover { background: var(--nav-fort-survol); }
.app-nav a.active { background: var(--nav-accent); color: var(--nav-sur-accent); }
.app-nav .app-nav-theme { margin-left: auto; }
.app-nav .nav-court { display: none; }
.app-nav .nav-ico img { width: 22px; height: 22px; display: block; border-radius: 50%; }
.app-nav .app-nav-home .nav-ico img { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6); }

/* ---------- Petit bouton clair / sombre en haut (téléphone) ---------- */
.barre-theme { display: none; justify-content: flex-end; margin: 0 0 0.6rem; }
.barre-theme.pleine-page { padding: max(0.6rem, env(safe-area-inset-top, 0px)) max(1rem, env(safe-area-inset-right, 0px)) 0 1rem; margin: 0; }
.barre-theme.seule { display: flex; }
.theme-toggle {
    display: inline-flex; align-items: center; gap: 0.35rem;
    border: none; cursor: pointer; font: 700 0.85rem/1.2 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--nav-verre); color: var(--nav-texte);
    padding: 0.45rem 0.85rem; border-radius: 999px;
    box-shadow: var(--nav-ombre);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.theme-toggle:focus-visible { outline: 2px solid var(--nav-accent); outline-offset: 2px; }

@media (max-width: 700px) {
    :root { --hauteur-onglets: calc(4rem + env(safe-area-inset-bottom, 0px)); }
    .barre-theme { display: flex; }
    .app-nav .app-nav-theme { display: none; }
    .app-nav .nav-long { display: none; }
    .app-nav .nav-court { display: inline; }

    /* Barre d'onglets en bas de l'écran */
    .app-nav, .app-nav.pleine-page {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000;
        box-sizing: border-box; height: var(--hauteur-onglets); width: auto;
        max-width: none; margin: 0; border-radius: 0; gap: 0; align-items: stretch;
        padding: 0.35rem max(6px, env(safe-area-inset-right, 0px)) calc(0.35rem + env(safe-area-inset-bottom, 0px)) max(6px, env(safe-area-inset-left, 0px));
        background: var(--nav-fond);
        border-top: 1px solid var(--nav-ligne);
        box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.08);
    }
    .app-nav a {
        flex: 1 1 0; min-width: 0; flex-direction: column; justify-content: center; gap: 0.15rem;
        padding: 0 0.1rem; margin: 0; border-radius: 14px;
        font-size: 11px; font-weight: 600; color: var(--nav-doux);
    }
    .app-nav .nav-ico {
        font-size: 1.3rem; line-height: 1; width: 3.2rem; height: 2.1rem; border-radius: 999px;
        display: grid; place-items: center; transition: background 0.2s;
    }
    .app-nav .nav-ico img { width: 28px; height: 28px; box-shadow: none !important; }
    .app-nav a:hover { background: none; }
    .app-nav .app-nav-home, .app-nav .app-nav-home:hover { background: none; color: var(--nav-doux); }
    .app-nav a.active { background: none; color: var(--nav-accent); }
    .app-nav a.active .nav-ico { background: color-mix(in srgb, var(--nav-accent) 18%, transparent); }
    body.avec-onglets { padding-bottom: calc(var(--hauteur-onglets) + 1.5rem) !important; }
}
@media (prefers-reduced-motion: reduce) { .app-nav * { transition: none !important; } }`;
document.head.appendChild(style);

// la police de la barre (Inter), si la page ne l'a pas déjà
if (!document.querySelector('link[href*="family=Inter"]')) {
    const police = document.createElement("link");
    police.rel = "stylesheet";
    police.href = "https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap";
    document.head.appendChild(police);
}

// ---- petit bouton clair / sombre en haut de l'appli
if (window.Theme) {
    const barreTheme = document.createElement("div");
    barreTheme.className = "barre-theme" + (pleinePage ? " pleine-page" : "") + (avecBarre ? "" : " seule");
    barreTheme.appendChild(window.Theme.bouton("theme-toggle"));
    document.body.prepend(barreTheme);
}

// ---- barre des applis
if (avecBarre) {
    const nav = document.createElement("nav");
    nav.className = "app-nav" + (pleinePage ? " pleine-page" : "");
    nav.setAttribute("aria-label", "Applis");

    // logo (ou emoji) + nom long (ordinateur) + nom court (téléphone)
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

    // sur ordinateur, le bouton clair / sombre est aussi à droite de la barre
    if (window.Theme) nav.appendChild(window.Theme.bouton("app-nav-theme"));

    // sur ordinateur la barre est en haut, juste sous le petit bouton (caché à cette taille)
    const barreTheme = document.querySelector(".barre-theme");
    if (barreTheme) barreTheme.after(nav); else document.body.prepend(nav);
    document.body.classList.add("avec-onglets");
}
