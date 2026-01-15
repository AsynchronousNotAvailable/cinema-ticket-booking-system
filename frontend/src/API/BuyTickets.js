async function BuyTickets(BASE_URL, formData) {
  try {
    const response = await fetch(`${BASE_URL}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Order successful:', data);
      return data;
    } else {
      const errorText = await response.text();
      console.error('Order failed:', response.status, errorText);
      alert(`Order failed (${response.status}): ${errorText}`);
      return null;
    }
  } catch (error) {
    console.error('Network/JS error:', error);
    alert(`Network error: ${error.message}`);
    return null;
  }
}

export default BuyTickets;
