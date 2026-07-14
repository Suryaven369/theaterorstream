/**
 * Client-side API for fetching theater/cinema data from MovieGlu.
 */

const API_BASE = '/api/theaters';

/**
 * Get user's current location.
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });
}

/**
 * Fetch movies currently showing in theaters.
 * @param {object} options - { lat, lng, n }
 */
export async function getMoviesInTheaters({ lat, lng, n = 10 } = {}) {
  const params = new URLSearchParams();
  if (lat && lng) {
    params.set('lat', lat);
    params.set('lng', lng);
  }
  params.set('n', n);
  
  try {
    const res = await fetch(`${API_BASE}/now-showing?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, movies: data.movies || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch showtimes for a specific film.
 * @param {string} filmId - MovieGlu film ID
 * @param {object} options - { lat, lng, date }
 */
export async function getShowtimes(filmId, { lat, lng, date } = {}) {
  const params = new URLSearchParams({ filmId });
  if (lat && lng) {
    params.set('lat', lat);
    params.set('lng', lng);
  }
  if (date) {
    params.set('date', date);
  }
  
  try {
    const res = await fetch(`${API_BASE}/showtimes?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, cinemas: data.cinemas || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch nearby cinemas.
 * @param {object} options - { lat, lng, n }
 */
export async function getNearbyCinemas({ lat, lng, n = 10 } = {}) {
  const params = new URLSearchParams();
  if (lat && lng) {
    params.set('lat', lat);
    params.set('lng', lng);
  }
  params.set('n', n);
  
  try {
    const res = await fetch(`${API_BASE}/cinemas?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, cinemas: data.cinemas || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
