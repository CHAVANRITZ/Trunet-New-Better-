// scripts/rsaPolicyGeneration.js
// TVS Service (RSA) - Policy Generation Automation
// Run with: node scripts/rsaPolicyGeneration.js [--cron] [--booking-id BKXXXXX]

const { chromium } = require('playwright');
const Imap = require('imap');
const readline = require('readline');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { 
  sendAutomationErrorEmail, 
  sendAutomationSuccessEmail,
  markForRetry 
} = require('../utils/emailNotifier');

// ============================================================
// CONFIGURATION
// ============================================================

const TVS_SERVICE_URL = 'https://www.tvsservice.com';
const TVS_SERVICE_DASHBOARD_URL = 'https://www.tvsservice.com/common-dashboard';
const TVS_SERVICE_USERNAME = '14589';
const TVS_SERVICE_PASSWORD = 'Gandhi@14589#';
const TVS_SERVICE_EMAIL = 'gmplrsa@gmail.com';
const TVS_SERVICE_APP_PASSWORD = 'bwzx qsnf nxhn drge';

// RSA Policy Generation URLs
const RSA_RIDER_POLICY_URL = 'https://www.tvsservice.com/asa/in/rsa/rider/generate-policy';
const RSA_SALES_POLICY_URL = 'https://www.tvsservice.com/asa/in/rsa/sales/generate-policy';

// Models that require SALES policy URL and their corresponding plan names
const SALES_POLICY_MODELS = {
  'TVS XL 100': {
    planName: 'Platinum',
    price: 441
  },
  'TVS ORBITER': {
    planName: 'EV-RSA',
    price: 999
  },
  'TVS RONIN': {
    planName: 'LIMITLESS ASSIST (Ronin)',
    price: 674
  }
};

// Default plan for RIDER policy
const DEFAULT_RIDER_PLAN = 'Rider Care Basic';

// MIS API Configuration
const MIS_API_BASE = 'https://gmplmis.com/dealership-api/api/v1';
const MIS_API_INSURANCE_COMPLETED_URL = `${MIS_API_BASE}/bookings/insurance-status/AWAITING`;
const RSA_PLANS_URL = `${MIS_API_BASE}/rsa-plans`;

// Remote debugging port for existing browser
const REMOTE_DEBUGGING_PORT = 9224;

// ============================================================
// RSA PUBLIC DIRECTORY CONFIGURATION
// ============================================================

// Folder on the server where downloaded RSA policy PDFs are saved
const PUBLIC_RSA_DIR = '/home/gmplmis/htdocs/gmplmis.com/dealership-api/public/rsa-policies';
// Public URL prefix for serving the RSA files
const PUBLIC_RSA_URL_PREFIX = '/rsa-policies';

// API endpoint for updating booking with RSA policy
const MIS_API_UPDATE_RSA_URL = (bookingId) =>
  `${MIS_API_BASE}/bookings/${bookingId}/rsa-policy`;

// API endpoint to check if RSA policy exists for chassis
const MIS_API_CHECK_RSA_URL = (chassisNumber) =>
  `${MIS_API_BASE}/bookings/rsa-check/${chassisNumber}`;

// ============================================================
// TRACKING - Track bookings processed for RSA
// ============================================================

// File to store processed booking IDs and chassis numbers for RSA
const RSA_PROCESSED_TRACKING_FILE = path.join(__dirname, '..', 'logs', 'rsa-processed.json');

// Load processed records from file
function loadRSARecords() {
  try {
    if (fs.existsSync(RSA_PROCESSED_TRACKING_FILE)) {
      const data = fs.readFileSync(RSA_PROCESSED_TRACKING_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.log(`  ⚠️ Could not load RSA tracking file: ${e.message}`);
  }
  return { bookings: [], chassis: [], lastUpdated: null, totalProcessed: 0 };
}

// Save processed records to file
function saveRSARecords(records) {
  try {
    const dir = path.dirname(RSA_PROCESSED_TRACKING_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(RSA_PROCESSED_TRACKING_FILE, JSON.stringify(records, null, 2));
  } catch (e) {
    console.log(`  ⚠️ Could not save RSA tracking file: ${e.message}`);
  }
}

// Check if booking was already processed for RSA
function isRSABookingProcessed(bookingId) {
  const records = loadRSARecords();
  return records.bookings && records.bookings.includes(bookingId);
}

// Check if chassis was already processed for RSA
function isRSABookingProcessedByChassis(chassisNumber) {
  const records = loadRSARecords();
  return records.chassis && records.chassis.includes(chassisNumber);
}

// Mark booking as processed for RSA
function markRSABookingProcessed(bookingId, chassisNumber) {
  const records = loadRSARecords();
  
  if (!records.bookings) {
    records.bookings = [];
  }
  if (!records.chassis) {
    records.chassis = [];
  }
  
  let added = false;
  if (!records.bookings.includes(bookingId)) {
    records.bookings.push(bookingId);
    added = true;
  }
  if (!records.chassis.includes(chassisNumber)) {
    records.chassis.push(chassisNumber);
    added = true;
  }
  
  if (added) {
    records.lastUpdated = new Date().toISOString();
    records.totalProcessed = records.bookings.length;
    saveRSARecords(records);
    console.log(`  📝 Recorded RSA: ${bookingId} (${chassisNumber}) - Already processed`);
  }
}

// ============================================================
// FETCH BOOKINGS WITH COMPLETED INSURANCE - WITH DATE FILTERS
// ============================================================

async function fetchCompletedInsuranceBookingsWithDates(startDate, endDate) {
  console.log(`\n🔍 Fetching bookings with COMPLETED insurance status for date range...`);
  console.log(`📡 API: ${MIS_API_INSURANCE_COMPLETED_URL}`);
  
  return new Promise((resolve, reject) => {
    const url = new URL(MIS_API_INSURANCE_COMPLETED_URL);
    
    // Add date filters if provided
    if (startDate) {
      url.searchParams.set('startDate', startDate);
    }
    if (endDate) {
      url.searchParams.set('endDate', endDate);
    }
    
    // Add pagination
    url.searchParams.set('page', '1');
    url.searchParams.set('limit', '100');

    console.log(`📡 Request URL: ${url.toString()}`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (!response.success) {
            reject(new Error('API returned error: ' + (response.message || 'Unknown error')));
            return;
          }

          console.log(`✅ Found ${response.data.length} bookings with COMPLETED insurance status`);
          resolve(response.data);
        } catch (error) {
          reject(new Error('Failed to parse API response: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error('API request failed: ' + error.message));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });

    req.end();
  });
}

// ============================================================
// GET BOOKINGS FOR RSA PROCESSING WITH DATE FILTERS
// ============================================================

async function getBookingsForRSA(startDate, endDate) {
  console.log('\n📡 Fetching bookings for RSA processing...');
  
  try {
    const bookings = await fetchCompletedInsuranceBookingsWithDates(startDate, endDate);
    
    if (!bookings || bookings.length === 0) {
      console.log('  ℹ️ No bookings found with COMPLETED insurance status');
      return { 
        eligible: [], 
        total: 0, 
        skipped: 0, 
        startDate, 
        endDate, 
        summary: 'No completed insurance bookings found',
        allBookingsWithStatus: []
      };
    }

    console.log(`📊 Total bookings with completed insurance: ${bookings.length}`);

    const eligibleBookings = [];
    const skippedBookings = [];
    const allBookingsWithStatus = [];
    let alreadyProcessedCount = 0;

    for (const booking of bookings) {
      const chassisNumber = booking.chassisNumber || 
                        booking.chassisNo || 
                        booking.vehicleDetails?.chassisNumber || 
                        booking.vehicleDetails?.chassisNo || 
                        booking.vehicle?.chassisNumber ||
                        booking.vehicle?.chassisNo ||
                        '';
      const bookingId = booking.bookingNumber || booking._id;
      const customerName = booking.customerDetails?.name || 'N/A';
      
      const status = {
        bookingId,
        customerName,
        chassisNumber,
        status: 'PENDING',
        reason: ''
      };

      // Check if already processed for RSA
      if (isRSABookingProcessed(bookingId)) {
        status.status = 'ALREADY_PROCESSED';
        status.reason = 'Already processed for RSA';
        allBookingsWithStatus.push(status);
        alreadyProcessedCount++;
        console.log(`📌 ${bookingId} | ${customerName} | ${chassisNumber} | ALREADY PROCESSED (RSA)`);
        continue;
      }

      if (isRSABookingProcessedByChassis(chassisNumber)) {
        status.status = 'ALREADY_PROCESSED';
        status.reason = 'Chassis already processed for RSA';
        allBookingsWithStatus.push(status);
        alreadyProcessedCount++;
        console.log(`📌 ${bookingId} | ${customerName} | ${chassisNumber} | ALREADY PROCESSED (chassis)`);
        continue;
      }

      if (!chassisNumber) {
        status.status = 'SKIPPED';
        status.reason = 'No chassis number';
        skippedBookings.push(status);
        allBookingsWithStatus.push(status);
        console.log(`⏭️ ${bookingId} | ${customerName} | No chassis number, skipping`);
        continue;
      }

      // Check if RSA already exists for this chassis
      const hasRSA = await checkRSAExistsForChassis(chassisNumber);
      
      if (hasRSA) {
        status.status = 'SKIPPED';
        status.reason = 'RSA already exists (API check)';
        skippedBookings.push(status);
        allBookingsWithStatus.push(status);
        markRSABookingProcessed(bookingId, chassisNumber);
        console.log(`⏭️ ${bookingId} | ${customerName} | RSA already exists, skipping and tracking`);
        continue;
      }

      // ✅ ELIGIBLE for processing
      status.status = 'PENDING_PROCESS';
      status.reason = 'Ready to process';
      eligibleBookings.push(booking);
      allBookingsWithStatus.push(status);
      console.log(`✅ ${bookingId} | ${customerName} | ${chassisNumber} | ELIGIBLE for RSA processing`);
    }

    console.log('─'.repeat(60));
    console.log(`📊 RSA SUMMARY:`);
    console.log(`   📝 Total bookings in system: ${bookings.length}`);
    console.log(`   ✅ Eligible for processing: ${eligibleBookings.length}`);
    console.log(`   ⏭️ Skipped: ${skippedBookings.length}`);
    console.log(`   ✅ Already processed: ${alreadyProcessedCount}`);
    console.log('─'.repeat(60));

    return {
      eligible: eligibleBookings,
      total: bookings.length,
      skipped: skippedBookings.length,
      startDate,
      endDate,
      allBookings: bookings,
      skippedBookings,
      allBookingsWithStatus,
      alreadyProcessed: alreadyProcessedCount,
      summary: `Total: ${bookings.length} | Eligible: ${eligibleBookings.length} | Skipped: ${skippedBookings.length} | Already processed: ${alreadyProcessedCount}`
    };

  } catch (error) {
    console.log(`  ❌ Error fetching bookings: ${error.message}`);
    return {
      eligible: [],
      total: 0,
      skipped: 0,
      startDate,
      endDate,
      error: error.message,
      allBookingsWithStatus: []
    };
  }
}

// ============================================================
// CHECK IF RSA ALREADY EXISTS FOR CHASSIS NUMBER
// ============================================================

async function checkRSAExistsForChassis(chassisNumber) {
  console.log(`  🔍 Checking if RSA exists for chassis: ${chassisNumber}`);

  return new Promise((resolve) => {
    const url = new URL(MIS_API_CHECK_RSA_URL(chassisNumber));

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const exists = response.hasRSA === true || response.exists === true;
          console.log(`  ${exists ? '⚠️' : '✅'} RSA ${exists ? 'already EXISTS' : 'does NOT exist'} for chassis: ${chassisNumber}`);
          resolve(exists);
        } catch (error) {
          console.log(`  ⚠️ API check failed, assuming RSA does NOT exist: ${error.message}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`  ⚠️ API request failed, assuming RSA does NOT exist: ${error.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log(`  ⚠️ API request timed out, assuming RSA does NOT exist`);
      resolve(false);
    });

    req.end();
  });
}

// ============================================================
// PROMPT FUNCTIONS
// ============================================================

function promptForBookingId() {
  const cliArg = process.argv.find(arg => arg.startsWith('--booking-id='));
  if (cliArg) {
    const bookingId = cliArg.split('=')[1].trim();
    console.log(`\n📋 Booking ID from command-line argument: ${bookingId}`);
    return Promise.resolve(bookingId);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n📋 Enter Booking ID (e.g., BK002416): ', (bookingId) => {
      rl.close();
      resolve(bookingId.trim());
    });
  });
}

async function getOTPManually() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n📱 Please check your email for OTP');
    rl.question('Enter OTP (6 digits): ', (otp) => {
      rl.close();
      resolve(otp.trim());
    });
  });
}

// ============================================================
// FETCH BOOKING DETAILS FROM MIS API
// ============================================================

// ============================================================
// FETCH BOOKING DETAILS FROM MIS API  (replace the whole existing function)
// ============================================================
// Endpoint is UNCHANGED — still MIS_API_INSURANCE_COMPLETED_URL as defined
// in your CONFIGURATION section (.../insurance-status/AWAITING).
//
// The actual bug: this function only ever requested page 1 (limit 100)
// with NO `search` param and NO fallback to later pages. So a booking
// that's correctly in the DB with AWAITING status, but not inside the
// first 100 results, was reported as "not found."
//
// Fix: pass `search=<bookingId>` so the API itself narrows the results,
// AND scan subsequent pages if it's still not found on page 1. No date
// filter is applied — manual lookup works for any booking, any date.

