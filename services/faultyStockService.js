
import mongoose from "mongoose";
import RepairTransfer from "../models/RepairTransfer.js";
import FaultyStock from "../models/FaultyStock.js";
import ResellerStock from "../models/ResellerStock.js";
import Product from "../models/Product.js";
import OutletStock from "../models/OutletStock.js";

const checkStockUsagePermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const usageModule = userPermissions.find(
    (perm) => perm.module === "Usage"
  );

  if (!usageModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_usage_own_center: usageModule.permissions.includes(
      "manage_usage_own_center"
    ),
    manage_usage_all_center: usageModule.permissions.includes(
      "manage_usage_all_center"
    ),
    view_usage_own_center: usageModule.permissions.includes(
      "view_usage_own_center"
    ),
    view_usage_all_center: usageModule.permissions.includes(
      "view_usage_all_center"
    ),
    allow_edit_usage: usageModule.permissions.includes(
      "allow_edit_usage"
    ),
    accept_damage_return: usageModule.permissions.includes(
      "accept_damage_return"
    ),
  };

  const hasRequiredPermission = requiredPermissions.some(
    (perm) => permissions[perm]
  );

  const userCenter =
  req.selectedCenterId ||
  req.user.center ||
  req.user.fullUser?.center;

return {
  hasAccess: hasRequiredPermission,
  permissions,
  userCenter,
};
};

