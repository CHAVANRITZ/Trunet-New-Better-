# Trunet API Documentation

## Base URL

```text
http://localhost:5000/api/v1
```

### GET /health

### Checks whether the Trunet backend API is running.

```text
GET http://localhost:5000/api/v1/health
```

# Authentication

## POST `/auth/login`

Authenticates a Trunet user using their username or email and password.

### Endpoint

```http
POST http://localhost:5000/api/v1/auth/login
```

## GET `/auth/rbac-test`

Verifies that authentication and permission-based authorization
are working correctly.

### Endpoint

```http
GET http://localhost:5000/api/v1/auth/rbac-test
```

## POST `/auth/refresh`

Refreshes an authenticated session using a valid refresh token.

The endpoint uses refresh-token rotation. After a successful refresh,
the supplied refresh token is revoked and a new refresh token is issued.

### Endpoint

```http
POST http://localhost:5000/api/v1/auth/refresh
```

## Authentication — Refresh Token

### POST `/api/v1/auth/refresh`

Issues a new access token and rotates the supplied refresh token.

The previous refresh token is revoked after a successful refresh and cannot be reused.

**Access:** Public

#### Request Body

```json
{
  "refreshToken": "YOUR_REFRESH_TOKEN"
}
```

## Authentication — Logout

### POST `/api/v1/auth/logout`

Revokes the refresh-token session associated with the supplied refresh token.

**Access:** Public

#### Request Body

```json
{
  "refreshToken": "YOUR_REFRESH_TOKEN"
}
```

# Product Categories

## POST `/product-categories`

Creates a new product category.

### Endpoint

```http
POST http://localhost:5000/api/v1/product-categories
```

**Access:** Authenticated

#### Request Body

```json
{
  "productCategory": "Electronics",
  "remark": "Electronic inventory items"
}
```

### Successful Response

**201 Created**

```json
{
  "success": true,
  "message": "Product category created successfully.",
  "data": {
    "_id": "CATEGORY_ID",
    "productCategory": "Electronics",
    "remark": "Electronic inventory items",
    "createdAt": "2026-09-16T11:09:12.999Z",
    "updatedAt": "2026-09-16T11:09:12.999Z"
  }
}
```

### Errors

**400 Bad Request**

Returned when the request fails validation.

**409 Conflict**

Returned when the product category already exists.

---

## GET `/product-categories`

Returns a paginated list of product categories.

### Endpoint

```http
GET http://localhost:5000/api/v1/product-categories
```

**Access:** Authenticated

### Query Parameters

| Parameter   | Required | Default     | Description                          |
| ----------- | -------- | ----------- | ------------------------------------ |
| `search`    | No       | —           | Searches product category and remark |
| `page`      | No       | `1`         | Page number                          |
| `limit`     | No       | `100`       | Number of records per page           |
| `sortBy`    | No       | `createdAt` | Field used for sorting               |
| `sortOrder` | No       | `desc`      | Sort direction: `asc` or `desc`      |

### Example

```http
GET http://localhost:5000/api/v1/product-categories?search=electronics&page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

### Successful Response

**200 OK**

```json
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
```

---

## GET `/product-categories/:id`

Returns a product category by its MongoDB ID.

### Endpoint

```http
GET http://localhost:5000/api/v1/product-categories/CATEGORY_ID
```

**Access:** Authenticated

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Product category retrieved successfully.",
  "data": {
    "_id": "CATEGORY_ID",
    "productCategory": "Electronics",
    "remark": "Electronic inventory items",
    "createdAt": "2026-09-16T11:09:12.999Z",
    "updatedAt": "2026-09-16T11:09:12.999Z"
  }
}
```

### Errors

**400 Bad Request**

Returned when the supplied ID is invalid.

**404 Not Found**

Returned when the product category does not exist.

---

## PUT `/product-categories/:id`

Updates an existing product category.

### Endpoint

```http
PUT http://localhost:5000/api/v1/product-categories/CATEGORY_ID
```

**Access:** Authenticated

#### Request Body

