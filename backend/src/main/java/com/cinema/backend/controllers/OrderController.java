package com.cinema.backend.controllers;

import com.cinema.backend.dto.PriceBreakdownDTO;
import com.cinema.backend.models.CinemaHall;
import com.cinema.backend.models.Order;
import com.cinema.backend.models.PromoCode;
import com.cinema.backend.repositories.CinemaHallRepository;
import com.cinema.backend.repositories.OrderRepository;
import com.cinema.backend.repositories.PromoCodeRepository;
import com.cinema.backend.services.EmailService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.Locale;

@RestController
public class OrderController {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private CinemaHallRepository cinemaHallRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private PromoCodeRepository promoCodeRepository;

    @PostMapping("/api/v1/order")
    ResponseEntity<?> newOrder(@RequestBody Order newOrder) {
        try {
            // Log incoming order details for debugging
            System.out.println("Received order: MovieID=" + newOrder.getMovieId()
                    + ", Session=" + newOrder.getMovieSession()
                    + ", Seats=" + newOrder.getSeat());

            // Pre-condition 1: User is authenticated (handled by frontend/auth middleware)

            // Pre-condition 2: Session exists and is not already started (only if
            // movieSession is provided)
            if (newOrder.getMovieSession() != null && !newOrder.getMovieSession().isEmpty()) {
                if (!validateSessionTime(newOrder.getMovieSession())) {
                    System.out.println("Session validation failed for: " + newOrder.getMovieSession());
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Session unavailable", "message", "Session is past or full"));
                }
            }

            // Pre-condition 3: Selected seats are available (only if movieSession is
            // provided)
            if (newOrder.getMovieSession() != null && !newOrder.getMovieSession().isEmpty()) {
                Optional<CinemaHall> hallOptional = cinemaHallRepository
                        .findByMovieIdAndMovieSession(newOrder.getMovieId(), newOrder.getMovieSession());

                if (hallOptional.isPresent()) {
                    CinemaHall hall = hallOptional.get();
                    List<Integer> occupiedSeats = hall.getUpdatedSeats();

                    // Check if any selected seat is already occupied/reserved
                    for (Integer seat : newOrder.getSeat()) {
                        if (occupiedSeats.contains(seat)) {
                            return ResponseEntity.status(HttpStatus.CONFLICT)
                                    .body(Map.of("error", "Seat no longer available", "message",
                                            "One or more selected seats are already reserved/occupied"));
                        }
                    }
                }
            }

            // Set order status to PENDING (reserved)
            newOrder.setOrderStatus("PENDING");

            // UC-19: Handle promo code if provided
            // 1. First, calculate the CORRECT subtotal using seat types
            double subtotal = 0.0;
            List<Integer> vipSeats = Arrays.asList(27, 28, 35, 36);
            for (Integer seatId : newOrder.getSeat()) {
                if (vipSeats.contains(seatId))
                    subtotal += 25.0;
                else if (seatId >= 56)
                    subtotal += 30.0;
                else if (seatId < 8)
                    subtotal += 15.0;
                else
                    subtotal += 10.0;
            }

            // 2. Now handle the Promo Code using that accurate subtotal
            double discount = 0.0;
            String promoCodeApplied = null;

            if (newOrder.getUserName() != null && newOrder.getUserName().contains("PROMO:")) {
                String[] parts = newOrder.getUserName().split("PROMO:");
                if (parts.length == 2) {
                    String promoCode = parts[1].trim();
                    newOrder.setUserName(parts[0].trim());

                    Optional<PromoCode> promoOptional = promoCodeRepository.findByCode(promoCode.toUpperCase());
                    if (promoOptional.isPresent()) {
                        PromoCode promo = promoOptional.get();
                        if (promo.isValid()) {
                            // USE THE REAL SUBTOTAL HERE
                            if ("PERCENTAGE".equals(promo.getDiscountType())) {
                                discount = (subtotal * promo.getDiscountValue()) / 100.0;
                            } else if ("FIXED_AMOUNT".equals(promo.getDiscountType())) {
                                discount = promo.getDiscountValue();
                            }
                            promoCodeApplied = promo.getCode();
                        }
                    }
                }
            }

            // UC-18: Calculate price breakdown with discount
            PriceBreakdownDTO priceBreakdown = calculatePriceBreakdown(
                    newOrder.getMoviePrice(),
                    newOrder.getSeat(),
                    discount);

            // Store price breakdown in order
            newOrder.setSubtotal(priceBreakdown.getSubtotal());
            newOrder.setBookingFee(priceBreakdown.getBookingFee());
            newOrder.setTax(priceBreakdown.getTax());
            newOrder.setDiscount(priceBreakdown.getDiscount());
            newOrder.setTotalAmount(priceBreakdown.getTotal());

            // Save booking with PENDING status
            Order savedOrder = orderRepository.save(newOrder);

            // Increment promo code usage if applied
            if (promoCodeApplied != null) {
                Optional<PromoCode> promoOptional = promoCodeRepository.findByCode(promoCodeApplied);
                if (promoOptional.isPresent()) {
                    PromoCode promo = promoOptional.get();
                    promo.incrementUsage();
                    promoCodeRepository.save(promo);
                }
            }

            // Reserve seats in cinema hall (only if movieSession is provided)
            if (newOrder.getMovieSession() != null && !newOrder.getMovieSession().isEmpty()) {
                reserveSeats(newOrder.getMovieId(), newOrder.getMovieSession(), newOrder.getSeat());
            }

            // Return booking ID and price breakdown to proceed to payment
            System.out.println("Order created successfully: OrderID=" + savedOrder.getOrderId());
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(Map.of(
                            "orderId", savedOrder.getOrderId(),
                            "status", savedOrder.getOrderStatus(),
                            "message", "Booking created successfully. Proceed to payment.",
                            "priceBreakdown", Map.of(
                                    "basePrice", priceBreakdown.getBasePrice(),
                                    "seatCount", priceBreakdown.getSeatCount(),
                                    "subtotal", priceBreakdown.getSubtotal(),
                                    "bookingFee", priceBreakdown.getBookingFee(),
                                    "tax", priceBreakdown.getTax(),
                                    "discount", priceBreakdown.getDiscount(),
                                    "total", priceBreakdown.getTotal())));

        } catch (Exception e) {
            e.printStackTrace(); // Log the full stack trace for debugging
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Booking creation failed", "message", e.getMessage()));
        }
    }

