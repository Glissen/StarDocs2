import express from 'express';
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import db from './db'
import Mime from './models/mime-model';
import axios from 'axios';

import S3 from 'aws-sdk/clients/s3'
import session from 'express-session';

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
    resave: false
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
    node: 'http://new.renge.io:9200'
})

// const bulkUpdate = async() => {
//     let datasource = [];
//     ydocs.forEach((ydoc, key) => {
//         if (ydoc.updated) {
//             ydoc.updated = false;
//             datasource.push({ id: key, name: ydoc.name, content: ydoc.doc.getText() })
//         }
//     })
//     await elasticClient.helpers.bulk({
//         datasource: datasource,
//         onDocument (doc) {
//             return {
//                 index: { _index: 'docs', _id: doc.id },
//                 doc: { name: doc.name, content: doc.content }
//             }
//         }
//     })
// }

// const elasticCreateDoc = async(name: string) => {
//     const result = await elasticClient.index({
//         index: 'docs',
//         document: {
//             name: name,
//             content: '',
//         },
//         refresh: true,      // true || 'wait_for'
//     });
//     return result;
// }

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
        const result = await axios.post('http://10.9.11.55:4001/users/getUserNameAndId', {
            cookie: cookie
        })
        return { name: result.data.name, id: result.data.id }
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

        const abc = 'abc';
        const rand = Math.floor(Math.random() * 3);
        const id = abc[rand] + makeId();
        addToRecent({ name: name, id: id })
        //console.log("/collection/create: Created document:" + name, id)
        // const ydoc = {
        //     doc: new Y.Doc(),
        //     name: name,
        //     updated: false,
        //     clients: new Map(),
        //     cursors: new Map()
        // };
        // ydocs.set(result._id, ydoc)
        // return res.status(200).send({ id: result._id })

        let url = "";
        switch (rand) {
            case 0:
                url = "http://localhost:4002/collection/create";
                break;
            case 1:
                url = "http://localhost:4002/collection/create";
                break;
            default:
                url = "http://localhost:4002/collection/create";
        }

        const response = await axios.post(url, {
            name: name,
            id: id
        })

        if (response.status === 200) {
            return res.status(200).send({ id: id });
        }
        return res.status(200).send({ error: true, message: "/collection/create: upstream failed" });
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
                    url = "http://localhost:4002/collection/create";
                    break;
                case 'b':
                    url = "http://localhost:4002/collection/create";
                    break;
                default:
                    url = "http://localhost:4002/collection/create";
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


// const connect = async (req, res) => {
//     try {
//         console.log("apiConnect receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
//         if (!req.session.session_id) {
//             const user = await getUserNameAndId(req.cookies.token)
//             if (!user) {
//                 console.error("/api/connect: Unauthorized user")
//                 return res.status(200).send({ error: true, message: "Unauthourized user" });
//             }
//             req.session.session_id = makeId();
//             req.session.name = user.name;
//         }

//         const id = req.params.id

//         if (!id) {
//             console.error("/api/connect: Missing document id")
//             return res.status(200).send({ error: true, message: "Missing document id" });
//         }

//         const ydoc = ydocs.get(id);
//         if (!ydoc) {
//             console.error("/api/connect: Fail to find document with id: " + id)
//             return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
//         }

//         const headers = {
//             'Content-Type': 'text/event-stream',
//             'Connection': 'keep-alive',
//             'Cache-Control': 'no-cache'
//         };
//         res.writeHead(200, headers);

//         const clientId: string = req.session.session_id
//         ydoc.clients.set(clientId, 
//             {response: res}
//         );
//         //console.log("Connecting client " + clientId + " to doc " + id)

//         res.write("event: sync\ndata: " + Y.encodeStateAsUpdate(ydoc.doc).toString() + "\n\n")

//         ydoc.cursors.forEach((cursor, key) => {
//             // if (key !== clientId) {
//                 res.write("event: presence\ndata: " + JSON.stringify({ session: key, name: cursor.name, cursor: cursor.cursor }) + "\n\n")
//             // }
//         })

//         res.on('close', () => {
//             console.log(`${clientId} Connection closed`);
//             let doc = ydocs.get(id);
//             if (doc) {
//                 doc.clients.delete(clientId)
//                 doc.cursors.delete(clientId)
//                 doc.clients.forEach((client) => {
//                     client.response.write("event: presence\ndata: " + JSON.stringify({ session_id: clientId, name: req.session.name, cursor: {} }) + "\n\n");
//                 })
//             }
//         });
//     }
//     catch (err) {
//         console.error("/api/connect: Error occurred: " + err);
//         return res.status(200).send({ error: true, message: "An error has occurred" });
//     }
// }

// const op = async (req, res) => {
//     try {
//         // console.log("apiOP receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
//         if (!req.session.session_id) {
//             const user = await getUserNameAndId(req.cookies.token)
//             if (!user) {
//                 console.error("/api/op: Unauthorized user")
//                 return res.status(200).send({ error: true, message: "Unauthourized user" });
//             }
//             req.session.session_id = makeId();
//             req.session.name = user.name;
//         }

