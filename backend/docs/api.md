Trunet API Documentation

> Updated: Stock Purchase and Stock Request APIs added from the current new-backend route implementations.



Base URL



http\://localhost:5000/api/v1



GET /health



Checks whether the Trunet backend API is running.



GET http\://localhost:5000/api/v1/health



Authentication



POST /auth/login



Authenticates a Trunet user using their username or email and password.



Endpoint



POST http\://localhost:5000/api/v1/auth/login



GET /auth/rbac-test



Verifies that authentication and permission-based authorization are

working correctly.



Endpoint



GET http\://localhost:5000/api/v1/auth/rbac-test



POST /auth/refresh



Refreshes an authenticated session using a valid refresh token.



The endpoint uses refresh-token rotation. After a successful refresh,

the supplied refresh token is revoked and a new refresh token is issued.



Endpoint



POST http\://localhost:5000/api/v1/auth/refresh



Authentication — Refresh Token



POST /api/v1/auth/refresh



Issues a new access token and rotates the supplied refresh token.



The previous refresh token is revoked after a successful refresh and

cannot be reused.



Access: Public



Request Body



{ "refreshToken": "YOUR_REFRESH_TOKEN" }



Authentication — Logout



POST /api/v1/auth/logout



Revokes the refresh-token session associated with the supplied refresh

token.



Access: Public



Request Body



{ "refreshToken": "YOUR_REFRESH_TOKEN" }



Product Categories



POST /product-categories



Creates a new product category.



Endpoint



POST http\://localhost:5000/api/v1/product-categories



Access: Authenticated



Request Body



{ "productCategory": "Electronics", "remark": "Electronic inventory

items" }



Successful Response



201 Created



{ "success": true, "message": "Product category created successfully.",

"data": { "\\\_id": "CATEGORY_ID", "productCategory": "Electronics",

"remark": "Electronic inventory items", "createdAt":

"2026-09-16T11:09:12.999Z", "updatedAt": "2026-09-16T11:09:12.999Z" } }



Errors



400 Bad Request



Returned when the request fails validation.



409 Conflict



Returned when the product category already exists.



GET /product-categories



Returns a paginated list of product categories.



Endpoint



GET http\://localhost:5000/api/v1/product-categories



Access: Authenticated



Query Parameters



Parameter



Required



Default



Description



search



No



—



Searches product category and remark



page



No



1



Page number



limit



No



100



Number of records per page



sortBy



No



createdAt



Field used for sorting



sortOrder



No



desc



Sort direction: asc or desc



Example



GET

http\://localhost:5000/api/v1/product-categories?search=electronics&page=1&limit=10&sortBy=createdAt&sortOrder=desc



Successful Response



200 OK



{ "success": true, "message": "Product categories retrieved

successfully.", "data": { "categories": \\[ { "\\\_id": "CATEGORY_ID",

"productCategory": "Electronics", "remark": "Electronic inventory

items", "createdAt": "2026-09-16T11:09:12.999Z", "updatedAt":

"2026-09-16T11:09:12.999Z" } \\], "pagination": { "currentPage": 1,

"totalPages": 1, "totalCategories": 1 } } }



GET /product-categories/:id



Returns a product category by its MongoDB ID.



Endpoint



GET http\://localhost:5000/api/v1/product-categories/CATEGORY_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Product category retrieved

successfully.", "data": { "\\\_id": "CATEGORY_ID", "productCategory":

"Electronics", "remark": "Electronic inventory items", "createdAt":

"2026-09-16T11:09:12.999Z", "updatedAt": "2026-09-16T11:09:12.999Z" } }



Errors



400 Bad Request



Returned when the supplied ID is invalid.



404 Not Found



Returned when the product category does not exist.



PUT /product-categories/:id



Updates an existing product category.



Endpoint



PUT http\://localhost:5000/api/v1/product-categories/CATEGORY_ID



Access: Authenticated



Request Body



{ "productCategory": "Updated Electronics", "remark": "Updated category

description" }



Successful Response



200 OK



{ "success": true, "message": "Product category updated successfully.",

"data": { "\\\_id": "CATEGORY_ID", "productCategory": "Updated

Electronics", "remark": "Updated category description", "createdAt":

"2026-09-16T11:09:12.999Z", "updatedAt": "2026-09-16T11:56:54.426Z" } }



Errors



400 Bad Request



Returned when the ID or request fields fail validation.



404 Not Found



Returned when the product category does not exist.



409 Conflict



Returned when the updated product category already exists.



DELETE /product-categories/:id



Deletes an existing product category.



Endpoint



DELETE http\://localhost:5000/api/v1/product-categories/CATEGORY_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Product category deleted successfully.",

"data": { "\\\_id": "CATEGORY_ID", "productCategory": "Electronics",

"remark": "Electronic inventory items", "createdAt":

"2026-09-16T11:09:12.999Z", "updatedAt": "2026-09-16T11:56:54.426Z" } }



Errors



400 Bad Request



Returned when the supplied ID is invalid.



404 Not Found



Returned when the product category does not exist.



Products



POST /products



Creates a new product.



Endpoint



POST http\://localhost:5000/api/v1/products



Access: Authenticated



Request



Use multipart/form-data because the product image is optional.



Field



Required



Type



Description



productCategory



Yes



MongoDB ObjectId



Product category ID



productTitle



Yes



String



Unique product title



productCode



No



String



Unique product code



productPrice



Yes



Number



Product purchase/base price



salePrice



Yes



Number



Product sale price



hsnCode



Yes



String



HSN code



productImage



No



File



JPG, JPEG, PNG, WEBP or GIF; maximum 5 MB



productWeight



No



String



Product weight



productBarcode



No



String



Product barcode



status



No



String



Enable or Disable



description



No



String



Product description



trackSerialNumber



No



String



Yes or No



repairable



No



String



Yes or No



replaceable



No



String



Yes or No



Example



productCategory = CATEGORY_ID productTitle = WiFi Router productCode =

ROUTER001 productPrice = 2500 salePrice = 2100 hsnCode = 85176290

productWeight = 0.8kg productBarcode = 123456789880123 status = Enable

description = Wireless networking router trackSerialNumber = Yes

repairable = Yes replaceable = Yes productImage = router.png



Successful Response



201 Created



{ "success": true, "message": "Product created successfully.", "data": {

"\\\_id": "PRODUCT_ID", "productCategory": { "\\\_id": "CATEGORY_ID",

"productCategory": "Electronics", "remark": "Electronic inventory items"

}, "productTitle": "WiFi Router", "productCode": "ROUTER001",

"productPrice": 2500, "salePrice": 2100, "hsnCode": "85176290",

"productImage": "uploads/products/product-IMAGE_FILE.png",

"productWeight": "0.8kg", "productBarcode": "123456789880123", "status":

"Enable", "description": "Wireless networking router",

"trackSerialNumber": "Yes", "repairable": "Yes", "replaceable": "Yes",

"createdAt": "2026-09-18T04:33:39.142Z", "updatedAt":

"2026-09-18T04:33:39.142Z" } }



Errors



400 Bad Request



Returned when request validation fails or the product category ID is

invalid.



404 Not Found



Returned when the referenced product category does not exist.



409 Conflict



Returned when the product title or product code is already in use.



GET /products



Returns a paginated list of products with optional filtering and

sorting.



Endpoint



GET http\://localhost:5000/api/v1/products



Access: Authenticated



Query Parameters



Parameter



Required



Default



Description



search



No



—



Searches product title, code, description and barcode



category



No



—



Product category ID, name or category code



status



No



—



Enable, Disable, or comma-separated values



minPrice



No



—



Minimum product price



maxPrice



No



—



Maximum product price



trackSerialNumber



No



—



Yes or No



repairable



No



—



Yes or No



replaceable



No



—



Yes or No



page



No



1



Page number



limit



No



—



Records per page; maximum 100



sortBy



No



createdAt



createdAt, updatedAt, productTitle, productCode, productPrice, salePrice

or status



sortOrder



No



desc



asc or desc



Example



GET

http\://localhost:5000/api/v1/products?search=router&status=Enable&page=1&limit=10&sortBy=salePrice&sortOrder=asc



Successful Response



200 OK



{ "success": true, "message": "Products retrieved successfully.",

"data": { "products": \\[ { "\\\_id": "PRODUCT_ID", "productCategory": {

"\\\_id": "CATEGORY_ID", "productCategory": "Electronics", "remark":

"Electronic inventory items" }, "productTitle": "WiFi Router",

"productCode": "ROUTER001", "productPrice": 2500, "salePrice": 2100,

"hsnCode": "85176290", "productImage":

"uploads/products/product-IMAGE_FILE.png", "productWeight": "0.8kg",

"productBarcode": "123456789880123", "status": "Enable", "description":

"Wireless networking router", "trackSerialNumber": "Yes", "repairable":

"Yes", "replaceable": "Yes", "createdAt": "2026-09-18T04:33:39.142Z",

"updatedAt": "2026-09-18T04:33:39.142Z" } \\], "pagination": {

"currentPage": 1, "totalPages": 1, "totalProducts": 1, "hasNextPage":

false, "hasPrevPage": false } } }



GET /products/all



Returns all products without pagination.



Endpoint



GET http\://localhost:5000/api/v1/products/all



Access: Authenticated



Query Parameters



Parameter



Required



Default



Description



sortBy



No



createdAt



createdAt, updatedAt, productTitle, productCode, productPrice, salePrice

or status



sortOrder



No



desc



asc or desc



Example



GET

http\://localhost:5000/api/v1/products/all?sortBy=productTitle&sortOrder=asc



Successful Response



200 OK



