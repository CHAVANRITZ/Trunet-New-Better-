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

Verifies that authentication and permission-based authorization
are working correctly.

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

The previous refresh token is revoked after a successful refresh and cannot be reused.

Access: Public

Request Body

{
"refreshToken": "YOUR_REFRESH_TOKEN"
}

Authentication — Logout

POST /api/v1/auth/logout

Revokes the refresh-token session associated with the supplied refresh token.

Access: Public

Request Body

{
"refreshToken": "YOUR_REFRESH_TOKEN"
}

Product Categories

POST /product-categories

Creates a new product category.

Endpoint

POST http://localhost:5000/api/v1/product-categories

Access: Authenticated

Request Body

{
"productCategory": "Electronics",
"remark": "Electronic inventory items"
}

Successful Response

201 Created

{
"success": true,
"message": "Product category created successfully.",
"data": {
"\_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items",
"createdAt": "2026-09-16T11:09:12.999Z",
"updatedAt": "2026-09-16T11:09:12.999Z"
}
}

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

GET http://localhost:5000/api/v1/product-categories?search=electronics&page=1&limit=10&sortBy=createdAt&sortOrder=desc

Successful Response

200 OK

{
"success": true,
"message": "Product categories retrieved successfully.",
"data": {
"categories": [
{
"_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items",
"createdAt": "2026-09-16T11:09:12.999Z",
"updatedAt": "2026-09-16T11:09:12.999Z"
}
],
"pagination": {
"currentPage": 1,
"totalPages": 1,
"totalCategories": 1
}
}
}

GET /product-categories/:id

Returns a product category by its MongoDB ID.

Endpoint

GET http://localhost:5000/api/v1/product-categories/CATEGORY_ID

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Product category retrieved successfully.",
"data": {
"\_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items",
"createdAt": "2026-09-16T11:09:12.999Z",
"updatedAt": "2026-09-16T11:09:12.999Z"
}
}

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

{
"productCategory": "Updated Electronics",
"remark": "Updated category description"
}

Successful Response

200 OK

{
"success": true,
"message": "Product category updated successfully.",
"data": {
"\_id": "CATEGORY_ID",
"productCategory": "Updated Electronics",
"remark": "Updated category description",
"createdAt": "2026-09-16T11:09:12.999Z",
"updatedAt": "2026-09-16T11:56:54.426Z"
}
}

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

{
"success": true,
"message": "Product category deleted successfully.",
"data": {
"\_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items",
"createdAt": "2026-09-16T11:09:12.999Z",
"updatedAt": "2026-09-16T11:56:54.426Z"
}
}

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

productCategory = CATEGORY_ID
productTitle = WiFi Router
productCode = ROUTER001
productPrice = 2500
salePrice = 2100
hsnCode = 85176290
productWeight = 0.8kg
productBarcode = 123456789880123
status = Enable
description = Wireless networking router
trackSerialNumber = Yes
repairable = Yes
replaceable = Yes
productImage = router.png

Successful Response

201 Created

{
"success": true,
"message": "Product created successfully.",
"data": {
"\_id": "PRODUCT_ID",
"productCategory": {
"\_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items"
},
"productTitle": "WiFi Router",
"productCode": "ROUTER001",
"productPrice": 2500,
"salePrice": 2100,
"hsnCode": "85176290",
"productImage": "uploads/products/product-IMAGE_FILE.png",
"productWeight": "0.8kg",
"productBarcode": "123456789880123",
"status": "Enable",
"description": "Wireless networking router",
"trackSerialNumber": "Yes",
"repairable": "Yes",
"replaceable": "Yes",
"createdAt": "2026-09-18T04:33:39.142Z",
"updatedAt": "2026-09-18T04:33:39.142Z"
}
}

Errors

400 Bad Request

Returned when request validation fails or the product category ID is invalid.

404 Not Found

Returned when the referenced product category does not exist.

409 Conflict

Returned when the product title or product code is already in use.

GET /products

Returns a paginated list of products with optional filtering and sorting.

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

createdAt, updatedAt, productTitle, productCode, productPrice, salePrice or status

sortOrder

No

desc

asc or desc

Example

