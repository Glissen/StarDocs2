import express from 'express'
import bodyParser from 'body-parser'
import S3 from 'aws-sdk/clients/s3'

const dotenv = require('dotenv')
dotenv.config();

const axios = require('axios').default

const Document = require('./models/document-model').default
const db = require('./db').default

const PORT: number = 3001;
const app: express.Application = express();
app.use(bodyParser.json());
app.use(bodyParser.raw({
    type: ['image/png', 'image/jpeg'],
    limit: '10mb'
}))

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
        return res.status(200).json({ error: true, message: "Missing document id"});
    }
    await Document.findOneAndDelete({ _id: id });
    return res.status(200).json({});
}

function mediaUpload(req, res, next) {
    const file = req.body;
    const contentType = req.headers['content-type'];

    if ( file === '' || file === undefined || file === null) {
        return res.status(200).json({ error: true, message: "Missing file"});
    }
    let key = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const len = alphabet.length;
    for (let i = 0; i < 10; i++) {
        key += alphabet.charAt(Math.floor(Math.random() * len));
    }
    const s3 = new S3({
        endpoint: "mp2.us-nyc1.upcloudobjects.com",
        accessKeyId: process.env.accessKeyId,
        secretAccessKey: process.env.secretAccessKey,
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
            return res.status(200).json({});
        }
        else {
            console.log("Media stored -- Key: ", key);
            console.log(data);
            return res.status(200).json({ mediaid: key });
        }
    })
    
}

function mediaAccess(req, res, next) {
    const { mediaid } = req.body;
    if ( mediaid === '' || mediaid === undefined || mediaid === null) {
        res.status(200).json({ error: true, message: "Missing mediaid"});
    }
    
    const s3 = new S3({
        endpoint: "mp2.us-nyc1.upcloudobjects.com",
        accessKeyId: process.env.accessKeyId,
        secretAccessKey: process.env.secretAccessKey,
        sslEnabled: true
    });

    const params = {
        Bucket: "images",
        Key: mediaid,
    }

    s3.getObject(params, (error, data) => {
        if (error) {
            console.log(error);
            return res.status(200).json({});
        }
        else { 
            const buffer = data.Body;
            console.log("Media Retrieved");
            console.log(data.Body);
            const contentType = data.ContentType;
            res.set({ 'Content-Type': contentType });
            return res.status(200).send(buffer);
        }
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