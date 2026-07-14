/**
 * MovieGlu API integration for fetching movies currently in theaters.
 * Uses sandbox credentials for development, can switch to production for IN territory.
 */

const USE_SANDBOX = process.env.MOVIEGLU_USE_SANDBOX !== 'false';

const MOVIEGLU_CONFIG = {
  sandbox: {
    client: 'VIIL',
    apiKey: 'JMR2brley32xry4DZdJLc3gGhJJW2leClK1YTFU2',
    authorization: 'Basic VklJTF9YWDpLTUlsRzVkbzJwemk=',
    territory: 'XX',
    defaultGeolocation: '-22.0;14.0',
  },
  production: {
    client: 'VIIL',
    apiKey: 'HWhl9CuN9E7yjHi14mRb61D9Y8DKUxLSK2WRSOAg',
    authorization: 'Basic VklJTDpuYkZGNXBtSG55TG8=',
    territory: 'IN',
    defaultGeolocation: '19.076;72.8777', // Mumbai
  },
};

function getConfig() {
  return USE_SANDBOX ? MOVIEGLU_CONFIG.sandbox : MOVIEGLU_CONFIG.production;
}

function getHeaders(geolocation) {
  const config = getConfig();
  const now = new Date().toISOString();
  
  return {
    'client': config.client,
    'x-api-key': config.apiKey,
    'authorization': config.authorization,
    'territory': config.territory,
    'api-version': 'v201',
    'geolocation': geolocation || config.defaultGeolocation,
    'device-datetime': now,
    'Content-Type': 'application/json',
  };
}

/**
 * Fetch movies currently showing in theaters near a location.
 * @param {string} geolocation - Format: "lat;lng" e.g. "19.076;72.8777"
 * @param {number} n - Number of results (default 10)
 */
export async function getMoviesNowShowing(geolocation, n = 10) {
  const url = `https://api-gate2.movieglu.com/filmsNowShowing/?n=${n}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(geolocation),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[MovieGlu] filmsNowShowing error:', res.status, text);
      return { ok: false, error: `API error: ${res.status}` };
    }
    
    const data = await res.json();
    return { ok: true, films: data.films || [] };
  } catch (err) {
    console.error('[MovieGlu] filmsNowShowing exception:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch showtimes for a specific film.
 * @param {string} filmId - MovieGlu film ID
 * @param {string} geolocation - Format: "lat;lng"
 * @param {string} date - Format: "YYYY-MM-DD"
 */
export async function getFilmShowtimes(filmId, geolocation, date) {
  const dateParam = date || new Date().toISOString().split('T')[0];
  const url = `https://api-gate2.movieglu.com/filmShowTimes/?film_id=${filmId}&date=${dateParam}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(geolocation),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[MovieGlu] filmShowTimes error:', res.status, text);
      return { ok: false, error: `API error: ${res.status}` };
    }
    
    const data = await res.json();
    return { ok: true, cinemas: data.cinemas || [] };
  } catch (err) {
    console.error('[MovieGlu] filmShowTimes exception:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch nearby cinemas.
 * @param {string} geolocation - Format: "lat;lng"
 * @param {number} n - Number of results
 */
export async function getCinemasNearby(geolocation, n = 10) {
  const url = `https://api-gate2.movieglu.com/cinemasNearby/?n=${n}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(geolocation),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[MovieGlu] cinemasNearby error:', res.status, text);
      return { ok: false, error: `API error: ${res.status}` };
    }
    
    const data = await res.json();
    return { ok: true, cinemas: data.cinemas || [] };
  } catch (err) {
    console.error('[MovieGlu] cinemasNearby exception:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Search for films by title.
 * @param {string} query - Search query
 */
export async function searchFilms(query) {
  const url = `https://api-gate2.movieglu.com/filmLiveSearch/?query=${encodeURIComponent(query)}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[MovieGlu] filmLiveSearch error:', res.status, text);
      return { ok: false, error: `API error: ${res.status}` };
    }
    
    const data = await res.json();
    return { ok: true, films: data.films || [] };
  } catch (err) {
    console.error('[MovieGlu] filmLiveSearch exception:', err);
    return { ok: false, error: err.message };
  }
}
