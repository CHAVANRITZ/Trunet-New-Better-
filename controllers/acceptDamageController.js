import mongoose from "mongoose";

const checkStockUsagePermissions = (req, requiredPermissions = []) => {
  const contextPermissions = Array.isArray(
    req.authorizationContext?.permissions
  )
    ? req.authorizationContext.permissions
    : null;

  const rolePermissions = req.user?.role?.permissions || [];

  const usageModule = rolePermissions.find(
    (perm) =>
      perm &&
      typeof perm === "object" &&
      perm.module?.toLowerCase() === "usage" &&
      Array.isArray(perm.permissions)
  );

  const permissionsList =
    contextPermissions || usageModule?.permissions || [];

  const permissions = {
    manage_usage_own_center: permissionsList.includes(
      "manage_usage_own_center"
    ),
    manage_usage_all_center: permissionsList.includes(
      "manage_usage_all_center"
    ),
    view_usage_own_center: permissionsList.includes(
      "view_usage_own_center"
    ),
    view_usage_all_center: permissionsList.includes(
      "view_usage_all_center"
    ),
    allow_edit_usage: permissionsList.includes("allow_edit_usage"),
    accept_damage_return: permissionsList.includes("accept_damage_return"),
  };

  return {
    hasAccess: requiredPermissions.some(
      (permission) => permissions[permission]
    ),
    permissions,
    userCenter:
      req.user?.fullUser?.center ||
      req.user?.center ||
      req.selectedCenterId ||
      null,
  };
};

export const acceptDamageItems = async (req, res) => {
  try {
    const { faultyStockId, acceptedQuantities } = req.body;
    const userId = req.user.id || req.user._id;

    const FaultyStock = mongoose.model("FaultyStock");
    const faultyStock = await FaultyStock.findById(faultyStockId);

    if (!faultyStock) {
      return res.status(404).json({
        success: false,
        message: "Faulty stock entry not found",
      });
    }

    if (
      faultyStock.overallStatus !== "pending_damage" &&
      faultyStock.pendingDamageQty <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No pending damage items to accept",
      });
    }

    console.log(`Accepting damage for faulty stock: ${faultyStockId}`);
    console.log(`Pending damage quantity: ${faultyStock.pendingDamageQty}`);
    console.log("Accepted quantities:", acceptedQuantities);

    try {
      faultyStock.acceptPendingDamage(
        acceptedQuantities,
        userId,
        "Damage accepted and verified"
      );

      await faultyStock.save();

      return res.status(200).json({
        success: true,
        message: "Damage items accepted successfully",
        data: {
          faultyStockId: faultyStock._id,
          overallStatus: faultyStock.overallStatus,
          totalQuantity: faultyStock.quantity,
          damageQty: faultyStock.damageQty,
          pendingDamageQty: faultyStock.pendingDamageQty,
          pendingDamageHistoryUpdated: faultyStock.pendingDamageHistory
            .filter((entry) => entry.status === "accepted")
            .map((entry) => ({
              date: entry.date,
              quantity: entry.quantity,
              serialNumbers: entry.serialNumbers,
            })),
        },
      });
    } catch (methodError) {
      console.error(
        "Error in acceptPendingDamage method:",
        methodError
      );

      return res.status(400).json({
        success: false,
        message:
          methodError.message || "Failed to accept damage items",
      });
    }
  } catch (error) {
    console.error("Accept damage error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to accept damage items",
    });
  }
};

export const rejectDamageItems = async (req, res) => {
  try {
    const { faultyStockId, rejectedQuantities, remark } = req.body;
    const userId = req.user.id || req.user._id;

    const FaultyStock = mongoose.model("FaultyStock");
    const faultyStock = await FaultyStock.findById(faultyStockId);

    if (!faultyStock) {
      return res.status(404).json({
        success: false,
        message: "Faulty stock entry not found",
      });
    }

    if (
      faultyStock.overallStatus !== "pending_damage" &&
      faultyStock.pendingDamageQty <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No pending damage items to reject",
      });
    }

    console.log(`Rejecting damage for faulty stock: ${faultyStockId}`);

    if (faultyStock.isSerialized) {
      if (
        rejectedQuantities &&
        Array.isArray(rejectedQuantities)
      ) {
        faultyStock.serialNumbers = faultyStock.serialNumbers.filter(
          (serial) =>
            !rejectedQuantities.includes(serial.serialNumber) ||
            serial.status !== "pending_damage"
        );
      } else {
        faultyStock.serialNumbers = faultyStock.serialNumbers.filter(
          (serial) => serial.status !== "pending_damage"
        );
      }
    } else {
      const totalRejected =
        rejectedQuantities && rejectedQuantities.totalRejectedQty
          ? rejectedQuantities.totalRejectedQty
          : faultyStock.pendingDamageQty;

      faultyStock.pendingDamageQty = Math.max(
        0,
        faultyStock.pendingDamageQty - totalRejected
      );

      if (!faultyStock.repairHistory) {
        faultyStock.repairHistory = [];
      }

      faultyStock.repairHistory.push({
        date: new Date(),
        status: "rejected",
        remark: remark || `Rejected ${totalRejected} damage items`,
        quantity: totalRejected,
        repairedQty: 0,
        irrepairedQty: 0,
        updatedBy: userId,
      });
    }

    if (faultyStock.isSerialized) {
      const hasPending = faultyStock.serialNumbers.some(
        (serial) => serial.status === "pending_damage"
      );

      faultyStock.overallStatus = hasPending
        ? "pending_damage"
        : "damaged";
    } else {
      faultyStock.overallStatus =
        faultyStock.pendingDamageQty > 0
          ? "pending_damage"
          : "damaged";
    }

    if (
      faultyStock.quantity === 0 &&
      faultyStock.pendingDamageQty === 0 &&
      (!faultyStock.serialNumbers ||
        faultyStock.serialNumbers.length === 0)
    ) {
      await FaultyStock.findByIdAndDelete(faultyStockId);

      return res.status(200).json({
        success: true,
        message: "All damage items rejected, entry removed",
        data: { removed: true },
      });
    }

    faultyStock.updateQuantitiesAndStatus();
    await faultyStock.save();

    return res.status(200).json({
      success: true,
      message: "Damage items rejected successfully",
      data: {
        faultyStockId: faultyStock._id,
        overallStatus: faultyStock.overallStatus,
        totalQuantity: faultyStock.quantity,
        damageQty: faultyStock.damageQty,
        pendingDamageQty: faultyStock.pendingDamageQty,
      },
    });
  } catch (error) {
    console.error("Reject damage error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reject damage items",
    });
  }
};

