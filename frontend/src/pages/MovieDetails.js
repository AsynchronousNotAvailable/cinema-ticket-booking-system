import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import FetchMovieDetails from '../API/GetMovieDetails';
import MovieSessions from '../mockData/MovieSessions';
import SeatPlan from '../components/SeatPlan';
import formatDate from '../utils/formatDate';
import formatRuntime from '../utils/formatRuntime';
import getMovieTypes from '../utils/getMovieTypes';
import GetSeatPlan from '../API/GetSeatPlan';
import GetBookingHistory from '../API/GetBookingHistory';
import { isLoggedIn } from '../utils/Auth';

// total seats in your seat map: 8 x 8 = 64
const TOTAL_SEATS = 64;

// Convert "09:15 AM" or "21:15" into hour number
function getHourFromTimeString(timeStr) {
  if (!timeStr) return 12;
  const t = String(timeStr).trim();

  // 12-hour format: "09:15 AM"
  const match12 = t.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const ampm = match12[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour;
  }

  // 24-hour format: "21:15"
  const match24 = t.match(/(\d{1,2}):(\d{2})/);
  if (match24) return parseInt(match24[1], 10);

  return 12;
}


function timeToSlot(timeStr) {
  const hour = getHourFromTimeString(timeStr);
  if (hour < 12) return 'MORNING';
  if (hour < 17) return 'AFTERNOON';
  if (hour < 22) return 'EVENING';
  return 'LATE';
}

function crowdLabel(occupiedCount) {
  if (occupiedCount <= 10) return 'Low';
  if (occupiedCount <= 30) return 'Medium';
  return 'High';
}

function mostCommonSlot(sessionTimes) {
  const counts = { MORNING: 0, AFTERNOON: 0, EVENING: 0, LATE: 0 };
  for (const t of sessionTimes) {
    const slot = timeToSlot(t);
    counts[slot] += 1;
  }

  let best = 'EVENING';
  let bestCount = -1;
  for (const key of Object.keys(counts)) {
    if (counts[key] > bestCount) {
      bestCount = counts[key];
      best = key;
    }
  }
  return bestCount > 0 ? best : null;
}

