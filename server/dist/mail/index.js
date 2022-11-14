"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const sendEmail = (destination, subject, text) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        try {
            const transporter = nodemailer_1.default.createTransport({
                host: process.env.MAIL_URL,
                port: process.env.MAIL_PORT,
                secure: false,
                ignoreTLS: true
            });
            transporter.verify(function (error, success) {
                if (error) {
                    console.log("Email connection failed: " + error);
                    return 0;
                }
                else {
                    console.log("Email connection successful");
                    return 1;
                }
            });
            transporter.sendMail({
                from: "david.huang.2@stonybrook.edu",
                to: destination,
                subject: subject,
                text: text,
            }, (err, data) => {
                if (err) {
                    console.log("Email failed to send: " + err);
                    resolve(false);
                }
                else {
                    console.log("Email successfully sent: " + data);
                    resolve(true);
                }
            });
        }
        catch (err) {
            console.log("Email failed to send: " + err);
            resolve(false);
        }
    });
});
exports.default = sendEmail;
//# sourceMappingURL=index.js.map