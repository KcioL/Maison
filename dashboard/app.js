// ==========================================
// DASHBOARD : horloge, météo, roue du destin, listes de courses et de choses à faire
// Appli chargée dans la page principale (voir commun/coquille.js) :
// demarrer() est appelée une seule fois, avec la vue de l'appli.
// ==========================================
import {
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../commun/firebase.js";
import { compte, nomDe } from "../commun/compte.js";
import { ecouterMesPartages, creerPartage, ouvrirAcces } from "../commun/partage.js";
import { esc, toast, ouvrirFeuille } from "../commun/ui.js";

// Réglages de chaque sorte de liste
const SORTES = {
    courses: {
        nomDefaut: "Courses", placeholder: "Ajouter un article…",
        vide: "La liste est vide. Ajoute ce qu'il faut acheter.",
        aucune: "Tu n'as pas encore de liste de courses.", creer: "Créer ma liste de courses",
        cle: "liste-courses"
    },
    taches: {
        nomDefaut: "À faire", placeholder: "Ajouter une chose à faire…",
        vide: "Rien à faire pour l'instant 🎉",
        aucune: "Tu n'as pas encore de liste de choses à faire.", creer: "Créer ma liste à faire",
        cle: "liste-taches"
    }
};
const lireMemoire = k => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrireMemoire = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

// Un bloc de liste (courses ou à faire) : choix de la liste, partage, articles
function widgetListe(el) {
    const type = el.dataset.type, sorte = SORTES[type];
    const choix = el.querySelector(".liste-choix");
    const ul = el.querySelector(".liste-articles");
    const vide = el.querySelector(".liste-vide");
    const form = el.querySelector(".liste-ajout");
    const champ = form.querySelector("input");
    const zoneImport = el.querySelector(".liste-import");
    let listes = [], id = null, arreterArticles = null, articles = [], charge = false;

    const liste = () => listes.find(l => l.id === id);
    const articlesCol = () => collection(db, "listes", id, "articles");

    function majListes(nouvelles) {
        listes = nouvelles; charge = true;
        let cible = id;
        if (!cible || !listes.some(l => l.id === cible)) {
            const memo = lireMemoire(sorte.cle);
            cible = listes.some(l => l.id === memo) ? memo : (listes[0]?.id || null);
        }
        dessinerChoix();
        if (cible !== id) ouvrir(cible); else dessiner();
    }

    function dessinerChoix() {
        choix.innerHTML = listes.map(l => `<option value="${esc(l.id)}" ${l.id === id ? "selected" : ""}>${esc(l.name)}${l.ownerId !== compte.uid ? " (partagée)" : ""}</option>`).join("")
            + `<option value="__nouvelle">+ Nouvelle liste…</option>`;
        if (id) choix.value = id;
        el.querySelector(".liste-outils").hidden = !listes.length;
        form.hidden = !listes.length;
    }

    function ouvrir(nouvelId) {
        arreterArticles?.(); arreterArticles = null;
        id = nouvelId; articles = [];
        if (id) ecrireMemoire(sorte.cle, id);
        dessinerChoix();
        dessiner();
        if (!id) return;
        arreterArticles = onSnapshot(query(articlesCol(), orderBy("creeLe", "asc")), snap => {
            articles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            dessiner();
        }, err => console.error("articles", err));
        if (type === "courses") proposerImport();
    }

    function dessiner() {
        if (!charge) { ul.innerHTML = ""; vide.hidden = true; return; }
        if (!listes.length) {
            ul.innerHTML = "";
            vide.hidden = false;
            vide.innerHTML = `<p>${esc(sorte.aucune)}</p><button type="button" class="liste-bouton principal" data-action="creer">${esc(sorte.creer)}</button>`;
            return;
        }
        // les articles cochés passent à la fin
        const tries = [...articles].sort((a, b) => (a.coche === b.coche ? 0 : a.coche ? 1 : -1));
        ul.innerHTML = tries.map(a => `
            <li class="liste-article ${a.coche ? "coche" : ""}" data-id="${esc(a.id)}">
                <label class="liste-label"><input type="checkbox" ${a.coche ? "checked" : ""}><span>${esc(a.texte)}</span></label>
                <button type="button" class="liste-suppr" aria-label="Supprimer">×</button>
            </li>`).join("");
        vide.innerHTML = (articles.length ? "" : `<p>${esc(sorte.vide)}</p>`)
            + (articles.some(a => a.coche) ? `<button type="button" class="liste-bouton petit" data-action="vider-coches">Retirer les éléments cochés</button>` : "");
        vide.hidden = !vide.innerHTML;
    }

    async function nouvelleListe() {
        const f = ouvrirFeuille({ titre: type === "courses" ? "Nouvelle liste de courses" : "Nouvelle liste à faire" });
        f.corps.innerHTML = `<form class="ligne-form" autocomplete="off">
            <label class="champ"><span>Nom</span><input name="nom" maxlength="60" required placeholder="Ex. Courses avec mes parents"></label>
            <button class="bouton principal" type="submit">Créer</button></form>
            <p class="muet petit">Ensuite, « Partager » pour choisir qui peut la voir et la modifier.</p>`;
        const input = f.corps.querySelector("input"); input.focus();
        f.corps.querySelector("form").addEventListener("submit", async e => {
            e.preventDefault();
            const nom = input.value.trim(); if (!nom) return;
            f.fermer();
            await creer(nom);
        });
    }
    async function creer(nom) {
        try {
            const nouvel = await creerPartage("listes", { name: nom, type });
            ecrireMemoire(sorte.cle, nouvel);
            id = null;   // la liste arrive par l'écoute, puis s'ouvre
            toast(`Liste « ${nom} » créée.`);
        } catch (e) { console.error(e); toast("Création impossible. Réessaie."); }
    }

    // ---- ancienne liste de courses (avant les comptes) : import une seule fois
    let importVerifie = false;
    async function proposerImport() {
        if (importVerifie) return; importVerifie = true;
        try {
            const anciens = await getDocs(collection(db, "courses"));
            if (anciens.empty) return;
            const l = liste(); if (!l || l.ownerId !== compte.uid) { importVerifie = false; return; }
            zoneImport.hidden = false;
            zoneImport.innerHTML = `<span>Ton ancienne liste de courses contient <b>${anciens.size}</b> article${anciens.size > 1 ? "s" : ""}.</span>
                <button type="button" class="liste-bouton principal petit" data-action="importer">Les mettre dans « ${esc(l.name)} »</button>`;
        } catch { /* ancienne collection inaccessible : rien à proposer */ }
    }
    async function importer(bouton) {
        bouton.disabled = true; bouton.textContent = "Import…";
        try {
            const anciens = await getDocs(collection(db, "courses"));
            for (const d of anciens.docs) {
                const a = d.data();
                const quand = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
                await addDoc(articlesCol(), { texte: String(a.text || "").slice(0, 200) || "Article", coche: !!a.checked, creeLe: quand, creePar: compte.uid });
                await deleteDoc(d.ref);
            }
            zoneImport.hidden = true;
            toast("Ancienne liste importée ✔");
        } catch (e) {
            console.error(e); bouton.disabled = false; bouton.textContent = "Réessayer l'import";
            toast("L'import n'a pas pu aller jusqu'au bout. Réessaie.");
        }
    }

    // ---- actions
    choix.addEventListener("change", () => {
        if (choix.value === "__nouvelle") { choix.value = id || ""; nouvelleListe(); return; }
        ouvrir(choix.value);
    });
    form.addEventListener("submit", async e => {
        e.preventDefault();
        const texte = champ.value.trim().slice(0, 200);
        if (!texte || !id) return;
        champ.value = "";
        try { await addDoc(articlesCol(), { texte, coche: false, creeLe: Date.now(), creePar: compte.uid }); }
        catch (err) { console.error(err); toast("Ajout impossible. Réessaie."); champ.value = texte; }
    });
    ul.addEventListener("change", e => {
        const li = e.target.closest(".liste-article"); if (!li) return;
        updateDoc(doc(articlesCol(), li.dataset.id), { coche: e.target.checked }).catch(() => toast("Modification impossible."));
    });
    el.addEventListener("click", async e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.classList.contains("liste-suppr")) {
            const li = b.closest(".liste-article");
            deleteDoc(doc(articlesCol(), li.dataset.id)).catch(() => toast("Suppression impossible."));
        } else if (b.dataset.action === "creer") creer(sorte.nomDefaut);
        else if (b.dataset.action === "partager" && id) {
            ouvrirAcces({
                collection: "listes", id, quoi: "cette liste",
                supprimerContenu: async (lid) => {
                    const snap = await getDocs(collection(db, "listes", lid, "articles"));
                    for (let i = 0; i < snap.docs.length; i += 400) {
                        const lot = writeBatch(db);
                        snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
                        await lot.commit();
                    }
                }
            });
        } else if (b.dataset.action === "vider-coches") {
            const lot = writeBatch(db);
            articles.filter(a => a.coche).forEach(a => lot.delete(doc(articlesCol(), a.id)));
            lot.commit().catch(() => toast("Suppression impossible."));
        } else if (b.dataset.action === "importer") importer(b);
    });
    champ.placeholder = sorte.placeholder;

    return {
        type,
        majListes,
        erreur: () => { vide.hidden = false; vide.innerHTML = `<p>Les listes n'ont pas pu se charger. Vérifie ta connexion puis recharge la page.</p>`; }
    };
}