async function fetchBookingDetails(bookingId) {
  console.log(`\n🔍 Fetching booking details for: ${bookingId}`);
  console.log(`📡 API: ${MIS_API_INSURANCE_COMPLETED_URL}`);

  return new Promise((resolve, reject) => {

    // Shared processor so both "found on page 1" and "found while
    // scanning later pages" resolve the same shape of data.
    function processBooking(booking) {
      const chassisNumber = booking.chassisNumber ||
                        booking.chassisNo ||
                        booking.vehicleDetails?.chassisNumber ||
                        booking.vehicleDetails?.chassisNo ||
                        booking.vehicle?.chassisNumber ||
                        booking.vehicle?.chassisNo ||
                        '';
      const engineNumber = booking.engineNumber || '';
      const customer = booking.customerDetails || {};
      const customerName = customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || '';
      const mobile = customer.mobile1 || '';
      const model = booking.modelDetails?.model_name || '';
      const modelId = booking.model || '';

      console.log(`✅ Booking found: ${booking.bookingNumber}`);
      console.log(`   Customer: ${customerName}`);
      console.log(`   Mobile: ${mobile}`);
      console.log(`   Model: ${model}`);
      console.log(`   Model ID: ${modelId}`);
      console.log(`   Engine Number: ${engineNumber || 'N/A'}`);
      console.log(`   Chassis Number: ${chassisNumber || 'N/A'}`);
      console.log(`   Insurance Status: ${booking.insuranceStatus || 'N/A'}`);

      resolve({
        booking,
        chassisNumber,
        engineNumber,
        customerName,
        mobile,
        model,
        modelId,
        customerDetails: customer
      });
    }

    // ---- Page 1 request (now WITH search param) ----
    const url = new URL(MIS_API_INSURANCE_COMPLETED_URL);
    url.searchParams.set('page', '1');
    url.searchParams.set('limit', '100');
    if (bookingId && bookingId.startsWith('BK')) {
      url.searchParams.set('search', bookingId);
    }

    console.log(`📡 Requesting: ${url.toString()}`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (!response.success) {
            reject(new Error('API returned error: ' + (response.message || 'Unknown error')));
            return;
          }

          let booking = null;

          if (response.data && response.data.length > 0) {
            booking = response.data.find(b => b.bookingNumber === bookingId);
            if (!booking) {
              booking = response.data.find(b => b._id === bookingId);
            }
            if (!booking) {
              booking = response.data.find(b =>
                b.bookingNumber && b.bookingNumber.toLowerCase().includes(bookingId.toLowerCase())
              );
            }
          }

          if (booking) {
            processBooking(booking);
            return;
          }

          // ---- Not on page 1 — scan remaining pages ----
          console.log(`  ⚠️ Booking "${bookingId}" not found on page 1, searching all pages...`);

          const searchAllPages = (pageNum = 1, maxPages = 20) => {
            const pageUrl = new URL(MIS_API_INSURANCE_COMPLETED_URL);
            pageUrl.searchParams.set('page', pageNum.toString());
            pageUrl.searchParams.set('limit', '100');
            if (bookingId && bookingId.startsWith('BK')) {
              pageUrl.searchParams.set('search', bookingId);
            }

            console.log(`  🔍 Searching page ${pageNum}...`);

            const pageOptions = {
              hostname: pageUrl.hostname,
              port: pageUrl.port,
              path: pageUrl.pathname + pageUrl.search,
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              timeout: 30000
            };

            const pageReq = https.request(pageOptions, (pageRes) => {
              let pageData = '';

              pageRes.on('data', (chunk) => {
                pageData += chunk;
              });

              pageRes.on('end', () => {
                try {
                  const pageResponse = JSON.parse(pageData);

                  if (!pageResponse.success || !pageResponse.data || pageResponse.data.length === 0) {
                    reject(new Error(`Booking ID "${bookingId}" not found in any page. Please check and try again.`));
                    return;
                  }

                  let foundBooking = pageResponse.data.find(b => b.bookingNumber === bookingId);
                  if (!foundBooking) {
                    foundBooking = pageResponse.data.find(b => b._id === bookingId);
                  }
                  if (!foundBooking) {
                    foundBooking = pageResponse.data.find(b =>
                      b.bookingNumber && b.bookingNumber.toLowerCase().includes(bookingId.toLowerCase())
                    );
                  }

                  if (foundBooking) {
                    processBooking(foundBooking);
                    return;
                  }

                  const totalPages = pageResponse.totalPages || pageResponse.pagination?.totalPages || 1;
                  if (pageNum < totalPages && pageNum < maxPages) {
                    searchAllPages(pageNum + 1, maxPages);
                  } else {
                    reject(new Error(`Booking ID "${bookingId}" not found. Please check and try again.`));
                  }

                } catch (error) {
                  reject(new Error('Failed to parse API response: ' + error.message));
                }
              });
            });

            pageReq.on('error', (error) => {
              reject(new Error('API request failed: ' + error.message));
            });

            pageReq.on('timeout', () => {
              pageReq.destroy();
              reject(new Error('API request timed out'));
            });

            pageReq.end();
          };

          searchAllPages(1);

        } catch (error) {
          reject(new Error('Failed to parse API response: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error('API request failed: ' + error.message));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });

    req.end();
  });
}

// ============================================================
// FETCH RSA PLANS FROM API
// ============================================================

async function fetchRSAPlans() {
  console.log('\n🔍 Fetching RSA plans...');
  console.log(`📡 API: ${RSA_PLANS_URL}`);
  
  return new Promise((resolve, reject) => {
    const url = new URL(RSA_PLANS_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (!response.success) {
            reject(new Error('RSA Plans API returned error: ' + (response.message || 'Unknown error')));
            return;
          }
          
          console.log(`  ✅ Found ${response.data.length} RSA plans`);
          resolve(response.data);
          
        } catch (error) {
          reject(new Error('Failed to parse RSA Plans API response: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error('RSA Plans API request failed: ' + error.message));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RSA Plans API request timed out'));
    });
    
    req.end();
  });
}

// ============================================================
// FIND MATCHING PLAN FOR MODEL
// ============================================================

function findMatchingPlan(rsaPlans, modelId) {
  console.log(`\n🔍 Finding RSA plan for model ID: ${modelId}`);
  
  if (!modelId) {
    console.log('  ⚠️ No model ID provided');
    return null;
  }
  
  for (const plan of rsaPlans) {
    if (plan.models && plan.models.length > 0) {
      const matchingModel = plan.models.find(m => m.id === modelId);
      if (matchingModel) {
        console.log(`  ✅ Found matching plan: "${plan.planName}"`);
        console.log(`     Model: ${matchingModel.model_name}`);
        console.log(`     Price: ₹${plan.price}`);
        console.log(`     Benefits: ${plan.benefits}`);
        return plan;
      }
    }
  }
  
  console.log('  ⚠️ No matching plan found for this model');
  return null;
}

// ============================================================
// EMAIL OTP READER
// ============================================================

async function readOTPFromEmailIMAPWithCredentials(email, password) {
  console.log(`📧 Connecting to Gmail via IMAP to read OTP from ${email}...`);

  return new Promise((resolve, reject) => {
    const appPassword = password.replace(/\s/g, '');

    const imap = new Imap({
      user: email,
      password: appPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    });

    let otp = null;
    let timeout = setTimeout(() => {
      imap.end();
      reject(new Error('IMAP connection timeout'));
    }, 30000);

    imap.once('ready', () => {
      clearTimeout(timeout);
      console.log(`  ✅ Connected to Gmail IMAP for ${email}`);

      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        console.log(`  📬 Found ${box.messages.total} messages in inbox`);

        const since = new Date(Date.now() - 10 * 60 * 1000);
        imap.search([['SINCE', since]], (err, results) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            console.log('  No recent emails found, checking last 20 messages...');
            imap.search([], (err2, allResults) => {
              if (err2 || !allResults || allResults.length === 0) {
                imap.end();
                reject(new Error('No emails found'));
                return;
              }
              const lastResults = allResults.slice(-20);
              processEmails(lastResults);
            });
          } else {
            processEmails(results);
          }
        });

        function processEmails(results) {
          const latestSeq = results[results.length - 1];
          console.log(`  📧 Fetching email #${latestSeq}`);

          const fetch = imap.fetch(latestSeq, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
            struct: true
          });

          let emailBody = '';
          let emailSubject = '';
          let emailFrom = '';

          fetch.on('message', (msg) => {
            msg.on('body', (stream, info) => {
              if (info.which === 'TEXT') {
                let buffer = '';
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
                stream.on('end', () => {
                  emailBody = buffer;
                });
              } else {
                let buffer = '';
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
                stream.on('end', () => {
                  const lines = buffer.split('\n');
                  for (const line of lines) {
                    if (line.toLowerCase().startsWith('subject:')) {
                      emailSubject = line.substring(8).trim();
                    }
                    if (line.toLowerCase().startsWith('from:')) {
                      emailFrom = line.substring(5).trim();
                    }
                  }
                });
              }
            });
          });

          fetch.once('error', (err) => {
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            imap.end();

            if (emailBody) {
              console.log(`  📨 From: ${emailFrom}`);
              console.log(`  📝 Subject: ${emailSubject}`);

              const patterns = [
                /\b\d{6}\b/,
                /OTP[:\s]*(\d{4,6})/i,
                /verification code[:\s]*(\d{4,6})/i,
                /code[:\s]*(\d{4,6})/i,
                /your OTP is[:\s]*(\d{4,6})/i
              ];

              for (const pattern of patterns) {
                const match = emailBody.match(pattern);
                if (match) {
                  otp = match[1] || match[0];
                  console.log(`  ✅ Found OTP: ${otp}`);
                  resolve(otp);
                  return;
                }
              }

              reject(new Error('No OTP found in email'));
            } else {
              reject(new Error('Email body is empty'));
            }
          });
        }
      });
    });

    imap.once('error', (err) => {
      clearTimeout(timeout);
      console.error('  IMAP Error:', err.message);
      reject(err);
    });

    imap.connect();
  });
}

// ============================================================
// CONNECT TO EXISTING BROWSER
// ============================================================

async function connectToExistingBrowser() {
  try {
    console.log(`🔗 Connecting to RSA browser on port ${REMOTE_DEBUGGING_PORT}...`);
    const browser = await chromium.connectOverCDP(`http://localhost:${REMOTE_DEBUGGING_PORT}`);
    const context = browser.contexts()[0];
    const pages = context.pages();

    let page;
    if (pages.length > 0) {
      page = pages[0];
      console.log(`  ✅ Connected to RSA browser with ${pages.length} page(s)`);
    } else {
      page = await context.newPage();
      console.log('  ✅ Created new page in RSA browser');
    }

    return { browser, context, page };
  } catch (error) {
    console.log(`  ❌ Could not connect to RSA browser: ${error.message}`);
    console.log('\n📌 Please start the RSA browser first with:');
    console.log(`   node scripts/start-browser-rsa.js`);
    console.log('   OR');
    console.log(`   start chrome --remote-debugging-port=${REMOTE_DEBUGGING_PORT} --user-data-dir="browser-profile-rsa"`);
    throw error;
  }
}

// ============================================================
// CHECK TVS SERVICE SESSION
// ============================================================

async function checkTVSServiceSession(page) {
  console.log('\n🔍 Checking TVS Service session...');
  
  try {
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/common-dashboard') || 
        currentUrl.includes('/asa/in/rsa/dealer/dashboard') ||
        currentUrl.includes('/asa/in/rsa/rider/generate-policy') ||
        currentUrl.includes('/asa/in/rsa/sales/generate-policy')) {
      console.log('  ✅ Already on a valid page! Session is valid.');
      return { hasSession: true, url: currentUrl, onValidPage: true };
    }
    
    console.log(`  🌐 Navigating to: ${TVS_SERVICE_DASHBOARD_URL}`);
    try {
      await page.goto(TVS_SERVICE_DASHBOARD_URL, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
    } catch (e) {
      console.log('  ⚠️ Navigation timeout, checking current URL...');
    }
    
    await page.waitForTimeout(3000);
    
    const newUrl = page.url();
    console.log(`  URL after navigation: ${newUrl}`);
    
    if (newUrl.includes('/common-dashboard')) {
      console.log('  ✅ Session is valid! Already logged in to TVS Service.');
      return { hasSession: true, url: newUrl };
    }
    
    if (newUrl === TVS_SERVICE_URL || newUrl.includes('/login') || newUrl === `${TVS_SERVICE_URL}/`) {
      console.log('  ❌ No active session. Need to login.');
      return { hasSession: false, url: newUrl };
    }
    
    const hasLoginForm = await page.evaluate(() => {
      return document.querySelector('input#username') !== null || 
             document.querySelector('input[type="password"]') !== null;
    });
    
    if (hasLoginForm) {
      console.log('  ❌ Login form detected. Need to login.');
      return { hasSession: false, url: newUrl };
    }
    
    const hasDashboardElements = await page.evaluate(() => {
      return document.querySelector('div:has-text("Road Side Assistance")') !== null ||
             document.querySelector('div:has-text("Extended Warranty")') !== null;
    });
    
    if (hasDashboardElements) {
      console.log('  ✅ Dashboard elements detected. Session is valid.');
      return { hasSession: true, url: newUrl };
    }
    
    console.log('  ⚠️ Could not determine session status. Assuming no session.');
    return { hasSession: false, url: newUrl };
    
  } catch (error) {
    console.log(`  ⚠️ Session check error: ${error.message}`);
    try {
      const currentUrl = page.url();
      if (currentUrl.includes('/common-dashboard') || 
          currentUrl.includes('/asa/in/rsa/dealer/dashboard') ||
          currentUrl.includes('/asa/in/rsa/rider/generate-policy') ||
          currentUrl.includes('/asa/in/rsa/sales/generate-policy')) {
        console.log('  ✅ On valid page despite error. Session is valid.');
        return { hasSession: true, url: currentUrl, onValidPage: true };
      }
    } catch (e) {}
    return { hasSession: false, url: page.url(), error: error.message };
  }
}

