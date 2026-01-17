import React from 'react';

function SeatShowcase() {
  return (
    <div className='flex flex-col gap-4 my-6'>
      {/* SEAT STATUS LEGEND */}
      <div className='border-b pb-4'>
        <p className='text-xs font-bold text-gray-500 uppercase mb-2 text-center'>Status</p>
        <ul className='ShowCase flex justify-center gap-6'>
          <li>
            <span className='seat recommended' /> <small>Recommended</small>
          </li>
          <li>
            <span className='seat selected' /> <small>Selected</small>
          </li>
          <li>
            <span className='seat occupied' /> <small>Occupied</small>
          </li>
        </ul>
      </div>

      {/* SEAT TYPE LEGEND */}
      <div>
        <p className='text-xs font-bold text-gray-500 uppercase mb-2 text-center'>Seat Types</p>
        <ul className='ShowCase flex flex-wrap justify-center gap-6'>
          <li>
            <span className='seat normal' /> <small>Normal (€10)</small>
          </li>
          <li>
            <span className='seat premium' /> <small>Premium (€15)</small>
          </li>
          <li>
            <span className='seat vip' /> <small>VIP (€25)</small>
          </li>
          <li>
            <span className='seat couple' /> <small>Couple (€30)</small>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default SeatShowcase;