let fermerMeteo = () => {};

export async function demarrer(racine) {
    // éléments cherchés uniquement dans la vue du dashboard
    const $id = (id) => racine.querySelector("#" + id);

    // ==========================================
    // 1. LISTES PARTAGÉES (courses et choses à faire)
    // ==========================================
    // Chaque liste est un document « listes/{id} » partagé (voir commun/partage.js),
    // avec un champ type ("courses" ou "taches") et ses articles dans « listes/{id}/articles ».
    const widgets = [...racine.querySelectorAll(".liste-widget")].map(el => widgetListe(el));
    ecouterMesPartages("listes", (listes) => {
        widgets.forEach(w => w.majListes(listes.filter(l => l.type === w.type)));
    }, () => widgets.forEach(w => w.erreur()));

    // ==========================================
    // 2. GESTION HEURE & DATE
    // ==========================================
    function updateClock() {
        const now = new Date();
        $id('clock').textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        let dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        $id('date').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    setInterval(updateClock, 1000); 
    updateClock(); 

    // ==========================================
    // 4. GESTION MÉTÉO (OpenWeatherMap)
    // ==========================================
    const OWM_API_KEY = '47c727b5e192b4fc5c837bc25007c07e';
    let currentCityQuery = 'Pau'; 

    async function fetchCurrentWeather(cityQuery) {
        const urlCurrent = `https://api.openweathermap.org/data/2.5/weather?q=${cityQuery}&appid=${OWM_API_KEY}&units=metric&lang=fr`;
        const urlForecast = `https://api.openweathermap.org/data/2.5/forecast?q=${cityQuery}&appid=${OWM_API_KEY}&units=metric&lang=fr`;

        try {
            // 1. Récupérer la météo actuelle (pour l'heure, la temp actuelle et l'icône)
            const resCurrent = await fetch(urlCurrent);
            if(!resCurrent.ok) throw new Error("Ville introuvable");
            const dataCurrent = await resCurrent.json();
        
            // 2. Récupérer les prévisions pour calculer le VRAI Min/Max de la journée
            const resForecast = await fetch(urlForecast);
            const dataForecast = await resForecast.json();
        
            // Créer la date d'aujourd'hui au format "YYYY-MM-DD" (formaté comme l'API)
            const today = new Date();
            const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
            // Filtrer pour ne garder que les relevés d'aujourd'hui
            const todayEntries = dataForecast.list.filter(item => item.dt_txt.startsWith(todayString));
        
            // Valeur de secours par défaut
            let realMin = dataCurrent.main.temp_min;
            let realMax = dataCurrent.main.temp_max;
        
            // Si on trouve des données pour aujourd'hui, on calcule le vrai min et max
            if (todayEntries.length > 0) {
                realMin = Math.min(...todayEntries.map(item => item.main.temp_min));
                realMax = Math.max(...todayEntries.map(item => item.main.temp_max));
            }
        
            // 3. Mettre à jour l'affichage sur le Dashboard
            $id('current-city-name').textContent = dataCurrent.name;
            $id('weather-temp').textContent = `${Math.round(dataCurrent.main.temp)}°C`;
            $id('weather-desc').textContent = dataCurrent.weather[0].description;
        
            // Affichage des vraies valeurs calculées
            $id('weather-minmax').textContent = `Min: ${Math.round(realMin)}° Max: ${Math.round(realMax)}°`;

        } catch (e) {
            console.error("Erreur météo actuelle:", e);
            $id('weather-desc').textContent = "Erreur de chargement";
        }
    }

    fetchCurrentWeather(currentCityQuery);
    setInterval(() => fetchCurrentWeather(currentCityQuery), 3600000);
    // ==========================================
    // 5. GESTION DE LA MODALE MÉTÉO (Recherche libre & Détails)
    // ==========================================
    const weatherWidget = $id('weather-widget');
    const weatherModal = $id('weather-modal');
    const closeModalBtn = $id('close-modal');

    const cityInput = $id('city-input');
    const searchCityBtn = $id('search-city-btn');

    const forecastContainer = $id('forecast-container');
    const forecastLoader = $id('forecast-loader');

    // Nouveaux éléments pour les détails par tranche de 3h
    const hourlyContainer = $id('hourly-container');
    const hourlyForecastList = $id('hourly-forecast-list');
    const hourlyTitle = $id('hourly-title');

    let fullForecastData = []; // Va stocker toutes les données de l'API

    weatherWidget.addEventListener('click', () => {
        weatherModal.style.display = 'flex';
        cityInput.value = currentCityQuery;
        hourlyContainer.style.display = 'none'; // On cache les détails à l'ouverture
        fetchForecast(currentCityQuery);
    });

    closeModalBtn.addEventListener('click', () => { weatherModal.style.display = 'none'; });
    window.addEventListener('click', (e) => {
        if (e.target === weatherModal) weatherModal.style.display = 'none';
    });

    function handleCitySearch() {
        const selectedCity = cityInput.value.trim();
        if (selectedCity !== '') {
            fetchForecast(selectedCity);
            currentCityQuery = selectedCity;
            fetchCurrentWeather(selectedCity);
            hourlyContainer.style.display = 'none'; // Cacher les détails de l'ancienne ville
        }
    }

    searchCityBtn.addEventListener('click', handleCitySearch);
    cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCitySearch();
    });

    async function fetchForecast(cityQuery) {
        forecastLoader.style.display = 'block';
        forecastContainer.innerHTML = '';
    
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${cityQuery}&appid=${OWM_API_KEY}&units=metric&lang=fr`;
    
        try {
            const res = await fetch(url);
            if(!res.ok) throw new Error("Erreur prévisions");
            const data = await res.json();
        
            // Sauvegarde des 40 prévisions renvoyées par l'API
            fullForecastData = data.list; 
        
            // --- NOUVELLE LOGIQUE : Chercher la température MAX par jour ---
            const dailyMax = {};
        
            fullForecastData.forEach(item => {
                // On isole la date (ex: "2026-06-22") sans l'heure
                const dateString = item.dt_txt.split(' ')[0]; 
            
                // Si on n'a pas encore enregistré ce jour, OU si la température de cet item est plus haute que l'ancienne
                if (!dailyMax[dateString] || item.main.temp > dailyMax[dateString].main.temp) {
                    dailyMax[dateString] = item;
                }
            });
        
            // On convertit notre dictionnaire en tableau et on prend les 5 premiers jours
            const dailyForecasts = Object.values(dailyMax).slice(0, 5);
            // ---------------------------------------------------------------
        
            forecastLoader.style.display = 'none';
        
            dailyForecasts.forEach(day => {
                const dateObj = new Date(day.dt * 1000);
                const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
                const dayNum = dateObj.getDate();
                const dateDisplay = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum}`;
            
                const dateString = day.dt_txt.split(' ')[0]; 
            
                const iconCode = day.weather[0].icon;
                const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
            
                const card = document.createElement('div');
                card.className = 'forecast-day';
                card.innerHTML = `
                    <div class="forecast-date">${dateDisplay}</div>
                    <img class="forecast-icon" src="${iconUrl}" alt="icone météo">
                    <div class="forecast-temp">${Math.round(day.main.temp)}°C</div>
                    <div class="forecast-desc">${day.weather[0].description}</div>
                `;
            
                // Événement Clic : Affiche toujours les détails horaires pour ce jour
                card.addEventListener('click', () => showHourlyForecast(dateString, dateDisplay));
            
                forecastContainer.appendChild(card);
            });
        } catch (e) {
            console.error("Erreur prévisions:", e);
            forecastLoader.textContent = "Ville introuvable. Vérifiez l'orthographe !";
        }
    }

    // Fonction pour afficher les prévisions toutes les 3 heures d'une journée précise
    function showHourlyForecast(targetDateString, dateDisplay) {
        hourlyContainer.style.display = 'block';
        hourlyTitle.textContent = `Détails pour le ${dateDisplay}`;
        hourlyForecastList.innerHTML = '';
    
        // On filtre toutes nos données pour ne garder que celles du jour cliqué
        const dayData = fullForecastData.filter(item => item.dt_txt.startsWith(targetDateString));
    
        dayData.forEach(item => {
            const timeString = item.dt_txt.split(' ')[1].substring(0, 5); // "15:00"
            const iconCode = item.weather[0].icon;
            const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        
            const hourlyCard = document.createElement('div');
            hourlyCard.className = 'hourly-item';
            hourlyCard.innerHTML = `
                <div class="hourly-time">${timeString}</div>
                <img class="hourly-icon" src="${iconUrl}" alt="icone">
                <div class="hourly-temp">${Math.round(item.main.temp)}°C</div>
            `;
            hourlyForecastList.appendChild(hourlyCard);
        });
    }
    // ==========================================
    // 6. GESTION DE LA ROUE DU DESTIN
    // ==========================================
    const spinBtn = $id('spin-btn');
    const wheelResult = $id('wheel-result');

    // 📝 La liste des idées d'activités 
    const wheelOptions = [
        "Soirée canapé & Animés 🍿",
        "resto 🍽️",
        "Balade moto 🏍️",
        "Jeu coop 🎮",
        "On commande des pizzas ! 🍕",
        "Bowling 🎳",
        "Ciné ou film à la maison 🎬",
        "Soirée jeux de société 🎲",
        "rando 👟"
    ];

    let isSpinning = false;

    spinBtn.addEventListener('click', () => {
        // Si la roue tourne déjà, on empêche de recliquer
        if (isSpinning) return;
    
        isSpinning = true;
        spinBtn.textContent = "Ça tourne... ⏳";
        wheelResult.classList.add('spinning');
    
        let spins = 0;
        const maxSpins = 20; // Nombre de fois que le texte va changer avant de s'arrêter
    
        // Intervalle pour créer l'effet "machine à sous"
        const spinInterval = setInterval(() => {
            // Choix aléatoire pour l'animation
            const randomTempIndex = Math.floor(Math.random() * wheelOptions.length);
            wheelResult.textContent = wheelOptions[randomTempIndex];
            spins++;
        
            // Quand on atteint le max, on arrête la roue sur un choix final
            if (spins >= maxSpins) {
                clearInterval(spinInterval);
            
                // Le vrai choix final
                const finalIndex = Math.floor(Math.random() * wheelOptions.length);
            
                wheelResult.classList.remove('spinning');
                wheelResult.textContent = wheelOptions[finalIndex];
            
                spinBtn.textContent = "Relancer !";
                isSpinning = false;
            }
        }, 100); // Vitesse de défilement (100 millisecondes)
    });

    fermerMeteo = () => { weatherModal.style.display = 'none'; };
}

// en quittant le dashboard, on referme la fenêtre météo
export function masquer() { fermerMeteo(); }