// ============================================================
// TVS SERVICE (RSA) LOGIN FUNCTION
// ============================================================

async function loginToTVSService(page) {
  console.log('\n🌐 Logging into TVS Service (RSA)...');
  console.log(`   URL: ${TVS_SERVICE_URL}`);

  try {
    await page.goto(TVS_SERVICE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`  ✅ Navigated to: ${page.url()}`);

    console.log('  Filling username...');
    const usernameSelector = 'input#username';
    await page.fill(usernameSelector, TVS_SERVICE_USERNAME);
    console.log(`  ✅ Username filled: ${TVS_SERVICE_USERNAME}`);
    await page.waitForTimeout(500);

    console.log('  Filling password...');
    const passwordSelector = 'input#password';
    await page.fill(passwordSelector, TVS_SERVICE_PASSWORD);
    console.log('  ✅ Password filled');
    await page.waitForTimeout(500);

    console.log('  Clicking Login button...');
    const loginButtonSelector = 'button.ant-btn-primary:has-text("Login")';
    const loginButton = await page.$(loginButtonSelector);
    if (loginButton && await loginButton.isVisible()) {
      await loginButton.click();
      console.log('  ✅ Clicked Login button');
    } else {
      await page.click('button[type="button"].ant-btn-primary');
      console.log('  ✅ Clicked Login button via alternative selector');
    }

    console.log('  ⏳ Waiting for OTP page...');
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    if (currentUrl === TVS_SERVICE_URL || currentUrl === `${TVS_SERVICE_URL}/`) {
      console.log('  ⚠️ Still on login page. May already be logged in.');
      await page.goto(TVS_SERVICE_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(3000);
      if (page.url().includes('/common-dashboard')) {
        console.log('  ✅ Already logged in! Navigated to dashboard.');
        return true;
      }
      return false;
    }

    console.log('  Getting 6-digit OTP from email...');
    let otp = null;

    try {
      otp = await readOTPFromEmailIMAPWithCredentials(TVS_SERVICE_EMAIL, TVS_SERVICE_APP_PASSWORD);
      console.log(`  ✅ OTP read: ${otp}`);

      if (otp && otp.length !== 6) {
        console.log(`  ⚠️ OTP is ${otp.length} digits, expected 6 digits`);
      }
    } catch (error) {
      console.log('  ⚠️ Automatic OTP reading failed:', error.message);
      otp = await getOTPManually();
    }

    if (!otp) {
      console.log('  ⚠️ No OTP entered. Proceeding...');
    } else {
      console.log('  Looking for OTP input fields (6 boxes)...');

      const otpInputs = await page.$$('input[type="text"][maxlength="1"], input[type="tel"][maxlength="1"]');

      if (otpInputs.length >= 6) {
        console.log(`  ✅ Found ${otpInputs.length} OTP input fields`);

        const otpDigits = otp.split('');

        for (let i = 0; i < Math.min(6, otpInputs.length); i++) {
          const input = otpInputs[i];
          if (await input.isVisible()) {
            await input.fill('');
            await page.waitForTimeout(100);
            await input.type(otpDigits[i] || '0');
            console.log(`    ✅ Filled position ${i+1}: ${otpDigits[i] || '0'}`);
            await page.waitForTimeout(200);
          }
        }
      } else {
        console.log(`  ⚠️ Found ${otpInputs.length} inputs, looking for 6-digit OTP input...`);

        const singleOtpInput = await page.$('input[type="text"][placeholder*="OTP"], input[type="text"][placeholder*="otp"], input[type="text"][maxlength="6"]');
        if (singleOtpInput && await singleOtpInput.isVisible()) {
          await singleOtpInput.fill(otp);
          console.log(`  ✅ Filled 6-digit OTP: ${otp}`);
        } else {
          const textInputs = await page.$$('input[type="text"]:visible');
          let filled = false;

          for (const input of textInputs) {
            const placeholder = await input.getAttribute('placeholder') || '';
            const maxLength = await input.getAttribute('maxlength') || '';

            if (placeholder.toLowerCase().includes('otp') ||
                placeholder.toLowerCase().includes('code') ||
                maxLength === '6') {
              await input.fill(otp);
              console.log(`  ✅ Filled 6-digit OTP in input with placeholder: "${placeholder}"`);
              filled = true;
              break;
            }
          }

          if (!filled) {
            const maxLengthInputs = await page.$$('input[maxlength="6"]');
            for (const input of maxLengthInputs) {
              if (await input.isVisible()) {
                await input.fill(otp);
                console.log(`  ✅ Filled 6-digit OTP in input with maxlength="6"`);
                filled = true;
                break;
              }
            }
          }

          if (!filled) {
            console.log('  ⚠️ Could not find OTP input field, trying to fill all text inputs...');
            const allTextInputs = await page.$$('input[type="text"]:visible, input[type="tel"]:visible');
            for (const input of allTextInputs) {
              if (await input.isVisible()) {
                const value = await input.inputValue();
                if (value === '' || value.length < 6) {
                  await input.fill(otp);
                  console.log(`  ✅ Filled OTP in input`);
                  break;
                }
              }
            }
          }
        }
      }

      console.log('  Looking for Verify OTP button...');
      const verifySelectors = [
        'button:has-text("Verify OTP")',
        'button:has-text("Verify")',
        'button:has-text("Submit")',
        'button:has-text("Confirm")',
        'button:has-text("OTP")',
        'button[type="submit"]'
      ];

      let verifyClicked = false;
      for (const selector of verifySelectors) {
        try {
          const btn = await page.$(selector);
          if (btn && await btn.isVisible()) {
            await btn.click();
            verifyClicked = true;
            console.log(`  ✅ Clicked Verify button using: ${selector}`);
            break;
          }
        } catch (e) {}
      }

      if (!verifyClicked) {
        console.log('  ⚠️ Could not find Verify button');
        const modalButtons = await page.$$('.modal button, .ant-modal button, button');
        for (const btn of modalButtons) {
          if (await btn.isVisible()) {
            const text = await btn.textContent() || '';
            if (text.includes('Verify') || text.includes('Submit') || text.includes('Confirm')) {
              await btn.click();
              console.log(`  ✅ Clicked button: "${text.trim()}"`);
              verifyClicked = true;
              break;
            }
          }
        }
      }

      console.log('  ⏳ Waiting for verification to complete...');
      await page.waitForTimeout(5000);
    }

    try {
      await page.screenshot({ path: 'tvs-service-login-complete.png' });
      console.log('📸 Screenshot saved: tvs-service-login-complete.png');
    } catch (e) {}

    console.log('  ✅ TVS Service (RSA) login completed!');
    return true;

  } catch (error) {
    console.log(`  ❌ TVS Service login error: ${error.message}`);
    return false;
  }
}

// ============================================================
// GET POLICY GENERATION URL AND PLAN NAME BASED ON MODEL
// ============================================================

function getPolicyConfigForModel(modelName) {
  if (!modelName) {
    return {
      policyUrl: RSA_RIDER_POLICY_URL,
      planName: DEFAULT_RIDER_PLAN
    };
  }
  
  const modelNameLower = modelName.toLowerCase().trim();
  
  // Check if model matches any of the SALES policy models
  for (const [salesModel, config] of Object.entries(SALES_POLICY_MODELS)) {
    if (modelNameLower.includes(salesModel.toLowerCase()) || 
        salesModel.toLowerCase().includes(modelNameLower)) {
      console.log(`  ✅ Model "${modelName}" matches SALES model "${salesModel}"`);
      return {
        policyUrl: RSA_SALES_POLICY_URL,
        planName: config.planName
      };
    }
  }
  
  // Default to RIDER policy
  console.log(`  ℹ️ Model "${modelName}" uses RIDER policy URL with default plan`);
  return {
    policyUrl: RSA_RIDER_POLICY_URL,
    planName: DEFAULT_RIDER_PLAN
  };
}

// ============================================================
// CLICK ROAD SIDE ASSISTANCE AND GET NEW TAB (UPDATED)
// ============================================================

async function clickRoadSideAssistanceAndGetNewTab(context, page, policyUrl) {
  console.log('\n📌 STEP: Clicking "Road Side Assistance" Click here button...');
  
  try {
    await page.screenshot({ path: 'rsa-common-dashboard-before-click.png' });
    console.log('  📸 Screenshot saved: rsa-common-dashboard-before-click.png');
    
    const newTabPromise = context.waitForEvent('page', { timeout: 10000 });
    
    console.log('  🔍 Looking for "Road Side Assistance" Click here button...');
    
    const clickHereSelectors = [
      'div:has-text("Road Side Assistance") + div button:has-text("Click here")',
      'div:has-text("Road Side Assistance") ~ div button:has-text("Click here")',
      'div:has-text("Road Side Assistance") button:has-text("Click here")',
      '//div[contains(text(), "Road Side Assistance")]/following-sibling::div//button[contains(text(), "Click here")]',
      '//div[contains(text(), "Road Side Assistance")]/following::button[contains(text(), "Click here")]',
      'div.text-lg.font-semibold.text-neutral-600:has-text("Road Side Assistance") + div button',
      'div.mt-4.text-lg.font-semibold.text-neutral-600:has-text("Road Side Assistance") + div button'
    ];
    
    let clickHereClicked = false;
    
    for (const selector of clickHereSelectors) {
      try {
        if (selector.startsWith('//')) {
          const element = await page.$(`xpath=${selector}`);
          if (element && await element.isVisible()) {
            await element.click();
            clickHereClicked = true;
            console.log(`  ✅ Clicked "Road Side Assistance" using XPath`);
            break;
          }
        } else {
          const elements = await page.$$(selector);
          for (const el of elements) {
            if (await el.isVisible()) {
              await el.click();
              clickHereClicked = true;
              console.log(`  ✅ Clicked "Road Side Assistance" using CSS selector`);
              break;
            }
          }
          if (clickHereClicked) break;
        }
      } catch (e) {}
    }
    
    if (!clickHereClicked) {
      console.log('  🔧 Trying JavaScript approach for Road Side Assistance...');
      const result = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent && el.textContent.includes('Road Side Assistance')) {
            const parentText = el.closest('div')?.textContent || '';
            if (!parentText.includes('Extended Warranty')) {
              let container = el;
              for (let i = 0; i < 5; i++) {
                const parent = container.parentElement;
                if (!parent) break;
                container = parent;
                const button = container.querySelector('button');
                if (button && button.textContent && button.textContent.toLowerCase().includes('click here')) {
                  button.click();
                  return true;
                }
              }
            }
          }
        }
        return false;
      });
      
      if (result) {
        clickHereClicked = true;
        console.log('  ✅ Clicked "Road Side Assistance" via JavaScript');
      }
    }
    
    if (!clickHereClicked) {
      console.log('  ❌ Could not find "Road Side Assistance" Click here button');
      return { success: false, error: 'Button not found', page: page };
    }
    
    console.log('  ⏳ Waiting for new tab to open...');
    let newPage;
    try {
      newPage = await newTabPromise;
      console.log('  ✅ New tab opened!');
    } catch (error) {
      console.log('  ⚠️ No new tab detected, checking if page navigated...');
      await page.waitForTimeout(3000);
      const newUrl = page.url();
      if (newUrl.includes('/asa/in/rsa/dealer/dashboard')) {
        console.log('  ✅ Page navigated to dealer dashboard');
        newPage = page;
      } else {
        console.log('  ❌ No new tab or navigation detected');
        return { success: false, error: 'No new tab opened', page: page };
      }
    }
    
    await newPage.waitForTimeout(3000);
    console.log(`  New tab URL: ${newPage.url()}`);
    
    if (newPage.url().includes('/asa/in/rsa/dealer/dashboard')) {
      console.log('  ✅ Successfully opened RSA Dealer Dashboard in new tab');
      
      await newPage.screenshot({ path: 'rsa-dealer-dashboard-new-tab.png' });
      console.log('  📸 Screenshot saved: rsa-dealer-dashboard-new-tab.png');
      
      console.log(`  🌐 Navigating to policy generation page: ${policyUrl}`);
      await newPage.goto(policyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await newPage.waitForTimeout(3000);
      console.log(`  Policy generation URL: ${newPage.url()}`);
      
      if (newPage.url().includes('/asa/in/rsa/rider/generate-policy') || 
          newPage.url().includes('/asa/in/rsa/sales/generate-policy')) {
        console.log('  ✅ Successfully navigated to Policy Generation page');
        return { success: true, newPage: newPage, isNewTab: true };
      } else {
        console.log(`  ❌ Not on policy generation page. URL: ${newPage.url()}`);
        return { success: false, error: 'Could not navigate to policy page', page: newPage };
      }
    } else if (newPage.url().includes('/asa/in/rsa/rider/generate-policy') || 
               newPage.url().includes('/asa/in/rsa/sales/generate-policy')) {
      console.log('  ✅ Directly opened Policy Generation page');
      return { success: true, newPage: newPage, isNewTab: true };
    } else {
      console.log(`  ❌ Unexpected URL in new tab: ${newPage.url()}`);
      return { success: false, error: 'Unexpected URL', page: newPage };
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false, error: error.message, page: page };
  }
}

// ============================================================
// FILL CHASSIS AND SEARCH
// ============================================================

