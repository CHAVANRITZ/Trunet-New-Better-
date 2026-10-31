
import * as faultyStockService from "../services/faultyStockService.js";

export const transferToRepairCenter = (req, res) =>
  faultyStockService.transferToRepairCenter(req, res);

export const returnFromRepairCenter = (req, res) =>
  faultyStockService.returnFromRepairCenter(req, res);

export const getRepairTransfersForCenter = (req, res) =>
  faultyStockService.getRepairTransfersForCenter(req, res);

export const getDamagedAndUnderRepairSerials = (req, res) =>
  faultyStockService.getDamagedAndUnderRepairSerials(req, res);

export const markAsRepairedOrIrreparable = (req, res) =>
  faultyStockService.markAsRepairedOrIrreparable(req, res);

export const getDamageAndUnderRepairProduct = (req, res) =>
  faultyStockService.getDamageAndUnderRepairProduct(req, res);

export const getRepairedProducts = (req, res) =>
  faultyStockService.getRepairedProducts(req, res);

export const transferRepairedToMainWarehouse = (req, res) =>
  faultyStockService.transferRepairedToMainWarehouse(req, res);

export const transferRepairedToResellerStock = (req, res) =>
  faultyStockService.transferRepairedToResellerStock(req, res);

export const getRepairedProductsInOutletStock = (req, res) =>
  faultyStockService.getRepairedProductsInOutletStock(req, res);

export const getAllFaultyStockForWarehouse = (req, res) =>
  faultyStockService.getAllFaultyStockForWarehouse(req, res);

export const getAllFaultyStockForRepairing = (req, res) =>
  faultyStockService.getAllFaultyStockForRepairing(req, res);

export const acceptRepairedTransfer = (req, res) =>
  faultyStockService.acceptRepairedTransfer(req, res);