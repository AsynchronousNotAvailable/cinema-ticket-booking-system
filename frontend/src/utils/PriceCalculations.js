import { ALL_SEATS_DATA } from './SeatConstants';

export const calculatePricing = (selectedSeats, appliedPromo) => {
  const subtotal = selectedSeats.reduce((sum, seatId) => {
    const seatObj = ALL_SEATS_DATA.find(s => s.id === seatId);
    return sum + (seatObj ? seatObj.price : 0);
  }, 0);

  const bookingFee = subtotal * 0.10;
  let discount = 0;
  if (appliedPromo) {
    discount = appliedPromo.discountType === 'PERCENTAGE' 
      ? (subtotal * appliedPromo.discountValue) / 100 
      : appliedPromo.discountValue;
  }
  const taxableAmount = subtotal + bookingFee - discount;
  const tax = taxableAmount * 0.10;
  const totalPrice = subtotal + bookingFee + tax - discount;

  return { subtotal, bookingFee, tax, discount, totalPrice };
};