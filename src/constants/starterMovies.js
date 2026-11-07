/**
 * Starter grid for the taste quiz: 30 well-known films across genres, eras and
 * languages (English + Indian languages + world cinema). TMDB ids/posters were
 * verified against the TMDB API (title + year + original language), not typed by hand.
 */
export const STARTER_MOVIES = [
    { id: 278, title: "The Shawshank Redemption", year: 1994, lang: "en", poster: "/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg", genreIds: [18, 80] },
    { id: 155, title: "The Dark Knight", year: 2008, lang: "en", poster: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", genreIds: [28, 53, 80] },
    { id: 27205, title: "Inception", year: 2010, lang: "en", poster: "/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg", genreIds: [28, 878, 80] },
    { id: 157336, title: "Interstellar", year: 2014, lang: "en", poster: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg", genreIds: [12, 18, 878] },
    { id: 680, title: "Pulp Fiction", year: 1994, lang: "en", poster: "/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg", genreIds: [53, 80, 35] },
    { id: 238, title: "The Godfather", year: 1972, lang: "en", poster: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", genreIds: [18, 80] },
    { id: 597, title: "Titanic", year: 1997, lang: "en", poster: "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg", genreIds: [18, 10749] },
    { id: 299534, title: "Avengers: Endgame", year: 2019, lang: "en", poster: "/jtDv3lCnST0fZRvdYFwR5CVwK2x.jpg", genreIds: [12, 878, 28] },
    { id: 313369, title: "La La Land", year: 2016, lang: "en", poster: "/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", genreIds: [35, 18, 10749] },
    { id: 419430, title: "Get Out", year: 2017, lang: "en", poster: "/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg", genreIds: [9648, 53, 27] },
    { id: 138843, title: "The Conjuring", year: 2013, lang: "en", poster: "/wVYREutTvI2tmxr6ujrHT704wGF.jpg", genreIds: [27, 53] },
    { id: 76341, title: "Mad Max: Fury Road", year: 2015, lang: "en", poster: "/ulcAi4dKpAjHwYGS08vNyx9H6I9.jpg", genreIds: [28, 12, 878] },
    { id: 862, title: "Toy Story", year: 1995, lang: "en", poster: "/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg", genreIds: [10751, 35, 16, 12] },
    { id: 8363, title: "Superbad", year: 2007, lang: "en", poster: "/ek8e8txUyUwd2BNqj6lFEerJfbq.jpg", genreIds: [35] },
    { id: 210577, title: "Gone Girl", year: 2014, lang: "en", poster: "/ts996lKsxvjkO2yiYG0ht4qAicO.jpg", genreIds: [9648, 53, 18] },
    { id: 872585, title: "Oppenheimer", year: 2023, lang: "en", poster: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", genreIds: [18, 36, 10752] },
    { id: 129, title: "Spirited Away", year: 2001, lang: "ja", poster: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", genreIds: [16, 10751, 14] },
    { id: 496243, title: "Parasite", year: 2019, lang: "ko", poster: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", genreIds: [35, 53, 18] },
    { id: 20453, title: "3 Idiots", year: 2009, lang: "hi", poster: "/66A9MqXOyVFCssoloscw79z8Tew.jpg", genreIds: [18, 35] },
    { id: 360814, title: "Dangal", year: 2016, lang: "hi", poster: "/cJRPOLEexI7qp2DKtFfCh7YaaUG.jpg", genreIds: [18, 10751, 35] },
    { id: 19404, title: "Dilwale Dulhania Le Jayenge", year: 1995, lang: "hi", poster: "/lfRkUr7DYdHldAqi3PwdQGBRBPM.jpg", genreIds: [35, 18, 10749] },
    { id: 61202, title: "Zindagi Na Milegi Dobara", year: 2011, lang: "hi", poster: "/hKO9O715wYxjkQSEv47giCYcyO8.jpg", genreIds: [18, 35, 10749] },
    { id: 117691, title: "Gangs of Wasseypur - Part 1", year: 2012, lang: "hi", poster: "/xAy208Znkingmfnb5ZbULwLyIwW.jpg", genreIds: [28, 53, 80] },
    { id: 534780, title: "Andhadhun", year: 2018, lang: "hi", poster: "/dy3K6hNvwE05siGgiLJcEiwgpdO.jpg", genreIds: [80, 9648, 53, 35] },
    { id: 247645, title: "Queen", year: 2014, lang: "hi", poster: "/vKLp0X2RQOuA31R3AdaYtDdKIPK.jpg", genreIds: [35, 18] },
    { id: 19666, title: "Lagaan: Once Upon a Time in India", year: 2001, lang: "hi", poster: "/yNX9lFRAFeNLNRIXdqZK9gYrYKa.jpg", genreIds: [12, 18, 36] },
    { id: 352173, title: "Drishyam", year: 2015, lang: "hi", poster: "/gIClWRv5OSe8rl5Koi0AeUcCZ9Z.jpg", genreIds: [9648, 53, 18, 80] },
    { id: 533991, title: "Stree", year: 2018, lang: "hi", poster: "/euhgW6hpDYw7nxFDjqHn0eKvQPX.jpg", genreIds: [27, 35] },
    { id: 579974, title: "RRR", year: 2022, lang: "te", poster: "/wE0I6efAW4cDDmZQWtwZMOW44EJ.jpg", genreIds: [28, 36, 18] },
    { id: 858485, title: "Kantara", year: 2022, lang: "kn", poster: "/jIsKmkxMzdCZ0Ux1GVSnu8m6Na6.jpg", genreIds: [28, 12, 53] },
];
