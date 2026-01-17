// src/utils/SeatConstants.js
export const TOTAL_SEATS = 64;
export const SEATS_ARRAY = Array.from({ length: TOTAL_SEATS }, (_, i) => i);

export const ALL_SEATS_DATA = Array.from({ length: TOTAL_SEATS }, (_, i) => {
  let type = 'NORMAL';
  let price = 10;

  if ([27, 28, 35, 36].includes(i)) {
    type = 'VIP';
    price = 25;
  } else if (i >= 56) {
    type = 'COUPLE'; // Back row
    price = 30;
  } else if (i < 8) {
    type = 'PREMIUM'; // Front row
    price = 15;
  }
  return { id: i, type, price };
});

export const ROW_PREFERENCE = [4, 3, 5, 2, 6, 1, 7, 0];