async function fillChassisAndSearch(page, chassisNumber) {
  try {
    await page.waitForTimeout(2000);
    
    console.log(`\n🔍 Searching for Chassis Number input field...`);
    
    const inputSelectors = [
      '#searchValue',
      'input#searchValue',
      'input[name="searchValue"]',
      'input[placeholder="Enter Chassis Number"]',
      'input[placeholder*="Chassis"]',
      'input[type="text"][maxlength="17"]',
      'input[placeholder*="Chassis Number"]'
    ];

    let chassisInput = null;
    for (const selector of inputSelectors) {
      try {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
          chassisInput = element;
          console.log(`  ✅ Found input using selector: ${selector}`);
          break;
        }
      } catch (e) {}
    }

    if (!chassisInput) {
      console.log('  ❌ Could not find Chassis Number input field');
      
      const chassisLabel = await page.$('label:has-text("Chassis"), label:has-text("Chassis Number")');
      if (chassisLabel) {
        console.log('  🔍 Found label, looking for associated input...');
        const container = await chassisLabel.evaluateHandle(el => el.closest('div, form'));
        if (container) {
          chassisInput = await container.$('input[type="text"]');
          if (chassisInput && await chassisInput.isVisible()) {
            console.log('  ✅ Found input via label association');
          }
        }
      }
    }

    if (!chassisInput) {
      console.log('  ❌ Could not find Chassis Number input field');
      return false;
    }

    console.log(`  📝 Entering Chassis Number: ${chassisNumber}`);
    await chassisInput.fill('');
    await page.waitForTimeout(300);
    await chassisInput.fill(chassisNumber);
    console.log(`  ✅ Entered Chassis Number: ${chassisNumber}`);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'rsa-chassis-filled.png' });
    console.log('  📸 Screenshot saved: rsa-chassis-filled.png');

    console.log(`\n🔍 Looking for Search button...`);
    
    const searchButtonSelectors = [
      'button.ant-btn-primary:has-text("Search")',
      'button:has-text("Search")',
      'button[type="button"] .ant-btn-primary',
      'button:has-text("SEARCH")',
      '.ant-btn-primary span:has-text("Search")',
      'button[type="submit"]:has-text("Search")'
    ];

    let searchClicked = false;
    for (const selector of searchButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          searchClicked = true;
          console.log(`  ✅ Clicked Search button using: ${selector}`);
          break;
        }
      } catch (e) {}
    }

    if (!searchClicked) {
      console.log('  🔧 Trying alternative approach to find Search button...');
      
      const searchClickedJS = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent && btn.textContent.trim().toUpperCase() === 'SEARCH') {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (searchClickedJS) {
        searchClicked = true;
        console.log('  ✅ Clicked Search button via JavaScript');
      } else {
        try {
          const xpathButton = await page.$('xpath=//button[contains(text(), "Search")]');
          if (xpathButton && await xpathButton.isVisible()) {
            await xpathButton.click();
            searchClicked = true;
            console.log('  ✅ Clicked Search button using XPath');
          }
        } catch (e) {}
      }
    }

    if (!searchClicked) {
      console.log('  ❌ Could not find Search button');
      return false;
    }

    console.log('  ⏳ Waiting for search results and RSA form to load...');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'rsa-search-results.png' });
    console.log('  📸 Screenshot saved: rsa-search-results.png');

    console.log('  ✅ Search completed successfully! RSA form should be visible.');
    return true;

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// ============================================================
// SELECT NOMINEE RELATIONSHIP (UPDATED WITH GENDER DETECTION)
// ============================================================