//         const update: string = req.body.update;
//         const id: string = req.params.id;
//         if (!id) {
//             console.error("/api/op: Missing document id")
//             return res.status(200).send({ error: true, message: "Missing document id" });
//         }

//         // console.log("Doc " + id + " receives Update: " + update)
//         const ydoc = ydocs.get(id);
//         if (ydoc) {
//             ydoc.updated = true;
//             res.send({});
//             // console.log("Found doc " + id)
//             // console.log("Text before update: " + ydoc.doc.getText().toString())
//             Y.applyUpdate(ydoc.doc, Uint8Array.from(update.split(',').map(x => parseInt(x, 10))));
//             // console.log("Text after update: " + ydoc.doc.getText().toString())

//             //await elasticUpdateDoc(ydoc.name, ydoc.doc.getText(), id);
//             // TODO: check error
            

//             addToRecent({ name: ydoc.name, id: id })
//             return ydoc.clients.forEach((client, key) => {
//                 client.response.write("event: update\ndata: " + update + "\n\n");
//                 // console.log("Sending update to client " + key)
//             });
//             // return setTimeout(function(){
                
//             // }, 200);
//         }
//         else {
//             console.log("Fail to find doc " + id)
//             return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
//         }
        
//     }
//     catch (err) {
//         console.error("/api/op: Error occurred: " + err);
//         return res.status(200).send({ error: true, message: "An error has occurred" });
//     }
// }

// const presence = async (req, res) => {
//     try {
//         console.log("apiPresence receive request: \n" + JSON.stringify(req.session) + "\n" + req.cookies.token)
//         if (!req.session.session_id) {
//             const user = await getUserNameAndId(req.cookies.token)
//             if (!user) {
//                 console.error("/api/presence: Unauthorized user")
//                 return res.status(200).send({ error: true, message: "Unauthourized user" });
//             }
//             req.session.session_id = makeId();
//             req.session.name = user.name;
//         }

//         const clientId = req.session.session_id

//         const { index, length } = req.body;
//         if (index === undefined || index === null || length === undefined || length === null) {
//             console.error("/api/presence: Missing parameter")
//             res.status(200).json({ error: true, message: "Missing parameter" });
//         }
//         const id: string = req.params.id;
//         if (!id) {
//             console.error("/api/presence: Missing document id")
//             return res.status(200).send({ error: true, message: "Missing document id" });
//         }

//         const ydoc = ydocs.get(id);
//         if (ydoc) {
//             //console.log("Found doc " + id)
//             let tmpcursor = ydoc.cursors.get(clientId)
//             if (!tmpcursor) {
//                 tmpcursor = {name: req.session.name, cursor: {}}
//             }
//             tmpcursor.cursor = { index: index, length: length }
//             ydoc.cursors.set(clientId, tmpcursor)
//             ydoc.clients.forEach((client, key) => {
//                 client.response.write("event: presence\ndata: " + JSON.stringify({ session_id: clientId, name: tmpcursor.name, cursor: tmpcursor.cursor }) + "\n\n");
//                 //console.log("Sending presence to client " + key)
//             });
//         }
//         else {
//             console.log("Fail to find doc " + id)
//             return res.status(200).send({ error: true, message: "Fail to find document with id: " + id });
//         }
//         res.send({});
//     }
//     catch (err) {
//         console.error("/api/presence: Error occurred: " + err);
//         return res.status(200).send({ error: true, message: "An error has occurred" });
//     }
// }

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

// app.get('/api/connect/:id', connect);
// app.post('/api/connect/:id', connect);
// app.post('/api/op/:id', op);
// app.post('/api/presence/:id', presence)

app.post('/media/upload', uploadS3.single("file"), mediaUpload);
app.get('/media/access/:mediaid', mediaAccess);

// app.post("/users/signup", signup)
// app.post("/users/login", login)
// app.post("/users/logout", logout)
// app.get("/users/verify", verify)

// app.use("/library", express.static('library'))

// app.use("/edit", express.static('edit'))
// app.use("/edit/:id", (req, res) => {
//     res.set("Content-Type", "text/html")
//     return res.status(200).send('<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>MP1</title><script defer="defer" src="/edit/static/js/main.3027cd66.js"></script><link href="/edit/static/css/main.2ce06e37.css" rel="stylesheet"></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><hr><p>This is a test of the CRDT library.</p><p>If the basic functionality of the library works correctly, you should see &quot;Hello <b>World</b>!&quot; above,<br/>preceded by the sequence of CRDT updates that could be sent to the client to construct this string.</p></body></html>');
// })
// app.use("/home", express.static('home', {
//     setHeaders: function (res, path) {
//         res.set('X-CSE356', "6306d31458d8bb3ef7f6bbe1");
//     }
// }))

// db
db.on('error', console.error.bind(console, 'MongoDB connection error: '))

// listen on port
app.listen(PORT, (err?) => {
    if (err) {
        return console.error(err);
    }
    return console.log(`Server is listening on ${PORT}`);
});

type document = {
    name: string,
    id: string
}