    @GetMapping("/api/v1/order/{userId}")
    Optional<Order> getLastOrderByUserId(@PathVariable Long userId) {
        return orderRepository.findFirstByCustomerIdOrderByCreatedAtDesc(userId);
    }

    // Helper method to validate session time
    private boolean validateSessionTime(String sessionTime) {
        try {
            // Parse the session time (e.g., "09:15 AM")
            SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", Locale.ENGLISH);
            sdf.setLenient(false);

            // Get today's date
            Calendar sessionCal = Calendar.getInstance();
            Date parsedTime = sdf.parse(sessionTime);

            // Set the parsed time to today's date
            Calendar timeCal = Calendar.getInstance();
            timeCal.setTime(parsedTime);
            sessionCal.set(Calendar.HOUR_OF_DAY, timeCal.get(Calendar.HOUR_OF_DAY));
            sessionCal.set(Calendar.MINUTE, timeCal.get(Calendar.MINUTE));
            sessionCal.set(Calendar.SECOND, 0);
            sessionCal.set(Calendar.MILLISECOND, 0);

            Date sessionDateTime = sessionCal.getTime();
            Date currentTime = new Date();

            // Check if session is not in the past (allow if session is in the future or
            // within 30 minutes of start)
            long diffInMinutes = (sessionDateTime.getTime() - currentTime.getTime()) / (60 * 1000);
            System.out.println("Session time: " + sessionTime + ", Current time: "
                    + new SimpleDateFormat("hh:mm a").format(currentTime) +
                    ", Minutes until session: " + diffInMinutes);

            if (diffInMinutes < -30) {
                System.out.println("Session has already started (more than 30 minutes ago)");
                return false; // Session is in the past
            }
            return true; // Allow booking
        } catch (ParseException e) {
            // If parsing fails, reject the booking
            System.out.println("Failed to parse session time: " + sessionTime + ". Rejecting booking.");
            return false;
        }
    }

