import express from 'express';
import bycrypt from 'bcryptjs'
import crypto from 'crypto'
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import db from './db'
import sendEmail from './mail'
import User from './models/user-model'
import Token from './models/token-model'
import auth from './auth';

import S3 from 'aws-sdk/clients/s3'
import session from 'express-session';
import Document from './models/document-model';

import mongoose, { ObjectId } from 'mongoose'

import * as Y from 'yjs';

dotenv.config();
const app: express.Application = express();
const port: number = parseInt(process.env.EXPRESS_PORT);
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.raw({
    type: ['image/png', 'image/jpeg'],
    limit: '10mb'
}))
app.use(session({
    secret: "aveuCJmh0xCwdUg69gmWMSEALHizb2IENAAKZApMNeFsP9FqgI54GpcuAWHjNfCe",
    saveUninitialized: false,
    resave: false
}));


const recentDocument = Array<document>()
const ydocs: Map<string, ydoc> = new Map();

const addToRecent = (document: document): void => {
    const index = recentDocument.findIndex((element) => { return element.id.toHexString() === document.id.toHexString() });
    if (index !== -1)
        recentDocument.splice(index, 1);
    recentDocument.splice(0, 0, document);
}

const makeId = () => {
    let ID = "";
    let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 16; i++) {
        ID += characters.charAt(Math.floor(Math.random() * 62));
    }
    return ID;
}

const getUserNameAndId = async (cookie) => {
    try {
        if (!cookie) {
            console.error("/users/getusernameandid: Missing parameter");
            return null;
        }
        const id = auth.verifyJWT(cookie);
        if (!id) {
            console.error("/users/getusernameandid: Incorrect or expired cookie");
            return null
        }
        const user = await User.findById({ _id: id });
        if (!user) {
            console.error("/users/getusernameandid: Fail to find user");
            return null
        }
        if (!user.verified) {
            console.error("/users/getusernameandid: User not verified");
            return null
        }
        console.log("/users/getusernameandid: Found user", user.name, id)
        return { name: user.name, id: id }
    }
    catch (err) {
        console.error("/users/getusernameandid: Get user name and id failed: " + err);
        return null
    }
}

