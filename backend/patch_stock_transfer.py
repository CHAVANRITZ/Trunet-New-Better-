from pathlib import Path
from datetime import datetime
import shutil
import re
import sys

file = Path("models/StockTransfer.js")

if not file.exists():
    sys.exit("ERROR: StockTransfer.js not found")

source = file.read_text()
marker = "stockTransferSchema.methods.validateStockAvailability ="
start = source.find(marker)

if start == -1:
    sys.exit("ERROR: Target function not found. No changes made.")

match = re.search(
    r"\nstockTransferSchema\.methods\.",
    source[start + len(marker):]
)

if not match:
    sys.exit("ERROR: Function boundary not found. No changes made.")

end = start + len(marker) + match.start()

replacement = r'''stockTransferSchema.methods.validateStockAvailability =
  async function () {
    const CenterStock = mongoose.model("CenterStock");
    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");

    for (const item of this.products) {
      const product = await Product.findById(item.product);

      if (!product) {
        throw new Error(`Product not found: ${item.product}`);
      }

      const requiresSerialNumbers =
        product.trackSerialNumber === "Yes";

      item.requiresSerialNumbers = requiresSerialNumbers;

      let sourceStock = await CenterStock.findOne({
        center: this.fromCenter,
        product: item.product,
      });

      let stockCollection = "CenterStock";

      if (
        !sourceStock ||
        (sourceStock.availableQuantity || 0) < item.quantity
      ) {
        const outletStock = await OutletStock.findOne({
          outlet: this.fromCenter,
          product: item.product,
        });

        if (
          outletStock &&
          (outletStock.availableQuantity || 0) >= item.quantity
        ) {
          sourceStock = outletStock;
          stockCollection = "OutletStock";
        }
      }

      const availableQuantity =
        sourceStock?.availableQuantity || 0;

      if (!sourceStock || availableQuantity < item.quantity) {
        throw new Error(
          `Insufficient stock for product ${product.productTitle}. ` +
          `Available: ${availableQuantity}, Requested: ${item.quantity}`
        );
      }

      item.productInStock = availableQuantity;

      if (requiresSerialNumbers) {
        const serialNumbers = sourceStock.serialNumbers || [];

        const availableSerials = serialNumbers
          .filter((serial) => {
            const isAvailable = serial.status === "available";

            const isAtSource =
              !serial.currentLocation ||
              serial.currentLocation.toString() ===
                this.fromCenter.toString();

            return isAvailable && isAtSource;
          })
          .slice(0, item.quantity);

        if (availableSerials.length < item.quantity) {
          throw new Error(
            `Insufficient serial numbers available for product ` +
            `${product.productTitle}. Available: ${availableSerials.length}, ` +
            `Required: ${item.quantity}`
          );
        }

        item.availableSerials = availableSerials.map((serial) => ({
          serialNumber: serial.serialNumber,
          purchaseId: serial.purchaseId,
          addedAt: serial.createdAt || serial.addedAt,
        }));
      }

      console.log(
        `[StockTransfer] Validated ${product.productTitle} from ${stockCollection}`
      );
    }
  };
'''

updated = source[:start] + replacement + source[end:]

backup = Path(
    f"models/StockTransfer.js.backup.{datetime.now():%Y%m%d_%H%M%S}"
)

shutil.copy2(file, backup)
file.write_text(updated)

print("Backup created:", backup)
print("Patch applied successfully.")
