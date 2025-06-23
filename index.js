// express-ipqs-lead-validator/index.js
// A simple Express app that validates lead data using IPQualityScore (IPQS) Phone API

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
app.use(express.json());

// Load your IPQS API key from environment
const API_KEY = process.env.IPQS_API_KEY;
if (!API_KEY) {
  console.error("Error: Missing IPQS_API_KEY in environment variables.");
  process.exit(1);
}

/**
 * POST /validate-phone
 * Body: { phone: string, ...other lead fields }
 * Returns: { success: boolean }
 * success is false if any of these conditions are met:
 *   - data.leaked_phone === true
 *   - data.risky_phone === true
 *   - data.fraud_score_phone > 0
 *   - data.valid_phone === false
 *   - data.active_phone === false
 */
app.post("/validate-phone", async (req, res) => {
  try {
    const lead = req.body;
    const { phone } = lead;
    if (!phone) {
      return res
        .status(400)
        .json({ error: 'Missing "phone" in request body.' });
    }

    // Construct IPQS Phone API URL
    const url = `https://ipqualityscore.com/api/json/phone/${API_KEY}/${phone}`;
    const params = {
      country: "US",
      allowed_standards: true,
    };

    // Call IPQS Phone API
    const response = await axios.get(url, { params });
    const data = response.data;

    // Determine if the lead is bad quality
    const badQuality =
      data.leaked_phone === true ||
      data.risky_phone === true ||
      (data.fraud_score_phone || 0) > 0 ||
      data.valid_phone === false ||
      data.active_phone === false;

    // Log lead and IPQS response to Firestore
    const logEntry = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lead,
      ipqs: data,
    };
    await db.collection("ipqsLeadLogs").add(logEntry);

    // Send back validation result
    return res.json({
      success: !badQuality,
      valid_phone: data.valid_phone,
      test: data,
    });
  } catch (error) {
    console.error("Validation error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IPQS Lead Validator (Phone) running on port ${PORT}`);
});

// Setup:
// 1. Run `npm init -y`.
// 2. Install dependencies: `npm install express axios dotenv firebase-admin`.
// 3. Download your Firebase service account JSON and save as `serviceAccountKey.json`.
// 4. Create a .env file:
//    IPQS_API_KEY=your_ipqs_api_key_here
// 5. Start server: `node index.js`.
