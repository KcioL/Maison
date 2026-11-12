// ==========================================
// CATALOGUE D'EXERCICES (appli Muscu)
// Pour en ajouter un : une ligne dans la liste ci-dessous.
//   nom       nom affiché
//   groupe    un des GROUPES (id)
//   materiel  Barre, Haltères, Machine, Poulie, Poids du corps, Kettlebell, Élastique
//   reps      répétitions proposées par défaut (texte : "10", "8-12", "30 s"…)
// Sans lien vidéo, le bouton « Vidéo » ouvre une recherche YouTube sur l'exercice.
// ==========================================

export const GROUPES = [
    { id: "pecs",     nom: "Pectoraux",  couleur: "#e07a5f" },
    { id: "dos",      nom: "Dos",        couleur: "#5b8fb9" },
    { id: "epaules",  nom: "Épaules",    couleur: "#c08552" },
    { id: "biceps",   nom: "Biceps",     couleur: "#9b84b8" },
    { id: "triceps",  nom: "Triceps",    couleur: "#a5576b" },
    { id: "jambes",   nom: "Jambes",     couleur: "#6a9a76" },
    { id: "fessiers", nom: "Fessiers",   couleur: "#d4a017" },
    { id: "mollets",  nom: "Mollets",    couleur: "#3d8a8a" },
    { id: "abdos",    nom: "Abdos",      couleur: "#7b80c8" },
    { id: "cardio",   nom: "Cardio / complet", couleur: "#8d8780" }
];

const e = (nom, groupe, materiel, reps = "10") => ({ nom, groupe, materiel, reps });

