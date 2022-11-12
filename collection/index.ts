import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
// import S3 from 'aws-sdk/clients/s3'
import dotenv from 'dotenv'

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

axios.defaults.withCredentials = true;
const api = axios.create({
    baseURL: 'http://duolcpu.cse356.compas.cs.stonybrook.edu/',
})

const recentDocument = Array<document>()

const addToRecent = (document: document): void => {
    const index = recentDocument.findIndex((element) => { element.id === document.id && element.name === document.name });
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

const collectionList = async (req, res, next) => {
    try {
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

const collectionCreate = async (req, res, next) => {
    try {
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
        return res.status(200).send({ id: id })
    }
    catch (err) {
        console.error("/collection/list: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

const collectionDelete = async (req, res, next) => {
    try {
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
            const index = recentDocument.findIndex((element) => { element.id === doc._id && element.name === doc.name });
            if (index !== -1)
                recentDocument.splice(index, 1);
            return res.status(200).send({});
        }
        else {
            return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
        }
    }
    catch (err) {
        console.error("/collection/delete: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

// const mediaUpload = async (req, res, next) => {
//     const file = req.body;
//     const contentType = req.headers['content-type'];

//     if (file === '' || file === undefined || file === null) {
//         return res.status(200).json({ error: true, message: "Missing file" });
//     }
//     let key = '';
//     const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const len = alphabet.length;
//     for (let i = 0; i < 10; i++) {
//         key += alphabet.charAt(Math.floor(Math.random() * len));
//     }
//     const s3 = new S3({
//         endpoint: process.env.S3_ENDPOINT,
//         accessKeyId: process.env.S3_ACCESSKEYID,
//         secretAccessKey: process.env.S3_SECRETACCESSKEY,
//         sslEnabled: true
//     });

//     const params = {
//         Bucket: "images",
//         Body: file,
//         Key: key,
//         ContentType: contentType
//     }

//     s3.putObject(params, (error, data) => {
//         if (error) {
//             console.log(error);
//             return res.status(200).json({});
//         }
//         else {
//             console.log("Media stored -- Key: ", key);
//             console.log(data);
//             return res.status(200).json({ mediaid: key });
//         }
//     })

// }

// const mediaAccess = async (req, res, next) => {
//     const { mediaid } = req.body;
//     if (mediaid === '' || mediaid === undefined || mediaid === null) {
//         res.status(200).json({ error: true, message: "Missing mediaid" });
//     }

//     const s3 = new S3({
//         endpoint: "mp2.us-nyc1.upcloudobjects.com",
//         accessKeyId: process.env.accessKeyId,
//         secretAccessKey: process.env.secretAccessKey,
//         sslEnabled: true
//     });

//     const params = {
//         Bucket: "images",
//         Key: mediaid,
//     }

//     s3.getObject(params, (error, data) => {
//         if (error) {
//             console.log(error);
//             return res.status(200).json({});
//         }
//         else {
//             const buffer = data.Body;
//             console.log("Media Retrieved");
//             console.log(data.Body);
//             const contentType = data.ContentType;
//             res.set({ 'Content-Type': contentType });
//             return res.status(200).send(buffer);
//         }
//     })

// }

app.post('/collection/create', collectionCreate);
app.post('/collection/delete', collectionDelete);
app.get('/collection/list', collectionList);

// app.post('/api/media/upload', mediaUpload);
// app.get('/api/media/access', mediaAccess);

db.on('error', console.error.bind(console, "MongoDB connection error: "));


app.listen(PORT, () => {
    console.log("Listening on port ", PORT);
})

type document = {
    name: string,
    id: mongoose.Types.ObjectId
}