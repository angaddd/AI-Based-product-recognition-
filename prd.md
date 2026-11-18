# Project: AI-Powered Real-Time Object Detection for Retail Inventory Management

## Objective
Build a clean, modern, single-page AI-powered retail inventory dashboard. The application should allow users to upload shelf images, detect products, estimate their quantities, analyze inventory levels, predict stock depletion, and recommend restocking timelines.

## Core Features

1. **Image Upload**
   - Upload shelf images (JPG, JPEG, PNG).
   - Display the uploaded image.
   - Run object detection and draw bounding boxes around detected products.

2. **Product Detection**
   - Identify individual products wherever supported by the selected model.
   - Display product names, confidence scores, and detected quantities.
   - Use SKU-110K for shelf-product detection if suitable.
   - Do not claim SKU-110K identifies individual brands or SKUs; add a separate recognition approach if needed.

3. **Inventory Analysis**
   - Calculate detected quantity per product.
   - Categorize products as HIGH, NORMAL, LOW, or CRITICAL.
   - Allow configurable stock thresholds and estimated shelf capacities.

4. **Depletion Prediction**
   - Estimate average daily depletion using historical observations or supplied sales data.
   - Calculate estimated days until stockout.
   - Predict approximate stockout dates.
   - Clearly indicate when insufficient historical data is available.

5. **Restocking Recommendations**
   - Prioritize products requiring restocking.
   - Recommend quantities and estimated restocking timelines.
   - Display urgent restocking alerts.

6. **Analytics Dashboard**
   - Total detected products.
   - Low-stock and critical-stock counts.
   - Product-wise inventory table.
   - Inventory distribution charts.
   - Depletion trends and predicted stockout dates.

## UI Requirements
- No login, registration, authentication, or user profiles.
- Single-page dashboard.
- Modern professional retail analytics design.
- Image upload should be prominent.
- Clean charts, summary cards, tables, and status indicators.
- Responsive layout.

## Constraints
- Laptop-only development.
- No IoT hardware or external cameras required.
- Keep implementation manageable for a college project.
- Avoid unnecessary microservices, Kubernetes, and complicated infrastructure.
- Do not fabricate AI predictions or model accuracy metrics.
- Keep detection, recognition, inventory calculations, and forecasting as separate modules.