{ "success": true, "message": "Products retrieved successfully.",

"data": \\[ { "\\\_id": "PRODUCT_ID", "productCategory": { "\\\_id":

"CATEGORY_ID", "productCategory": "Electronics", "remark": "Electronic

inventory items" }, "productTitle": "WiFi Router", "productCode":

"ROUTER001", "productPrice": 2500, "salePrice": 2100, "hsnCode":

"85176290", "productImage": "", "productWeight": "0.8kg",

"productBarcode": "123456789880123", "status": "Enable", "description":

"Wireless networking router", "trackSerialNumber": "Yes", "repairable":

"Yes", "replaceable": "Yes", "createdAt": "2026-09-18T04:33:39.142Z",

"updatedAt": "2026-09-18T04:33:39.142Z" } \\] }



GET /products/:id



Returns a product by its MongoDB ID.



Endpoint



GET http\://localhost:5000/api/v1/products/PRODUCT_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Product retrieved successfully.", "data":

{ "\\\_id": "PRODUCT_ID", "productCategory": { "\\\_id": "CATEGORY_ID",

"productCategory": "Electronics", "remark": "Electronic inventory items"

}, "productTitle": "WiFi Router", "productCode": "ROUTER001",

"productPrice": 2500, "salePrice": 2100, "hsnCode": "85176290",

"productImage": "", "productWeight": "0.8kg", "productBarcode":

"123456789880123", "status": "Enable", "description": "Wireless

networking router", "trackSerialNumber": "Yes", "repairable": "Yes",

"replaceable": "Yes", "createdAt": "2026-09-18T04:33:39.142Z",

"updatedAt": "2026-09-18T04:33:39.142Z" } }



Errors



400 Bad Request



Returned when the supplied ID is invalid.



404 Not Found



Returned when the product does not exist.



PUT /products/:id



Updates an existing product.



Endpoint



PUT http\://localhost:5000/api/v1/products/PRODUCT_ID



Access: Authenticated



Request



Use multipart/form-data. All product fields are optional during an

update.



The accepted fields are the same as POST /products.



If a new productImage is supplied, the previous product image is removed

after the database update succeeds.



Example



productTitle = Updated WiFi Router salePrice = 2100 description =

Updated wireless networking router productImage = new-router.png



Successful Response



200 OK



{ "success": true, "message": "Product updated successfully.", "data": {

"\\\_id": "PRODUCT_ID", "productTitle": "Updated WiFi Router",

"salePrice": 2100, "description": "Updated wireless networking router" }

}



Errors



400 Bad Request



Returned when the ID or supplied fields fail validation.



404 Not Found



Returned when the product or referenced product category does not exist.



409 Conflict



Returned when the updated product title or product code is already in

use.



DELETE /products/:id



Deletes an existing product.



Endpoint



DELETE http\://localhost:5000/api/v1/products/PRODUCT_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Product deleted successfully." }



Errors



400 Bad Request



Returned when the supplied ID is invalid.



404 Not Found



Returned when the product does not exist.



GET /products/download-template



Downloads the standard CSV template used for bulk product imports.



Endpoint



GET http\://localhost:5000/api/v1/products/download-template



Access: Authenticated



Response



200 OK



Content-Type: text/csv Content-Disposition: attachment;

filename=product_bulk_upload_template.csv



CSV Columns



productCategory,productTitle,productCode,productPrice,salePrice,hsnCode,productWeight,productBarcode,status,description,trackSerialNumber,repairable,replaceable



POST /products/bulk-import



Imports multiple products from a CSV file.



Endpoint



POST http\://localhost:5000/api/v1/products/bulk-import



Access: Authenticated



Request



Use multipart/form-data.



Field



Required



Type



Description



csvFile



Yes



File



CSV file containing product records



The CSV file is kept in memory during processing.



Maximum upload size: 10 MB.



CSV Columns



productCategory productTitle productCode productPrice salePrice hsnCode

productWeight productBarcode status description trackSerialNumber

repairable replaceable



Bulk Import Rules



Each CSV row is validated independently.



Invalid rows do not prevent other valid rows from being imported.



Product titles are unique.



Product codes are unique when provided.



Duplicate product titles and product codes are reported against their

CSV row.



Duplicate values within the same CSV are rejected before insertion.



Product categories are resolved during import and can be created when

required.



status accepts Enable or Disable.



trackSerialNumber, repairable, and replaceable accept Yes or No.



Example



csvFile = products.csv



Successful Response



200 OK



{ "success": true, "message": "Bulk import completed. Successful: 2,

Failed: 1.", "data": { "total": 3, "successful": 2, "failed": 1,

"errors": \\[ { "row": 3, "data": { "productCategory": "Electronics",

"productTitle": "Duplicate Router", "productCode": "ROUTER001" },

"errors": \\[ "Product code already exists." \\] } \\] } }



Errors



400 Bad Request



Returned when:



the CSV file is missing;



the CSV file is empty or cannot be parsed;



the uploaded file is not a supported CSV upload;



the CSV contains invalid product data.



The response includes row-specific validation errors where applicable.



401 Unauthorized



Returned when authentication credentials are missing or invalid.



Centers



POST /centers



Creates a new Center.



Endpoint



POST http\://localhost:5000/api/v1/centers



Access: Authenticated



Request Body



{ "resellerId": "RESELLER_ID", "areaId": "AREA_ID", "centerType":

"Outlet", "centerName": "Test Center", "centerCode": "TC001", "email":

"\<testcenter\@gmail.com>", "mobile": "9876543210", "status": "Enable",

"addressLine1": "Test Address 1", "addressLine2": "Test Address 2",

"city": "Pune", "state": "Maharashtra", "stockVerified": "Yes" }



Successful Response



201 Created



{ "success": true, "message": "Center created successfully", "data": {

"\\\_id": "CENTER_ID", "reseller": "RESELLER_ID", "area": "AREA_ID",

"centerType": "Outlet", "centerName": "Test Center", "centerCode":

"TC001", "email": "\<testcenter\@gmail.com>", "mobile": "9876543210",

"status": "Enable", "addressLine1": "Test Address 1", "addressLine2":

"Test Address 2", "city": "Pune", "state": "Maharashtra",

"stockVerified": "Yes", "createdAt": "TIMESTAMP", "updatedAt":

"TIMESTAMP" } }



Errors



400 Bad Request



Returned when Center data fails validation.



404 Not Found



Returned when the referenced reseller or area does not exist.



409 Conflict



Returned when a Center with the same unique Center code already exists.



GET /centers



Returns a paginated list of Centers.



Endpoint



GET http\://localhost:5000/api/v1/centers



Access: Authenticated



Query Parameters



Parameter



Required



Default



Description



search



No



—



Searches Center records



centerType



No



—



Filters by Center type



status



No



—



Filters by Center status



reseller



No



—



Filters by reseller ID



area



No



—



Filters by area ID



page



No



1



Page number



limit



No



100



Number of records per page



sortBy



No



—



Field used for sorting



sortOrder



No



—



asc or desc



Example



GET http\://localhost:5000/api/v1/centers?page=1&limit=10



Successful Response



200 OK



{ "success": true, "message": "Centers retrieved successfully", "data":

\\[\\], "pagination": { "currentPage": 1, "totalPages": 0, "totalItems":

0, "itemsPerPage": 100, "hasNextPage": false } }



GET /centers/:id



Returns a Center by its MongoDB ID.



Endpoint



GET http\://localhost:5000/api/v1/centers/CENTER_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Center retrieved successfully", "data": {

"\\\_id": "CENTER_ID", "reseller": "RESELLER_ID", "area": "AREA_ID",

"centerType": "Outlet", "centerName": "Test Center", "centerCode":

"TC001", "email": "\<testcenter\@gmail.com>", "mobile": "9876543210",

"status": "Enable", "addressLine1": "Test Address 1", "addressLine2":

"Test Address 2", "city": "Pune", "state": "Maharashtra",

"stockVerified": "Yes", "createdAt": "TIMESTAMP", "updatedAt":

"TIMESTAMP" } }



Errors



400 Bad Request



Returned when the supplied ID is invalid.



404 Not Found



Returned when the Center does not exist.



PUT /centers/:id



Updates an existing Center.



Endpoint



PUT http\://localhost:5000/api/v1/centers/CENTER_ID



Access: Authenticated



Request Body



{ "resellerId": "RESELLER_ID", "areaId": "AREA_ID", "centerType":

"Outlet", "centerName": "Updated Test Center", "centerCode":

"TC001UPDATED", "email": "\<updated\@example.com>", "mobile":

"9123456789", "status": "Disable", "addressLine1": "Updated Address 1",

"addressLine2": "Updated Address 2", "city": "Mumbai", "state":

"Maharashtra", "stockVerified": "No" }



Successful Response



200 OK



{ "success": true, "message": "Center updated successfully", "data": {

"\\\_id": "CENTER_ID", "reseller": "RESELLER_ID", "area": "AREA_ID",

"centerType": "Outlet", "centerName": "Updated Test Center",

"centerCode": "TC001UPDATED", "email": "\<updated\@example.com>",

"mobile": "9123456789", "status": "Disable", "addressLine1": "Updated

Address 1", "addressLine2": "Updated Address 2", "city": "Mumbai",

"state": "Maharashtra", "stockVerified": "No", "createdAt": "TIMESTAMP",

"updatedAt": "TIMESTAMP" } }



Errors



400 Bad Request



Returned when the ID or supplied fields fail validation.



404 Not Found



Returned when the Center, reseller, or area does not exist.



DELETE /centers/:id



Deletes an existing Center.



Endpoint



DELETE http\://localhost:5000/api/v1/centers/CENTER_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Center deleted successfully" }



Errors



400 Bad Request



Returned when the supplied ID is invalid.



404 Not Found



Returned when the Center does not exist.



GET /centers/reseller/:resellerId



Returns Centers associated with a specific reseller.



Endpoint



GET http\://localhost:5000/api/v1/centers/reseller/RESELLER_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Centers retrieved successfully", "data":

\\[\\] }



GET /centers/resellers/center



Returns Centers for the reseller associated with the authenticated user.



Endpoint



GET http\://localhost:5000/api/v1/centers/resellers/center



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Centers retrieved successfully", "data":

\\[\\] }



GET /centers/area/:areaId



Returns Centers associated with a specific area.



Endpoint



GET http\://localhost:5000/api/v1/centers/area/AREA_ID



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Centers retrieved successfully", "data":

\\[\\] }



GET /centers/main-warehouse



Returns main-warehouse Center data.



Endpoint



GET http\://localhost:5000/api/v1/centers/main-warehouse



Access: Authenticated



Successful Response



200 OK



