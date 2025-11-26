(() => {
  // ----------------- Configuration & state -----------------
  const AUTOCOMPLETE_LIMIT = 5;

  const selectedUnits = {
    temperature: 'celsius',
    wind: 'kmh',
    precipitation: 'mm'
  };

  let lastWeatherData = null;
  let lastLocation = null; // { displayName, lat, lon }

  // ----------------- DOM refs (guarded) -----------------
  const unitsBtn = document.getElementById('unitsBtn');
  const unitsMenu = document.getElementById('unitsMenu');
  const unitItems = unitsMenu ? Array.from(unitsMenu.querySelectorAll('.item')) : [];

  const citySearch = document.getElementById('citySearch');
  const cityList = document.getElementById('cityList'); // ul.city-dropdown
  const searchBtn = document.getElementById('search-btn');

  const currentCityEl = document.querySelector('.city');
  const dateEl = document.querySelector('.date');
  const currentIconEl = document.querySelector('.current-weather img'); // first img inside current-weather
  const currentTempEl = document.querySelector('.temperature .temp');

  const extraInfoCards = Array.from(document.querySelectorAll('.extra-info .info-card'));
  const feelsLikeEl = extraInfoCards[0] ? extraInfoCards[0].querySelector('h4') : null;
  const humidityEl   = extraInfoCards[1] ? extraInfoCards[1].querySelector('h4') : null;
  const windEl       = extraInfoCards[2] ? extraInfoCards[2].querySelector('h4') : null;
  const precipitationEl = extraInfoCards[3] ? extraInfoCards[3].querySelector('h4') : null;

  const dailyContainer = document.querySelector('.daily-forecast'); // ul
  const hourlyContainer = document.querySelector('.hourly-list');   // ul

  const dayBtn = document.getElementById('dayBtn');
  const dayMenu = document.getElementById('dayMenu');

  // state / UI elements
  // loadingState (top full page) is not needed for inline loader here, but keep ref if present
  const loadingState = document.getElementById("loading-state");
  const noResultsState = document.getElementById("no-results-state");
  const errorState = document.getElementById("error-state");
  const retryBtn = document.getElementById("retry-btn");
  const mainContainer = document.querySelector(".main-container");

  // elements considered "weather content"
  const weatherContentEls = Array.from(document.querySelectorAll('.current-weather, .daily-section, .hourly-forecast, .extra-info'));

  // inline loader element (inside current-weather)
  const inlineLoader = document.getElementById('loading-inline-state');

  // ----------------- Helpers / conversions -----------------
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
    if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) return 'icon-rain.webp';
    if ([66, 67, 71, 73, 75, 85, 86].includes(code)) return 'icon-snow.webp';
    if ([95, 96, 99].includes(code)) return 'icon-storm.webp';
    return 'icon-sunny.webp';
  }

  function findClosestHourIndex(timeArray, targetDate = new Date()) {
    if (!Array.isArray(timeArray) || timeArray.length === 0) return -1;
    const targetPrefix = targetDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    for (let i = 0; i < timeArray.length; i++) {
      if (timeArray[i].slice(0, 13) === targetPrefix) return i;
    }
    return -1;
  }

  // ----------------- State UI control -----------------
  function hideAllStates() {
    if (loadingState) loadingState.classList.add("state-hidden");
    if (noResultsState) noResultsState.classList.add("state-hidden");
    if (errorState) errorState.classList.add("state-hidden");
  }

  /**
   * showState:
   * - "content" => show main content
   * - "no-results" / "error" => hide main content and show top state
   * - "loading" => keep main content visible (we use the inline loader for the big card)
   */
  function showState(state) {
    hideAllStates();

    if (state === "content") {
      if (mainContainer) mainContainer.style.display = "block";
    } else if (state === "no-results" || state === "error") {
      if (mainContainer) mainContainer.style.display = "none";
    } else if (state === "loading") {
      // keep main content visible but show a top loader if you use one
      if (mainContainer) mainContainer.style.display = "block";
    }

    if (state === "loading" && loadingState) loadingState.classList.remove("state-hidden");
    if (state === "no-results" && noResultsState) noResultsState.classList.remove("state-hidden");
    if (state === "error" && errorState) errorState.classList.remove("state-hidden");
  }

  // ----------------- Units UI helpers -----------------
  (function assignUnitTypesFromSections() {
    if (!unitsMenu) return;
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

  // Toggle handlers (attach only once, guard for missing elements)
  if (unitsBtn && unitsMenu) {
    unitsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = unitsMenu.classList.toggle('open');
      unitsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      unitsMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    });
  }

  unitItems.forEach(item => {
    if (!item.dataset.unit) {
      const attr = item.getAttribute('data-unit');
      if (attr) item.dataset.unit = attr;
    }

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = item.dataset.type;
      const value = item.dataset.unit;
      if (!type || !value) return;
      selectedUnits[type] = value;
      document.querySelectorAll(`.item[data-type="${type}"]`).forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');

      if (lastWeatherData && lastLocation) renderAllFromCache();
    });
  });

  // ----------------- Global click handler to close open menus -----------------
  document.addEventListener('click', (e) => {
    if (unitsBtn && unitsMenu && !unitsBtn.contains(e.target) && !unitsMenu.contains(e.target)) {
      unitsMenu.classList.remove('open');
      unitsBtn.setAttribute('aria-expanded', 'false');
      unitsMenu.setAttribute('aria-hidden', 'true');
    }
    if (dayBtn && dayMenu && !dayBtn.contains(e.target) && !dayMenu.contains(e.target)) {
      dayMenu.classList.remove('open');
      dayBtn.setAttribute('aria-expanded', 'false');
      dayMenu.setAttribute('aria-hidden', 'true');
    }
    const cityWrapper = document.querySelector('.city-dropdown-container');
    if (cityWrapper && !cityWrapper.contains(e.target)) {
      if (cityList) {
        cityList.innerHTML = '';
        cityList.style.display = 'none';
        cityList.setAttribute('aria-hidden', 'true');
      }
    }
  });

  // ----------------- Geocoding (autocomplete) -----------------
  let suggestionTimer = null;
  if (citySearch) {
    citySearch.addEventListener('input', () => {
      const q = citySearch.value.trim();
      clearTimeout(suggestionTimer);
      if (q.length < 2) {
        if (cityList) {
          cityList.innerHTML = '';
          cityList.style.display = 'none';
          cityList.setAttribute('aria-hidden', 'true');
        }
        return;
      }
      // small debounce (user-friendly)
      suggestionTimer = setTimeout(() => fetchCitySuggestions(q), 180);
    });
  }

  async function fetchCitySuggestions(query) {
    if (!cityList) return;
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
        li.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') li.click();
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

  // ----------------- Search form submit (uses geocoding -> weather) -----------------
  const searchForm = document.querySelector(".search-bar");
  if (searchForm) {
    searchForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const q = citySearch ? citySearch.value.trim() : '';
      if (!q) return;

      // show top-loading (if you had a full-page loading) and inline loader
      showState("loading");
      showInlineLoading();

      try {
        // geocode the entered text (take first result)
        const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`;
        const gRes = await fetch(geocodeUrl);
        if (!gRes.ok) throw new Error("Geocoding API error");
        const gData = await gRes.json();

        if (!gData.results || gData.results.length === 0) {
          hideInlineLoading();
          showState("no-results");
          return;
        }

        const loc = gData.results[0];
        lastLocation = {
          displayName: `${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}${loc.country ? ', ' + loc.country : ''}`,
          lat: loc.latitude,
          lon: loc.longitude
        };
        if (citySearch) citySearch.value = lastLocation.displayName;

        // now fetch weather
        await fetchAndRenderWeather(lastLocation.lat, lastLocation.lon);

      } catch (err) {
        console.error('search flow error', err);
        hideInlineLoading();
        showState("error");
      }
    });
  }

  // ----------------- Fetch weather -----------------
  async function fetchAndRenderWeather(lat, lon) {
    // At the start of the request show the inline loader
    showInlineLoading();
    // keep top state as loading (but main content stays visible)
    showState("loading");

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current_weather=true` +
        `&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,precipitation,weathercode` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto`;

      // <-- main weather fetch() call - this is the critical one
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Forecast API error ${res.status}`);
      const data = await res.json();

      // cache and render
      lastWeatherData = data;
      if (!lastLocation) lastLocation = { displayName: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon };

      renderAllFromCache();

      // hide loader and show content
      hideInlineLoading();
      showState("content");
    } catch (err) {
      console.error('weather fetch error', err);
      hideInlineLoading();
      showState("error");
    }
  }

  // retry button tries to re-fetch last location or load default
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      showState("loading");
      showInlineLoading();
      if (lastLocation && lastLocation.lat && lastLocation.lon) {
        await fetchAndRenderWeather(lastLocation.lat, lastLocation.lon);
      } else {
        // re-load default (Berlin)
        await fetchAndRenderWeather(52.52, 13.405);
      }
    });
  }

  // ----------------- Render from cached data -----------------
  function renderAllFromCache() {
    if (!lastWeatherData) return;
    const data = lastWeatherData;

    if (currentCityEl) {
      currentCityEl.textContent = (lastLocation && lastLocation.displayName) ? lastLocation.displayName : `${(data.latitude || 0).toFixed(2)}, ${(data.longitude || 0).toFixed(2)}`;
    }

    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }

    const cw = data.current_weather || null;
    if (cw) {
      const tempC = cw.temperature;
      const tempDisp = selectedUnits.temperature === 'celsius' ? tempC : cToF(tempC);
      if (currentTempEl) currentTempEl.textContent = formatTemp(tempDisp);

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
      currentTempEl && (currentTempEl.textContent = '—');
    }

    let humVal = null;
    if (data.hourly && Array.isArray(data.hourly.relativehumidity_2m) && Array.isArray(data.hourly.time)) {
      const idx = findClosestHourIndex(data.hourly.time, new Date());
      humVal = (idx !== -1) ? data.hourly.relativehumidity_2m[idx] : null;
    }
    humidityEl && (humidityEl.textContent = humVal !== null ? `${round(humVal)}%` : '—');

    let precip = null;
    if (data.hourly && Array.isArray(data.hourly.precipitation) && Array.isArray(data.hourly.time)) {
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

    if (cw) {
      const feelsC = cw.temperature;
      const feelsDisp = selectedUnits.temperature === 'celsius' ? feelsC : cToF(feelsC);
      feelsLikeEl && (feelsLikeEl.textContent = formatTemp(feelsDisp));
    } else {
      feelsLikeEl && (feelsLikeEl.textContent = '—');
    }

    renderDaily(data);
    renderHourly(data);

    refreshUnitVisuals();
  }

  function renderDaily(data) {
    if (!dailyContainer) return;
    dailyContainer.innerHTML = '';
    if (!data.daily) return;
    const times = data.daily.time || [];
    const max = data.daily.temperature_2m_max || [];
    const min = data.daily.temperature_2m_min || [];
    const codes = data.daily.weathercode || [];

    const daysToRender = Math.min(7, times.length);
    for (let i = 0; i < daysToRender; i++) {
      const li = document.createElement('li');
      li.className = 'daily-item';

      const d = new Date(times[i]);
      const dayName = isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { weekday: 'short' });

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

      const sMax = document.createElement('span'); sMax.textContent = isNaN(maxVal) ? '—' : `${round(maxVal)}°`;
      const sMin = document.createElement('span'); sMin.textContent = isNaN(minVal) ? '—' : `${round(minVal)}°`;

      degree.appendChild(sMax);
      degree.appendChild(sMin);

      li.appendChild(pDay);
      li.appendChild(img);
      li.appendChild(degree);
      dailyContainer.appendChild(li);
    }
  }

  function renderHourly(data) {
    if (!hourlyContainer || !dayMenu || !dayBtn) return;
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
      if (!times[i]) continue;
      const dateKey = times[i].slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = { indices: [], label: (new Date(times[i])).toLocaleDateString(undefined, { weekday: 'long' }) };
      groups[dateKey].indices.push(i);
    }

    const keys = Object.keys(groups);
    if (keys.length === 0) return;

    keys.forEach((k, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-option';
      btn.textContent = groups[k].label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        populateHourly(groups[k].indices, times, temps, winds, precs, codes);
        dayMenu.classList.remove('open');
        dayBtn.setAttribute('aria-expanded', 'false');
        dayMenu.setAttribute('aria-hidden', 'true');
        dayBtn.textContent = `${groups[k].label} ▾`;
      });
      dayMenu.appendChild(btn);

      // open the first group by default
      if (idx === 0) {
        populateHourly(groups[k].indices, times, temps, winds, precs, codes);
        dayBtn.textContent = `${groups[k].label} ▾`;
      }
    });

    // attach dayBtn handler once
    dayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dayMenu.classList.toggle('open');
      dayBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      dayMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    }, { once: false });
  }

  function populateHourly(indices, times, temps, winds, precs, codes) {
    if (!hourlyContainer) return;
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
      spanTime.textContent = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString([], { hour: 'numeric', hour12: true });

      left.appendChild(img);
      left.appendChild(spanTime);

      const right = document.createElement('span');
      const tempVal = (selectedUnits.temperature === 'celsius') ? temps[i] : cToF(temps[i]);
      right.textContent = isNaN(tempVal) ? '—' : `${round(tempVal)}°`;

      li.appendChild(left);
      li.appendChild(right);
      hourlyContainer.appendChild(li);
    });
  }

  // ----------------- Initialization -----------------
  refreshUnitVisuals();

  // load default location on DOMContentLoaded (Berlin)
  document.addEventListener('DOMContentLoaded', () => {
    const defaultLat = 52.52, defaultLon = 13.405;
    lastLocation = { displayName: 'Berlin, Germany', lat: defaultLat, lon: defaultLon };
    if (citySearch) citySearch.value = lastLocation.displayName;
    // kick off load
    fetchAndRenderWeather(defaultLat, defaultLon);
  });

  // ====== UI State helpers======

  function hideTopStates() {
    if (noResultsState) noResultsState.classList.add('state-hidden');
    if (errorState) errorState.classList.add('state-hidden');
    document.body.classList.remove('error-active');
  }

  function showNoResultsTop() {
    hideTopStates();
    if (noResultsState) noResultsState.classList.remove('state-hidden');
    if (citySearch) citySearch.value = '';
    // hide weather content
    weatherContentEls.forEach(el => el.classList.add('state-hidden'));
  }

  function showErrorTop() {
    hideTopStates();
    document.body.classList.add('error-active');
    if (errorState) errorState.classList.remove('state-hidden');
    weatherContentEls.forEach(el => el.classList.add('state-hidden'));
  }

  function showInlineLoading() {
    inlineLoader.classList.remove("state-hidden");
    inlineLoader.setAttribute("aria-hidden", "false");

    // Hide weather image/icon 
    const weatherIcon = document.querySelector(".temperature img");
    const weatherTemp = document.querySelector(".temperature .temp");
    if (weatherIcon) {
        weatherIcon.style.visibility = "hidden";
    }
    if (weatherIcon) {
        weatherTemp.style.visibility = "hidden";
    }

    // Hide inner content of cards but keep layout
    document.querySelectorAll(".info-card, .daily-item, .hourly-item").forEach(card => {
        card.classList.add("loading-card");
    });
}

function hideInlineLoading() {
    inlineLoader.classList.add("state-hidden");
    inlineLoader.setAttribute("aria-hidden", "true");

    // Show weather icon again
    const weatherIcon = document.querySelector(".temperature img");
    const weatherTemp = document.querySelector(".temperature .temp");
    if (weatherTemp) {
        weatherTemp.style.visibility = "visible";
    }
    if (weatherIcon) {
        weatherIcon.style.visibility = "visible";
    }

    document.querySelectorAll(".info-card, .daily-item, .hourly-item").forEach(card => {
        card.classList.remove("loading-card");
    });
}

  // keep backward compat with earlier function name
  function hideLoadingUI(){
    hideInlineLoading();
  }

  function showContentUI() {
    hideTopStates();
    hideLoadingUI();
    weatherContentEls.forEach(el => el.classList.remove('state-hidden'));
    document.body.classList.remove('error-active');
  }

})();