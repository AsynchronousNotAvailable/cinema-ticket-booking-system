import React, { useEffect, useState } from 'react';

const seats = Array.from({ length: 8 * 8 }, (_, i) => i);

function SeatSelector({
  movie,
  selectedSeats,
  recommendedSeat,
  numSeats,
  setNumSeats,
  handleRecommendSeats,
  onSelectedSeatsChange,
  onRecommendedSeatChange,
}) {
  const [sessionTime, setSessionTime] = useState(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('movieSession'));
    if (stored?.time) setSessionTime(stored.time);
  }, []);

  const handleSelectedState = (seat) => {
    const isSelected = selectedSeats.includes(seat);
    onSelectedSeatsChange(isSelected
      ? selectedSeats.filter(s => s !== seat)
      : [...selectedSeats, seat]
    );

    onRecommendedSeatChange(null);
  };

  const handleFullReset = () => {
    onSelectedSeatsChange([]);
    onRecommendedSeatChange(null);
  };

  const handleApplyRecommendation = () => {
    if (recommendedSeat) {
      onSelectedSeatsChange(recommendedSeat);
      onRecommendedSeatChange(null);
    }
  };

  return (
    <div className='Cinema'>
      {sessionTime && <p className='info'>Session: {sessionTime}</p>}
      <div className='screen' />

      {/* Seat selection controls */}
      <div className='flex items-center gap-2 mb-4 h-10'> {/* Added fixed height h-10 */}
        <label className='text-sm font-bold whitespace-nowrap'>Seats:</label>
        <input
          type='number'
          min="1"
          max="8"
          value={numSeats}
          onChange={(e) => setNumSeats(Number(e.target.value))}
          className='border w-12 px-1 rounded text-center h-8'
        />

        <button
          onClick={handleRecommendSeats}
          className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-semibold h-8 whitespace-nowrap'
        >
          Recommend
        </button>

        {/* Using an invisible placeholder or conditional rendering with fixed width */}
        <div className="flex items-center min-w-fit">
          {recommendedSeat ? (
            <button
              onClick={handleApplyRecommendation}
              className='bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-semibold animate-pulse h-8 whitespace-nowrap'
            >
              Apply
            </button>
          ) : (
            <div className="w-0" />
          )}
        </div>

        <button
          onClick={handleFullReset}
          className='bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm font-semibold h-8 whitespace-nowrap'
        >
          Reset
        </button>
      </div>

      <div className='seats grid grid-cols-8 gap-2'>
        {seats.map((seat) => {
          const isSelected = selectedSeats.includes(seat);
          const isOccupied = movie.occupied.includes(seat);
          const isRec = Array.isArray(recommendedSeat) && recommendedSeat.includes(seat);

          let typeClass = 'normal';
          if (seat < 8) {
            typeClass = 'premium';
          } else if ([27, 28, 35, 36].includes(seat)) {
            typeClass = 'vip';
          } else if (seat >= 56) {
            typeClass = 'couple';
          }

          return (
            <span
              key={seat}
              // We add the typeClass here so the CSS can color it
              className={`seat ${typeClass} ${isSelected ? 'selected' : ''} 
          ${isOccupied ? 'occupied' : ''} 
          ${isRec ? 'recommended' : ''}`}
              onClick={isOccupied ? null : () => handleSelectedState(seat)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SeatSelector;