export const CATALOGUE = [
    // Pectoraux
    e("Développé couché à la barre", "pecs", "Barre", "8"),
    e("Développé couché aux haltères", "pecs", "Haltères", "10"),
    e("Développé incliné à la barre", "pecs", "Barre", "8"),
    e("Développé incliné aux haltères", "pecs", "Haltères", "10"),
    e("Développé décliné", "pecs", "Barre", "10"),
    e("Écarté couché aux haltères", "pecs", "Haltères", "12"),
    e("Écarté à la poulie vis-à-vis", "pecs", "Poulie", "12"),
    e("Pec deck (butterfly)", "pecs", "Machine", "12"),
    e("Développé à la machine (chest press)", "pecs", "Machine", "10"),
    e("Pompes", "pecs", "Poids du corps", "15"),
    e("Pompes déclinées (pieds surélevés)", "pecs", "Poids du corps", "12"),
    e("Dips (buste penché)", "pecs", "Poids du corps", "10"),
    e("Pull-over aux haltères", "pecs", "Haltères", "12"),

    // Dos
    e("Tractions pronation", "dos", "Poids du corps", "8"),
    e("Tractions supination", "dos", "Poids du corps", "8"),
    e("Tirage vertical à la poulie", "dos", "Poulie", "10"),
    e("Tirage horizontal assis (poulie basse)", "dos", "Poulie", "10"),
    e("Rowing barre buste penché", "dos", "Barre", "8"),
    e("Rowing haltère un bras", "dos", "Haltères", "10"),
    e("Rowing T-bar", "dos", "Barre", "10"),
    e("Rowing à la machine", "dos", "Machine", "10"),
    e("Soulevé de terre", "dos", "Barre", "5"),
    e("Pull-over à la poulie haute", "dos", "Poulie", "12"),
    e("Extensions lombaires (banc à 45°)", "dos", "Poids du corps", "15"),
    e("Shrugs (haussements d'épaules)", "dos", "Haltères", "12"),

    // Épaules
    e("Développé militaire debout", "epaules", "Barre", "8"),
    e("Développé assis aux haltères", "epaules", "Haltères", "10"),
    e("Développé Arnold", "epaules", "Haltères", "10"),
    e("Élévations latérales", "epaules", "Haltères", "12"),
    e("Élévations latérales à la poulie", "epaules", "Poulie", "12"),
    e("Élévations frontales", "epaules", "Haltères", "12"),
    e("Oiseau (élévations buste penché)", "epaules", "Haltères", "12"),
    e("Face pull", "epaules", "Poulie", "15"),
    e("Rowing menton", "epaules", "Barre", "10"),
    e("Reverse pec deck", "epaules", "Machine", "12"),

    // Biceps
    e("Curl à la barre", "biceps", "Barre", "10"),
    e("Curl barre EZ", "biceps", "Barre", "10"),
    e("Curl alterné aux haltères", "biceps", "Haltères", "10"),
    e("Curl marteau", "biceps", "Haltères", "10"),
    e("Curl incliné aux haltères", "biceps", "Haltères", "10"),
    e("Curl pupitre (Larry Scott)", "biceps", "Barre", "10"),
    e("Curl concentré", "biceps", "Haltères", "12"),
    e("Curl à la poulie basse", "biceps", "Poulie", "12"),

    // Triceps
    e("Barre au front", "triceps", "Barre", "10"),
    e("Extensions à la poulie haute", "triceps", "Poulie", "12"),
    e("Extensions à la corde", "triceps", "Poulie", "12"),
    e("Extension nuque à l'haltère", "triceps", "Haltères", "12"),
    e("Kickback à l'haltère", "triceps", "Haltères", "12"),
    e("Dips entre deux bancs", "triceps", "Poids du corps", "12"),
    e("Dips aux barres parallèles", "triceps", "Poids du corps", "10"),
    e("Développé couché prise serrée", "triceps", "Barre", "8"),
    e("Pompes diamant", "triceps", "Poids du corps", "12"),

    // Jambes
    e("Squat à la barre", "jambes", "Barre", "8"),
    e("Front squat", "jambes", "Barre", "8"),
    e("Goblet squat", "jambes", "Haltères", "12"),
    e("Presse à cuisses", "jambes", "Machine", "10"),
    e("Hack squat", "jambes", "Machine", "10"),
    e("Fentes marchées", "jambes", "Haltères", "10"),
    e("Fentes bulgares", "jambes", "Haltères", "10"),
    e("Leg extension", "jambes", "Machine", "12"),
    e("Leg curl allongé", "jambes", "Machine", "12"),
    e("Leg curl assis", "jambes", "Machine", "12"),
    e("Soulevé de terre jambes tendues", "jambes", "Barre", "10"),
    e("Soulevé de terre roumain", "jambes", "Haltères", "10"),
    e("Squat au poids du corps", "jambes", "Poids du corps", "20"),
    e("Chaise contre le mur", "jambes", "Poids du corps", "45 s"),

    // Fessiers
    e("Hip thrust", "fessiers", "Barre", "10"),
    e("Pont fessier", "fessiers", "Poids du corps", "15"),
    e("Kickback à la poulie", "fessiers", "Poulie", "12"),
    e("Abduction à la machine", "fessiers", "Machine", "15"),
    e("Step-up sur banc", "fessiers", "Haltères", "10"),
    e("Squat sumo", "fessiers", "Haltères", "12"),
    e("Marche latérale à l'élastique", "fessiers", "Élastique", "15"),

    // Mollets
    e("Mollets debout à la machine", "mollets", "Machine", "15"),
    e("Mollets assis", "mollets", "Machine", "15"),
    e("Mollets à la presse", "mollets", "Machine", "15"),
    e("Mollets sur une marche", "mollets", "Poids du corps", "20"),

    // Abdos
    e("Crunch", "abdos", "Poids du corps", "20"),
    e("Gainage (planche)", "abdos", "Poids du corps", "45 s"),
    e("Gainage latéral", "abdos", "Poids du corps", "30 s"),
    e("Relevés de jambes suspendu", "abdos", "Poids du corps", "12"),
    e("Relevés de jambes au sol", "abdos", "Poids du corps", "15"),
    e("Crunch à la poulie haute", "abdos", "Poulie", "15"),
    e("Russian twist", "abdos", "Poids du corps", "20"),
    e("Roue abdominale", "abdos", "Poids du corps", "10"),
    e("Mountain climbers", "abdos", "Poids du corps", "30 s"),

    // Cardio / complet
    e("Burpees", "cardio", "Poids du corps", "12"),
    e("Kettlebell swing", "cardio", "Kettlebell", "15"),
    e("Corde à sauter", "cardio", "Poids du corps", "1 min"),
    e("Rameur", "cardio", "Machine", "5 min"),
    e("Vélo", "cardio", "Machine", "10 min"),
    e("Tapis de course", "cardio", "Machine", "10 min"),
    e("Jumping jacks", "cardio", "Poids du corps", "30 s"),
    e("Thrusters", "cardio", "Haltères", "12")
];

export const groupe = (id) => GROUPES.find(g => g.id === id) || GROUPES[GROUPES.length - 1];

// Lien vidéo : celui de l'exercice, sinon une recherche YouTube
export const lienVideo = (ex) => ex.video ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.nom + " exercice musculation technique")}`;
