import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BuyTickets from '../API/BuyTickets';
import MakePayment from '../API/MakePayment';
import getSeatPlan from '../API/GetSeatPlan';
import getMovieTypes from '../utils/getMovieTypes';
import SeatSelector from './SeatSelector';
import SeatShowcase from './SeatShowcase';
import PaymentModal from './PaymentModal';
import ValidatePromoCode from '../API/ValidatePromoCode';
import { getRecommendedSeats } from '../utils/SeatRecommendationEngine';
import { TOTAL_SEATS } from '../utils/SeatConstants';
import { calculatePricing } from '../utils/PriceCalculations';

function SeatPlan({ movie, selectedSession, user }) {
  const navigate = useNavigate();
  const BASE_URL = process.env.REACT_APP_BASE_URL;

  const [selectedSeats, setSelectedSeats] = useState([]);
  const [successPopupVisible, setSuccessPopupVisible] = useState(false);
  const [recommendedSeat, setRecommendedSeat] = useState(null);
  const [movieSession, setMovieSession] = useState(null);
  const [seatPlan, setSeatPlan] = useState(null);
  const [numSeats, setNumSeats] = useState(1);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoMessage, setPromoMessage] = useState('');
  const [promoError, setPromoError] = useState(false);

  // --- sync selected session ---
  useEffect(() => {
    if (selectedSession) {
      setMovieSession(selectedSession);
      setSelectedSeats([]);
      setRecommendedSeat(null);
    }
  }, [selectedSession]);

  // --- fetch seat plan ---
  useEffect(() => {
    const fetchSeatPlanData = async () => {
      if (!movie?.id || !movieSession?.time) return;
      try {
        const data = await getSeatPlan(movie.id, movieSession);
        setSeatPlan(data);
      } catch (error) {
        console.error('Error fetching seat plan:', error);
      }
    };
    fetchSeatPlanData();
  }, [movie?.id, movieSession]);

  // --- derived values used in JSX ---
  const occupiedSeats = seatPlan || [];
  const isSoldOut = occupiedSeats.length >= TOTAL_SEATS;
  const isAnySeatSelected = selectedSeats.length > 0;
  const selectedSeatText = selectedSeats.map((seat) => seat + 1).join(', ');

  const { subtotal, bookingFee, tax, discount, totalPrice } =
    calculatePricing(selectedSeats, appliedPromo);

  const handleRecommendSeats = () => {
    const recs = getRecommendedSeats(numSeats, occupiedSeats);
    if (!recs) {
      alert(`No ${numSeats} consecutive seats available in a single row!`);
      return;
    }
    setRecommendedSeat(recs);
  };

  const handleApplyPromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoMessage('Please enter a promo code');
      setPromoError(true);
      return;
    }
    const result = await ValidatePromoCode(promoCode.trim().toUpperCase());
    if (result.success) {
      setAppliedPromo(result.data);
      setPromoMessage('Promo code applied!');
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
    e?.preventDefault();
    if (!selectedSeats.length) return;

    const authenticatedId =
      user?.id || user?.userId || localStorage.getItem('userId');

    if (!authenticatedId) {
      alert('Please log in to complete your booking.');
      navigate('/login');
      return;
    }

    try {
      const orderSeats = selectedSeats;
      const updatedOccupiedSeats = [...orderSeats, ...occupiedSeats];

      const movieTypes = getMovieTypes(movie.id);
      const movieCast =
        movie.credits?.cast?.slice(0, 5).map((actor) => actor.name).join(', ') ||
        'N/A';

      const spokenLanguages =
        movie.spoken_languages?.map((lang) => lang.english_name).join(', ') ||
        movie.original_language ||
        'N/A';

      const order = {
        customerId: authenticatedId,
        userName: appliedPromo
          ? `${user?.name} PROMO:${appliedPromo?.code}`
          : user?.name,
        orderDate: new Date().toISOString(),
        seats: updatedOccupiedSeats,
        seat: orderSeats,
        movie: {
          id: movie.id,
          title: movie.title,
          genres: movie.genres.map((genre) => genre.name).join(', '),
          runtime: movie.runtime,
          language: movie.original_language,
          price: movie.price, // make sure movie.price exists in your data
          type: movieTypes.join(', '),
          cast: movieCast,
          spokenLanguages,
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
        userName: appliedPromo
          ? `${order.userName} PROMO:${appliedPromo.code}`
          : order.userName,
      };

      const orderResponse = await BuyTickets(BASE_URL, myOrder);

      if (orderResponse && orderResponse.orderId) {
        setPendingOrder(orderResponse);
        setShowPaymentModal(true);
      } else {
        console.error('Failed to create order');
        alert(
          'Failed to create booking. The seats might have been taken. Please try again.'
        );
      }
    } catch (error) {
      console.error('Order creation error:', error);
      alert(
        'An error occurred while creating your order. Please check your connection.'
      );
    }
  };

  // ✅ MUST be inside SeatPlan
  const handlePaymentConfirm = async (paymentDetails) => {
    if (!pendingOrder) return;

    try {
      const orderId = pendingOrder.orderId;
      const response = await MakePayment(BASE_URL, orderId, paymentDetails);

      if (response && response.success) {
        setShowPaymentModal(false);
        navigate(`/booking-confirmation/${orderId}`);
      } else {
        alert('Payment failed: ' + (response?.message || 'Please try again.'));
      }
    } catch (error) {
      console.error('Payment Error:', error);
      alert('An error occurred during payment.');
    }
  };

  // ✅ return MUST be inside SeatPlan
  return (
    <div className='flex flex-col items-center'>
      <div className='w-full md:w-1/2 lg:w-2/3 px-6'>
        <h2 className='mb-8 text-2xl font-semibold text-center'>
          {isSoldOut ? 'Session Sold Out' : 'Choose your seats'}
        </h2>
      </div>

      {isSoldOut ? (
        <div className='text-center p-10 bg-red-50 rounded-lg border border-red-200'>
          <p className='text-red-600 font-bold text-lg mb-4'>
            No seats available for this session.
          </p>
          <div className='flex flex-col gap-3'>
            <button
              onClick={() => navigate(-1)}
              className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-semibold'
            >
              Return to Movie List
            </button>
            <p className='text-sm text-gray-500'>Or try selecting a different time</p>
          </div>
        </div>
      ) : (
        <div className='CinemaPlan w-full flex flex-col items-center'>
          <SeatSelector
            movie={{ occupied: occupiedSeats }}
            selectedSeats={selectedSeats}
            recommendedSeat={recommendedSeat}
            numSeats={numSeats}
            setNumSeats={setNumSeats}
            handleRecommendSeats={handleRecommendSeats}
            onSelectedSeatsChange={(seats) => setSelectedSeats(seats)}
            onRecommendedSeatChange={(seat) => setRecommendedSeat(seat)}
          />

          <SeatShowcase />

          <p className='info mb-2 text-sm md:text-sm lg:text-base'>
            You have selected{' '}
            <span className='count font-semibold'>{selectedSeats.length}</span>{' '}
            seat{selectedSeats.length !== 1 ? 's' : ''}
            {selectedSeats.length > 0 && ':'}{' '}
            <span className='selected-seats font-semibold'>{selectedSeatText}</span>
          </p>

          {isAnySeatSelected && (
            <div className='mt-4 w-full max-w-md bg-white p-4 rounded-lg border shadow-sm'>
              <div className='space-y-1 text-sm border-b pb-3 mb-3'>
                <div className='flex justify-between'>
                  <span>Subtotal:</span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Booking Fee (10%):</span>
                  <span>€{bookingFee.toFixed(2)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Tax (10%):</span>
                  <span>€{tax.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className='flex justify-between text-green-600 font-medium'>
                    <span>Discount ({appliedPromo?.code}):</span>
                    <span>-€{discount.toFixed(2)}</span>
                  </div>
                )}
                <div className='flex justify-between font-bold text-lg pt-2 mt-2 border-t'>
                  <span>Total:</span>
                  <span className='text-blue-600'>€{totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <div className='my-4'>
                <div className='flex gap-2'>
                  <input
                    type='text'
                    placeholder='PROMO CODE'
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    disabled={appliedPromo !== null}
                    className='flex-1 px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none'
                  />
                  {appliedPromo ? (
                    <button
                      onClick={handleRemovePromoCode}
                      className='bg-red-500 text-white rounded px-4 py-2 text-xs font-bold'
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={handleApplyPromoCode}
                      className='bg-blue-500 text-white rounded px-4 py-2 text-xs font-bold'
                    >
                      Apply
                    </button>
                  )}
                </div>
                {promoMessage && (
                  <p className={`mt-2 text-xs ${promoError ? 'text-red-500' : 'text-green-600'}`}>
                    {promoMessage}
                  </p>
                )}
              </div>

              <button
                className='w-full bg-green-500 hover:bg-green-600 text-white rounded-lg py-3 font-bold transition-all shadow-lg active:transform active:scale-95'
                onClick={handleButtonClick}
              >
                Confirm & Pay €{totalPrice.toFixed(2)}
              </button>
            </div>
          )}

          {!isAnySeatSelected && (
            <p className='info text-sm text-gray-400 italic mt-4'>
              Please select a seat to see pricing
            </p>
          )}
        </div>
      )}

      {successPopupVisible && (
        <div className='bg-green-500 text-white px-6 py-3 rounded-full fixed bottom-10 shadow-2xl animate-bounce z-50'>
          Order Successful!
        </div>
      )}

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePaymentConfirm}
        priceBreakdown={{
          subtotal,
          bookingFee,
          tax,
          discount,
          total: totalPrice,
        }}
      />
    </div>
  );
}

export default SeatPlan;