GET http://localhost:5000/api/v1/products?search=router&status=Enable&page=1&limit=10&sortBy=salePrice&sortOrder=asc

Successful Response

200 OK

{
"success": true,
"message": "Products retrieved successfully.",
"data": {
"products": [
{
"_id": "PRODUCT_ID",
"productCategory": {
"_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items"
},
"productTitle": "WiFi Router",
"productCode": "ROUTER001",
"productPrice": 2500,
"salePrice": 2100,
"hsnCode": "85176290",
"productImage": "uploads/products/product-IMAGE_FILE.png",
"productWeight": "0.8kg",
"productBarcode": "123456789880123",
"status": "Enable",
"description": "Wireless networking router",
"trackSerialNumber": "Yes",
"repairable": "Yes",
"replaceable": "Yes",
"createdAt": "2026-09-18T04:33:39.142Z",
"updatedAt": "2026-09-18T04:33:39.142Z"
}
],
"pagination": {
"currentPage": 1,
"totalPages": 1,
"totalProducts": 1,
"hasNextPage": false,
"hasPrevPage": false
}
}
}

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

createdAt, updatedAt, productTitle, productCode, productPrice, salePrice or status

sortOrder

No

desc

asc or desc

Example

GET http://localhost:5000/api/v1/products/all?sortBy=productTitle&sortOrder=asc

Successful Response

200 OK

{
"success": true,
"message": "Products retrieved successfully.",
"data": [
{
"_id": "PRODUCT_ID",
"productCategory": {
"_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items"
},
"productTitle": "WiFi Router",
"productCode": "ROUTER001",
"productPrice": 2500,
"salePrice": 2100,
"hsnCode": "85176290",
"productImage": "",
"productWeight": "0.8kg",
"productBarcode": "123456789880123",
"status": "Enable",
"description": "Wireless networking router",
"trackSerialNumber": "Yes",
"repairable": "Yes",
"replaceable": "Yes",
"createdAt": "2026-09-18T04:33:39.142Z",
"updatedAt": "2026-09-18T04:33:39.142Z"
}
]
}

GET /products/:id

Returns a product by its MongoDB ID.

Endpoint

GET http://localhost:5000/api/v1/products/PRODUCT_ID

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Product retrieved successfully.",
"data": {
"\_id": "PRODUCT_ID",
"productCategory": {
"\_id": "CATEGORY_ID",
"productCategory": "Electronics",
"remark": "Electronic inventory items"
},
"productTitle": "WiFi Router",
"productCode": "ROUTER001",
"productPrice": 2500,
"salePrice": 2100,
"hsnCode": "85176290",
"productImage": "",
"productWeight": "0.8kg",
"productBarcode": "123456789880123",
"status": "Enable",
"description": "Wireless networking router",
"trackSerialNumber": "Yes",
"repairable": "Yes",
"replaceable": "Yes",
"createdAt": "2026-09-18T04:33:39.142Z",
"updatedAt": "2026-09-18T04:33:39.142Z"
}
}

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

Use multipart/form-data. All product fields are optional during an update.

The accepted fields are the same as POST /products.

If a new productImage is supplied, the previous product image is removed after the database update succeeds.

Example

productTitle = Updated WiFi Router
salePrice = 2100
description = Updated wireless networking router
productImage = new-router.png

Successful Response

200 OK

{
"success": true,
"message": "Product updated successfully.",
"data": {
"\_id": "PRODUCT_ID",
"productTitle": "Updated WiFi Router",
"salePrice": 2100,
"description": "Updated wireless networking router"
}
}

Errors

400 Bad Request

Returned when the ID or supplied fields fail validation.

404 Not Found

Returned when the product or referenced product category does not exist.

409 Conflict

Returned when the updated product title or product code is already in use.

DELETE /products/:id

Deletes an existing product.

Endpoint

DELETE http://localhost:5000/api/v1/products/PRODUCT_ID

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Product deleted successfully."
}

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

Content-Type: text/csv
Content-Disposition: attachment; filename=product_bulk_upload_template.csv

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

productCategory
productTitle
productCode
productPrice
salePrice
hsnCode
productWeight
productBarcode
status
description
trackSerialNumber
repairable
replaceable

