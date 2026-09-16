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

Then immediately below that, add:

````md
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
````
