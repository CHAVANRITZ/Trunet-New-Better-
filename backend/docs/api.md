Trunet API Documentation

Base URL

http://localhost:5000/api/v1

GET /health

Checks whether the Trunet backend API is running.

GET http://localhost:5000/api/v1/health

Authentication

POST /auth/login

Authenticates a Trunet user using their username or email and password.

Endpoint

POST http://localhost:5000/api/v1/auth/login

GET /auth/rbac-test

Verifies that authentication and permission-based authorization are
working correctly.

Endpoint

GET http://localhost:5000/api/v1/auth/rbac-test

POST /auth/refresh

Refreshes an authenticated session using a valid refresh token.

The endpoint uses refresh-token rotation. After a successful refresh,
the supplied refresh token is revoked and a new refresh token is issued.

Endpoint

POST http://localhost:5000/api/v1/auth/refresh

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

POST http://localhost:5000/api/v1/product-categories

Access: Authenticated

Request Body

{ "productCategory": "Electronics", "remark": "Electronic inventory
items" }

Successful Response

201 Created

{ "success": true, "message": "Product category created successfully.",
"data": { "\_id": "CATEGORY_ID", "productCategory": "Electronics",
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

GET http://localhost:5000/api/v1/product-categories

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
http://localhost:5000/api/v1/product-categories?search=electronics&page=1&limit=10&sortBy=createdAt&sortOrder=desc

Successful Response

200 OK

{ "success": true, "message": "Product categories retrieved
successfully.", "data": { "categories": \[ { "\_id": "CATEGORY_ID",
"productCategory": "Electronics", "remark": "Electronic inventory
items", "createdAt": "2026-09-16T11:09:12.999Z", "updatedAt":
"2026-09-16T11:09:12.999Z" } \], "pagination": { "currentPage": 1,
"totalPages": 1, "totalCategories": 1 } } }

GET /product-categories/:id

Returns a product category by its MongoDB ID.

Endpoint

GET http://localhost:5000/api/v1/product-categories/CATEGORY_ID

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Product category retrieved
successfully.", "data": { "\_id": "CATEGORY_ID", "productCategory":
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

PUT http://localhost:5000/api/v1/product-categories/CATEGORY_ID

Access: Authenticated

Request Body