async function selectNomineeRelationship(page, nomineeRelation, nomineeSalutation) {
  console.log(`\n  📌 Selecting Nominee Relationship: ${nomineeRelation}...`);
  console.log(`     Nominee Salutation: ${nomineeSalutation || 'Not provided'}`);
  
  try {
    let finalRelation = nomineeRelation;
    
    const ambiguousRelations = ['Sibling', 'Brother/Sister', 'Siblings', '', 'N/A', 'Not Specified', 'null', 'undefined'];
    const isAmbiguous = ambiguousRelations.some(r => 
      nomineeRelation && nomineeRelation.toUpperCase().trim() === r.toUpperCase()
    ) || !nomineeRelation || nomineeRelation.trim() === '';
    
    if (isAmbiguous && nomineeSalutation) {
      const salutationLower = nomineeSalutation.toLowerCase().trim();
      if (salutationLower === 'ms.' || 
          salutationLower === 'mrs.' || 
          salutationLower === 'miss' || 
          salutationLower === 'miss.' ||
          salutationLower === 'smt' ||
          salutationLower === 'smt.' ||
          salutationLower === 'kum' ||
          salutationLower === 'kum.' ||
          salutationLower === 'female') {
        finalRelation = 'Sister';
        console.log(`  👩 Detected female nominee, using "Sister" instead of "${nomineeRelation}"`);
      } else if (salutationLower === 'mr.' || 
                 salutationLower === 'mr' || 
                 salutationLower === 'shri' ||
                 salutationLower === 'shri.' ||
                 salutationLower === 'male') {
        finalRelation = 'Brother';
        console.log(`  👨 Detected male nominee, using "Brother" instead of "${nomineeRelation}"`);
      } else {
        finalRelation = 'Brother';
        console.log(`  ⚠️ Unknown salutation "${nomineeSalutation}", defaulting to "Brother"`);
      }
    } else if (nomineeRelation && nomineeRelation.toUpperCase().includes('SIBLING')) {
      if (nomineeSalutation) {
        const salutationLower = nomineeSalutation.toLowerCase().trim();
        if (salutationLower === 'ms.' || 
            salutationLower === 'mrs.' || 
            salutationLower === 'miss' || 
            salutationLower === 'miss.' ||
            salutationLower === 'smt' ||
            salutationLower === 'smt.' ||
            salutationLower === 'kum' ||
            salutationLower === 'kum.' ||
            salutationLower === 'female') {
          finalRelation = 'Sister';
          console.log(`  👩 Detected female nominee, using "Sister" instead of "${nomineeRelation}"`);
        } else {
          finalRelation = 'Brother';
          console.log(`  👨 Detected male nominee, using "Brother" instead of "${nomineeRelation}"`);
        }
      } else {
        finalRelation = 'Brother';
        console.log(`  ⚠️ No salutation provided for sibling, defaulting to "Brother"`);
      }
    }
    
    const relationMap = {
      'Spouse': ['WIFE', 'HUSBAND', 'SPOUSE'],
      'Son': ['SON'],
      'Daughter': ['DAUGHTER'],
      'Father': ['FATHER'],
      'Mother': ['MOTHER'],
      'Brother': ['BROTHER'],
      'Sister': ['SISTER'],
      'Father In Law': ['FATHER IN LAW'],
      'Mother In Law': ['MOTHER IN LAW'],
      'Brother In Law': ['BROTHER IN LAW'],
      'Sister In Law': ['SISTER IN LAW'],
      'Daughter In Law': ['DAUGHTER IN LAW'],
      'Grandfather': ['GRANDFATHER'],
      'Grandmother': ['GRANDMOTHER'],
      'Grand Son': ['GRAND SON'],
      'Grand Daughter': ['GRAND DAUGHTER'],
      'Maternal Uncle': ['MATERNAL UNCLE'],
      'Maternal Aunt': ['MATERNAL AUNT'],
      'Paternal Uncle': ['PATERNAL UNCLE'],
      'Paternal Aunt': ['PATERNAL AUNT'],
      'Nephew': ['NEPHEW'],
      'Niece': ['NIECE'],
      'Cousin': ['COUSIN'],
      'Daughter (unmarried)': ['DAUGHTER UNMARRIED'],
      'Other': ['OTHER']
    };
    
    let targetDisplayText = null;
    const relationUpper = finalRelation.toUpperCase().trim();
    
    for (const [displayText, aliases] of Object.entries(relationMap)) {
      if (aliases.some(a => a.toUpperCase() === relationUpper)) {
        targetDisplayText = displayText;
        break;
      }
    }
    
    if (!targetDisplayText) {
      for (const [displayText, aliases] of Object.entries(relationMap)) {
        if (aliases.some(a => relationUpper.includes(a) || a.includes(relationUpper))) {
          targetDisplayText = displayText;
          break;
        }
      }
    }
    
    if (!targetDisplayText) {
      console.log(`  ⚠️ "${finalRelation}" not found in mapping. Using "Other"`);
      targetDisplayText = 'Other';
    }
    
    console.log(`     Mapping "${finalRelation}" to "${targetDisplayText}"`);
    
    const relationSelectors = [
      '#nomineeRelationship',
      'input[id="nomineeRelationship"]',
      'input[role="combobox"][aria-owns*="nomineeRelationship"]'
    ];
    
    let relationInput = null;
    for (const selector of relationSelectors) {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        relationInput = element;
        break;
      }
    }
    
    if (!relationInput) {
      console.log('  ⚠️ Could not find Nominee Relationship field');
      return false;
    }
    
    await relationInput.click();
    await page.waitForTimeout(300);
    
    console.log(`  🔍 Searching for "${targetDisplayText}" in dropdown...`);
    const selectedDirectly = await page.evaluate((text) => {
      const options = document.querySelectorAll('div[role="option"]');
      console.log(`Found ${options.length} options in dropdown`);
      
      for (const opt of options) {
        const optText = opt.textContent ? opt.textContent.trim() : '';
        console.log(`Checking option: "${optText}"`);
        
        if (optText === text || optText.toLowerCase().includes(text.toLowerCase())) {
          console.log(`✅ Found matching option: "${optText}"`);
          opt.click();
          opt.dispatchEvent(new Event('click', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, targetDisplayText);
    
    if (selectedDirectly) {
      console.log(`  ✅ Selected "${targetDisplayText}" from dropdown`);
      await page.waitForTimeout(500);
      return true;
    }
    
    console.log(`  ⌨️ Typing "${targetDisplayText}" and selecting with Enter...`);
    await relationInput.fill('');
    await page.waitForTimeout(300);
    await relationInput.fill(targetDisplayText);
    await page.waitForTimeout(800);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    const selectedValue = await relationInput.inputValue();
    if (selectedValue && selectedValue.toLowerCase().includes(targetDisplayText.toLowerCase())) {
      console.log(`  ✅ Selected "${targetDisplayText}" by typing and pressing Enter`);
      return true;
    }
    
    console.log(`  🔍 Searching for partial match of "${targetDisplayText}"...`);
    const selectedPartial = await page.evaluate((text) => {
      const options = document.querySelectorAll('div[role="option"]');
      const searchText = text.toLowerCase();
      
      for (const opt of options) {
        const optText = opt.textContent ? opt.textContent.toLowerCase() : '';
        if (optText.includes(searchText) || searchText.includes(optText)) {
          console.log(`✅ Found partial match: "${optText}"`);
          opt.click();
          opt.dispatchEvent(new Event('click', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, targetDisplayText);
    
    if (selectedPartial) {
      console.log(`  ✅ Selected "${targetDisplayText}" by partial match`);
      await page.waitForTimeout(500);
      return true;
    }
    
    console.log('  ⚠️ Could not select relationship. Falling back to "Other"...');
    
    const otherSelected = await page.evaluate(() => {
      const options = document.querySelectorAll('div[role="option"]');
      for (const opt of options) {
        const optText = opt.textContent ? opt.textContent.trim() : '';
        if (optText === 'Other') {
          console.log(`✅ Found "Other" option`);
          opt.click();
          opt.dispatchEvent(new Event('click', { bubbles: true }));
          return true;
        }
      }
      return false;
    });
    
    if (otherSelected) {
      console.log('  ✅ Selected "Other" as fallback');
      await page.waitForTimeout(500);
      return true;
    }
    
    console.log('  ❌ Could not select Nominee Relationship');
    return false;
    
  } catch (error) {
    console.log(`  ⚠️ Error selecting Nominee Relationship: ${error.message}`);
    return false;
  }
}

// ============================================================
// SELECT PLAN BASED ON MODEL AND PLAN NAME (UPDATED)
// ============================================================

async function selectPlan(page, planName, modelName) {
  console.log(`\n  📌 Selecting Plan: "${planName}" for model: "${modelName}"...`);
  
  try {
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'rsa-plans-grid.png' });
    console.log('  📸 Screenshot saved: rsa-plans-grid.png');
    
    // First try to find the plan by exact name match on the h4 element
    const planSelected = await page.evaluate((targetPlanName) => {
      const planButtons = document.querySelectorAll('button.group.relative');
      console.log(`Found ${planButtons.length} plan cards`);
      
      for (const btn of planButtons) {
        const titleElement = btn.querySelector('h4');
        if (titleElement) {
          const titleText = titleElement.textContent ? titleElement.textContent.trim() : '';
          console.log(`Checking plan: "${titleText}"`);
          
          if (titleText === targetPlanName || 
              titleText.toLowerCase().includes(targetPlanName.toLowerCase()) ||
              targetPlanName.toLowerCase().includes(titleText.toLowerCase())) {
            
            console.log(`✅ Found matching plan card: "${titleText}"`);
            btn.click();
            btn.dispatchEvent(new Event('click', { bubbles: true }));
            
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            btn.dispatchEvent(clickEvent);
            
            return true;
          }
        }
      }
      return false;
    }, planName);
    
    if (planSelected) {
      console.log(`  ✅ Selected "${planName}" plan card`);
      await page.waitForTimeout(1000);
      return true;
    }
    
    // If exact match fails, try to find by price from the config
    console.log(`  🔍 Trying to find plan by price for "${planName}"...`);
    
    // Get price from config if available
    let targetPrice = null;
    for (const [model, config] of Object.entries(SALES_POLICY_MODELS)) {
      if (config.planName === planName) {
        targetPrice = config.price;
        break;
      }
    }
    
    if (targetPrice) {
      console.log(`  🔍 Looking for plan with price: ₹${targetPrice}`);
      const priceSelected = await page.evaluate((price) => {
        const planButtons = document.querySelectorAll('button.group.relative');
        
        for (const btn of planButtons) {
          const priceElement = btn.querySelector('span.text-lg.font-bold');
          if (priceElement) {
            const priceText = priceElement.textContent ? priceElement.textContent.trim() : '';
            const priceMatch = priceText.match(/[\d,]+/);
            if (priceMatch) {
              const extractedPrice = parseInt(priceMatch[0].replace(/,/g, ''));
              if (extractedPrice === price) {
                console.log(`✅ Found plan with price: ₹${extractedPrice}`);
                btn.click();
                btn.dispatchEvent(new Event('click', { bubbles: true }));
                return true;
              }
            }
          }
        }
        return false;
      }, targetPrice);
      
      if (priceSelected) {
        console.log(`  ✅ Selected plan with price: ₹${targetPrice}`);
        await page.waitForTimeout(1000);
        return true;
      }
    }
    
    // Try partial match as fallback
    console.log(`  🔍 Trying partial match for "${planName}"...`);
    const partialSelected = await page.evaluate((targetPlanName) => {
      const planButtons = document.querySelectorAll('button.group.relative');
      const searchTerm = targetPlanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const btn of planButtons) {
        const titleElement = btn.querySelector('h4');
        if (titleElement) {
          const titleText = titleElement.textContent ? titleElement.textContent.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
          
          if (titleText.includes(searchTerm) || searchTerm.includes(titleText)) {
            console.log(`✅ Found partial match: "${titleElement.textContent.trim()}"`);
            btn.click();
            btn.dispatchEvent(new Event('click', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, planName);
    
    if (partialSelected) {
      console.log(`  ✅ Selected "${planName}" via partial match`);
      await page.waitForTimeout(1000);
      return true;
    }
    
    console.log('  ⚠️ Could not find specific plan, selecting first available plan...');
    const firstPlanSelected = await page.evaluate(() => {
      const planButtons = document.querySelectorAll('button.group.relative');
      if (planButtons.length > 0) {
        console.log(`✅ Selecting first plan: "${planButtons[0].querySelector('h4')?.textContent?.trim() || 'Unknown'}"`);
        planButtons[0].click();
        planButtons[0].dispatchEvent(new Event('click', { bubbles: true }));
        return true;
      }
      return false;
    });
    
    if (firstPlanSelected) {
      console.log('  ✅ Selected first available plan as fallback');
      await page.waitForTimeout(1000);
      return true;
    }
    
    console.log('  ❌ Could not select any plan');
    return false;
    
  } catch (error) {
    console.log(`  ⚠️ Error selecting plan: ${error.message}`);
    return false;
  }
}

// ============================================================
// CLICK GENERATE POLICY BUTTON (UPDATED WITH NEW TAB HANDLING)
// ============================================================

async function clickGeneratePolicy(page, context) {
  console.log('\n  📌 Clicking Generate Policy button...');
  
  try {
    // Check for existing purchase status page before clicking
    const existingPages = context.pages();
    for (const p of existingPages) {
      const url = p.url();
      if (url.includes('/asa/in/rsa/rider/purchase-status') || 
          url.includes('/asa/in/rsa/sales/purchase-status')) {
        console.log(`  ✅ Found existing purchase status page: ${url}`);
        return { success: true, page: p, isNewTab: true };
      }
    }
    
    await page.waitForTimeout(1000);
    
    const generateSelectors = [
      'button:has-text("Generate Policy")',
      'button:has-text("GENERATE POLICY")',
      'button.ant-btn-primary:has-text("Generate Policy")',
      'button[type="button"].ant-btn-primary:has-text("Generate Policy")',
      'button:has-text("Generate")',
      '.ant-btn-primary:has-text("Generate Policy")',
      'button.ant-btn-primary:has-text("GENERATE")'
    ];
    
    let generateClicked = false;
    for (const selector of generateSelectors) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          generateClicked = true;
          console.log(`  ✅ Clicked Generate Policy button using: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!generateClicked) {
      console.log('  🔧 Trying JavaScript approach to find Generate Policy button...');
      const generateClickedJS = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent ? btn.textContent.trim() : '';
          if (text === 'Generate Policy' || text === 'GENERATE POLICY' || text.includes('Generate')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (generateClickedJS) {
        generateClicked = true;
        console.log('  ✅ Clicked Generate Policy button via JavaScript');
      }
    }
    
    if (!generateClicked) {
      console.log('  ⚠️ Could not find Generate Policy button');
      return { success: false, page: page };
    }
    
    console.log('  ⏳ Waiting for confirmation popup to appear...');
    await page.waitForTimeout(2000);
    
    console.log('  🔍 Looking for confirmation popup...');
    
    const newTabPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
    
    await page.screenshot({ path: 'rsa-confirmation-popup.png' });
    console.log('  📸 Screenshot saved: rsa-confirmation-popup.png');
    
    const confirmSelectors = [
      'button:has-text("Confirm & generate policy")',
      'button:has-text("Confirm & generate")',
      'button:has-text("Confirm")',
      'button:has-text("Confirm & Generate")',
      'button:has-text("CONFIRM & GENERATE POLICY")',
      'button.inline-flex.min-w-\\[12rem\\]:has-text("Confirm")',
      'button.rounded-xl.bg-indigo-600:has-text("Confirm")',
      'button:has-text("Proceed")',
      'button.ant-btn-primary:has-text("Confirm")'
    ];
    
    let confirmClicked = false;
    
    for (const selector of confirmSelectors) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          console.log(`  ✅ Found confirmation button using: ${selector}`);
          await button.click();
          confirmClicked = true;
          console.log('  ✅ Clicked "Confirm & generate policy" button');
          break;
        }
      } catch (e) {}
    }
    
    if (!confirmClicked) {
      console.log('  🔧 Trying JavaScript approach to find confirmation button...');
      
      const confirmClickedJS = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent ? btn.textContent.trim() : '';
          if (text.includes('Confirm & generate policy') || 
              text.includes('Confirm & Generate') ||
              text === 'Confirm' || 
              text === 'CONFIRM' ||
              (text.includes('Confirm') && text.includes('Generate'))) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (confirmClickedJS) {
        confirmClicked = true;
        console.log('  ✅ Clicked confirmation button via JavaScript');
      }
    }
    
    console.log('  ⏳ Waiting for purchase status page to open in new tab...');
    let newPage = await newTabPromise;
    
    if (newPage) {
      console.log(`  ✅ New tab opened! URL: ${newPage.url()}`);
      await newPage.waitForTimeout(3000);
      
      try {
        await newPage.waitForLoadState('networkidle', { timeout: 10000 });
        console.log('  ✅ New tab fully loaded');
      } catch (e) {
        console.log('  ⚠️ New tab load state timeout, continuing...');
      }
      
      await newPage.screenshot({ path: 'rsa-purchase-status-page.png' });
      console.log('  📸 Screenshot saved: rsa-purchase-status-page.png');
      
      return { success: true, page: newPage, isNewTab: true };
    }
    
    console.log('  ⚠️ No new tab detected, checking current page...');
    await page.waitForTimeout(3000);
    console.log(`  Current URL: ${page.url()}`);
    
    const allPages = context.pages();
    for (const p of allPages) {
      const url = p.url();
      if (url.includes('/asa/in/rsa/rider/purchase-status') || 
          url.includes('/asa/in/rsa/sales/purchase-status')) {
        console.log(`  ✅ Found purchase status page in existing pages: ${url}`);
        return { success: true, page: p, isNewTab: true };
      }
    }
    
    return { success: true, page: page, isNewTab: false };
    
  } catch (error) {
    console.log(`  ⚠️ Error clicking Generate Policy button: ${error.message}`);
    return { success: false, page: page };
  }
}

// ============================================================
// HANDLE DIFFERENT PAGE STATES (UPDATED)
// ============================================================

async function navigateToPolicyPageAndSearch(context, page, chassisNumber, bookingDetails) {
  console.log('\n📌 STEP: Checking current page state and navigating...');
  
  try {
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    
    // Get the appropriate policy URL based on model
    const config = getPolicyConfigForModel(bookingDetails.model);
    const policyUrl = config.policyUrl;
    console.log(`  📌 Using policy URL: ${policyUrl}`);
    
    if (currentUrl.includes('/asa/in/rsa/rider/generate-policy') || 
        currentUrl.includes('/asa/in/rsa/sales/generate-policy')) {
      console.log('  ✅ Already on Policy Generation page!');
      console.log('  ▶️ Filling chassis and searching...');
      const searchResult = await fillChassisAndSearch(page, chassisNumber);
      if (searchResult) {
        console.log('  ✅ Chassis filled and searched! Now filling RSA form...');
        return await fillRSAForm(page, bookingDetails, context);
      }
      return false;
    }
    
    if (currentUrl.includes('/common-dashboard')) {
      console.log('  ✅ On Common Dashboard!');
      console.log('  ▶️ Clicking "Road Side Assistance" to open in new tab...');
      
      const result = await clickRoadSideAssistanceAndGetNewTab(context, page, policyUrl);
      
      if (!result.success) {
        console.log(`  ❌ Failed to open Road Side Assistance: ${result.error}`);
        return false;
      }
      
      const newPage = result.newPage;
      console.log('  ✅ Working in new tab');
      console.log(`  New tab URL: ${newPage.url()}`);
      
      const searchResult = await fillChassisAndSearch(newPage, chassisNumber);
      if (searchResult) {
        console.log('  ✅ Chassis filled and searched! Now filling RSA form...');
        const formResult = await fillRSAForm(newPage, bookingDetails, context);
        return formResult;
      }
      return false;
    }
    
    if (currentUrl.includes('/asa/in/rsa/dealer/dashboard')) {
      console.log('  ✅ On Dealer Dashboard!');
      console.log(`  ▶️ Navigating to Policy Generation page: ${policyUrl}`);
      
      await page.goto(policyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      if (page.url().includes('/asa/in/rsa/rider/generate-policy') || 
          page.url().includes('/asa/in/rsa/sales/generate-policy')) {
        console.log('  ✅ Successfully navigated to Policy Generation page');
        const searchResult = await fillChassisAndSearch(page, chassisNumber);
        if (searchResult) {
          console.log('  ✅ Chassis filled and searched! Now filling RSA form...');
          const formResult = await fillRSAForm(page, bookingDetails, context);
          return formResult;
        }
        return false;
      } else {
        console.log(`  ❌ Failed to navigate to policy page. Current URL: ${page.url()}`);
        return false;
      }
    }
    
    console.log('  ⚠️ On unknown page. Trying to navigate to dashboard...');
    await page.goto(TVS_SERVICE_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/common-dashboard')) {
      console.log('  ✅ Navigated to dashboard');
      return await navigateToPolicyPageAndSearch(context, page, chassisNumber, bookingDetails);
    } else {
      console.log(`  ❌ Could not navigate to dashboard. Current URL: ${page.url()}`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// ============================================================
// FILL RSA FORM (UPDATED - returns the page to use)
// ============================================================

async function fillRSAForm(page, bookingDetails, context) {
  console.log('\n📌 STEP: Filling RSA Form...');
  
  try {
    const customer = bookingDetails.customerDetails || {};
    
    const salutation = customer.salutation || 'Mr.';
    const fullName = customer.name || '';
    const email = customer.email || '';
    const dob = customer.dob || '';
    const address = customer.address || '';
    const pincode = customer.pincode || '';
    const mobile = customer.mobile1 || '';
    const district = customer.district || '';
    const nomineeFullName = customer.nomineeName || '';
    const nomineeAge = customer.nomineeAge || '';
    const nomineeRelation = customer.nomineeRelation || '';
    const nomineeSalutation = customer.nomineeSalutation || customer.nomineeGender || '';
    
    let firstName = '';
    let middleName = '';
    let lastName = '';
    
    if (fullName) {
      const nameParts = fullName.trim().split(/\s+/);
      if (nameParts.length === 1) {
        firstName = nameParts[0];
      } else if (nameParts.length === 2) {
        firstName = nameParts[0];
        lastName = nameParts[1];
      } else if (nameParts.length >= 3) {
        firstName = nameParts[0];
        middleName = nameParts.slice(1, -1).join(' ');
        lastName = nameParts[nameParts.length - 1];
      }
    }
    
    const salutationValue = salutation.replace('.', '');
    
    let formattedDob = '';
    if (dob) {
      const date = new Date(dob);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        formattedDob = `${year}-${month}-${day}`;
      }
    }
    
    // Get the plan name based on model
    const config = getPolicyConfigForModel(bookingDetails.model);
    const planName = config.planName;
    
    console.log(`  📋 Filling form with customer data:`);
    console.log(`     Salutation: ${salutationValue}`);
    console.log(`     Full Name: ${fullName}`);
    console.log(`     Email: ${email}`);
    console.log(`     DOB: ${formattedDob}`);
    console.log(`     Mobile: ${mobile}`);
    console.log(`     Nominee: ${nomineeFullName}`);
    console.log(`     Nominee Salutation: ${nomineeSalutation}`);
    console.log(`     Model: ${bookingDetails.model}`);
    console.log(`     Selected Plan: ${planName}`);
    
    await page.waitForTimeout(2000);
    
    // 1. Select Policy Holder Type: Individual
    console.log('\n  📌 Selecting Policy Holder Type: Individual...');
    try {
      const policyHolderSelectors = [
        '#policyHolderType',
        'input[id="policyHolderType"]',
        'input[role="combobox"][aria-owns*="policyHolderType"]'
      ];
      
      let policyHolderInput = null;
      for (const selector of policyHolderSelectors) {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
          policyHolderInput = element;
          break;
        }
      }
      
      if (policyHolderInput) {
        await policyHolderInput.click();
        await page.waitForTimeout(500);
        
        const individualOption = await page.$('div[role="option"]:has-text("Individual"), li:has-text("Individual")');
        if (individualOption && await individualOption.isVisible()) {
          await individualOption.click();
          console.log('  ✅ Selected "Individual"');
        } else {
          await policyHolderInput.fill('Individual');
          await page.keyboard.press('Enter');
          console.log('  ✅ Selected "Individual" by typing');
        }
      } else {
        console.log('  ⚠️ Could not find Policy Holder Type field');
      }
    } catch (error) {
      console.log(`  ⚠️ Error selecting Policy Holder Type: ${error.message}`);
    }
    await page.waitForTimeout(1000);
    
    // 2. Select Salutation
    console.log(`\n  📌 Selecting Salutation: ${salutationValue}...`);
    try {
      const salutationSelectors = [
        '#salutation',
        'input[id="salutation"]',
        'input[role="combobox"][aria-owns*="salutation"]'
      ];
      
      let salutationInput = null;
      for (const selector of salutationSelectors) {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
          salutationInput = element;
          break;
        }
      }
      
      if (salutationInput) {
        await salutationInput.click();
        await page.waitForTimeout(500);
        
        const optionSelectors = [
          `div[role="option"]:has-text("${salutationValue}")`,
          `li:has-text("${salutationValue}")`,
          `div[role="option"]:has-text("${salutation}")`
        ];
        
        let optionFound = false;
        for (const selector of optionSelectors) {
          const option = await page.$(selector);
          if (option && await option.isVisible()) {
            await option.click();
            optionFound = true;
            console.log(`  ✅ Selected "${salutationValue}"`);
            break;
          }
        }
        
        if (!optionFound) {
          await salutationInput.fill(salutationValue);
          await page.keyboard.press('Enter');
          console.log(`  ✅ Selected "${salutationValue}" by typing`);
        }
      } else {
        console.log('  ⚠️ Could not find Salutation field');
      }
    } catch (error) {
      console.log(`  ⚠️ Error selecting Salutation: ${error.message}`);
    }
    await page.waitForTimeout(1000);
    
    // 3. Fill First Name
    console.log(`\n  📌 Filling First Name: ${firstName}...`);
    if (firstName) {
      try {
        const firstNameSelectors = [
          '#firstName',
          'input[id="firstName"]',
          'input[name="firstName"]',
          'input[placeholder="Enter first name"]'
        ];
        
        let firstNameInput = null;
        for (const selector of firstNameSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            firstNameInput = element;
            break;
          }
        }
        
        if (firstNameInput) {
          await firstNameInput.fill(firstName);
          console.log(`  ✅ Filled First Name: ${firstName}`);
        } else {
          console.log('  ⚠️ Could not find First Name field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling First Name: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 4. Fill Middle Name
    console.log(`\n  📌 Filling Middle Name: ${middleName}...`);
    if (middleName) {
      try {
        const middleNameSelectors = [
          '#middleName',
          'input[id="middleName"]',
          'input[name="middleName"]',
          'input[placeholder="Enter middle name"]'
        ];
        
        let middleNameInput = null;
        for (const selector of middleNameSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            middleNameInput = element;
            break;
          }
        }
        
        if (middleNameInput) {
          await middleNameInput.fill(middleName);
          console.log(`  ✅ Filled Middle Name: ${middleName}`);
        } else {
          console.log('  ⚠️ Could not find Middle Name field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Middle Name: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 5. Fill Last Name
    console.log(`\n  📌 Filling Last Name: ${lastName}...`);
    if (lastName) {
      try {
        const lastNameSelectors = [
          '#lastName',
          'input[id="lastName"]',
          'input[name="lastName"]',
          'input[placeholder="Enter last name"]'
        ];
        
        let lastNameInput = null;
        for (const selector of lastNameSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            lastNameInput = element;
            break;
          }
        }
        
        if (lastNameInput) {
          await lastNameInput.fill(lastName);
          console.log(`  ✅ Filled Last Name: ${lastName}`);
        } else {
          console.log('  ⚠️ Could not find Last Name field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Last Name: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 6. Fill Mobile Number
    console.log(`\n  📌 Filling Mobile Number: ${mobile}...`);
    if (mobile) {
      try {
        const mobileSelectors = [
          '#mobileNumber',
          'input[id="mobileNumber"]',
          'input[name="mobileNumber"]',
          'input[placeholder="Enter mobile number"]'
        ];
        
        let mobileInput = null;
        for (const selector of mobileSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            mobileInput = element;
            break;
          }
        }
        
        if (mobileInput) {
          await mobileInput.fill('');
          await page.waitForTimeout(300);
          await mobileInput.fill(mobile);
          console.log(`  ✅ Filled Mobile Number: ${mobile}`);
        } else {
          console.log('  ⚠️ Could not find Mobile Number field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Mobile Number: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 7. Fill Email
    console.log(`\n  📌 Filling Email: ${email}...`);
    if (email) {
      try {
        const emailSelectors = [
          '#email',
          'input[id="email"]',
          'input[name="email"]',
          'input[placeholder="Enter email"]'
        ];
        
        let emailInput = null;
        for (const selector of emailSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            emailInput = element;
            break;
          }
        }
        
        if (emailInput) {
          await emailInput.fill(email);
          console.log(`  ✅ Filled email: ${email}`);
        } else {
          console.log('  ⚠️ Could not find Email field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Email: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 8. Fill Date of Birth
    console.log(`\n  📌 Filling Date of Birth: ${formattedDob}...`);
    if (formattedDob) {
      try {
        const dobSelectors = [
          '#dateOfBirth',
          'input[id="dateOfBirth"]',
          'input[name="dateOfBirth"]',
          'input[placeholder="Enter date of birth"]'
        ];
        
        let dobInput = null;
        for (const selector of dobSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            dobInput = element;
            break;
          }
        }
        
        if (dobInput) {
          await dobInput.click();
          await page.waitForTimeout(500);
          await dobInput.fill('');
          await page.waitForTimeout(300);
          await dobInput.fill(formattedDob);
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
          console.log(`  ✅ Filled DOB: ${formattedDob}`);
          
          await page.screenshot({ path: 'rsa-dob-filled.png' });
          console.log('  📸 Screenshot saved: rsa-dob-filled.png');
        } else {
          console.log('  ⚠️ Could not find Date of Birth field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Date of Birth: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 9. Fill Address Line 1
    console.log(`\n  📌 Filling Address Line 1: ${address}...`);
    if (address) {
      try {
        const addressSelectors = [
          '#addressLine1',
          'input[id="addressLine1"]',
          'input[name="addressLine1"]',
          'input[placeholder="Enter address line 1"]'
        ];
        
        let addressInput = null;
        for (const selector of addressSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            addressInput = element;
            break;
          }
        }
        
        if (addressInput) {
          await addressInput.fill(address);
          console.log(`  ✅ Filled Address Line 1: ${address}`);
        } else {
          console.log('  ⚠️ Could not find Address Line 1 field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Address Line 1: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 10. Fill Address Line 2
    console.log(`\n  📌 Filling Address Line 2: ${district}...`);
    if (district) {
      try {
        const address2Selectors = [
          '#addressLine2',
          'input[id="addressLine2"]',
          'input[name="addressLine2"]',
          'input[placeholder="Enter address line 2"]'
        ];
        
        let address2Input = null;
        for (const selector of address2Selectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            address2Input = element;
            break;
          }
        }
        
        if (address2Input) {
          await address2Input.fill(district);
          console.log(`  ✅ Filled Address Line 2: ${district}`);
        } else {
          console.log('  ⚠️ Could not find Address Line 2 field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Address Line 2: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 11. Fill Pincode
    console.log(`\n  📌 Filling Pincode: ${pincode}...`);
    if (pincode) {
      try {
        const pincodeSelectors = [
          '#pincode',
          'input[id="pincode"]',
          'input[name="pincode"]',
          'input[placeholder="Enter pincode"]'
        ];
        
        let pincodeInput = null;
        for (const selector of pincodeSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            pincodeInput = element;
            break;
          }
        }
        
        if (pincodeInput) {
          await pincodeInput.fill(pincode);
          console.log(`  ✅ Filled Pincode: ${pincode}`);
        } else {
          console.log('  ⚠️ Could not find Pincode field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Pincode: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 12. Select Plan based on model
    await selectPlan(page, planName, bookingDetails.model);
    
    // 13. Fill Nominee Full Name
    console.log(`\n  📌 Filling Nominee Full Name: ${nomineeFullName}...`);
    if (nomineeFullName) {
      try {
        const nomineeNameSelectors = [
          '#nomineeFullName',
          'input[id="nomineeFullName"]',
          'input[name="nomineeFullName"]',
          'input[placeholder="Enter nominee fullname"]'
        ];
        
        let nomineeNameInput = null;
        for (const selector of nomineeNameSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            nomineeNameInput = element;
            break;
          }
        }
        
        if (nomineeNameInput) {
          await nomineeNameInput.fill(nomineeFullName);
          console.log(`  ✅ Filled Nominee Full Name: ${nomineeFullName}`);
        } else {
          console.log('  ⚠️ Could not find Nominee Full Name field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Nominee Full Name: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 14. Fill Nominee Age
    console.log(`\n  📌 Filling Nominee Age: ${nomineeAge}...`);
    if (nomineeAge) {
      try {
        const nomineeAgeSelectors = [
          '#nomineeAge',
          'input[id="nomineeAge"]',
          'input[name="nomineeAge"]',
          'input[placeholder="Enter nominee age"]'
        ];
        
        let nomineeAgeInput = null;
        for (const selector of nomineeAgeSelectors) {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            nomineeAgeInput = element;
            break;
          }
        }
        
        if (nomineeAgeInput) {
          await nomineeAgeInput.fill(nomineeAge.toString());
          console.log(`  ✅ Filled Nominee Age: ${nomineeAge}`);
        } else {
          console.log('  ⚠️ Could not find Nominee Age field');
        }
      } catch (error) {
        console.log(`  ⚠️ Error filling Nominee Age: ${error.message}`);
      }
    }
    await page.waitForTimeout(500);
    
    // 15. Select Nominee Relationship
    await selectNomineeRelationship(page, nomineeRelation, nomineeSalutation);
    
    // 16. Click Generate Policy Button (updated with new tab handling)
    console.log('\n  📌 Clicking Generate Policy button with new tab handling...');
    const clickResult = await clickGeneratePolicy(page, context);
    
    let policyPage = clickResult.page || page;
    
    if (clickResult.isNewTab) {
      console.log('  ✅ Using new tab for policy download');
      console.log(`  New tab URL: ${policyPage.url()}`);
    } else {
      console.log('  ℹ️ Using current page for policy download');
    }
    
    await page.screenshot({ path: 'rsa-form-filled.png' });
    console.log('  📸 Screenshot saved: rsa-form-filled.png');
    
    console.log('\n  ✅ RSA Form filled and Generate Policy clicked successfully!');
    
    return { success: true, page: policyPage };
    
  } catch (error) {
    console.log(`  ❌ Error filling RSA form: ${error.message}`);
    return { success: false, page: page };
  }
}

// ============================================================
// DOWNLOAD POLICY PDF AND SAVE TO PUBLIC FOLDER (UPDATED)
// ============================================================

async function downloadRSAPolicyDocument(page, bookingNumber, policyNumber, planName) {
  console.log('\n📌 STEP: Downloading RSA Policy Document...');

  try {
    if (!fs.existsSync(PUBLIC_RSA_DIR)) {
      fs.mkdirSync(PUBLIC_RSA_DIR, { recursive: true });
      console.log(`  📁 Created folder: ${PUBLIC_RSA_DIR}`);
    }

    console.log('  ⏳ Waiting for policy purchase status page to load...');
    await page.waitForTimeout(3000);
    
    console.log('  🔍 Looking for Download Policy PDF button...');
    
    await page.screenshot({ path: 'rsa-purchase-status-page.png' });
    console.log('  📸 Screenshot saved: rsa-purchase-status-page.png');

    let downloadClicked = false;
    let download = null;

    const specificSelectors = [
      'button[style*="background: rgb(9, 46, 88)"]:has-text("Download Policy PDF")',
      'button[style*="background: rgb(9, 46, 88)"]',
      'button.inline-flex.items-center.gap-2.rounded-xl.px-5.py-2.5:has-text("Download Policy PDF")',
      'button.inline-flex.items-center.gap-2.rounded-xl.px-5.py-2.5',
      'button.rounded-xl.px-5.py-2.5.text-sm.font-semibold:has-text("Download Policy PDF")',
      'button:has-text("Download Policy PDF")',
      'button:has-text("DOWNLOAD POLICY PDF")',
      'button:has-text("Download")',
      'button:has-text("PDF")'
    ];

    for (const selector of specificSelectors) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
        if (button && await button.isVisible()) {
          console.log(`  ✅ Found Download button using: ${selector}`);
          
          const [downloadEvent] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
            button.click()
          ]);
          
          if (downloadEvent) {
            download = downloadEvent;
            downloadClicked = true;
            console.log('  ✅ Download started successfully');
            break;
          }
        }
      } catch (e) {}
    }

    if (!downloadClicked) {
      console.log('  🔧 Trying JavaScript approach to find and click download button...');
      
      const [downloadEvent] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
        page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          
          for (const btn of buttons) {
            const text = btn.textContent ? btn.textContent.trim() : '';
            const style = btn.getAttribute('style') || '';
            
            if (style.includes('background: rgb(9, 46, 88)') && 
                text.includes('Download Policy PDF')) {
              console.log('✅ Found button with dark blue background');
              btn.click();
              return true;
            }
            
            if (text === 'Download Policy PDF' || 
                text === 'DOWNLOAD POLICY PDF' ||
                text.includes('Download Policy PDF')) {
              console.log('✅ Found button with exact text');
              btn.click();
              return true;
            }
            
            if (btn.className && 
                btn.className.includes('inline-flex') && 
                btn.className.includes('rounded-xl') &&
                text.includes('Download')) {
              console.log('✅ Found inline-flex button with Download text');
              btn.click();
              return true;
            }
          }
          
          const svgButtons = document.querySelectorAll('button');
          for (const btn of svgButtons) {
            const svg = btn.querySelector('svg');
            if (svg) {
              const text = btn.textContent ? btn.textContent.trim() : '';
              if (text.includes('Download') || text.includes('PDF')) {
                console.log('✅ Found button with download icon');
                btn.click();
                return true;
              }
            }
          }
          
          return false;
        })
      ]);
      
      if (downloadEvent) {
        download = downloadEvent;
        downloadClicked = true;
        console.log('  ✅ Download started via JavaScript');
      }
    }

    if (!downloadClicked) {
      console.log('  ⏳ Waiting additional 5 seconds for page to fully load...');
      await page.waitForTimeout(5000);
      
      console.log('  🔍 Final attempt to find download button...');
      const finalAttempt = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent ? btn.textContent.trim() : '';
          if (text.includes('Download') || text.includes('PDF')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (finalAttempt) {
        console.log('  ✅ Found and clicked download button on final attempt');
        
        try {
          const downloadEvent = await page.waitForEvent('download', { timeout: 15000 });
          if (downloadEvent) {
            download = downloadEvent;
            downloadClicked = true;
            console.log('  ✅ Download started successfully on final attempt');
          }
        } catch (e) {
          console.log('  ⚠️ Download event not captured but button was clicked');
          downloadClicked = true;
        }
      }
    }

    if (!download || !downloadClicked) {
      console.log('  ❌ Could not download RSA Policy document');
      
      try {
        await page.screenshot({ path: 'rsa-final-page.png' });
        console.log('  📸 Screenshot saved: rsa-final-page.png');
      } catch (e) {}
      
      return null;
    }

    const suggested = download.suggestedFilename() || `rsa-policy-${policyNumber || bookingNumber}.pdf`;
    const ext = path.extname(suggested) || '.pdf';
    const safePolicyNumber = (policyNumber || 'UNKNOWN').toString().replace(/[^a-zA-Z0-9]/g, '');
    const safeBookingNumber = bookingNumber.toString().replace(/[^a-zA-Z0-9]/g, '');
    const safePlanName = (planName || 'RSA').toString().replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `RSA_${safeBookingNumber}_${safePlanName}_${safePolicyNumber}${ext}`;
    const filePath = path.join(PUBLIC_RSA_DIR, fileName);

    await download.saveAs(filePath);
    console.log(`  ✅ RSA Policy document saved to: ${filePath}`);

    const stats = fs.statSync(filePath);
    const relativePath = `${PUBLIC_RSA_URL_PREFIX}/${fileName}`;

    return {
      fileName,
      filePath,
      relativePath,
      size: stats.size,
      mimetype: 'application/pdf'
    };

  } catch (error) {
    console.log(`  ❌ Error downloading RSA policy document: ${error.message}`);
    
    try {
      await page.screenshot({ path: 'rsa-download-error.png' });
      console.log('  📸 Error screenshot saved: rsa-download-error.png');
    } catch (e) {}
    
    return null;
  }
}

// ============================================================
// EXTRACT RSA POLICY DETAILS FROM PAGE
// ============================================================

async function extractRSAPolicyDetailsFromPage(page) {
  console.log('  📄 Extracting RSA policy details from page...');

  try {
    await page.waitForTimeout(1500);

    const details = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';

      function matchAfterLabel(label) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped + '\\s*\\n?\\s*:?\\s*([^\\n]+)');
        const match = bodyText.match(regex);
        return match ? match[1].trim() : '';
      }

      let policyNumber = matchAfterLabel('Policy Number');
      if (!policyNumber) {
        const policyMatch = bodyText.match(/Policy Number[:\s]*([A-Z0-9]+)/i);
        if (policyMatch) policyNumber = policyMatch[1].trim();
      }

      let planName = matchAfterLabel('Plan Name') || matchAfterLabel('RSA Plan');
      if (!planName) {
        const planMatch = bodyText.match(/RSA Plan[:\s]*([A-Za-z\s]+)/i);
        if (planMatch) planName = planMatch[1].trim();
      }

      let premiumRaw = matchAfterLabel('Premium Paid') || matchAfterLabel('Amount');
      let premiumPaid = '';
      const premiumMatch = premiumRaw.match(/([\d,]+(?:\.\d+)?)/);
      if (premiumMatch) premiumPaid = premiumMatch[1].replace(/,/g, '');

      let policyStart = matchAfterLabel('Policy Start') || matchAfterLabel('Start Date');
      let policyEnd = matchAfterLabel('Policy End') || matchAfterLabel('End Date');

      return {
        policyNumber,
        planName,
        premiumPaid,
        policyStartDate: policyStart,
        policyEndDate: policyEnd,
        rsaCompany: 'TVS Service'
      };
    });

    console.log('  ✅ RSA Policy details extracted:');
    console.log(JSON.stringify(details, null, 2));
    return details;

  } catch (error) {
    console.log(`  ❌ Error extracting RSA policy details: ${error.message}`);
    return {};
  }
}

// ============================================================
// UPDATE BOOKING WITH RSA POLICY DETAILS
// ============================================================

async function updateBookingRSAPolicy(bookingId, payload) {
  console.log('\n📡 Updating booking with RSA policy details...');
  console.log(`📡 API: ${MIS_API_UPDATE_RSA_URL(bookingId)}`);

  // Ensure insuranceStatus is set to COMPLETED when RSA is processed
  // Only add this if it's not already set
  if (!payload.insuranceStatus && payload.rsaStatus === 'COMPLETED') {
    payload.insuranceStatus = 'COMPLETED';
    console.log('  🔄 Also updating insuranceStatus to COMPLETED');
  }

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = new URL(MIS_API_UPDATE_RSA_URL(bookingId));

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => { responseData += chunk; });

      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('  ✅ Booking updated with RSA policy details');
            console.log(`  ✅ insuranceStatus set to: ${payload.insuranceStatus || 'COMPLETED'}`);
            resolve(parsed);
          } else {
            reject(new Error(`API returned status ${res.statusCode}: ${parsed.message || responseData}`));
          }
        } catch (error) {
          reject(new Error('Failed to parse API response: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error('API request failed: ' + error.message));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });

    req.write(data);
    req.end();
  });
}

// ============================================================
// COMPLETE RSA POLICY DOWNLOAD AND UPDATE (UPDATED)
// ============================================================

async function completeRSAPolicyDownload(page, booking, bookingDetails, selectedPlanName, context) {
  console.log('\n📌 STEP: Handling RSA policy confirmation page...');

  try {
    console.log('  ⏳ Waiting for policy generation to complete...');
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('/asa/in/rsa/rider/purchase-status') && 
        !currentUrl.includes('/asa/in/rsa/sales/purchase-status')) {
      console.log('  🔍 Checking all pages for purchase status page...');
      const pages = context.pages();
      for (const p of pages) {
        const url = p.url();
        if (url.includes('/asa/in/rsa/rider/purchase-status') || 
            url.includes('/asa/in/rsa/sales/purchase-status')) {
          console.log(`  ✅ Found purchase status page: ${url}`);
          page = p;
          break;
        }
      }
    }
    
    if (!page.url().includes('/asa/in/rsa/rider/purchase-status') && 
        !page.url().includes('/asa/in/rsa/sales/purchase-status')) {
      console.log('  ⏳ Waiting for purchase status page to load...');
      try {
        await page.waitForURL(/\/asa\/in\/rsa\/(?:rider|sales)\/purchase-status/, { timeout: 10000 });
        console.log(`  ✅ Navigated to purchase status page: ${page.url()}`);
      } catch (e) {
        console.log(`  ⚠️ Still on ${page.url()}, checking other pages...`);
        const pages = context.pages();
        for (const p of pages) {
          const url = p.url();
          if (url.includes('/asa/in/rsa/rider/purchase-status') || 
              url.includes('/asa/in/rsa/sales/purchase-status')) {
            console.log(`  ✅ Found purchase status page: ${url}`);
            page = p;
            break;
          }
        }
      }
    }

    await page.waitForTimeout(3000);

    let rsaPolicyDetails = await extractRSAPolicyDetailsFromPage(page);

    if (!rsaPolicyDetails.policyNumber) {
      const pageContent = await page.textContent('body');
      const policyMatch = pageContent.match(/Policy Number[:\s]*([A-Z0-9]+)/i);
      if (policyMatch) {
        rsaPolicyDetails.policyNumber = policyMatch[1];
      }
    }

    if (!rsaPolicyDetails.planName && selectedPlanName) {
      rsaPolicyDetails.planName = selectedPlanName;
    }

    console.log('  📋 Final RSA Policy Details:');
    console.log(JSON.stringify(rsaPolicyDetails, null, 2));

    const downloadResult = await downloadRSAPolicyDocument(
      page,
      booking.bookingNumber || booking._id,
      rsaPolicyDetails.policyNumber || 'RSA-' + Date.now(),
      rsaPolicyDetails.planName || selectedPlanName || 'Rider-Care'
    );

    if (!downloadResult) {
      console.log('  ⚠️ RSA Policy document download failed — booking will NOT be updated with a document path.');
      
      try {
        await sendAutomationErrorEmail({
          bookingId: booking.bookingNumber || 'N/A',
          bookingNumber: booking.bookingNumber || 'N/A',
          chassisNumber: booking.chassisNumber || 'N/A',
          customerName: bookingDetails?.customerName || 'N/A',
          mobile: bookingDetails?.mobile || 'N/A',
          model: bookingDetails?.model || 'N/A',
          automationType: 'rsa',
          errorMessage: '⚠️ RSA processed but policy PDF could not be downloaded',
          errorStack: 'Download button not found or download failed',
          failedStep: 'downloadRSAPolicyDocument',
          additionalData: {
            message: 'The RSA policy was generated on TVS Service portal but the PDF could not be downloaded automatically. The system will retry this booking after 3 hours.',
            selectedPlan: selectedPlanName || 'N/A',
            url: page?.url() || 'N/A',
            policyDetails: rsaPolicyDetails
          }
        });
        
        if (booking.bookingNumber && booking.chassisNumber) {
          markForRetry(booking.bookingNumber, booking.chassisNumber, 'rsa', 'No RSA policy document downloaded', 'downloadRSAPolicyDocument');
        }
      } catch (emailError) {
        console.error('Failed to send error email:', emailError.message);
      }
      
      return { policyDetails: rsaPolicyDetails, downloadResult: null };
    }

    try {
      const updatePayload = {
        rsaPolicy: {
          policyNumber: rsaPolicyDetails.policyNumber || '',
          rsaCompany: rsaPolicyDetails.rsaCompany || 'TVS Service',
          premiumPaid: rsaPolicyDetails.premiumPaid ? Number(rsaPolicyDetails.premiumPaid) : undefined,
          planName: rsaPolicyDetails.planName || selectedPlanName || '',
          planPrice: selectedPlanName ? undefined : undefined,
          policyStartDate: rsaPolicyDetails.policyStartDate || undefined,
          policyEndDate: rsaPolicyDetails.policyEndDate || undefined,
          documentPath: downloadResult.relativePath,
          downloadedAt: new Date().toISOString()
        },
        rsaPolicyDocument: {
          path: downloadResult.relativePath,
          originalName: downloadResult.fileName,
          size: downloadResult.size,
          mimetype: downloadResult.mimetype,
          uploadedAt: new Date()
        },
        rsaStatus: 'COMPLETED',
        //  Set insuranceStatus to COMPLETED when RSA is successfully processed
        insuranceStatus: 'COMPLETED'
      };

      if (rsaPolicyDetails.policyNumber) {
        updatePayload.rsaPolicyHistory = [{
          policyNumber: rsaPolicyDetails.policyNumber,
          documentPath: downloadResult.relativePath,
          downloadedAt: new Date(),
          status: 'DOWNLOADED'
        }];
      }

      await updateBookingRSAPolicy(booking._id, updatePayload);
      console.log(`  ✅ Booking ${booking.bookingNumber} updated with RSA policy details`);
      console.log(`  📄 RSA Policy document path: ${downloadResult.relativePath}`);

      markRSABookingProcessed(booking.bookingNumber, booking.chassisNumber);
      console.log(`  📝 Recorded: ${booking.bookingNumber} - RSA processed`);
      
      try {
        await sendAutomationSuccessEmail({
          bookingId: booking.bookingNumber,
          bookingNumber: booking.bookingNumber,
          chassisNumber: booking.chassisNumber,
          customerName: bookingDetails?.customerName || 'N/A',
          mobile: bookingDetails?.mobile || 'N/A',
          model: bookingDetails?.model || 'N/A',
          automationType: 'rsa',
          policyNumber: rsaPolicyDetails?.policyNumber || 'N/A',
          documentPath: downloadResult.relativePath
        });
      } catch (emailError) {
        console.error('Failed to send success email:', emailError.message);
      }

    } catch (error) {
      console.log(`  ❌ Failed to update booking record: ${error.message}`);
      console.log('  ℹ️ The PDF is still safely saved on disk at:');
      console.log(`     ${downloadResult.filePath}`);
    }

    try {
      await page.screenshot({ path: 'rsa-policy-confirmation.png' });
      console.log('📸 Screenshot saved: rsa-policy-confirmation.png');
    } catch (e) {}

    return { policyDetails: rsaPolicyDetails, downloadResult };

  } catch (error) {
    console.log(`  ❌ Error in RSA policy download: ${error.message}`);
    return { policyDetails: {}, downloadResult: null };
  }
}

// ============================================================
// PROCESS SINGLE RSA BOOKING
// ============================================================

async function processSingleRSABooking(booking) {
  console.log(`\n📌 Processing RSA booking: ${booking.bookingNumber || booking._id}`);
  
  const chassisNumber = booking.chassisNumber || 
                        booking.chassisNo || 
                        booking.vehicleDetails?.chassisNumber || 
                        booking.vehicleDetails?.chassisNo || 
                        booking.vehicle?.chassisNumber ||
                        booking.vehicle?.chassisNo ||
                        '';
  const bookingId = booking.bookingNumber || booking._id;

  if (!chassisNumber) {
    console.log('❌ Chassis Number missing in booking data');
    return { success: false, bookingId, error: 'Missing chassis number' };
  }

  // Prepare booking details
  const customer = booking.customerDetails || {};
  const bookingDetails = {
    booking,
    chassisNumber,
    engineNumber: booking.engineNumber || '',
    customerName: customer.name || '',
    mobile: customer.mobile1 || '',
    model: booking.modelDetails?.model_name || '',
    modelId: booking.model || '',
    customerDetails: customer
  };

  console.log(`✅ Processing RSA for: ${bookingId}`);
  console.log(`   Customer: ${bookingDetails.customerName}`);
  console.log(`   Chassis: ${chassisNumber}`);
  console.log(`   Model: ${bookingDetails.model}`);
  console.log(`   Model ID: ${bookingDetails.modelId}`);

  // Get the policy config based on model
  const config = getPolicyConfigForModel(bookingDetails.model);
  const policyUrl = config.policyUrl;
  const selectedPlanName = config.planName;
  
  console.log(`   📌 Policy URL: ${policyUrl}`);
  console.log(`   📌 Selected Plan: ${selectedPlanName}`);

  // Connect to browser and process
  let browser, context, page;

  try {
    const result = await connectToExistingBrowser();
    browser = result.browser;
    context = result.context;
    page = result.page;
    console.log('  ✅ Connected successfully!\n');
  } catch (error) {
    console.log('\n❌ Could not connect to existing browser.');
    return { success: false, bookingId, error: 'Browser connection failed: ' + error.message };
  }

  try {
    console.log('📌 STEP: Checking TVS Service session...');
    const sessionResult = await checkTVSServiceSession(page);
    
    let sessionUsed = false;
    
    if (sessionResult.hasSession) {
      console.log('\n✅ Session is valid! Already logged in to TVS Service.');
      sessionUsed = true;
    } else {
      console.log('\n🔄 No valid session found. Starting login...');
      
      console.log('📌 STEP: Logging into TVS Service (RSA)...');
      const loginResult = await loginToTVSService(page);

      if (!loginResult) {
        console.log('\n❌ TVS Service login failed!');
        await page.screenshot({ path: `rsa-login-failed-${bookingId}.png` });
        return { success: false, bookingId, error: 'Login failed' };
      }

      console.log('\n✅ TVS Service login successful!');
      await page.waitForTimeout(3000);
    }

    console.log('\n📌 STEP: Smart navigation and filling RSA form...');
    const navResult = await navigateToPolicyPageAndSearch(context, page, chassisNumber, bookingDetails);

    if (!navResult || !navResult.success) {
      console.log('\n❌ RSA Form filling failed!');
      return { success: false, bookingId, error: 'RSA Form filling failed' };
    }

    console.log('\n📌 STEP: Downloading RSA Policy PDF and updating booking...');
    const policyPage = navResult.page || page;
    console.log(`  📄 Using page for download: ${policyPage.url()}`);
    
    const { policyDetails, downloadResult } = await completeRSAPolicyDownload(
      policyPage, 
      booking, 
      bookingDetails, 
      selectedPlanName,
      context
    );

    if (downloadResult) {
      console.log('✅ RSA Policy PDF download and booking update completed successfully!');
      console.log(`   Policy Document Path: ${downloadResult.relativePath}`);
    } else {
      console.log('⚠️ Could not download RSA Policy PDF automatically. You may need to download it manually.');
    }

    return {
      success: true,
      bookingId: bookingId,
      chassisNumber: chassisNumber,
      engineNumber: bookingDetails.engineNumber,
      customerName: bookingDetails.customerName,
      mobile: bookingDetails.mobile,
      model: bookingDetails.model,
      modelId: bookingDetails.modelId,
      selectedPlan: selectedPlanName,
      policyUrl: policyUrl,
      sessionUsed: sessionUsed,
      url: page.url(),
      downloadInitiated: !!downloadResult,
      rsaPolicyNumber: policyDetails?.policyNumber || null,
      rsaPolicyDocumentPath: downloadResult?.relativePath || null,
      rsaStatus: downloadResult ? 'COMPLETED' : 'PARTIAL'
    };

  } catch (error) {
    console.error('\n❌ Automation failed:', error.message);
    await page.screenshot({ path: `rsa-error-${bookingId}.png` });
    return { success: false, bookingId, error: error.message };
  }
}

// ============================================================
// MAIN AUTOMATION FUNCTION WITH DATE FILTERING
// ============================================================

async function rsaPolicyGeneration(cronMode = false) {
  console.log('\n🚀 Starting TVS Service (RSA) Policy Generation Automation...');
  console.log(`📅 ${new Date().toLocaleString()}\n`);
  console.log(`📌 Mode: ${cronMode ? 'CRON (auto-fetch)' : 'MANUAL'}`);
  console.log(`   URL: ${TVS_SERVICE_URL}\n`);

  if (cronMode) {
    // Get today's and yesterday's dates
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yYear = yesterday.getFullYear();
    const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yDay = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;
    
    console.log('📌 CRON MODE: Fetching RSA bookings for last 2 days...');
    const result = await getBookingsForRSA(yesterdayStr, todayStr);
    
    const eligibleBookings = result.eligible || [];
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RSA BOOKINGS SUMMARY (${yesterdayStr} to ${todayStr})`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   📝 Total bookings: ${result.total}`);
    console.log(`   ✅ Eligible for processing: ${eligibleBookings.length}`);
    console.log(`   ⏭️ Skipped: ${result.skipped}`);
    console.log(`   ✅ Already processed: ${result.alreadyProcessed || 0}`);
    
    if (eligibleBookings.length > 0) {
      console.log(`\n📋 ELIGIBLE RSA BOOKINGS TO PROCESS:`);
      eligibleBookings.forEach((b, i) => {
        const model = b.modelDetails?.model_name || 'N/A';
        const config = getPolicyConfigForModel(model);
        console.log(`   ${i+1}. ${b.bookingNumber || b._id} | ${b.customerDetails?.name || 'N/A'} | ${b.chassisNumber} | ${model} | ${config.policyUrl.includes('sales') ? 'SALES' : 'RIDER'} | Plan: ${config.planName}`);
      });
    }
    console.log(`${'='.repeat(60)}`);
    
    if (eligibleBookings.length === 0) {
      console.log('✅ No RSA bookings to process. Exiting...');
      return {
        success: false,
        error: 'No bookings to process',
        cronMode: true,
        summary: result.summary,
        totalBookings: result.total,
        eligibleCount: 0,
        skippedCount: result.skipped
      };
    }
    
    console.log(`\n📋 Found ${eligibleBookings.length} RSA booking(s) to process`);
    
    // Process all eligible bookings
    const results = [];
    let successCount = 0;
    let failCount = 0;
    let processedBookings = [];
    
    for (let i = 0; i < eligibleBookings.length; i++) {
      const booking = eligibleBookings[i];
      const currentBookingId = booking.bookingNumber || booking._id;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Processing RSA booking: ${currentBookingId} (${i + 1}/${eligibleBookings.length})`);
      console.log(`${'='.repeat(60)}`);
      
      try {
        const processResult = await processSingleRSABooking(booking);
        results.push(processResult);
        
        if (processResult.success) {
          successCount++;
          processedBookings.push(currentBookingId);
          console.log(`\n✅ SUCCESS: RSA for ${currentBookingId} processed successfully!`);
        } else {
          failCount++;
          console.log(`\n❌ FAILED: RSA for ${currentBookingId} - ${processResult.error || 'Unknown error'}`);
        }
        
        // Show remaining bookings
        const remaining = eligibleBookings.slice(i + 1);
        console.log(`\n📌 REMAINING RSA BOOKINGS (${remaining.length}):`);
        if (remaining.length > 0) {
          remaining.forEach((b, idx) => {
            const model = b.modelDetails?.model_name || 'N/A';
            console.log(`   ${idx+1}. ${b.bookingNumber || b._id} | ${b.customerDetails?.name || 'N/A'} | ${model}`);
          });
        } else {
          console.log('   ✅ No remaining RSA bookings! All done!');
        }
        
        // Wait between bookings
        if (i < eligibleBookings.length - 1) {
          console.log('\n⏳ Waiting 5 seconds before next RSA booking...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
      } catch (error) {
        console.log(`❌ Error processing RSA booking ${currentBookingId}: ${error.message}`);
        failCount++;
        results.push({ success: false, bookingId: currentBookingId, error: error.message });
      }
    }
    
    // ✅ FINAL SUMMARY
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RSA FINAL SUMMARY (${yesterdayStr} to ${todayStr})`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   📝 Total bookings: ${result.total}`);
    console.log(`   ✅ Eligible for processing: ${eligibleBookings.length}`);
    console.log(`   ✅ Successfully processed: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   ⏭️ Skipped: ${result.skipped}`);
    console.log(`   ✅ Already processed: ${result.alreadyProcessed || 0}`);
    
    console.log(`\n📋 PROCESSED RSA BOOKINGS:`);
    if (processedBookings.length > 0) {
      processedBookings.forEach((id, i) => {
        console.log(`   ✅ ${i+1}. ${id}`);
      });
    } else {
      console.log('   ℹ️ No RSA bookings were processed today');
    }
    
    const failedBookingIds = results.filter(r => !r.success && r.bookingId).map(r => r.bookingId);
    if (failedBookingIds.length > 0) {
      console.log(`\n❌ FAILED RSA BOOKINGS (will retry):`);
      failedBookingIds.forEach((id, i) => {
        console.log(`   ❌ ${i+1}. ${id}`);
      });
    }
    
    console.log(`\n✅ RSA COMPLETED: ${new Date().toLocaleTimeString()}`);
    console.log(`${'='.repeat(60)}`);
    
    return {
      success: successCount > 0,
      cronMode: true,
      startDate: yesterdayStr,
      endDate: todayStr,
      totalBookings: result.total,
      eligibleCount: eligibleBookings.length,
      successCount,
      failCount,
      skippedCount: result.skipped,
      alreadyProcessed: result.alreadyProcessed || 0,
      processedBookings,
      failedBookings: failedBookingIds,
      summary: result.summary,
      results
    };
  }

  // MANUAL MODE: Keep existing manual flow
  let bookingId = await promptForBookingId();
  
  if (!bookingId) {
    console.log('❌ No Booking ID provided. Exiting...');
    return { success: false, error: 'No Booking ID provided' };
  }

  let bookingDetails;
  try {
    const result = await fetchBookingDetails(bookingId);
    bookingDetails = result;
  } catch (error) {
    console.log(`❌ ${error.message}`);
    return { success: false, error: error.message };
  }

  if (!bookingDetails.chassisNumber) {
    console.log('❌ Chassis Number not found in booking data');
    return { success: false, error: 'Chassis Number not found' };
  }

  // Process the single booking
  const result = await processSingleRSABooking(bookingDetails.booking);
  return result;
}

// ============================================================
// RUN THE SCRIPT
// ============================================================

const isCronMode = process.argv.includes('--cron') || process.argv.includes('-c');

if (require.main === module) {
  rsaPolicyGeneration(isCronMode)
    .then(result => {
      console.log('\n📊 Result Summary:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Mode: ${result.cronMode ? 'CRON' : 'MANUAL'}`);
      
      if (result.success) {
        if (result.cronMode) {
          console.log(`   Start Date: ${result.startDate}`);
          console.log(`   End Date: ${result.endDate}`);
          console.log(`   Total Bookings: ${result.totalBookings}`);
          console.log(`   Eligible Count: ${result.eligibleCount}`);
          console.log(`   Success Count: ${result.successCount}`);
          console.log(`   Fail Count: ${result.failCount}`);
          console.log(`   Skipped Count: ${result.skippedCount}`);
          console.log(`   Already Processed: ${result.alreadyProcessed}`);
          if (result.processedBookings && result.processedBookings.length > 0) {
            console.log(`   Processed: ${result.processedBookings.join(', ')}`);
          }
          if (result.failedBookings && result.failedBookings.length > 0) {
            console.log(`   Failed: ${result.failedBookings.join(', ')}`);
          }
        } else {
          console.log(`   Booking ID: ${result.bookingId}`);
          console.log(`   Customer: ${result.customerName}`);
          console.log(`   Mobile: ${result.mobile}`);
          console.log(`   Model: ${result.model}`);
          console.log(`   Selected Plan: ${result.selectedPlan}`);
          console.log(`   Policy URL: ${result.policyUrl}`);
          console.log(`   Chassis Number: ${result.chassisNumber}`);
          console.log(`   Session Used: ${result.sessionUsed ? '✅ Yes' : '❌ No'}`);
          if (result.rsaPolicyNumber) {
            console.log(`   RSA Policy Number: ${result.rsaPolicyNumber}`);
          }
          if (result.rsaPolicyDocumentPath) {
            console.log(`   RSA Policy Document: ${result.rsaPolicyDocumentPath}`);
          }
        }
      } else if (result.error === 'No bookings to process') {
        console.log('   ℹ️ No bookings to process. Exiting normally.');
      } else {
        console.log(`   ❌ Error: ${result.error}`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Fatal error:', error.message);
      process.exit(1);
    });
}

module.exports = { rsaPolicyGeneration };