Bulk Import Rules

Each CSV row is validated independently.

Invalid rows do not prevent other valid rows from being imported.

Product titles are unique.

Product codes are unique when provided.

Duplicate product titles and product codes are reported against their CSV row.

Duplicate values within the same CSV are rejected before insertion.

Product categories are resolved during import and can be created when required.

status accepts Enable or Disable.

trackSerialNumber, repairable, and replaceable accept Yes or No.

Example

csvFile = products.csv

Successful Response

200 OK

{
"success": true,
"message": "Bulk import completed. Successful: 2, Failed: 1.",
"data": {
"total": 3,
"successful": 2,
"failed": 1,
"errors": [
{
"row": 3,
"data": {
"productCategory": "Electronics",
"productTitle": "Duplicate Router",
"productCode": "ROUTER001"
},
"errors": [
"Product code already exists."
]
}
]
}
}

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

{
"resellerId": "RESELLER_ID",
"areaId": "AREA_ID",
"centerType": "Outlet",
"centerName": "Test Center",
"centerCode": "TC001",
"email": "testcenter@gmail.com",
"mobile": "9876543210",
"status": "Enable",
"addressLine1": "Test Address 1",
"addressLine2": "Test Address 2",
"city": "Pune",
"state": "Maharashtra",
"stockVerified": "Yes"
}

Successful Response

201 Created

{
"success": true,
"message": "Center created successfully",
"data": {
"\_id": "CENTER_ID",
"reseller": "RESELLER_ID",
"area": "AREA_ID",
"centerType": "Outlet",
"centerName": "Test Center",
"centerCode": "TC001",
"email": "testcenter@gmail.com",
"mobile": "9876543210",
"status": "Enable",
"addressLine1": "Test Address 1",
"addressLine2": "Test Address 2",
"city": "Pune",
"state": "Maharashtra",
"stockVerified": "Yes",
"createdAt": "TIMESTAMP",
"updatedAt": "TIMESTAMP"
}
}

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

{
"success": true,
"message": "Centers retrieved successfully",
"data": [],
"pagination": {
"currentPage": 1,
"totalPages": 0,
"totalItems": 0,
"itemsPerPage": 100,
"hasNextPage": false
}
}

GET /centers/:id

Returns a Center by its MongoDB ID.

Endpoint

GET http://localhost:5000/api/v1/centers/CENTER_ID

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Center retrieved successfully",
"data": {
"\_id": "CENTER_ID",
"reseller": "RESELLER_ID",
"area": "AREA_ID",
"centerType": "Outlet",
"centerName": "Test Center",
"centerCode": "TC001",
"email": "testcenter@gmail.com",
"mobile": "9876543210",
"status": "Enable",
"addressLine1": "Test Address 1",
"addressLine2": "Test Address 2",
"city": "Pune",
"state": "Maharashtra",
"stockVerified": "Yes",
"createdAt": "TIMESTAMP",
"updatedAt": "TIMESTAMP"
}
}

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

{
"resellerId": "RESELLER_ID",
"areaId": "AREA_ID",
"centerType": "Outlet",
"centerName": "Updated Test Center",
"centerCode": "TC001UPDATED",
"email": "updated@example.com",
"mobile": "9123456789",
"status": "Disable",
"addressLine1": "Updated Address 1",
"addressLine2": "Updated Address 2",
"city": "Mumbai",
"state": "Maharashtra",
"stockVerified": "No"
}

Successful Response

200 OK

{
"success": true,
"message": "Center updated successfully",
"data": {
"\_id": "CENTER_ID",
"reseller": "RESELLER_ID",
"area": "AREA_ID",
"centerType": "Outlet",
"centerName": "Updated Test Center",
"centerCode": "TC001UPDATED",
"email": "updated@example.com",
"mobile": "9123456789",
"status": "Disable",
"addressLine1": "Updated Address 1",
"addressLine2": "Updated Address 2",
"city": "Mumbai",
"state": "Maharashtra",
"stockVerified": "No",
"createdAt": "TIMESTAMP",
"updatedAt": "TIMESTAMP"
}
}

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

