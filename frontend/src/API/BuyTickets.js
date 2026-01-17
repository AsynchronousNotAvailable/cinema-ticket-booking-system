async function BuyTickets(BASE_URL, formData) {
  try {
    const response = await fetch(`${BASE_URL}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Order successful', data);
      return data; // Return order data including orderId and priceBreakdown
    } else {
      // Return error response so frontend can display proper message
      console.error('Order failed:', response.status, data);
      return data; // Return backend error with message field
    }
  } catch (error) {
    console.error('Error occurred while ordering:', error);
    return { error: 'Network error', message: error.message };
  }
}

export default BuyTickets;
