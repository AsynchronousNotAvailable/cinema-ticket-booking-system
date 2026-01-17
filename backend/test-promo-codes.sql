-- Test Promo Codes for UC-19
-- Run this SQL script to populate the database with sample promo codes
-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS promo_codes (
    id INT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    discount_type VARCHAR(50),
    discount_value DECIMAL(10,2),
    expiry_date DATE,
    usage_limit INT,
    used_count INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT NOW()
);
-- Valid Percentage Discounts
INSERT INTO promo_codes (id, code, description, discount_type, discount_value, expiry_date, usage_limit, used_count, active, created_at)
VALUES 
(1, 'SAVE10', '10% off your booking', 'PERCENTAGE', 10.0, DATE_ADD(NOW(), INTERVAL 3 MONTH), 100, 0, true, NOW()),
(2, 'WELCOME20', '20% off for new customers', 'PERCENTAGE', 20.0, DATE_ADD(NOW(), INTERVAL 6 MONTH), 50, 0, true, NOW());

-- Valid Fixed Amount Discounts  
INSERT INTO promo_codes (id, code, description, discount_type, discount_value, expiry_date, usage_limit, used_count, active, created_at)
VALUES
(3, 'MOVIE5', '€5 off your booking', 'FIXED_AMOUNT', 5.0, DATE_ADD(NOW(), INTERVAL 2 MONTH), 200, 0, true, NOW()),
(4, 'CINEMA3', '€3 off for all users', 'FIXED_AMOUNT', 3.0, DATE_ADD(NOW(), INTERVAL 1 MONTH), 500, 0, true, NOW());

-- Invalid Promo Codes (for testing)
INSERT INTO promo_codes (id, code, description, discount_type, discount_value, expiry_date, usage_limit, used_count, active, created_at)
VALUES
(5, 'EXPIRED', 'Expired promo code', 'PERCENTAGE', 15.0, DATE_SUB(NOW(), INTERVAL 1 DAY), 100, 0, true, NOW()),
(6, 'INACTIVE', 'Inactive promo code', 'PERCENTAGE', 25.0, DATE_ADD(NOW(), INTERVAL 6 MONTH), 100, 0, false, NOW());

-- Verify insertion
SELECT code, description, discount_type, discount_value, 
       CASE WHEN expiry_date > NOW() THEN 'Valid' ELSE 'Expired' END as status,
       usage_limit, used_count, active
FROM promo_codes
ORDER BY created_at DESC;