{ "success": true, "message": "Main warehouse centers retrieved

successfully", "data": \\[\\] }



Center API Test Coverage



The following Center operations were tested against the new backend:



Test



Status



Create Center



Tested



Get all Centers



Tested



Get Center by ID



Tested



Search



Tested



Center type filter



Tested



Status filter



Tested



Reseller filter



Tested



Area filter



Tested



Pagination



Tested



Reseller-specific Centers



Tested



Authenticated reseller Centers



Tested



Area-specific Centers



Tested



Main warehouse endpoint



Tested



Update Center



Tested



Delete Center



Tested



Center fields checked



\\\_id reseller area centerType centerName centerCode email mobile status

addressLine1 addressLine2 city state stockVerified createdAt updatedAt



CSV/export is intentionally not documented here because it is not part

of the current new-backend/frontend Center implementation.



Reseller APIs



Base URL: http\://localhost:5000/api/v1



1\.  Create Reseller



POST /resellers



API Test



Status: Tested successfully.



2\.  Get All Resellers



GET /resellers



API Test



Status: Tested successfully.



3\.  Get Reseller By ID



GET /resellers/:id



API Test



Status: Tested successfully.



4\.  Update Reseller



PUT /resellers/:id



API Test



Status: Tested successfully.



5\.  Delete Reseller



DELETE /resellers/:id



API Test



Status: Tested successfully.



Area APIs



1\.  Create Area



POST /areas



Request Body



{ "resellerId": "\<resellerId>", "areaName": "Test Area" }



API Test



Status: Tested successfully.



2\.  Get All Areas



GET /areas



API Test



Status: Tested successfully.



3\.  Get Area By ID



GET /areas/:id



API Test



Status: Tested successfully.



4\.  Update Area



PUT /areas/:id



API Test



Status: Tested successfully.



5\.  Delete Area



DELETE /areas/:id



API Test



Status: Tested successfully.



Center APIs



Base URL: http\://localhost:5000/api/v1



1\.  Create Center



POST /centers



Endpoint



POST http\://localhost:5000/api/v1/centers



API Test



Status: Tested successfully.



Center can be created:



\- Without a Warehouse ID

\- With a Warehouse ID



Multiple Centers can reference the same Warehouse.



2\.  Get All Centers



GET /centers



Endpoint



GET http\://localhost:5000/api/v1/centers



Tested Query Parameters



search



centerType



status



reseller



area



page



limit



sortBy



sortOrder



API Test



Status: Tested successfully.



3\.  Get Center By ID



GET /centers/:id



Endpoint



GET http\://localhost:5000/api/v1/centers/CENTER_ID



API Test



Status: Tested successfully.



4\.  Update Center



PUT /centers/:id



Endpoint



PUT http\://localhost:5000/api/v1/centers/CENTER_ID



API Test



Status: Tested successfully.



5\.  Delete Center



DELETE /centers/:id



Endpoint



DELETE http\://localhost:5000/api/v1/centers/CENTER_ID



API Test



Status: Tested successfully.



6\.  Get Centers By Reseller



GET /centers/reseller/:resellerId



Endpoint



GET http\://localhost:5000/api/v1/centers/reseller/RESELLER_ID



API Test



Status: Tested successfully.



7\.  Get Centers By Resellers



GET /centers/resellers/center



Endpoint



GET http\://localhost:5000/api/v1/centers/resellers/center



API Test



Status: Tested successfully.



8\.  Get Centers By Area



GET /centers/area/:areaId



Endpoint



GET http\://localhost:5000/api/v1/centers/area/AREA_ID



API Test



Status: Tested successfully.



Center Fields Verified During Testing



\\\_id



reseller



area



warehouse



centerType



centerName



centerCode



email



mobile



status



addressLine1



addressLine2



city



state



stockVerified



createdAt



updatedAt



Center create/update requests use resellerId and areaId, which map to

the stored reseller and area relationships.



The warehouse field is optional. A Center can be created without a

Warehouse ID or with a Warehouse ID.



Multiple Centers can reference the same Warehouse.



API Test Coverage



Module



Create



List



Get By ID



Update



Delete



Additional APIs



Reseller



Tested



Tested



Tested



Tested



Tested



—



Area



Tested



Tested



Tested



Tested



Tested



Reseller relation



Center



Tested



Tested



Tested



Tested



Tested



Reseller, Area, Warehouse, Search/Filter/Pagination



**# Vendors**



**## POST&#x20;**\`/vendors\`



Creates a new vendor.



**### Endpoint**



\`\`\`http

POST http\://localhost:5000/api/v1/vendors

\`\`\`



**\*\*Access:\*\*** Authenticated with \`Settings -> manage_vendors\` permission



**### Request**



Use \`multipart/form-data\` when uploading a vendor logo.



\| Field           | Required | Type   | Description                                |

\| --------------- | -------- | ------ | ------------------------------------------ |

\| \`businessName\`  | Yes      | String | Vendor business name                       |

\| \`contactNumber\` | Yes      | String | Vendor contact number                      |

\| \`name\`          | Yes      | String | Vendor contact/person name                 |

\| \`mobile\`        | No       | String | Indian mobile number                       |

\| \`email\`         | No       | String | Vendor email address; unique when provided |

\| \`gstNumber\`     | No       | String | GST number                                 |

\| \`panNumber\`     | No       | String | PAN number                                 |

\| \`address1\`      | No       | String | Primary address                            |

\| \`address2\`      | No       | String | Secondary address                          |

\| \`city\`          | No       | String | City                                       |

\| \`state\`         | No       | String | State                                      |

\| \`logo\`          | No       | File   | JPG, JPEG, PNG, WEBP or GIF; maximum 5 MB  |



**### Example**



\`\`\`text

businessName = ABC Electronics

contactNumber = 02012345678

name = Amit Sharma

mobile = 9876543210

email = vendor\@example.com

gstNumber = 27ABCDE1234F1Z5

panNumber = ABCDE1234F

address1 = Main Market

address2 = Shop No. 12

city = Pune

state = Maharashtra

logo = vendor-logo.png

\`\`\`



**### Successful Response**



**\*\*201 Created\*\***



\`\`\`json

{

  "success": true,

  "message": "Vendor created successfully.",

  "data": {

    "\_id": "VENDOR_ID",

    "businessName": "ABC Electronics",

    "contactNumber": "02012345678",

    "name": "Amit Sharma",

    "mobile": "9876543210",

    "email": "vendor\@example.com",

    "gstNumber": "27ABCDE1234F1Z5",

    "panNumber": "ABCDE1234F",

    "address1": "Main Market",

    "address2": "Shop No. 12",

    "city": "Pune",

    "state": "Maharashtra",

    "logo": "uploads/vendors/vendor-IMAGE_FILE.png",

    "createdAt": "2026-09-22T04:33:39.142Z",

    "updatedAt": "2026-09-22T04:33:39.142Z"

  }

}

\`\`\`



**### Errors**



**\*\*400 Bad Request\*\***



Returned when vendor request validation fails.



**\*\*409 Conflict\*\***



Returned when the supplied email address is already registered.



\---



**## GET&#x20;**\`/vendors\`



Returns a paginated list of vendors with optional filtering and sorting.



**### Endpoint**



\`\`\`http

GET http\://localhost:5000/api/v1/vendors

\`\`\`



**\*\*Access:\*\*** Authenticated with \`Settings -> manage_vendors\` permission



**### Query Parameters**



\| Parameter   | Required | Default     | Description                                                                       |

\| ----------- | -------- | ----------- | --------------------------------------------------------------------------------- |

\| \`search\`    | No       | G��         | Searches business name, name, email, contact number, mobile number and GST number |

\| \`city\`      | No       | G��         | Filters vendors by city                                                           |

\| \`state\`     | No       | G��         | Filters vendors by state                                                          |

\| \`status\`    | No       | G��         | Legacy filter supporting \`Active\` or \`Inactive\`                                   |

\| \`hasGst\`    | No       | G��         | \`true\` returns vendors with GST; \`false\` returns vendors without GST              |

\| \`page\`      | No       | \`1\`         | Page number                                                                       |

\| \`limit\`     | No       | \`100\`       | Number of records per page                                                        |

\| \`sortBy\`    | No       | \`createdAt\` | Field used for sorting                                                            |

\| \`sortOrder\` | No       | \`desc\`      | Sort direction: \`asc\` or \`desc\`                                                   |



**### Example**



\`\`\`http

GET http\://localhost:5000/api/v1/vendors?search=electronics&city=Pune&hasGst=true&page=1&limit=10&sortBy=businessName&sortOrder=asc

\`\`\`



**### Successful Response**



**\*\*200 OK\*\***



\`\`\`json

{

  "success": true,

  "data": [

    {

      "\_id": "VENDOR_ID",

      "businessName": "ABC Electronics",

      "contactNumber": "02012345678",

      "name": "Amit Sharma",

      "mobile": "9876543210",

      "email": "vendor\@example.com",

      "gstNumber": "27ABCDE1234F1Z5",

      "panNumber": "ABCDE1234F",

      "address1": "Main Market",

      "address2": "Shop No. 12",

      "city": "Pune",

      "state": "Maharashtra",

      "logo": "uploads/vendors/vendor-IMAGE_FILE.png",

      "createdAt": "2026-09-22T04:33:39.142Z",

      "updatedAt": "2026-09-22T04:33:39.142Z"

    }

  ],

  "pagination": {

    "currentPage": 1,

    "totalPages": 1,

    "totalVendors": 1,

    "hasNextPage": false,

    "hasPrevPage": false

  }

}

\`\`\`



\---



**## GET&#x20;**\`/vendors/:id\`



Returns a vendor by its MongoDB ID.



**### Endpoint**



\`\`\`http

GET http\://localhost:5000/api/v1/vendors/VENDOR_ID

\`\`\`



**\*\*Access:\*\*** Authenticated with \`Settings -> manage_vendors\` permission



**### Successful Response**



**\*\*200 OK\*\***



\`\`\`json

{

  "success": true,

  "data": {

    "\_id": "VENDOR_ID",

    "businessName": "ABC Electronics",

    "contactNumber": "02012345678",

    "name": "Amit Sharma",

    "mobile": "9876543210",

    "email": "vendor\@example.com",

    "gstNumber": "27ABCDE1234F1Z5",

    "panNumber": "ABCDE1234F",

    "address1": "Main Market",

    "address2": "Shop No. 12",

    "city": "Pune",

    "state": "Maharashtra",

    "logo": "uploads/vendors/vendor-IMAGE_FILE.png",

    "createdAt": "2026-09-22T04:33:39.142Z",

    "updatedAt": "2026-09-22T04:33:39.142Z"

  }

}

\`\`\`



**### Errors**



**\*\*400 Bad Request\*\***



Returned when the supplied ID is invalid.



\`\`\`json

{

  "success": false,

  "message": "Invalid data format"

}

\`\`\`



**\*\*404 Not Found\*\***



Returned when the vendor does not exist.



\`\`\`json

{

  "success": false,

  "message": "Vendor not found."

}

\`\`\`



\---



**## PUT&#x20;**\`/vendors/:id\`



Updates an existing vendor.



**### Endpoint**



\`\`\`http

PUT http\://localhost:5000/api/v1/vendors/VENDOR_ID

\`\`\`



**\*\*Access:\*\*** Authenticated with \`Settings -> manage_vendors\` permission



**### Request**



Use \`multipart/form-data\` when uploading a new logo.



All vendor fields are optional during an update.



The accepted fields are the same as \`POST /vendors\`.



If no new logo is supplied, the existing logo is preserved.



If a new logo is supplied, the previous logo is removed after the

database update succeeds.



**### Example**



\`\`\`text

businessName = ABC Electronics Updated

contactNumber = 02012345679

name = Amit Sharma

mobile = 9876543211

email = vendor\@example.com

city = Pune

state = Maharashtra

logo = updated-vendor-logo.png

\`\`\`



**### Successful Response**



**\*\*200 OK\*\***



\`\`\`json

{

  "success": true,

  "message": "Vendor updated successfully.",

  "data": {

    "\_id": "VENDOR_ID",

    "businessName": "ABC Electronics Updated",

    "contactNumber": "02012345679",

    "name": "Amit Sharma",

    "mobile": "9876543211",

    "email": "vendor\@example.com",

    "gstNumber": "27ABCDE1234F1Z5",

    "panNumber": "ABCDE1234F",

    "address1": "Main Market",

    "address2": "Shop No. 12",

    "city": "Pune",

    "state": "Maharashtra",

    "logo": "uploads/vendors/vendor-NEW_IMAGE_FILE.png",

    "createdAt": "2026-09-22T04:33:39.142Z",

    "updatedAt": "2026-09-22T05:10:12.426Z"

  }

}

\`\`\`



**### Errors**



**\*\*400 Bad Request\*\***



Returned when the supplied ID or vendor data is invalid.



**\*\*404 Not Found\*\***



Returned when the vendor does not exist.



**\*\*409 Conflict\*\***



Returned when the updated email address is already registered.



\---



**## DELETE&#x20;**\`/vendors/:id\`



Deletes an existing vendor and its associated logo file.



**### Endpoint**



\`\`\`http

DELETE http\://localhost:5000/api/v1/vendors/VENDOR_ID

\`\`\`



**\*\*Access:\*\*** Authenticated with \`Settings -> manage_vendors\` permission



**### Successful Response**



**\*\*200 OK\*\***



\`\`\`json

{

  "success": true,

  "message": "Vendor deleted successfully."

}

\`\`\`



**### Errors**



**\*\*400 Bad Request\*\***



Returned when the supplied ID is invalid.



**\*\*404 Not Found\*\***



Returned when the vendor does not exist.



Warehouse APIs



Base URL: http\://localhost:5000/api/v1



Warehouse management uses the existing Center permission module.



Permission Module



Center



Create / Update / Delete: manage_all_center



Read: view_all_center



Create Warehouse



POST /warehouses



Request Body



{ "resellerId": "RESELLER_ID", "areaId": "AREA_ID", "warehouseName":

"TestWarehouse", "warehouseCode": "WH-001", "email":

"\<warehouse\@test.com>", "mobile": "9876543210", "status": "Enable",

"addressLine1": "TestAddress", "addressLine2": "", "city": "Nashik",

"state": "Maharashtra", "stockVerified": "" }



API Test



Status: Tested successfully.



Get All Warehouses



GET /warehouses



API Test



Status: Tested successfully.



Get Warehouse By ID



GET /warehouses/Id:



API Test



Status: Tested successfully.



Update Warehouse



PUT /warehouses/Id:



API Test



Status: Tested successfully.



Delete Warehouse



DELETE /warehouses/Id:



API Test



Status: Tested successfully.



Warehouse Fields Tested



reseller



area



warehouseName



warehouseCode



email



mobile



status



addressLine1



addressLine2



city



state



stockVerified



createdAt



updatedAt



Center-Warehouse Relationship



The Center API supports an optional warehouse field.



A Center can be created without a Warehouse ID.



A Center can also be created with a Warehouse ID.



Multiple Centers can reference the same Warehouse.



Example:



Warehouse ├── Center 1 ├── Center 2 ├── Center 3 └── Center 4



Warehouse ID used during API testing:



6aba30402aa35bb478e4d340



The Center-with-Warehouse create API was tested successfully with this

Warehouse ID.



**### Get Login History**



Retrieves login history records.



**\*\*Endpoint:\*\***



\`\`\`\`http

GET /api/v1/auth/login-history



\
# Stock Purchase APIs

## Overview

Stock Purchase manages purchase records and the stock created from those purchases.

**Base URL:** `http://localhost:5000/api/v1`  
**Resource:** `/stockpurchase`

### Permission Matrix

| Operation | Permission |
|---|---|
| Create purchase | `Purchase -> add_purchase_stock` |
| List / view purchases | `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock` |
| Product stock lookup | `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock` |
| Vendor purchase lookup | `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock` |
| Outlet stock summary | `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock` |
| Outlet serial lookup | `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock` |

All endpoints require authentication. Validation is applied where defined by the route.

## Endpoint Summary

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/stockpurchase` | Create a stock purchase |
| GET | `/stockpurchase` | List stock purchases |
| GET | `/stockpurchase/products/with-stock` | Get products with stock |
| GET | `/stockpurchase/stock/available/:productId` | Get available stock for a product |
| GET | `/stockpurchase/:id` | Get purchase by ID |
| PUT | `/stockpurchase/:id` | Update a stock purchase |
| DELETE | `/stockpurchase/:id` | Delete a stock purchase |
| GET | `/stockpurchase/vendor/:vendorId` | Get purchases by vendor |
| GET | `/stockpurchase/stock/outlet-summary` | Get outlet stock summary |
| GET | `/stockpurchase/serial-numbers/product/:outletId/:productId` | Get outlet serial numbers |
| PUT | `/stockpurchase/serial-numbers/product/:productId/serial/:serialNumber` | Update an outlet serial number |
| DELETE | `/stockpurchase/serial-numbers/product/:productId/serial/:serialNumber` | Delete an outlet serial number |

## POST `/stockpurchase`

Creates a Stock Purchase.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stockpurchase
```

### Request Body

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | Yes | String | `new` or `refurbish` |
| `date` | No | ISO date | Purchase date |
| `invoiceNo` | Yes | String | Purchase invoice number |
| `vendor` | Yes | ObjectId | Vendor ID |
| `outlet` | No | ObjectId | Outlet/Center ID |
| `transportAmount` | No | Number | Transport amount, minimum 0 |
| `remark` | No | String | Purchase remark |
| `cgst` | No | Number | CGST, minimum 0 |
| `sgst` | No | Number | SGST, minimum 0 |
| `igst` | No | Number | IGST, minimum 0 |
| `products` | Yes | Array | At least one purchased product |
| `products[].product` | Yes | ObjectId | Product ID |
| `products[].price` | Yes | Number | Product purchase price |
| `products[].purchasedQuantity` | Yes | Integer | Quantity, minimum 1 |
| `products[].serialNumbers` | No | Array[String] | Serial numbers for serialized products |

### Access

Authenticated with `Purchase -> add_purchase_stock`.

## GET `/stockpurchase`

Returns stock purchases accessible to the authenticated user.

### Query Parameters

| Parameter | Required | Description |
|---|---|---|
| Pagination/filter parameters | No | Validated by `getStockPurchasesValidator` |

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## GET `/stockpurchase/products/with-stock`

Returns products with stock information.

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## GET `/stockpurchase/stock/available/:productId`

Returns available stock for the specified product.

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## GET `/stockpurchase/:id`

Returns a Stock Purchase by MongoDB ID.

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## PUT `/stockpurchase/:id`

Updates an existing Stock Purchase.

**Access:** Authenticated.

The request is validated by `updateStockPurchaseValidator`.

## DELETE `/stockpurchase/:id`

Deletes an existing Stock Purchase.

**Access:** Authenticated.

The request is validated by `stockPurchaseIdValidator`.

## GET `/stockpurchase/vendor/:vendorId`

Returns Stock Purchases associated with a vendor.

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## GET `/stockpurchase/stock/outlet-summary`

Returns the outlet stock summary used by the purchase/stock workflow.

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## GET `/stockpurchase/serial-numbers/product/:outletId/:productId`

Returns serial numbers for a product at an outlet.

**Access:** `Purchase -> view_own_purchase_stock` or `view_all_purchase_stock`

## PUT `/stockpurchase/serial-numbers/product/:productId/serial/:serialNumber`

Updates an outlet product serial number.

**Access:** Authenticated.

## DELETE `/stockpurchase/serial-numbers/product/:productId/serial/:serialNumber`

Deletes an outlet product serial number.

**Access:** Authenticated.

---

# Stock Request APIs

## Overview

Stock Request manages stock indents from Centers through approval, shipping, completion, incomplete completion, challan approval and stock-transfer-related workflows.

**Base URL:** `http://localhost:5000/api/v1`  
**Resource:** `/stockrequest`

The route module uses the `Indent` permission module.

## Permission Matrix

| Operation | Permission(s) |
|---|---|
| Create / Update | `manage_indent` |
| List / View | `indent_all_center`, `indent_own_center` |
| Delete | `delete_indent_own_center`, `delete_indent_all_center` |
| Approve | `stock_transfer_approve_from_outlet`, `manage_indent` |
| Ship | `manage_indent` |
| Complete | `complete_indent`, `manage_indent` |
| Complete incomplete | `manage_indent` |
| Shipping info | `manage_indent` |
| Reject shipment | `manage_indent` |
| Mark incomplete | `manage_indent` |
| Approved quantities | `manage_indent` |
| Warehouse challan approval | `manage_indent` |
| Center challan approval | `manage_indent` |
| Status update | `manage_indent` |
| Excel export | `indent_all_center`, `indent_own_center` |
| Serial-number lookup | `indent_all_center`, `indent_own_center` |
| Count / notifications | Authenticated |

## Endpoint Summary

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/stockrequest` | Create a Stock Request |
| GET | `/stockrequest` | List Stock Requests |
| GET | `/stockrequest/export-excel` | Export Stock Requests to Excel |
| GET | `/stockrequest/indent-count` | Get Stock Request count |
| GET | `/stockrequest/recent-order-number` | Get most recent order number |
| GET | `/stockrequest/notifications` | Get Stock Request notifications |
| POST | `/stockrequest/bulk-upload` | Bulk upload Stock Requests |
| GET | `/stockrequest/download/sample` | Download Stock Request sample CSV |
| GET | `/stockrequest/serial-numbers/product/:productId` | Get Center serial numbers for a product |
| GET | `/stockrequest/:id` | Get Stock Request by ID |
| PUT | `/stockrequest/:id` | Update Stock Request |
| DELETE | `/stockrequest/:id` | Delete Stock Request |
| POST | `/stockrequest/:id/approve` | Approve Stock Request |
| POST | `/stockrequest/:id/ship` | Ship Stock Request |
| POST | `/stockrequest/:id/complete` | Complete Stock Request |
| PATCH | `/stockrequest/:id/complete-incomplete` | Complete an incomplete Stock Request |
| PATCH | `/stockrequest/:id/shipping-info` | Update shipping information |
| POST | `/stockrequest/:id/reject-shipment` | Reject shipment |
| POST | `/stockrequest/:id/mark-incomplete` | Mark Stock Request incomplete |
| PATCH | `/stockrequest/:id/approved-quantities` | Update approved quantities |
| PATCH | `/stockrequest/:id/warehouse-challan-approval` | Update warehouse challan approval |
| PATCH | `/stockrequest/:id/center-challan-approval` | Update center challan approval |
| PATCH | `/stockrequest/:id/status` | Update Stock Request status |

## POST `/stockrequest`

Creates a Stock Request.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stockrequest
```

### Request Body

| Field | Required | Type | Description |
|---|---|---|---|
| `warehouse` | Yes | ObjectId | Warehouse ID |
| `center` | Yes | ObjectId | Center ID |
| `orderNumber` | Yes | String | Stock Request order number |
| `date` | No | ISO date | Request date |
| `remark` | No | String | Request remark |
| `products` | Yes | Array | At least one product |
| `products[].product` | Yes | ObjectId | Product ID |
| `products[].quantity` | Yes | Integer | Requested quantity, minimum 1 |

## GET `/stockrequest`

Returns Stock Requests accessible to the authenticated user.

### Query Parameters

| Parameter | Required | Description |
|---|---|---|
| `page` | No | Page number, minimum 1 |
| `limit` | No | Page size, 1–500 |
| `center` | No | Center ID |
| `warehouse` | No | Warehouse ID |
| Additional filters | No | Supported by `validateStockRequestQuery` |

**Access:** `Indent -> indent_all_center` or `indent_own_center`

## GET `/stockrequest/export-excel`

Exports Stock Requests to Excel.

**Access:** `Indent -> indent_all_center` or `indent_own_center`

## GET `/stockrequest/indent-count`

Returns the Stock Request count.

**Access:** Authenticated.

## GET `/stockrequest/recent-order-number`

Returns the most recent Stock Request order number.

**Access:** `Indent -> indent_all_center` or `indent_own_center`

## GET `/stockrequest/notifications`

Returns Stock Request notifications.

**Access:** Authenticated.

## POST `/stockrequest/bulk-upload`

Bulk uploads Stock Requests using a file upload.

**Content-Type:** `multipart/form-data`

| Field | Required | Type | Description |
|---|---|---|---|
| `file` | Yes | File | Stock Request bulk-upload file |

**Access:** Authenticated.

## GET `/stockrequest/download/sample`

Downloads the Stock Request sample CSV.

## GET `/stockrequest/serial-numbers/product/:productId`

Returns available Center serial numbers for a product.

**Access:** `Indent -> indent_all_center` or `indent_own_center`

## GET `/stockrequest/:id`

Returns a Stock Request by MongoDB ID.

**Access:** `Indent -> indent_all_center` or `indent_own_center`

## PUT `/stockrequest/:id`

Updates a Stock Request.

**Access:** `Indent -> manage_indent`

## DELETE `/stockrequest/:id`

Deletes a Stock Request.

**Access:** `Indent -> delete_indent_own_center` or `delete_indent_all_center`

## POST `/stockrequest/:id/approve`

Approves a Stock Request.

**Access:** `Indent -> stock_transfer_approve_from_outlet` or `manage_indent`

## POST `/stockrequest/:id/ship`

Ships a Stock Request.

**Access:** `Indent -> manage_indent`

## POST `/stockrequest/:id/complete`

Completes a Stock Request.

**Access:** `Indent -> complete_indent` or `manage_indent`

## PATCH `/stockrequest/:id/complete-incomplete`

Completes an incomplete Stock Request.

**Access:** `Indent -> manage_indent`

## PATCH `/stockrequest/:id/shipping-info`

Updates shipping information.

**Access:** `Indent -> manage_indent`

## POST `/stockrequest/:id/reject-shipment`

Rejects shipment information.

**Access:** `Indent -> manage_indent`

## POST `/stockrequest/:id/mark-incomplete`

Marks a Stock Request incomplete.

**Access:** `Indent -> manage_indent`

## PATCH `/stockrequest/:id/approved-quantities`

Updates approved quantities and related approval information.

**Access:** `Indent -> manage_indent`

## PATCH `/stockrequest/:id/warehouse-challan-approval`

Updates warehouse challan approval information.

**Access:** `Indent -> manage_indent`

## PATCH `/stockrequest/:id/center-challan-approval`

Updates center challan approval information.

**Access:** `Indent -> manage_indent`

## PATCH `/stockrequest/:id/status`

Updates the Stock Request status.

**Access:** `Indent -> manage_indent`

## Stock Request Workflow

```text
Draft / Created
      ↓
   Approved
      ↓
    Shipped
      ↓
  Completed

Incomplete workflow:

Shipped
   ↓
Mark Incomplete
   ↓
Complete Incomplete
```

The Stock Request route layer also exposes approved-quantity, shipping, challan, status, serial-number, notification, count, Excel export and bulk-upload functionality.

---

# Stock Transfer APIs



\## Overview



Stock Transfer manages inventory movement between Centers through the existing legacy transfer workflow.



\*\*Base URL:\*\* \`http\://localhost:5000/api/v1\`

\*\*Resource:\*\* \`/stock-transfers\`



All Stock Transfer endpoints require authentication and use the existing database-driven \`Transfer\` permission module.



\## Permission Matrix



\| Operation | Permission(s) |

\|---|---|

\| Create / Update / Submit / Ship / Complete | \`manage_stock_transfer_own_center\`, \`manage_stock_transfer_all_center\` |

\| List / View | \`stock_transfer_own_center\`, \`stock_transfer_all_center\` |

\| Delete | \`delete_transfer_own_center\`, \`delete_transfer_all_center\` |

\| Confirm | \`manage_stock_transfer_own_center\`, \`manage_stock_transfer_all_center\`, \`approval_transfer_center\` |

\| Admin pending approval | \`indent_all_center\`, \`indent_own_center\` |



\## Status Flow



\| Current Status | Supported Next Status |

\|---|---|

\| \`Draft\` | \`Submitted\` |

\| \`Submitted\` | \`Admin_Approved\`, \`Admin_Rejected\` |

\| \`Admin_Approved\` | \`Confirmed\`, \`Rejected\` |

\| \`Admin_Rejected\` | — |

\| \`Confirmed\` | \`Shipped\`, \`Incompleted\`, \`Rejected\` |

\| \`Shipped\` | \`Completed\`, \`Incompleted\`, \`Confirmed\`, \`Rejected\` |

\| \`Incompleted\` | \`Confirmed\`, \`Shipped\`, \`Completed\` |

\| \`Completed\` | — |

\| \`Rejected\` | — |



\`\`\`text

Draft

  ↓

Submitted

  ↓

Admin_Approved / Admin_Rejected

  ↓

Confirmed

  ↓

Shipped

  ↓

Completed / Incompleted

\`\`\`\`



**## Endpoint Summary**



\| Method | Endpoint                                   | Purpose                             |

\| ------ | ------------------------------------------ | ----------------------------------- |

\| POST   | \`/stock-transfers\`                         | Create a Stock Transfer             |

\| GET    | \`/stock-transfers\`                         | List Stock Transfers                |

\| GET    | \`/stock-transfers/latest-transfer-number\`  | Get the most recent transfer number |

\| GET    | \`/stock-transfers/summary/original-outlet\` | Get warehouse/product summary       |

\| GET    | \`/stock-transfers/stats\`                   | Get transfer statistics             |

\| GET    | \`/stock-transfers/:id\`                     | Get a transfer by ID                |

\| PUT    | \`/stock-transfers/:id\`                     | Update a transfer                   |

\| DELETE | \`/stock-transfers/:id\`                     | Delete a transfer                   |

\| POST   | \`/stock-transfers/:id/submit\`              | Submit a Draft transfer             |

\| POST   | \`/stock-transfers/:id/approve\`             | Confirm a transfer                  |

\| POST   | \`/stock-transfers/:id/reject\`              | Reject a transfer                   |

\| PATCH  | \`/stock-transfers/:id/admin/approve\`       | Admin approve                       |

\| PATCH  | \`/stock-transfers/:id/admin/reject\`        | Admin reject                        |

\| POST   | \`/stock-transfers/:id/ship\`                | Ship a confirmed transfer           |

\| PATCH  | \`/stock-transfers/:id/shipping-info\`       | Update shipping information         |

\| PATCH  | \`/stock-transfers/:id/reject-shipment\`     | Reject shipment                     |

\| POST   | \`/stock-transfers/:id/complete\`            | Complete a shipped transfer         |

\| POST   | \`/stock-transfers/:id/mark-incomplete\`     | Mark a transfer incomplete          |

\| PATCH  | \`/stock-transfers/:id/complete-incomplete\` | Complete an incomplete transfer     |

\| PATCH  | \`/stock-transfers/:id/approved-quantities\` | Update approved quantities          |

\| GET    | \`/stock-transfers/admin/pending-approval\`  | Get pending admin approvals         |



**## Common Transfer Fields**



\| Field              | Description                                     |

\| ------------------ | ----------------------------------------------- |

\| \`\_id\`              | MongoDB Stock Transfer ID                       |

\| \`fromCenter\`       | Source Center                                   |

\| \`toCenter\`         | Destination Center                              |

\| \`date\`             | Transfer date                                   |

\| \`transferNumber\`   | Unique transfer number                          |

\| \`remark\`           | Transfer remark                                 |

\| \`products\`         | Products included in the transfer               |

\| \`status\`           | Current transfer status                         |

\| \`adminApproval\`    | Administrator approval information              |

\| \`stockStatus\`      | Source deduction and destination addition state |

\| \`centerApproval\`   | Center approval/rejection information           |

\| \`shippingInfo\`     | Shipment information                            |

\| \`shipmentRejected\` | Shipment rejection information                  |

\| \`receivingInfo\`    | Receiving information                           |

\| \`completionInfo\`   | Completion/incomplete information               |

\| \`challanDocument\`  | Challan document reference                      |

\| \`createdBy\`        | Creating user                                   |

\| \`updatedBy\`        | Last updating user                              |

\| \`createdAt\`        | Creation timestamp                              |

\| \`updatedAt\`        | Last update timestamp                           |

\| \`lastStatusChange\` | Last status transition timestamp                |



**## POST&#x20;**\`/stock-transfers\`



Creates a new Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**### Request Body**



\| Field            | Required | Description                                                                                  |

\| ---------------- | -------- | -------------------------------------------------------------------------------------------- |

\| \`fromCenter\`     | Yes      | Source Center ID                                                                             |

\| \`toCenter\`       | Derived  | Destination Center is determined from the authenticated user's Center in the legacy workflow |

\| \`date\`           | No       | Transfer date                                                                                |

\| \`transferNumber\` | Yes      | Unique transfer number                                                                       |

\| \`remark\`         | No       | Transfer remark                                                                              |

\| \`products\`       | Yes      | Products included in the transfer                                                            |



**### Product Fields**



\| Field              | Required | Description                               |

\| ------------------ | -------- | ----------------------------------------- |

\| \`product\`          | Yes      | Product ID                                |

\| \`quantity\`         | Yes      | Requested quantity                        |

\| \`approvedSerials\`  | No       | Approved serial numbers                   |

\| \`serialNumbers\`    | No       | Transfer serial numbers                   |

\| \`approvedQuantity\` | No       | Approved quantity                         |

\| \`approvedRemark\`   | No       | Approval remark                           |

\| \`receivedQuantity\` | No       | Quantity actually received/used           |

\| \`receivedSerials\`  | No       | Serial numbers actually received/used     |

\| \`receivedRemark\`   | No       | Receiving remark                          |

\| \`productInStock\`   | No       | Stock quantity captured during validation |

\| \`productRemark\`    | No       | Product-level remark                      |



**### Example**



\`\`\`json

{

  "fromCenter": "SOURCE_CENTER_ID",

  "date": "2026-10-01",

  "transferNumber": "ST-OPTION-A-002",

  "remark": "Office stock transfer",

  "products": [

    {

      "product": "PRODUCT_ID",

      "quantity": 2

    }

  ]

}

\`\`\`



**### Important Rules**



\- \`transferNumber\` must be unique.

\- Source and destination Centers cannot be the same.

\- The authenticated user must have Center information for creation.

\- Submitted transfers validate source stock availability.



**## GET&#x20;**\`/stock-transfers\`



Returns Stock Transfers accessible to the authenticated user.



**\*\*Endpoint\*\***



\`\`\`http

GET http\://localhost:5000/api/v1/stock-transfers

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer view permission.



**### Query Parameters**



\| Parameter               | Required | Description                                                       |

\| ----------------------- | -------- | ----------------------------------------------------------------- |

\| \`page\`                  | No       | Page number                                                       |

\| \`limit\`                 | No       | Number of records per page                                        |

\| \`status\`                | No       | Filter by transfer status                                         |

\| Other supported filters | No       | Additional filters accepted by the Stock Transfer query validator |



**### Empty Response**



\`\`\`json

{

  "success": true,

  "message": "No stock transfers found",

  "data": [],

  "pagination": {

    "currentPage": 0,

    "totalPages": 0,

    "totalItems": 0,

    "itemsPerPage": 100

  },

  "filters": {

    "status": {},

    "total": 0

  },

  "status": {}

}

\`\`\`



**## GET&#x20;**\`/stock-transfers/:id\`



Returns a Stock Transfer by MongoDB ID.



**\*\*Endpoint\*\***



\`\`\`http

GET http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer view permission.



\| Status | Description              |

\| ------ | ------------------------ |

\| 400    | Invalid transfer ID      |

\| 404    | Stock Transfer not found |



**## PUT&#x20;**\`/stock-transfers/:id\`



Updates an existing Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

PUT http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**## DELETE&#x20;**\`/stock-transfers/:id\`



Deletes an existing Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

DELETE http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID

\`\`\`



**\*\*Access:\*\*** Authenticated with delete Stock Transfer permission.



**## POST&#x20;**\`/stock-transfers/:id/submit\`



Submits a Draft Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/submit

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**\*\*State transition:\*\*** \`Draft → Submitted\`



The submission validates source stock availability and serialized stock

when applicable.



**## PATCH&#x20;**\`/stock-transfers/:id/admin/approve\`



Approves a submitted Stock Transfer as administrator.



**\*\*Endpoint\*\***



\`\`\`http

PATCH http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/admin/approve

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**\*\*State transition:\*\*** \`Submitted → Admin_Approved\`



**## PATCH&#x20;**\`/stock-transfers/:id/admin/reject\`



Rejects a submitted Stock Transfer as administrator.



**\*\*Endpoint\*\***



\`\`\`http

PATCH http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/admin/reject

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**\*\*State transition:\*\*** \`Submitted → Admin_Rejected\`



**## POST&#x20;**\`/stock-transfers/:id/approve\`



Confirms an administrator-approved Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/approve

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission or

\`approval_transfer_center\`.



**### Request Body**



\`\`\`json

{

  "productApprovals": [

    {

      "productId": "PRODUCT_ID",

      "approvedQuantity": 2,

      "approvedSerials": [],

      "approvedRemark": ""

    }

  ]

}

\`\`\`



**\*\*State transition:\*\*** \`Admin_Approved → Confirmed\`



For non-serialized stock, approved quantity is reserved by moving

quantity from available stock to in-transit stock. Serialized stock is

validated and updated accordingly.



**## POST&#x20;**\`/stock-transfers/:id/reject\`



Rejects a Stock Transfer according to the current workflow state.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/reject

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**## POST&#x20;**\`/stock-transfers/:id/ship\`



Ships a confirmed Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/ship

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**### Request Body**



The current shipping validator requires \`shippedDate\`.



\`\`\`json

{

  "shippedDate": "2026-10-01"

}

\`\`\`



**\*\*State transition:\*\*** \`Confirmed → Shipped\`



**## PATCH&#x20;**\`/stock-transfers/:id/shipping-info\`



Updates shipping information.



**\*\*Endpoint\*\***



\`\`\`http

PATCH http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/shipping-info

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**## PATCH&#x20;**\`/stock-transfers/:id/reject-shipment\`



Rejects shipment information.



**\*\*Endpoint\*\***



\`\`\`http

PATCH http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/reject-shipment

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**## POST&#x20;**\`/stock-transfers/:id/complete\`



Completes a shipped Stock Transfer.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/complete

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**\*\*State transition:\*\*** \`Shipped → Completed\`



**### Request Body**



\`productReceipts\` is optional. When provided, it records the quantity and

serial numbers actually received/used at the destination.



\`\`\`json

{

  "productReceipts": [

    {

      "productId": "PRODUCT_ID",

      "receivedQuantity": 10,

      "receivedSerials": ["SERIAL-001", "SERIAL-002"],

      "receivedRemark": "Partial quantity received"

    }

  ]

}

\`\`\`



**### Product Receipt Fields**



\| Field                                | Required                      | Type          | Description                                                    |

\| ------------------------------------ | ----------------------------- | ------------- | -------------------------------------------------------------- |

\| \`productReceipts\`                    | No                            | Array         | Product receipt details                                        |

\| \`productReceipts[].productId\`        | Yes, when receipt is provided | ObjectId      | Product ID from the transfer                                   |

\| \`productReceipts[].receivedQuantity\` | Yes, when receipt is provided | Integer       | Actual quantity received/used; cannot exceed approved quantity |

\| \`productReceipts[].receivedSerials\`  | No                            | Array[String] | Serial numbers actually received/used for serialized products  |

\| \`productReceipts[].receivedRemark\`   | No                            | String        | Receiving remark                                               |



**### Partial Receipt / Return Rule**



The actual received quantity can be less than the approved quantity.



\`\`\`text

Return Quantity = Approved Quantity - Received Quantity

\`\`\`



Example:



\| Product | Approved | Received / Used | Returned to Source |

\| ------- | -------: | --------------: | -----------------: |

\| P1      |       15 |              10 |                  5 |

\| P2      |       20 |              15 |                  5 |



For non-serialized products:



\| Stock Field                     | Completion Movement             |

\| ------------------------------- | ------------------------------- |

\| Source \`inTransitQuantity\`      | Decrease by approved quantity   |

\| Source \`totalQuantity\`          | Decrease by received quantity   |

\| Source \`availableQuantity\`      | Increase by approved - received |

\| Destination \`totalQuantity\`     | Increase by received quantity   |

\| Destination \`availableQuantity\` | Increase by received quantity   |



For serialized products:



\- \`receivedSerials\` must belong to the approved serial numbers.

\- Received serials are transferred to the destination.

\- Approved serials that were not received are returned to the source and

  become available there.

\- Source in-transit quantity is reduced by the full approved quantity.

\- Source total quantity is reduced only by the actually received quantity.

\- Destination stock is increased only by the actually received quantity.



If \`productReceipts\` is omitted, the existing legacy completion behavior

uses each product's approved quantity as its received quantity.



Completion performs pending source deduction and destination stock

addition when those operations have not already been completed.



**## POST&#x20;**\`/stock-transfers/:id/mark-incomplete\`



Marks a transfer incomplete.



**\*\*Endpoint\*\***



\`\`\`http

POST http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/mark-incomplete

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**\*\*State transition:\*\*** \`Shipped / Confirmed → Incompleted\`



**## PATCH&#x20;**\`/stock-transfers/:id/complete-incomplete\`



Completes an incomplete transfer.



**\*\*Endpoint\*\***



\`\`\`http

PATCH http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/complete-incomplete

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**## PATCH&#x20;**\`/stock-transfers/:id/approved-quantities\`



Updates approved quantities and related approval information.



**\*\*Endpoint\*\***



\`\`\`http

PATCH http\://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/approved-quantities

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer management permission.



**### Request Body**



\`\`\`json

{

  "productApprovals": [

    {

      "productId": "PRODUCT_ID",

      "approvedQuantity": 15,

      "approvedRemark": "Approved partial quantity"

    }

  ]

}

\`\`\`



**### Product Approval Fields**



\| Field                                 | Required | Type     | Description                             |

\| ------------------------------------- | -------- | -------- | --------------------------------------- |

\| \`productApprovals\`                    | Yes      | Array    | Non-empty array of product approvals    |

\| \`productApprovals[].productId\`        | Yes      | ObjectId | Product ID from the transfer            |

\| \`productApprovals[].approvedQuantity\` | Yes      | Integer  | Approved quantity; non-negative integer |

\| \`productApprovals[].approvedRemark\`   | No       | String   | Approval remark                         |



Approved quantities determine the quantity reserved during confirmation.

For serialized products, the approved serial numbers associated with the

transfer are used during the confirmation workflow.



**## GET&#x20;**\`/stock-transfers/admin/pending-approval\`



Returns Stock Transfers pending administrator approval.



**\*\*Endpoint\*\***



\`\`\`http

GET http\://localhost:5000/api/v1/stock-transfers/admin/pending-approval

\`\`\`



**\*\*Access:\*\*** Authenticated with \`indent_all_center\` or

\`indent_own_center\`.



**## GET&#x20;**\`/stock-transfers/latest-transfer-number\`



Returns the most recent transfer number.



**\*\*Endpoint\*\***



\`\`\`http

GET http\://localhost:5000/api/v1/stock-transfers/latest-transfer-number

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer view permission.



**## GET&#x20;**\`/stock-transfers/summary/original-outlet\`



Returns the warehouse/product summary used by the Stock Transfer

workflow.



**\*\*Endpoint\*\***



\`\`\`http

GET http\://localhost:5000/api/v1/stock-transfers/summary/original-outlet

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer view permission.



**## GET&#x20;**\`/stock-transfers/stats\`



Returns Stock Transfer statistics.



**\*\*Endpoint\*\***



\`\`\`http

GET http\://localhost:5000/api/v1/stock-transfers/stats

\`\`\`



**\*\*Access:\*\*** Authenticated with Stock Transfer view permission.



**## Stock Movement**



For non-serialized products:



\`\`\`text

Source available stock

        ↓

Confirm

        ↓

Source in-transit stock

        ↓

Complete

        ↓

Destination available stock

\`\`\`



For serialized products, serial status and current location are updated

as part of the transfer lifecycle.



**## Partial Approval and Partial Receipt**



Stock Transfer supports cases where the approved quantity is greater than

the quantity actually received/used at the destination.



\| Stage           | Quantity                                      |

\| --------------- | --------------------------------------------- |

\| Requested       | Original quantity requested in the transfer   |

\| Approved        | Quantity approved during confirmation         |

\| Received / Used | Quantity actually received at the destination |

\| Returned        | \`Approved - Received\`                         |



Example:



\`\`\`text

Requested: 20

Approved: 15

Received: 10

Returned to source: 5

\`\`\`



For serialized products, the same rule is applied at serial-number level:

received serials move to the destination, while approved but unreceived

serials return to the source as available stock.



**## Stock Transfer API Test Coverage**



\| Operation                     | Status   |

\| ----------------------------- | -------- |

\| Create Stock Transfer         | Tested   |

\| Get Stock Transfers           | Tested   |

\| Submit                        | Tested   |

\| Admin Approve                 | Tested   |

\| Confirm                       | Tested   |

\| Ship                          | Tested   |

\| Complete                      | Tested   |

\| Partial approval              | Tested   |

\| Partial receipt               | Tested   |

\| Serialized partial return     | Verified |

\| Non-serialized partial return | Verified |

\| Source stock deduction        | Verified |

\| Destination stock addition    | Verified |

\| Status progression            | Verified |



**### Tested Lifecycle**



\`\`\`text

Draft

  ↓

Submitted

  ↓

Admin_Approved

  ↓

Confirmed

  ↓

Shipped

  ↓

Completed

\`\`\`


CUSTOMER APIs

> **Base URL:** `/api/v1/customers`

### 🟢 Create Customer
**POST** `/api/v1/customers`

**Authorization:** 🔐 Required

**Permission:**
- `manage_customer_all_center`
- `manage_customer_own_center`

---

### 🔵 Get Customers
**GET** `/api/v1/customers`

**Authorization:** 🔐 Required

**Permission:**
- `view_customer_all_center`
- `view_customer_own_center`

**Query Parameters:**
- `page`
- `limit`
- `search`
- `center`
- `status`

---

### 🟣 Get Customer by ID
**GET** `/api/v1/customers/:id`

**Authorization:** 🔐 Required

---

### 🟡 Update Customer
**PUT** `/api/v1/customers/:id`

**Authorization:** 🔐 Required

**Permission:**
- `manage_customer_all_center`
- `manage_customer_own_center`

---

### 🔴 Delete Customer
**DELETE** `/api/v1/customers/:id`

**Authorization:** 🔐 Required

**Permission:**
- `manage_customer_all_center`
- `manage_customer_own_center`

---

### 🟠 Import Customers
**POST** `/api/v1/customers/import`

**Authorization:** 🔐 Required

**Content-Type:**
`multipart/form-data`

**File:**
`file` → CSV file

---

# BUILDING APIs

**Base URL:** `http://localhost:5000/api/v1/buildings`

All Building routes use `protect` and the `Settings` permission module.

## Permission Matrix

| Operation | Permission |
|---|---|
| Create / Update / Delete | `manage_building_all_center` or `manage_building_own_center` |
| List / Get by ID | `view_building_all_center` or `view_building_own_center` |

## Endpoint Summary

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/buildings` | Create a building |
| GET | `/buildings` | List buildings with filtering and pagination |
| GET | `/buildings/:id` | Get a building by ID |
| PUT | `/buildings/:id` | Update a building |
| DELETE | `/buildings/:id` | Delete a building |

## POST `/buildings`

Creates a building.

**Access:** Authenticated; requires `manage_building_all_center` or `manage_building_own_center`.

### Request body

| Field | Required | Description |
|---|---|---|
| `center` | Yes | Center MongoDB ID |
| `buildingName` | Yes | Building name |
| `displayName` | No | Display name |
| `address1` | Yes | Primary address |
| `address2` | No | Secondary address |
| `landmark` | No | Landmark |
| `pincode` | No | Six-digit pincode matching the model's pattern |

### Example

```json
{
  "center": "CENTER_ID",
  "buildingName": "Example Building",
  "displayName": "Example",
  "address1": "Main Road",
  "address2": "Near Market",
  "landmark": "Bus stop",
  "pincode": "422001"
}
```

Responses:
- `201 Created`: `{ "success": true, "data": BUILDING }`
- `400 Bad Request`: model/validation error
- `404 Not Found`: referenced Center not found
- `403 Forbidden`: permission or own-center scope denied

## GET `/buildings`

Returns a paginated list of buildings.

**Access:** Authenticated; requires `view_building_all_center` or `view_building_own_center`.

| Query parameter | Description |
|---|---|
| `search` | Searches building name, display name, address lines, landmark, and pincode |
| `center` | Center ID filter |
| `reseller` | Filters through the related Center's reseller |
| `area` | Filters through the related Center's area |
| `centerType` | Filters through the related Center's type |
| `status` | Filters through the related Center's status |
| `city` | Filters through the related Center's city |
| `state` | Filters through the related Center's state |
| `page` | Page number; defaults to `1` |
| `limit` | Page size; defaults to `100` |
| `sortBy` | Sort field; defaults to `createdAt` |
| `sortOrder` | `asc` or `desc`; defaults to `desc` |

Response shape includes `success`, `data`, and `pagination` with `currentPage`, `totalPages`, and `totalBuildings`.

## GET `/buildings/:id`

Returns a building by MongoDB ID.

**Access:** Authenticated; requires `view_building_all_center` or `view_building_own_center`.

Responses:
- `200 OK`: `{ "success": true, "data": BUILDING }`
- `404 Not Found`: building not found
- `403 Forbidden`: own-center user attempts to view a building belonging to another center

## PUT `/buildings/:id`

Updates a building.

**Access:** Authenticated; requires `manage_building_all_center` or `manage_building_own_center`.

Uses the request body as the update payload with model validators enabled. Accepted fields follow the Building model: `center`, `buildingName`, `displayName`, `address1`, `address2`, `landmark`, and `pincode`.

Responses include `200 OK` on success, `400 Bad Request` for model validation errors, `403 Forbidden` for permission/scope denial, and `404 Not Found` when the building does not exist.

## DELETE `/buildings/:id`

Deletes a building.

**Access:** Authenticated; requires `manage_building_all_center` or `manage_building_own_center`.

Responses:
- `200 OK`: `{ "success": true, "message": "Building deleted successfully" }`
- `403 Forbidden`: permission/scope denied
- `404 Not Found`: building not found



---

# Control Room APIs

The Control Room module is mounted under `/api/v1/control-rooms`.

## Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/v1/control-rooms` | Create a Control Room |
| GET | `/api/v1/control-rooms` | List Control Rooms |
| GET | `/api/v1/control-rooms/:id` | Get a Control Room by ID |
| PUT | `/api/v1/control-rooms/:id` | Update a Control Room |
| DELETE | `/api/v1/control-rooms/:id` | Delete a Control Room |

## Permissions

Control Room endpoints use the Settings module permissions:

- Create / Update / Delete:
  - `manage_control_room_own_center`
  - `manage_control_room_all_center`
- List / Get by ID:
  - `view_control_room_own_center`
  - `view_control_room_all_center`

Access is restricted according to the user's assigned center and permission scope.

## POST `/api/v1/control-rooms`

Creates a new Control Room.

## GET `/api/v1/control-rooms`

Returns Control Rooms accessible to the authenticated user.

Supports filtering, searching, pagination, and sorting.

## GET `/api/v1/control-rooms/:id`

Returns a Control Room by MongoDB ID.

## PUT `/api/v1/control-rooms/:id`

Updates an existing Control Room.

## DELETE `/api/v1/control-rooms/:id`

Deletes an existing Control Room.
---

Raise Purchase Order (Raise PO) APIs
Raise PO manages purchase orders, including creation, listing, approval, rejection, resetting a PO to pending, and deletion.
Base URL: http://localhost:5000/api/v1
Resource: /raise-pos
All Raise PO routes require authentication. Existing route names and field names are preserved.
Permission and Role Notes
This documentation's manual endpoint test results are based on the Admin login. Other roles are listed in the final testing note and are not presented as fully tested.
Operation	Permission / restriction
Create PO	Purchase -> add_purchase_stock
View own-center POs	Purchase -> view_own_purchase_stock
View all POs	Purchase -> view_all_purchase_stock
Approve PO	Admin / Superadmin only
Reject PO	Admin / Superadmin only
Change approved/rejected PO to pending	Current implementation restricts this to Admin / Superadmin
Delete PO	Center-access and stock conditions are enforced by the service


Endpoint Summary
Method	Endpoint	Purpose
POST	/raise-pos	Create a purchase order
GET	/raise-pos	List purchase orders
DELETE	/raise-pos/:id	Delete a purchase order
PUT	/raise-pos/:id/approve	Approve a pending purchase order
PUT	/raise-pos/:id/reject	Reject a pending purchase order
PATCH	/raise-pos/:id/change-to-pending	Change an approved/rejected PO back to pending


POST /raise-pos
Creates a purchase order. New POs start with pending status and a generated voucher number.
Endpoint
POST http://localhost:5000/api/v1/raise-pos
Access: Authenticated user with Purchase -> add_purchase_stock.
Request Body
{
  "date": "2026-10-10",
  "vendor": "VENDOR_ID",
  "outlet": "CENTER_ID",
  "products": [
    {
      "product": "PRODUCT_ID",
      "price": 200,
      "purchasedQuantity": 2
    }
  ]
}
Field	Required	Type	Description
date	No	Date	Purchase order date
vendor	Yes	ObjectId	Vendor ID
outlet	Context-dependent	ObjectId	Outlet/Center ID; service may derive it from the authenticated user's center
products	Yes	Array	Products included in the PO
products[].product	Yes	ObjectId	Product ID
products[].price	Yes	Number	Purchase price
products[].purchasedQuantity	Yes	Number	Purchased quantity
products[].availableQuantity	Generated	Number	Initialized from purchasedQuantity


The voucher number is generated by the backend.
Successful Response
201 Created
{
  "success": true,
  "message": "Purchase Order created successfully and pending approval",
  "data": {
    "_id": "RAISE_PO_ID",
    "date": "2026-10-10T00:00:00.000Z",
    "voucherNo": "STELE/NN/26-27",
    "vendor": "VENDOR_ID",
    "outlet": "CENTER_ID",
    "products": [
      {
        "product": "PRODUCT_ID",
        "price": 200,
        "purchasedQuantity": 2,
        "availableQuantity": 2
      }
    ],
    "status": "pending",
    "createdBy": "USER_ID"
  }
}
The response may include populated vendor, outlet, product, and user objects.
Common Errors
HTTP status	Meaning
400 Bad Request	Invalid request data or ID
401 Unauthorized	Missing/invalid authentication
403 Forbidden	Required purchase permission is missing
409 Conflict	Duplicate/conflicting value where handled


GET /raise-pos
Returns purchase orders accessible to the authenticated user.
Endpoint
GET http://localhost:5000/api/v1/raise-pos
Access: Purchase -> view_own_purchase_stock or Purchase -> view_all_purchase_stock.
Query Parameters
Parameter	Required	Description
page	No	Page number; defaults to 1
limit	No	Page size; defaults to 100
search	No	Searches supported PO fields, including voucher number and referenced vendor/outlet/product fields where available
type	No	Filters by PO type if supported by the stored schema
vendor	No	Filters by vendor ID
outlet	No	Filters by outlet/Center ID
startDate	No	Start of date range
endDate	No	End of date range


Example:
GET http://localhost:5000/api/v1/raise-pos?page=1&limit=10&search=STELE&vendor=VENDOR_ID
Successful Response
200 OK
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [],
  "pagination": {
    "currentPage": 1,
    "totalPages": 0,
    "totalItems": 0,
    "itemsPerPage": 100
  }
}
When records exist, data contains matching POs. Responses may include populated vendor, outlet, product, createdBy, and approvedBy details. A no-record response uses No raise po found.
Users with own-center view permission are restricted to their associated center; all-center view permission permits broader results subject to supplied filters and service rules.
PUT /raise-pos/:id/approve
Approves a pending purchase order.
Endpoint
PUT http://localhost:5000/api/v1/raise-pos/RAISE_PO_ID/approve
Access: Admin / Superadmin only.
Request body: None required.
Successful Response
200 OK
{
  "success": true,
  "message": "Purchase Order approved successfully",
  "data": {
    "_id": "RAISE_PO_ID",
    "status": "approved"
  }
}
The returned PO may contain additional populated fields.
Expected Errors
HTTP status	Meaning
400 Bad Request	PO is not in pending status
403 Forbidden	Caller is not Admin / Superadmin
404 Not Found	PO does not exist
401 Unauthorized	Missing/invalid authentication


