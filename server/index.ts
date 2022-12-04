import express from 'express';
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import db from './db'
import Mime from './models/mime-model';
import axios from 'axios';

import S3 from 'aws-sdk/clients/s3'
import session from 'express-session';
import MongoStore from 'connect-mongo'

const multer = require('multer')
const multerS3 = require('multer-s3')

require('events').EventEmitter.defaultMaxListeners = 64;

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
    resave: false,
    store: MongoStore.create({ mongoUrl: process.env.SESSION_MONGO_URL})
}));

const recentDocument = Array<document>();

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
    node: 'http://10.9.11.197:9200'
})

const elasticClient2 = new Client({
    node: 'http://10.9.11.182:9200'
})

const elasticUpdateSettings = async() => {
    elasticClient.indices.putSettings({
        index: 'docs',
        settings: {
            number_of_replicas: 0,
            refresh_interval: 5
        }
    })
}
elasticUpdateSettings();

const elasticRefresh = async() => {
    elasticClient.indices.refresh({
        index: 'docs'
    });
}

const elasticSearch = async(query: string) => {
    const params = {
        index: 'docs',
        query: {
            match: {
                main_content: {
                    query: query
                }
            }
        },
        highlight: {
            fields: {
                name: {},
                content: {}
            },
            fragment_size: 0
        },
        from: 0,
        size: 10,
        _source: [
            "name"
        ]
    }
    return (Math.random() > 0.5 ? await elasticClient.search(params) : await elasticClient2.search(params));
    //return await elasticClient.search();
}

const elasticSuggest = async(query: string) => {
    const params = {
        query: {
            match_phrase_prefix: {
                main_content: {
                    query: query
                }
            }
        },
        highlight: {
            boundary_scanner: "word",
            fields: {
                "content": {},
                "name": {}
            },
            pre_tags: "",
            post_tags: ""
        },
        from: 0,
        size: 10,
        _source: [""]
    }
    const result = (Math.random() > 0.5 ? await elasticClient.search(params) : await elasticClient2.search(params));
    return result;
}


const getUserNameAndId = async (cookie) => {
    try {
        const result = await axios.post('http://10.9.11.55:4001/users/getUserNameAndId', {
            cookie: cookie
        })
        if (result.data.name && result.data.id)
            return { name: result.data.name, id: result.data.id }
        else 
            return null;
    }
    catch (err) {
        console.log("/users/getUserNameAndId: " + err);
        return null;
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
        console.log("collectionList receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
        if (!req.session.session_id) {
            const user = await getUserNameAndId(req.cookies.token)
            console.log("collectionList getusernamebyid: ");
            console.log(user);
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

let order = 0;
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

        //const rand = String.fromCharCode(97 + Math.floor(Math.random() * 8));
        const id = String.fromCharCode(97 + (order % 12)) + makeId();
        order++;
        addToRecent({ name: name, id: id })

        let url = "";
        switch (id[0]) {
            case 'a':
                url = "http://10.9.11.81:4000/collection/create";
                break;
            case 'b':
                url = "http://10.9.11.81:4001/collection/create";
                break;
            case 'c':
                url = "http://10.9.11.81:4002/collection/create";
                break;
            case 'd':
                url = "http://10.9.11.81:4003/collection/create";
                break;
            case 'e':
                url = "http://10.9.11.108:4000/collection/create";
                break;
            case 'f':
                url = "http://10.9.11.108:4001/collection/create";
                break;
            case 'g':
                url = "http://10.9.11.108:4002/collection/create";
                break;
            case 'h':
                url = "http://10.9.11.108:4003/collection/create";
                break;
            case 'i':
                url = "http://10.9.11.181:4000/collection/create";
                break;
            case 'j':
                url = "http://10.9.11.181:4001/collection/create";
                break;
            case 'k':
                url = "http://10.9.11.181:4002/collection/create";
                break;
            default:
                url = "http://10.9.11.181:4003/collection/create";
        }

        res.status(200).send({ id: id });

        const response = await axios.post(url, {
            name: name,
            id: id
        })

        if (response.status !== 200) {
            console.error("/collection/create: upstream failed");
        }
        return;
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
        //const doc = ydocs.get(id)
        const index = recentDocument.findIndex((element) => { return element.id === id });
        if (index >= 0) {
            recentDocument.splice(index, 1);
            // doc.clients.forEach(client => {
            //     client.response.status(200).send();
            // })
            res.status(200).send({});

            let url = "";
            switch (id[0]) {
                case 'a':
                    url = "http://10.9.11.81:4000/collection/create";
                    break;
                case 'b':
                    url = "http://10.9.11.81:4001/collection/create";
                    break;
                case 'c':
                    url = "http://10.9.11.81:4002/collection/create";
                    break;
                case 'd':
                    url = "http://10.9.11.81:4003/collection/create";
                    break;
                case 'e':
                    url = "http://10.9.11.108:4000/collection/create";
                    break;
                case 'f':
                    url = "http://10.9.11.108:4001/collection/create";
                    break;
                case 'g':
                    url = "http://10.9.11.108:4002/collection/create";
                    break;
                case 'h':
                    url = "http://10.9.11.108:4003/collection/create";
                    break;
                case 'i':
                    url = "http://10.9.11.181:4000/collection/create";
                    break;
                case 'j':
                    url = "http://10.9.11.181:4001/collection/create";
                    break;
                case 'k':
                    url = "http://10.9.11.181:4002/collection/create";
                    break;
                default:
                    url = "http://10.9.11.181:4003/collection/create";
            }
            return await axios.post(url, {
                id: id
            });
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
                    //ans.add(word.slice(4, -5).toLowerCase());
                    ans.add(word.toLowerCase());
                }
            }
            if (element.highlight.content) {
                for (let i = 0; i < element.highlight.content.length; i ++) {
                    let word = element.highlight.content[i];
                    //ans.add(word.slice(4, -5).toLowerCase());
                    ans.add(word.toLowerCase());
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

const updateRecent = async(req, res) => {
    try {
        const { id, name }= req.body;
        if (!id || !name) {
            return res.status(400).send({ error: true, message: 'Missing id or name' });
        }
        addToRecent({ id: id, name: name });
        return res.status(200).send();
    }
    catch (e) {
        console.error("/updateRecent: " + e);
        return res.status(400).send({ error: true, message: "server bad"});
    }
}


app.get('/index/search', search);
app.get('/index/suggest', suggest);
app.post('/updateRecent', updateRecent);

app.post('/collection/create', collectionCreate);
app.post('/collection/delete', collectionDelete);
app.get('/collection/list', collectionList);

app.post('/media/upload', uploadS3.single("file"), mediaUpload);
app.get('/media/access/:mediaid', mediaAccess);

// db
db.on('error', console.error.bind(console, 'MongoDB connection error: '))

// listen on port
app.listen(PORT, (err?) => {
    if (err) {
        return console.error(err);
    }
    return console.log(`Server is listening on ${PORT}`);
});

// const interval = setInterval(function() {
    // elasticRefresh();
// }, 5000);

type document = {
    name: string,
    id: string
}