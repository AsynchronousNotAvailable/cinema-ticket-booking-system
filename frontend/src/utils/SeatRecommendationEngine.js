// src/utils/RecommendationEngine.js
import { ROW_PREFERENCE, SEATS_ARRAY } from './SeatConstants';

export const getRecommendedSeats = (numSeats, occupiedSeats) => {
  if (!occupiedSeats || !Array.isArray(occupiedSeats)) {
    return null; 
  }
  if (!numSeats || numSeats < 1) return null;

  const getCenterOffset = (startIndex) => {
    const selectionCenter = startIndex + (numSeats - 1) / 2;
    const theaterCenter = (8 - 1) / 2; // based on 8 cols
    return Math.abs(selectionCenter - theaterCenter);
  };

  let bestRecommended = null;

  for (let row of ROW_PREFERENCE) {
    const rowStart = row * 8;
    const allRowSeats = SEATS_ARRAY.slice(rowStart, rowStart + 8);
    let possibleInRow = [];

    for (let i = 0; i <= 8 - numSeats; i++) {
      const slice = allRowSeats.slice(i, i + numSeats);
      if (slice.every(seat => !occupiedSeats.includes(seat))) {
        possibleInRow.push({ seats: slice, offset: getCenterOffset(i) });
      }
    }

    if (possibleInRow.length > 0) {
      possibleInRow.sort((a, b) => a.offset - b.offset);
      bestRecommended = possibleInRow[0].seats;
      break;
    }
  }
  return bestRecommended;
};