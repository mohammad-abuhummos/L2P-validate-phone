// express-ipqs-lead-validator/index.js
// A simple Express app that validates lead data using IPQualityScore (IPQS) Phone API

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK using environment variables
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

// Validate Firebase configuration
if (
  !serviceAccount.project_id ||
  !serviceAccount.private_key ||
  !serviceAccount.client_email
) {
  console.error(
    "Error: Missing Firebase configuration in environment variables."
  );
  process.exit(1);
}

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

    // Determine if the lead is good quality
    const goodQuality =
      data.leaked_phone === false &&
      data.risky_phone === false &&
      (data.fraud_score_phone || 0) == 0 &&
      data.valid_phone === false &&
      data.active_phone === false;
    // // Determine if the lead is bad quality
    // const badQuality =
    //   data.leaked_phone === true ||
    //   data.risky_phone === true ||
    //   (data.fraud_score_phone || 0) > 0 ||
    //   data.valid_phone === false ||
    //   data.active_phone === false;

    // Log lead and IPQS response to Firestore
    const logEntry = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lead,
      ipqs: data,
    };
    await db.collection("ipqsLeadLogs").add(logEntry);

    // Send back validation result
    return res.json({
      success: goodQuality,
      valid_phone: data.valid_phone,
      test: data,
    });
  } catch (error) {
    console.error("Validation error:", error);
    return res.json({
      success: false,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IPQS Lead Validator (Phone) running on port ${PORT}`);
});

// Setup:
// 1. Run `npm init -y`.
// 2. Install dependencies: `npm install express axios dotenv firebase-admin`.
// 3. Configure your .env file with Firebase service account credentials and IPQS API key.
//    See .env file for required environment variables.
// 4. Start server: `node index.js`.
