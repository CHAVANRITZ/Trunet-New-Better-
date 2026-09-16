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
