(() => {  
  // ----------------- Configuration & state -----------------  
  const AUTOCOMPLETE_LIMIT = 5;  
  
  const selectedUnits = {  
    temperature: 'celsius', // auto-update ON  
    wind: 'kmh',  
    precipitation: 'mm'  
  };  
  
  let lastWeatherData = null;  
  let lastLocation = null; // { displayName, lat, lon }  
  
  // DOM refs  
  const unitsBtn = document.getElementById('unitsBtn');  
  const unitsMenu = document.getElementById('unitsMenu');  
  const unitItems = Array.from(unitsMenu.querySelectorAll('.item'));  
  
  const citySearch = document.getElementById('citySearch');  
  const cityList = document.getElementById('cityList'); // ul.city-dropdown  
  const searchBtn = document.getElementById('search-btn');  
  
  const currentCityEl = document.querySelector('.city');  
  const dateEl = document.querySelector('.date');  
  const currentIconEl = document.querySelector('.current-weather img'); // first img inside current-weather  
  const currentTempEl = document.querySelector('.temperature .temp');  
  
  // extra-info cards (order: feels, humidity, wind, precipitation)  
  const extraInfoCards = Array.from(document.querySelectorAll('.extra-info .info-card'));  
  const feelsLikeEl = extraInfoCards[0] ? extraInfoCards[0].querySelector('h4') : null;  
  const humidityEl   = extraInfoCards[1] ? extraInfoCards[1].querySelector('h4') : null;  
  const windEl       = extraInfoCards[2] ? extraInfoCards[2].querySelector('h4') : null;  
  const precipitationEl = extraInfoCards[3] ? extraInfoCards[3].querySelector('h4') : null;  
  
  const dailyContainer = document.querySelector('.daily-forecast'); // ul  
  const hourlyContainer = document.querySelector('.hourly-list');   // ul  
  
  const dayBtn = document.getElementById('dayBtn');  
  const dayMenu = document.getElementById('dayMenu');  
  
  // ----------------- Utility conversions & helpers -----------------  
  const cToF = c => (c * 9/5) + 32;  
  const fToC = f => (f - 32) * 5/9;  
  const msToKmh = ms => ms * 3.6;          // m/s -> km/h  
  const kmhToMph = kmh => kmh * 0.621371;  
  const mmToInches = mm => mm / 25.4;  
  
  const round = v => Math.round(v);  
  const formatTemp = v => `${round(v)}°`;  
  
  // map Open-Meteo weather codes to your local icon filenames 
  
  function weatherCodeToIcon(code) {  
    // codes reference: https ://open-meteo.com/en/docs (common mapping)  
    if (code === 0) return 'icon-sunny.webp';  
    if (code === 1 || code === 2) return 'icon-partly-cloudy.webp';  
    if (code === 3) return 'icon-overcast.webp';  
    if ([45, 48].includes(code)) return 'icon-fog.webp';  
    if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].some(x => x === code)) return 'icon-rain.webp';  
    if ([66, 67, 71, 73, 75, 85, 86].some(x => x === code)) return 'icon-snow.webp';  
    if ([95, 96, 99].some(x => x === code)) return 'icon-storm.webp';  
    // fallback  
    return 'icon-sunny.webp';  
  }  
  
  // find index of current hour in hourly.time array; returns 0 fallback  
  function findClosestHourIndex(timeArray, targetDate = new Date()) {  
    if (!Array.isArray(timeArray) || timeArray.length === 0) return 0;  
    const targetPrefix = targetDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH  
    for (let i = 0; i < timeArray.length; i++) {  
      if (timeArray[i].slice(0, 13) === targetPrefix) return i;  
    }  
    return 0;  
  }  
  
  // ----------------- Unit UI helpers -----------------  
  // Assign data-type to items (based on section titles)  
  (function assignUnitTypesFromSections() {  
    const sections = Array.from(unitsMenu.querySelectorAll('.dropdown-section'));  
    sections.forEach(section => {  
      const titleEl = section.querySelector('.section-title');  
      if (!titleEl) return;  
      const title = titleEl.textContent.trim().toLowerCase();  
      let type = null;  
      if (title.includes('temp')) type = 'temperature';  
      else if (title.includes('wind')) type = 'wind';  
      else if (title.includes('precip')) type = 'precipitation';  
      if (!type) return;  
      section.querySelectorAll('.item').forEach(it => it.dataset.type = type);  
    });  
  })();  
  
  function refreshUnitVisuals() {  
    unitItems.forEach(item => {  
      const type = item.dataset.type;  
      const val  = item.dataset.unit;  
      if (!type || !val) return;  
      item.classList.toggle('selected', selectedUnits[type] === val);  
    });  
  }  
  
  // ----------------- Units dropdown behavior -----------------  
  unitsBtn.addEventListener('click', (e) => {  
    const open = unitsMenu.classList.toggle('open');  
    unitsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');  
    unitsMenu.setAttribute('aria-hidden', open ? 'false' : 'true');  
  });  
  
  // clicking a .item updates selectedUnits (does NOT close menu)  
  unitItems.forEach(item => {  
    // normalize: ensure data-unit exists (HTML has data-unit already)  
    if (!item.dataset.unit) {  
      const attr = item.getAttribute('data-unit');  
      if (attr) item.dataset.unit = attr;  
    }  
  
    item.addEventListener('click', () => {  
      const type = item.dataset.type;  
      const value = item.dataset.unit;  
      if (!type || !value) return;  
      selectedUnits[type] = value;  
      // visual for that category  
      document.querySelectorAll(`.item[data-type="${type}"]`).forEach(el => el.classList.remove('selected'));  
      item.classList.add('selected');  
  
      // rerender if we have data  
      if (lastWeatherData && lastLocation) renderAllFromCache();  
    });  
  });  
  
  // ----------------- Global click handler to close open menus (except when inside) -----------------  
  document.addEventListener('click', (e) => {  
    if (!unitsBtn.contains(e.target) && !unitsMenu.contains(e.target)) {  
      unitsMenu.classList.remove('open');  
      unitsBtn.setAttribute('aria-expanded', 'false');  
      unitsMenu.setAttribute('aria-hidden', 'true');  
    }  
    if (!dayBtn.contains(e.target) && !dayMenu.contains(e.target)) {  
      dayMenu.classList.remove('open');  
      dayBtn.setAttribute('aria-expanded', 'false');  
      dayMenu.setAttribute('aria-hidden', 'true');  
    }  
    // hide city suggestions if clicked outside the search wrapper  
    const cityWrapper = document.querySelector('.city-dropdown-container');  
    if (cityWrapper && !cityWrapper.contains(e.target)) {  
      cityList.innerHTML = '';  
      cityList.style.display = 'none';  
      cityList.setAttribute('aria-hidden', 'true');  
    }  
  });  
  
  // ----------------- Geocoding (autocomplete) -----------------  
  let suggestionTimer = null;  
  citySearch.addEventListener('input', () => {  
    const q = citySearch.value.trim();  
    clearTimeout(suggestionTimer);  
    if (q.length < 2) {  
      cityList.innerHTML = '';  
      cityList.style.display = 'none';  
      cityList.setAttribute('aria-hidden', 'true');  
      return;  
    }  
    suggestionTimer = setTimeout(() => fetchCitySuggestions(q), 180);  
  });  
  
  async function fetchCitySuggestions(query) {  
    try {  
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${AUTOCOMPLETE_LIMIT}&language=en`;  
      const res = await fetch(url);  
      const data = await res.json();  
      cityList.innerHTML = '';  
      if (!data.results || data.results.length === 0) {  
        cityList.style.display = 'none';  
        cityList.setAttribute('aria-hidden', 'true');  
        return;  
      }  
  
      data.results.forEach(loc => {  
        const li = document.createElement('li');  
        li.className = 'city-option';  
        li.tabIndex = 0;  
        const admin = loc.admin1 ? `, ${loc.admin1}` : '';  
        const country = loc.country ? `, ${loc.country}` : '';  
        li.textContent = `${loc.name}${admin}${country}`;  
        li.dataset.lat = loc.latitude;  
        li.dataset.lon = loc.longitude;  
        li.addEventListener('click', () => {  
          citySearch.value = li.textContent;  
          cityList.innerHTML = '';  
          cityList.style.display = 'none';  
          cityList.setAttribute('aria-hidden', 'true');  
          const lat = parseFloat(li.dataset.lat);  
          const lon = parseFloat(li.dataset.lon);  
          lastLocation = { displayName: li.textContent, lat, lon };  
          fetchAndRenderWeather(lat, lon);  
        });  
        cityList.appendChild(li);  
      });  
  
      cityList.style.display = 'block';  
      cityList.setAttribute('aria-hidden', 'false');  
    } catch (err) {  
      console.error('geocoding error', err);  
      cityList.innerHTML = '';  
      cityList.style.display = 'none';  
      cityList.setAttribute('aria-hidden', 'true');  
    }  
  }  
  
  // keyboard support: Enter to select focused suggestion  
  cityList.addEventListener('keydown', (e) => {  
    if (e.key === 'Enter') {  
      const t = e.target;  
      if (t && t.classList.contains('city-option')) t.click();  
    }  
  });  
  
  // Search button fallback: geocode query and take first result  
  searchBtn.addEventListener('click', async (ev) => {  
    ev.preventDefault();  
    const q = citySearch.value.trim();  
    if (!q) return;  
    try {  
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`;  
      const res = await fetch(url);  
      const data = await res.json();  
      if (data.results && data.results.length > 0) {  
        const loc = data.results[0];  
        lastLocation = { displayName: `${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}${loc.country ? ', ' + loc.country : ''}`, lat: loc.latitude, lon: loc.longitude };  
        citySearch.value = lastLocation.displayName;  
        fetchAndRenderWeather(loc.latitude, loc.longitude);  
      } else {  
        alert('Location not found');  
      }  
    } catch (err) {  
      console.error('search error', err);  
      alert('Search failed');  
    }  
  });  
  
  // ----------------- Fetch weather from Open-Meteo -----------------  
  async function fetchAndRenderWeather(lat, lon) {  
    try {  
      // Important: no trailing spaces in URL  
      const url =  
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +  
        `&current_weather=true` +  
        `&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,precipitation,weathercode` +  
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum` +  
        `&timezone=auto`;  
  
      const res = await fetch(url);  
      if (!res.ok) throw new Error(`Forecast API error ${res.status}`);  
      const data = await res.json();  
      lastWeatherData = data;  
      if (!lastLocation) lastLocation = { displayName: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon };  
      renderAllFromCache();  
    } catch (err) {  
      console.error('weather fetch error', err);  
      alert('Failed to fetch weather. See console for details.');  
    }  
  }  
  
  // ----------------- Render UI from cached weather data -----------------  
  function renderAllFromCache() {  
    if (!lastWeatherData) return;  
    const data = lastWeatherData;  
  
    // City label  
    currentCityEl.textContent = (lastLocation && lastLocation.displayName) ? lastLocation.displayName : `${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;  
  
    // Date  
    const now = new Date();  
    dateEl.textContent = now.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });  
  
    // Current weather  
    const cw = data.current_weather || null;  
    if (cw) {  
      const tempC = cw.temperature;  
      const tempDisp = selectedUnits.temperature === 'celsius' ? tempC : cToF(tempC);  
      currentTempEl.textContent = formatTemp(tempDisp);  
  
      const iconName = weatherCodeToIcon(cw.weathercode);  
      currentIconEl.src = `images/${iconName}`;  
      currentIconEl.alt = 'weather icon';  
  
      // Open-Meteo current_weather.windspeed is m/s -> convert to km/h  
      const windMs = cw.windspeed ?? 0;  
      const windKmh = msToKmh(windMs);  
      const windDisplayVal = selectedUnits.wind === 'kmh' ? windKmh : kmhToMph(windKmh);  
      windEl && (windEl.textContent = `${round(windDisplayVal)} ${selectedUnits.wind}`);  
    } else {  
      currentTempEl.textContent = '—';  
    }  
  
    // Humidity (hourly relativehumidity_2m at nearest hour)  
    let humVal = null;  
    if (data.hourly && Array.isArray(data.hourly.relativehumidity_2m)) {  
      const idx = findClosestHourIndex(data.hourly.time, new Date());  
      humVal = (idx !== -1) ? data.hourly.relativehumidity_2m[idx] : null;  
    }  
    humidityEl && (humidityEl.textContent = humVal !== null ? `${round(humVal)}%` : '—');  
  
    // Precipitation (hourly current hour preferred, else today's daily sum[0])  
    let precip = null;  
    if (data.hourly && Array.isArray(data.hourly.precipitation)) {  
      const idx = findClosestHourIndex(data.hourly.time, new Date());  
      precip = (idx !== -1) ? data.hourly.precipitation[idx] : null;  
    }  
    if ((precip === null || precip === undefined) && data.daily && Array.isArray(data.daily.precipitation_sum)) {  
      precip = data.daily.precipitation_sum[0] ?? 0;  
    }  
    if (precip === null || precip === undefined) {  
      precipitationEl && (precipitationEl.textContent = '—');  
    } else {  
      if (selectedUnits.precipitation === 'mm') precipitationEl && (precipitationEl.textContent = `${round(precip)} mm`);  
      else precipitationEl && (precipitationEl.textContent = `${(mmToInches(precip)).toFixed(2)} in`);  
    }  
  
    // Feels like (approx using current temp)  
    if (cw) {  
      const feelsC = cw.temperature;  
      const feelsDisp = selectedUnits.temperature === 'celsius' ? feelsC : cToF(feelsC);  
      feelsLikeEl && (feelsLikeEl.textContent = formatTemp(feelsDisp));  
    } else {  
      feelsLikeEl && (feelsLikeEl.textContent = '—');  
    }  
  
    // Render forecasts  
    renderDaily(data);  
    renderHourly(data);  
  
    // Refresh unit visuals  
    refreshUnitVisuals();  
  }  
  
  // ----------------- Render daily -----------------  
  function renderDaily(data) {  
    dailyContainer.innerHTML = '';  
    if (!data.daily) return;  
    const times = data.daily.time || [];  
    const max = data.daily.temperature_2m_max || [];  
    const min = data.daily.temperature_2m_min || [];  
    const codes = data.daily.weathercode || [];  
  
    for (let i = 0; i < times.length; i++) {  
      const li = document.createElement('li');  
      li.className = 'daily-item';  
  
      const d = new Date(times[i]);  
      const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });  
  
      const pDay = document.createElement('p');  
      pDay.className = 'day';  
      pDay.textContent = dayName;  
  
      const img = document.createElement('img');  
      img.src = `images/${weatherCodeToIcon(codes[i] ?? 0)}`;  
      img.alt = 'icon';  
  
      const degree = document.createElement('div');  
      degree.className = 'degree-bottom';  
  
      const maxVal = (selectedUnits.temperature === 'celsius') ? max[i] : cToF(max[i]);  
      const minVal = (selectedUnits.temperature === 'celsius') ? min[i] : cToF(min[i]);  
  
      const sMax = document.createElement('span'); sMax.textContent = `${round(maxVal)}°`;  
      const sMin = document.createElement('span'); sMin.textContent = `${round(minVal)}°`;  
  
      degree.appendChild(sMax);  
      degree.appendChild(sMin);  
  
      li.appendChild(pDay);  
      li.appendChild(img);  
      li.appendChild(degree);  
      dailyContainer.appendChild(li);  
    }  
  }  
  
  // ----------------- Render hourly & day picker -----------------  
  function renderHourly(data) {  
    hourlyContainer.innerHTML = '';  
    dayMenu.innerHTML = '';  
    if (!data.hourly) return;  
  
    const times = data.hourly.time || [];  
    const temps = data.hourly.temperature_2m || [];  
    const winds = data.hourly.windspeed_10m || [];  
    const precs = data.hourly.precipitation || [];  
    const codes = data.hourly.weathercode || [];  
  
    // Group indices by date (YYYY-MM-DD)  
    const groups = {};  
    for (let i = 0; i < times.length; i++) {  
      const dateKey = times[i].slice(0, 15);  
      if (!groups[dateKey]) groups[dateKey] = { indices: [], label: (new Date(times[i])).toLocaleDateString(undefined, { weekday: 'long' }) };  
      groups[dateKey].indices.push(i);  
    }  
  
    const keys = Object.keys(groups);  
    keys.forEach((k, idx) => {  
      const btn = document.createElement('button');  
      btn.type = 'button';  
      btn.className = 'day-option';  
      btn.textContent = groups[k].label;  
      btn.addEventListener('click', () => {  
        populateHourly(groups[k].indices, times, temps, winds, precs, codes);  
        dayMenu.classList.remove('open');  
        dayBtn.setAttribute('aria-expanded', 'false');  
        dayMenu.setAttribute('aria-hidden', 'true');  
        dayBtn.textContent = `${groups[k].label} ▾`;  
      });  
      dayMenu.appendChild(btn);  
  
      // auto select first  
      if (idx === 0) {  
        populateHourly(groups[k].indices, times, temps, winds, precs, codes);  
        dayBtn.textContent = `${groups[k].label} ▾`;  
      }  
    });  
  
    // day button toggle  
    dayBtn.onclick = () => {  
      const open = dayMenu.classList.toggle('open');  
      dayBtn.setAttribute('aria-expanded', open ? 'true' : 'false');  
      dayMenu.setAttribute('aria-hidden', open ? 'false' : 'true');  
    };  
  }  
  
  function populateHourly(indices, times, temps, winds, precs, codes) {  
    hourlyContainer.innerHTML = '';  
  
    // Optionally show many or all hours (we're dynamic per your chosen 'B')  
    indices.forEach(i => {  
      const li = document.createElement('li');  
      li.className = 'hourly-item';  
  
      const left = document.createElement('div');  
      left.className = 'time-icon';  
      const img = document.createElement('img');  
      img.src = `images/${weatherCodeToIcon(codes[i] ?? 0)}`;  
      img.alt = 'icon';  
      const spanTime = document.createElement('span');  
      const dt = new Date(times[i]);  
      spanTime.textContent = dt.toLocaleTimeString([], { hour: 'numeric', hour12: true });  
  
      left.appendChild(img);  
      left.appendChild(spanTime);  
  
      const right = document.createElement('span');  
      const tempVal = (selectedUnits.temperature === 'celsius') ? temps[i] : cToF(temps[i]);  
      right.textContent = `${round(tempVal)}°`;  
  
      li.appendChild(left);  
      li.appendChild(right);  
      hourlyContainer.appendChild(li);  
    });  
  }  
  
  // ----------------- Initialization -----------------  
  refreshUnitVisuals();  
  
  // load default location on DOMContentLoaded (Berlin as in your HTML)  
  document.addEventListener('DOMContentLoaded', () => {  
    const defaultLat = 52.52, defaultLon = 13.405;  
    lastLocation = { displayName: 'Berlin, Germany', lat: defaultLat, lon: defaultLon };  
    citySearch.value = lastLocation.displayName;  
    fetchAndRenderWeather(defaultLat, defaultLon);  
  });  
  
})();  