export const transferToRepairCenter = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockUsagePermissions(req, [
        "manage_usage_own_center",
        "manage_usage_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { items, repairCenterId, transferRemark } = req.body;
    const transferredBy = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required and cannot be empty",
      });
    }

    if (!repairCenterId) {
      return res.status(400).json({
        success: false,
        message: "Repair center ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(repairCenterId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repair center ID format",
      });
    }

    const Center = mongoose.model("Center");
    const Product = mongoose.model("Product");
    const FaultyStock = mongoose.model("FaultyStock");
    const RepairTransfer = mongoose.model("RepairTransfer");

    const repairCenter = await Center.findById(repairCenterId);

    if (!repairCenter) {
      return res.status(404).json({
        success: false,
        message: "Repair center not found",
      });
    }

    const transferResults = [];
    const errors = [];

    for (const item of items) {
      try {
        const {
          productId,
          quantity,
          serialNumbers,
          damageRemark,
        } = item;

        const product = await Product.findById(productId);

        if (!product) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        let faultyFilter = {
          product: productId,
          $or: [
            { overallStatus: "damaged" },
            { damageQty: { $gt: 0 } },
            { "serialNumbers.status": "damaged" },
          ],
        };

        if (!permissions.manage_usage_all_center && userCenter) {
          faultyFilter.center = userCenter._id || userCenter;
        }

        const faultyStocks = await FaultyStock.find(faultyFilter);

        if (!faultyStocks || faultyStocks.length === 0) {
          errors.push(
            `No damaged faulty stock found for product: ${product.productTitle}`
          );
          continue;
        }

        let selectedFaultyStock = null;
        let totalAvailable = 0;
        let availableSerials = [];

        for (const faultyStock of faultyStocks) {
          if (product.trackSerialNumber === "Yes") {
            const damagedSerials = faultyStock.serialNumbers.filter(
              (sn) => sn.status === "damaged"
            );

            if (damagedSerials.length > 0) {
              availableSerials = [
                ...availableSerials,
                ...damagedSerials,
              ];

              totalAvailable += damagedSerials.length;

              if (!selectedFaultyStock) {
                selectedFaultyStock = faultyStock;
              }
            }
          } else {
            if (faultyStock.damageQty > 0) {
              totalAvailable += faultyStock.damageQty;

              if (!selectedFaultyStock) {
                selectedFaultyStock = faultyStock;
              }
            }
          }
        }

        if (totalAvailable === 0) {
          errors.push(
            `No damaged items available for product: ${product.productTitle}`
          );
          continue;
        }

        if (quantity > totalAvailable) {
          errors.push(
            `Insufficient damaged stock for ${product.productTitle}. Available: ${totalAvailable}, Requested: ${quantity}`
          );
          continue;
        }

        let actualSerials = [];

        if (product.trackSerialNumber === "Yes") {
          if (
            !serialNumbers ||
            !Array.isArray(serialNumbers) ||
            serialNumbers.length === 0
          ) {
            actualSerials = availableSerials
              .slice(0, quantity)
              .map((s) => s.serialNumber);
          } else {
            if (serialNumbers.length !== quantity) {
              errors.push(
                `Quantity mismatch for ${product.productTitle}. Serial count: ${serialNumbers.length}, Quantity: ${quantity}`
              );
              continue;
            }

            const availableSerialNumbers = availableSerials.map(
              (s) => s.serialNumber
            );

            const invalidSerials = serialNumbers.filter(
              (sn) => !availableSerialNumbers.includes(sn)
            );

            if (invalidSerials.length > 0) {
              errors.push(
                `Invalid serial numbers for ${product.productTitle}: ${invalidSerials.join(", ")}`
              );
              continue;
            }

            actualSerials = serialNumbers;
          }
        }

        console.log(
          `Transferring ${product.productTitle}: ${quantity} units to pending_under_repair`
        );

        if (product.trackSerialNumber === "Yes") {
          let updatedCount = 0;

          for (const serial of selectedFaultyStock.serialNumbers) {
            if (actualSerials.includes(serial.serialNumber)) {
              serial.status = "pending_under_repair";
              serial.underRepairQty = 0;

              serial.repairHistory.push({
                date: new Date(),
                status: "pending_under_repair",
                remark:
                  damageRemark ||
                  "Transferred to repair center - pending acceptance",
                updatedBy: transferredBy,
                cost: 0,
              });

              updatedCount++;
            }
          }

          if (updatedCount !== quantity) {
            errors.push(
              `Failed to update ${quantity} serials. Updated: ${updatedCount}`
            );
            continue;
          }
        } else {
          if (selectedFaultyStock.damageQty < quantity) {
            errors.push(
              `Insufficient damageQty: ${selectedFaultyStock.damageQty}, requested: ${quantity}`
            );
            continue;
          }

          selectedFaultyStock.damageQty -= quantity;

          selectedFaultyStock.pendingUnderRepairQty =
            (selectedFaultyStock.pendingUnderRepairQty || 0) + quantity;

          selectedFaultyStock.repairHistory.push({
            date: new Date(),
            status: "pending_under_repair",
            remark:
              damageRemark ||
              `Transferred ${quantity} items to repair center - pending acceptance`,
            quantity: quantity,
            repairedQty: 0,
            irrepairedQty: 0,
            updatedBy: transferredBy,
          });
        }

        selectedFaultyStock.updateQuantitiesAndStatus();
        await selectedFaultyStock.save();

        console.log(
          `FaultyStock saved: DamageQty: ${selectedFaultyStock.damageQty}, PendingUnderRepairQty: ${selectedFaultyStock.pendingUnderRepairQty}, UnderRepairQty: ${selectedFaultyStock.underRepairQty}`
        );

        let repairTransferSerials = [];

        if (product.trackSerialNumber === "Yes") {
          repairTransferSerials = actualSerials.map((sn) => ({
            serialNumber: sn,
            status: "pending_under_repair",
            quantity: 1,
            repairedQty: 0,
            irrepairedQty: 0,
            underRepairQty: 0,
            repairHistory: [
              {
                date: new Date(),
                status: "pending_under_repair",
                remark:
                  damageRemark || "Transferred - pending acceptance",
                updatedBy: transferredBy,
                cost: 0,
              },
            ],
          }));
        }

        const repairTransfer = new RepairTransfer({
          date: new Date(),
          faultyStock: selectedFaultyStock._id,
          fromCenter: selectedFaultyStock.center,
          toCenter: repairCenterId,
          product: productId,
          quantity: quantity,
          serialNumbers: repairTransferSerials,
          isSerialized: product.trackSerialNumber === "Yes",
          transferRemark:
            transferRemark ||
            `Transferred to ${repairCenter.centerName} - pending acceptance`,
          transferredBy: transferredBy,
          status: "pending_under_repair",
          pendingUnderRepairQty: quantity,
          underRepairQty: 0,
          repairedQty: 0,
          irrepairedQty: 0,
          returnedQty: 0,
          repairUpdates: [
            {
              date: new Date(),
              status: "pending_under_repair",
              remark:
                transferRemark ||
                "Transferred to repair center - pending acceptance",
              quantity: quantity,
              updatedBy: transferredBy,
              cost: 0,
            },
          ],
        });

        await repairTransfer.save();

        console.log(
          `RepairTransfer saved: PendingUnderRepairQty: ${repairTransfer.pendingUnderRepairQty}, UnderRepairQty: ${repairTransfer.underRepairQty}`
        );

        transferResults.push({
          product: product.productTitle,
          quantity: quantity,
          status: "pending_under_repair",
          faultyStockId: selectedFaultyStock._id,
          transferId: repairTransfer._id,
          message:
            "Transferred successfully. Waiting for repair center acceptance.",
        });
      } catch (error) {
        console.error("Error processing item:", error);
        errors.push(`Error: ${error.message}`);
      }
    }

    if (errors.length > 0 && transferResults.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Transfer failed",
        errors: errors,
      });
    }

    res.json({
      success: true,
      message: `Transferred ${transferResults.length} items to pending_under_repair status`,
      data: {
        transferred: transferResults,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Transfer error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



export const returnFromRepairCenter = async (req, res) => {
  const { hasAccess } = checkStockUsagePermissions(req, [
    "manage_usage_own_center",
    "manage_usage_all_center",
  ]);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message:
        "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
    });
  }

  const { items, returnRemark } = req.body;
  const returnedBy = req.user.id;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Items array is required and cannot be empty",
    });
  }

  const session = await mongoose.startSession();

  try {
    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        const {
          repairTransferId,
          productId,
          quantity,
          serialNumbers = [],
          finalStatus,
          repairCost = 0,
          repairRemark,
        } = item;

        if (!mongoose.Types.ObjectId.isValid(repairTransferId)) {
          throw new Error("Invalid repair transfer ID.");
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
          throw new Error("Invalid product ID.");
        }

        if (!["repaired", "irreparable"].includes(finalStatus)) {
          throw new Error(
            "finalStatus must be repaired or irreparable."
          );
        }

        if (!Number.isSafeInteger(quantity) || quantity < 1) {
          throw new Error("Quantity must be a positive integer.");
        }

        if (!Number.isFinite(repairCost) || repairCost < 0) {
          throw new Error("Repair cost must be a non-negative number.");
        }

        const result = await session.withTransaction(async () => {
          const now = new Date();
          const remark =
            repairRemark ||
            returnRemark ||
            `Repair completed - ${finalStatus}`;

          const repairTransfer = await RepairTransfer.findById(
            repairTransferId
          ).session(session);

          if (!repairTransfer) {
            throw new Error(
              `Repair transfer not found: ${repairTransferId}`
            );
          }

          if (repairTransfer.status === "returned") {
            throw new Error(
              `Repair transfer already returned: ${repairTransferId}`
            );
          }

          if (String(repairTransfer.product) !== String(productId)) {
            throw new Error(
              `Product does not match repair transfer ${repairTransferId}.`
            );
          }

          const product = await Product.findById(productId).session(
            session
          );

          if (!product) {
            throw new Error(`Product not found: ${productId}`);
          }

          const faultyStock = await FaultyStock.findById(
            repairTransfer.faultyStock
          ).session(session);

          if (!faultyStock) {
            throw new Error(
              `Faulty stock not found for repair transfer ${repairTransferId}.`
            );
          }

          const isSerialized = product.trackSerialNumber === "Yes";

          if (isSerialized && serialNumbers.length !== quantity) {
            throw new Error(
              `Quantity (${quantity}) must match serial count (${serialNumbers.length}).`
            );
          }

          if (
            !isSerialized &&
            (!Array.isArray(serialNumbers) || serialNumbers.length > 0)
          ) {
            throw new Error(
              "Serial numbers are not expected for non-serialized products."
            );
          }

          if (
            !isSerialized &&
            repairTransfer.pendingUnderRepairQty < quantity
          ) {
            throw new Error(
              "Insufficient pending-under-repair quantity."
            );
          }

          const isCompletedRepair =
            isSerialized &&
            repairTransfer.status === "repaired" &&
            repairTransfer.pendingUnderRepairQty === 0 &&
            Number.isSafeInteger(repairTransfer.repairedQty) &&
            repairTransfer.repairedQty >= quantity;

          if (
            isSerialized &&
            !isCompletedRepair &&
            repairTransfer.pendingUnderRepairQty < quantity
          ) {
            throw new Error(
              "Insufficient pending-under-repair quantity on the repair transfer."
            );
          }

          const transferSerialMap = new Map(
            (repairTransfer.serialNumbers || []).map((serial) => [
              serial.serialNumber,
              serial,
            ])
          );

          const faultySerialMap = new Map(
            (faultyStock.serialNumbers || []).map((serial) => [
              serial.serialNumber,
              serial,
            ])
          );

          const serialsToReturn = [];
          let centerStock = null;

          if (isSerialized) {
            for (const serialNumber of serialNumbers) {
              const transferSerial = transferSerialMap.get(serialNumber);
              const faultySerial = faultySerialMap.get(serialNumber);

              if (!transferSerial || !faultySerial) {
                throw new Error(
                  `Serial ${serialNumber} was not found in both repair and faulty stock records.`
                );
              }

              if (isCompletedRepair) {
                if (
                  transferSerial.status !== finalStatus ||
                  faultySerial.status !== finalStatus
                ) {
                  throw new Error(
                    `Completed repair status does not match serial ${serialNumber}.`
                  );
                }
              } else if (
                !["pending_under_repair", "under_repair"].includes(
                  transferSerial.status
                ) ||
                !["pending_under_repair", "under_repair"].includes(
                  faultySerial.status
                )
              ) {
                throw new Error(
                  `Serial ${serialNumber} is not pending repair in both records.`
                );
              }
            }
          }

          if (finalStatus === "repaired") {
            const CenterStock = mongoose.model("CenterStock");

            centerStock = await CenterStock.findOne({
              center: repairTransfer.fromCenter,
              product: productId,
            }).session(session);

            if (!centerStock) {
              throw new Error(
                `CenterStock not found for product ${productId} at the original center.`
              );
            }

            if (isSerialized) {
              for (const serialNumber of serialNumbers) {
                const existingSerial = (
                  centerStock.serialNumbers || []
                ).find((serial) => serial.serialNumber === serialNumber);

                if (!existingSerial) {
                  throw new Error(
                    `Serial ${serialNumber} is missing from CenterStock.`
                  );
                }

                const alreadyReturnedToCenter =
                  existingSerial.status === "available" &&
                  (existingSerial.transferHistory || []).some(
                    (history) =>
                      String(history.fromCenter) ===
                        String(repairTransfer.toCenter) &&
                      String(history.toCenter) ===
                        String(repairTransfer.fromCenter) &&
                      history.transferType === "inbound_transfer"
                  );

                if (
                  alreadyReturnedToCenter &&
                  !isCompletedRepair
                ) {
                  throw new Error(
                    `Serial ${serialNumber} is already available at the original center. Verify records before retrying.`
                  );
                }

                if (
                  !alreadyReturnedToCenter &&
                  !["under_repair", "pending_under_repair"].includes(
                    existingSerial.status
                  )
                ) {
                  throw new Error(
                    `Serial ${serialNumber} must be under repair in CenterStock; current status is ${existingSerial.status}.`
                  );
                }

                serialsToReturn.push({
                  serialNumber,
                  existingSerial,
                  alreadyReturnedToCenter,
                });
              }
            }
          }

          if (isSerialized && !isCompletedRepair) {
            for (const serialNumber of serialNumbers) {
              const faultySerial = faultySerialMap.get(serialNumber);
              const transferSerial = transferSerialMap.get(serialNumber);

              faultySerial.status = finalStatus;
              faultySerial.repairHistory =
                faultySerial.repairHistory || [];

              faultySerial.repairHistory.push({
                date: now,
                status: finalStatus,
                remark,
                updatedBy: returnedBy,
                cost: repairCost,
              });

              transferSerial.status = finalStatus;
              transferSerial.repairHistory =
                transferSerial.repairHistory || [];

              transferSerial.repairHistory.push({
                date: now,
                status: finalStatus,
                remark,
                updatedBy: returnedBy,
                cost: repairCost,
              });
            }

            const statuses = (faultyStock.serialNumbers || []).map(
              (serial) => serial.status
            );

            if (
              statuses.length &&
              statuses.every((status) => status === "repaired")
            ) {
              faultyStock.overallStatus = "repaired";
              faultyStock.repairDate = now;
            } else if (
              statuses.length &&
              statuses.every((status) => status === "irreparable")
            ) {
              faultyStock.overallStatus = "irreparable";
            } else if (
              statuses.some((status) =>
                ["pending_under_repair", "under_repair"].includes(status)
              )
            ) {
              faultyStock.overallStatus = "pending_under_repair";
            } else if (statuses.includes("damaged")) {
              faultyStock.overallStatus = "damaged";
            } else if (statuses.includes("pending_damage")) {
              faultyStock.overallStatus = "pending_damage";
            } else if (statuses.includes("repaired")) {
              faultyStock.overallStatus = "repaired";
            } else if (statuses.includes("irreparable")) {
              faultyStock.overallStatus = "irreparable";
            }
          } else if (!isSerialized) {
            faultyStock.overallStatus = finalStatus;

            if (finalStatus === "repaired") {
              faultyStock.repairDate = now;
            }
          }

          if (finalStatus === "repaired" && centerStock) {
            if (isSerialized) {
              for (const {
                existingSerial,
                alreadyReturnedToCenter,
              } of serialsToReturn) {
                if (alreadyReturnedToCenter) continue;

                existingSerial.status = "available";
                existingSerial.currentLocation = repairTransfer.fromCenter;
                existingSerial.transferHistory =
                  existingSerial.transferHistory || [];

                existingSerial.transferHistory.push({
                  fromCenter: repairTransfer.toCenter,
                  toCenter: repairTransfer.fromCenter,
                  transferDate: now,
                  transferType: "inbound_transfer",
                });

                centerStock.availableQuantity =
                  (centerStock.availableQuantity || 0) + 1;
              }
            } else {
              centerStock.availableQuantity =
                (centerStock.availableQuantity || 0) + quantity;

              centerStock.totalQuantity =
                (centerStock.totalQuantity || 0) + quantity;
            }
          }

          if (isCompletedRepair) {
            for (const serialNumber of serialNumbers) {
              const transferSerial = transferSerialMap.get(serialNumber);

              // Required by RepairTransfer.updateStatusAndQuantities().
              transferSerial.status = "returned";
              transferSerial.repairHistory =
                transferSerial.repairHistory || [];

              transferSerial.repairHistory.push({
                date: now,
                status: "returned",
                remark: returnRemark || "Returned from repair center",
                quantity: 1,
                updatedBy: returnedBy,
                cost: 0,
                transferStatus: "accepted",
                destinationOutlet: repairTransfer.fromCenter,
              });
            }
          } else {
            repairTransfer.pendingUnderRepairQty -= quantity;

            if (finalStatus === "repaired") {
              repairTransfer.repairedQty =
                (repairTransfer.repairedQty || 0) + quantity;
            } else {
              repairTransfer.irrepairedQty =
                (repairTransfer.irrepairedQty || 0) + quantity;
            }

            repairTransfer.totalRepairCost =
              (repairTransfer.totalRepairCost || 0) + repairCost;
          }

          repairTransfer.repairUpdates =
            repairTransfer.repairUpdates || [];

          repairTransfer.repairUpdates.push({
            date: now,
            status: isCompletedRepair ? "returned" : finalStatus,
            remark,
            quantity,
            updatedBy: returnedBy,
            cost: isCompletedRepair ? 0 : repairCost,
            transferStatus: "accepted",
            destinationOutlet: repairTransfer.fromCenter,
          });

          repairTransfer.updateStatusAndQuantities();

          await faultyStock.save({ session });

          if (centerStock) {
            await centerStock.save({ session });
          }

          await repairTransfer.save({ session });

          if (
            isSerialized &&
            repairTransfer.returnedQty < serialNumbers.length
          ) {
            throw new Error(
              "Repair transfer return quantity was not updated correctly."
            );
          }

          return {
            product: product.productTitle,
            productCode: product.productCode,
            quantity,
            serialNumbers,
            finalStatus,
            repairCost,
            repairTransferId: repairTransfer._id,
            status: "success",
          };
        });

        results.push(result);
      } catch (error) {
        errors.push({
          repairTransferId: item.repairTransferId,
          message: error.message,
        });
      }
    }

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Return failed",
        data: {
          returned: [],
          errors,
        },
      });
    }

    return res.json({
      success: true,
      message: `Successfully returned ${results.length} items from repair center.`,
      data: {
        returned: results,
        errors,
        totalItems: results.length,
        totalQuantity: results.reduce(
          (sum, item) => sum + item.quantity,
          0
        ),
        repairedCount: results
          .filter((item) => item.finalStatus === "repaired")
          .reduce((sum, item) => sum + item.quantity, 0),
        irreparableCount: results
          .filter((item) => item.finalStatus === "irreparable")
          .reduce((sum, item) => sum + item.quantity, 0),
      },
    });
  } catch (error) {
    console.error("Return from repair center error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    await session.endSession();
  }
};



