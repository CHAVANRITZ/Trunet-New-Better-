
import {
  createInvoice,
  getInvoiceById,
  getAllInvoices as getAllInvoicesService,
  cancelInvoice as cancelInvoiceService,
} from "../services/invoiceService.js";

export const markAsInvoiced = async (req, res, next) => {
  try {
    const result = await createInvoice(req);

    return res.status(result.statusCode || 201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getAllInvoices = async (req, res, next) => {
  try {
    const result = await getAllInvoicesService(req);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getInvoiceByIdController = async (req, res, next) => {
  try {
    const result = await getInvoiceById(req);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const cancelInvoice = async (req, res, next) => {
  try {
    const result = await cancelInvoiceService(req);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
};
