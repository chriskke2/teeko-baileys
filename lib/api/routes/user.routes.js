"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
// Apply the authentication middleware to all routes in this file
router.use(auth_middleware_1.default);
// POST /api/users/subscribe
router.post('/subscribe', user_controller_1.addUser);
// POST /api/users/activate
router.post('/activate', user_controller_1.activateUser);
// POST /api/users/start-onboarding
router.post('/start-onboarding', user_controller_1.startOnboarding);
// POST /api/users/send-image
router.post('/send-image', user_controller_1.sendImageMessage);
// POST /api/users/send-image-from-db
router.post('/send-image-from-db', user_controller_1.sendImageFromDb);
// POST /api/users/send-image-by-name
router.post('/send-image-by-name', user_controller_1.sendImageByName);
// GET /api/users/
router.get('/', user_controller_1.getAllUsers);
// DELETE /api/users/:userId
router.delete('/:userId', user_controller_1.deleteUser);
exports.default = router;