Stock note: Approval does not guarantee a stock-ledger update. The current service contains a note that stock integration is not implemented; verify that workflow separately.
PUT /raise-pos/:id/reject
Rejects a pending purchase order.
Endpoint
PUT http://localhost:5000/api/v1/raise-pos/RAISE_PO_ID/reject
Access: Admin / Superadmin only.
Request body: None required.
Successful Response
200 OK
{
  "success": true,
  "message": "Purchase Order rejected successfully",
  "data": {
    "_id": "RAISE_PO_ID",
    "status": "rejected"
  }
}
Expected Errors
HTTP status	Meaning
400 Bad Request	PO is not pending, including an already-approved PO
403 Forbidden	Caller is not Admin / Superadmin
404 Not Found	PO does not exist
401 Unauthorized	Missing/invalid authentication


During manual testing, attempting to reject an already-approved PO returned 400 Bad Request with PO is already approved, which is the expected status-conflict behavior.
PATCH /raise-pos/:id/change-to-pending
Changes an approved or rejected PO back to pending.
Endpoint
PATCH http://localhost:5000/api/v1/raise-pos/RAISE_PO_ID/change-to-pending
Access: Current implementation restricts this operation to Admin / Superadmin.
Request body: None required.
Successful Response
200 OK
{
  "success": true,
  "message": "Purchase Order status changed to pending successfully",
  "data": {
    "_id": "RAISE_PO_ID",
    "status": "pending"
  }
}
The service clears prior approval metadata when changing the status back to pending.
Expected Errors
HTTP status	Meaning
400 Bad Request	PO cannot be changed to pending from its current status
403 Forbidden	Caller is not permitted to perform this operation
404 Not Found	PO does not exist
401 Unauthorized	Missing/invalid authentication