export const getRepairTransfersForCenter = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const {
      status,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {
      toCenter: userCenter?._id || req.user.center,
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const repairTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("transferredBy", "name email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await RepairTransfer.countDocuments(filter);

    const dashboardStats = await RepairTransfer.aggregate([
      { $match: { toCenter: userCenter?._id || req.user.center } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
        },
      },
    ]);

    res.json({
      success: true,
      data: repairTransfers,
      dashboardStats,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get repair transfers for center error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair transfers for center",
    });
  }
};

export const getDamagedAndUnderRepairSerials = async (req, res) => {
  try {
    const { productId } = req.query;
    const { centerId, status = "all" } = req.query;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const faultyStockFilter = { product: productId };
    const repairTransferFilter = { product: productId };

    if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
      faultyStockFilter.center = centerId;
      repairTransferFilter.$or = [
        { fromCenter: centerId },
        { toCenter: centerId },
      ];
    }

    const statusFilter = [];

    if (status === "all" || status === "damaged") {
      statusFilter.push("damaged");
    }

    if (status === "all" || status === "under_repair") {
      statusFilter.push("under_repair");
    }

    const faultyStocks = await FaultyStock.find(faultyStockFilter)
      .populate("center", "centerName centerCode")
      .populate("reseller", "resellerName")
      .select("serialNumbers center overallStatus damageDate");

    const repairTransfers = await RepairTransfer.find(repairTransferFilter)
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .select("serialNumbers fromCenter toCenter status transferDate");

    const allSerialNumbers = [];

    faultyStocks.forEach((stock) => {
      stock.serialNumbers.forEach((serial) => {
        if (statusFilter.includes(serial.status)) {
          allSerialNumbers.push({
            serialNumber: serial.serialNumber,
            status: serial.status,
            center: {
              id: stock.center._id,
              name: stock.center.centerName,
            },
            repairRemark: serial.repairRemark,
            recordId: stock._id,
          });
        }
      });
    });

    repairTransfers.forEach((transfer) => {
      transfer.serialNumbers.forEach((serial) => {
        if (statusFilter.includes(serial.status)) {
          allSerialNumbers.push({
            serialNumber: serial.serialNumber,
            status: serial.status,
            source: "repair_transfer",
            fromCenter: {
              id: transfer.fromCenter._id,
              name: transfer.fromCenter.centerName,
              code: transfer.fromCenter.centerCode,
            },
            toCenter: {
              id: transfer.toCenter._id,
              name: transfer.toCenter.centerName,
              code: transfer.toCenter.centerCode,
            },
            transferDate: transfer.date,
            transferStatus: transfer.status,
            repairHistory: serial.repairHistory || [],
            recordId: transfer._id,
          });
        }
      });
    });

    const uniqueSerials = [];
    const seenSerials = new Set();

    allSerialNumbers.sort((a, b) => {
      if (a.source === b.source) return 0;
      return a.source === "repair_transfer" ? 1 : -1;
    });

    allSerialNumbers.forEach((serial) => {
      if (!seenSerials.has(serial.serialNumber)) {
        seenSerials.add(serial.serialNumber);
        uniqueSerials.push(serial);
      }
    });

    const statusSummary = {
      damaged: uniqueSerials.filter((s) => s.status === "damaged").length,
      under_repair: uniqueSerials.filter((s) => s.status === "under_repair").length,
      total: uniqueSerials.length,
    };

    const centerSummary = {};

    uniqueSerials.forEach((serial) => {
      const centerId = serial.center
        ? serial.center.id
        : serial.fromCenter.id;

      const centerName = serial.center
        ? serial.center.name
        : serial.fromCenter.name;

      if (!centerSummary[centerId]) {
        centerSummary[centerId] = {
          centerId,
          centerName,
          damaged: 0,
          under_repair: 0,
          total: 0,
        };
      }

      centerSummary[centerId][serial.status]++;
      centerSummary[centerId].total++;
    });

    res.json({
      success: true,
      data: {
        product: {
          _id: product._id,
          title: product.productTitle,
          code: product.productCode,
          trackSerialNumber: product.trackSerialNumber,
        },
        availableSerials: uniqueSerials,
        summary: {
          status: statusSummary,
          centers: Object.values(centerSummary),
          sources: {
            faulty_stock: uniqueSerials.filter(
              (s) => s.source === "faulty_stock"
            ).length,
            repair_transfer: uniqueSerials.filter(
              (s) => s.source === "repair_transfer"
            ).length,
          },
        },
        filters: {
          productId,
          centerId: centerId || "all",
          status,
        },
      },
    });
  } catch (error) {
    console.error("Get damaged and under repair serials error:", error);

    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch damaged and under repair serial numbers",
    });
  }
};


