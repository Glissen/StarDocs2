"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class authManager {
}
exports.default = authManager;
authManager.verifyJWT = (token) => {
    try {
        if (!token)
            return null;
        const verified = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        return verified.userId;
    }
    catch (e) {
        console.log("verifyJWT error: " + e);
        return null;
    }
};
authManager.signJWT = (user) => {
    return jsonwebtoken_1.default.sign({
        userId: user._id
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
};
//# sourceMappingURL=index.js.map