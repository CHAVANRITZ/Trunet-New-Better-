/**
 * Wraps an asynchronous Express route handler and forwards
 * rejected promises to the centralized error middleware.
 *
 * Without this wrapper, every async controller would need
 * repetitive try/catch blocks just to pass errors to Express.
 *
 * Example:
 *
 * router.post("/login", asyncHandler(login));
 */
export function asyncHandler(handler) {
    return function wrappedHandler(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}