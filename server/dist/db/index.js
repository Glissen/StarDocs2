"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
mongoose_1.default.connect(process.env.MONGO_URL, { dbName: process.env.MONGO_DBNAME, user: process.env.MONGO_USER, pass: process.env.MONGO_PASS })
    .then(() => {
    console.log('Connected to database');
})
    .catch(e => {
    console.error('Connection error', e.message);
});
const db = mongoose_1.default.connection;
exports.default = db;
//# sourceMappingURL=index.js.map