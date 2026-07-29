import crypto from "crypto";
import axios from "axios";

// Checked lazily, inside each call — not at import time like mailer.js.
// index.js imports every route file eagerly, and routes/wallet.js is one of
// many; a missing eSewa key must not take down vehicles/bookings/chat/etc.
export const assertEsewaConfigured = () => {
  const required = [
    "ESEWA_MERCHANT_CODE",
    "ESEWA_SECRET_KEY",
    "ESEWA_PAYMENT_URL",
    "ESEWA_STATUS_CHECK_URL",
  ];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length) {
    throw new Error(`Missing eSewa env vars: ${missing.join(", ")}`);
  }
};

const sign = (message) =>
  crypto.createHmac("sha256", process.env.ESEWA_SECRET_KEY).update(message).digest("base64");

// Builds the signed field set for eSewa's ePay v2 form-redirect checkout.
// The frontend auto-submits a hidden form with these fields to `url`.
export const buildTopupForm = ({ amountNpr, transactionUuid, successUrl, failureUrl }) => {
  assertEsewaConfigured();

  const productCode = process.env.ESEWA_MERCHANT_CODE;
  const totalAmount = amountNpr;
  const signedFieldNames = "total_amount,transaction_uuid,product_code";
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;

  return {
    url: process.env.ESEWA_PAYMENT_URL,
    fields: {
      amount: amountNpr,
      tax_amount: 0,
      total_amount: totalAmount,
      transaction_uuid: transactionUuid,
      product_code: productCode,
      product_service_charge: 0,
      product_delivery_charge: 0,
      success_url: successUrl,
      failure_url: failureUrl,
      signed_field_names: signedFieldNames,
      signature: sign(message),
    },
  };
};

// eSewa's success redirect carries a base64-encoded JSON blob in ?data=.
// Decode it and check ITS embedded signature (signed with our own secret,
// so a real eSewa response reproduces it) before trusting any of its fields.
export const decodeCallbackData = (base64Data) => {
  assertEsewaConfigured();

  const decoded = JSON.parse(Buffer.from(base64Data, "base64").toString("utf-8"));
  const fields = decoded.signed_field_names.split(",");
  const message = fields.map((f) => `${f}=${decoded[f]}`).join(",");
  const expectedSignature = sign(message);

  if (expectedSignature !== decoded.signature) {
    throw new Error("eSewa callback signature mismatch");
  }
  return decoded;
};

// The redirect alone is never trusted for crediting money — an independent
// server-to-server status check against eSewa is the source of truth.
export const verifyTransactionStatus = async ({ transactionUuid, totalAmount }) => {
  assertEsewaConfigured();

  const { data } = await axios.get(process.env.ESEWA_STATUS_CHECK_URL, {
    params: {
      product_code: process.env.ESEWA_MERCHANT_CODE,
      total_amount: totalAmount,
      transaction_uuid: transactionUuid,
    },
  });
  return data; // { status: "COMPLETE" | "PENDING" | "FULL_REFUND" | ..., ... }
};
