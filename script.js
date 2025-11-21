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
  const currentIconEl = document.querySelector('.current-weather .current-icon'); // updated selector
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

  // state elements
  const loadingStateInline = document.getElementById('current-loading'); // inside current-weather
  const noResultsState = document.getElementById('no-results-state');
  const errorState = document.getElementById('error-state');
  const retryBtn = document.getElementById('retry-btn');

  const mainTop = document.querySelector('.main-top');
  const mainContainer = document.querySelector('.main-container');

  // classes used to hide/show content areas
  const weatherContentEls = Array.from(document.querySelectorAll('.weather-content'));

  // ----------------- Utility conversions & helpers -----------------
  const cToF = c => (c * 9/5) + 32;
  const fToC = f => (f - 32) * 5/9;
  const msToKmh = ms => ms * 3.6;          // m/s -> km/h
  const kmhToMph = kmh => kmh * 0.621371;
  const mmToInches = mm => mm / 25.4;

  const round = v => Math.round(v);
  const formatTemp = v => `${round(v)}°`;

  function weatherCodeToIcon(code) {
    if (code === 0) return 'icon-sunny.webp';
    if (code === 1 || code === 2) return 'icon-partly-cloudy.webp';
    if (code === 3) return 'icon-overcast.webp';
    if ([45, 48].includes(code)) return 'icon-fog.webp';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].some(x => x === code)) return 'icon-rain.webp';
    if ([66, 67, 71, 73, 75, 85, 86].some(x => x === code)) return 'icon-snow.webp';
    if ([95, 96, 99].some(x => x === code)) return 'icon-storm.webp';
    return 'icon-sunny.webp';
  }

  function findClosestHourIndex(timeArray, targetDate = new Date()) {
    if (!Array.isArray(timeArray) || timeArray.length === 0) return 0;
    const targetPrefix = targetDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    for (let i = 0; i < timeArray.length; i++) {
      if (timeArray[i].slice(0, 13) === targetPrefix) return i;
    }
    return 0;
  }

  // ----------------- Unit UI helpers -----------------
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

  unitItems.forEach(item => {
    if (!item.dataset.unit) {
      const attr = item.getAttribute('data-unit');
      if (attr) item.dataset.unit = attr;
    }

    item.addEventListener('click', () => {
      const type = item.dataset.type;
      const value = item.dataset.unit;
      if (!type || !value) return;
      selectedUnits[type] = value;
      document.querySelectorAll(`.item[data-type="${type}"]`).forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      if (lastWeatherData && lastLocation) renderAllFromCache();
    });
  });

  // ----------------- Global click handler -----------------
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
          // Show loading state before fetching
          showLoadingUI();
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

  cityList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const t = e.target;
      if (t && t.classList.contains('city-option')) t.click();
    }
  });

  // If user submits the search form, use the existing searchBtn logic (geocoding)
  document.querySelector(".search-bar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    // clear any top states
    hideTopStates();
    // show inline loading
    showLoadingUI();
    // delegate to searchBtn click handler
    searchBtn.click();
  });

  // Search button fallback: geocode query and take first result
  searchBtn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const q = citySearch.value.trim();
    if (!q) {
      // nothing to search
      hideLoadingUI();
      return;
    }
    // show inline loading
    showLoadingUI();
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
        // no results: clear input, hide inline loading, show top no-results
        citySearch.value = '';
        hideLoadingUI();
        showNoResultsTop();
      }
    } catch (err) {
      console.error('search error', err);
      hideLoadingUI();
      showErrorTop();
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
      // success -> show content
      showContentUI();
    } catch (err) {
      console.error('weather fetch error', err);
      hideLoadingUI();
      showErrorTop();
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
      if (currentIconEl) {
        currentIconEl.src = `images/${iconName}`;
        currentIconEl.alt = 'weather icon';
      }

      const windMs = cw.windspeed ?? 0;
      const windKmh = msToKmh(windMs);
      const windDisplayVal = selectedUnits.wind === 'kmh' ? windKmh : kmhToMph(windKmh);
      windEl && (windEl.textContent = `${round(windDisplayVal)} ${selectedUnits.wind}`);
    } else {
      currentTempEl.textContent = '—';
    }

    // Humidity
    let humVal = null;
    if (data.hourly && Array.isArray(data.hourly.relativehumidity_2m)) {
      const idx = findClosestHourIndex(data.hourly.time, new Date());
      humVal = (idx !== -1) ? data.hourly.relativehumidity_2m[idx] : null;
    }
    humidityEl && (humidityEl.textContent = humVal !== null ? `${round(humVal)}%` : '—');

    // Precipitation
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

    // Feels like
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

    for (let i = 0; i < 7; i++) {
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

    const groups = {};
    for (let i = 0; i < times.length; i++) {
      const dateKey = times[i].slice(0, 10);
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

      if (idx === 0) {
        populateHourly(groups[k].indices, times, temps, winds, precs, codes);
        dayBtn.textContent = `${groups[k].label} ▾`;
      }
    });

    dayBtn.onclick = () => {
      const open = dayMenu.classList.toggle('open');
      dayBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      dayMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    };
  }

  function populateHourly(indices, times, temps, winds, precs, codes) {
    hourlyContainer.innerHTML = '';

    indices.slice(0, 8).forEach(i => {
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

  document.addEventListener('DOMContentLoaded', () => {
    const defaultLat = 52.52, defaultLon = 13.405;
    lastLocation = { displayName: 'Berlin, Germany', lat: defaultLat, lon: defaultLon };
    citySearch.value = lastLocation.displayName;
    // show loading for the initial fetch
    showLoadingUI();
    fetchAndRenderWeather(defaultLat, defaultLon);
  });

  // ====== UI State helpers (as requested) ======

  function hideTopStates() {
    noResultsState.classList.add('state-hidden');
    errorState.classList.add('state-hidden');
    document.body.classList.remove('error-active');
  }

  function showNoResultsTop() {
    hideTopStates();
    noResultsState.classList.remove('state-hidden');
    // clear the input (your request #3)
    citySearch.value = '';
    // ensure weather content hidden
    weatherContentEls.forEach(el => el.classList.add('hidden'));
    // keep search bar visible
  }

  function showErrorTop() {
    hideTopStates();
    // hide search bar when error state active (your request #1)
    document.body.classList.add('error-active');
    errorState.classList.remove('state-hidden');
    // hide weather content
    weatherContentEls.forEach(el => el.classList.add('hidden'));
  }

  function showLoadingUI() {
    hideTopStates();
    // show inline loader inside current-weather
    loadingStateInline.classList.remove('state-hidden');
    loadingStateInline.setAttribute('aria-hidden', 'false');
    // hide all weather content elements (icons, temp, daily, hourly, extra-info)
    weatherContentEls.forEach(el => el.classList.add('hidden'));
    // ensure current-weather background is suppressed while loading
    document.querySelector('.current-weather').classList.add('loading');
  }

  function hideLoadingUI() {
    loadingStateInline.classList.add('state-hidden');
    loadingStateInline.setAttribute('aria-hidden', 'true');
    document.querySelector('.current-weather').classList.remove('loading');
  }

  function showContentUI() {
    hideTopStates();
    hideLoadingUI();
    weatherContentEls.forEach(el => el.classList.remove('hidden'));
    // ensure search bar visible
    document.body.classList.remove('error-active');
  }

  // ===== Retry button behavior =====
  retryBtn.addEventListener('click', () => {
    // hide error top state, show inline loading and re-run last successful flow or initial fetch
    hideTopStates();
    showLoadingUI();
    if (lastLocation && lastLocation.lat && lastLocation.lon) {
      fetchAndRenderWeather(lastLocation.lat, lastLocation.lon);
    } else {
      // fallback reload content
      const defaultLat = 52.52, defaultLon = 13.405;
      fetchAndRenderWeather(defaultLat, defaultLon);
    }
  });

})();