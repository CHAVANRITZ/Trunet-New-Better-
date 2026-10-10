import { body, param, query } from "express-validator";

const optionalDate = (field) =>
  query(field)
    .optional({ values: "falsy" })
    .custom((value) => !Number.isNaN(new Date(value).getTime()))
    .withMessage(`Invalid ${field}.`);

export const createTestingMaterialValidator = [
  body("toCenter")
    .notEmpty()
    .withMessage("Destination center is required.")
    .isMongoId()
    .withMessage("Invalid destination center ID."),

  body("products")
    .isArray({ min: 1 })
    .withMessage("Products array is required and cannot be empty."),

  body("products.*.product")
    .notEmpty()
    .withMessage("Each product must have product ID and quantity.")
    .isMongoId()
    .withMessage("Invalid product ID."),

  body("products.*.quantity")
    .notEmpty()
    .withMessage("Each product must have product ID and quantity.")
    .isInt({ min: 1 })
    .withMessage("Product quantity must be greater than 0."),

  body("products.*.serialNumbers")
    .optional()
    .isArray()
    .withMessage("serialNumbers must be an array."),

  body("products.*.serialNumbers.*")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Serial numbers must be non-empty strings."),

  body("products.*.remark").optional().isString().withMessage("Product remark must be a string."),

  body("remark").optional().isString().withMessage("Remark must be a string."),
];

export const testingMaterialIdValidator = [
  param("id").isMongoId().withMessage("Invalid testing material request ID."),
];

export const acceptTestingMaterialValidator = [
  ...testingMaterialIdValidator,
  body("remark").optional().isString().withMessage("Remark must be a string."),
];

export const productIdValidator = [
  param("productId").isMongoId().withMessage("Invalid product ID."),
];

export const centerQueryValidator = [
  query("centerId")
    .optional({ values: "falsy" })
    .isMongoId()
    .withMessage("Invalid center ID."),
];

export const listTestingMaterialValidator = [
  query("page")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer."),
  query("limit")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer."),
  query("sortOrder")
    .optional({ values: "falsy" })
    .isIn(["asc", "desc"])
    .withMessage("sortOrder must be asc or desc."),
  query("fromCenter")
    .optional({ values: "falsy" })
    .isMongoId()
    .withMessage("Invalid fromCenter ID."),
  query("toCenter")
    .optional({ values: "falsy" })
    .isMongoId()
    .withMessage("Invalid toCenter ID."),
  optionalDate("startDate"),
  optionalDate("endDate"),
];