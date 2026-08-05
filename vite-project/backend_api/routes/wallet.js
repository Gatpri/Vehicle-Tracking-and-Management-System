import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  getMyWallet,
  getMyTransactions,
  initiateTopup,
  verifyTopup,
  topupFailure,
  payBooking,
  payBookingWithEsewa,
  listAllWallets,
  getUserStatement,
  getCompanyStatement,
} from "../controllers/walletController.js";
import {
  requestWithdrawal,
  requestCompanyWithdrawal,
  listMyWithdrawals,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from "../controllers/withdrawalController.js";

const router = express.Router();

router.get("/wallet", verifyToken, getMyWallet);
router.get("/wallet/transactions", verifyToken, getMyTransactions);
router.get("/wallet/all", verifyToken, requirePermission("wallet:read:any"), listAllWallets);
// Static path before the "/:userId" one below.
router.get("/wallet/company", verifyToken, requirePermission("wallet:read:any"), getCompanyStatement);
router.get("/wallet/:userId", verifyToken, requirePermission("wallet:read:any"), getUserStatement);
router.post("/wallet/topup/initiate", verifyToken, initiateTopup);
// Public — eSewa redirects the raw browser here, it can't carry our JWT.
router.get("/wallet/topup/verify", verifyTopup);
router.get("/wallet/topup/failure", topupFailure);
router.post("/wallet/pay-booking", verifyToken, payBooking);
router.post("/wallet/pay-booking/esewa", verifyToken, payBookingWithEsewa);

// Withdrawals. Requesting is own-data; reviewing needs withdrawal:review,
// which only accounting-admin and superadmin hold.
router.post("/withdrawals", verifyToken, requestWithdrawal);
// Drawing down the platform's own commission — reviewers only.
router.post("/withdrawals/company", verifyToken, requirePermission("withdrawal:review"), requestCompanyWithdrawal);
router.get("/withdrawals/mine", verifyToken, listMyWithdrawals);
router.get("/withdrawals", verifyToken, requirePermission("withdrawal:read:any"), listWithdrawals);
router.patch("/withdrawals/:id/approve", verifyToken, requirePermission("withdrawal:review"), approveWithdrawal);
router.patch("/withdrawals/:id/reject", verifyToken, requirePermission("withdrawal:review"), rejectWithdrawal);

export default router;
