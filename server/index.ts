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
import Mime from './models/mime-model';
import auth from './auth';

import S3 from 'aws-sdk/clients/s3'
import session from 'express-session';

const multer = require('multer')
const multerS3 = require('multer-s3')

require('events').EventEmitter.defaultMaxListeners = 64;

import * as Y from 'yjs';

dotenv.config();
const app: express.Application = express();
const PORT: number = parseInt(process.env.EXPRESS_PORT);
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
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
    const index = recentDocument.findIndex((element) => { return element.id === document.id });
    if (index === 0) {
        return
    }
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

const { Client } = require('@elastic/elasticsearch')
const elasticClient = new Client({
    node: 'http://new.renge.io:9200'
})

const bulkUpdate = async() => {
    ydocs.forEach((ydoc, key) => {
        if (ydoc.updated) {
            ydoc.updated = false;
            elasticUpdateDoc(ydoc.name, ydoc.doc.getText(), key);
        }
    })

}

const elasticCreateDoc = async(name: string) => {
    const result = await elasticClient.index({
        index: 'docs',
        document: {
            name: name,
            content: '',
        },
        refresh: true,      // true || 'wait_for'
    });
    return result;
}

const elasticUpdateDoc = async(name: string, text: string, id: string) => {
    elasticClient.index({
        index: 'docs',
        id: id,
        document: {
            name: name,
            content: text,
        },
        refresh: true,      // true || 'wait_for'
    });
}

const elasticDeleteDoc = async(id: string) => {
    elasticClient.delete({
        index: 'docs',
        id: id,
        type: '_doc',
        //refresh: "wait_for",      // true || 'wait_for'
    });
}

const elasticSearch = async(query: string) => {
    return await elasticClient.search({
        index: 'docs',
        query: {
            multi_match: {
                query: query,
                fields: [
                    "name",
                    "content"
                ]
            }
        },
        highlight: {
            fields: {
                name: {},
                content: {}
            }
        },
        from: 0,
        size: 10,
        _source: [
            "name"
        ]
    });
}