export const acceptRepairTransfer = async (req, res) => {
  try {
    const { transferId, acceptedQuantities, remark } = req.body;
    const acceptedBy = req.user.id || req.user._id;

    if (!transferId) {
      return res.status(400).json({
        success: false,
        message: "Transfer ID is required",
      });
    }

    const RepairTransfer = mongoose.model("RepairTransfer");
    const FaultyStock = mongoose.model("FaultyStock");

    const repairTransfer = await RepairTransfer.findById(transferId)
      .populate("product", "productTitle trackSerialNumber");

    if (!repairTransfer) {
      return res.status(404).json({
        success: false,
        message: "Repair transfer not found",
      });
    }

    if (repairTransfer.status !== "pending_under_repair") {
      return res.status(400).json({
        success: false,
        message:
          `Transfer is not in pending status. Current: ${repairTransfer.status}`,
      });
    }

    const faultyStock = await FaultyStock.findById(
      repairTransfer.faultyStock
    );

    if (!faultyStock) {
      return res.status(404).json({
        success: false,
        message: "Faulty stock record not found",
      });
    }

    console.log(`Accepting transfer ${transferId}`);
    console.log(
      `Before accept - FaultyStock: PendingUnderRepairQty: ${faultyStock.pendingUnderRepairQty}, UnderRepairQty: ${faultyStock.underRepairQty}`
    );
    console.log(
      `Before accept - RepairTransfer: PendingUnderRepairQty: ${repairTransfer.pendingUnderRepairQty}, UnderRepairQty: ${repairTransfer.underRepairQty}`
    );

    if (repairTransfer.isSerialized) {
      const pendingSerials = repairTransfer.serialNumbers.filter(
        (serial) => serial.status === "pending_under_repair"
      );

      if (acceptedQuantities && Array.isArray(acceptedQuantities)) {
        for (const accepted of acceptedQuantities) {
          const serial = pendingSerials.find(
            (item) => item.serialNumber === accepted.serialNumber
          );

          if (!serial) continue;

          serial.status = "under_repair";
          serial.underRepairQty = 1;

          serial.repairHistory.push({
            date: new Date(),
            status: "under_repair",
            remark:
              accepted.remark ||
              remark ||
              "Accepted at repair center",
            updatedBy: acceptedBy,
            cost: 0,
          });

          const faultySerial = faultyStock.serialNumbers.find(
            (item) => item.serialNumber === accepted.serialNumber
          );

          if (faultySerial) {
            faultySerial.status = "under_repair";
            faultySerial.underRepairQty = 1;

            faultySerial.repairHistory.push({
              date: new Date(),
              status: "under_repair",
              remark:
                accepted.remark ||
                remark ||
                "Accepted at repair center",
              updatedBy: acceptedBy,
              cost: 0,
            });
          }
        }
      } else {
        pendingSerials.forEach((serial) => {
          serial.status = "under_repair";
          serial.underRepairQty = 1;

          serial.repairHistory.push({
            date: new Date(),
            status: "under_repair",
            remark: remark || "Accepted at repair center",
            updatedBy: acceptedBy,
            cost: 0,
          });

          const faultySerial = faultyStock.serialNumbers.find(
            (item) => item.serialNumber === serial.serialNumber
          );

          if (faultySerial) {
            faultySerial.status = "under_repair";
            faultySerial.underRepairQty = 1;

            faultySerial.repairHistory.push({
              date: new Date(),
              status: "under_repair",
              remark: remark || "Accepted at repair center",
              updatedBy: acceptedBy,
              cost: 0,
            });
          }
        });
      }

      repairTransfer.underRepairQty =
        repairTransfer.serialNumbers.filter(
          (serial) => serial.status === "under_repair"
        ).length;

      repairTransfer.pendingUnderRepairQty =
        repairTransfer.serialNumbers.filter(
          (serial) => serial.status === "pending_under_repair"
        ).length;

      faultyStock.underRepairQty =
        faultyStock.serialNumbers.filter(
          (serial) => serial.status === "under_repair"
        ).length;

      faultyStock.pendingUnderRepairQty =
        faultyStock.serialNumbers.filter(
          (serial) => serial.status === "pending_under_repair"
        ).length;
    } else {
      const totalAccepted =
        acceptedQuantities && acceptedQuantities.totalAcceptedQty
          ? acceptedQuantities.totalAcceptedQty
          : repairTransfer.pendingUnderRepairQty;

      if (totalAccepted > repairTransfer.pendingUnderRepairQty) {
        return res.status(400).json({
          success: false,
          message:
            `Cannot accept ${totalAccepted} items. Only ${repairTransfer.pendingUnderRepairQty} pending`,
        });
      }

      repairTransfer.underRepairQty = totalAccepted;
      repairTransfer.pendingUnderRepairQty =
        repairTransfer.pendingUnderRepairQty - totalAccepted;

      faultyStock.underRepairQty =
        (faultyStock.underRepairQty || 0) + totalAccepted;

      faultyStock.pendingUnderRepairQty =
        faultyStock.pendingUnderRepairQty - totalAccepted;

      faultyStock.repairHistory.push({
        date: new Date(),
        status: "under_repair",
        remark:
          remark ||
          `Accepted ${totalAccepted} items at repair center`,
        quantity: totalAccepted,
        repairedQty: 0,
        irrepairedQty: 0,
        updatedBy: acceptedBy,
      });
    }

    if (repairTransfer.underRepairQty === repairTransfer.quantity) {
      repairTransfer.status = "under_repair";
    } else if (repairTransfer.underRepairQty > 0) {
      repairTransfer.status = "partially_accepted";
    } else {
      repairTransfer.status = "pending_under_repair";
    }

    repairTransfer.acceptedBy = acceptedBy;
    repairTransfer.acceptedAt = new Date();

    repairTransfer.repairUpdates.push({
      date: new Date(),
      status: repairTransfer.status,
      remark:
        remark ||
        `Accepted ${repairTransfer.underRepairQty} items`,
      quantity: repairTransfer.underRepairQty,
      updatedBy: acceptedBy,
      cost: 0,
    });

    faultyStock.updateQuantitiesAndStatus();

    await faultyStock.save();
    await repairTransfer.save();

    console.log(
      `After accept - FaultyStock: PendingUnderRepairQty: ${faultyStock.pendingUnderRepairQty}, UnderRepairQty: ${faultyStock.underRepairQty}`
    );
    console.log(
      `After accept - RepairTransfer: PendingUnderRepairQty: ${repairTransfer.pendingUnderRepairQty}, UnderRepairQty: ${repairTransfer.underRepairQty}`
    );

    return res.json({
      success: true,
      message: "Transfer accepted successfully",
      data: {
        transferId: repairTransfer._id,
        status: repairTransfer.status,
        acceptedQty: repairTransfer.underRepairQty,
        pendingQty: repairTransfer.pendingUnderRepairQty,
        product: repairTransfer.product?.productTitle,
        acceptedBy,
        acceptedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Accept error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const acceptRejectRepairedTransfer = async (req, res) => {
  try {
    const { hasAccess, userCenter } = checkStockUsagePermissions(
      req,
      ["manage_usage_own_center", "manage_usage_all_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const { productId, serialNumbers = [], action, reason } = req.body;
    const userId = req.user.id || req.user._id;

    const warehouseId =
      userCenter?._id ||
      userCenter ||
      req.user?.fullUser?.center ||
      req.user?.center ||
      req.selectedCenterId;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Valid product ID is required",
      });
    }

    if (!action || !["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'accept' or 'reject'",
      });
    }

    if (action === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const OutletStock = mongoose.model("OutletStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
    const Product = mongoose.model("Product");

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const isSerialized = product.trackSerialNumber === "Yes";

    const outletStock = await OutletStock.findOne({
      outlet: warehouseId,
      product: productId,
    });

    if (!outletStock) {
      return res.status(404).json({
        success: false,
        message: "No stock found for this product in the warehouse",
      });
    }

    if (action === "accept") {
      if (isSerialized) {
        if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Serial numbers are required for serialized products",
          });
        }

        let acceptedCount = 0;
        const acceptedSerials = [];

        for (const serialNumber of serialNumbers) {
          const serialIndex = outletStock.serialNumbers.findIndex(
            (serial) =>
              serial.serialNumber === serialNumber &&
              serial.status === "pending_approval"
          );

          if (serialIndex === -1) continue;

          const outletSerial = outletStock.serialNumbers[serialIndex];
          outletSerial.status = "available";

          if (
            outletSerial.transferHistory &&
            outletSerial.transferHistory.length > 0
          ) {
            const lastTransfer =
              outletSerial.transferHistory[
                outletSerial.transferHistory.length - 1
              ];

            lastTransfer.transferStatus = "accepted";
            lastTransfer.acceptedAt = new Date();
            lastTransfer.acceptedBy = userId;
          }

          acceptedCount++;
          acceptedSerials.push(serialNumber);

          await RepairTransfer.updateMany(
            {
              product: productId,
              "serialNumbers.serialNumber": serialNumber,
              "serialNumbers.status": "pending_transfer",
            },
            {
              $set: {
                "serialNumbers.$.status": "transferred",
                "serialNumbers.$.repairHistory.$[elem].status":
                  "transferred",
                "serialNumbers.$.repairHistory.$[elem].transferStatus":
                  "accepted",
                "serialNumbers.$.repairHistory.$[elem].acceptedAt":
                  new Date(),
                "serialNumbers.$.repairHistory.$[elem].acceptedBy":
                  userId,
              },
            },
            {
              arrayFilters: [
                {
                  "elem.status": "pending_transfer",
                  "elem.transferStatus": "pending",
                },
              ],
            }
          );
        }

        if (acceptedCount === 0) {
          return res.status(400).json({
            success: false,
            message: "No pending serial numbers found to accept",
          });
        }

        outletStock.availableQuantity += acceptedCount;
        outletStock.totalQuantity += acceptedCount;
        outletStock.repairedQuantity += acceptedCount;
        outletStock.pendingRepairedQty = Math.max(
          0,
          outletStock.pendingRepairedQty - acceptedCount
        );

        await outletStock.save();

        return res.json({
          success: true,
          message: `Accepted ${acceptedCount} repaired serialized items`,
          data: {
            product: product.productTitle,
            acceptedQuantity: acceptedCount,
            acceptedSerials,
            availableQuantity: outletStock.availableQuantity,
            repairedQuantity: outletStock.repairedQuantity,
            pendingRepairedQty: outletStock.pendingRepairedQty,
            totalQuantity: outletStock.totalQuantity,
          },
        });
      }

      const repairTransfers = await RepairTransfer.find({
        product: productId,
        pendingTransferQty: { $gt: 0 },
        "pendingTransferDetails.outletId": warehouseId,
        "pendingTransferDetails.status": "pending",
      });

      if (repairTransfers.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No pending transfers found for this non-serialized product",
        });
      }

      let totalAccepted = 0;
      const acceptedTransfers = [];

      for (const transfer of repairTransfers) {
        try {
          const pendingDetails = transfer.pendingTransferDetails.filter(
            (detail) =>
              detail.outletId.toString() === warehouseId.toString() &&
              detail.status === "pending"
          );

          if (pendingDetails.length === 0) continue;

          const totalPendingForOutlet = pendingDetails.reduce(
            (sum, detail) => sum + detail.quantity,
            0
          );

          transfer.acceptPendingTransfer(
            warehouseId,
            totalPendingForOutlet,
            userId,
            "Accepted at warehouse"
          );

          await transfer.save();

          totalAccepted += totalPendingForOutlet;

          acceptedTransfers.push({
            transferId: transfer._id,
            quantity: totalPendingForOutlet,
          });
        } catch (error) {
          console.error(
            `Error accepting transfer ${transfer._id}:`,
            error
          );
        }
      }

      if (totalAccepted === 0) {
        return res.status(400).json({
          success: false,
          message: "No pending items could be accepted",
        });
      }

      outletStock.pendingRepairedQty = Math.max(
        0,
        outletStock.pendingRepairedQty - totalAccepted
      );
      outletStock.repairedQuantity =
        (outletStock.repairedQuantity || 0) + totalAccepted;
      outletStock.availableQuantity += totalAccepted;
      outletStock.totalQuantity += totalAccepted;

      await outletStock.save();

      return res.json({
        success: true,
        message: `Accepted ${totalAccepted} repaired non-serialized items`,
        data: {
          product: product.productTitle,
          acceptedQuantity: totalAccepted,
          acceptedTransfers,
          availableQuantity: outletStock.availableQuantity,
          repairedQuantity: outletStock.repairedQuantity,
          pendingRepairedQty: outletStock.pendingRepairedQty,
          totalQuantity: outletStock.totalQuantity,
        },
      });
    }

    // Reject transfer
    if (isSerialized) {
      if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Serial numbers are required for serialized products",
        });
      }

      let rejectedCount = 0;
      const rejectedSerials = [];
      const removedSerials = [];

      outletStock.serialNumbers = outletStock.serialNumbers.filter(
        (serial) => {
          if (
            serialNumbers.includes(serial.serialNumber) &&
            serial.status === "pending_approval"
          ) {
            rejectedCount++;
            rejectedSerials.push(serial.serialNumber);
            removedSerials.push(serial);
            return false;
          }

          return true;
        }
      );

      if (rejectedCount === 0) {
        return res.status(400).json({
          success: false,
          message: "No pending serial numbers found to reject",
        });
      }

      outletStock.pendingRepairedQty = Math.max(
        0,
        outletStock.pendingRepairedQty - rejectedCount
      );

      await outletStock.save();

      for (const serial of removedSerials) {
        await RepairTransfer.updateMany(
          {
            product: productId,
            "serialNumbers.serialNumber": serial.serialNumber,
            "serialNumbers.status": "pending_transfer",
          },
          {
            $set: {
              "serialNumbers.$.status": "repaired",
              "serialNumbers.$.repairHistory.$[elem].status": "repaired",
              "serialNumbers.$.repairHistory.$[elem].transferStatus":
                "rejected",
              "serialNumbers.$.repairHistory.$[elem].rejectionReason":
                reason,
              "serialNumbers.$.repairHistory.$[elem].rejectedAt":
                new Date(),
              "serialNumbers.$.repairHistory.$[elem].rejectedBy":
                userId,
            },
          },
          {
            arrayFilters: [
              {
                "elem.status": "pending_transfer",
                "elem.transferStatus": "pending",
              },
            ],
          }
        );
      }

      return res.json({
        success: true,
        message: `Rejected ${rejectedCount} repaired serialized items`,
        data: {
          product: product.productTitle,
          rejectedQuantity: rejectedCount,
          rejectedSerials,
          pendingRepairedQty: outletStock.pendingRepairedQty,
          reason,
        },
      });
    }

    const repairTransfers = await RepairTransfer.find({
      product: productId,
      pendingTransferQty: { $gt: 0 },
      "pendingTransferDetails.outletId": warehouseId,
      "pendingTransferDetails.status": "pending",
    });

    if (repairTransfers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No pending transfers found for this non-serialized product",
      });
    }

    let totalRejected = 0;
    const rejectedTransfers = [];

    for (const transfer of repairTransfers) {
      try {
        const pendingDetails = transfer.pendingTransferDetails.filter(
          (detail) =>
            detail.outletId.toString() === warehouseId.toString() &&
            detail.status === "pending"
        );

        if (pendingDetails.length === 0) continue;

        const totalPendingForOutlet = pendingDetails.reduce(
          (sum, detail) => sum + detail.quantity,
          0
        );

        transfer.rejectPendingTransfer(
          warehouseId,
          totalPendingForOutlet,
          userId,
          reason
        );

        await transfer.save();

        totalRejected += totalPendingForOutlet;

        rejectedTransfers.push({
          transferId: transfer._id,
          quantity: totalPendingForOutlet,
        });
      } catch (error) {
        console.error(
          `Error rejecting transfer ${transfer._id}:`,
          error
        );
      }
    }

    if (totalRejected === 0) {
      return res.status(400).json({
        success: false,
        message: "No pending items could be rejected",
      });
    }

    outletStock.pendingRepairedQty = Math.max(
      0,
      outletStock.pendingRepairedQty - totalRejected
    );

    await outletStock.save();

    return res.json({
      success: true,
      message: `Rejected ${totalRejected} repaired non-serialized items`,
      data: {
        product: product.productTitle,
        rejectedQuantity: totalRejected,
        rejectedTransfers,
        pendingRepairedQty: outletStock.pendingRepairedQty,
        reason,
      },
    });
  } catch (error) {
    console.error("Accept/Reject repaired transfer error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process transfer",
    });
  }
};
export const acceptRejectResellerTransfer = async (req, res) => {
  try {
    const { transfers, action, reason } = req.body;
    const userId = req.user.id || req.user._id;

    if (!Array.isArray(transfers) || transfers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Transfers array is required and cannot be empty",
      });
    }

    if (!action || !["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'accept' or 'reject'",
      });
    }

    if (action === "reject" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const ResellerStock = mongoose.model("ResellerStock");
    const OutletStock = mongoose.model("OutletStock");
    const RepairTransfer = mongoose.model("RepairTransfer");
    const Product = mongoose.model("Product");
    const FaultyStock = mongoose.model("FaultyStock");
    const Reseller = mongoose.model("Reseller");

    const results = [];
    const errors = [];

    console.log(
      `Processing ${action.toUpperCase()} for ${transfers.length} reseller transfers`
    );

    for (const transferItem of transfers) {
      try {
        const {
          resellerId,
          productId,
          transferIndex,
          quantity,
          serialNumbers = [],
        } = transferItem;

        if (
          !resellerId ||
          !mongoose.Types.ObjectId.isValid(resellerId)
        ) {
          errors.push(
            `Invalid reseller ID in transfer: ${JSON.stringify(transferItem)}`
          );
          continue;
        }

        if (
          !productId ||
          !mongoose.Types.ObjectId.isValid(productId)
        ) {
          errors.push(
            `Invalid product ID in transfer: ${JSON.stringify(transferItem)}`
          );
          continue;
        }

        const product = await Product.findById(productId);

        if (!product) {
          errors.push(`Product not found: ${productId}`);
          continue;
        }

        const reseller = await Reseller.findById(resellerId);

        if (!reseller) {
          errors.push(`Reseller not found: ${resellerId}`);
          continue;
        }

        const resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId,
        });

        if (!resellerStock) {
          errors.push(
            `Reseller stock not found for reseller: ${resellerId}, product: ${productId}`
          );
          continue;
        }

        if (
          !resellerStock.pendingTransfers ||
          resellerStock.pendingTransfers.length === 0
        ) {
          errors.push(
            `No pending transfers found for reseller: ${resellerId}, product: ${productId}`
          );
          continue;
        }

        let transferIndexToUse = transferIndex;

        if (transferIndexToUse === undefined) {
          transferIndexToUse =
            resellerStock.pendingTransfers.findIndex(
              (transfer) => transfer.status === "pending"
            );

          if (transferIndexToUse === -1) {
            errors.push(
              `No pending transfers found for reseller: ${resellerId}, product: ${productId}`
            );
            continue;
          }
        } else if (
          transferIndexToUse < 0 ||
          transferIndexToUse >= resellerStock.pendingTransfers.length
        ) {
          errors.push(
            `Invalid transfer index ${transferIndexToUse} for reseller: ${resellerId}, product: ${productId}`
          );
          continue;
        }

        const pendingTransfer =
          resellerStock.pendingTransfers[transferIndexToUse];

        if (pendingTransfer.status !== "pending") {
          errors.push(
            `Transfer is already ${pendingTransfer.status} for reseller: ${resellerId}, product: ${productId}`
          );
          continue;
        }

        const outletId = pendingTransfer.outletId;
        const transferQuantity = quantity || pendingTransfer.quantity;
        const transferSerials =
          serialNumbers.length > 0
            ? serialNumbers
            : pendingTransfer.serialNumbers || [];

        console.log(`Processing ${action}: ${product.productTitle}`);
        console.log(
          `Quantity: ${transferQuantity}, Outlet: ${outletId}, Reseller: ${reseller.businessName}`
        );

        if (action === "accept") {
          const outletStock = await OutletStock.findOne({
            outlet: outletId,
            product: productId,
          });

          if (!outletStock) {
            errors.push(
              `Outlet stock not found for outlet: ${outletId}, product: ${productId}`
            );
            continue;
          }

          if (
            !outletStock.pendingTransfers ||
            outletStock.pendingTransfers.length === 0
          ) {
            errors.push(
              `No pending transfers found in outlet stock for outlet: ${outletId}, product: ${productId}`
            );
            continue;
          }

          const outletTransferIndex =
            outletStock.pendingTransfers.findIndex(
              (transfer) =>
                transfer.resellerId?.toString() ===
                  resellerId.toString() &&
                transfer.status === "pending"
            );

          if (outletTransferIndex === -1) {
            errors.push(
              `No pending transfer found in outlet stock for reseller: ${resellerId}`
            );
            continue;
          }

          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber =
                typeof serial === "string"
                  ? serial
                  : serial.serialNumber;

              const serialIndex = outletStock.serialNumbers.findIndex(
                (item) =>
                  item.serialNumber === serialNumber &&
                  item.status === "pending_transfer"
              );

              if (serialIndex === -1) continue;

              outletStock.serialNumbers[serialIndex].status =
                "transferred";

              const transferRecord = {
                fromCenter: outletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: "Transfer accepted by reseller",
                transferredBy: userId,
                transferStatus: "accepted",
                acceptedAt: new Date(),
                acceptedBy: userId,
              };

              const serialHistory =
                outletStock.serialNumbers[serialIndex].transferHistory;

              if (!Array.isArray(serialHistory)) {
                outletStock.serialNumbers[serialIndex].transferHistory = [];
              }

              outletStock.serialNumbers[serialIndex].transferHistory.push(
                transferRecord
              );
            }
          } else {
            const pendingBatchSerial = outletStock.serialNumbers.find(
              (serial) => serial.status === "pending_transfer"
            );

            if (pendingBatchSerial) {
              pendingBatchSerial.status = "transferred";

              if (!Array.isArray(pendingBatchSerial.transferHistory)) {
                pendingBatchSerial.transferHistory = [];
              }

              pendingBatchSerial.transferHistory.push({
                fromCenter: outletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: `Transfer of ${transferQuantity} items accepted by reseller`,
                transferredBy: userId,
                transferStatus: "accepted",
                acceptedAt: new Date(),
                acceptedBy: userId,
              });
            }
          }

          outletStock.pendingTransferToReseller = Math.max(
            0,
            (outletStock.pendingTransferToReseller || 0) -
              transferQuantity
          );

          outletStock.transferredRepairedQty =
            (outletStock.transferredRepairedQty || 0) +
            transferQuantity;

          outletStock.pendingTransfers[outletTransferIndex].status =
            "accepted";
          outletStock.pendingTransfers[outletTransferIndex].acceptedAt =
            new Date();
          outletStock.pendingTransfers[outletTransferIndex].acceptedBy =
            userId;

          await outletStock.save();

          resellerStock.pendingIncomingQuantity = Math.max(
            0,
            (resellerStock.pendingIncomingQuantity || 0) -
              transferQuantity
          );

          resellerStock.availableQuantity =
            (resellerStock.availableQuantity || 0) +
            transferQuantity;

          resellerStock.totalQuantity =
            (resellerStock.totalQuantity || 0) +
            transferQuantity;

          resellerStock.sourceBreakdown.damageRepairQuantity =
            (resellerStock.sourceBreakdown.damageRepairQuantity || 0) +
            transferQuantity;

          resellerStock.pendingTransfers[transferIndexToUse].status =
            "accepted";
          resellerStock.pendingTransfers[transferIndexToUse].acceptedAt =
            new Date();
          resellerStock.pendingTransfers[transferIndexToUse].acceptedBy =
            userId;

          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber =
                typeof serial === "string"
                  ? serial
                  : serial.serialNumber;

              const existingSerialIndex =
                resellerStock.serialNumbers.findIndex(
                  (item) => item.serialNumber === serialNumber
                );

              const transferRecord = {
                fromCenter: outletId,
                toReseller: resellerId,
                transferDate: new Date(),
                transferType: "outlet_to_reseller",
                sourceType: "damage_repair",
                referenceId: outletStock._id,
                remark: "Accepted transfer from outlet",
                transferredBy: userId,
                transferStatus: "accepted",
                acceptedAt: new Date(),
                acceptedBy: userId,
              };

              if (existingSerialIndex === -1) {
                resellerStock.serialNumbers.push({
                  serialNumber,
                  status: "available",
                  purchaseId: new mongoose.Types.ObjectId(),
                  currentLocation: null,
                  sourceType: "damage_repair",
                  transferHistory: [transferRecord],
                });
              } else {
                const existingSerial =
                  resellerStock.serialNumbers[existingSerialIndex];

                existingSerial.status = "available";

                if (!Array.isArray(existingSerial.transferHistory)) {
                  existingSerial.transferHistory = [];
                }

                existingSerial.transferHistory.push(transferRecord);
              }
            }
          } else {
            const existingBatchSerial =
              resellerStock.serialNumbers.find(
                (serial) =>
                  serial.serialNumber.startsWith("BATCH-") &&
                  serial.status === "available"
              );

            const transferRecord = {
              fromCenter: outletId,
              toReseller: resellerId,
              transferDate: new Date(),
              transferType: "outlet_to_reseller",
              sourceType: "damage_repair",
              referenceId: outletStock._id,
              remark: `Accepted ${transferQuantity} repaired items from outlet`,
              transferredBy: userId,
              transferStatus: "accepted",
              acceptedAt: new Date(),
              acceptedBy: userId,
            };

            if (!existingBatchSerial) {
              resellerStock.serialNumbers.push({
                serialNumber: `BATCH-${Date.now()}`,
                status: "available",
                purchaseId: new mongoose.Types.ObjectId(),
                currentLocation: null,
                sourceType: "damage_repair",
                transferHistory: [transferRecord],
              });
            } else {
              if (!Array.isArray(existingBatchSerial.transferHistory)) {
                existingBatchSerial.transferHistory = [];
              }

              existingBatchSerial.transferHistory.push(transferRecord);
            }
          }

          await resellerStock.save();

          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber =
                typeof serial === "string"
                  ? serial
                  : serial.serialNumber;

              const repairTransfer = await RepairTransfer.findOne({
                product: productId,
                "serialNumbers.serialNumber": serialNumber,
              });

              if (!repairTransfer) continue;

              const updated = await RepairTransfer.findOneAndUpdate(
                {
                  _id: repairTransfer._id,
                  "serialNumbers.serialNumber": serialNumber,
                },
                {
                  $set: {
                    "serialNumbers.$.status": "transferred",
                    "serialNumbers.$.repairHistory.$[elem].status":
                      "transferred",
                    "serialNumbers.$.repairHistory.$[elem].transferStatus":
                      "accepted",
                    "serialNumbers.$.repairHistory.$[elem].acceptedAt":
                      new Date(),
                    "serialNumbers.$.repairHistory.$[elem].acceptedBy":
                      userId,
                  },
                  $inc: {
                    returnedQty: 1,
                    pendingTransferQty: -1,
                  },
                },
                {
                  arrayFilters: [
                    { "elem.status": "pending_transfer" },
                  ],
                  new: true,
                }
              );

              if (updated) {
                updated.updateStatusAndQuantities();
                await updated.save();
              }
            }
          } else {
            const repairTransfer = await RepairTransfer.findOne({
              product: productId,
              toCenter: outletId,
              status: { $in: ["repaired", "pending_transfer"] },
            });

            if (repairTransfer) {
              repairTransfer.pendingTransferQty = Math.max(
                0,
                (repairTransfer.pendingTransferQty || 0) -
                  transferQuantity
              );

              repairTransfer.returnedQty =
                (repairTransfer.returnedQty || 0) +
                transferQuantity;

              if (repairTransfer.pendingTransferDetails) {
                for (const detail of repairTransfer.pendingTransferDetails) {
                  if (
                    detail.resellerId &&
                    detail.resellerId.toString() ===
                      resellerId.toString() &&
                    detail.status === "pending"
                  ) {
                    detail.status = "accepted";
                    detail.acceptedAt = new Date();
                    detail.acceptedBy = userId;
                  }
                }
              }

              repairTransfer.repairUpdates.push({
                date: new Date(),
                status: "transferred",
                remark: `Accepted by reseller ${reseller.businessName}`,
                quantity: transferQuantity,
                updatedBy: userId,
                transferStatus: "accepted",
                destinationReseller: resellerId,
                acceptedAt: new Date(),
                acceptedBy: userId,
              });

              repairTransfer.updateStatusAndQuantities();
              await repairTransfer.save();
            }
          }

          // Update Faulty Stock
          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber =
                typeof serial === "string"
                  ? serial
                  : serial.serialNumber;

              const faultyStock = await FaultyStock.findOne({
                product: productId,
                isSerialized: true,
                "serialNumbers.serialNumber": serialNumber,
              });

              if (!faultyStock) continue;

              const updated = await FaultyStock.findOneAndUpdate(
                {
                  _id: faultyStock._id,
                  "serialNumbers.serialNumber": serialNumber,
                },
                {
                  $set: {
                    "serialNumbers.$.status": "transferred",
                  },
                  $inc: {
                    transferredQty: 1,
                    repairedQty: -1,
                  },
                },
                { new: true }
              );

              if (updated) {
                if (updated.updateQuantitiesAndStatus) {
                  updated.updateQuantitiesAndStatus();
                }

                updated.lastRepairUpdate = new Date();
                await updated.save();
              }
            }
          } else {
            const faultyStock = await FaultyStock.findOne({
              product: productId,
              isSerialized: false,
              $or: [
                { toCenter: outletId },
                { center: outletId },
              ],
            }).sort({ createdAt: -1 });

            if (faultyStock) {
              faultyStock.repairedQty = Math.max(
                0,
                (faultyStock.repairedQty || 0) - transferQuantity
              );

              faultyStock.transferredQty =
                (faultyStock.transferredQty || 0) +
                transferQuantity;

              if (!faultyStock.repairHistory) {
                faultyStock.repairHistory = [];
              }

              faultyStock.repairHistory.push({
                date: new Date(),
                status: "transferred",
                remark:
                  `Transferred ${transferQuantity} repaired items to reseller ${reseller.businessName} (Accepted)`,
                quantity: transferQuantity,
                repairedQty: 0 - transferQuantity,
                irrepairedQty: 0,
                updatedBy: userId,
                transferStatus: "accepted",
                destinationReseller: resellerId,
              });

              if (faultyStock.updateQuantitiesAndStatus) {
                faultyStock.updateQuantitiesAndStatus();
              }

              faultyStock.lastRepairUpdate = new Date();
              await faultyStock.save();
            }
          }

          results.push({
            success: true,
            resellerId,
            productId,
            productName: product.productTitle,
            quantity: transferQuantity,
            outletId,
            status: "accepted",
            message:
              `Accepted ${transferQuantity} items from ${reseller.businessName}`,
          });
        } else {
          // Reject transfer
          const outletStock = await OutletStock.findOne({
            outlet: outletId,
            product: productId,
          });

          if (outletStock) {
            if (product.trackSerialNumber === "Yes") {
              for (const serial of transferSerials) {
                const serialNumber =
                  typeof serial === "string"
                    ? serial
                    : serial.serialNumber;

                const serialIndex = outletStock.serialNumbers.findIndex(
                  (item) =>
                    item.serialNumber === serialNumber &&
                    item.status === "pending_transfer"
                );

                if (serialIndex === -1) continue;

                outletStock.serialNumbers[serialIndex].status = "available";

                const serialRecord =
                  outletStock.serialNumbers[serialIndex];

                if (!Array.isArray(serialRecord.transferHistory)) {
                  serialRecord.transferHistory = [];
                }

                serialRecord.transferHistory.push({
                  fromCenter: outletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  sourceType: "damage_repair",
                  referenceId: outletStock._id,
                  remark: `Transfer rejected: ${reason}`,
                  transferredBy: userId,
                  transferStatus: "rejected",
                  rejectedAt: new Date(),
                  rejectedBy: userId,
                  rejectionReason: reason,
                });
              }
            } else {
              const pendingBatchSerial = outletStock.serialNumbers.find(
                (serial) => serial.status === "pending_transfer"
              );

              if (pendingBatchSerial) {
                pendingBatchSerial.status = "available";

                if (!Array.isArray(pendingBatchSerial.transferHistory)) {
                  pendingBatchSerial.transferHistory = [];
                }

                pendingBatchSerial.transferHistory.push({
                  fromCenter: outletId,
                  toReseller: resellerId,
                  transferDate: new Date(),
                  transferType: "outlet_to_reseller",
                  sourceType: "damage_repair",
                  referenceId: outletStock._id,
                  remark:
                    `Transfer of ${transferQuantity} items rejected: ${reason}`,
                  transferredBy: userId,
                  transferStatus: "rejected",
                  rejectedAt: new Date(),
                  rejectedBy: userId,
                  rejectionReason: reason,
                });
              }
            }

            outletStock.availableQuantity =
              (outletStock.availableQuantity || 0) +
              transferQuantity;

            outletStock.pendingTransferToReseller = Math.max(
              0,
              (outletStock.pendingTransferToReseller || 0) -
                transferQuantity
            );

            if (outletStock.pendingTransfers) {
              const outletTransferIndex =
                outletStock.pendingTransfers.findIndex(
                  (transfer) =>
                    transfer.resellerId?.toString() ===
                      resellerId.toString() &&
                    transfer.status === "pending"
                );

              if (outletTransferIndex !== -1) {
                const outletPendingTransfer =
                  outletStock.pendingTransfers[outletTransferIndex];

                outletPendingTransfer.status = "rejected";
                outletPendingTransfer.rejectedAt = new Date();
                outletPendingTransfer.rejectedBy = userId;
                outletPendingTransfer.rejectionReason = reason;
              }
            }

            await outletStock.save();
          }

          resellerStock.pendingIncomingQuantity = Math.max(
            0,
            (resellerStock.pendingIncomingQuantity || 0) -
              transferQuantity
          );

          const resellerPendingTransfer =
            resellerStock.pendingTransfers[transferIndexToUse];

          resellerPendingTransfer.status = "rejected";
          resellerPendingTransfer.rejectedAt = new Date();
          resellerPendingTransfer.rejectedBy = userId;
          resellerPendingTransfer.rejectionReason = reason;

          await resellerStock.save();

          if (product.trackSerialNumber === "Yes") {
            for (const serial of transferSerials) {
              const serialNumber =
                typeof serial === "string"
                  ? serial
                  : serial.serialNumber;

              const repairTransfer = await RepairTransfer.findOne({
                product: productId,
                "serialNumbers.serialNumber": serialNumber,
              });

              if (!repairTransfer) continue;

              const updated = await RepairTransfer.findOneAndUpdate(
                {
                  _id: repairTransfer._id,
                  "serialNumbers.serialNumber": serialNumber,
                },
                {
                  $set: {
                    "serialNumbers.$.status": "repaired",
                    "serialNumbers.$.repairHistory.$[elem].status":
                      "repaired",
                    "serialNumbers.$.repairHistory.$[elem].transferStatus":
                      "rejected",
                    "serialNumbers.$.repairHistory.$[elem].rejectedAt":
                      new Date(),
                    "serialNumbers.$.repairHistory.$[elem].rejectedBy":
                      userId,
                    "serialNumbers.$.repairHistory.$[elem].rejectionReason":
                      reason,
                  },
                  $inc: {
                    repairedQty: 1,
                    pendingTransferQty: -1,
                  },
                },
                {
                  arrayFilters: [
                    { "elem.status": "pending_transfer" },
                  ],
                  new: true,
                }
              );

              if (updated) {
                updated.updateStatusAndQuantities();
                await updated.save();
              }
            }
          } else {
            const repairTransfer = await RepairTransfer.findOne({
              product: productId,
              toCenter: outletId,
              status: { $in: ["repaired", "pending_transfer"] },
            });

            if (repairTransfer) {
              repairTransfer.pendingTransferQty = Math.max(
                0,
                (repairTransfer.pendingTransferQty || 0) -
                  transferQuantity
              );

              repairTransfer.repairedQty =
                (repairTransfer.repairedQty || 0) +
                transferQuantity;

              if (repairTransfer.pendingTransferDetails) {
                for (const detail of repairTransfer.pendingTransferDetails) {
                  if (
                    detail.resellerId &&
                    detail.resellerId.toString() ===
                      resellerId.toString() &&
                    detail.status === "pending"
                  ) {
                    detail.status = "rejected";
                    detail.rejectedAt = new Date();
                    detail.rejectedBy = userId;
                    detail.rejectionReason = reason;
                  }
                }
              }

              repairTransfer.repairUpdates.push({
                date: new Date(),
                status: "repaired",
                remark: `Transfer rejected by reseller: ${reason}`,
                quantity: transferQuantity,
                updatedBy: userId,
                transferStatus: "rejected",
                destinationReseller: resellerId,
                rejectedAt: new Date(),
                rejectedBy: userId,
                rejectionReason: reason,
              });

              repairTransfer.updateStatusAndQuantities();
              await repairTransfer.save();
            }
          }

          results.push({
            success: true,
            resellerId,
            productId,
            productName: product.productTitle,
            quantity: transferQuantity,
            outletId,
            status: "rejected",
            reason,
            message:
              `Rejected ${transferQuantity} items from ${reseller.businessName}`,
          });
        }
      } catch (error) {
        console.error("Error processing transfer:", error);

        errors.push({
          transfer: transferItem,
          error: error.message,
        });
      }
    }

    const successfulCount = results.filter(
      (result) => result.success
    ).length;

    const totalProcessed = results.length;

    const response = {
      success: successfulCount > 0,
      message:
        successfulCount > 0
          ? `Successfully processed ${successfulCount} out of ${totalProcessed} transfers`
          : "Failed to process any transfers",
      data: {
        results,
        totalProcessed,
        successfulCount,
        failedCount: errors.length,
      },
    };

    if (errors.length > 0) {
      response.data.errors = errors;
      response.data.partialSuccess = successfulCount > 0;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Accept/Reject reseller transfers error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process transfers",
    });
  }
};