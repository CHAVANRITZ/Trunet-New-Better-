import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import StockRequest from '../models/StockRequest.js';
import Product from '../models/Product.js';
import Reseller from '../models/Reseller.js'; 
import RaisePO from '../models/RaisePO.js'; 

// ─────────────────────────────────────────────
// DEBUG HELPER
// ─────────────────────────────────────────────
const DEBUG = true; 

const debugLog = (label, data, type = 'info') => {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ── ${label} ──`);
    if (type === 'error') {
      console.error(JSON.stringify(data, null, 2));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
};

// ─────────────────────────────────────────────
// PERMISSION HELPERS
// ─────────────────────────────────────────────
const checkStockRequestPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const indentModule = userPermissions.find((perm) => perm.module === 'Indent');

  if (!indentModule) {
    debugLog('Permission Check - No Indent module found', { userId: req.user?.id });
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_indent: indentModule.permissions.includes('manage_indent'),
    indent_all_center: indentModule.permissions.includes('indent_all_center'),
    indent_own_center: indentModule.permissions.includes('indent_own_center'),
    delete_indent_all_center: indentModule.permissions.includes('delete_indent_all_center'),
    delete_indent_own_center: indentModule.permissions.includes('delete_indent_own_center'),
    stock_transfer_approve_from_outlet: indentModule.permissions.includes('stock_transfer_approve_from_outlet'),
    complete_indent: indentModule.permissions.includes('complete_indent'),
  };

  const hasRequiredPermission = requiredPermissions.some((perm) => permissions[perm]);

  return {
    hasAccess: hasRequiredPermission,
    permissions,
    userCenter: req.user.center,
  };
};

const checkCenterAccess = (stockRequest, userCenter, permissions) => {
  if (permissions.indent_all_center) return true;
  if (permissions.indent_own_center && userCenter) {
    const userCenterId = userCenter._id || userCenter;
    const requestCenterId = stockRequest.center._id || stockRequest.center;
    return userCenterId.toString() === requestCenterId.toString();
  }
  return false;
};

// ─────────────────────────────────────────────
// CORE FUNCTION: Resolve Product Rate from Product Master
// ─────────────────────────────────────────────
const resolveProductRate = async (invoiceProduct, stockRequestProduct) => {
  let outletRate = 0;
  let repairRate = 0;
  let centerReturnRate = 0;
  let rateSource = 'none';

  console.log(`\n🔍 Resolving rate for: ${invoiceProduct?.productTitle || 'Unknown'}`);

  // Step 1: Check if invoice already has a rate
  if (invoiceProduct?.outletRate && Number(invoiceProduct.outletRate) > 0) {
    outletRate = Number(invoiceProduct.outletRate);
    rateSource = 'invoiceData.outletRate';
    console.log(`    Rate from invoiceData: ${outletRate}`);
  }
  // Step 2: Check stock request product's salePrice
  else if (stockRequestProduct?.product?.salePrice && Number(stockRequestProduct.product.salePrice) > 0) {
    outletRate = Number(stockRequestProduct.product.salePrice);
    rateSource = 'stockRequest.product.salePrice';
    console.log(`   ✅ Rate from stockRequest: ${outletRate}`);
  }
  // Step 3: Fetch directly from Product master database (by ID or by Title)
  else {
    let productId = null;

    if (invoiceProduct?.productId) {
      productId = invoiceProduct.productId.toString();
    } else if (stockRequestProduct?.product?._id) {
      productId = stockRequestProduct.product._id.toString();
    }

    console.log(`   🔍 Fetching from Product Master, ID: ${productId}, Title: ${invoiceProduct?.productTitle}`);

    try {
      let masterProduct = null;

      if (productId) {
        masterProduct = await Product.findById(productId).lean();
      }

      // 👇 FALLBACK: match by productTitle if no ID or ID lookup failed
      if (!masterProduct && invoiceProduct?.productTitle) {
        masterProduct = await Product.findOne({ productTitle: invoiceProduct.productTitle }).lean();
        if (masterProduct) {
          console.log(`   🔁 Matched product by title fallback: ${masterProduct.productTitle}`);
        }
      }

      if (masterProduct) {
        console.log(`   📦 Product Master found: ${masterProduct.productTitle}`);
        console.log(`      salePrice: ${masterProduct.salePrice}`);
        console.log(`      productPrice: ${masterProduct.productPrice}`);

        outletRate = Number(masterProduct.salePrice) || Number(masterProduct.productPrice) || 0;
        rateSource = productId ? 'product.master.byId' : 'product.master.byTitle';

        if (outletRate > 0) {
          console.log(`   ✅ Rate from Product Master: ${outletRate}`);
        } else {
          console.log(`   ⚠️ Product Master has zero rates!`);
        }
      } else {
        console.log(`   ❌ Product not found in Master DB (by ID or title)!`);
      }
    } catch (error) {
      console.error(`   ❌ Error fetching product: ${error.message}`);
    }
  }

  if (outletRate === 0) {
    console.log(`   🚨 WARNING: Final rate is ZERO for ${invoiceProduct?.productTitle}`);
  }

  // Handle repair and center return rates
  repairRate = invoiceProduct?.repairRate && Number(invoiceProduct.repairRate) > 0
    ? Number(invoiceProduct.repairRate)
    : (stockRequestProduct?.repairRate || 0);

  centerReturnRate = invoiceProduct?.centerReturnRate && Number(invoiceProduct.centerReturnRate) > 0
    ? Number(invoiceProduct.centerReturnRate)
    : (stockRequestProduct?.centerReturnRate || 0);

  return {
    outletRate,
    repairRate: Number(repairRate),
    centerReturnRate: Number(centerReturnRate),
    rateSource
  };
};

// ─────────────────────────────────────────────
// Build Products Array with Correct Rates
// ─────────────────────────────────────────────
const buildProductsForInvoice = async (invoiceDataProducts = [], stockRequests = []) => {
  console.log(`\n🏗️ Building ${invoiceDataProducts.length} products for invoice...`);

  // Create maps for quick lookup — by productId AND by productTitle
  const stockProductMap = new Map();
  const stockProductByTitle = new Map();

  for (const sr of stockRequests) {
    for (const srProd of sr.products || []) {
      const productId = srProd.product?._id?.toString() || srProd.product?.toString();
      const productTitle = srProd.product?.productTitle;

      if (productId) {
        stockProductMap.set(productId, srProd);
        console.log(`   📦 Mapped product (by ID): ${srProd.product?.productTitle} (${productId}) from ${sr.orderNumber}`);
      }
      if (productTitle && !stockProductByTitle.has(productTitle)) {
        stockProductByTitle.set(productTitle, srProd);
        console.log(`   📦 Mapped product (by Title): ${productTitle} from ${sr.orderNumber}`);
      }
    }
  }

  const enrichedProducts = [];

  for (let i = 0; i < invoiceDataProducts.length; i++) {
    const invProd = invoiceDataProducts[i];
    const productId = invProd.productId?.toString();

    console.log(`\n📦 Processing product ${i + 1}/${invoiceDataProducts.length}: ${invProd.productTitle || 'Unknown'}`);
    console.log(`   Product ID: ${productId}`);
    console.log(`   Invoice outletRate: ${invProd.outletRate}`);
    console.log(`   Invoice outletQty: ${invProd.outletQty}`);

    // Find matching product in stock requests — by ID first, then by Title
    let stockProduct = productId ? stockProductMap.get(productId) : null;
    if (!stockProduct && invProd.productTitle) {
      stockProduct = stockProductByTitle.get(invProd.productTitle);
      if (stockProduct) {
        console.log(`   🔁 Matched stock product by title fallback`);
      }
    }

    if (stockProduct) {
      console.log(`   ✅ Found in stock request with salePrice: ${stockProduct.product?.salePrice}`);
    } else {
      console.log(`   ⚠️ No matching stock request product found`);
    }

    // Resolve the rate
    const rates = await resolveProductRate(invProd, stockProduct);

    // Get quantities
    const outletQty = Number(invProd.outletQty || invProd.quantity || 0);
    const damageRepairQty = Number(invProd.damageRepairQty || 0);
    const centerReturnQty = Number(invProd.centerReturnQty || 0);

    // Calculate amounts
    const outletAmount = outletQty * rates.outletRate;
    const damageRepairAmount = damageRepairQty * rates.repairRate;
    const centerReturnAmount = centerReturnQty * rates.centerReturnRate;
    const totalAmount = outletAmount + damageRepairAmount + centerReturnAmount;

    console.log(`   💰 Calculated: ${outletQty} × ${rates.outletRate} = ${outletAmount}`);

    // Get product title and HSN code
    let productTitle = invProd.productTitle || stockProduct?.product?.productTitle || '';
    let hsnCode = invProd.hsnCode || stockProduct?.product?.hsnCode || '';

    // If still missing, fetch from Product master
    if ((!productTitle || !hsnCode) && (productId || productTitle)) {
      try {
        const masterProduct = productId
          ? await Product.findById(productId).lean()
          : await Product.findOne({ productTitle }).lean();

        if (masterProduct) {
          productTitle = productTitle || masterProduct.productTitle;
          hsnCode = hsnCode || masterProduct.hsnCode;
          console.log(`   📖 Fetched missing data from master: ${productTitle}`);
        }
      } catch (error) {
        console.error(`   ❌ Error fetching master product: ${error.message}`);
      }
    }

    enrichedProducts.push({
      productId: invProd.productId,
      productTitle: productTitle,
      hsnCode: hsnCode || 'NA',
      quantity: Number(invProd.quantity || outletQty + damageRepairQty + centerReturnQty),
      outletQty,
      damageRepairQty,
      centerReturnQty,
      outletRate: rates.outletRate,
      repairRate: rates.repairRate,
      centerReturnRate: rates.centerReturnRate,
      outletAmount,
      damageRepairAmount,
      centerReturnAmount,
      totalAmount,
      unit: invProd.unit || 'Nos',
    });
  }

  console.log(`\n✅ Finished building ${enrichedProducts.length} products`);
  console.log(`📊 Products with zero rate: ${enrichedProducts.filter(p => p.outletRate === 0).length}`);

  return enrichedProducts;
};

// ─────────────────────────────────────────────
// NEW: Generate Invoice HTML on the backend using RESOLVED rates
// ─────────────────────────────────────────────
const generateInvoiceHtml = ({
  invoiceNumber,
  invoiceDate,
  reseller,
  centerNames,
  products,
  totalOutletAmount,
  totalDamageRepairAmount,
  totalBeforeTax,
  cgst,
  sgst,
  roundOff,
  totalAmount,
  hsnSummary,
  metadata,
}) => {
  const formatCurrency = (num) => (Number(num) || 0).toFixed(2);

  const formattedDate = new Date(invoiceDate).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });

  const buyerName = reseller?.businessName || 'SSV Alpha Broadband LLP';
  const buyerAddr = reseller?.address1 || '';
  const buyerGST = reseller?.gstNumber || '';

  const productRows = products.map((p, i) => {
    let rows = [];
    let rowCount = 0;

    if (p.outletQty > 0) {
      rows.push(`
        <tr>
          <td${rowCount > 0 ? ` rowspan="${rowCount}"` : ''}>${i + 1}</td>
          <td>${p.productTitle}</td>
          <td>${p.hsnCode}</td>
          <td class="right">${p.outletQty}</td>
          <td class="right">${formatCurrency(p.outletRate)}</td>
          <td>${p.unit}</td>
          <td class="right">${formatCurrency(p.outletAmount)}</td>
        </tr>
      `);
      rowCount++;
    }

    if (p.damageRepairQty > 0) {
      rows.push(`
        <tr>
          <td${rowCount === 0 ? ` rowspan="${rowCount + 1}"` : ''}></td>
          <td>${p.productTitle} <span class="repair-note">(Damage Repair - Charged @₹${p.repairRate}/unit)</span></td>
          <td>${p.hsnCode}</td>
          <td class="right">${p.damageRepairQty}</td>
          <td class="right">${formatCurrency(p.repairRate)}</td>
          <td>${p.unit}</td>
          <td class="right">${formatCurrency(p.damageRepairAmount)}</td>
        </tr>
      `);
      rowCount++;
    }

    if (p.centerReturnQty > 0) {
      rows.push(`
        <tr>
          <td${rowCount === 0 ? ` rowspan="${rowCount + 1}"` : ''}></td>
          <td>${p.productTitle} <span class="free-note">(Center Return - Free)</span></td>
          <td>${p.hsnCode}</td>
          <td class="right">${p.centerReturnQty}</td>
          <td class="right">${formatCurrency(p.centerReturnRate)}</td>
          <td>${p.unit}</td>
          <td class="right">${formatCurrency(p.centerReturnAmount)}</td>
        </tr>
      `);
      rowCount++;
    }

    return rows.join('');
  }).join('');

  // Simple number-to-words (INR)
  const totalInWords = `INR ${Math.round(totalAmount).toLocaleString('en-IN')} Only`;

  const hsnRows = hsnSummary.map(h => `
    <tr>
      <td>${h.hsnCode}</td>
      <td class="right">${formatCurrency(h.taxableValue)}</td>
      <td>9%</td>
      <td class="right">${formatCurrency(h.cgstAmount)}</td>
      <td>9%</td>
      <td class="right">${formatCurrency(h.sgstAmount)}</td>
      <td class="right">${formatCurrency(h.totalTax)}</td>
    </tr>
  `).join('');

  const hsnTotalTaxable = hsnSummary.reduce((s, h) => s + h.taxableValue, 0);
  const hsnTotalCgst = hsnSummary.reduce((s, h) => s + h.cgstAmount, 0);
  const hsnTotalSgst = hsnSummary.reduce((s, h) => s + h.sgstAmount, 0);
  const hsnTotalTax = hsnSummary.reduce((s, h) => s + h.totalTax, 0);

  return `
    <html>
    <head>
      <title>Invoice - ${buyerName}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0;}

        @media screen {
          body {
            margin-left: 100px;
            margin-right: 100px;
            margin-top: 20px;
            margin-bottom: 20px;
          }
        }
        @media print {
          body { margin: 0; padding: 0; }
          @page { margin: 12mm; }
        }
        .title { text-align: center; font-weight: bold; font-size: 16px; margin: 6px 0; }
        .main-border { border: 1px solid #000; width: 100%; border-collapse: collapse; }
        .main-border td, .main-border th { border: 1px solid #000; padding: 5px; vertical-align: top; }
        .meta-table { width: 100%; border-collapse: collapse; }
        .meta-table td { border: 1px solid #000; padding: 6px; vertical-align: top; }
        .label { font-weight: bold; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .footer-note { font-style: italic; text-align: right; margin-top: 4px; }
        .repair-note { color: #666; font-size: 0.9em; }
        .free-note { color: green; font-size: 0.9em; }
        .print-button {
          display: block;
          margin: 20px auto;
          padding: 10px 15px;
          background-color: #3c8dbc;
          color: white;
          border: none;
          font-size: 16px;
          cursor: pointer;
          position: sticky;
          top: 20px;
          z-index: 1000;
        }
        @media print {
          .page-break { page-break-before: always; }
          .no-print { display: none; }
          .print-button { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="title">Tax Invoice</div>

      <table class="main-border">
        <tr>
          <td style="width:50%;">
            <div style="border-bottom:1px solid #000; padding-bottom:6px; margin-bottom:6px;">
              <div class="bold">SSV Telecom Private Limited FY 22-23</div>
              A-1, Landmark CHS, Sector 14<br/>
              Vashi, Navi Mumbai<br/>
              27ABECS3422Q1ZX<br/>
              GSTIN/UIN: 27ABECS3422Q1ZX
            </div>

            <span class="label">Consignee (Ship to)</span><br/>
            ${buyerName}<br/>
            ${centerNames}<br/><br/>
            GSTIN/UIN: ${buyerGST}<br/>
            State Name : Maharashtra, Code : 27
            <hr/>

            <span class="label">Buyer (Bill to)</span><br/>
            ${buyerName}<br/>
            ${buyerAddr}<br/>
            GSTIN/UIN: ${buyerGST}<br/>
            State Name : Maharashtra, Code : 27
          </td>

          <td style="width:50%; padding:0;">
            <table class="meta-table">
              <tr>
                <td><span class="label">Invoice No.</span><br/>${invoiceNumber}</td>
                <td><span class="label">Dated</span><br/>${formattedDate}</td>
              </tr>
              <tr>
                <td><span class="label">Delivery Note</span><br/>${metadata?.deliveryNote || ''}</td>
                <td><span class="label">Mode/Terms of Payment</span><br/>${metadata?.modeOfPayment || ''}</td>
              </tr>
              <tr>
                <td><span class="label">Reference No. & Date</span><br/>${metadata?.referenceNo || ''}</td>
                <td><span class="label">Other References</span><br/>${metadata?.otherReferences || ''}</td>
              </tr>
              <tr>
                <td><span class="label">Buyer's Order No.</span><br/>${metadata?.buyerOrderNo || ''}</td>
                <td><span class="label">Dated</span><br/></td>
              </tr>
              <tr>
                <td><span class="label">Dispatch Doc No.</span><br/>${metadata?.dispatchDocNo || ''}</td>
                <td><span class="label">Delivery Note Date</span><br/></td>
              </tr>
              <tr>
                <td><span class="label">Dispatched through</span><br/>${metadata?.dispatchedThrough || ''}</td>
                <td><span class="label">Destination</span><br/><b>${metadata?.destination || centerNames}</b></td>
              </tr>
              <tr>
                <td colspan="2"><span class="label">Terms of Delivery</span><br/>${metadata?.termsOfDelivery || ''}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table class="main-border" style="margin-top:10px;">
        <thead>
          <tr>
            <th>Sl No.</th>
            <th>Description of Goods</th>
            <th>HSN/SAC</th>
            <th>Quantity</th>
            <th>Rate</th>
            <th>Per</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${productRows}
          <tr>
            <td colspan="4" rowspan="7"></td>
            <td colspan="2"><b>Subtotal (New Stock from Outlet)</b></td>
            <td class="right">${formatCurrency(totalOutletAmount)}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Subtotal (Damage Repair)</b></td>
            <td class="right">${formatCurrency(totalDamageRepairAmount)}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Total Before Tax</b></td>
            <td class="right">${formatCurrency(totalBeforeTax)}</td>
          </tr>
          <tr><td colspan="2"><b>Output CGST @9%</b></td><td class="right">${formatCurrency(cgst)}</td></tr>
          <tr><td colspan="2"><b>Output SGST @9%</b></td><td class="right">${formatCurrency(sgst)}</td></tr>
          <tr><td colspan="2"><b>Round Off</b></td><td class="right">${formatCurrency(roundOff)}</td></tr>
          <tr><td colspan="2"><b>Total</b></td><td class="right">${formatCurrency(totalAmount)}</td></tr>
          <tr><td colspan="7"><b>Amount Chargeable (in words):</b><i> ${totalInWords}</i></td></tr>
        </tbody>
      </table>

      <div class="page-break"></div>

      <div class="analysis-header" style="display:flex; justify-content:space-between; margin-top:10px;">
        <div>Invoice No. <strong>${invoiceNumber}</strong></div>
        <div>Dated <strong>${formattedDate}</strong></div>
      </div>

      <div style="text-align:center;">
        <p><strong>SSV Telecom Private Limited</strong><br/>
          A-1, Landmark CHS, Sector 14<br/>
          Vashi , Navi Mumbai<br/>
          27ABECS3422Q1ZX<br/>
          GSTIN/UIN: 27ABECS3422Q1ZX<br/><br/>
          Party: <strong>${buyerName}</strong><br/>
          ${buyerAddr}<br/>
          GSTIN/UIN : ${buyerGST}<br/>
          State Name : Maharashtra, Code : 27
        </p>
      </div>

      <table class="main-border" style="margin-top:10px;">
        <thead>
          <tr>
            <th>HSN/SAC</th>
            <th>Taxable Value</th>
            <th colspan="2">CGST</th>
            <th colspan="2">SGST</th>
            <th>Total Tax Amount</th>
          </tr>
          <tr>
            <th></th><th></th>
            <th>Rate</th><th>Amount</th>
            <th>Rate</th><th>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${hsnRows}
          <tr class="bold">
            <td><b>Total</b></td>
            <td class="right">${formatCurrency(hsnTotalTaxable)}</td>
            <td></td>
            <td class="right">${formatCurrency(hsnTotalCgst)}</td>
            <td></td>
            <td class="right">${formatCurrency(hsnTotalSgst)}</td>
            <td class="right">${formatCurrency(hsnTotalTax)}</td>
          </tr>
          <tr>
            <td colspan="7"><b>Taxable Amount (in words):</b> <i>${totalInWords}</i></td>
          </tr>
        </tbody>
      </table>
      <button class="print-button no-print" onclick="window.print()">🖨️ Print</button>
    </body>
    </html>
  `;
};

// ─────────────────────────────────────────────
// CONTROLLER: Mark as Invoiced
// ─────────────────────────────────────────────
export const markAsInvoiced = async (req, res) => {
  try {
    console.log('\n🚀 STARTING markAsInvoiced');
    console.log('📋 Request body:', JSON.stringify({
      stockRequestIds: req.body.stockRequestIds,
      invoiceNumber: req.body.invoiceNumber,
      productsCount: req.body.invoiceData?.products?.length
    }, null, 2));

    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(req, ['manage_indent']);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. manage_indent permission required.',
      });
    }

    const { stockRequestIds, invoiceNumber, invoiceDate, invoiceData } = req.body;

    // Input validation
    if (!stockRequestIds || !Array.isArray(stockRequestIds) || stockRequestIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Stock request IDs are required' });
    }

    if (!invoiceNumber || invoiceNumber.trim() === '') {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User authentication required' });
    }

    // Fetch stock requests with product population
    console.log('\n📦 Fetching stock requests...');
    const stockRequests = await StockRequest.find({ _id: { $in: stockRequestIds } })
      .populate('center', '_id centerName centerCode reseller')
      .populate('products.product', '_id productTitle hsnCode salePrice productPrice');

    console.log(`✅ Fetched ${stockRequests.length} stock requests`);

    // Validate stock requests
    const validationErrors = [];
    const validStockRequests = [];

    for (const request of stockRequests) {
      if (!checkCenterAccess(request, userCenter, permissions)) {
        validationErrors.push({
          stockRequestId: request._id,
          orderNumber: request.orderNumber,
          error: `Access denied for center: ${request.center?.centerName || 'Unknown'}`,
        });
        continue;
      }

      if (request.invoiceInfo?.invoiceRaised) {
        validationErrors.push({
          stockRequestId: request._id,
          orderNumber: request.orderNumber,
          error: `Already invoiced with: ${request.invoiceInfo.invoiceNumber}`,
        });
        continue;
      }

      if (request.status !== 'Completed') {
        validationErrors.push({
          stockRequestId: request._id,
          orderNumber: request.orderNumber,
          error: `Status must be "Completed", current: ${request.status}`,
        });
        continue;
      }

      validStockRequests.push(request);
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed for some stock requests',
        errors: validationErrors,
      });
    }

    if (validStockRequests.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid stock requests to invoice' });
    }

    // Get reseller and centers
    const firstRequest = validStockRequests[0];
    const resellerId = firstRequest.center?.reseller?._id || firstRequest.center?.reseller;

    if (!resellerId) {
      return res.status(400).json({
        success: false,
        message: 'Reseller information not found',
      });
    }

    const centers = [...new Set(validStockRequests.map((r) => r.center._id))];
    const centerNames = [...new Set(validStockRequests.map((r) => r.center?.centerName).filter(Boolean))];
    const centersList = centerNames.join(', ');

    // Build products with rates from Product master
    console.log('\n🏗️ Building products with rates...');
    const productsForInvoice = await buildProductsForInvoice(
      invoiceData?.products || [],
      validStockRequests
    );

    // Calculate totals
    const totalOutletAmount = productsForInvoice.reduce((s, p) => s + (p.outletAmount || 0), 0);
    const totalDamageRepairAmount = productsForInvoice.reduce((s, p) => s + (p.damageRepairAmount || 0), 0);
    const totalCenterReturnAmount = productsForInvoice.reduce((s, p) => s + (p.centerReturnAmount || 0), 0);
    const totalBeforeTax = totalOutletAmount + totalDamageRepairAmount + totalCenterReturnAmount;

    const cgst = totalBeforeTax * 0.09;
    const sgst = totalBeforeTax * 0.09;
    const roundOff = Math.round((totalBeforeTax + cgst + sgst) * 100) / 100 - (totalBeforeTax + cgst + sgst);
    const totalAmount = Math.round((totalBeforeTax + cgst + sgst + roundOff) * 100) / 100;

    console.log('\n💰 Totals calculated:');
    console.log(`   Total Before Tax: ${totalBeforeTax}`);
    console.log(`   CGST (9%): ${cgst}`);
    console.log(`   SGST (9%): ${sgst}`);
    console.log(`   Round Off: ${roundOff}`);
    console.log(`   Total Amount: ${totalAmount}`);

    // Build HSN Summary
    const hsnSummaryMap = new Map();
    for (const product of productsForInvoice) {
      const hsn = product.hsnCode || 'NA';
      if (!hsnSummaryMap.has(hsn)) {
        hsnSummaryMap.set(hsn, {
          hsnCode: hsn,
          taxableValue: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          totalTax: 0,
        });
      }
      const entry = hsnSummaryMap.get(hsn);
      const taxableValue = product.totalAmount;
      const productCgst = taxableValue * 0.09;
      const productSgst = taxableValue * 0.09;

      entry.taxableValue += taxableValue;
      entry.cgstAmount += productCgst;
      entry.sgstAmount += productSgst;
      entry.totalTax += (productCgst + productSgst);
    }

    const hsnSummaryForInvoice = Array.from(hsnSummaryMap.values());

    // Metadata
    const metadata = invoiceData?.metadata || {
      deliveryNote: '',
      modeOfPayment: '',
      referenceNo: '',
      otherReferences: '',
      buyerOrderNo: '',
      dispatchDocNo: '',
      dispatchedThrough: '',
      destination: centersList || 'All Alpha Area',
      termsOfDelivery: '',
    };

    // ─────────────────────────────────────────────
    // 👇 NEW: Fetch reseller details & generate invoiceHtml on the backend
    //         using the RESOLVED rates (productsForInvoice), not the
    //         frontend-provided (potentially zero-rate) invoiceHtml.
    // ─────────────────────────────────────────────
    console.log('\n📝 Generating invoice HTML on backend with resolved rates...');
    const resellerDoc = await Reseller.findById(resellerId).lean();

    const generatedInvoiceHtml = generateInvoiceHtml({
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      reseller: resellerDoc,
      centerNames: centersList || 'All Alpha Area',
      products: productsForInvoice,
      totalOutletAmount,
      totalDamageRepairAmount,
      totalBeforeTax,
      cgst,
      sgst,
      roundOff,
      totalAmount,
      hsnSummary: hsnSummaryForInvoice,
      metadata,
    });

    // Create and save invoice
    const invoice = new Invoice({
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      stockRequestIds: validStockRequests.map((r) => r._id),
      reseller: resellerId,
      centers,
      products: productsForInvoice,
      totalOutletAmount,
      totalDamageRepairAmount,
      totalCenterReturnAmount,
      totalBeforeTax,
      cgst,
      sgst,
      roundOff,
      totalAmount,
      metadata,
      hsnSummary: hsnSummaryForInvoice,
      invoiceHtml: generatedInvoiceHtml, // 👈 CHANGED: backend-generated HTML with correct rates
      status: 'generated',
      createdBy: userId,
      createdAt: new Date(),
    });

    console.log('\n💾 Saving invoice...');
    await invoice.save();
    console.log(`✅ Invoice ${invoiceNumber} saved successfully`);

    // Update stock requests
    const updatePromises = validStockRequests.map((stockRequest) =>
      StockRequest.findByIdAndUpdate(
        stockRequest._id,
        {
          $set: {
            'invoiceInfo.invoiceRaised': true,
            'invoiceInfo.invoiceNumber': invoiceNumber.trim(),
            'invoiceInfo.invoiceDate': invoiceDate ? new Date(invoiceDate) : new Date(),
            'invoiceInfo.invoiceRaisedAt': new Date(),
            'invoiceInfo.invoiceRaisedBy': userId,
            'invoiceInfo.invoiceId': invoice._id,
            updatedBy: userId,
          },
        },
        { new: true }
      )
    );

    await Promise.all(updatePromises);
    console.log(`✅ Updated ${validStockRequests.length} stock requests`);

    // Populate and return
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('reseller', 'businessName gstNumber address1 address2 city state')
      .populate('centers', 'centerName centerCode')
      .populate('stockRequestIds', 'orderNumber challanNo date center')
      .populate('createdBy', 'fullName email');

    return res.status(200).json({
      success: true,
      message: `${validStockRequests.length} stock request(s) invoiced successfully. Invoice #${invoiceNumber} created.`,
      data: {
        invoice: populatedInvoice,
        stockRequestsUpdated: validStockRequests.length,
      },
    });

  } catch (error) {
    console.error('\n❌ ERROR in markAsInvoiced:', error);

    if (error.code === 11000 && error.keyPattern?.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: `Invoice number already exists. Please use a different invoice number.`,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error marking stock requests as invoiced',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// ─────────────────────────────────────────────
// CONTROLLER: Get Invoice by ID
// ─────────────────────────────────────────────
export const getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    console.log(`\n🔍 Fetching invoice: ${invoiceId}`);

    const invoice = await Invoice.findById(invoiceId)
      .populate('reseller', 'businessName gstNumber address1 address2 city state')
      .populate('centers', 'centerName centerCode')
      .populate('createdBy', 'fullName email')
      .populate('cancellationDetails.cancelledBy', 'fullName email');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Get the stock requests with their actual received quantities
    const stockRequests = await StockRequest.find({
      _id: { $in: invoice.stockRequestIds }
    })
    .populate('items.product', 'productName sku')
    .populate('requestedBy', 'fullName email')
    .populate('approvedBy', 'fullName email')
    .populate('receivedBy', 'fullName email');

    // Calculate total quantities from stock requests
    let totalItems = 0;
    let totalReceivedQty = 0;
    const stockRequestDetails = [];

    stockRequests.forEach(stockRequest => {
      // Get the actual received quantities from the stock request
      // Depending on your StockRequest model structure, you might need to adjust this
      const items = stockRequest.items || [];
      const receivedItems = stockRequest.receivedItems || []; // If you have separate received items array
      const approvedItems = stockRequest.approvedItems || []; // If you have separate approved items array

      // Calculate totals based on your model structure
      let requestTotalItems = 0;
      let requestTotalReceivedQty = 0;
      
      // Option 1: If you have receivedItems array with actual received quantities
      if (receivedItems && receivedItems.length > 0) {
        receivedItems.forEach(item => {
          requestTotalItems += item.quantity || 0;
          requestTotalReceivedQty += item.receivedQty || item.quantity || 0;
        });
      } 
      // Option 2: If you store received quantities within items array
      else if (items && items.length > 0) {
        items.forEach(item => {
          requestTotalItems += item.quantity || 0;
          // Use receivedQty if available, otherwise fallback to quantity
          requestTotalReceivedQty += item.receivedQty || item.quantity || 0;
        });
      }
      // Option 3: If you have separate receivedQty field at stock request level
      else {
        requestTotalItems = stockRequest.totalItems || 0;
        requestTotalReceivedQty = stockRequest.receivedQty || 0;
      }

      totalItems += requestTotalItems;
      totalReceivedQty += requestTotalReceivedQty;

      stockRequestDetails.push({
        stockRequestId: stockRequest._id,
        orderNumber: stockRequest.orderNumber,
        challanNo: stockRequest.challanNo,
        totalItems: requestTotalItems,
        totalReceivedQty: requestTotalReceivedQty,
        status: stockRequest.status,
        items: items.map(item => ({
          productName: item.product?.productName || item.productName,
          sku: item.product?.sku || item.sku,
          requestedQty: item.quantity || 0,
          receivedQty: item.receivedQty || 0, // This should be the actual received quantity
          unitPrice: item.unitPrice || 0,
          totalPrice: item.totalPrice || 0
        }))
      });
    });

    // Prepare the response with actual received quantities
    const responseData = {
      ...invoice.toObject(),
      stockRequestIds: stockRequestDetails,
      summary: {
        totalStockRequests: stockRequests.length,
        totalItems: totalItems,
        totalReceivedQty: totalReceivedQty
      }
    };

    console.log(`✅ Invoice found: ${invoice.invoiceNumber}`);
    console.log(`📦 Total Received Qty: ${totalReceivedQty}`);
    
    return res.status(200).json({ 
      success: true, 
      data: responseData 
    });

  } catch (error) {
    console.error('❌ Error fetching invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching invoice',
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// CONTROLLER: Get All Invoices
// ─────────────────────────────────────────────
export const getAllInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      startDate,
      endDate,
      resellerId,
      center,
      centerId, // FIXED: accept centerId too, matching the query-param name used by other endpoints (e.g. indent-usage-summary)
      status,
      cancelWithCreditNote,
      invoiceNumber,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
    } = req.query;

    // FIXED: normalize to a single value regardless of which param name was sent
    const centerParam = center || centerId;

    console.log('\n📋 Fetching all invoices');
    console.log('Query params:', req.query);

    // Build filter object
    const filter = {};

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      filter.invoiceDate = { 
        $gte: start, 
        $lte: end 
      };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filter.invoiceDate = { $gte: start };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.invoiceDate = { $lte: end };
    }

    // Reseller filter
    if (resellerId) {
      filter.reseller = resellerId;
    }

    // Center filter
    // FIXED: uses centerParam (center OR centerId) instead of only `center`
    if (centerParam) {
      if (mongoose.Types.ObjectId.isValid(centerParam)) {
        filter.centers = { $in: [centerParam] };
      } else {
        const centerIds = centerParam.split(',').map(id => id.trim());
        const validCenterIds = centerIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validCenterIds.length > 0) {
          filter.centers = { $in: validCenterIds };
        }
      }
    }

    // Invoice number search
    if (invoiceNumber) {
      filter.invoiceNumber = { 
        $regex: invoiceNumber, 
        $options: 'i' 
      };
    }

    // Status filter
    if (status) {
      if (status === 'cancelled') {
        filter.status = 'cancelled';
      } else if (status === 'active') {
        filter.status = { $ne: 'cancelled' };
      } else {
        filter.status = status;
      }
    }

    // Credit note filter
    if (cancelWithCreditNote !== undefined && cancelWithCreditNote !== '') {
      const bool = cancelWithCreditNote === 'true' || cancelWithCreditNote === true;
      filter['cancellationDetails.cancelWithCreditNote'] = bool;
      if (!filter.status) {
        filter.status = 'cancelled';
      }
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count
    const totalCount = await Invoice.countDocuments(filter);
    console.log(`📊 Total invoices matching filter: ${totalCount}`);

    // Get invoices with basic population
    const invoices = await Invoice.find(filter)
      .populate('reseller', 'businessName gstNumber email phone')
      .populate('centers', 'centerName centerCode')
      .populate('createdBy', 'fullName email')
      .populate('cancellationDetails.cancelledBy', 'fullName email')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    console.log(`📄 Found ${invoices.length} invoices for current page`);

    if (invoices.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit) || 1,
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        },
        filters: {
          applied: {
            startDate: startDate || null,
            endDate: endDate || null,
            resellerId: resellerId || null,
            center: centerParam || null, // FIXED: report the normalized value
            status: status || null,
            cancelWithCreditNote: cancelWithCreditNote || null,
            invoiceNumber: invoiceNumber || null,
          }
        },
        summary: {
          totalInvoices: totalCount,
          totalAmount: 0,
        }
      });
    }

    // Extract all stock request IDs from invoices
    const stockRequestIds = invoices
      .filter(inv => inv.stockRequestIds && inv.stockRequestIds.length > 0)
      .flatMap(inv => inv.stockRequestIds)
      .filter(id => id);

    // Fetch all stock requests
    let stockRequests = [];
    if (stockRequestIds.length > 0) {
      stockRequests = await StockRequest.find({
        _id: { $in: stockRequestIds }
      })
      .populate('center', '_id centerName centerCode')
      .populate('products.product', '_id productTitle hsnCode salePrice')
      .lean();
    }

    // Create a map of stock request ID to its details
    const stockRequestMap = {};
    
    stockRequests.forEach(sr => {
      const centerId = sr.center?._id?.toString() || sr.center?.toString();
      
      let totalRequestedQty = 0;
      let totalReceivedQty = 0;
      let totalItems = 0;
      let totalAmount = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      let totalWithGST = 0;

      const processedItems = (sr.products || sr.items || []).map(item => {
        const productData = item.product || {};
        const requestedQty = item.quantity || 0;
        const receivedQty = item.receivedQuantity || item.receivedQty || requestedQty;
        const rate = item.outletRate || item.unitPrice || item.rate || productData.salePrice || 0;
        const gstRate = item.gstRate || 18;
        
        const total = receivedQty * rate;
        const cgst = (total * gstRate / 2) / 100;
        const sgst = (total * gstRate / 2) / 100;
        const itemTotalWithGST = total + cgst + sgst;

        totalRequestedQty += requestedQty;
        totalReceivedQty += receivedQty;
        totalItems += 1;
        totalAmount += total;
        totalCGST += cgst;
        totalSGST += sgst;
        totalWithGST += itemTotalWithGST;

        return {
          productId: productData._id || item.productId,
          productName: productData.productTitle || item.productName || 'Unknown Product',
          hsnCode: productData.hsnCode || item.hsnCode || '',
          requestedQty: requestedQty,
          receivedQty: receivedQty,
          rate: Math.round(rate * 100) / 100,
          total: Math.round(total * 100) / 100,
          gstRate: gstRate,
          cgst: Math.round(cgst * 100) / 100,
          sgst: Math.round(sgst * 100) / 100,
          totalWithGST: Math.round(itemTotalWithGST * 100) / 100
        };
      });

      stockRequestMap[sr._id.toString()] = {
        _id: sr._id,
        orderNumber: sr.orderNumber || 'N/A',
        challanNo: sr.challanNo || 'N/A',
        date: sr.date || sr.createdAt || null,
        status: sr.status || 'unknown',
        centerId: centerId,
        centerName: sr.center?.centerName || 'Unknown Center',
        totalRequestedQty: Math.round(totalRequestedQty * 100) / 100,
        totalReceivedQty: Math.round(totalReceivedQty * 100) / 100,
        totalItems: totalItems,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalCGST: Math.round(totalCGST * 100) / 100,
        totalSGST: Math.round(totalSGST * 100) / 100,
        totalWithGST: Math.round(totalWithGST * 100) / 100,
        items: processedItems
      };
    });

    // Get the center filter value
    // FIXED: use centerParam (center OR centerId) here too, so the
    // per-invoice enrichment (filtering stockRequestIds/products/centers
    // down to just this one center) actually activates.
    const centerFilter = centerParam ? centerParam.toString() : null;

    // Enrich invoices with stock request details
    const enrichedInvoices = invoices.map(invoice => {
      // Filter stock requests by center
      const filteredStockRequests = (invoice.stockRequestIds || [])
        .filter(id => id)
        .map(id => {
          const sr = stockRequestMap[id.toString()];
          if (sr && (!centerFilter || sr.centerId === centerFilter)) {
            return sr;
          }
          return null;
        })
        .filter(sr => sr !== null);

      // Get product IDs from filtered stock requests
      const productIdsFromStockRequests = new Set();
      filteredStockRequests.forEach(sr => {
        sr.items.forEach(item => {
          if (item.productId) {
            productIdsFromStockRequests.add(item.productId.toString());
          }
        });
      });

      let filteredProducts = invoice.products || [];
      if (productIdsFromStockRequests.size > 0) {
        filteredProducts = filteredProducts.filter(product => {
          const productId = product.productId?.toString() || product._id?.toString();
          return productIdsFromStockRequests.has(productId);
        });
      }

      // Calculate totals from filtered products
      let totalOutletAmount = 0;
      let totalDamageRepairAmount = 0;
      let totalCenterReturnAmount = 0;
      
      filteredProducts.forEach(p => {
        totalOutletAmount += (p.outletAmount || 0);
        totalDamageRepairAmount += (p.damageRepairAmount || 0);
        totalCenterReturnAmount += (p.centerReturnAmount || 0);
      });
      
      const totalBeforeTax = totalOutletAmount + totalDamageRepairAmount + totalCenterReturnAmount;
      const cgst = totalBeforeTax * 0.09;
      const sgst = totalBeforeTax * 0.09;
      const totalAmount = totalBeforeTax + cgst + sgst;

      // Build HSN summary
      const hsnMap = new Map();
      filteredProducts.forEach(p => {
        const hsn = p.hsnCode || 'NA';
        if (!hsnMap.has(hsn)) {
          hsnMap.set(hsn, {
            hsnCode: hsn,
            taxableValue: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            totalTax: 0
          });
        }
        const entry = hsnMap.get(hsn);
        const taxableValue = p.totalAmount || p.outletAmount || 0;
        entry.taxableValue += taxableValue;
        entry.cgstAmount += taxableValue * 0.09;
        entry.sgstAmount += taxableValue * 0.09;
        entry.totalTax += taxableValue * 0.18;
      });

      return {
        ...invoice,
        stockRequestIds: filteredStockRequests,
        centers: centerFilter 
          ? invoice.centers.filter(c => c._id.toString() === centerFilter)
          : invoice.centers,
        products: filteredProducts,
        totalOutletAmount: Math.round(totalOutletAmount * 100) / 100,
        totalDamageRepairAmount: Math.round(totalDamageRepairAmount * 100) / 100,
        totalCenterReturnAmount: Math.round(totalCenterReturnAmount * 100) / 100,
        totalBeforeTax: Math.round(totalBeforeTax * 100) / 100,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        hsnSummary: Array.from(hsnMap.values()),
        invoiceSummary: {
          totalRequestedQty: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalRequestedQty || 0), 0),
          totalReceivedQty: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalReceivedQty || 0), 0),
          totalItems: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalItems || 0), 0),
          totalAmount: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalAmount || 0), 0),
          totalCGST: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalCGST || 0), 0),
          totalSGST: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalSGST || 0), 0),
          totalWithGST: filteredStockRequests.reduce((sum, sr) => sum + (sr.totalWithGST || 0), 0)
        }
      };
    });

    // Calculate grand totals
    let grandTotalAmount = 0;
    let grandTotalWithGST = 0;
    
    enrichedInvoices.forEach(inv => {
      grandTotalAmount += inv.totalAmount || 0;
      grandTotalWithGST += inv.totalAmount || 0;
    });

    return res.status(200).json({
      success: true,
      data: enrichedInvoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      filters: {
        applied: {
          startDate: startDate || null,
          endDate: endDate || null,
          resellerId: resellerId || null,
          center: centerParam || null, // FIXED: report the normalized value
          status: status || null,
          cancelWithCreditNote: cancelWithCreditNote || null,
          invoiceNumber: invoiceNumber || null,
        },
        available: {
          statuses: [],
          creditNoteOptions: ['true', 'false'],
        },
      },
      summary: {
        statusCounts: {},
        creditNoteStats: {
          withCreditNote: 0,
          withoutCreditNote: 0
        },
        totalInvoiceAmount: Math.round(grandTotalAmount * 100) / 100,
        totalInvoices: totalCount,
        totalAmount: Math.round(grandTotalAmount * 100) / 100,
        totalWithGST: Math.round(grandTotalWithGST * 100) / 100
      }
    });

  } catch (error) {
    console.error('❌ Error fetching invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// CONTROLLER: Cancel Invoice
// ─────────────────────────────────────────────
export const cancelInvoice = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(req, ['manage_indent']);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. manage_indent permission required.',
      });
    }

    const { invoiceId } = req.params;
    const { cancelReason, cancelWithCreditNote } = req.body;

    console.log(`\n🚫 Cancelling invoice: ${invoiceId}`);

    if (!cancelReason || cancelReason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Cancel reason is required' });
    }

    if (cancelWithCreditNote === undefined || cancelWithCreditNote === null) {
      return res.status(400).json({ success: false, message: 'Please specify cancel with credit note' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User authentication required' });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Invoice is already cancelled' });
    }

    if (!permissions.indent_all_center) {
      const stockRequests = await StockRequest.find({ _id: { $in: invoice.stockRequestIds } }).populate('center');
      const hasCenterAccess = stockRequests.some((r) => checkCenterAccess(r, userCenter, permissions));
      if (!hasCenterAccess) {
        return res.status(403).json({ success: false, message: "Access denied to cancel this invoice" });
      }
    }

    invoice.status = 'cancelled';
    invoice.cancellationDetails = {
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelReason,
      cancelWithCreditNote,
    };
    invoice.updatedAt = new Date();

    await invoice.save();

    const stockRequestUpdatePromises = invoice.stockRequestIds.map((stockRequestId) =>
      StockRequest.findByIdAndUpdate(
        stockRequestId,
        {
          $set: {
            'invoiceInfo.invoiceRaised': false,
            'invoiceInfo.invoiceCancelled': true,
            'invoiceInfo.invoiceCancelledAt': new Date(),
            'invoiceInfo.invoiceCancelledBy': userId,
            'invoiceInfo.invoiceCancellationReason': cancelReason,
            updatedBy: userId,
          },
        },
        { new: true }
      )
    );

    await Promise.all(stockRequestUpdatePromises);

    console.log(`✅ Invoice ${invoice.invoiceNumber} cancelled`);

    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('reseller', 'businessName gstNumber')
      .populate('centers', 'centerName centerCode')
      .populate('stockRequestIds', 'orderNumber challanNo')
      .populate('createdBy', 'fullName email')
      .populate('cancellationDetails.cancelledBy', 'fullName email');

    return res.status(200).json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} cancelled successfully${cancelWithCreditNote ? ' with credit note' : ''}`,
      data: {
        invoice: populatedInvoice,
        creditNoteGenerated: cancelWithCreditNote,
      },
    });

  } catch (error) {
    console.error('❌ Error cancelling invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Error cancelling invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// ─────────────────────────────────────────────
// CONTROLLER: Generate Unique Voucher Number
// ─────────────────────────────────────────────
export const generateVoucherNumber = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Calculate financial year (April to March)
    let financialYear = '';
    if (currentMonth >= 4) {
      financialYear = `${currentYear.toString().slice(-2)}-${(currentYear + 1).toString().slice(-2)}`;
    } else {
      financialYear = `${(currentYear - 1).toString().slice(-2)}-${currentYear.toString().slice(-2)}`;
    }

    console.log(`\n Generating voucher number for financial year: ${financialYear}`);

    // Find all vouchers for this financial year
    const allVouchers = await RaisePO.find({
      voucherNo: { $regex: `STELE/\\d{2}/${financialYear}$` }
    }).select('voucherNo').lean();

    console.log(`Found ${allVouchers.length} existing vouchers`);

    // Extract and track existing sequence numbers
    let maxSequence = 0;
    const existingSequences = new Set();

    for (const voucher of allVouchers) {
      const match = voucher.voucherNo.match(/^STELE\/(\d{2})\/(\d{2}-\d{2})$/);
      if (match && match[1]) {
        const sequence = parseInt(match[1]);
        existingSequences.add(sequence);
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    }

    // Start from max sequence + 1
    let nextSequence = maxSequence + 1;

    // Ensure unique voucher number (max 99 sequences per financial year)
    let isUnique = false;
    let finalSequence = nextSequence;
    let attempts = 0;
    const maxAttempts = 100; // Safety limit

    while (!isUnique && attempts < maxAttempts) {
      const paddedSequence = finalSequence.toString().padStart(2, '0');
      const voucherNumber = `STELE/${paddedSequence}/${financialYear}`;

      // Double-check if this voucher number already exists
      const exists = await RaisePO.findOne({ voucherNo: voucherNumber }).lean();

      if (!exists) {
        isUnique = true;
        console.log(`Generated unique voucher: ${voucherNumber} (Sequence: ${finalSequence})`);

        return res.status(200).json({
          success: true,
          message: 'Voucher number generated successfully',
          data: {
            voucherNo: voucherNumber,
            sequence: finalSequence,
            financialYear: financialYear
          }
        });
      }

      console.log(`Voucher ${voucherNumber} already exists, trying next sequence...`);
      finalSequence++;
      attempts++;
    }

    if (!isUnique) {
      console.error(`Failed to generate unique voucher after ${maxAttempts} attempts`);
      return res.status(500).json({
        success: false,
        message: 'Unable to generate unique voucher number. Please contact support.',
        error: 'Max attempts reached'
      });
    }

  } catch (error) {
    console.error('❌ Error generating voucher number:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate voucher number',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
