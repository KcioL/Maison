// ==========================================
// LISTE DES APPLIS DU SITE
// Chaque appli a son dossier, avec toujours les trois mêmes fichiers :
//   vue.html   le contenu (HTML) de l'appli
//   style.css  son style (règles préfixées par .vue-<id>)
//   app.js     son code, qui exporte :
//                demarrer(racine, outils)  appelé une seule fois
//                afficher(chemin)          à chaque fois qu'on ouvre l'appli
//                masquer()                 quand on part sur une autre appli
//
// Pour ajouter une appli « budget » :
//   1. crée le dossier budget/ avec vue.html, style.css et app.js
//      (copie un dossier existant comme modèle, par exemple dashboard/)
//   2. ajoute un bloc ci-dessous
//   3. si elle utilise la base, ajoute ses règles dans firestore.rules
// Elle apparaît alors dans le menu et dans la barre d'onglets.
//
//   id     identifiant, utilisé dans l'adresse (#/budget) et la classe .vue-budget
//   name   nom affiché (menu, barre sur ordinateur)
//   short  nom court (barre d'onglets du téléphone)
//   logo   image ronde, chemin depuis la racine (sinon l'emoji icon)
//   style  "maison" pour reprendre le style cosy commun (commun/maison.css)
// ==========================================

// La page d'accueil (pas affichée comme une tuile du menu)
export const MENU = {
    id: "menu",
    name: "Menu",
    short: "Menu",
    icon: "☰",
    logo: "commun/logos/maison-192.png",
    dossier: "menu",
    style: "maison",
    titre: "Maison"
};

export const APPS = [
    {
        id: "dashboard",
        name: "Dashboard",
        short: "Dashboard",
        icon: "🏠",
        logo: "commun/logos/courses-192.png",
        desc: "Horloge, météo, roue du destin, listes de courses et choses à faire.",
        dossier: "dashboard",
        style: "maison",
        color: "#e07a5f"
    },
    {
        id: "stock",
        name: "Gestion des stocks",
        short: "Stock",
        icon: "📦",
        logo: "commun/logos/stock-192.png",
        desc: "Frigo, placards, congélateur : ce qu'il reste et ce qu'il faut racheter.",
        dossier: "stock",
        style: "maison",
        color: "#81a88d"
    },
    {
        id: "recettes",
        name: "Recettes",
        short: "Recettes",
        icon: "📖",
        logo: "recettes/icons/icon-192.png",
        desc: "Les carnets de recettes, avec les photos et les liens d'inspiration.",
        dossier: "recettes",
        color: "#9c88d8"
    },
    {
        id: "convertisseur",
        name: "Convertisseur",
        short: "Convertir",
        icon: "⚖️",
        logo: "commun/logos/convertisseur-192.png",
        desc: "Ajuster les portions d'une recette, convertir cups et cuillères en grammes, adapter à la taille du moule.",
        dossier: "convertisseur",
        style: "maison",
        color: "#a5576b"
    },
    {
        id: "muscu",
        name: "Muscu",
        short: "Muscu",
        icon: "🏋️",
        logo: "commun/logos/muscu-192.png",
        desc: "Tes programmes d'entraînement : séries, répétitions, poids, repos et minuteur.",
        dossier: "muscu",
        style: "maison",
        color: "#5b8fb9"
    },
    {
        id: "abonnements",
        name: "Abonnements",
        short: "Abonnements",
        icon: "💳",
        logo: "commun/logos/abonnements-192.png",
        desc: "Netflix, salle de sport, forfait… ce que ça coûte par mois, par an, et quand ça se renouvelle.",
        dossier: "abonnements",
        style: "maison",
        color: "#3d8a8a"
    },
    {
        id: "loyer",
        name: "Loyer & charges",
        short: "Loyer",
        icon: "🔑",
        logo: "commun/logos/loyer-192.png",
        desc: "Partager le loyer (à parts égales, selon les revenus ou les chambres) et qui paie l'eau, l'électricité, le wifi…",
        dossier: "loyer",
        style: "maison",
        color: "#d4a017"
    }
];