```json
{
  "productCategory": "Updated Electronics",
  "remark": "Updated category description"
}
```

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Product category updated successfully.",
  "data": {
    "_id": "CATEGORY_ID",
    "productCategory": "Updated Electronics",
    "remark": "Updated category description",
    "createdAt": "2026-09-16T11:09:12.999Z",
    "updatedAt": "2026-09-16T11:56:54.426Z"
  }
}
```

### Errors

**400 Bad Request**

Returned when the ID or request fields fail validation.

**404 Not Found**

Returned when the product category does not exist.

**409 Conflict**

Returned when the updated product category already exists.

---

## DELETE `/product-categories/:id`

Deletes an existing product category.

### Endpoint

```http
DELETE http://localhost:5000/api/v1/product-categories/CATEGORY_ID
```

**Access:** Authenticated

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Product category deleted successfully.",
  "data": {
    "_id": "CATEGORY_ID",
    "productCategory": "Electronics",
    "remark": "Electronic inventory items",
    "createdAt": "2026-09-16T11:09:12.999Z",
    "updatedAt": "2026-09-16T11:56:54.426Z"
  }
}
```

### Errors

**400 Bad Request**

Returned when the supplied ID is invalid.

**404 Not Found**

Returned when the product category does not exist.

# Products

## POST `/products`

Creates a new product.

### Endpoint

```http
POST http://localhost:5000/api/v1/products
```

**Access:** Authenticated

### Request

Use `multipart/form-data` because the product image is optional.

| Field | Required | Type | Description |
| --- | --- | --- | --- |
| `productCategory` | Yes | MongoDB ObjectId | Product category ID |
| `productTitle` | Yes | String | Unique product title |
| `productCode` | No | String | Unique product code |
| `productPrice` | Yes | Number | Product purchase/base price |
| `salePrice` | Yes | Number | Product sale price |
| `hsnCode` | Yes | String | HSN code |
| `productImage` | No | File | JPG, JPEG, PNG, WEBP or GIF; maximum 5 MB |
| `productWeight` | No | String | Product weight |
| `productBarcode` | No | String | Product barcode |
| `status` | No | String | `Enable` or `Disable` |
| `description` | No | String | Product description |
| `trackSerialNumber` | No | String | `Yes` or `No` |
| `repairable` | No | String | `Yes` or `No` |
| `replaceable` | No | String | `Yes` or `No` |

### Example

```text
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
```

### Successful Response

**201 Created**

```json
{
  "success": true,
  "message": "Product created successfully.",
  "data": {
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
}
```

### Errors

**400 Bad Request**

Returned when request validation fails or the product category ID is invalid.

**404 Not Found**

Returned when the referenced product category does not exist.

**409 Conflict**

Returned when the product title or product code is already in use.

---

## GET `/products`

Returns a paginated list of products with optional filtering and sorting.

### Endpoint

```http
GET http://localhost:5000/api/v1/products
```

**Access:** Authenticated

### Query Parameters

| Parameter | Required | Default | Description |
| --- | --- | --- | --- |
| `search` | No | — | Searches product title, code, description and barcode |
| `category` | No | — | Product category ID, name or category code |
| `status` | No | — | `Enable`, `Disable`, or comma-separated values |
| `minPrice` | No | — | Minimum product price |
| `maxPrice` | No | — | Maximum product price |
| `trackSerialNumber` | No | — | `Yes` or `No` |
| `repairable` | No | — | `Yes` or `No` |
| `replaceable` | No | — | `Yes` or `No` |
| `page` | No | `1` | Page number |
| `limit` | No | — | Records per page; maximum `100` |
| `sortBy` | No | `createdAt` | `createdAt`, `updatedAt`, `productTitle`, `productCode`, `productPrice`, `salePrice` or `status` |
| `sortOrder` | No | `desc` | `asc` or `desc` |

### Example

```http
GET http://localhost:5000/api/v1/products?search=router&status=Enable&page=1&limit=10&sortBy=salePrice&sortOrder=asc
```

### Successful Response

**200 OK**

```json
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
```

---

## GET `/products/all`

Returns all products without pagination.

### Endpoint

```http
GET http://localhost:5000/api/v1/products/all
```

**Access:** Authenticated

### Query Parameters

