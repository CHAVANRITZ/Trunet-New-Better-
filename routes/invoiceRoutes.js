
import express from "express";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

import {
  markAsInvoiced,
  getAllInvoices,
  getInvoiceByIdController,
  cancelInvoice,
} from "../controllers/invoiceController.js";

import {
  markAsInvoicedValidator,
  getInvoiceValidator,
  cancelInvoiceValidator,
  getAllInvoicesValidator,
} from "../validators/invoiceValidations.js";

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/mark-invoiced",
  markAsInvoicedValidator,
  validationMiddleware,
  markAsInvoiced
);

router.get(
  "/",
  getAllInvoicesValidator,
  validationMiddleware,
  getAllInvoices
);

router.get(
  "/:id",
  getInvoiceValidator,
  validationMiddleware,
  getInvoiceByIdController
);

router.put(
  "/:invoiceId/cancel",
  cancelInvoiceValidator,
  validationMiddleware,
  cancelInvoice
);

export default router;
