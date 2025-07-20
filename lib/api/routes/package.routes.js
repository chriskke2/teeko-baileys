"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const package_controller_1 = require("../controllers/package.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
// Apply the authentication middleware to all routes in this file
router.use(auth_middleware_1.default);
// POST /api/packages/add
router.post('/add', package_controller_1.addPackage);
// GET /api/packages/
router.get('/', package_controller_1.getAllPackages);
// GET /api/packages/:packageId
router.get('/:packageId', package_controller_1.getPackageById);
// DELETE /api/packages/:packageId
router.delete('/:packageId', package_controller_1.deletePackage);
// PUT /api/packages/:packageId
router.put('/:packageId', package_controller_1.updatePackage);
exports.default = router;
