import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import session from 'express-session'
// import S3 from 'aws-sdk/clients/s3'
import dotenv from 'dotenv'
import * as Y from 'yjs';
import axios from 'axios'

import Document from './models/document-model'; './models/document-model'
import db from './db'
import mongoose, { ObjectId } from 'mongoose'

dotenv.config();
const app: express.Application = express();
const PORT: number = parseInt(process.env.EXPRESS_PORT);
app.use(bodyParser.json());
app.use(cookieParser());
app.use(bodyParser.raw({
    type: ['image/png', 'image/jpeg'],
    limit: '10mb'
}))
app.use(session({
    secret: "aveuCJmh0xCwdUg69gmWMSEALHizb2IENAAKZApMNeFsP9FqgI54GpcuAWHjNfCe",
    saveUninitialized: false,
    resave: false
}));

axios.defaults.withCredentials = true;
const api = axios.create({
    baseURL: 'http://duolcpu.cse356.compas.cs.stonybrook.edu/',
})

const recentDocument = Array<document>()
const ydocs: Map<string, ydoc> = new Map();

const addToRecent = (document: document): void => {
    const index = recentDocument.findIndex((element) => { return element.id.toHexString() === document.id.toHexString() });
    if (index !== -1)
        recentDocument.splice(index, 1);
    recentDocument.splice(0, 0, document);
}

const getUserNameAndId = async (payload) => api.post(`/users/getusernameandid`, payload);

const verify = async (cookie: string): Promise<{ name: string; id: string }> => {
    const payload = { cookie: cookie };
    try {
        const res = await getUserNameAndId(payload);
        if (res.data.error) {
            console.log("Verify failed: " + res.data.message);
            return { name: null, id: null };
        }
        else {
            return { name: res.data.name, id: res.data.id }
        }
    }
    catch (err) {
        console.error("Verify failed: " + err);
        return { name: null, id: null };
    }
}

const makeId = () => {
    let ID = "";
    let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 16; i++) {
        ID += characters.charAt(Math.floor(Math.random() * 62));
    }
    return ID;
}

const collectionList = async (req, res) => {
    try {
        if (!req.session.session_id)
            req.session.session_id = makeId();
        const cookie = req.cookies.token;
        const user = await verify(cookie);
        if (!user.name || !user.id) {
            console.error("/collection/list: Unauthorized user")
            return res.status(200).send({ error: true, message: "Unauthourized user" });
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
        if (!req.session.session_id)
            req.session.session_id = makeId();
        const cookie = req.cookies.token;
        const user = await verify(cookie);
        if (!user.name || !user.id) {
            console.error("/collection/create: Unauthorized user")
            return res.status(200).send({ error: true, message: "Unauthourized user" });
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
        if (!req.session.session_id)
            req.session.session_id = makeId();
        const cookie = req.cookies.token;
        const user = await verify(cookie);
        if (!user.name || !user.id) {
            console.error("/collection/delete: Unauthourized user")
            return res.status(200).send({ error: true, message: "Unauthourized user" });
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
            const ydoc = ydocs.get(doc._id.toString());
            if (!ydoc) {
                console.error("/api/delete: Fail to find document with id from map: " + id)
                return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
            }
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
    if (!req.session.session_id)
        req.session.session_id = makeId();
    const cookie = req.cookies.token;
    const user = await verify(cookie);
    if (!user.name || !user.id) {
        console.error("/collection/create: Unauthorized user")
        return res.status(200).send({ error: true, message: "Unauthourized user" });
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
        name: user.name,
        cursor: {},
        response: res
    });
    console.log("Connecting client " + clientId + " to doc " + id)

    res.write("event: sync\ndata: " + Y.encodeStateAsUpdate(ydoc.doc).toString() + "\n\n")

    ydoc.clients.forEach((client, key) => {
        if (key !== clientId) {
            res.write("event: presence\ndata: " + JSON.stringify({ session: key, name: client.name, cursor: client.cursor }))
        }
        client.response.write("event: presence\ndata: " + JSON.stringify({ session: clientId, name: user.name, cursor: {} }))
    })

    res.on('close', () => {
        console.log(`${clientId} Connection closed`);
        let tempdoc = ydocs.get(doc._id.toString());
        if (tempdoc) {
            tempdoc.clients.delete(clientId)
            tempdoc.clients.forEach((client) => {
                client.response.write("event: presence\ndata: " + JSON.stringify({ session_id: clientId, name: user.name, cursor: {} }) + "\n\n");
            })
        }
    });
}

const op = async (req, res) => {
    if (!req.session.session_id)
        req.session.session_id = makeId();
    const cookie = req.cookies.token;
    const user = await verify(cookie);
    if (!user.name || !user.id) {
        console.error("/api/op: Unauthorized user")
        return res.status(200).send({ error: true, message: "Unauthourized user" });
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

const presence = async (req, res) => {
    if (!req.session.session_id)
        req.session.session_id = makeId();
    const clientId = req.session.session_id;
    const cookie = req.cookies.token;
    const user = await verify(cookie);
    if (!user.name || !user.id) {
        console.error("/api/presence: Unauthorized user")
        return res.status(200).send({ error: true, message: "Unauthourized user" });
    }
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
        tmpclient.cursor = {index: index, length: length}
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
app.post('/collection/create', collectionCreate);
app.post('/collection/delete', collectionDelete);
app.get('/collection/list', collectionList);

app.post('/api/connect/:id', connect);
app.post('/api/op/:id', op);
app.post('/api/presence/:id', presence)

db.on('error', console.error.bind(console, "MongoDB connection error: "));

app.listen(PORT, () => {
    console.log("Listening on port ", PORT);
})

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