const signup = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        console.log("Signup received:", name, email, password);

        if (!name || !email || !password) {
            console.error("/users/signup: Missing user credentials")
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }

        const existingName = await User.findOne({ name: name });
        const existingEmail = await User.findOne({ email: email });
        if (existingName || existingEmail) {
            console.error("/users/signup: User with this credential already exists");
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
            console.error("/users/signup: Verification email failed to send");
            return res.status(200).send({ error: true, message: "An error has occurred" });
        }

        await newUser.save();
        console.log("/users/signup: New user successfully added \n", name, passwordHash, email);
        return res.status(200).send({});
    }
    catch (e) {
        console.error("/users/signup: Error occurred: " + e);
        return res.status(200).send({ error: true, message: "An error has occurred" })
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("Login received:", email, password);
        if (!email || !password) {
            console.error("/users/login: Missing user credentials")
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }

        const existingUser = await User.findOne({ email: email });
        if (!existingUser) {
            console.error("/users/login: User does not exist");
            return res.status(200).send({ error: true, message: "User does not exist" });
        }

        if (!existingUser.verified) {
            console.error("/users/login: User account not verified");
            return res.status(200).send({ error: true, message: "User account not verified" });
        }

        const match = await bycrypt.compare(password, existingUser.password);
        if (match) {
            const token = auth.signJWT(existingUser);

            console.log("/users/login: User successfully logged in")
            req.session.session_id = makeId();
            req.session.name = existingUser.name;
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
}

const logout = async (req, res) => {
    try {
        console.log("/users/logout: User successfully logged out")
        return await res.cookie("token", "", {
            httpOnly: true,

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
            console.error("/users/verify: Missing user credentials")
            return res.status(200).send({ error: true, message: "Missing user credentials" });
        }

        const foundToken = await Token.findOneAndDelete({ token: key });
        if (!foundToken || email != foundToken.email) {
            console.error("/users/verify: Link expired");
            return res.status(200).send({ error: true, message: "This link has expired" });
        }

        const user = await User.findOne({ email: email });
        if (!user) {
            console.error("/users/verify: User does not exist");
            return res.status(200).send({ error: true, message: "User does not exist" });
        }

        user.verified = true;
        await user.save();

        console.log("/users/verify: New user successfully verified")
        return res.status(200).send({ status: 'OK' });
    }
    catch (err) {
        console.error("/users/verify: New user verification failed: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const mediaUpload = async (req, res) => {
    try {
        console.log("mediaUpload receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/media/upload: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }
        
        const file = req.body;
        const contentType = req.header('content-type');
        console.log("mediaUpload receive file: contentType: " + contentType);

        if (!file) {
            return res.status(200).send({ error: true, message: "Missing file" });
        }
        // if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
        //     return res.status(200).send({ error: true, message: "Only accept jpeg/png file" });
        // }

        const key = makeId()

        const s3 = new S3({
            endpoint: process.env.S3_ENDPOINT,
            accessKeyId: process.env.S3_ACCESSKEYID,
            secretAccessKey: process.env.S3_SECRETACCESSKEY,
            sslEnabled: true
        });

        const params = {
            Bucket: "images",
            Body: file,
            Key: key,
            ContentType: contentType
        }

        s3.putObject(params, (error, data) => {
            if (error) {
                console.log(error);
                return res.status(200).send({ error: true, message: "Fail to put in" });
            }
            else {
                console.log("Media stored -- Key: ", key);
                console.log(data);
                return res.status(200).send({ mediaid: key });
            }
        })
    }
    catch (err) {
        console.error("/media/upload: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }

}

const mediaAccess = async (req, res) => {
    try {
        console.log("mediaAccess receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/media/access: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }
        
        const mediaid = req.params.mediaid;
        if (!mediaid) {
            res.status(200).json({ error: true, message: "Missing mediaid" });
        }

        const s3 = new S3({
            endpoint: process.env.S3_ENDPOINT,
            accessKeyId: process.env.S3_ACCESSKEYID,
            secretAccessKey: process.env.S3_SECRETACCESSKEY,
            sslEnabled: true
        });

        const params = {
            Bucket: "images",
            Key: mediaid,
        }

        s3.getObject(params, (error, data) => {
            if (error) {
                console.log(error);
                return res.status(200).send({ error: true, message: "fail to get image" });
            }
            else {
                console.log("Media Retrieved");
                const contentType = data.ContentType;
                res.set({ 'Content-Type': contentType });
                return res.status(200).send(data.Body);
            }
        })
    }
    catch (err) {
        console.error("/media/access: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}


const collectionList = async (req, res) => {
    try {
        console.log("collectionList receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/collection/list: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }
        
        let response = Array<document>();
        for (let index = 0; index < recentDocument.length && index < 10; index++) {
            response.push(recentDocument[index]);
        }
        return res.status(200).send(response);
    }
    catch (err) {
        console.error("/collection/list: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const collectionCreate = async (req, res) => {
    try {
        console.log("collectionCreate receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/collection/create: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }
        
        const { name } = req.body;
        if (!name) {
            console.error("/collection/create: Missing document name")
            res.status(200).json({ error: true, message: "Missing document name" });
        }

        const doc = new Document({
            name: name
        });

        await doc.save();
        const id = doc._id;
        addToRecent({ name: name, id: id })
        console.log("/collection/create: Created document:" + name, id)
        const ydoc = {
            doc: new Y.Doc(),
            clients: new Map()
        };
        ydocs.set(id.toString(), ydoc)
        return res.status(200).send({ id: id })
    }
    catch (err) {
        console.error("/collection/list: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const collectionDelete = async (req, res) => {
    try {
        console.log("collectionDelete receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/collection/delete: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }
        
        const { id } = req.body;
        if (!id) {
            console.error("/collection/delete: Missing document id")
            return res.status(200).send({ error: true, message: "Missing document id" });
        }
        const doc = await Document.findOneAndDelete({ _id: id });
        if (doc) {
            const index = recentDocument.findIndex((element) => { return element.id.toHexString() === doc._id.toHexString() });
            if (index !== -1)
                recentDocument.splice(index, 1);
            // TODO: delete ydoc and disconnect all clients
            // const ydoc = ydocs.get(doc._id.toString());
            // if (!ydoc) {
            //     console.error("/api/delete: Fail to find document with id from map: " + id)
            //     return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
            // }

            // ydocs.delete(doc._id.toString());
            return res.status(200).send({});
        }
        else {
            console.error("/api/delete: Fail to find document with id from db: " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }
    }
    catch (err) {
        console.error("/collection/delete: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}


const connect = async (req, res) => {
    try {
        console.log("apiConnect receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/api/connect: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }

        const id = req.params.id

        if (!id) {
            console.error("/api/connect: Missing document id")
            return res.status(200).send({ error: true, message: "Missing document id" });
        }
        const doc = await Document.findById({ _id: id });
        if (!doc) {
            console.error("/api/connect: Fail to find document with id: " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }

        const ydoc = ydocs.get(doc._id.toString());
        if (!ydoc) {
            console.error("/api/connect: Fail to find document with id: " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }

        const headers = {
            'Content-Type': 'text/event-stream',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
        };
        res.writeHead(200, headers);

        const clientId: string = req.session.session_id
        ydoc.clients.set(clientId, {
            name: req.session.name,
            cursor: {},
            response: res
        });
        console.log("Connecting client " + clientId + " to doc " + id)

        res.write("event: sync\ndata: " + Y.encodeStateAsUpdate(ydoc.doc).toString() + "\n\n")

        ydoc.clients.forEach((client, key) => {
            if (key !== clientId) {
                res.write("event: presence\ndata: " + JSON.stringify({ session: key, name: client.name, cursor: client.cursor }) + "\n\n")
            }
            client.response.write("event: presence\ndata: " + JSON.stringify({ session: clientId, name: req.session.name, cursor: {} }) + "\n\n")
        })

        res.on('close', () => {
            console.log(`${clientId} Connection closed`);
            let tempdoc = ydocs.get(doc._id.toString());
            if (tempdoc) {
                tempdoc.clients.delete(clientId)
                tempdoc.clients.forEach((client) => {
                    client.response.write("event: presence\ndata: " + JSON.stringify({ session_id: clientId, name: req.session.name, cursor: {} }) + "\n\n");
                })
            }
        });
    }
    catch (err) {
        console.error("/api/connect: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const op = async (req, res) => {
    try {
        console.log("apiOP receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/api/op: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }

        const update: string = req.body.update;
        const id: string = req.params.id;
        if (!id) {
            console.error("/api/op: Missing document id")
            return res.status(200).send({ error: true, message: "Missing document id" });
        }
        const doc = await Document.findById({ _id: id });
        if (!doc) {
            console.error("/api/op: Fail to find document with id: " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }

        console.log("Doc " + id + " receives Update: " + update)
        const ydoc = ydocs.get(doc._id.toString());
        if (ydoc) {
            console.log("Found doc " + id)
            console.log("Text before update: " + ydoc.doc.getText().toString())
            Y.applyUpdate(ydoc.doc, Uint8Array.from(update.split(',').map(x => parseInt(x, 10))));
            console.log("Text after update: " + ydoc.doc.getText().toString())
            addToRecent({ name: doc.name, id: doc._id })
            ydoc.clients.forEach((client, key) => {
                client.response.write("event: update\ndata: " + update + "\n\n");
                console.log("Sending update to client " + key)
            });
        }
        else {
            console.log("Fail to find doc " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }
        res.send({});
    }
    catch (err) {
        console.error("/api/op: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const presence = async (req, res) => {
    try {
        console.log("apiPresence receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/api/presence: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }

        const clientId = req.session.session_id

        const { index, length } = req.body;
        if (index === undefined || index === null || length === undefined || length === null) {
            console.error("/api/presence: Missing parameter")
            res.status(200).json({ error: true, message: "Missing parameter" });
        }
        const id: string = req.params.id;
        if (!id) {
            console.error("/api/presence: Missing document id")
            return res.status(200).send({ error: true, message: "Missing document id" });
        }
        const doc = await Document.findById({ _id: id });
        if (!doc) {
            console.error("/api/presence: Fail to find document with id: " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }

        const ydoc = ydocs.get(doc._id.toString());
        if (ydoc) {
            console.log("Found doc " + id)
            const tmpclient = ydoc.clients.get(clientId)
            if (!tmpclient) {
                console.error("/api/presence: Fail to find client with id: " + clientId)
                return res.status(200).send({ error: true, message: "Fail to find client with id: " + clientId });
            }
            tmpclient.cursor = { index: index, length: length }
            ydoc.clients.forEach((client, key) => {
                client.response.write("event: presence\ndata: " + JSON.stringify({ session_id: clientId, name: tmpclient.name, cursor: tmpclient.cursor }) + "\n\n");
                console.log("Sending presence to client " + key)
            });
        }
        else {
            console.log("Fail to find doc " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }
        res.send({});
    }
    catch (err) {
        console.error("/api/presence: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}
app.post('/collection/create', collectionCreate);
app.post('/collection/delete', collectionDelete);
app.get('/collection/list', collectionList);

app.get('/api/connect/:id', connect);
app.post('/api/connect/:id', connect);
app.post('/api/op/:id', op);
app.post('/api/presence/:id', presence)

app.post('/media/upload', mediaUpload);
app.get('/media/access/:mediaid', mediaAccess);

app.post("/users/signup", signup)
app.post("/users/login", login)
app.post("/users/logout", logout)
app.get("/users/verify", verify)

// db
db.on('error', console.error.bind(console, 'MongoDB connection error: '))

// listen on port
app.listen(port, (err?) => {
    if (err) {
        return console.error(err);
    }
    return console.log(`server is listening on ${port}`);
});


type document = {
    name: string,
    id: mongoose.Types.ObjectId
}


type ydoc = {
    doc: any,
    clients: Map<string, client>
}

type client = {
    name: string,
    cursor: { index: number, length: number } | {},
    response: any
}