{ "productCategory": "Updated Electronics", "remark": "Updated category
description" }

Successful Response

200 OK

{ "success": true, "message": "Product category updated successfully.",
"data": { "\_id": "CATEGORY_ID", "productCategory": "Updated
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

DELETE http://localhost:5000/api/v1/product-categories/CATEGORY_ID

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Product category deleted successfully.",
"data": { "\_id": "CATEGORY_ID", "productCategory": "Electronics",
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

POST http://localhost:5000/api/v1/products

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
"\_id": "PRODUCT_ID", "productCategory": { "\_id": "CATEGORY_ID",
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

GET http://localhost:5000/api/v1/products

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
http://localhost:5000/api/v1/products?search=router&status=Enable&page=1&limit=10&sortBy=salePrice&sortOrder=asc

Successful Response

200 OK

{ "success": true, "message": "Products retrieved successfully.",
"data": { "products": \[ { "\_id": "PRODUCT_ID", "productCategory": {
"\_id": "CATEGORY_ID", "productCategory": "Electronics", "remark":
"Electronic inventory items" }, "productTitle": "WiFi Router",
"productCode": "ROUTER001", "productPrice": 2500, "salePrice": 2100,
"hsnCode": "85176290", "productImage":
"uploads/products/product-IMAGE_FILE.png", "productWeight": "0.8kg",
"productBarcode": "123456789880123", "status": "Enable", "description":
"Wireless networking router", "trackSerialNumber": "Yes", "repairable":
"Yes", "replaceable": "Yes", "createdAt": "2026-09-18T04:33:39.142Z",
"updatedAt": "2026-09-18T04:33:39.142Z" } \], "pagination": {
"currentPage": 1, "totalPages": 1, "totalProducts": 1, "hasNextPage":
false, "hasPrevPage": false } } }

GET /products/all

Returns all products without pagination.

Endpoint

GET http://localhost:5000/api/v1/products/all

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
http://localhost:5000/api/v1/products/all?sortBy=productTitle&sortOrder=asc

Successful Response

200 OK

{ "success": true, "message": "Products retrieved successfully.",
"data": \[ { "\_id": "PRODUCT_ID", "productCategory": { "\_id":
"CATEGORY_ID", "productCategory": "Electronics", "remark": "Electronic
inventory items" }, "productTitle": "WiFi Router", "productCode":
"ROUTER001", "productPrice": 2500, "salePrice": 2100, "hsnCode":
"85176290", "productImage": "", "productWeight": "0.8kg",
"productBarcode": "123456789880123", "status": "Enable", "description":
"Wireless networking router", "trackSerialNumber": "Yes", "repairable":
"Yes", "replaceable": "Yes", "createdAt": "2026-09-18T04:33:39.142Z",
"updatedAt": "2026-09-18T04:33:39.142Z" } \] }

GET /products/:id

Returns a product by its MongoDB ID.

Endpoint

GET http://localhost:5000/api/v1/products/PRODUCT_ID

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Product retrieved successfully.", "data":
{ "\_id": "PRODUCT_ID", "productCategory": { "\_id": "CATEGORY_ID",
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

PUT http://localhost:5000/api/v1/products/PRODUCT_ID

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
"\_id": "PRODUCT_ID", "productTitle": "Updated WiFi Router",
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

DELETE http://localhost:5000/api/v1/products/PRODUCT_ID

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

GET http://localhost:5000/api/v1/products/download-template

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

POST http://localhost:5000/api/v1/products/bulk-import

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
"errors": \[ { "row": 3, "data": { "productCategory": "Electronics",
"productTitle": "Duplicate Router", "productCode": "ROUTER001" },
"errors": \[ "Product code already exists." \] } \] } }

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

POST http://localhost:5000/api/v1/centers

Access: Authenticated

Request Body

{ "resellerId": "RESELLER_ID", "areaId": "AREA_ID", "centerType":
"Outlet", "centerName": "Test Center", "centerCode": "TC001", "email":
"<testcenter@gmail.com>", "mobile": "9876543210", "status": "Enable",
"addressLine1": "Test Address 1", "addressLine2": "Test Address 2",
"city": "Pune", "state": "Maharashtra", "stockVerified": "Yes" }

Successful Response

201 Created

{ "success": true, "message": "Center created successfully", "data": {
"\_id": "CENTER_ID", "reseller": "RESELLER_ID", "area": "AREA_ID",
"centerType": "Outlet", "centerName": "Test Center", "centerCode":
"TC001", "email": "<testcenter@gmail.com>", "mobile": "9876543210",
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

GET http://localhost:5000/api/v1/centers

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

GET http://localhost:5000/api/v1/centers?page=1&limit=10

Successful Response

200 OK

{ "success": true, "message": "Centers retrieved successfully", "data":
\[\], "pagination": { "currentPage": 1, "totalPages": 0, "totalItems":
0, "itemsPerPage": 100, "hasNextPage": false } }

GET /centers/:id

Returns a Center by its MongoDB ID.

Endpoint

GET http://localhost:5000/api/v1/centers/CENTER_ID

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Center retrieved successfully", "data": {
"\_id": "CENTER_ID", "reseller": "RESELLER_ID", "area": "AREA_ID",
"centerType": "Outlet", "centerName": "Test Center", "centerCode":
"TC001", "email": "<testcenter@gmail.com>", "mobile": "9876543210",
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

PUT http://localhost:5000/api/v1/centers/CENTER_ID

Access: Authenticated

Request Body

{ "resellerId": "RESELLER_ID", "areaId": "AREA_ID", "centerType":
"Outlet", "centerName": "Updated Test Center", "centerCode":
"TC001UPDATED", "email": "<updated@example.com>", "mobile":
"9123456789", "status": "Disable", "addressLine1": "Updated Address 1",
"addressLine2": "Updated Address 2", "city": "Mumbai", "state":
"Maharashtra", "stockVerified": "No" }

Successful Response

200 OK

{ "success": true, "message": "Center updated successfully", "data": {
"\_id": "CENTER_ID", "reseller": "RESELLER_ID", "area": "AREA_ID",
"centerType": "Outlet", "centerName": "Updated Test Center",
"centerCode": "TC001UPDATED", "email": "<updated@example.com>",
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

DELETE http://localhost:5000/api/v1/centers/CENTER_ID

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

GET http://localhost:5000/api/v1/centers/reseller/RESELLER_ID

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Centers retrieved successfully", "data":
\[\] }

GET /centers/resellers/center

Returns Centers for the reseller associated with the authenticated user.

Endpoint

GET http://localhost:5000/api/v1/centers/resellers/center

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Centers retrieved successfully", "data":
\[\] }

GET /centers/area/:areaId

Returns Centers associated with a specific area.

Endpoint

GET http://localhost:5000/api/v1/centers/area/AREA_ID

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Centers retrieved successfully", "data":
\[\] }

GET /centers/main-warehouse

Returns main-warehouse Center data.

Endpoint

GET http://localhost:5000/api/v1/centers/main-warehouse

Access: Authenticated

Successful Response

200 OK

{ "success": true, "message": "Main warehouse centers retrieved
successfully", "data": \[\] }

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

\_id reseller area centerType centerName centerCode email mobile status
addressLine1 addressLine2 city state stockVerified createdAt updatedAt

CSV/export is intentionally not documented here because it is not part
of the current new-backend/frontend Center implementation.

Reseller APIs

Base URL: http://localhost:5000/api/v1

1.  Create Reseller

POST /resellers

API Test

Status: Tested successfully.

2.  Get All Resellers

GET /resellers

API Test

Status: Tested successfully.

3.  Get Reseller By ID

GET /resellers/:id

API Test

Status: Tested successfully.

4.  Update Reseller

PUT /resellers/:id

API Test

Status: Tested successfully.

5.  Delete Reseller

DELETE /resellers/:id

API Test

Status: Tested successfully.

Area APIs

1.  Create Area

POST /areas

Request Body

{ "resellerId": "<resellerId>", "areaName": "Test Area" }

API Test

Status: Tested successfully.

2.  Get All Areas

GET /areas

API Test

Status: Tested successfully.

3.  Get Area By ID

GET /areas/:id

API Test

Status: Tested successfully.

4.  Update Area

PUT /areas/:id

API Test

Status: Tested successfully.

5.  Delete Area

DELETE /areas/:id

API Test

Status: Tested successfully.

Center APIs

Base URL: http://localhost:5000/api/v1

1.  Create Center

POST /centers

Endpoint

POST http://localhost:5000/api/v1/centers

API Test

Status: Tested successfully.

Center can be created:

- Without a Warehouse ID
- With a Warehouse ID

Multiple Centers can reference the same Warehouse.

2.  Get All Centers

GET /centers

Endpoint

GET http://localhost:5000/api/v1/centers

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

3.  Get Center By ID

GET /centers/:id

Endpoint

GET http://localhost:5000/api/v1/centers/CENTER_ID

API Test

Status: Tested successfully.

4.  Update Center

PUT /centers/:id

Endpoint

PUT http://localhost:5000/api/v1/centers/CENTER_ID

API Test

Status: Tested successfully.

5.  Delete Center

DELETE /centers/:id

Endpoint

DELETE http://localhost:5000/api/v1/centers/CENTER_ID

API Test

Status: Tested successfully.

6.  Get Centers By Reseller

GET /centers/reseller/:resellerId

Endpoint

GET http://localhost:5000/api/v1/centers/reseller/RESELLER_ID

API Test

Status: Tested successfully.

7.  Get Centers By Resellers

GET /centers/resellers/center

Endpoint

GET http://localhost:5000/api/v1/centers/resellers/center

API Test

Status: Tested successfully.

8.  Get Centers By Area

GET /centers/area/:areaId

Endpoint

GET http://localhost:5000/api/v1/centers/area/AREA_ID

API Test

Status: Tested successfully.

Center Fields Verified During Testing

\_id

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

# Vendors

## POST `/vendors`

Creates a new vendor.

### Endpoint

```http
POST http://localhost:5000/api/v1/vendors
```

**Access:** Authenticated with `Settings -> manage_vendors` permission

### Request

Use `multipart/form-data` when uploading a vendor logo.

| Field           | Required | Type   | Description                                |
| --------------- | -------- | ------ | ------------------------------------------ |
| `businessName`  | Yes      | String | Vendor business name                       |
| `contactNumber` | Yes      | String | Vendor contact number                      |
| `name`          | Yes      | String | Vendor contact/person name                 |
| `mobile`        | No       | String | Indian mobile number                       |
| `email`         | No       | String | Vendor email address; unique when provided |
| `gstNumber`     | No       | String | GST number                                 |
| `panNumber`     | No       | String | PAN number                                 |
| `address1`      | No       | String | Primary address                            |
| `address2`      | No       | String | Secondary address                          |
| `city`          | No       | String | City                                       |
| `state`         | No       | String | State                                      |
| `logo`          | No       | File   | JPG, JPEG, PNG, WEBP or GIF; maximum 5 MB  |

### Example

```text
businessName = ABC Electronics
contactNumber = 02012345678
name = Amit Sharma
mobile = 9876543210
email = vendor@example.com
gstNumber = 27ABCDE1234F1Z5
panNumber = ABCDE1234F
address1 = Main Market
address2 = Shop No. 12
city = Pune
state = Maharashtra
logo = vendor-logo.png
```

### Successful Response

**201 Created**

```json
{
  "success": true,
  "message": "Vendor created successfully.",
  "data": {
    "_id": "VENDOR_ID",
    "businessName": "ABC Electronics",
    "contactNumber": "02012345678",
    "name": "Amit Sharma",
    "mobile": "9876543210",
    "email": "vendor@example.com",
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
```

### Errors

**400 Bad Request**

Returned when vendor request validation fails.

**409 Conflict**

Returned when the supplied email address is already registered.

---

## GET `/vendors`

Returns a paginated list of vendors with optional filtering and sorting.

### Endpoint

```http
GET http://localhost:5000/api/v1/vendors
```

**Access:** Authenticated with `Settings -> manage_vendors` permission

### Query Parameters

| Parameter   | Required | Default     | Description                                                                       |
| ----------- | -------- | ----------- | --------------------------------------------------------------------------------- |
| `search`    | No       | G��         | Searches business name, name, email, contact number, mobile number and GST number |
| `city`      | No       | G��         | Filters vendors by city                                                           |
| `state`     | No       | G��         | Filters vendors by state                                                          |
| `status`    | No       | G��         | Legacy filter supporting `Active` or `Inactive`                                   |
| `hasGst`    | No       | G��         | `true` returns vendors with GST; `false` returns vendors without GST              |
| `page`      | No       | `1`         | Page number                                                                       |
| `limit`     | No       | `100`       | Number of records per page                                                        |
| `sortBy`    | No       | `createdAt` | Field used for sorting                                                            |
| `sortOrder` | No       | `desc`      | Sort direction: `asc` or `desc`                                                   |

### Example

```http
GET http://localhost:5000/api/v1/vendors?search=electronics&city=Pune&hasGst=true&page=1&limit=10&sortBy=businessName&sortOrder=asc
```

### Successful Response

**200 OK**

```json
{
  "success": true,
  "data": [
    {
      "_id": "VENDOR_ID",
      "businessName": "ABC Electronics",
      "contactNumber": "02012345678",
      "name": "Amit Sharma",
      "mobile": "9876543210",
      "email": "vendor@example.com",
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
```

---

## GET `/vendors/:id`

Returns a vendor by its MongoDB ID.

### Endpoint

```http
GET http://localhost:5000/api/v1/vendors/VENDOR_ID
```

**Access:** Authenticated with `Settings -> manage_vendors` permission

### Successful Response

**200 OK**

```json
{
  "success": true,
  "data": {
    "_id": "VENDOR_ID",
    "businessName": "ABC Electronics",
    "contactNumber": "02012345678",
    "name": "Amit Sharma",
    "mobile": "9876543210",
    "email": "vendor@example.com",
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
```

### Errors

**400 Bad Request**

Returned when the supplied ID is invalid.

```json
{
  "success": false,
  "message": "Invalid data format"
}
```

**404 Not Found**

Returned when the vendor does not exist.

```json
{
  "success": false,
  "message": "Vendor not found."
}
```

---

## PUT `/vendors/:id`

Updates an existing vendor.

### Endpoint

```http
PUT http://localhost:5000/api/v1/vendors/VENDOR_ID
```

**Access:** Authenticated with `Settings -> manage_vendors` permission

### Request

Use `multipart/form-data` when uploading a new logo.

All vendor fields are optional during an update.

The accepted fields are the same as `POST /vendors`.

If no new logo is supplied, the existing logo is preserved.

If a new logo is supplied, the previous logo is removed after the
database update succeeds.

### Example

```text
businessName = ABC Electronics Updated
contactNumber = 02012345679
name = Amit Sharma
mobile = 9876543211
email = vendor@example.com
city = Pune
state = Maharashtra
logo = updated-vendor-logo.png
```

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Vendor updated successfully.",
  "data": {
    "_id": "VENDOR_ID",
    "businessName": "ABC Electronics Updated",
    "contactNumber": "02012345679",
    "name": "Amit Sharma",
    "mobile": "9876543211",
    "email": "vendor@example.com",
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
```

### Errors

**400 Bad Request**

Returned when the supplied ID or vendor data is invalid.

**404 Not Found**

Returned when the vendor does not exist.

**409 Conflict**

Returned when the updated email address is already registered.

---

## DELETE `/vendors/:id`

Deletes an existing vendor and its associated logo file.

### Endpoint

```http
DELETE http://localhost:5000/api/v1/vendors/VENDOR_ID
```

**Access:** Authenticated with `Settings -> manage_vendors` permission

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Vendor deleted successfully."
}
```

### Errors

**400 Bad Request**

Returned when the supplied ID is invalid.

**404 Not Found**

Returned when the vendor does not exist.

Warehouse APIs

Base URL: http://localhost:5000/api/v1

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
"<warehouse@test.com>", "mobile": "9876543210", "status": "Enable",
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

### Get Login History

Retrieves login history records.

**Endpoint:**

````http
GET /api/v1/auth/login-history

# Stock Transfer APIs

## Overview

Stock Transfer manages inventory movement between Centers through the existing legacy transfer workflow.

**Base URL:** `http://localhost:5000/api/v1`
**Resource:** `/stock-transfers`

All Stock Transfer endpoints require authentication and use the existing database-driven `Transfer` permission module.

## Permission Matrix

| Operation | Permission(s) |
|---|---|
| Create / Update / Submit / Ship / Complete | `manage_stock_transfer_own_center`, `manage_stock_transfer_all_center` |
| List / View | `stock_transfer_own_center`, `stock_transfer_all_center` |
| Delete | `delete_transfer_own_center`, `delete_transfer_all_center` |
| Confirm | `manage_stock_transfer_own_center`, `manage_stock_transfer_all_center`, `approval_transfer_center` |
| Admin pending approval | `indent_all_center`, `indent_own_center` |

## Status Flow

| Current Status | Supported Next Status |
|---|---|
| `Draft` | `Submitted` |
| `Submitted` | `Admin_Approved`, `Admin_Rejected` |
| `Admin_Approved` | `Confirmed`, `Rejected` |
| `Admin_Rejected` | — |
| `Confirmed` | `Shipped`, `Incompleted`, `Rejected` |
| `Shipped` | `Completed`, `Incompleted`, `Confirmed`, `Rejected` |
| `Incompleted` | `Confirmed`, `Shipped`, `Completed` |
| `Completed` | — |
| `Rejected` | — |

```text
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
````

## Endpoint Summary

| Method | Endpoint                                   | Purpose                             |
| ------ | ------------------------------------------ | ----------------------------------- |
| POST   | `/stock-transfers`                         | Create a Stock Transfer             |
| GET    | `/stock-transfers`                         | List Stock Transfers                |
| GET    | `/stock-transfers/latest-transfer-number`  | Get the most recent transfer number |
| GET    | `/stock-transfers/summary/original-outlet` | Get warehouse/product summary       |
| GET    | `/stock-transfers/stats`                   | Get transfer statistics             |
| GET    | `/stock-transfers/:id`                     | Get a transfer by ID                |
| PUT    | `/stock-transfers/:id`                     | Update a transfer                   |
| DELETE | `/stock-transfers/:id`                     | Delete a transfer                   |
| POST   | `/stock-transfers/:id/submit`              | Submit a Draft transfer             |
| POST   | `/stock-transfers/:id/approve`             | Confirm a transfer                  |
| POST   | `/stock-transfers/:id/reject`              | Reject a transfer                   |
| PATCH  | `/stock-transfers/:id/admin/approve`       | Admin approve                       |
| PATCH  | `/stock-transfers/:id/admin/reject`        | Admin reject                        |
| POST   | `/stock-transfers/:id/ship`                | Ship a confirmed transfer           |
| PATCH  | `/stock-transfers/:id/shipping-info`       | Update shipping information         |
| PATCH  | `/stock-transfers/:id/reject-shipment`     | Reject shipment                     |
| POST   | `/stock-transfers/:id/complete`            | Complete a shipped transfer         |
| POST   | `/stock-transfers/:id/mark-incomplete`     | Mark a transfer incomplete          |
| PATCH  | `/stock-transfers/:id/complete-incomplete` | Complete an incomplete transfer     |
| PATCH  | `/stock-transfers/:id/approved-quantities` | Update approved quantities          |
| GET    | `/stock-transfers/admin/pending-approval`  | Get pending admin approvals         |

## Common Transfer Fields

| Field              | Description                                     |
| ------------------ | ----------------------------------------------- |
| `_id`              | MongoDB Stock Transfer ID                       |
| `fromCenter`       | Source Center                                   |
| `toCenter`         | Destination Center                              |
| `date`             | Transfer date                                   |
| `transferNumber`   | Unique transfer number                          |
| `remark`           | Transfer remark                                 |
| `products`         | Products included in the transfer               |
| `status`           | Current transfer status                         |
| `adminApproval`    | Administrator approval information              |
| `stockStatus`      | Source deduction and destination addition state |
| `centerApproval`   | Center approval/rejection information           |
| `shippingInfo`     | Shipment information                            |
| `shipmentRejected` | Shipment rejection information                  |
| `receivingInfo`    | Receiving information                           |
| `completionInfo`   | Completion/incomplete information               |
| `challanDocument`  | Challan document reference                      |
| `createdBy`        | Creating user                                   |
| `updatedBy`        | Last updating user                              |
| `createdAt`        | Creation timestamp                              |
| `updatedAt`        | Last update timestamp                           |
| `lastStatusChange` | Last status transition timestamp                |

## POST `/stock-transfers`

Creates a new Stock Transfer.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers
```

**Access:** Authenticated with Stock Transfer management permission.

### Request Body

| Field            | Required | Description                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------- |
| `fromCenter`     | Yes      | Source Center ID                                                                             |
| `toCenter`       | Derived  | Destination Center is determined from the authenticated user's Center in the legacy workflow |
| `date`           | No       | Transfer date                                                                                |
| `transferNumber` | Yes      | Unique transfer number                                                                       |
| `remark`         | No       | Transfer remark                                                                              |
| `products`       | Yes      | Products included in the transfer                                                            |

### Product Fields

| Field              | Required | Description                               |
| ------------------ | -------- | ----------------------------------------- |
| `product`          | Yes      | Product ID                                |
| `quantity`         | Yes      | Requested quantity                        |
| `approvedSerials`  | No       | Approved serial numbers                   |
| `serialNumbers`    | No       | Transfer serial numbers                   |
| `approvedQuantity` | No       | Approved quantity                         |
| `approvedRemark`   | No       | Approval remark                           |
| `receivedQuantity` | No       | Quantity actually received/used           |
| `receivedSerials`  | No       | Serial numbers actually received/used     |
| `receivedRemark`   | No       | Receiving remark                          |
| `productInStock`   | No       | Stock quantity captured during validation |
| `productRemark`    | No       | Product-level remark                      |

### Example

```json
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
```

### Important Rules

- `transferNumber` must be unique.
- Source and destination Centers cannot be the same.
- The authenticated user must have Center information for creation.
- Submitted transfers validate source stock availability.

## GET `/stock-transfers`

Returns Stock Transfers accessible to the authenticated user.

**Endpoint**

```http
GET http://localhost:5000/api/v1/stock-transfers
```

**Access:** Authenticated with Stock Transfer view permission.

### Query Parameters

| Parameter               | Required | Description                                                       |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| `page`                  | No       | Page number                                                       |
| `limit`                 | No       | Number of records per page                                        |
| `status`                | No       | Filter by transfer status                                         |
| Other supported filters | No       | Additional filters accepted by the Stock Transfer query validator |

### Empty Response

```json
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
```

## GET `/stock-transfers/:id`

Returns a Stock Transfer by MongoDB ID.

**Endpoint**

```http
GET http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID
```

**Access:** Authenticated with Stock Transfer view permission.

| Status | Description              |
| ------ | ------------------------ |
| 400    | Invalid transfer ID      |
| 404    | Stock Transfer not found |

## PUT `/stock-transfers/:id`

Updates an existing Stock Transfer.

**Endpoint**

```http
PUT http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID
```

**Access:** Authenticated with Stock Transfer management permission.

## DELETE `/stock-transfers/:id`

Deletes an existing Stock Transfer.

**Endpoint**

```http
DELETE http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID
```

**Access:** Authenticated with delete Stock Transfer permission.

## POST `/stock-transfers/:id/submit`

Submits a Draft Stock Transfer.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/submit
```

**Access:** Authenticated with Stock Transfer management permission.

**State transition:** `Draft → Submitted`

The submission validates source stock availability and serialized stock
when applicable.

## PATCH `/stock-transfers/:id/admin/approve`

Approves a submitted Stock Transfer as administrator.

**Endpoint**

```http
PATCH http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/admin/approve
```

**Access:** Authenticated with Stock Transfer management permission.

**State transition:** `Submitted → Admin_Approved`

## PATCH `/stock-transfers/:id/admin/reject`

Rejects a submitted Stock Transfer as administrator.

**Endpoint**

```http
PATCH http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/admin/reject
```

**Access:** Authenticated with Stock Transfer management permission.

**State transition:** `Submitted → Admin_Rejected`

## POST `/stock-transfers/:id/approve`

Confirms an administrator-approved Stock Transfer.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/approve
```

**Access:** Authenticated with Stock Transfer management permission or
`approval_transfer_center`.

### Request Body

```json
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
```

**State transition:** `Admin_Approved → Confirmed`

For non-serialized stock, approved quantity is reserved by moving
quantity from available stock to in-transit stock. Serialized stock is
validated and updated accordingly.

## POST `/stock-transfers/:id/reject`

Rejects a Stock Transfer according to the current workflow state.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/reject
```

**Access:** Authenticated with Stock Transfer management permission.

## POST `/stock-transfers/:id/ship`

Ships a confirmed Stock Transfer.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/ship
```

**Access:** Authenticated with Stock Transfer management permission.

### Request Body

The current shipping validator requires `shippedDate`.

```json
{
  "shippedDate": "2026-10-01"
}
```

**State transition:** `Confirmed → Shipped`

## PATCH `/stock-transfers/:id/shipping-info`

Updates shipping information.

**Endpoint**

```http
PATCH http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/shipping-info
```

**Access:** Authenticated with Stock Transfer management permission.

## PATCH `/stock-transfers/:id/reject-shipment`

Rejects shipment information.

**Endpoint**

```http
PATCH http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/reject-shipment
```

**Access:** Authenticated with Stock Transfer management permission.

## POST `/stock-transfers/:id/complete`

Completes a shipped Stock Transfer.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/complete
```

**Access:** Authenticated with Stock Transfer management permission.

**State transition:** `Shipped → Completed`

### Request Body

`productReceipts` is optional. When provided, it records the quantity and
serial numbers actually received/used at the destination.

```json
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
```

### Product Receipt Fields

| Field                                | Required                      | Type          | Description                                                    |
| ------------------------------------ | ----------------------------- | ------------- | -------------------------------------------------------------- |
| `productReceipts`                    | No                            | Array         | Product receipt details                                        |
| `productReceipts[].productId`        | Yes, when receipt is provided | ObjectId      | Product ID from the transfer                                   |
| `productReceipts[].receivedQuantity` | Yes, when receipt is provided | Integer       | Actual quantity received/used; cannot exceed approved quantity |
| `productReceipts[].receivedSerials`  | No                            | Array[String] | Serial numbers actually received/used for serialized products  |
| `productReceipts[].receivedRemark`   | No                            | String        | Receiving remark                                               |

### Partial Receipt / Return Rule

The actual received quantity can be less than the approved quantity.

```text
Return Quantity = Approved Quantity - Received Quantity
```

Example:

| Product | Approved | Received / Used | Returned to Source |
| ------- | -------: | --------------: | -----------------: |
| P1      |       15 |              10 |                  5 |
| P2      |       20 |              15 |                  5 |

For non-serialized products:

| Stock Field                     | Completion Movement             |
| ------------------------------- | ------------------------------- |
| Source `inTransitQuantity`      | Decrease by approved quantity   |
| Source `totalQuantity`          | Decrease by received quantity   |
| Source `availableQuantity`      | Increase by approved - received |
| Destination `totalQuantity`     | Increase by received quantity   |
| Destination `availableQuantity` | Increase by received quantity   |

For serialized products:

- `receivedSerials` must belong to the approved serial numbers.
- Received serials are transferred to the destination.
- Approved serials that were not received are returned to the source and
  become available there.
- Source in-transit quantity is reduced by the full approved quantity.
- Source total quantity is reduced only by the actually received quantity.
- Destination stock is increased only by the actually received quantity.

If `productReceipts` is omitted, the existing legacy completion behavior
uses each product's approved quantity as its received quantity.

Completion performs pending source deduction and destination stock
addition when those operations have not already been completed.

## POST `/stock-transfers/:id/mark-incomplete`

Marks a transfer incomplete.

**Endpoint**

```http
POST http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/mark-incomplete
```

**Access:** Authenticated with Stock Transfer management permission.

**State transition:** `Shipped / Confirmed → Incompleted`

## PATCH `/stock-transfers/:id/complete-incomplete`

Completes an incomplete transfer.

**Endpoint**

```http
PATCH http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/complete-incomplete
```

**Access:** Authenticated with Stock Transfer management permission.

## PATCH `/stock-transfers/:id/approved-quantities`

Updates approved quantities and related approval information.

**Endpoint**

```http
PATCH http://localhost:5000/api/v1/stock-transfers/TRANSFER_ID/approved-quantities
```

**Access:** Authenticated with Stock Transfer management permission.

### Request Body

```json
{
  "productApprovals": [
    {
      "productId": "PRODUCT_ID",
      "approvedQuantity": 15,
      "approvedRemark": "Approved partial quantity"
    }
  ]
}
```

### Product Approval Fields

| Field                                 | Required | Type     | Description                             |
| ------------------------------------- | -------- | -------- | --------------------------------------- |
| `productApprovals`                    | Yes      | Array    | Non-empty array of product approvals    |
| `productApprovals[].productId`        | Yes      | ObjectId | Product ID from the transfer            |
| `productApprovals[].approvedQuantity` | Yes      | Integer  | Approved quantity; non-negative integer |
| `productApprovals[].approvedRemark`   | No       | String   | Approval remark                         |

Approved quantities determine the quantity reserved during confirmation.
For serialized products, the approved serial numbers associated with the
transfer are used during the confirmation workflow.

## GET `/stock-transfers/admin/pending-approval`

Returns Stock Transfers pending administrator approval.

**Endpoint**

```http
GET http://localhost:5000/api/v1/stock-transfers/admin/pending-approval
```

**Access:** Authenticated with `indent_all_center` or
`indent_own_center`.

## GET `/stock-transfers/latest-transfer-number`

Returns the most recent transfer number.

**Endpoint**

```http
GET http://localhost:5000/api/v1/stock-transfers/latest-transfer-number
```

**Access:** Authenticated with Stock Transfer view permission.

## GET `/stock-transfers/summary/original-outlet`

Returns the warehouse/product summary used by the Stock Transfer
workflow.

**Endpoint**

```http
GET http://localhost:5000/api/v1/stock-transfers/summary/original-outlet
```

**Access:** Authenticated with Stock Transfer view permission.

## GET `/stock-transfers/stats`

Returns Stock Transfer statistics.

**Endpoint**

```http
GET http://localhost:5000/api/v1/stock-transfers/stats
```

**Access:** Authenticated with Stock Transfer view permission.

## Stock Movement

For non-serialized products:

```text
Source available stock
        ↓
Confirm
        ↓
Source in-transit stock
        ↓
Complete
        ↓
Destination available stock
```

For serialized products, serial status and current location are updated
as part of the transfer lifecycle.

## Partial Approval and Partial Receipt

Stock Transfer supports cases where the approved quantity is greater than
the quantity actually received/used at the destination.

| Stage           | Quantity                                      |
| --------------- | --------------------------------------------- |
| Requested       | Original quantity requested in the transfer   |
| Approved        | Quantity approved during confirmation         |
| Received / Used | Quantity actually received at the destination |
| Returned        | `Approved - Received`                         |

Example:

```text
Requested: 20
Approved: 15
Received: 10
Returned to source: 5
```

For serialized products, the same rule is applied at serial-number level:
received serials move to the destination, while approved but unreceived
serials return to the source as available stock.

## Stock Transfer API Test Coverage

| Operation                     | Status   |
| ----------------------------- | -------- |
| Create Stock Transfer         | Tested   |
| Get Stock Transfers           | Tested   |
| Submit                        | Tested   |
| Admin Approve                 | Tested   |
| Confirm                       | Tested   |
| Ship                          | Tested   |
| Complete                      | Tested   |
| Partial approval              | Tested   |
| Partial receipt               | Tested   |
| Serialized partial return     | Verified |
| Non-serialized partial return | Verified |
| Source stock deduction        | Verified |
| Destination stock addition    | Verified |
| Status progression            | Verified |

### Tested Lifecycle

```text
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
```
