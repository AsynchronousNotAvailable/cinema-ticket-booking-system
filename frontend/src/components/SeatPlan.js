import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// API Imports
import BuyTickets from '../API/BuyTickets';
import MakePayment from '../API/MakePayment';
import getSeatPlan from '../API/GetSeatPlan';
import ValidatePromoCode from '../API/ValidatePromoCode';

// Utils Imports
import { getRecommendedSeats } from '../utils/SeatRecommendationEngine';
import { TOTAL_SEATS, ALL_SEATS_DATA } from '../utils/SeatConstants';
import { calculatePricing } from '../utils/PriceCalculations';
import getMovieTypes from '../utils/getMovieTypes';

// Component Imports
import SeatSelector from './SeatSelector';
import SeatShowcase from './SeatShowcase';
import PaymentModal from './PaymentModal';

function SeatPlan({ movie, selectedSession, user }) {
  const BASE_URL = process.env.REACT_APP_BASE_URL;
  const navigate = useNavigate();

  // --- STATE ---
  const [selectedSeats, setSelectedSeats] = useState([]);
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
    const fetchSeatPlan = async () => {
      if (movieSession?.time) {
        try {
          const data = await getSeatPlan(movie.id, movieSession);
          setSeatPlan(data);
        } catch (error) {
          console.error('Error fetching seat plan:', error);
        }
      }
    };
    fetchSeatPlan();
  }, [movie.id, movieSession]);

  // Polling for updates every 5s
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

  // --- DERIVED DATA ---
  const occupiedSeats = seatPlan || [];
  const isSoldOut = occupiedSeats.length >= TOTAL_SEATS;
  const isAnySeatSelected = selectedSeats.length > 0;
  const selectedSeatText = selectedSeats.map((seat) => seat + 1).join(', ');

  // Use the NEW Price Calculation Utility
  const { subtotal, bookingFee, tax, discount, totalPrice } = calculatePricing(selectedSeats, appliedPromo);

  // --- HANDLERS ---
  const handleRecommendSeats = () => {
    const recs = getRecommendedSeats(numSeats, occupiedSeats);
    if (!recs) alert(`No ${numSeats} consecutive seats available!`);
    setRecommendedSeat(recs);
  };

  const handleApplyPromoCode = async () => {
    if (!promoCode.trim()) return;
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

  const handleButtonClick = async () => {
    const authId = user?.userId || localStorage.getItem('userId');
    if (!authId) return navigate('/login');

    const myOrder = {
      customerId: authId,
      orderDate: new Date().toISOString(),
      movieId: movie.id,
      movieSession: movieSession.time,
      seat: selectedSeats,
      totalPrice: totalPrice,
      userName: user?.name
    };
    console.log("Order details:", myOrder);
    const res = await BuyTickets(BASE_URL, myOrder);
    if (res?.orderId) {
      setPendingOrder(res);
      setShowPaymentModal(true);
    } else {
      alert("Booking failed. Try again.");
    }
  };

  const handlePaymentConfirm = async (paymentDetails) => {
    console.log("Processing payment with details:", paymentDetails);
    if (!pendingOrder) return;

    try {
      const orderId = pendingOrder.orderId;
      // Calling your API
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
      <div className='w-full px-6'>
        <h2 className='mb-8 text-2xl font-semibold text-center'>
          {isSoldOut ? "Session Sold Out" : "Choose your seats"}
        </h2>
      </div>

      {isSoldOut ? (
        <div className='text-center p-10 bg-red-50 rounded-lg'>
          <p className='text-red-600 font-bold mb-4'>No seats available.</p>
          <button onClick={() => navigate(-1)} className='bg-blue-600 text-white px-6 py-2 rounded'>
            Return to Movie List
          </button>
        </div>
      ) : (
        <div className='CinemaPlan'>
          <SeatSelector
            movie={{ occupied: occupiedSeats }}
            selectedSeats={selectedSeats}
            recommendedSeat={recommendedSeat}
            numSeats={numSeats}
            setNumSeats={setNumSeats}
            handleRecommendSeats={handleRecommendSeats}
            onSelectedSeatsChange={setSelectedSeats}
            onRecommendedSeatChange={setRecommendedSeat}
          />
          <SeatShowcase />

          {/* Pricing Details */}
          {isAnySeatSelected && (
            <div className='mt-4 text-sm w-full max-w-md border-t pt-4'>
              <div className='flex justify-between'><span>Subtotal:</span><span>€{subtotal.toFixed(2)}</span></div>
              <div className='flex justify-between'><span>Fee:</span><span>€{bookingFee.toFixed(2)}</span></div>
              <div className='flex justify-between'><span>Tax:</span><span>€{tax.toFixed(2)}</span></div>
              {discount > 0 && <div className='flex justify-between text-green-600'><span>Discount:</span><span>-€{discount.toFixed(2)}</span></div>}
              <div className='flex justify-between font-bold text-lg border-t mt-2 pt-2'>
                <span>Total:</span><span>€{totalPrice.toFixed(2)}</span>
              </div>

              <button onClick={handleButtonClick} className='w-full bg-green-500 text-white py-3 rounded mt-4 font-bold'>
                Buy Tickets
              </button>
            </div>
          )}
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
          total: totalPrice
        }}
      />
    </div>
  );
}

export default SeatPlan;