DELETE /raise-pos/:id
Deletes a PO subject to center-access and stock checks.
Endpoint
DELETE http://localhost:5000/api/v1/raise-pos/RAISE_PO_ID
Access: Authenticated; center scope and stock conditions are enforced by the service.
Successful Response
200 OK
{
  "success": true,
  "message": "PO deleted successfully"
}
Expected Errors
HTTP status	Meaning
400 Bad Request	Invalid PO ID or deletion is blocked by a stock condition
403 Forbidden	User is not allowed to access the PO
404 Not Found	PO does not exist or is inaccessible under the service's access checks
401 Unauthorized	Missing/invalid authentication


Raise PO API Test Coverage
Admin Login — Manual Thunder Client Testing
The following test results were observed while testing with the Admin login.
Test	Observed result	Status
Create PO	PO created with pending status and generated voucher number	Tested
Get all POs	Request succeeded	Tested
Approve pending PO	200 OK	Tested
Reject pending PO	200 OK	Tested
Reject an already-approved PO	400 Bad Request, PO is already approved	Tested
Change rejected PO back to pending	200 OK	Tested
Response fields and populated data	Checked in the returned responses	Checked during manual testing


Other Roles — To Be Verified Separately
Only Admin-login testing is recorded above. Other roles have not been fully verified across every Raise PO endpoint.
The Area Manager create-PO attempt returned 403 Forbidden with Access denied. add_purchase_stock permission required. This is consistent with the supplied role-permission table, where Area Manager does not have add_purchase_stock.
The Area Manager list request returned 200 OK with an empty data array. This confirms the request response only; center-scope and data visibility must be verified using records associated with that user's center.
Important Implementation Notes
- Keep the existing route prefix /api/v1/raise-pos and all field names unchanged.
- 200 OK with an empty list does not alone verify data visibility or center scoping.
- Stock integration for PO approval/deletion should not be documented as supported until verified in the current implementation