{
"success": true,
"message": "Center deleted successfully"
}

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

{
"success": true,
"message": "Centers retrieved successfully",
"data": []
}

GET /centers/resellers/center

Returns Centers for the reseller associated with the authenticated user.

Endpoint

GET http://localhost:5000/api/v1/centers/resellers/center

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Centers retrieved successfully",
"data": []
}

GET /centers/area/:areaId

Returns Centers associated with a specific area.

Endpoint

GET http://localhost:5000/api/v1/centers/area/AREA_ID

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Centers retrieved successfully",
"data": []
}

GET /centers/main-warehouse

Returns main-warehouse Center data.

Endpoint

GET http://localhost:5000/api/v1/centers/main-warehouse

Access: Authenticated

Successful Response

200 OK

{
"success": true,
"message": "Main warehouse centers retrieved successfully",
"data": []
}

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

\_id
reseller
area
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

CSV/export is intentionally not documented here because it is not part of the current new-backend/frontend Center implementation.

Reseller APIs

Base URL: http://localhost:5000/api/v1

1. Create Reseller

POST /resellers

API Test

Status: Tested successfully.

2. Get All Resellers

GET /resellers

API Test

Status: Tested successfully.

3. Get Reseller By ID

GET /resellers/:id

API Test

Status: Tested successfully.

4. Update Reseller

PUT /resellers/:id

API Test

Status: Tested successfully.

5. Delete Reseller

DELETE /resellers/:id

API Test

Status: Tested successfully.

Area APIs

1. Create Area

POST /areas

Request Body

{
"resellerId": "<resellerId>",
"areaName": "Test Area"
}

API Test

Status: Tested successfully.

2. Get All Areas

GET /areas

API Test

Status: Tested successfully.

3. Get Area By ID

GET /areas/:id

API Test

Status: Tested successfully.

4. Update Area

PUT /areas/:id

API Test

Status: Tested successfully.

5. Delete Area

DELETE /areas/:id

API Test

Status: Tested successfully.

Center APIs

Base URL: http://localhost:5000/api/v1

1. Create Center

POST /centers

Endpoint

POST http://localhost:5000/api/v1/centers

API Test

Status: Tested successfully.

Center can be created:

- Without a Warehouse ID
- With a Warehouse ID

Multiple Centers can reference the same Warehouse.

2. Get All Centers

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

3. Get Center By ID

GET /centers/:id

Endpoint

GET http://localhost:5000/api/v1/centers/CENTER_ID

API Test

Status: Tested successfully.

4. Update Center

PUT /centers/:id

Endpoint

PUT http://localhost:5000/api/v1/centers/CENTER_ID

API Test

Status: Tested successfully.

5. Delete Center

DELETE /centers/:id

Endpoint

DELETE http://localhost:5000/api/v1/centers/CENTER_ID

API Test

Status: Tested successfully.

6. Get Centers By Reseller

GET /centers/reseller/:resellerId

Endpoint

GET http://localhost:5000/api/v1/centers/reseller/RESELLER_ID

API Test

Status: Tested successfully.

7. Get Centers By Resellers

GET /centers/resellers/center

Endpoint

GET http://localhost:5000/api/v1/centers/resellers/center

API Test

Status: Tested successfully.

8. Get Centers By Area

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

Center create/update requests use resellerId and areaId, which map to the stored reseller and area relationships.

The warehouse field is optional. A Center can be created without a Warehouse ID or with a Warehouse ID.

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

If a new logo is supplied, the previous logo is removed after the database update succeeds.

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

{ "resellerId": "RESELLER_ID",
"areaId": "AREA_ID",
"warehouseName": "TestWarehouse",
"warehouseCode": "WH-001",
"email": "warehouse@test.com",
"mobile": "9876543210",
"status": "Enable",
"addressLine1": "TestAddress",
"addressLine2": "",
"city": "Nashik",
"state": "Maharashtra",
"stockVerified": "" }

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

Warehouse
├── Center 1
├── Center 2
├── Center 3
└── Center 4

Warehouse ID used during API testing:

6aba30402aa35bb478e4d340

The Center-with-Warehouse create API was tested successfully with this
Warehouse ID.
