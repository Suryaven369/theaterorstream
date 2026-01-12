const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const { Configuration, OpenAIApi } = require("openai");
const firebase = require('firebase-admin');

require('dotenv').config();

// Initialize OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Function to scrape movie reviews from IMDb
async function scrapeReviews(imdbId) {
  const url = `https://www.imdb.com/title/${imdbId}/reviews`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  const $ = cheerio.load(response.data);
  
  const reviews = [];
  $('.lister-item-content').each((i, elem) => {
    const reviewText = $(elem).find('.text.show-more__control').text().trim();
    if (reviewText) {
      reviews.push(reviewText);
    }
    if (reviews.length >= 5) return false; // Limit to 5 reviews
  });
  
  return reviews;
}

// Function to analyze reviews using GPT
async function analyzeReviews(reviews) {
  const combinedReviews = reviews.join(' ');
  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {role: "system", content: "You are a movie critic assistant. Analyze the given reviews and provide ratings. Respond with a JSON object only, no additional text or formatting."},
        {role: "user", content: `Analyze the following movie reviews and rate the movie on a scale of 1-10 for each of these categories: acting, pacing, cinematicQuality, plot, sound, and entertainmentValue. Also, calculate the average rating from these categories. If the average rating is above 7, recommend watching in theaters; otherwise, recommend streaming. Provide a short verdict (max 20 characters). Present all ratings and the verdict as a JSON object. Reviews: ${combinedReviews}`}
      ],
      max_tokens: 300
    });

    let analysisText = response.data.choices[0].message.content;
    
    // Remove any Markdown formatting if present
    if (analysisText.startsWith('```')) {
      analysisText = analysisText.replace(/```json\n|```/g, '');
    }

    // Attempt to parse the JSON
    let ratings = JSON.parse(analysisText);

    // Ensure all rating properties are numbers
    const ratingCategories = ['acting', 'pacing', 'cinematicQuality', 'plot', 'sound', 'entertainmentValue'];
    ratingCategories.forEach(category => {
      ratings[category] = typeof ratings[category] === 'number' ? ratings[category] : 0;
    });
    
    // Calculate average rating
    const ratingValues = ratingCategories.map(category => ratings[category]);
    ratings.averageRating = ratingValues.reduce((sum, val) => sum + val, 0) / ratingValues.length;
    
    // Add verdict
    ratings.verdict = ratings.averageRating > 7 ? "Watch in theaters" : "Stream it";

    return ratings;
  } catch (error) {
    console.error('Error in analyzeReviews:', error);
    return {
      acting: 0,
      pacing: 0,
      cinematicQuality: 0,
      plot: 0,
      sound: 0,
      entertainmentValue: 0,
      averageRating: 0,
      verdict: "Unable to decide"
    };
  }
}
// Route to handle scraping and analysis
router.get('/analyze/:movieId', async (req, res) => {
  try {
    const movieId = req.params.movieId;
    
    // Get movie details from Firebase
    // const movieDoc = await firebase.firestore().collection('movies').doc(movieId).get();
    // if (!movieDoc.exists) {
    //   return res.status(404).json({ error: 'Movie not found' });
    // }
    // const movieData = movieDoc.data();

    // Scrape reviews
    const reviews = await scrapeReviews(movieId);

    // Analyze reviews
    const ratings = await analyzeReviews(reviews);

    console.log(ratings);

    // // Save ratings to Firebase
    // await firebase.firestore().collection('movies').doc(movieId).update({
    //   aiRatings: ratings
    // });

    res.json({ message: 'Analysis complete', ratings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during analysis', details: error.message });
  }
});

module.exports = router;