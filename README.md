# Maison

Le site de la maison : un menu d'accueil et plusieurs applis, réunis dans **une seule page**.
Les applis sont chargées une fois puis restent ouvertes en arrière-plan :
passer de l'une à l'autre est instantané, sans rechargement.
Toutes partagent la même base Firebase (`dash-board-maison`) et **un seul compte** :
on se connecte une fois sur la page d'accueil, et chaque appli utilise ce compte.

## Rangement

```
index.html            La page unique du site (elle accueille toutes les applis)
firestore.rules       Règles Firestore de toute la base (à publier dans la console Firebase)

commun/               Ce qui sert à toutes les applis
  coquille.js         Connexion, barre des applis, adresse (#/stock…), passage d'une appli à l'autre
  coquille.css        Style de la barre des applis, de la connexion et des panneaux communs
  compte.js           Le compte connecté (connexion, prénom, annuaire pour partager)
  partage.js          Partage commun : mes listes / stocks / carnets, panneau « Qui a accès »
  ui.js               Petits outils : message en bas de l'écran, panneau par-dessus la page, confirmation, saisie
  selecteur.js        Barre « choix + Partager + Renommer + Supprimer » toute prête (pour les nouvelles applis)
  apps.js             Liste des applis (menu et barre d'onglets)
  firebase.js         Configuration Firebase (une seule base)
  firestore.js        Firestore pour les applis : comme l'original, mais chaque ajout / modification est signalé
  nouveautes.js       Le petit rond « du nouveau » sur les logos (barre et menu), qui disparaît une fois vu
  theme.js            Mode clair / sombre (choix gardé pour tout le site)
  base.css            Palette (clair / sombre) et photo de fond
  maison.css          Style « cosy » partagé par Menu, Dashboard et Stock
  fond-pc.jpg         Image de fond (ordinateur et tablette)
  fond-telephone.jpg  Image de fond (téléphone)
  logos/              Logos (maison = site et appli écran d'accueil, stock, courses)
  manifest.webmanifest  Appli « Maison » installable sur le téléphone

menu/                 Page d'accueil (une tuile par appli)
dashboard/            Horloge, météo, roue du destin, listes de courses et de choses à faire
stock/                Gestion des stocks
recettes/             Carnets de recettes (+ icons/)
                        (import.js : remplir une recette depuis une capture ou un texte collé,
                        lecture du texte sur le téléphone avec Tesseract.js)
                        (traduction.js : traduction en français, traducteur de Chrome ou MyMemory, gratuit)
abonnements/          Suivi des abonnements (coût par mois / par an, renouvellements)
loyer/                Partage du loyer et des charges dans le foyer
garage/               Carnet d'entretien : alertes au kilométrage, fiche technique, historique
                        (modeles.js : entretiens proposés par type de véhicule, et PLANS : plans
                        d'entretien par modèle précis, avec leurs sources)
menus/                Menus de la semaine : repas du midi et du soir (recettes des carnets ou
                        repas libres) et envoi des ingrédients dans une liste de courses
meubles/              Meubles repérés : référence, photos, prix et historique, comparaison des
                        prix (recherche sur plusieurs sites + prix notés), reste à acheter par pièce
convertisseur/        Portions, mesures (cups → grammes, °F → °C) et taille du moule
muscu/                Programmes de muscu, séances et minuteur de repos (+ exercices.js : le catalogue)
```

Chaque dossier d'appli contient toujours les mêmes fichiers :

| Fichier      | Rôle |
|--------------|------|
| `vue.html`   | le contenu (HTML) de l'appli |
| `style.css`  | son style ; toutes les règles commencent par `.vue-<appli>` pour ne pas déborder sur les autres |
| `app.js`     | son code : `demarrer(racine, outils)` (une fois), `afficher(chemin)` (à chaque ouverture), `masquer()` |
| `index.html` | ancienne adresse de l'appli : renvoie vers la page unique |

## Adresses

- `#/` le menu, `#/dashboard`, `#/stock`, `#/recettes`
- pages du carnet : `#/recettes/recette/<id>`, `#/recettes/ajouter`, `#/recettes/modifier/<id>`

## Ajouter une appli « budget »

