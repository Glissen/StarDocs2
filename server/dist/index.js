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
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
const mail_1 = __importDefault(require("./mail"));
const user_model_1 = __importDefault(require("./models/user-model"));
const token_model_1 = __importDefault(require("./models/token-model"));
const auth_1 = __importDefault(require("./auth"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = parseInt(process.env.EXPRESS_PORT);
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
const signup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, password } = req.body;
        console.log("Signup received:", name, email, password);
        if (!name || !email || !password) {
            console.error("/users/signup: Missing user credentials");
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }
        const existingName = yield user_model_1.default.findOne({ name: name });
        const existingEmail = yield user_model_1.default.findOne({ email: email });
        if (existingName || existingEmail) {
            console.error("/users/signup: User with this credential already exists");
            return res.status(200).send({ error: true, message: "User with this credential already exists" });
        }
        const salt = yield bcryptjs_1.default.genSalt();
        const passwordHash = yield bcryptjs_1.default.hash(password, salt);
        const newUser = new user_model_1.default({
            name: name,
            password: passwordHash,
            email: email,
            verified: false,
        });
        const newToken = new token_model_1.default({
            email: newUser.email,
            token: crypto_1.default.randomBytes(32).toString("hex")
        });
        yield newToken.save();
        const link = 'http://duolcpu.cse356.compas.cs.stonybrook.edu/users/verify?' + "email=" + encodeURIComponent(newUser.email) + "&key=" + encodeURIComponent(newToken.token);
        console.log(link);
        const sent = yield (0, mail_1.default)(newUser.email, link, link);
        if (!sent) {
            console.error("/users/signup: Verification email failed to send");
            return res.status(200).send({ error: true, message: "An error has occurred" });
        }
        yield newUser.save();
        console.log("/users/signup: New user successfully added \n", name, passwordHash, email);
        return res.status(200).send({});
    }
    catch (e) {
        console.error("/users/signup: Error occurred: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
});
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        console.log("Login received:", email, password);
        if (!email || !password) {
            console.error("/users/login: Missing user credentials");
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }
        const existingUser = yield user_model_1.default.findOne({ email: email });
        if (!existingUser) {
            console.error("/users/login: User does not exist");
            return res.status(200).send({ error: true, message: "User does not exist" });
        }
        if (!existingUser.verified) {
            console.error("/users/login: User account not verified");
            return res.status(200).send({ error: true, message: "User account not verified" });
        }
        const match = yield bcryptjs_1.default.compare(password, existingUser.password);
        if (match) {
            const token = auth_1.default.signJWT(existingUser);
            console.log("/users/login: User successfully logged in");
            return res.cookie("token", token, {
                httpOnly: true
            }).status(200).send({ name: existingUser.name });
        }
        else
            return res.status(200).send({ error: true, message: "User credentials incorrect" });
    }
    catch (e) {
        console.error("/users/login: Error occured: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
});
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("/users/logout: User successfully logged out");
        return yield res.cookie("token", "", {
            httpOnly: true,
        }).status(200).send({});
    }
    catch (e) {
        console.error("/users/logout: Error occurred: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
});
const verify = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(req.query);
        const { email, key } = req.query;
        if (!email || !key) {
            console.error("/users/verify: Missing user credentials");
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }
        const foundToken = yield token_model_1.default.findOneAndDelete({ token: key });
        if (!foundToken || email != foundToken.email) {
            console.error("/users/verify: Link expired");
            return res.status(200).send({ error: true, message: "This link has expired" });
        }
        const user = yield user_model_1.default.findOne({ email: email });
        if (!user) {
            console.error("/users/verify: User does not exist");
            return res.status(200).send({ error: true, message: "User does not exist" });
        }
        user.verified = true;
        yield user.save();
        console.log("/users/verify: New user successfully verified");
        return res.status(200).send({ status: 'OK' });
    }
    catch (err) {
        console.error("/users/verify: New user verification failed: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
});
const getUserNameAndId = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cookie } = req.body;
        if (!cookie) {
            console.error("/users/getusernameandid: Missing parameter");
            return res.status(200).send({ error: true, message: "Missing parameter" });
        }
        const id = auth_1.default.verifyJWT(cookie);
        if (!id) {
            console.error("/users/getusernameandid: Incorrect or expired cookie");
            return res.status(200).send({ error: true, message: "Incorrect or expired cookie" });
        }
        const user = yield user_model_1.default.findById({ _id: id });
        if (!user) {
            console.error("/users/getusernameandid: Fail to find user");
            return res.status(200).send({ error: true, message: "Fail to find user" });
        }
        if (!user.verified) {
            console.error("/users/getusernameandid: User not verified");
            return res.status(200).send({ error: true, message: "User not verified" });
        }
        console.log("/users/getusernameandid: Found user", user.name, id);
        return res.status(200).send({ name: user.name, id: id });
    }
    catch (err) {
        console.error("/users/getusernameandid: Get user name and id failed: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
});
app.post("/users/signup", signup);
app.post("/users/login", login);
app.post("/users/logout", logout);
app.get("/users/verify", verify);
app.post("/users/getusernameandid", getUserNameAndId);
// db
db_1.default.on('error', console.error.bind(console, 'MongoDB connection error: '));
// listen on port
app.listen(port, (err) => {
    if (err) {
        return console.error(err);
    }
    return console.log(`server is listening on ${port}`);
});
//# sourceMappingURL=index.js.map