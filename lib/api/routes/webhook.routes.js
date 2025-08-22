"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webhook_controller_1 = require("../controllers/webhook.controller");
const router = express_1.default.Router();
// POST /api/webhook/taxi-data
router.post('/taxi-data', webhook_controller_1.receiveTaxiData);
exports.default = router;