const MovieDetails = () => {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);

  const [selectedSession, setSelectedSession] = useState(null);
  const [movieSessions, setMovieSessions] = useState([]);

  // NEW
  const [recommendedSession, setRecommendedSession] = useState(null);
  const [sessionAnalytics, setSessionAnalytics] = useState({}); // time -> info

  const API_KEY = process.env.REACT_APP_API_KEY || '';

  useEffect(() => {
    const fetchData = async () => {
      const movieData = await FetchMovieDetails(id, API_KEY);
      setMovie(movieData);
    };
    fetchData();
  }, [id, API_KEY]);

  // Generate sessions
  useEffect(() => {
    if (movie) {
      const sessions = MovieSessions(movie, 0);
      setMovieSessions(sessions);

      // If user already selected a session before, keep it
      const storedSession = JSON.parse(localStorage.getItem('movieSession'));
      if (storedSession && storedSession.movieId === movie.id) {
        setSelectedSession(storedSession);
      }
    }
  }, [movie]);

  // NEW: Recommend best session using analytics
  useEffect(() => {
    let cancelled = false;

    const runRecommendation = async () => {
      if (!movie || movieSessions.length === 0) return;

      // 1) User preference based on their booking history
      const user = isLoggedIn();
      let preferredSlot = null;

      if (user?.userId) {
        const history = await GetBookingHistory(user.userId);
        if (history.success && history.bookings && history.bookings.length > 0) {
          const sessionTimes = history.bookings
            .map((b) => b.movieSession)
            .filter(Boolean);
          preferredSlot = mostCommonSlot(sessionTimes);
        }
      }

      // 2) Crowd + availability for each session (from backend seat plan)
      const analyticsList = await Promise.all(
        movieSessions.map(async (s) => {
          let occupiedSeats = [];
          try {
            occupiedSeats = (await GetSeatPlan(movie.id, s.time)) || [];

          } catch (e) {
            occupiedSeats = [];
          }

          const occupiedCount = occupiedSeats.length;
          const availableCount = TOTAL_SEATS - occupiedCount;

          const slot = timeToSlot(s.time);

          // Score rules (simple and explainable)
          // - availabilityScore: more seats left = better
          // - preferenceBonus: if matches user preferred time slot
          const availabilityScore = availableCount / TOTAL_SEATS; // 0..1
          const preferenceBonus =
            preferredSlot && slot === preferredSlot ? 0.35 : 0;

          const score = 0.65 * availabilityScore + preferenceBonus;

          return {
            time: s.time,
            language: s.language,
            occupiedCount,
            availableCount,
            crowd: crowdLabel(occupiedCount),
            slot,
            score,
            preferredSlot,
          };
        }),
      );

      if (cancelled) return;

      // Save analytics map for showing on UI
      const map = {};
      for (const item of analyticsList) {
        map[item.time] = item;
      }
      setSessionAnalytics(map);

      // 3) pick best session
      analyticsList.sort((a, b) => b.score - a.score);
      const best = analyticsList[0];
      if (!best) return;

      const bestSessionRaw = movieSessions.find((s) => s.time === best.time);
      if (!bestSessionRaw) return;

      const bestSession = { ...bestSessionRaw, movieId: movie.id };

      setRecommendedSession(bestSession);

      // Auto-select recommended ONLY if user has not selected anything yet
      if (!selectedSession) {
        setSelectedSession(bestSession);
        localStorage.setItem('movieSession', JSON.stringify(bestSession));
      }
    };

    runRecommendation();

    return () => {
      cancelled = true;
    };
  }, [movie, movieSessions, selectedSession]);

  const handleSessionSelect = (session) => {
    const sessionData = { ...session, movieId: movie.id };
    setSelectedSession(sessionData);
    localStorage.setItem('movieSession', JSON.stringify(sessionData));
  };

  if (!movie) return <div>Loading...</div>;

  const movieTypes = getMovieTypes(movie.id);
  const topCast = movie.credits?.cast?.slice(0, 5) || [];

  const recommendedInfo =
    recommendedSession && sessionAnalytics[recommendedSession.time]
      ? sessionAnalytics[recommendedSession.time]
      : null;

  return (
    <div>
      <div className='container mx-auto px-4 py-8'>
        <div className='max-w-5xl mx-auto'>
          <div className='flex flex-wrap justify-center items-start'>
            <div className='w-full md:w-1/2 lg:w-1/3 flex justify-center mb-8 md:mb-0'>
              <img
                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                alt={movie.title}
                className='w-full h-auto rounded'
              />
            </div>

            <div className='w-full md:w-1/2 lg:w-2/3 px-6 text-left'>
              <h2 className='text-3xl font-semibold'>{movie.title}</h2>

              <div className='flex flex-wrap gap-2 mt-2 mb-4'>
                {movieTypes.map((type) => (
                  <span
                    key={type}
                    className='text-xs bg-blue-500 text-white px-2 py-1 rounded'
                  >
                    {type}
                  </span>
                ))}
              </div>

              <p className='text-gray-800 mt-2 text-justify text-sm md:text-sm lg:text-base'>
                {movie.overview}
              </p>

              <p className='text-gray-800 mt-2 text-sm md:text-sm lg:text-base'>
                <b>Genres:</b> {movie.genres.map((g) => g.name).join(', ')}
              </p>

              <p className='text-gray-800 mt-1 text-sm md:text-sm lg:text-base'>
                <b>Runtime:</b> {formatRuntime(movie.runtime)}
              </p>

              <p className='text-gray-800 mt-1 text-sm md:text-sm lg:text-base'>
                <b>Rating:</b> {movie.vote_average.toFixed(1)}
              </p>

              <p className='text-gray-800 mt-2 text-sm md:text-sm lg:text-base'>
                <b>Release Date:</b> {formatDate(movie.release_date)}
              </p>

              {topCast.length > 0 && (
                <p className='text-gray-800 mt-2 text-sm md:text-sm lg:text-base'>
                  <b>Cast:</b> {topCast.map((a) => a.name).join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className='container mx-auto px-4 py-8'>
        <div className='max-w-3xl mx-auto'>
          <h2 className='text-2xl font-semibold mb-2'>Select a Showtime</h2>

          {/* NEW: show recommendation message */}
          {recommendedInfo && (
            <div className='mb-4 p-3 rounded border bg-green-50 border-green-300 text-sm'>
              <b>Recommended Showtime:</b> {recommendedInfo.time}{' '}
              <span className='ml-2'>
                ({recommendedInfo.crowd} crowd, {recommendedInfo.availableCount}{' '}
                seats left)
              </span>
              {recommendedInfo.preferredSlot && (
                <div className='mt-1 text-xs text-gray-700'>
                  Based on your booking history preference: {recommendedInfo.preferredSlot}
                </div>
              )}
            </div>
          )}

          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'>
            {movieSessions.map((session, index) => {
              const isRecommended =
                recommendedSession && recommendedSession.time === session.time;
              const analytics = sessionAnalytics[session.time];

              return (
                <button
                  key={index}
                  onClick={() => handleSessionSelect(session)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedSession?.time === session.time
                      ? 'border-red-500 bg-red-100'
                      : isRecommended
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-red-500'
                  }`}
                >
                  <div className='flex items-center justify-between'>
                    <div className='text-lg font-semibold text-gray-800'>
                      {session.time}
                    </div>
                    {isRecommended && (
                      <span className='text-xs px-2 py-1 rounded bg-green-600 text-white'>
                        Recommended
                      </span>
                    )}
                  </div>

                  <div className='text-sm text-gray-600 mt-1'>
                    {session.language}
                  </div>

                  {/* NEW: show analytics per session */}
                  <div className='text-xs text-gray-700 mt-2'>
                    {analytics ? (
                      <>
                        {analytics.crowd} crowd • {analytics.availableCount} seats left
                      </>
                    ) : (
                      <>Checking crowd…</>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedSession && (
        <SeatPlan movie={movie} selectedSession={selectedSession} />
      )}
    </div>
  );
};

export default MovieDetails;