const elasticSuggest = async(query: string) => {
    const result = await elasticClient.search({
        query: {
            bool: {
                should: [
                    {
                        match_phrase_prefix: {
                            content: query
                        }
                    },
                    {
                        match_phrase_prefix: {
                            name: query
                        }
                    }
                ]
            }
        },
        highlight: {
            boundary_scanner: "word",
            fields: {
                "content": {},
                "name": {}
            }
        },
        from: 0,
        size: 10,
        _source: [""]
    })
    return result;
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
        //console.log("/users/getusernameandid: Found user", user.name, id)
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

        res.status(200).send({});
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
        //console.log(link)

        const sent = await sendEmail(newUser.email, link, link);
        // if (!sent) {
        //     console.error("/users/signup: Verification email failed to send");
        //     return res.status(200).send({ error: true, message: "An error has occurred" });
        // }
        
        
        //console.log("/users/signup: New user successfully added \n", name, passwordHash, email);
        newUser.save();
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

            //console.log("/users/login: User successfully logged in")
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
        req.session.session_id = undefined;
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
        //console.log(req.query)
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

const s3 = new S3({
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESSKEYID,
    secretAccessKey: process.env.S3_SECRETACCESSKEY,
    sslEnabled: true
});

const uploadS3 = multer({
    storage: multerS3({
      s3: s3,
      acl: 'public-read',
      bucket: 'images',
      key: (req, file, cb) => {
        cb(null, makeId())
      }
    })
  });


const mediaUpload = async (req, res) => { 
    console.log(req.file);
    if (!req.session.session_id) {
        const user = await getUserNameAndId(req.cookies.token)
        if (!user) {
            console.error("/media/upload: Unauthorized user")
            return res.status(200).send({ error: true, message: "Unauthourized user" });
        }
        req.session.session_id = makeId();
        req.session.name = user.name;
    }

    if (req.file.mimetype !== "image/png" && req.file.mimetype !== "image/jpeg" && req.file.mimetype !== "image/gif") {
        return res.status(200).send({ error: true, message: "whatever" });
    }

    const mime = new Mime({
        mimeType: req.file.mimetype,
        mediaid: req.file.key,
    })
    await mime.save();

    return res.status(200).send({ mediaid: req.file.key });
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

        s3.getObject(params, async (error, data) => {
            if (error) {
                console.log(error);
                return res.status(200).send({ error: true, message: "fail to get image" });
            }
            else {
                //console.log("Media Retrieved");
                //console.log(data);
                const mime = await Mime.findOne({ mediaid: mediaid });
                const contentType = mime.mimeType;
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
        // console.log("collectionList receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
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

        //const id = makeId();
        const result = await elasticCreateDoc(name);
        addToRecent({ name: name, id: result._id })
        //console.log("/collection/create: Created document:" + name, id)
        const ydoc = {
            doc: new Y.Doc(),
            name: name,
            updated: false,
            clients: new Map(),
            cursors: new Map()
        };
        ydocs.set(result._id, ydoc)
        return res.status(200).send({ id: result._id })
        // TODO: check error
    }
    catch (err) {
        console.error("/collection/create: Error occurred: " + err);
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
        const doc = ydocs.get(id)
        if (doc) {
            const index = recentDocument.findIndex((element) => { return element.id === id });
            if (index !== -1)
                recentDocument.splice(index, 1);
            doc.clients.forEach(client => {
                client.response.status(200).send();
            })
            res.status(200).send({});
            return await elasticDeleteDoc(id)
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

        const ydoc = ydocs.get(id);
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
        ydoc.clients.set(clientId, 
            {response: res}
        );
        //console.log("Connecting client " + clientId + " to doc " + id)

        res.write("event: sync\ndata: " + Y.encodeStateAsUpdate(ydoc.doc).toString() + "\n\n")

        ydoc.cursors.forEach((cursor, key) => {
            // if (key !== clientId) {
                res.write("event: presence\ndata: " + JSON.stringify({ session: key, name: cursor.name, cursor: cursor.cursor }) + "\n\n")
            // }
        })

        res.on('close', () => {
            console.log(`${clientId} Connection closed`);
            let doc = ydocs.get(id);
            if (doc) {
                doc.clients.delete(clientId)
                doc.cursors.delete(clientId)
                doc.clients.forEach((client) => {
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
        // console.log("apiOP receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
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

        // console.log("Doc " + id + " receives Update: " + update)
        const ydoc = ydocs.get(id);
        if (ydoc) {
            ydoc.updated = true;
            res.send({});
            // console.log("Found doc " + id)
            // console.log("Text before update: " + ydoc.doc.getText().toString())
            Y.applyUpdate(ydoc.doc, Uint8Array.from(update.split(',').map(x => parseInt(x, 10))));
            // console.log("Text after update: " + ydoc.doc.getText().toString())

            //await elasticUpdateDoc(ydoc.name, ydoc.doc.getText(), id);
            // TODO: check error
            

            addToRecent({ name: ydoc.name, id: id })
            return ydoc.clients.forEach((client, key) => {
                client.response.write("event: update\ndata: " + update + "\n\n");
                // console.log("Sending update to client " + key)
            });
            // return setTimeout(function(){
                
            // }, 200);
        }
        else {
            console.log("Fail to find doc " + id)
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }
        
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

        const ydoc = ydocs.get(id);
        if (ydoc) {
            //console.log("Found doc " + id)
            let tmpcursor = ydoc.cursors.get(clientId)
            if (!tmpcursor) {
                tmpcursor = {name: req.session.name, cursor: {}}
            }
            tmpcursor.cursor = { index: index, length: length }
            ydoc.cursors.set(clientId, tmpcursor)
            ydoc.clients.forEach((client, key) => {
                client.response.write("event: presence\ndata: " + JSON.stringify({ session_id: clientId, name: tmpcursor.name, cursor: tmpcursor.cursor }) + "\n\n");
                //console.log("Sending presence to client " + key)
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

const search = async (req, res) => {
    try {
        //console.log("search receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/index/search: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }

        const { q } = req.query;

        const result = await elasticSearch(q);

        const size = result.hits.hits.length;
        const ans = new Array(size);

        for (let index = 0; index < size; index++) {
            const element = result.hits.hits[index];
            const hl = element.highlight.name ? element.highlight.name[0] : element.highlight.content[0];
            ans[index] = {docid: element._id, name: element._source.name, snippet: hl};
        }

        res.status(200).send(ans);
    }
    catch (err) {
        console.error("/index/search: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}


const suggest = async (req, res) => {
    try {
        //console.log("search receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            if (!user) {
                console.error("/index/suggest: Unauthorized user")
                return res.status(200).send({ error: true, message: "Unauthourized user" });
            }
            req.session.session_id = makeId();
            req.session.name = user.name;
        }

        const { q } = req.query;

        const result = await elasticSuggest(q);

        const size = result.hits.hits.length;
        const ans = new Set();

        for (let index = 0; index < size; index++) {
            const element = result.hits.hits[index];
            if (element.highlight.name) {
                for (let i = 0; i < element.highlight.name.length; i ++) {
                    let word = element.highlight.name[i];
                    ans.add(word.slice(4, -5).toLowerCase());
                }
            }
            if (element.highlight.content) {
                for (let i = 0; i < element.highlight.content.length; i ++) {
                    let word = element.highlight.content[i];
                    ans.add(word.slice(4, -5).toLowerCase());
                }
            }
        }
        
        res.status(200).send(Array.from(ans));
    }
    catch (err) {
        console.error("/index/suggest: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}



app.get('/index/search', search);
app.get('/index/suggest', suggest);

app.post('/collection/create', collectionCreate);
app.post('/collection/delete', collectionDelete);
app.get('/collection/list', collectionList);

app.get('/api/connect/:id', connect);
app.post('/api/connect/:id', connect);
app.post('/api/op/:id', op);
app.post('/api/presence/:id', presence)

app.post('/media/upload', uploadS3.single("file"), mediaUpload);
app.get('/media/access/:mediaid', mediaAccess);

app.post("/users/signup", signup)
app.post("/users/login", login)
app.post("/users/logout", logout)
app.get("/users/verify", verify)

app.use("/library", express.static('library'))

app.use("/edit", express.static('edit'))
app.use("/edit/:id", (req, res) => {
    res.set("Content-Type", "text/html")
    return res.status(200).send('<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>MP1</title><script defer="defer" src="/edit/static/js/main.3027cd66.js"></script><link href="/edit/static/css/main.2ce06e37.css" rel="stylesheet"></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><hr><p>This is a test of the CRDT library.</p><p>If the basic functionality of the library works correctly, you should see &quot;Hello <b>World</b>!&quot; above,<br/>preceded by the sequence of CRDT updates that could be sent to the client to construct this string.</p></body></html>');
})
app.use("/home", express.static('home', {
    setHeaders: function (res, path) {
        res.set('X-CSE356', "6306d31458d8bb3ef7f6bbe1");
    }
}))



// db
db.on('error', console.error.bind(console, 'MongoDB connection error: '))

// listen on port
app.listen(PORT, (err?) => {
    if (err) {
        return console.error(err);
    }
    return console.log(`Server is listening on ${PORT}`);
});

const interval = setInterval(function() {
    bulkUpdate();
}, 2000);


type document = {
    name: string,
    id: string
}


type ydoc = {
    doc: any,
    name: string,
    updated: boolean
    clients: Map<string, client>,
    cursors: Map<string, cursor>
}

type client = {
    response: any
}

type cursor = {
    name: string,
    cursor: { index: number, length: number } | {},
}