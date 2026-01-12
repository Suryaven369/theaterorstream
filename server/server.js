const express = require('express');
const firebase = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');
const scraperRoutes = require('./scraper');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Initialize Firebase Admin SDK
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://theaterorstream-default-rtdb.firebaseio.com"
});

const db = firebase.firestore();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Input validation middleware
const validateSearchQuery = (req, res, next) => {
  const { search } = req.query;
  if (!search || typeof search !== 'string') {
    return res.status(400).json({ error: 'Invalid search query' });
  }
  next();
};

// API route to save movies to Firestore
app.get('/api/movies', validateSearchQuery, async (req, res, next) => {
  try {
    const searchQuery = req.query.search;
    const response = await axios.get('http://www.omdbapi.com/', {
      params: {
        apikey: OMDB_API_KEY,
        s: searchQuery,
        type: 'movie'
      }
    });

    const movies = response.data.Search;
    if (!movies) {
      return res.status(404).json({ error: 'No movies found' });
    }

    const detailedMovies = await Promise.all(movies.map(async (movie) => {
      const detailsResponse = await axios.get('http://www.omdbapi.com/', {
        params: {
          apikey: OMDB_API_KEY,
          i: movie.imdbID
        }
      });

      const details = detailsResponse.data;
      const movieData = {
        title: details.Title,
        poster: details.Poster,
        synopsis: details.Plot,
        cast: details.Actors.split(', ').map(name => ({ name })),
        ratings: details.Ratings.reduce((acc, rating) => {
          acc[rating.Source] = rating.Value;
          return acc;
        }, {}),
        imdbID: details.imdbID
      };

      // Save to Firestore under 'movies' collection
      await db.collection('movies').doc(details.imdbID).set(movieData);

      return movieData;
    }));

    res.json(detailedMovies);
  } catch (error) {
    next(error);
  }
});

app.use('/scraper', scraperRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});