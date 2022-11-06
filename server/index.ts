import express from 'express'
import bodyParser from 'body-parser'
import { fromUint8Array, toUint8Array } from 'js-base64'
import * as Y from 'yjs'

const axios = require('axios').default

const Document = require('./models/document-model').default
const db = require('./db').default

const PORT: number = 3001;
const app: express.Application = express();
app.use(bodyParser.json());

db.on('error', console.error.bind(console, "MongoDB connection error: "));

async function collectionList(req, res, next) {
    const documents = await Document.find();
    let arr = [];
    for (let i: number = 0; i < documents.length; i++) {
        arr.push({
            id: documents[i]._id,
            name: documents[i].name
        })
    }
    return res.status(200).json(arr);
}

async function collectionCreate(req, res, next) {
    const { name } = req.body;
    if (name === '' || name === undefined || name === null) {
        res.status(200).json({ error: true, message: "Missing document name"});
    }
    
    const doc = new Document({
        name: name,
        content: '',
    });

    await doc.save();

    return res.status(200).json({
        id: doc._id,
    })
}

async function collectionDelete(req, res, next) {
    const { id } = req.body;
    if (id === '' || id === undefined || id === null) {
        res.status(200).json({ error: true, message: "Missing document id"});
    }
    await Document.findOneAndDelete({ _id: id });
    return res.status(200).json({});
}

function mediaUpload(req, res, next) {
    const { mediaid } = req.body;
    if ( mediaid === '' || mediaid === undefined || mediaid === null) {
        res.status(200).json({ error: true, message: "Missing mediaid"});
    }
    axios.put(`localhost:8000/images/${mediaid}`)
        .then((response) => {
            console.log(response);
            // todo
        })
        .catch((err) => {
            console.log(err);
        })
}

function mediaAccess(req, res, next) {
    const { mediaid } = req.body;
    if ( mediaid === '' || mediaid === undefined || mediaid === null) {
        res.status(200).json({ error: true, message: "Missing mediaid"});
    }
    axios.get(`localhost:8000/images/${mediaid}`)
        .then((response) => {
            console.log(response);
            // todo
        })
        .catch((err) => {
            console.log(err);
        })
}

app.post('/api/collection/create', collectionCreate);
app.post('/api/collection/delete', collectionDelete);
app.get('/api/collection/list', collectionList);

app.post('/api/media/upload', mediaUpload);
app.get('/api/media/access', mediaAccess);

app.listen(PORT, () => {
    console.log("Listening on port ", PORT);
})