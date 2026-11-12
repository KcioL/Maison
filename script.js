import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. CONFIGURATION FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDmOiHUetoxS2Yzyou-rzehbPTIHmPrU6Q",
    authDomain: "dash-board-maison.firebaseapp.com",
    projectId: "dash-board-maison",
    storageBucket: "dash-board-maison.firebasestorage.app",
    messagingSenderId: "284538658677",
    appId: "1:284538658677:web:d044a7435d12467bbfbd3c"
};

let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    document.getElementById('list-loader').textContent = "Erreur de configuration Firebase.";
}

// ==========================================
// 2. GESTION DE LA LISTE DE COURSES
// ==========================================
const shoppingListEl = document.getElementById('shopping-list');
const shoppingInput = document.getElementById('shopping-input');
const addBtn = document.getElementById('add-item-btn');
const loader = document.getElementById('list-loader');

if (db) {
    const coursesRef = collection(db, "courses");
    const q = query(coursesRef, orderBy("createdAt", "asc"));

    onSnapshot(q, (snapshot) => {
        loader.style.display = 'none';
        shoppingListEl.innerHTML = ''; 
        
        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            const id = docSnap.id;
            
            const li = document.createElement('li');
            li.className = `shopping-item ${item.checked ? 'completed' : ''}`;
            li.innerHTML = `
                <input type="checkbox" ${item.checked ? 'checked' : ''} class="check-box">
                <span></span>
                <button class="delete-btn">×</button>
            `;
            // textContent : le texte est affiché tel quel, jamais interprété comme du HTML
            li.querySelector('span').textContent = item.text;

            li.querySelector('.check-box').addEventListener('change', async (e) => {
                await updateDoc(doc(db, "courses", id), { checked: e.target.checked });
            });

            li.querySelector('.delete-btn').addEventListener('click', async () => {
                await deleteDoc(doc(db, "courses", id));
            });

            shoppingListEl.appendChild(li);
        });
    }, (error) => {
        if (error.code === 'permission-denied') {
            loader.innerHTML = `<span style="color:#d93025; font-weight:bold;">Accès refusé : vérifie les règles Firestore (collection "courses").</span>`;
        } else {
             loader.textContent = "Erreur de chargement de la liste.";
        }
    });

    const addItemToDb = async () => {
        const text = shoppingInput.value.trim().slice(0, 200); // 200 caractères max (limite des règles)
        if (text !== '') {
            try {
                await addDoc(coursesRef, {
                    text: text,
                    checked: false,
                    createdAt: new Date()
                });
                shoppingInput.value = ''; 
            } catch (e) {
                if(e.code === 'permission-denied'){
                    alert("Impossible d'ajouter : vérifie les règles Firestore (collection \"courses\").");
                }
            }
        }
    };

    addBtn.addEventListener('click', addItemToDb);
    shoppingInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addItemToDb();
    });
}

// ==========================================
// 3. GESTION HEURE & DATE
// ==========================================
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    let dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('date').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
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
        document.getElementById('current-city-name').textContent = dataCurrent.name;
        document.getElementById('weather-temp').textContent = `${Math.round(dataCurrent.main.temp)}°C`;
        document.getElementById('weather-desc').textContent = dataCurrent.weather[0].description;
        
        // Affichage des vraies valeurs calculées
        document.getElementById('weather-minmax').textContent = `Min: ${Math.round(realMin)}° Max: ${Math.round(realMax)}°`;

    } catch (e) {
        console.error("Erreur météo actuelle:", e);
        document.getElementById('weather-desc').textContent = "Erreur de chargement";
    }
}

fetchCurrentWeather(currentCityQuery);
setInterval(() => fetchCurrentWeather(currentCityQuery), 3600000);
// ==========================================
// 5. GESTION DE LA MODALE MÉTÉO (Recherche libre & Détails)
// ==========================================
const weatherWidget = document.getElementById('weather-widget');
const weatherModal = document.getElementById('weather-modal');
const closeModalBtn = document.getElementById('close-modal');

const cityInput = document.getElementById('city-input');
const searchCityBtn = document.getElementById('search-city-btn');

const forecastContainer = document.getElementById('forecast-container');
const forecastLoader = document.getElementById('forecast-loader');

// Nouveaux éléments pour les détails par tranche de 3h
const hourlyContainer = document.getElementById('hourly-container');
const hourlyForecastList = document.getElementById('hourly-forecast-list');
const hourlyTitle = document.getElementById('hourly-title');

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
const spinBtn = document.getElementById('spin-btn');
const wheelResult = document.getElementById('wheel-result');

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