export const markAsRepairedOrIrreparable = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { date, remark, items } = req.body;
    const updatedBy = req.user.id;
    const repairCenterId = userCenter?._id || req.user.center;

    console.log("=== MARK AS REPAIRED/IRREPARABLE REQUEST ===");
    console.log("Repair Center:", repairCenterId);
    console.log("Request:", JSON.stringify(items, null, 2));

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required"
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required and cannot be empty",
      });
    }

    const RepairTransfer = mongoose.model("RepairTransfer");
    const FaultyStock = mongoose.model("FaultyStock");
    const Product = mongoose.model("Product");

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        console.log("\n=== Processing Item ===");
        console.log("Item:", JSON.stringify(item, null, 2));
        
        const { 
          product: productId,
          quantity, 
          serialNumbers = [], 
          productRemark, 
          finalStatus, 
          repairCost = 0
        } = item;

        // Validate
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
          errors.push(`Invalid product ID: ${productId || 'undefined'}`);
          continue;
        }

        if (!quantity || quantity < 1) {
          errors.push(`Invalid quantity for product ${productId}. Quantity: ${quantity}`);
          continue;
        }

        if (!finalStatus || !["repaired", "irreparable"].includes(finalStatus)) {
          errors.push(`Invalid final status for product ${productId}. Must be "repaired" or "irreparable". Received: ${finalStatus}`);
          continue;
        }

        const productDoc = await Product.findById(productId);
        if (!productDoc) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        console.log(`Product: ${productDoc.productTitle}, Serialized: ${productDoc.trackSerialNumber}`);

        if (productDoc.trackSerialNumber === "Yes") {
          // SERIALIZED PRODUCTS
          console.log(`Processing SERIALIZED product with serials: ${serialNumbers}`);
          
          if (!serialNumbers || serialNumbers.length === 0) {
            errors.push(`Serial numbers required for serialized product ${productDoc.productTitle}`);
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(`Quantity (${quantity}) doesn't match serials count (${serialNumbers.length}) for ${productDoc.productTitle}`);
            continue;
          }

          // Track which serials we've processed
          const processedSerials = [];
          const invalidSerials = [];
          let totalProcessed = 0;
          
          // Loop through each serial number
          for (const serialNumber of serialNumbers) {
            let found = false;
            
            // Find repair transfer containing this serial (search ALL statuses)
            const repairTransfer = await RepairTransfer.findOne({
              product: productId,
              toCenter: repairCenterId,
              "serialNumbers.serialNumber": serialNumber,
              "serialNumbers.status": { $in: ["under_repair", "pending_under_repair", "partially_repaired"] }
            })
            .populate("product", "productTitle productCode trackSerialNumber");

            if (repairTransfer) {
              const serial = repairTransfer.serialNumbers.find(sn => 
                sn.serialNumber === serialNumber && 
                (sn.status === "under_repair" || sn.status === "pending_under_repair" || sn.status === "partially_repaired")
              );
              
              if (serial) {
                found = true;
                console.log(`Found serial ${serialNumber} in repair transfer ${repairTransfer._id} with status: ${serial.status}`);
                
                // Process this serial
                serial.status = finalStatus;
                serial.repairDate = new Date(date);
                
                // Add repair history
                if (!Array.isArray(serial.repairHistory)) {
                  serial.repairHistory = [];
                }
                
                serial.repairHistory.push({
                  date: new Date(date),
                  status: finalStatus,
                  remark: productRemark || remark || `Marked as ${finalStatus}`,
                  updatedBy: updatedBy,
                  cost: repairCost
                });

                // Update transfer quantities
                if (finalStatus === "repaired") {
                  repairTransfer.repairedQty = (repairTransfer.repairedQty || 0) + 1;
                } else {
                  repairTransfer.irrepairedQty = (repairTransfer.irrepairedQty || 0) + 1;
                }
                
                // Update under repair count - count all serials still under repair
                const remainingUnderRepair = repairTransfer.serialNumbers.filter(
                  sn => sn.status === "under_repair" || sn.status === "pending_under_repair"
                ).length;
                
                repairTransfer.underRepairQty = remainingUnderRepair;
                
                // Add repair update
                if (!Array.isArray(repairTransfer.repairUpdates)) {
                  repairTransfer.repairUpdates = [];
                }
                
                repairTransfer.repairUpdates.push({
                  date: new Date(date),
                  status: finalStatus,
                  remark: productRemark || remark || `Marked serial ${serialNumber} as ${finalStatus}`,
                  quantity: 1,
                  repairedQty: finalStatus === "repaired" ? 1 : 0,
                  irrepairedQty: finalStatus === "irreparable" ? 1 : 0,
                  updatedBy: updatedBy,
                  cost: repairCost
                });

                // Update transfer status
                const totalProcessedInTransfer = (repairTransfer.repairedQty || 0) + (repairTransfer.irrepairedQty || 0);
                
                if (totalProcessedInTransfer === repairTransfer.quantity) {
                  if (repairTransfer.repairedQty === repairTransfer.quantity) {
                    repairTransfer.status = "repaired";
                  } else if (repairTransfer.irrepairedQty === repairTransfer.quantity) {
                    repairTransfer.status = "irreparable";
                  } else {
                    repairTransfer.status = "partially_repaired";
                  }
                } else if (totalProcessedInTransfer > 0) {
                  // Check if all remaining items are still under repair
                  const allUnderRepair = repairTransfer.serialNumbers.every(sn => 
                    sn.status === "under_repair" || sn.status === "pending_under_repair"
                  );
                  if (allUnderRepair) {
                    repairTransfer.status = "under_repair";
                  } else {
                    repairTransfer.status = "partially_repaired";
                  }
                } else {
                  repairTransfer.status = "under_repair";
                }

                // Update repair cost
                if (repairCost > 0) {
                  repairTransfer.totalRepairCost = (repairTransfer.totalRepairCost || 0) + repairCost;
                }

                // Save the transfer
                await repairTransfer.save();
                console.log(`✓ Updated serial ${serialNumber} in transfer ${repairTransfer._id}. New status: ${repairTransfer.status}`);
                
                processedSerials.push(serialNumber);
                totalProcessed++;
                
                // Find and update the faulty stock
                const faultyStock = await FaultyStock.findById(repairTransfer.faultyStock);
                if (faultyStock) {
                  const faultySerial = faultyStock.serialNumbers.find(sn => 
                    sn.serialNumber === serialNumber
                  );
                  
                  if (faultySerial) {
                    faultySerial.status = finalStatus;
                    faultySerial.repairDate = new Date(date);
                    
                    if (!Array.isArray(faultySerial.repairHistory)) {
                      faultySerial.repairHistory = [];
                    }
                    
                    faultySerial.repairHistory.push({
                      date: new Date(date),
                      status: finalStatus,
                      remark: productRemark || remark || `Marked as ${finalStatus} from repair`,
                      updatedBy: updatedBy,
                      cost: repairCost
                    });
                    
                    // Update faulty stock quantities
                    if (finalStatus === "repaired") {
                      faultyStock.repairedQty = (faultyStock.repairedQty || 0) + 1;
                    } else {
                      faultyStock.irrepairedQty = (faultyStock.irrepairedQty || 0) + 1;
                    }
                    
                    // Update under repair quantity
                    const underRepairSerials = faultyStock.serialNumbers.filter(
                      sn => sn.status === "under_repair" || sn.status === "pending_under_repair"
                    ).length;
                    faultyStock.underRepairQty = underRepairSerials;
                    
                    // Add to repair history
                    if (!Array.isArray(faultyStock.repairHistory)) {
                      faultyStock.repairHistory = [];
                    }
                    
                    faultyStock.repairHistory.push({
                      date: new Date(date),
                      status: finalStatus,
                      remark: productRemark || remark || `Marked serial ${serialNumber} as ${finalStatus} from repair`,
                      quantity: 1,
                      repairedQty: finalStatus === "repaired" ? 1 : 0,
                      irrepairedQty: finalStatus === "irreparable" ? 1 : 0,
                      updatedBy: updatedBy,
                      cost: repairCost
                    });
                    
                    faultyStock.lastRepairUpdate = new Date();
                    faultyStock.updateQuantitiesAndStatus();
                    await faultyStock.save();
                    console.log(`✓ Updated faulty stock for serial ${serialNumber}. New status: ${faultyStock.overallStatus}`);
                  }
                }
              }
            }
            
            if (!found) {
              invalidSerials.push({
                serialNumber,
                status: "not found",
                message: "Serial not found or not in valid status (under_repair, pending_under_repair, partially_repaired)"
              });
            }
          }

          if (invalidSerials.length > 0) {
            errors.push(`Invalid serials for ${productDoc.productTitle}: ${JSON.stringify(invalidSerials)}`);
            continue;
          }

          if (totalProcessed !== quantity) {
            errors.push(`Processed ${totalProcessed} serials but expected ${quantity} for ${productDoc.productTitle}`);
            continue;
          }

          console.log(`✓ Successfully processed ${totalProcessed} serials for ${productDoc.productTitle}`);

          results.push({
            product: productDoc.productTitle,
            productCode: productDoc.productCode,
            quantity: totalProcessed,
            serialNumbers: processedSerials,
            finalStatus: finalStatus,
            repairCost: repairCost * totalProcessed,
            status: "success",
            message: `Marked ${totalProcessed} serials as ${finalStatus}`
          });

        } else {
          // NON-SERIALIZED PRODUCTS
          console.log(`Processing NON-SERIALIZED product ${productDoc.productTitle}`);

          // Find ALL repair transfers for non-serialized products
          const repairTransfers = await RepairTransfer.find({
            product: productId,
            toCenter: repairCenterId,
            isSerialized: false,
            status: { $in: ["under_repair", "partially_accepted", "partially_repaired"] }
          })
          .populate("product", "productTitle productCode trackSerialNumber");

          console.log(`Found ${repairTransfers.length} repair transfers for non-serialized product ${productDoc.productTitle}`);

          if (repairTransfers.length === 0) {
            errors.push(`No repair transfers found for ${productDoc.productTitle} at your repair center`);
            continue;
          }

          // Find a transfer with enough under repair quantity
          let selectedTransfer = null;
          let availableQuantity = 0;

          for (const transfer of repairTransfers) {
            const availableInTransfer = transfer.underRepairQty || 0;
            console.log(`Transfer ${transfer._id} has ${availableInTransfer} items under repair`);

            if (availableInTransfer >= quantity) {
              selectedTransfer = transfer;
              availableQuantity = availableInTransfer;
              break;
            }
          }

          if (!selectedTransfer) {
            // Check total available across all transfers
            const totalAvailable = repairTransfers.reduce((sum, transfer) =>
              sum + (transfer.underRepairQty || 0), 0);

            errors.push(`Insufficient items available for ${productDoc.productTitle}. Total available: ${totalAvailable}, Requested: ${quantity}`);
            continue;
          }

          console.log(`Using transfer ${selectedTransfer._id} with ${availableQuantity} available items`);

          // Update the repair transfer
          selectedTransfer.underRepairQty = Math.max(0, selectedTransfer.underRepairQty - quantity);

          if (finalStatus === "repaired") {
            selectedTransfer.repairedQty = (selectedTransfer.repairedQty || 0) + quantity;
          } else {
            selectedTransfer.irrepairedQty = (selectedTransfer.irrepairedQty || 0) + quantity;
          }

          // Add repair update
          if (!Array.isArray(selectedTransfer.repairUpdates)) {
            selectedTransfer.repairUpdates = [];
          }

          selectedTransfer.repairUpdates.push({
            date: new Date(date),
            status: finalStatus,
            remark: productRemark || remark || `Marked ${quantity} items as ${finalStatus}`,
            quantity: quantity,
            repairedQty: finalStatus === "repaired" ? quantity : 0,
            irrepairedQty: finalStatus === "irreparable" ? quantity : 0,
            updatedBy: updatedBy,
            cost: repairCost * quantity
          });

          // Update transfer status
          const totalProcessedInTransfer = (selectedTransfer.repairedQty || 0) + (selectedTransfer.irrepairedQty || 0);

          if (totalProcessedInTransfer === selectedTransfer.quantity) {
            if (selectedTransfer.repairedQty === selectedTransfer.quantity) {
              selectedTransfer.status = "repaired";
            } else if (selectedTransfer.irrepairedQty === selectedTransfer.quantity) {
              selectedTransfer.status = "irreparable";
            } else {
              selectedTransfer.status = "partially_repaired";
            }
          } else if (totalProcessedInTransfer > 0) {
            selectedTransfer.status = "under_repair";
          } else {
            selectedTransfer.status = "under_repair";
          }

          // Update repair cost
          if (repairCost > 0) {
            selectedTransfer.totalRepairCost = (selectedTransfer.totalRepairCost || 0) + (repairCost * quantity);
          }

          // Save the transfer
          await selectedTransfer.save();
          console.log(`✓ Updated non-serialized transfer ${selectedTransfer._id}. New status: ${selectedTransfer.status}`);

          // Update faulty stock
          const faultyStock = await FaultyStock.findById(selectedTransfer.faultyStock);
          if (faultyStock) {
            faultyStock.markAsRepairedFromRepair(
              quantity,
              finalStatus,
              productRemark || remark || `Marked ${quantity} items as ${finalStatus} from repair`,
              updatedBy
            );

            faultyStock.lastRepairUpdate = new Date();
            await faultyStock.save();
            console.log(`✓ Updated faulty stock for non-serialized product. New status: ${faultyStock.overallStatus}`);
          }

          results.push({
            product: productDoc.productTitle,
            productCode: productDoc.productCode,
            quantity: quantity,
            serialNumbers: [],
            finalStatus: finalStatus,
            repairCost: repairCost * quantity,
            status: "success",
            message: `Marked ${quantity} non-serialized items as ${finalStatus}`
          });

          console.log(`✓ Successfully processed ${quantity} non-serialized items for ${productDoc.productTitle}`);
        }

      } catch (error) {
        console.error(`Error processing item:`, error);
        errors.push(`Error processing ${item.productName || 'item'}: ${error.message}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to process any items",
        errors: errors
      });
    }

    const response = {
      success: true,
      message: `Successfully processed ${results.length} items`,
      data: {
        processed: results,
        summary: {
          totalItems: results.length,
          totalQuantity: results.reduce((sum, item) => sum + item.quantity, 0),
          totalRepaired: results.filter(item => item.finalStatus === "repaired").reduce((sum, item) => sum + item.quantity, 0),
          totalIrrepaired: results.filter(item => item.finalStatus === "irreparable").reduce((sum, item) => sum + item.quantity, 0)
        }
      }
    };

    if (errors.length > 0) {
      response.data.errors = errors;
      response.data.partialSuccess = true;
      response.message += ` (${errors.length} failed)`;
    }

    console.log("\n=== FINAL RESULT ===");
    console.log(JSON.stringify(response, null, 2));

    res.json(response);

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process repair status",
    });
  }
};

export const getDamageAndUnderRepairProduct = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const {
      status,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {
      toCenter: userCenter?._id || req.user.center
    };

    filter.status = { $in: ["under_repair", "partially_repaired"] };

    if (status && status !== "all") {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const repairTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("transferredBy", "name email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const repairItems = [];

    for (const transfer of repairTransfers) {
      const hasUnderRepairItems =
        await checkIfTransferHasUnderRepairItems(transfer);

      if (!hasUnderRepairItems) {
        continue;
      }

      if (transfer.product?.trackSerialNumber === "Yes") {
        const underRepairSerials = transfer.serialNumbers.filter(
          serial => serial.status === "under_repair"
        );

        if (underRepairSerials.length > 0) {
          repairItems.push({
            ...transfer.toObject(),
            quantity: underRepairSerials.length,
            serialNumbers: underRepairSerials,
            availableForRepair: true,
            displayQuantity: underRepairSerials.length,
            pendingSerialsCount: underRepairSerials.length,
            totalSerialsCount: transfer.serialNumbers.length,
            originalQuantity: transfer.quantity
          });
        }
      } else {
        const underRepairQty = transfer.underRepairQty || 0;

        if (underRepairQty > 0) {
          repairItems.push({
            ...transfer.toObject(),
            quantity: underRepairQty,
            displayQuantity: underRepairQty,
            availableForRepair: true,
            originalQuantity: transfer.quantity,
            quantityBreakdown: {
              originalTransferred: transfer.quantity,
              currentlyUnderRepair: underRepairQty,
              alreadyRepaired: transfer.repairedQty || 0,
              alreadyIrrepaired: transfer.irrepairedQty || 0,
              alreadyReturned: transfer.returnedQty || 0
            }
          });
        }
      }
    }

    const totalTransfers = await RepairTransfer.countDocuments(filter);
    const totalRepairItems = repairItems.length;

    const dashboardStats = await RepairTransfer.aggregate([
      {
        $match: {
          toCenter: userCenter?._id || req.user.center
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      }
    ]);

    const pendingRepairsStats = {
      _id: "pending_repairs",
      count: totalRepairItems,
      totalQuantity: repairItems.reduce(
        (sum, item) => sum + (item.displayQuantity || 0),
        0
      )
    };

    dashboardStats.push(pendingRepairsStats);

    res.json({
      success: true,
      data: repairItems,
      dashboardStats: dashboardStats,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRepairItems / limitNum),
        totalRecords: totalRepairItems,
        hasNext: pageNum < Math.ceil(totalRepairItems / limitNum),
        hasPrev: pageNum > 1,
      }
    });
  } catch (error) {
    console.error("Get repair transfers for center error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch repair transfers for center",
    });
  }
};

const checkIfTransferHasUnderRepairItems = async (transfer) => {
  if (transfer.product?.trackSerialNumber === "Yes") {
    return transfer.serialNumbers.some(
      serial => serial.status === "under_repair"
    );
  } else {
    const underRepairQty = transfer.underRepairQty || 0;
    return underRepairQty > 0;
  }
};

export const getRepairedProducts = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      status = "all",
      search = ""
    } = req.query;

    const filter = {
      toCenter: userCenter?._id || req.user.center,
      status: { $in: ["repaired", "partially_repaired"] }
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    if (search) {
      const products = await Product.find({
        $or: [
          { productTitle: { $regex: search, $options: "i" } },
          { productCode: { $regex: search, $options: "i" } }
        ]
      }).select("_id");

      const productIds = products.map(product => product._id);
      filter.product = { $in: productIds };
    }

    const repairTransfers = await RepairTransfer.find(filter)
      .populate("fromCenter", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("transferredBy", "name email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await RepairTransfer.countDocuments(filter);

    const repairedProducts = repairTransfers.map(transfer => {
      const repairedSerials = (transfer.serialNumbers || []).filter(
        serial => serial.status === "repaired"
      );

      return {
        ...transfer.toObject(),
        repairedSerials,
        repairedQuantity: transfer.repairedQty || repairedSerials.length,
        irrepairedQuantity: transfer.irrepairedQty || 0,
        totalRepairCost: transfer.totalRepairCost || 0
      };
    });

    const dashboardStats = await RepairTransfer.aggregate([
      {
        $match: {
          toCenter: userCenter?._id || req.user.center
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          repairedQuantity: { $sum: "$repairedQty" },
          irrepairedQuantity: { $sum: "$irrepairedQty" },
          totalRepairCost: { $sum: "$totalRepairCost" }
        }
      }
    ]);

    res.json({
      success: true,
      data: repairedProducts,
      dashboardStats,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error("Get repaired products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch repaired products"
    });
  }
};

export const transferRepairedToMainWarehouse = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. manage_usage_own_center or manage_usage_all_center permission required.",
      });
    }

    const { items, transferRemark, outletId } = req.body;
    const transferredBy = req.user.id;
    const repairCenterId = userCenter?._id || req.user.center;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required and cannot be empty",
      });
    }

    if (!outletId || !mongoose.Types.ObjectId.isValid(outletId)) {
      return res.status(400).json({
        success: false,
        message: "Valid outlet ID is required",
      });
    }

    const RepairTransfer = mongoose.model("RepairTransfer");
    const OutletStock = mongoose.model("OutletStock");
    const Center = mongoose.model("Center");
    const Product = mongoose.model("Product");

    const destinationOutlet = await Center.findById(outletId);

    if (!destinationOutlet || destinationOutlet.centerType !== "Outlet") {
      return res.status(400).json({
        success: false,
        message: "Destination must be a valid Outlet",
      });
    }

    const transferResults = [];
    const errors = [];

    for (const item of items) {
      try {
        const {
          productId,
          quantity,
          serialNumbers = [],
          damageRemark,
        } = item;

        if (
          !productId ||
          !mongoose.Types.ObjectId.isValid(productId) ||
          !Number.isInteger(quantity) ||
          quantity < 1
        ) {
          errors.push("Each item requires a valid productId and positive integer quantity");
          continue;
        }

        const productDoc = await Product.findById(productId);

        if (!productDoc) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        const remark =
          damageRemark ||
          transferRemark ||
          `Repaired stock transfer to ${destinationOutlet.centerName}`;

        // =========================================================
        // SERIALIZED PRODUCTS
        // =========================================================
        if (productDoc.trackSerialNumber === "Yes") {
          if (
            !Array.isArray(serialNumbers) ||
            serialNumbers.length !== quantity ||
            serialNumbers.length === 0
          ) {
            errors.push(
              `Quantity must match serialNumbers count for ${productDoc.productTitle}`
            );
            continue;
          }

          if (new Set(serialNumbers).size !== serialNumbers.length) {
            errors.push(`Duplicate serial numbers supplied for ${productDoc.productTitle}`);
            continue;
          }

          for (const serialNumber of serialNumbers) {
            try {
              // Find the transfer regardless of current serial status,
              // so an interrupted request can be recovered.
              const repairTransfer = await RepairTransfer.findOne({
                product: productId,
                toCenter: repairCenterId,
                "serialNumbers.serialNumber": serialNumber,
              });

              if (!repairTransfer) {
                errors.push(
                  `${serialNumber}: repair transfer not found for this repair center`
                );
                continue;
              }

              const serial = repairTransfer.serialNumbers.find(
                (entry) => entry.serialNumber === serialNumber
              );

              if (!serial) {
                errors.push(`${serialNumber}: serial not found in repair transfer`);
                continue;
              }

              const alreadyPending = serial.status === "pending_transfer";

              // A pending serial can only be recovered for the same outlet.
              if (alreadyPending) {
                const destinationMatches =
                  repairTransfer.pendingTransferDetails?.some(
                    (detail) =>
                      detail.outletId?.toString() === outletId.toString() &&
                      detail.status === "pending"
                  ) ||
                  repairTransfer.repairUpdates?.some(
                    (update) =>
                      update.destinationOutlet?.toString() === outletId.toString() &&
                      update.status === "pending_transfer"
                  );

                if (!destinationMatches) {
                  errors.push(
                    `${serialNumber}: already pending transfer to a different or unknown destination`
                  );
                  continue;
                }
              } else if (serial.status !== "repaired") {
                errors.push(
                  `${serialNumber}: expected status repaired, found ${serial.status}`
                );
                continue;
              }

              // Validate existing stock before modifying the repair transfer.
              let outletStock = await OutletStock.findOne({
                outlet: outletId,
                product: productId,
              });

              if (!outletStock) {
                outletStock = new OutletStock({
                  outlet: outletId,
                  product: productId,
                  totalQuantity: 0,
                  availableQuantity: 0,
                  inTransitQuantity: 0,
                  repairedQuantity: 0,
                  transferredRepairedQty: 0,
                  pendingRepairedQty: 0,
                  pendingSerials: [],
                });
              }

              const existingPending = outletStock.pendingSerials.find(
                (entry) => entry.serialNumber === serialNumber
              );

              if (
                existingPending &&
                existingPending.repairTransferId?.toString() !==
                  repairTransfer._id.toString()
              ) {
                errors.push(
                  `${serialNumber}: existing pending entry belongs to another repair transfer`
                );
                continue;
              }

              // Save OutletStock first. Do not double-increment on retry.
              if (!existingPending) {
                outletStock.pendingSerials.push({
                  serialNumber,
                  status: "pending_transfer",
                  repairTransferId: repairTransfer._id,
                  transferredDate: new Date(),
                  transferredBy,
                  remark,
                });

                outletStock.pendingRepairedQty =
                  (outletStock.pendingRepairedQty || 0) + 1;

                await outletStock.save();
              }

              // Only perform the transfer mutation for a newly repaired serial.
              if (!alreadyPending) {
                repairTransfer.markAsPendingTransfer(
                  1,
                  outletId,
                  transferredBy,
                  remark,
                  [serialNumber]
                );

                await repairTransfer.save();
              }

              transferResults.push({
                product: productDoc.productTitle,
                productId,
                quantity: 1,
                serialNumbers: [serialNumber],
                repairTransferId: repairTransfer._id,
                status: "pending_transfer",
                recovered: alreadyPending,
              });
            } catch (error) {
              errors.push(`${serialNumber}: ${error.message}`);
            }
          }

          continue;
        }

        // =========================================================
        // NON-SERIALIZED PRODUCTS
        // =========================================================
        const repairTransfer = await RepairTransfer.findOne({
          product: productId,
          toCenter: repairCenterId,
          repairedQty: { $gte: quantity },
        });

        if (!repairTransfer) {
          errors.push(
            `No repair transfer with sufficient repaired quantity found for ${productDoc.productTitle}`
          );
          continue;
        }

        repairTransfer.markAsPendingTransfer(
          quantity,
          outletId,
          transferredBy,
          remark,
          []
        );

        await repairTransfer.save();

        let outletStock = await OutletStock.findOne({
          outlet: outletId,
          product: productId,
        });

        if (!outletStock) {
          outletStock = new OutletStock({
            outlet: outletId,
            product: productId,
            totalQuantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            repairedQuantity: 0,
            transferredRepairedQty: 0,
            pendingRepairedQty: 0,
            pendingSerials: [],
          });
        }

        outletStock.pendingRepairedQty =
          (outletStock.pendingRepairedQty || 0) + quantity;

        await outletStock.save();

        transferResults.push({
          product: productDoc.productTitle,
          productId,
          quantity,
          repairTransferId: repairTransfer._id,
          status: "pending_transfer",
          isSerialized: false,
        });
      } catch (error) {
        errors.push(
          `Error processing product ${item.productId || "unknown"}: ${error.message}`
        );
      }
    }

    if (transferResults.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to transfer any repaired items",
        errors,
      });
    }

    return res.json({
      success: true,
      message: `Processed ${transferResults.length} transfer item(s)`,
      data: {
        transfers: transferResults,
        summary: {
          totalProducts: transferResults.length,
          totalQuantity: transferResults.reduce(
            (sum, item) => sum + item.quantity,
            0
          ),
        },
        ...(errors.length > 0
          ? { errors, partialSuccess: true }
          : {}),
      },
    });
  } catch (error) {
    console.error("Transfer repaired to main warehouse error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Failed to transfer repaired items to main warehouse",
    });
  }
};

export const transferRepairedToResellerStock = async (req, res) => {
  try {
    const { items, transferRemark } = req.body;
    const transferredBy = req.user.id;
    const sourceOutletId = req.user.center;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required",
      });
    }

    const Product = mongoose.model("Product");
    const OutletStock = mongoose.model("OutletStock");
    const ResellerStock = mongoose.model("ResellerStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
    const FaultyStock = mongoose.model("FaultyStock");
    const Reseller = mongoose.model("Reseller");

    const transferResults = [];
    const errors = [];

    for (const item of items) {
      try {
        const {
          outletStockId,
          productId,
          quantity,
          serialNumbers,
          resellerId
        } = item;

        if (!resellerId) {
          errors.push(`Reseller ID is required for item: ${productId}`);
          continue;
        }

        const reseller = await Reseller.findById(resellerId);

        if (!reseller) {
          errors.push(`Reseller not found: ${resellerId}`);
          continue;
        }

        const productDoc = await Product.findById(productId);

        if (!productDoc) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        const outletStock = await OutletStock.findById(outletStockId);

        if (!outletStock) {
          errors.push(`Outlet stock not found for ID: ${outletStockId}`);
          continue;
        }

        console.log(`\n=== Processing ${productDoc.productTitle} ===`);
        console.log(`Source Outlet: ${sourceOutletId}`);
        console.log(`Destination Reseller: ${resellerId} (${reseller.businessName})`);
        console.log(`Requested quantity: ${quantity}`);
        console.log("OutletStock BEFORE update:");
        console.log(`- repairedQuantity: ${outletStock.repairedQuantity || 0}`);
        console.log(`- transferredRepairedQty: ${outletStock.transferredRepairedQty || 0}`);

        const availableRepaired = outletStock.repairedQuantity || 0;

        console.log(`Available repaired for transfer: ${availableRepaired}`);

        if (availableRepaired < quantity) {
          errors.push(
            `Insufficient repaired items available for transfer. Available: ${availableRepaired}, Requested: ${quantity}`
          );
          continue;
        }

        let serialsToTransfer = [];

        if (productDoc.trackSerialNumber === "Yes") {
          if (
            !serialNumbers ||
            !Array.isArray(serialNumbers) ||
            serialNumbers.length === 0
          ) {
            errors.push(
              `Serial numbers are required for product: ${productDoc.productTitle}`
            );
            continue;
          }

          if (serialNumbers.length !== quantity) {
            errors.push(
              `Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length}) for product ${productDoc.productTitle}`
            );
            continue;
          }

          const availableRepairedSerials = outletStock.serialNumbers.filter(
            sn =>
              serialNumbers.includes(sn.serialNumber) &&
              sn.status === "available" &&
              sn.sourceType === "repair_return"
          );

          if (availableRepairedSerials.length !== quantity) {
            const missingSerials = serialNumbers.filter(
              sn => !availableRepairedSerials
                .map(as => as.serialNumber)
                .includes(sn)
            );

            errors.push(
              `Some serials are not available or not from repair stock: ${missingSerials.join(", ")}`
            );
            continue;
          }

          serialsToTransfer = serialNumbers;

          console.log(
            `Processing ${serialsToTransfer.length} serial numbers: ${serialsToTransfer.join(", ")}`
          );
        } else {
          console.log(
            `Processing non-serialized product: ${productDoc.productTitle}`
          );

          if (quantity > availableRepaired) {
            errors.push(
              `Insufficient repaired stock. Available: ${availableRepaired}, Requested: ${quantity}`
            );
            continue;
          }

          serialsToTransfer = [`REPAIR-BATCH-${Date.now()}`];

          console.log(`Non-serialized transfer of ${quantity} items`);
        }

        // Update outlet stock.
        if (productDoc.trackSerialNumber === "Yes") {
          outletStock.serialNumbers = outletStock.serialNumbers.map(sn => {
            if (serialsToTransfer.includes(sn.serialNumber)) {
              const transferRecord = {
                fromCenter: sourceOutletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: transferRemark ||
                  `Transferred repaired item to reseller ${reseller.businessName}`,
                transferredBy
              };

              const transferHistory = Array.isArray(sn.transferHistory)
                ? sn.transferHistory
                : [];

              return {
                ...sn.toObject(),
                status: "transferred",
                currentLocation: null,
                transferHistory: [...transferHistory, transferRecord]
              };
            }

            return sn;
          });

          outletStock.availableQuantity -= quantity;
          outletStock.totalQuantity -= quantity;
        } else {
          outletStock.availableQuantity -= quantity;
          outletStock.totalQuantity -= quantity;

          const repairSerialIndex = outletStock.serialNumbers.findIndex(
            sn => sn.sourceType === "repair_return" &&
              sn.status === "available"
          );

          if (repairSerialIndex !== -1) {
            const batchSerial = outletStock.serialNumbers[repairSerialIndex];
            const batchQty = batchSerial.batchQuantity || 1;

            if (quantity >= batchQty) {
              outletStock.serialNumbers[repairSerialIndex].status = "transferred";
              outletStock.serialNumbers[repairSerialIndex].currentLocation = null;

              const transferHistory = Array.isArray(batchSerial.transferHistory)
                ? batchSerial.transferHistory
                : [];

              outletStock.serialNumbers[repairSerialIndex].transferHistory = [
                ...transferHistory,
                {
                  fromCenter: sourceOutletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  sourceType: "damage_repair",
                  referenceId: outletStock._id,
                  transferredQuantity: quantity,
                  remark: transferRemark ||
                    `Transferred ${quantity} repaired items to reseller ${reseller.businessName}`,
                  transferredBy
                }
              ];
            } else {
              outletStock.serialNumbers[repairSerialIndex].batchQuantity =
                batchQty - quantity;

              const transferHistory = Array.isArray(batchSerial.transferHistory)
                ? batchSerial.transferHistory
                : [];

              outletStock.serialNumbers[repairSerialIndex].transferHistory = [
                ...transferHistory,
                {
                  fromCenter: sourceOutletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  sourceType: "damage_repair",
                  referenceId: outletStock._id,
                  transferredQuantity: quantity,
                  remark: transferRemark ||
                    `Transferred ${quantity} repaired items to reseller ${reseller.businessName}`,
                  transferredBy
                }
              ];
            }
          }
        }

        outletStock.transferredRepairedQty =
          (outletStock.transferredRepairedQty || 0) + quantity;

        outletStock.repairedQuantity = Math.max(
          0,
          (outletStock.repairedQuantity || 0) - quantity
        );

        await outletStock.save();
        console.log("✓ Updated OutletStock");

        // 2. ADD / UPDATE RESELLER STOCK
        console.log("\n=== UPDATING RESELLER STOCK ===");

        let resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId
        });

        const transferRecord = {
          fromCenter: sourceOutletId,
          toReseller: resellerId,
          transferDate: new Date(),
          transferType: "outlet_to_reseller",
          sourceType: "damage_repair",
          referenceId: outletStock._id,
          remark: transferRemark || "Transferred repaired items from outlet",
          transferredBy
        };

        if (!resellerStock) {
          resellerStock = new ResellerStock({
            reseller: resellerId,
            product: productId,
            availableQuantity: quantity,
            totalQuantity: quantity,
            sourceBreakdown: {
              damageRepairQuantity: quantity
            }
          });

          if (productDoc.trackSerialNumber === "Yes") {
            resellerStock.serialNumbers = serialsToTransfer.map(sn => ({
              serialNumber: sn,
              status: "available",
              currentLocation: null,
              transferHistory: [transferRecord]
            }));
          } else {
            resellerStock.serialNumbers = [{
              serialNumber: `REPAIR-BATCH-${Date.now()}`,
              status: "available",
              currentLocation: null,
              transferHistory: [transferRecord]
            }];
          }

          console.log(`Created new ResellerStock for ${reseller.businessName}`);
        } else {
          resellerStock.availableQuantity += quantity;
          resellerStock.totalQuantity += quantity;

          resellerStock.sourceBreakdown.damageRepairQuantity =
            (resellerStock.sourceBreakdown.damageRepairQuantity || 0) + quantity;

          if (productDoc.trackSerialNumber === "Yes") {
            for (const serialNumber of serialsToTransfer) {
              const existingSerial = resellerStock.serialNumbers.find(
                sn => sn.serialNumber === serialNumber
              );

              if (!existingSerial) {
                resellerStock.serialNumbers.push({
                  serialNumber,
                  status: "available",
                  currentLocation: null,
                  transferHistory: [transferRecord]
                });
              } else {
                existingSerial.status = "available";

                if (!Array.isArray(existingSerial.transferHistory)) {
                  existingSerial.transferHistory = [];
                }

                existingSerial.transferHistory.push(transferRecord);
              }
            }
          } else {
            const existingBatch = resellerStock.serialNumbers.find(
              sn => sn.serialNumber.startsWith("REPAIR-BATCH-")
            );

            if (!existingBatch) {
              resellerStock.serialNumbers.push({
                serialNumber: `REPAIR-BATCH-${Date.now()}`,
                status: "available",
                currentLocation: null,
                transferHistory: [transferRecord]
              });
            } else {
              if (!Array.isArray(existingBatch.transferHistory)) {
                existingBatch.transferHistory = [];
              }

              existingBatch.transferHistory.push(transferRecord);
            }
          }

          console.log(`Updated existing ResellerStock for ${reseller.businessName}`);
        }

        resellerStock.lastUpdated = new Date();
        await resellerStock.save();

        console.log(
          `✓ Updated ResellerStock - Available: ${resellerStock.availableQuantity}, Total: ${resellerStock.totalQuantity}`
        );

        // 3. UPDATE FAULTY STOCK STATUS
        console.log("\n=== UPDATING FAULTY STOCK ===");

        if (productDoc.trackSerialNumber === "Yes") {
          const faultyStock = await FaultyStock.findOne({
            product: productId,
            isSerialized: true,
            "serialNumbers.serialNumber": { $in: serialsToTransfer },
            "serialNumbers.status": "repaired"
          });

          if (faultyStock) {
            console.log(`✓ Found FaultyStock: ${faultyStock._id}`);

            for (const serialNumber of serialsToTransfer) {
              for (let i = 0; i < faultyStock.serialNumbers.length; i++) {
                if (
                  faultyStock.serialNumbers[i].serialNumber === serialNumber &&
                  faultyStock.serialNumbers[i].status === "repaired"
                ) {
                  faultyStock.serialNumbers[i].status = "transferred";

                  if (!faultyStock.serialNumbers[i].repairHistory) {
                    faultyStock.serialNumbers[i].repairHistory = [];
                  }

                  faultyStock.serialNumbers[i].repairHistory.push({
                    date: new Date(),
                    status: "transferred",
                    remark: `Transferred to reseller ${reseller.businessName}`,
                    quantity: 1,
                    repairedQty: 0,
                    irrepairedQty: 0,
                    updatedBy: transferredBy
                  });

                  console.log(
                    `Updated serial ${serialNumber} to "transferred" in FaultyStock`
                  );
                }
              }
            }

            const transferredCount = faultyStock.serialNumbers.filter(
              sn => sn.status === "transferred"
            ).length;

            const repairedCount = faultyStock.serialNumbers.filter(
              sn => sn.status === "repaired"
            ).length;

            faultyStock.transferredQty = transferredCount;
            faultyStock.repairedQty = repairedCount;

            if (faultyStock.transferredQty === faultyStock.quantity) {
              faultyStock.overallStatus = "transferred";
            } else if (faultyStock.transferredQty > 0) {
              faultyStock.overallStatus = "partially_repaired";
            }

            faultyStock.lastRepairUpdate = new Date();
            await faultyStock.save();

            console.log(
              `✓ Updated FaultyStock - transferredQty: ${faultyStock.transferredQty}, repairedQty: ${faultyStock.repairedQty}, status: ${faultyStock.overallStatus}`
            );
          } else {
            console.log("⚠ Could not find FaultyStock for serialized product");
          }
        } else {
          const faultyStock = await FaultyStock.findOne({
            product: productId,
            isSerialized: false,
            repairedQty: { $gte: quantity },
            $or: [
              { toCenter: sourceOutletId },
              { center: sourceOutletId }
            ]
          }).sort({ createdAt: -1 });

          if (faultyStock) {
            console.log(`✓ Found FaultyStock: ${faultyStock._id}`);
            console.log(
              `Before update - Total: ${faultyStock.quantity}, Repaired: ${faultyStock.repairedQty}, Transferred: ${faultyStock.transferredQty}, Damage: ${faultyStock.damageQty}`
            );

            if ((faultyStock.repairedQty || 0) < quantity) {
              console.log(
                `⚠ Not enough repaired items. Available: ${faultyStock.repairedQty}, Requested: ${quantity}`
              );
            } else {
              faultyStock.repairedQty = Math.max(
                0,
                (faultyStock.repairedQty || 0) - quantity
              );

              faultyStock.transferredQty =
                (faultyStock.transferredQty || 0) + quantity;

              if (!faultyStock.repairHistory) {
                faultyStock.repairHistory = [];
              }

              faultyStock.repairHistory.push({
                date: new Date(),
                action: "transfer_to_reseller",
                remark: `Transferred ${quantity} repaired items to reseller ${reseller.businessName}`,
                quantity,
                previousRepairedQty: faultyStock.repairedQty + quantity,
                newRepairedQty: faultyStock.repairedQty,
                previousTransferredQty: faultyStock.transferredQty - quantity,
                newTransferredQty: faultyStock.transferredQty,
                updatedBy: transferredBy
              });

              if (faultyStock.updateQuantitiesAndStatus) {
                faultyStock.updateQuantitiesAndStatus();
              } else {
                const totalProcessed =
                  (faultyStock.repairedQty || 0) +
                  (faultyStock.irrepairedQty || 0) +
                  (faultyStock.transferredQty || 0) +
                  (faultyStock.underRepairQty || 0);

                const totalQuantity = faultyStock.quantity || 0;

                if (faultyStock.transferredQty === totalQuantity) {
                  faultyStock.overallStatus = "transferred";
                } else if (
                  faultyStock.transferredQty > 0 &&
                  totalProcessed < totalQuantity
                ) {
                  faultyStock.overallStatus = "partially_repaired";
                } else if (faultyStock.repairedQty === totalQuantity) {
                  faultyStock.overallStatus = "repaired";
                } else if (faultyStock.repairedQty > 0) {
                  faultyStock.overallStatus = "partially_repaired";
                } else if (faultyStock.damageQty > 0) {
                  faultyStock.overallStatus = "damaged";
                }
              }

              faultyStock.lastRepairUpdate = new Date();
              await faultyStock.save();

              console.log(
                `After update - Total: ${faultyStock.quantity}, Repaired: ${faultyStock.repairedQty}, Transferred: ${faultyStock.transferredQty}, Damage: ${faultyStock.damageQty}, Status: ${faultyStock.overallStatus}`
              );
            }
          } else {
            console.log(
              `⚠ Could not find FaultyStock for non-serialized product ${productDoc.productTitle}`
            );
          }
        }

        transferResults.push({
          productId,
          productName: productDoc.productTitle,
          quantity,
          serialNumbers: serialsToTransfer,
          fromOutlet: sourceOutletId,
          toReseller: resellerId,
          resellerName: reseller.businessName,
          outletStockId: outletStock._id,
          resellerStockId: resellerStock._id,
          sourceType: "damage_repair",
          outletStockUpdate: {
            newRepairedQuantity: outletStock.repairedQuantity,
            newTransferredRepairedQty: outletStock.transferredRepairedQty,
            newAvailableQuantity: outletStock.availableQuantity,
            newTotalQuantity: outletStock.totalQuantity
          },
          resellerStockUpdate: {
            newAvailableQuantity: resellerStock.availableQuantity,
            newTotalQuantity: resellerStock.totalQuantity,
            newDamageRepairQuantity: resellerStock.sourceBreakdown.damageRepairQuantity
          },
          status: "success",
          message: `Transferred ${quantity} repaired ${productDoc.trackSerialNumber === "Yes" ? "serialized" : "non-serialized"} items to reseller`
        });

        console.log(`✅ Successfully transferred ${quantity} items to reseller`);

      } catch (error) {
        console.error("Error transferring item:", error);
        errors.push(
          `Error transferring ${item.productId || "item"}: ${error.message}`
        );
      }
    }

    const response = {
      success: transferResults.length > 0,
      message: transferResults.length > 0
        ? `Transferred ${transferResults.length} items to reseller`
        : "No items transferred",
      data: {
        transferred: transferResults,
        errors: errors.length > 0 ? errors : undefined
      }
    };

    if (errors.length > 0) {
      response.partialSuccess = transferResults.length > 0;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error("Transfer to reseller error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer to reseller stock",
    });
  }
};

export const getRepairedProductsInOutletStock = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");

    const {
      page = 1,
      limit = 100,
      search = ""
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
      const products = await Product.find({
        $or: [
          { productTitle: { $regex: search, $options: "i" } },
          { productCode: { $regex: search, $options: "i" } }
        ]
      }).select("_id");

      filter.product = { $in: products.map(product => product._id) };
    }

    const outletStocks = await OutletStock.find(filter)
      .populate("outlet", "centerName centerCode")
      .populate("product", "productTitle productCode trackSerialNumber")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const repairedProducts = outletStocks
      .filter(stock => (stock.repairedQuantity || 0) > 0)
      .map(stock => ({
        _id: stock._id,
        outlet: stock.outlet,
        product: stock.product,
        repairedQuantity: stock.repairedQuantity || 0,
        transferredRepairedQty: stock.transferredRepairedQty || 0,
        availableRepairedQuantity: Math.max(
          0,
          (stock.repairedQuantity || 0) - (stock.transferredRepairedQty || 0)
        ),
        serialNumbers: (stock.serialNumbers || []).filter(
          serial => serial.status === "available" &&
            serial.sourceType === "repair_return"
        ),
        updatedAt: stock.updatedAt
      }));

    const total = await OutletStock.countDocuments(filter);

    res.json({
      success: true,
      data: repairedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error("Get repaired products in outlet stock error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch repaired products in outlet stock"
    });
  }
};

export const getAllFaultyStockForWarehouse = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const FaultyStock = mongoose.model("FaultyStock");
    const Product = mongoose.model("Product");

    const {
      page = 1,
      limit = 100,
      status = "all",
      search = ""
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      $or: [
        { center: userCenter?._id || req.user.center },
        { toCenter: userCenter?._id || req.user.center }
      ]
    };

    if (status && status !== "all") {
      filter.overallStatus = status;
    }

    if (search) {
      const products = await Product.find({
        $or: [
          { productTitle: { $regex: search, $options: "i" } },
          { productCode: { $regex: search, $options: "i" } }
        ]
      }).select("_id");

      filter.product = { $in: products.map(product => product._id) };
    }

    const faultyStocks = await FaultyStock.find(filter)
      .populate("product", "productTitle productCode trackSerialNumber")
      .populate("center", "centerName centerCode")
      .populate("toCenter", "centerName centerCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await FaultyStock.countDocuments(filter);

    const summary = await FaultyStock.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$overallStatus",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          repairedQuantity: { $sum: "$repairedQty" },
          irreparableQuantity: { $sum: "$irrepairedQty" },
          transferredQuantity: { $sum: "$transferredQty" }
        }
      }
    ]);

    res.json({
      success: true,
      data: faultyStocks,
      summary,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error("Get all faulty stock for warehouse error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch faulty stock for warehouse"
    });
  }
};

export const getAllFaultyStockForRepairing = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["view_usage_own_center", "view_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_usage_own_center or view_usage_all_center permission required.",
      });
    }

    const {
      startDate,
      endDate,
      centerId,
      productId,
      search,
      status = "under_repair",
      simplified = "true"
    } = req.query;

    const filter = {
      toCenter: userCenter?._id || req.user.center,
      $or: [
        { "serialNumbers.status": { $in: ["under_repair", "pending_under_repair"] } },
        { underRepairQty: { $gt: 0 } },
        { pendingUnderRepairQty: { $gt: 0 } }
      ]
    };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
      filter.fromCenter = centerId;
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.product = productId;
    }

    if (status && status !== "all") {
      if (status === "under_repair") {
        filter.$or = [
          { "serialNumbers.status": "under_repair" },
          { underRepairQty: { $gt: 0 } }
        ];
      } else if (status === "pending_under_repair") {
        filter.$or = [
          { "serialNumbers.status": "pending_under_repair" },
          { pendingUnderRepairQty: { $gt: 0 } }
        ];
      }
    }

    if (search) {
      filter.$or = [
        ...(filter.$or || []),
        { "productDetails.productTitle": { $regex: search, $options: "i" } },
        { "serialNumbers.serialNumber": { $regex: search, $options: "i" } }
      ];
    }

    const repairTransfers = await RepairTransfer.find(filter)
      .populate(
        "product",
        "productTitle productCode trackSerialNumber category unit productPrice"
      )
      .sort({ date: -1, updatedAt: -1 });

    const productMap = new Map();

    for (const transfer of repairTransfers) {
      const productId = transfer.product._id.toString();

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          productName: transfer.product.productTitle,
          isSerialized: transfer.product.trackSerialNumber === "Yes",
          totalTransferred: 0,
          underRepairQuantity: 0,
          pendingUnderRepairQuantity: 0,
          availableForRepairQuantity: 0
        });
      }

      const productData = productMap.get(productId);

      productData.totalTransferred += transfer.quantity;
      productData.underRepairQuantity += transfer.underRepairQty || 0;
      productData.pendingUnderRepairQuantity += transfer.pendingUnderRepairQty || 0;

      const totalRepaired = transfer.repairedQty || 0;
      const totalIrrepaired = transfer.irrepairedQty || 0;
      const totalReturned = transfer.returnedQty || 0;
      const totalProcessed = totalRepaired + totalIrrepaired + totalReturned;

      productData.availableForRepairQuantity += Math.max(
        0,
        transfer.quantity - totalProcessed
      );
    }

    const faultyProducts = Array.from(productMap.values())
      .sort((a, b) => b.underRepairQuantity - a.underRepairQuantity);

    const shouldSimplify = simplified === "true";

    if (shouldSimplify) {
      const simplifiedData = faultyProducts.map(product => ({
        productId: product.productId,
        productName: product.productName,
        isSerialized: product.isSerialized,
        underRepairQuantity: product.underRepairQuantity,
        availableForRepairQuantity: product.availableForRepairQuantity
      }));

      res.json({
        success: true,
        data: simplifiedData,
        totalProducts: faultyProducts.length,
        totalUnderRepairItems: faultyProducts.reduce(
          (sum, product) => sum + product.underRepairQuantity,
          0
        ),
        totalAvailableForRepair: faultyProducts.reduce(
          (sum, product) => sum + product.availableForRepairQuantity,
          0
        )
      });
    } else {
      const fullData = faultyProducts.map(product => {
        const matchingTransfer = repairTransfers.find(
          transfer => transfer.product._id.toString() === product.productId
        );

        return {
          productId: product.productId,
          productName: product.productName,
          productCode: matchingTransfer?.product?.productCode || "",
          isSerialized: product.isSerialized,
          category: matchingTransfer?.product?.category || "",
          unit: matchingTransfer?.product?.unit || "",
          productPrice: matchingTransfer?.product?.productPrice || 0,
          totalTransferred: product.totalTransferred,
          underRepairQuantity: product.underRepairQuantity,
          pendingUnderRepairQuantity: product.pendingUnderRepairQuantity,
          availableForRepairQuantity: product.availableForRepairQuantity,
          totalValue: product.totalTransferred *
            (matchingTransfer?.product?.productPrice || 0)
        };
      });

      res.json({
        success: true,
        data: fullData
      });
    }
  } catch (error) {
    console.error("Get faulty stock for repairing error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch faulty stock for repairing"
    });
  }
};
export const acceptRepairedTransfer = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(req, [
      "manage_usage_own_center",
      "manage_usage_all_center",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const { repairTransferId, outletId, serialNumbers, remark } = req.body;
    const acceptedBy = req.user.id;

    if (
      !mongoose.Types.ObjectId.isValid(repairTransferId) ||
      !mongoose.Types.ObjectId.isValid(outletId) ||
      !Array.isArray(serialNumbers) ||
      serialNumbers.length === 0 ||
      serialNumbers.some(
        (serial) => typeof serial !== "string" || !serial.trim()
      ) ||
      new Set(serialNumbers).size !== serialNumbers.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid repairTransferId, outletId, and unique serialNumbers are required.",
      });
    }

    const result = await session.withTransaction(async () => {
      const repairTransfer = await RepairTransfer.findById(
        repairTransferId
      ).session(session);

      if (!repairTransfer) {
        throw new Error("Repair transfer not found.");
      }

      const authorizedCenterId = userCenter?._id || userCenter;

      if (
        !authorizedCenterId ||
        String(repairTransfer.toCenter) !== String(authorizedCenterId)
      ) {
        throw new Error("You are not authorized to accept this transfer.");
      }

      const OutletStockModel = mongoose.model("OutletStock");
      const Center = mongoose.model("Center");

      const outlet = await Center.findById(outletId).session(session);

      if (!outlet || outlet.centerType !== "Outlet") {
        throw new Error("Destination must be a valid outlet.");
      }

      // Find the pending transfer detail for this outlet.
      const pendingDetailIndex =
        repairTransfer.pendingTransferDetails.findIndex(
          (detail) =>
            String(detail.outletId) === String(outletId) &&
            detail.status === "pending"
        );

      if (pendingDetailIndex === -1) {
        throw new Error(
          "No pending transfer detail found for this outlet."
        );
      }

      const pendingDetail =
        repairTransfer.pendingTransferDetails[pendingDetailIndex];

      if (pendingDetail.quantity < serialNumbers.length) {
        throw new Error(
          "Pending transfer quantity is less than the requested acceptance quantity."
        );
      }

      const outletStock = await OutletStockModel.findOne({
        outlet: outletId,
        product: repairTransfer.product,
      }).session(session);

      if (!outletStock) {
        throw new Error("Pending outlet stock record not found.");
      }

      // Validate every serial before changing any of them.
      for (const serialNumber of serialNumbers) {
        const transferSerial = repairTransfer.serialNumbers.find(
          (serial) => serial.serialNumber === serialNumber
        );

        if (
          !transferSerial ||
          transferSerial.status !== "pending_transfer"
        ) {
          throw new Error(
            `Serial ${serialNumber} is not pending transfer.`
          );
        }

        const pendingStockSerial = outletStock.pendingSerials.find(
          (serial) =>
            serial.serialNumber === serialNumber &&
            String(serial.repairTransferId) ===
              String(repairTransfer._id) &&
            serial.status === "pending_transfer"
        );

        if (!pendingStockSerial) {
          throw new Error(
            `Pending outlet entry not found for serial ${serialNumber}.`
          );
        }

        const existingStockSerial = outletStock.serialNumbers.find(
          (serial) => serial.serialNumber === serialNumber
        );

        if (existingStockSerial) {
          throw new Error(
            `Serial ${serialNumber} already exists in outlet stock.`
          );
        }
      }

      // Accept the validated serials.
      for (const serialNumber of serialNumbers) {
        const transferSerial = repairTransfer.serialNumbers.find(
          (serial) => serial.serialNumber === serialNumber
        );

        const pendingStockSerial = outletStock.pendingSerials.find(
          (serial) =>
            serial.serialNumber === serialNumber &&
            String(serial.repairTransferId) ===
              String(repairTransfer._id) &&
            serial.status === "pending_transfer"
        );

        outletStock.pendingSerials =
  outletStock.pendingSerials.filter(
    (serial) =>
      !(
        serial.serialNumber === serialNumber &&
        String(serial.repairTransferId) ===
          String(repairTransfer._id)
      )
  );

        outletStock.serialNumbers.push({
          serialNumber,
          status: "available",
          sourceType: "repair_return",
          currentLocation: outletId,
          transferHistory: [],
        });

        transferSerial.status = "transferred";

        transferSerial.repairHistory.push({
          date: new Date(),
          status: "transferred",
          remark: remark || "Repaired stock accepted at outlet.",
          quantity: 1,
          updatedBy: acceptedBy,
          transferStatus: "accepted",
          destinationOutlet: outletId,
        });
      }

      const acceptedQuantity = serialNumbers.length;
      const remainingQuantity =
        pendingDetail.quantity - acceptedQuantity;

      // Never save a pending detail with quantity 0.
      if (remainingQuantity === 0) {
        repairTransfer.pendingTransferDetails.splice(
          pendingDetailIndex,
          1
        );

        repairTransfer.pendingTransferDetails.push({
          outletId,
          quantity: acceptedQuantity,
          transferredBy: pendingDetail.transferredBy,
          transferredAt: pendingDetail.transferredAt,
          remark: remark || pendingDetail.remark,
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy,
        });
      } else {
        // Keep the pending quantity and record the accepted portion separately.
        pendingDetail.quantity = remainingQuantity;

        repairTransfer.pendingTransferDetails.push({
          outletId,
          quantity: acceptedQuantity,
          transferredBy: pendingDetail.transferredBy,
          transferredAt: pendingDetail.transferredAt,
          remark: remark || pendingDetail.remark,
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy,
        });
      }

      repairTransfer.pendingTransferQty = Math.max(
        0,
        (repairTransfer.pendingTransferQty || 0) - acceptedQuantity
      );

      repairTransfer.repairUpdates.push({
        date: new Date(),
        status: "transferred",
        remark: remark || "Repaired stock accepted at outlet.",
        quantity: acceptedQuantity,
        updatedBy: acceptedBy,
        transferStatus: "accepted",
        destinationOutlet: outletId,
        acceptedAt: new Date(),
        acceptedBy,
      });

      outletStock.pendingRepairedQty = Math.max(
        0,
        (outletStock.pendingRepairedQty || 0) - acceptedQuantity
      );

      outletStock.repairedQuantity =
        (outletStock.repairedQuantity || 0) + acceptedQuantity;

      outletStock.totalQuantity =
        (outletStock.totalQuantity || 0) + acceptedQuantity;

      outletStock.availableQuantity =
        (outletStock.availableQuantity || 0) + acceptedQuantity;

      repairTransfer.updateStatusAndQuantities();

      await outletStock.save({ session });
      await repairTransfer.save({ session });

      return {
        repairTransferId: repairTransfer._id,
        outletId,
        acceptedSerialNumbers: serialNumbers,
        acceptedQuantity,
        pendingTransferQty: repairTransfer.pendingTransferQty,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Repaired transfer accepted successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Accept repaired transfer error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to accept repaired transfer.",
    });
  } finally {
    await session.endSession();
  }
};