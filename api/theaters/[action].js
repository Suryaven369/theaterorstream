/**
 * /api/theaters/[action] — MovieGlu theater data endpoints
 * 
 * Actions:
 *   GET /api/theaters/now-showing?lat=19.076&lng=72.8777&n=10
 *   GET /api/theaters/showtimes?filmId=123&lat=19.076&lng=72.8777&date=2026-07-15
 *   GET /api/theaters/cinemas?lat=19.076&lng=72.8777&n=10
 */

import { getMoviesNowShowing, getFilmShowtimes, getCinemasNearby } from '../_lib/movieglu-server.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;
  const { lat, lng, n, filmId, date } = req.query;
  
  // Build geolocation string
  const geolocation = lat && lng ? `${lat};${lng}` : null;

  try {
    switch (action) {
      case 'now-showing': {
        const result = await getMoviesNowShowing(geolocation, parseInt(n) || 10);
        if (!result.ok) {
          return res.status(500).json({ error: result.error });
        }
        // Transform to a cleaner format
        const movies = (result.films || []).map((film) => ({
          id: film.film_id,
          title: film.film_name,
          releaseDate: film.release_dates?.[0]?.release_date || null,
          ageRating: film.age_rating?.[0]?.rating || null,
          duration: film.duration_mins,
          synopsis: film.synopsis_long || film.synopsis_short || null,
          poster: film.images?.poster?.['1']?.medium?.film_image || null,
          posterLarge: film.images?.poster?.['1']?.large?.film_image || null,
          backdrop: film.images?.still?.['1']?.medium?.film_image || null,
          trailerUrl: film.trailers?.high?.[0]?.film_trailer || film.trailers?.med?.[0]?.film_trailer || null,
          genres: film.genres?.map((g) => g.genre_name) || [],
          directors: film.directors?.map((d) => ({ id: d.director_id, name: d.director_name })) || [],
          cast: film.cast?.map((c) => ({ id: c.cast_id, name: c.cast_name })) || [],
          imdbId: film.imdb_id || null,
          tmdbId: film.tmdb_id || null,
        }));
        return res.status(200).json({ movies, count: movies.length });
      }

      case 'showtimes': {
        if (!filmId) {
          return res.status(400).json({ error: 'filmId is required' });
        }
        const result = await getFilmShowtimes(filmId, geolocation, date);
        if (!result.ok) {
          return res.status(500).json({ error: result.error });
        }
        return res.status(200).json({ cinemas: result.cinemas });
      }

      case 'cinemas': {
        const result = await getCinemasNearby(geolocation, parseInt(n) || 10);
        if (!result.ok) {
          return res.status(500).json({ error: result.error });
        }
        // Transform to cleaner format
        const cinemas = (result.cinemas || []).map((c) => ({
          id: c.cinema_id,
          name: c.cinema_name,
          address: c.address,
          city: c.city,
          distance: c.distance,
          lat: c.lat,
          lng: c.lng,
        }));
        return res.status(200).json({ cinemas, count: cinemas.length });
      }

      default:
        return res.status(404).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[theaters API] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