| Parameter | Required | Default | Description |
| --- | --- | --- | --- |
| `sortBy` | No | `createdAt` | `createdAt`, `updatedAt`, `productTitle`, `productCode`, `productPrice`, `salePrice` or `status` |
| `sortOrder` | No | `desc` | `asc` or `desc` |

### Example

```http
GET http://localhost:5000/api/v1/products/all?sortBy=productTitle&sortOrder=asc
```

### Successful Response

**200 OK**

```json
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
```

---

## GET `/products/:id`

Returns a product by its MongoDB ID.

### Endpoint

```http
GET http://localhost:5000/api/v1/products/PRODUCT_ID
```

**Access:** Authenticated

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Product retrieved successfully.",
  "data": {
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
}
```

### Errors

**400 Bad Request**

Returned when the supplied ID is invalid.

**404 Not Found**

Returned when the product does not exist.

---

## PUT `/products/:id`

Updates an existing product.

### Endpoint

```http
PUT http://localhost:5000/api/v1/products/PRODUCT_ID
```

**Access:** Authenticated

### Request

Use `multipart/form-data`. All product fields are optional during an update.

The accepted fields are the same as `POST /products`.

If a new `productImage` is supplied, the previous product image is removed after the database update succeeds.

### Example

```text
productTitle = Updated WiFi Router
salePrice = 2100
description = Updated wireless networking router
productImage = new-router.png
```

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Product updated successfully.",
  "data": {
    "_id": "PRODUCT_ID",
    "productTitle": "Updated WiFi Router",
    "salePrice": 2100,
    "description": "Updated wireless networking router"
  }
}
```

### Errors

**400 Bad Request**

Returned when the ID or supplied fields fail validation.

**404 Not Found**

Returned when the product or referenced product category does not exist.

**409 Conflict**

Returned when the updated product title or product code is already in use.

---

## DELETE `/products/:id`

Deletes an existing product.

### Endpoint

```http
DELETE http://localhost:5000/api/v1/products/PRODUCT_ID
```

**Access:** Authenticated

### Successful Response

**200 OK**

```json
{
  "success": true,
  "message": "Product deleted successfully."
}
```

### Errors

**400 Bad Request**

Returned when the supplied ID is invalid.

**404 Not Found**

Returned when the product does not exist.

---

## GET `/products/download-template`

Downloads the standard CSV template used for bulk product imports.

### Endpoint

```http
GET http://localhost:5000/api/v1/products/download-template
```

**Access:** Authenticated

### Response

**200 OK**

```text
Content-Type: text/csv
Content-Disposition: attachment; filename=product_bulk_upload_template.csv
```

### CSV Columns

```text
productCategory,productTitle,productCode,productPrice,salePrice,hsnCode,productWeight,productBarcode,status,description,trackSerialNumber,repairable,replaceable
```

---

## POST `/products/bulk-import`

Imports multiple products from a CSV file.

### Endpoint

```http
POST http://localhost:5000/api/v1/products/bulk-import
```

**Access:** Authenticated

### Request

Use `multipart/form-data`.

| Field | Required | Type | Description |
| --- | --- | --- | --- |
| `csvFile` | Yes | File | CSV file containing product records |

The CSV file is kept in memory during processing.

Maximum upload size: **10 MB**.

### CSV Columns

```text
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
```

### Bulk Import Rules

- Each CSV row is validated independently.
- Invalid rows do not prevent other valid rows from being imported.
- Product titles are unique.
- Product codes are unique when provided.
- Duplicate product titles and product codes are reported against their CSV row.
- Duplicate values within the same CSV are rejected before insertion.
- Product categories are resolved during import and can be created when required.
- `status` accepts `Enable` or `Disable`.
- `trackSerialNumber`, `repairable`, and `replaceable` accept `Yes` or `No`.

### Example

```text
csvFile = products.csv
```

### Successful Response

**200 OK**

```json
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
```

### Errors

**400 Bad Request**

Returned when:

- the CSV file is missing;
- the CSV file is empty or cannot be parsed;
- the uploaded file is not a supported CSV upload;
- the CSV contains invalid product data.

The response includes row-specific validation errors where applicable.

**401 Unauthorized**

Returned when authentication credentials are missing or invalid.