1. Crée le dossier `budget/` avec `vue.html`, `style.css` et `app.js`
   (copie `dashboard/` comme modèle).
2. Dans `style.css`, commence chaque règle par `.vue-budget`.
   Pour reprendre le style cosy (cartes `.widget`, titres…), mets `style: "maison"` à l'étape 4.
3. Dans `app.js`, exporte `demarrer(racine, outils)` et cherche tes éléments dans `racine`
   (`racine.querySelector("#mon-id")`), pas dans `document`.
   Pour la base : `import { db } from "../commun/firebase.js";` et les fonctions Firestore
   (`doc`, `addDoc`…) depuis `../commun/firestore.js`.
   Pour partager : `ecouterMesPartages`, `creerPartage`, `ouvrirAcces` de `../commun/partage.js`.
4. Ajoute l'appli dans `commun/apps.js`.
5. Si elle utilise la base, ajoute ses règles dans `firestore.rules`, puis publie-les.

Elle apparaît alors dans le menu et dans la barre d'onglets.

## Données et partage

Tout ce qui se partage a la même forme (`name`, `ownerId`, `memberIds`, `members`, `createdAt`) :

| Collection | Contenu |
|------------|---------|
| `listes/{id}` (+ `type` : `courses` ou `taches`) | `articles/{id}` : `texte`, `coche`, `creeLe`, `creePar` |
| `stocks/{id}` | `storages/{id}` (rangements), `items/{id}` (produits) |
| `carnets/{id}` | `recettes/{id}` et leurs `photos/{id}` |
| `programmes/{id}` | `seances/{id}` : `nom`, `ordre`, `exercices` (séries, reps, poids, repos, vidéo, note) |
| `exercicesPerso/{id}` | exercices créés par les membres, visibles par tout le site dans le catalogue Muscu |
| `abonnements/{id}` | `lignes/{id}` : `nom`, `montant`, `frequence`, `prochaine`, `categorie`, `payePar`, `actif`, `note` |
| `foyers/{id}` | `donnees/config` : loyer, mode de répartition, personnes, charges |
| `vehicules/{id}` | `donnees/fiche` (km, pressions, capacités), `entretiens/{id}` (intervalles, dernière fois), `historique/{id}` (interventions) |
| `annuaire/{e-mail}` | `uid`, `name` : pour retrouver quelqu'un par son e-mail |

Chaque élément partagé a aussi un champ `activite` (`le`, `par`), mis à jour à chaque ajout ou
modification de son contenu ; `vus/{uid}` retient, pour chaque compte, ce qu'il a déjà vu.
C'est ce qui allume le petit rond à côté du logo d'une appli quand quelqu'un d'autre y a changé
quelque chose, jusqu'à ce qu'on ouvre l'élément concerné (sur n'importe quel appareil).
Pour une nouvelle appli partagée : ajoute sa collection dans `COLLECTIONS` (`commun/nouveautes.js`)
et appelle `affiche("budgets", id)` quand un élément est à l'écran (`selecteur.js` le fait déjà).

Le bouton « Partager » de chaque appli ouvre le même panneau (`commun/partage.js`) :
ajouter quelqu'un par e-mail, retirer un membre, renommer, supprimer ou quitter.
Pour être trouvé, il faut avoir vérifié son e-mail (bouton du compte, en haut à droite).

## Outils fournis par la coquille (`outils` dans `demarrer`)

- `outils.compte` : le compte connecté (`uid`, `email`, `nom`, `verifie`)
- `outils.visible()` : l'appli est-elle affichée ?
- `outils.titre("…")` : titre de l'onglet du navigateur
- `outils.aller("page")` / `outils.lien("page")` : pages internes de l'appli (`#/budget/page`)
- `outils.defiler(y)` : faire défiler, seulement si l'appli est affichée


## Rappels sur iPhone (cloudflare/)

L'iPhone n'accepte pas les évènements d'agenda fabriqués par la page : il lui faut une vraie
adresse internet qui renvoie le fichier. `cloudflare/rappel-worker.js` est ce petit service,
à coller dans un Worker Cloudflare (offre gratuite). Son adresse se met ensuite dans
`SERVICE_RAPPELS`, en haut de `commun/rappel.js`. Tant qu'elle est vide, le site utilise
le service public ics.agical.io.
