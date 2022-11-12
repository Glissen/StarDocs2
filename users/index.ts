import express from 'express';
import bycrypt from 'bcryptjs'
import crypto from 'crypto'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import db from './db'
import sendEmail from './mail'
import User from './models/user-model'
import Token from './models/token-model'
import auth from './auth';

const app: express.Application = express();
const port: number = parseInt(process.env.EXPRESS_PORT);
app.use(express.json());
app.use(cookieParser());
dotenv.config();

const singup = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        console.log("Signup received:", name, email, password);

        if (!name || !email || !password) {
            console.log("/users/signup: Missing user credentials")
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }

        const existingName = await User.findOne({ name: name });
        const existingEmail = await User.findOne({ email: email });
        if (existingName || existingEmail) {
            console.log("/users/signup: User with this credential already exists");
            return res.status(200).send({ error: true, message: "User with this credential already exists" });
        }

        const salt = await bycrypt.genSalt();
        const passwordHash = await bycrypt.hash(password, salt);

        const newUser = new User({
            name: name,
            password: passwordHash,
            email: email,
            verified: false,
        });

        const newToken = new Token({
            email: newUser.email,
            token: crypto.randomBytes(32).toString("hex")
        });

        await newToken.save();

        const link = 'http://duolcpu.cse356.compas.cs.stonybrook.edu/users/verify?' + "email=" + encodeURIComponent(newUser.email) + "&key=" + encodeURIComponent(newToken.token);
        console.log(link)

        const sent = await sendEmail(newUser.email, link, link);
        if (!sent) {
            console.log("/users/signup: Verification email failed to send");
            return res.status(200).send({ error: true, message: "An error has occurred" });
        }

        await newUser.save();
        console.log("/users/signup: New user successfully added \n", name, passwordHash, email);
        return res.status(200).send({});
    }
    catch (e) {
        console.log("/users/signup: Error occurred: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" })
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("Login received:", email, password);
        if (!email || !password) {
            console.log("/users/login: Missing user credentials")
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }

        const existingUser = await User.findOne({ email: email });
        if (!existingUser) {
            console.log("/users/login: User does not exist");
            return res.status(200).send({ error: true, message: "User does not exist" });
        }

        if (!existingUser.verified) {
            console.log("/users/login: User account not verified");
            return res.status(200).send({ error: true, message: "User account not verified" });
        }

        const match = await bycrypt.compare(password, existingUser.password);
        if (match) {
            const token = auth.signJWT(existingUser);

            console.log("/users/login: User successfully logged in")
            return res.cookie("token", token, {
                httpOnly: true
            }).status(200).send({ name: existingUser.name });
        }
        else
            return res.status(200).send({ error: true, message: "User credentials incorrect" });
    }
    catch (e) {
        console.log("/users/login: Error occured: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const logout = async (req, res) => {
    try {
        console.log("/users/logout: User successfully logged out")
        return await res.cookie("token", "", {
            httpOnly: true
        }).status(200).send({});
    }
    catch (e) {
        console.error("/users/logout: Error occurred: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const verify = async (req, res) => {
    try {
        console.log(req.query)
        const { email, key } = req.query;

        if (!email || !key) {
            console.log("/users/verify: Missing user credentials")
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }

        const foundToken = await Token.findOneAndDelete({ token: key });
        if (!foundToken || email != foundToken.email) {
            console.log("/users/verify: Link expired");
            return res.status(200).send({ error: true, message: "This link has expired" });
        }

        const user = await User.findOne({ email: email });
        if (!user) {
            console.log("/users/verify: User does not exist");
            return res.status(200).send({ error: true, message: "User does not exist" });
        }

        user.verified = true;
        await user.save();

        console.log("/users/verify: New user successfully verified")
        return res.status(200).send({});
    }
    catch (err) {
        console.error("/users/verify: New user verification failed: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const getUserNameAndId = async (req, res) => {
    try {
        const {cookie} = req.body;
        if (!cookie) {
            console.error("/users/getusernameandid: Missing parameter");
            return res.status(200).send({ error: true, message: "Missing parameter" })
        }
        const id = auth.verifyJWT(cookie);
        if (!id) {
            console.error("/users/getusernameandid: Incorrect or expired cookie");
            return res.status(200).send({ error: true, message: "Incorrect or expired cookie" })
        }
        const user = await User.findById({ _id: id });
        if (!user) {
            console.error("/users/getusernameandid: Fail to find user");
            return res.status(200).send({ error: true, message: "Fail to find user" })
        }
        if (!user.verified) {
            console.error("/users/getusernameandid: User not verified");
            return res.status(200).send({ error: true, message: "User not verified" })
        }
        console.log("/users/getusernameandid: Found user", user.name, id)
        return res.status(200).send({ name: user.name, id: id });
    }
    catch (err) {
        console.error("/users/getusernameandid: Get user name and id failed: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

app.post("/users/signup", singup)
app.post("/users/login", login)
app.post("/users/logout", logout)
app.get("/users/verify", verify)
app.post("/users/getusernameandid", getUserNameAndId)

// db
db.on('error', console.error.bind(console, 'MongoDB connection error: '))

// listen on port
app.listen(port, (err?) => {
    if (err) {
        return console.error(err);
    }
    return console.log(`server is listening on ${port}`);
});