    // UC-18: Calculate price breakdown with booking fees and taxes
    // private PriceBreakdownDTO calculatePriceBreakdown(double basePrice, int
    // seatCount, double discount) {
    // // Configurable pricing rules (can be moved to application.properties)
    // final double BOOKING_FEE_RATE = 0.10; // 10% booking fee
    // final double TAX_RATE = 0.10; // 10% tax rate

    // // Calculate subtotal
    // double subtotal = basePrice * seatCount;

    // // Calculate booking fee
    // double bookingFee = subtotal * BOOKING_FEE_RATE;

    // // Calculate tax on (subtotal + booking fee - discount)
    // double taxableAmount = subtotal + bookingFee - discount;
    // double tax = taxableAmount * TAX_RATE;

    // // Calculate final total
    // double total = subtotal + bookingFee + tax - discount;

    // // Ensure total is not negative
    // if (total < 0) {
    // total = 0;
    // }

    // PriceBreakdownDTO breakdown = new PriceBreakdownDTO(
    // basePrice,
    // seatCount,
    // subtotal,
    // bookingFee,
    // tax,
    // discount,
    // total);

    // System.out.println("Price Breakdown: " + breakdown);
    // return breakdown;
    // }
    // UPDATED HELPER METHOD
    private PriceBreakdownDTO calculatePriceBreakdown(double basePrice, List<Integer> seats, double discount) {
        // Add a "NEW" tag to your print statement
        final double BOOKING_FEE_RATE = 0.10;
        final double TAX_RATE = 0.10;

        double subtotal = 0.0;
        List<Integer> vipSeats = Arrays.asList(27, 28, 35, 36);

        // 1. Calculate Subtotal using specific seat rules
        for (Integer seatId : seats) {
            if (vipSeats.contains(seatId)) {
                subtotal += 25.0; // VIP
            } else if (seatId >= 56) {
                subtotal += 30.0; // COUPLE
            } else if (seatId < 8) {
                subtotal += 15.0; // PREMIUM
            } else {
                subtotal += 10.0; // NORMAL
            }
        }

        // 2. Calculate Fee
        double bookingFee = subtotal * BOOKING_FEE_RATE;

        // 3. Calculate Taxable Amount (Matches your Frontend Utility)
        // Formula: (Subtotal + Fee - Discount) * TaxRate
        double taxableAmount = subtotal + bookingFee - discount;
        if (taxableAmount < 0)
            taxableAmount = 0;

        double tax = taxableAmount * TAX_RATE;

        // 4. Calculate Final Total
        double total = subtotal + bookingFee + tax - discount;

        if (total < 0)
            total = 0;
        System.out.println("DEBUG - NEW LOGIC RUNNING - Subtotal: " + subtotal);

        System.out.println("Price Breakdown:" + basePrice
                + ", SeatCount=" + seats.size()
                + ", Subtotal=" + subtotal
                + ", BookingFee=" + bookingFee
                + ", Tax=" + tax
                + ", Discount=" + discount
                + ", Total=" + total);

        return new PriceBreakdownDTO(basePrice, seats.size(), subtotal, bookingFee, tax, discount, total);
    }

