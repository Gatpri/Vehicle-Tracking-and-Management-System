import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  getMyWallet,
  getMyTransactions,
  initiateTopup,
  verifyTopup,
  topupFailure,
  payBooking,
  listAllWallets,
} from "../controllers/walletController.js";

const router = express.Router();

router.get("/wallet", verifyToken, getMyWallet);
router.get("/wallet/transactions", verifyToken, getMyTransactions);
router.get("/wallet/all", verifyToken, requirePermission("wallet:read:any"), listAllWallets);
router.post("/wallet/topup/initiate", verifyToken, initiateTopup);
// Public — eSewa redirects the raw browser here, it can't carry our JWT.
router.get("/wallet/topup/verify", verifyTopup);
router.get("/wallet/topup/failure", topupFailure);
router.post("/wallet/pay-booking", verifyToken, payBooking);

export default router;
