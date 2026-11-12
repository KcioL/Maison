// ==========================================
// MODE CLAIR / MODE SOMBRE (tout le site)
// À charger dans le <head> de chaque page, AVANT les feuilles de style :
//   <script src="../commun/theme.js"></script>
// Le choix est gardé dans le navigateur et vaut pour toutes les applis.
// Sans choix enregistré, le site suit le réglage du téléphone / de l'ordinateur.
// ==========================================
(function () {
    var CLE = "theme";
    var racine = document.documentElement;
    var systemeSombre = window.matchMedia("(prefers-color-scheme: dark)");

    function choixEnregistre() {
        try {
            var v = localStorage.getItem(CLE);
            return v === "clair" || v === "sombre" ? v : null;
        } catch (e) { return null; }
    }
    function themeVoulu() {
        return choixEnregistre() || (systemeSombre.matches ? "sombre" : "clair");
    }
    function majBouton(b) {
        var sombre = racine.getAttribute("data-theme") === "sombre";
        b.textContent = sombre ? "☀️ Clair" : "🌙 Sombre";
        b.setAttribute("aria-label", sombre ? "Passer en mode clair" : "Passer en mode sombre");
        b.title = b.getAttribute("aria-label");
    }
    function appliquer(t) {
        racine.setAttribute("data-theme", t);
        racine.style.colorScheme = t === "sombre" ? "dark" : "light";
        // couleur de la barre du navigateur sur téléphone (si la page la précise)
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            if (!meta.getAttribute("data-clair")) meta.setAttribute("data-clair", meta.getAttribute("content"));
            var c = meta.getAttribute(t === "sombre" ? "data-sombre" : "data-clair");
            if (c) meta.setAttribute("content", c);
        }
        var boutons = document.querySelectorAll("[data-theme-toggle]");
        for (var i = 0; i < boutons.length; i++) majBouton(boutons[i]);
    }

    appliquer(themeVoulu());
    document.addEventListener("DOMContentLoaded", function () { appliquer(themeVoulu()); });

    window.Theme = {
        basculer: function () {
            var t = racine.getAttribute("data-theme") === "sombre" ? "clair" : "sombre";
            try { localStorage.setItem(CLE, t); } catch (e) { }
            appliquer(t);
        },
        // Crée un bouton prêt à l'emploi ; la classe permet de le styler
        bouton: function (classe) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = classe || "theme-toggle";
            b.setAttribute("data-theme-toggle", "");
            b.addEventListener("click", window.Theme.basculer);
            majBouton(b);
            return b;
        }
    };

    // suit le réglage du système tant qu'aucun choix n'a été fait
    if (systemeSombre.addEventListener) {
        systemeSombre.addEventListener("change", function () { if (!choixEnregistre()) appliquer(themeVoulu()); });
    }
    // même thème dans tous les onglets ouverts
    window.addEventListener("storage", function (e) { if (e.key === CLE) appliquer(themeVoulu()); });
})();
