import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BuyTickets from '../API/BuyTickets';
import MakePayment from '../API/MakePayment';
import getSeatPlan from '../API/GetSeatPlan';
import updateSeatsInHall from '../API/UpdateSeatsInHall';
import generateRandomOccupiedSeats from '../utils/GenerateRandomOccupiedSeats';
import getMovieTypes from '../utils/getMovieTypes';
import SeatSelector from './SeatSelector';
import SeatShowcase from './SeatShowcase';
import PaymentModal from './PaymentModal';
import ValidatePromoCode from '../API/ValidatePromoCode';

const movies = [
  {
    title: '',
    price: 10,
    occupied: generateRandomOccupiedSeats(1, 64, 64),
  },
];

function SeatPlan({ movie, selectedSession }) {
  const BASE_URL = "http://localhost:8080/api/v1";


  const [selectedSeats, setSelectedSeats] = useState([]);
  const [successPopupVisible, setSuccessPopupVisible] = useState(false);
  const [recommendedSeat, setRecommendedSeat] = useState(null);
  const navigate = useNavigate();
  const [movieSession, setMovieSession] = useState(null);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');

  const [seatPlan, setSeatPlan] = useState(null);
  
  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoMessage, setPromoMessage] = useState('');
  const [promoError, setPromoError] = useState(false);

  useEffect(() => {
    const handleStorageChange = () => {
      const storedMovieSession = JSON.parse(localStorage.getItem('movieSession'));
      if (storedMovieSession) {
        setMovieSession(storedMovieSession);
        // Reset selected seats when session changes
        setSelectedSeats([]);
        setRecommendedSeat(null);
      }
    };

    // Use selectedSession prop if provided, otherwise fall back to localStorage
    if (selectedSession) {
      setMovieSession(selectedSession);
      setSelectedSeats([]);
      setRecommendedSeat(null);
    } else {
      handleStorageChange();
    }

    // Listen for storage changes from other components
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [selectedSession]);

  useEffect(() => {
    const fetchSeatPlan = async () => {
      try {
        if (movieSession && movieSession.time) {
          const data = await getSeatPlan(movie.id, movieSession);
          setSeatPlan(data);
        }
      } catch (error) {
        console.error('Error fetching seat plan:', error);
      }
    };

    if (movieSession) {
      fetchSeatPlan();
    }
  }, [movie.id, movieSession]);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    if (storedUser) {
      setUserName(storedUser.userName);
      setUserId(storedUser.userId);
    }
  }, []);

  const occupiedSeats =
    seatPlan && seatPlan.length > 0 ? seatPlan : movies[0].occupied;

  const availableSeats = [27, 28, 29, 30, 35, 36, 37, 38, 43, 44, 45, 46];

  const filteredAvailableSeats = availableSeats.filter(
    (seat) => !occupiedSeats.includes(seat),
  );

  useEffect(() => {
    let recommended = null;
    for (let i = 0; i < filteredAvailableSeats.length; i++) {
      const seat = filteredAvailableSeats[i];
      if (!occupiedSeats.includes(seat)) {
        recommended = seat;
        break;
      }
    }
    setRecommendedSeat(recommended);
  }, [filteredAvailableSeats, occupiedSeats]);

  let selectedSeatText = '';
  if (selectedSeats.length > 0) {
    selectedSeatText = selectedSeats.map((seat) => seat + 1).join(', ');
  }

  // Calculate price breakdown (matching backend UC-18 logic)
  const basePrice = movies[0].price;
  const seatCount = selectedSeats.length;
  const subtotal = basePrice * seatCount;
  const bookingFee = subtotal * 0.10; // 10% booking fee
  
  // Apply discount if promo code is valid
  let discount = 0;
  if (appliedPromo) {
    if (appliedPromo.discountType === 'PERCENTAGE') {
      discount = (subtotal * appliedPromo.discountValue) / 100;
    } else if (appliedPromo.discountType === 'FIXED_AMOUNT') {
      discount = appliedPromo.discountValue;
    }
  }
  
  // Calculate tax on (subtotal + booking fee - discount) to match backend
  const taxableAmount = subtotal + bookingFee - discount;
  const tax = taxableAmount * 0.10; // 10% tax
  
  const totalPrice = subtotal + bookingFee + tax - discount;

  const isAnySeatSelected = selectedSeats.length > 0;

  // Handle promo code validation
  const handleApplyPromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoMessage('Please enter a promo code');
      setPromoError(true);
      return;
    }

    const result = await ValidatePromoCode(promoCode.trim().toUpperCase());
    
    if (result.success) {
      setAppliedPromo(result.data);
      setPromoMessage(`Promo code applied! ${result.data.discountType === 'PERCENTAGE' ? result.data.discountValue + '% off' : '€' + result.data.discountValue + ' off'}`);
      setPromoError(false);
    } else {
      setAppliedPromo(null);
      setPromoMessage(result.message);
      setPromoError(true);
    }
  };

  const handleRemovePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoMessage('');
    setPromoError(false);
  };

  const handleButtonClick = async (e) => {
    e.preventDefault();
    const isAnySeatSelected = selectedSeats.length > 0;

    if (isAnySeatSelected) {
      const orderSeats = selectedSeats;
      const updatedOccupiedSeats = [...orderSeats, ...occupiedSeats];
      const movieTypes = getMovieTypes(movie.id);
      const movieCast = movie.credits?.cast
        ?.slice(0, 5)
        .map((actor) => actor.name)
        .join(', ') || 'N/A';
      const spokenLanguages = movie.spoken_languages
        ?.map((lang) => lang.english_name)
        .join(', ') || movie.original_language || 'N/A';

      const order = {
        customerId: userId || Math.floor(Math.random() * 1000000),
        userName: userName || '',
        orderDate: new Date().toISOString(),
        seats: [...orderSeats, ...occupiedSeats],
        seat: orderSeats,
        movie: {
          id: movie.id,
          title: movie.title,
          genres: movie.genres.map((genre) => genre.name).join(', '),
          runtime: movie.runtime,
          language: movie.original_language,
          price: movies[0].price,
          type: movieTypes.join(', '),
          cast: movieCast,
          spokenLanguages: spokenLanguages,
        },
      };

      const myOrder = {
        customerId: order.customerId,
        orderDate: order.orderDate,
        movieId: order.movie.id,
        movieTitle: order.movie.title,
        movieGenres: order.movie.genres,
        movieRuntime: order.movie.runtime,
        movieLanguage: order.movie.language,
        movieSession: movieSession.time,
        moviePrice: order.movie.price,
        movieType: order.movie.type,
        movieCast: order.movie.cast,
        spokenLanguages: order.movie.spokenLanguages,
        seat: order.seat,
        userName: appliedPromo ? `${order.userName} PROMO:${appliedPromo.code}` : order.userName,
      };

      // Backend handles seat reservation, so we don't need to call updateSeatsInHall
      // The order creation endpoint will reserve seats automatically
      const orderResponse = await BuyTickets(BASE_URL, myOrder);
      
      if (orderResponse && orderResponse.orderId) {
        // Order created successfully with PENDING status
        // Show payment modal for user to choose payment method
        setPendingOrder(orderResponse);
        setShowPaymentModal(true);
      } else {
        console.error('Failed to create order');
        alert('Failed to create booking. Please try again.');
      }
    }
  };

  // Handle payment confirmation from modal
  const handlePaymentConfirm = async (paymentDetails) => {
    if (!pendingOrder) return;

    const orderId = pendingOrder.orderId;
    
    // Process payment with selected method
    const paymentResponse = await MakePayment(BASE_URL, orderId, paymentDetails);
    
    if (paymentResponse && paymentResponse.success) {
      // Payment successful - booking confirmed
      console.log('Payment successful:', paymentResponse);
      setShowPaymentModal(false);
      
      // Navigate to confirmation page instead of showing popup
      navigate(`/booking-confirmation/${orderId}`);
    } else {
      // Payment failed
      console.error('Payment failed:', paymentResponse);
      setShowPaymentModal(false);
      alert('Payment failed: ' + (paymentResponse?.message || 'Unknown error. Please try again.'));
    }
  };

  return (
    <div className='flex flex-col items-center'>
      <div className='w-full md:w-1/2 lg:w-2/3 px-6'>
        <h2 className='mb-8 text-2xl font-semibold text-center'>
          Choose your seats by clicking on the available seats
        </h2>
      </div>

      <div className='CinemaPlan'>
        <SeatSelector
          movie={{ ...movies[0], occupied: occupiedSeats }}
          selectedSeats={selectedSeats}
          recommendedSeat={recommendedSeat}
          onSelectedSeatsChange={(selectedSeats) =>
            setSelectedSeats(selectedSeats)
          }
          onRecommendedSeatChange={(recommendedSeat) =>
            setRecommendedSeat(recommendedSeat)
          }
        />
        <SeatShowcase />

        <p className='info mb-2 text-sm md:text-sm lg:text-base'>
          You have selected{' '}
          <span className='count font-semibold'>{selectedSeats.length}</span>{' '}
          seat{selectedSeats.length !== 1 ? 's' : ''}
          {selectedSeats.length === 0 ? '' : ':'}{' '}
          {selectedSeatText ? (
            <span className='selected-seats font-semibold'>
              {' '}
              {selectedSeatText}
            </span>
          ) : (
            <span></span>
          )}{' '}
          {selectedSeats.length > 0 && (
            <div className='mt-4 text-sm'>
              <div className='flex justify-between mb-1'>
                <span>Subtotal ({seatCount} × €{basePrice.toFixed(2)}):</span>
                <span>€{subtotal.toFixed(2)}</span>
              </div>
              <div className='flex justify-between mb-1'>
                <span>Booking Fee (10%):</span>
                <span>€{bookingFee.toFixed(2)}</span>
              </div>
              <div className='flex justify-between mb-1'>
                <span>Tax (10%):</span>
                <span>€{tax.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className='flex justify-between mb-1 text-green-600'>
                  <span>Discount ({appliedPromo.code}):</span>
                  <span>-€{discount.toFixed(2)}</span>
                </div>
              )}
              <div className='flex justify-between font-bold text-base border-t pt-2 mt-2'>
                <span>Total:</span>
                <span className='total'>€{totalPrice.toFixed(2)}</span>
              </div>
            </div>
          )}
        </p>

        {/* Promo Code Section */}
        {isAnySeatSelected && (
          <div className='my-4 w-full max-w-md'>
            <div className='flex gap-2'>
              <input
                type='text'
                placeholder='Enter promo code'
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                disabled={appliedPromo !== null}
                className='flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
              />
              {appliedPromo ? (
                <button
                  onClick={handleRemovePromoCode}
                  className='bg-red-500 hover:bg-red-700 text-white rounded px-4 py-2 text-sm font-semibold'
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={handleApplyPromoCode}
                  className='bg-blue-500 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-semibold'
                >
                  Apply
                </button>
              )}
            </div>
            {promoMessage && (
              <p className={`mt-2 text-sm ${promoError ? 'text-red-500' : 'text-green-600'}`}>
                {promoMessage}
              </p>
            )}
          </div>
        )}

        {isAnySeatSelected ? (
          <div>
            <button
              className='bg-green-500 hover:bg-green-700 text-white rounded px-3 py-2 text-sm font-semibold cursor-pointer'
              onClick={handleButtonClick}
            >
              Buy at <span className='total font-semibold'>€{totalPrice.toFixed(2)}</span>
            </button>
          </div>
        ) : (
          <div>
            <p className='info text-sm md:text-sm lg:text-base'>
              Please select a seat
            </p>
          </div>
        )}

        {successPopupVisible && (
          <div className='bg-green-500 text-white px-4 py-2 text-sm md:text-sm lg:text-base rounded absolute bottom-1/2 mb-8 mr-8 flex justify-center'>
            Order Successful
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePaymentConfirm}
        priceBreakdown={pendingOrder?.priceBreakdown}
      />
    </div>
  );
}

export default SeatPlan;
