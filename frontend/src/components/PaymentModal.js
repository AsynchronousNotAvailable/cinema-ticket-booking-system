import React, { useState } from 'react';

function PaymentModal({ isOpen, onClose, onConfirm, priceBreakdown }) {
  const [paymentMethod, setPaymentMethod] = useState('Card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  // src/components/PaymentModal.js

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    const paymentDetails = {
      paymentMethod,
      // Add the total amount here so the backend can verify it
      amount: priceBreakdown?.total,
      cardNumber: paymentMethod === 'Card' ? cardNumber : undefined,
      cardName: paymentMethod === 'Card' ? cardName : undefined,
      expiryDate: paymentMethod === 'Card' ? expiryDate : undefined,
      cvv: paymentMethod === 'Card' ? cvv : undefined,
    };

    await onConfirm(paymentDetails);
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-2xl font-bold mb-4">Complete Payment</h2>

        {/* Price Summary */}
        <div className="bg-gray-100 p-4 rounded mb-4">
          <div className="flex justify-between mb-2">
            <span>Subtotal:</span>
            <span>€{priceBreakdown?.subtotal?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span>Booking Fee:</span>
            <span>€{priceBreakdown?.bookingFee?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span>Tax:</span>
            <span>€{priceBreakdown?.tax?.toFixed(2) || '0.00'}</span>
          </div>
          {priceBreakdown?.discount > 0 && (
            <div className="flex justify-between mb-2 text-green-600">
              <span>Discount:</span>
              <span>-€{priceBreakdown?.discount?.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2">
            <span>Total:</span>
            <span>€{priceBreakdown?.total?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Payment Method Selection */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              required
            >
              <option value="Card">Credit/Debit Card</option>
              <option value="E-Wallet">E-Wallet (PayPal, Google Pay)</option>
              <option value="Cash">Cash (Pay at Counter)</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>

          {/* Card Payment Fields */}
          {paymentMethod === 'Card' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Card Number</label>
                <input
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim())}
                  maxLength="19"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Test card: 4111 1111 1111 1111</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Cardholder Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Expiry Date</label>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    value={expiryDate}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '');
                      if (value.length >= 2) {
                        value = value.slice(0, 2) + '/' + value.slice(2, 4);
                      }
                      setExpiryDate(value);
                    }}
                    maxLength="5"
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">CVV</label>
                  <input
                    type="text"
                    placeholder="123"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                    maxLength="4"
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
              </div>
            </>
          )}

          {/* E-Wallet Info */}
          {paymentMethod === 'E-Wallet' && (
            <div className="mb-4 p-4 bg-blue-50 rounded">
              <p className="text-sm text-blue-800">
                You will be redirected to complete payment with your selected e-wallet provider.
              </p>
            </div>
          )}

          {/* Cash Payment Info */}
          {paymentMethod === 'Cash' && (
            <div className="mb-4 p-4 bg-yellow-50 rounded">
              <p className="text-sm text-yellow-800">
                Please collect your ticket at the cinema counter before the show starts.
                Bring this booking confirmation.
              </p>
            </div>
          )}

          {/* Bank Transfer Info */}
          {paymentMethod === 'Bank Transfer' && (
            <div className="mb-4 p-4 bg-green-50 rounded">
              <p className="text-sm text-green-800">
                Transfer details will be sent to your email. Payment must be completed within 24 hours.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex-1 bg-green-500 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : `Pay €${priceBreakdown?.total?.toFixed(2) || '0.00'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PaymentModal;