    // Helper method to reserve seats
    private void reserveSeats(Long movieId, String movieSession, List<Integer> seats) {
        Optional<CinemaHall> hallOptional = cinemaHallRepository
                .findByMovieIdAndMovieSession(movieId, movieSession);

        if (hallOptional.isPresent()) {
            CinemaHall hall = hallOptional.get();
            List<Integer> updatedSeats = new ArrayList<>(hall.getUpdatedSeats());
            updatedSeats.addAll(seats);
            hall.setUpdatedSeats(updatedSeats);
            cinemaHallRepository.save(hall);
        } else {
            // Create new cinema hall entry if doesn't exist
            CinemaHall newHall = new CinemaHall();
            newHall.setMovieId(movieId);
            newHall.setMovieSession(movieSession);
            newHall.setUpdatedSeats(new ArrayList<>(seats));
            newHall.setOrderTime(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()));
            cinemaHallRepository.save(newHall);
        }
    }

    // UC-21: Get order details for confirmation page
    @GetMapping("/api/v1/booking/{orderId}")
    ResponseEntity<?> getOrder(@PathVariable Long orderId) {
        Optional<Order> orderOptional = orderRepository.findById(orderId);

        if (!orderOptional.isPresent()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Order not found"));
        }

        Order order = orderOptional.get();

        Map<String, Object> response = new HashMap<>();
        response.put("orderId", order.getOrderId());
        response.put("bookingReference", order.getBookingReference() != null ? order.getBookingReference() : "");
        response.put("orderStatus", order.getOrderStatus());
        response.put("orderDate", order.getOrderDate()); // UC-23: Add orderDate for cancellation window check
        response.put("movieTitle", order.getMovieTitle());
        response.put("movieSession", order.getMovieSession());
        response.put("movieRuntime", order.getMovieRuntime());
        response.put("movieLanguage", order.getMovieLanguage());
        response.put("seats", order.getSeat());
        response.put("subtotal", order.getSubtotal());
        response.put("bookingFee", order.getBookingFee());
        response.put("tax", order.getTax());
        response.put("discount", order.getDiscount());
        response.put("totalAmount", order.getTotalAmount());
        response.put("qrCode", order.getQrCode() != null ? order.getQrCode() : "");
        response.put("transactionId", order.getTransactionId() != null ? order.getTransactionId() : "");
        response.put("paymentMethod", order.getPaymentMethod() != null ? order.getPaymentMethod() : "");

        // Handle Date objects that might be null
        if (order.getPaymentDate() != null) {
            response.put("paymentDate", order.getPaymentDate().toString());
        } else {
            response.put("paymentDate", null);
        }

        if (order.getCreatedAt() != null) {
            response.put("createdAt", order.getCreatedAt().toString());
        } else {
            response.put("createdAt", null);
        }

        return ResponseEntity.ok(response);
    }

    // Send booking confirmation email
    @PostMapping("/api/v1/booking/{orderId}/send-email")
    ResponseEntity<?> sendBookingEmail(@PathVariable Long orderId, @RequestBody Map<String, String> emailRequest) {
        try {
            String toEmail = emailRequest.get("email");

            if (toEmail == null || toEmail.trim().isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("success", false, "message", "Email address is required"));
            }

            // Validate email format
            if (!isValidEmail(toEmail)) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("success", false, "message", "Invalid email address format"));
            }

            Optional<Order> orderOptional = orderRepository.findById(orderId);

            if (!orderOptional.isPresent()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("success", false, "message", "Booking not found"));
            }

            Order order = orderOptional.get();

            // Check if booking is confirmed
            if (!"CONFIRMED".equals(order.getOrderStatus())) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("success", false, "message", "Only confirmed bookings can be emailed"));
            }

            // Send email
            boolean emailSent = emailService.sendBookingConfirmationEmail(
                    toEmail,
                    order.getBookingReference(),
                    order.getMovieTitle(),
                    order.getMovieSession(),
                    order.getSeat(),
                    order.getTotalAmount(),
                    order.getQrCode());

            if (emailSent) {
                return ResponseEntity.ok()
                        .body(Map.of(
                                "success", true,
                                "message", "Booking confirmation sent to " + toEmail,
                                "email", toEmail));
            } else {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("success", false, "message", "Failed to send email. Please try again."));
            }

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("success", false, "message", "Error sending email: " + e.getMessage()));
        }
    }

    // Simple email validation
    private boolean isValidEmail(String email) {
        String emailRegex = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$";
        return email.matches(emailRegex);
    }

    // UC-23: Cancel Booking
    @DeleteMapping("/api/v1/order/{orderId}")
    public ResponseEntity<?> cancelBooking(@PathVariable Long orderId) {
        try {
            // Find the order
            Optional<Order> orderOptional = orderRepository.findById(orderId);

            if (!orderOptional.isPresent()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("success", false, "message", "Booking not found"));
            }

            Order order = orderOptional.get();

            // Check if order is already cancelled
            if ("CANCELLED".equals(order.getOrderStatus())) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("success", false, "message", "This booking has already been cancelled"));
            }

            // Validate 24-hour cancellation window
            String orderDateStr = order.getOrderDate();
            Date orderDate;
            try {
                orderDate = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").parse(orderDateStr);
            } catch (ParseException e) {
                // Try ISO 8601 format with milliseconds
                try {
                    orderDate = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").parse(orderDateStr);
                } catch (ParseException ex) {
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body(Map.of("success", false, "message", "Invalid order date format"));
                }
            }

            Date currentDate = new Date();
            long diffInMillis = currentDate.getTime() - orderDate.getTime();
            long diffInHours = diffInMillis / (60 * 60 * 1000);

            if (diffInHours > 24) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of(
                                "success", false,
                                "message",
                                "Cancellation window has expired. Bookings can only be cancelled within 24 hours of creation."));
            }

            // Release seats back to cinema hall
            if (order.getMovieSession() != null && !order.getMovieSession().isEmpty()) {
                releaseSeats(order.getMovieId(), order.getMovieSession(), order.getSeat());
            }

            // Update order status to CANCELLED
            order.setOrderStatus("CANCELLED");
            orderRepository.save(order);

            System.out.println("Order " + orderId + " cancelled successfully. Seats released.");

            return ResponseEntity.ok()
                    .body(Map.of(
                            "success", true,
                            "message",
                            "Booking cancelled successfully. Refund will be processed within 5-7 business days.",
                            "orderId", orderId,
                            "refundAmount", order.getTotalAmount()));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("success", false, "message", "Error cancelling booking: " + e.getMessage()));
        }
    }

    // Helper method to release seats from cinema hall
    private void releaseSeats(Long movieId, String movieSession, List<Integer> seatsToRelease) {
        Optional<CinemaHall> hallOptional = cinemaHallRepository.findByMovieIdAndMovieSession(movieId, movieSession);

        if (hallOptional.isPresent()) {
            CinemaHall hall = hallOptional.get();
            List<Integer> currentOccupiedSeats = new ArrayList<>(hall.getUpdatedSeats());

            // Remove the cancelled seats from occupied list
            currentOccupiedSeats.removeAll(seatsToRelease);

            hall.setUpdatedSeats(currentOccupiedSeats);
            cinemaHallRepository.save(hall);

            System.out
                    .println("Released seats " + seatsToRelease + " for movie " + movieId + " session " + movieSession);
        }
    }

    // UC-16: View Booking History
    @GetMapping("/api/v1/order/user/{userId}")
    public ResponseEntity<?> getBookingHistory(@PathVariable Long userId) {
        try {
            // Fetch all orders for the user sorted by order date (newest first)
            List<Order> orders = orderRepository.findByCustomerId(userId);

            if (orders.isEmpty()) {
                return ResponseEntity.ok()
                        .body(Map.of(
                                "success", true,
                                "bookings", new ArrayList<>(),
                                "message", "No bookings found"));
            }

            // Sort by order date descending (newest first)
            orders.sort((o1, o2) -> {
                try {
                    Date date1 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").parse(o1.getOrderDate());
                    Date date2 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").parse(o2.getOrderDate());
                    return date2.compareTo(date1);
                } catch (ParseException e) {
                    return 0;
                }
            });

            // Build response with booking details
            List<Map<String, Object>> bookings = new ArrayList<>();
            for (Order order : orders) {
                Map<String, Object> booking = new HashMap<>();
                booking.put("orderId", order.getOrderId());
                booking.put("bookingReference", order.getBookingReference() != null ? order.getBookingReference() : "");
                booking.put("orderStatus", order.getOrderStatus());
                booking.put("orderDate", order.getOrderDate());
                booking.put("movieTitle", order.getMovieTitle());
                booking.put("movieSession", order.getMovieSession());
                booking.put("movieGenres", order.getMovieGenres());
                booking.put("seatCount", order.getSeat() != null ? order.getSeat().size() : 0);
                booking.put("seats", order.getSeat());
                booking.put("totalAmount", order.getTotalAmount());
                booking.put("paymentMethod", order.getPaymentMethod() != null ? order.getPaymentMethod() : "");
                booking.put("transactionId", order.getTransactionId() != null ? order.getTransactionId() : "");

                if (order.getPaymentDate() != null) {
                    booking.put("paymentDate", order.getPaymentDate().toString());
                }

                bookings.add(booking);
            }

            return ResponseEntity.ok()
                    .body(Map.of(
                            "success", true,
                            "bookings", bookings,
                            "totalBookings", bookings.size()));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("success", false, "message", "Error retrieving booking history: " + e.getMessage()));
        }
    }
}
