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
import { getRecommendedSeats } from '../utils/SeatRecommendationEngine';
import { TOTAL_SEATS, ALL_SEATS_DATA } from '../utils/SeatConstants';
import { calculatePricing } from '../utils/PriceCalculations';

function SeatPlan({ movie, selectedSession, user }) {
  const BASE_URL = process.env.REACT_APP_BASE_URL;
  const navigate = useNavigate();

  // --- STATE ---
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

  // --- DATA FETCHING & SYNC ---
  useEffect(() => {
    if (selectedSession) {
      setMovieSession(selectedSession);
      setSelectedSeats([]);
      setRecommendedSeat(null);
    }
  }, [selectedSession]);

  useEffect(() => {
    const fetchSeatPlanData = async () => {
      if (movieSession?.time) {
        try {
          const data = await getSeatPlan(movie.id, movieSession);
          setSeatPlan(data);
        } catch (error) {
          console.error('Error fetching seat plan:', error);
        }
      }
    };
    fetchSeatPlanData();
  }, [movie.id, movieSession]);

  // Polling for updates every 5s (Scenario 4.1: Background Refresh)
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      if (movieSession?.time && !showPaymentModal) {
        try {
          const latestData = await getSeatPlan(movie.id, movieSession);
          const takenSeats = selectedSeats.filter(seat => latestData.includes(seat));

          if (takenSeats.length > 0) {
            alert(`Seat ${takenSeats.map(s => s + 1).join(', ')} no longer available.`);
            setSelectedSeats(prev => prev.filter(s => !latestData.includes(s)));
            setRecommendedSeat(null);
          }
          setSeatPlan(latestData);
        } catch (e) { console.error(e); }
      }
    }, 5000);
    return () => clearInterval(refreshInterval);
  }, [movie.id, movieSession, selectedSeats, showPaymentModal]);

  const occupiedSeats = seatPlan || [];
  const isSoldOut = occupiedSeats.length >= TOTAL_SEATS;
  const isAnySeatSelected = selectedSeats.length > 0;
  const selectedSeatText = selectedSeats.map((seat) => seat + 1).join(', ');

  const { subtotal, bookingFee, tax, discount, totalPrice } = calculatePricing(selectedSeats, appliedPromo);

  const handleRecommendSeats = () => {
    // Uses the sophisticated logic from your utility file
    const recs = getRecommendedSeats(numSeats, occupiedSeats);
    if (!recs) {
      alert(`No ${numSeats} consecutive seats available in a single row!`);
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
      setPromoMessage(`Promo code applied!`);
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
    if (e) e.preventDefault(); // Prevent form submission if triggered by a button in a form

    // 1. Validate Selection
    if (selectedSeats.length === 0) {
      alert("Please select at least one seat.");
      return;
    }

    // 2. Authentication Check
    const authId = user?.id || user?.userId || localStorage.getItem('userId');
    if (!authId) {
      alert("Please log in to complete your booking.");
      return navigate('/login');
    }

    // 3. Prepare Detailed Data (Keeping all your original fields)
    const movieTypes = getMovieTypes(movie.id);
    const movieCast = movie.credits?.cast
      ?.slice(0, 5)
      .map((actor) => actor.name)
      .join(', ') || 'N/A';

    const spokenLanguages = movie.spoken_languages
      ?.map((lang) => lang.english_name)
      .join(', ') || movie.original_language || 'N/A';

    // 4. Construct the Payload (Merging your original structure with updated total)
    const myOrder = {
      customerId: authId,
      userName: appliedPromo ? `${user?.name} PROMO:${appliedPromo.code}` : user?.name,
      orderDate: new Date().toISOString(),
      movieId: movie.id,
      movieTitle: movie.title,
      movieGenres: movie.genres.map((genre) => genre.name).join(', '),
      movieRuntime: movie.runtime,
      movieLanguage: movie.original_language,
      movieSession: movieSession.time,
      moviePrice: movie.price || 10, 
      movieType: movieTypes.join(', '),
      movieCast: movieCast,
      spokenLanguages: spokenLanguages,
      seat: selectedSeats, 
      totalPrice: totalPrice, 
    };
    console.log('Order Payload:', myOrder);

    try {
      const orderResponse = await BuyTickets(BASE_URL, myOrder);

      if (orderResponse && orderResponse.orderId) {
        // Success: Order created with PENDING status
        setPendingOrder(orderResponse);
        setShowPaymentModal(true);
      } else {
        // Failure: Check for specific error message from backend
        console.error('Failed to create order:', orderResponse);
        const errorMessage = orderResponse?.message || 
                           orderResponse?.error || 
                           'Failed to create booking. The seats might have been taken. Please try again.';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Order creation error:', error);
      alert('An error occurred while creating your order. Please check your connection.');
    }
  };

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
      console.error("Payment Error:", error);
      alert("An error occurred during payment.");
    }
  };

  return (
    <div className='flex flex-col items-center'>
      {/* Header Section */}
      <div className='w-full md:w-1/2 lg:w-2/3 px-6'>
        <h2 className='mb-8 text-2xl font-semibold text-center'>
          {isSoldOut ? "Session Sold Out" : "Choose your seats"}
        </h2>
      </div>

      {isSoldOut ? (
        /* Sold Out State */
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
        /* Active Booking State */
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

          {/* Pricing Summary & Promo Section */}
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

              {/* Promo Code Input */}
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
                    <button onClick={handleRemovePromoCode} className='bg-red-500 text-white rounded px-4 py-2 text-xs font-bold'>
                      Remove
                    </button>
                  ) : (
                    <button onClick={handleApplyPromoCode} className='bg-blue-500 text-white rounded px-4 py-2 text-xs font-bold'>
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

              {/* Final Buy Button */}
              <button
                className='w-full bg-green-500 hover:bg-green-600 text-white rounded-lg py-3 font-bold transition-all shadow-lg active:transform active:scale-95'
                onClick={handleButtonClick}
              >
                Confirm & Pay €{totalPrice.toFixed(2)}
              </button>
            </div>
          )}

          {!isAnySeatSelected && (
            <p className='info text-sm text-gray-400 italic mt-4'>Please select a seat to see pricing</p>
          )}
        </div>
      )}

      {/* Modals & Popups */}
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
          subtotal: subtotal,
          bookingFee: bookingFee,
          tax: tax,
          discount: discount,
          total: totalPrice,
        }}
      />
    </div>

  );
}

export default SeatPlan;
