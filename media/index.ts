import express from 'express'
import S3 from 'aws-sdk/clients/s3'
import dotenv from 'dotenv'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import axios from 'axios'


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

const mediaUpload = async (req, res) => {
    try {
        const cookie = req.cookies.token;
        const user = await verify(cookie);
        if (!user.name || !user.id) {
            console.error("/media/upload: Unauthorized user")
            return res.status(200).send({ error: true, message: "Unauthourized user" });
        }
        const file = req.body;
        const contentType = req.headers['content-type'];

        if (!file) {
            return res.status(200).json({ error: true, message: "Missing file" });
        }
        if (contentType !== 'image/jpeg' || contentType !== 'image/png') {
            return res.status(200).json({ error: true, message: "Only accept jpeg/png file" });
        }

        let key = '';
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const len = alphabet.length;
        for (let i = 0; i < 10; i++) {
            key += alphabet.charAt(Math.floor(Math.random() * len));
        }

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
                return res.status(200).json({});
            }
            else {
                console.log("Media stored -- Key: ", key);
                console.log(data);
                return res.status(200).json({ mediaid: key });
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
        const cookie = req.cookies.token;
        const user = await verify(cookie);
        if (!user.name || !user.id) {
            console.error("/media/access: Unauthorized user")
            return res.status(200).send({ error: true, message: "Unauthourized user" });
        }
        const mediaid = req.params.mediaid;
        if (!mediaid) {
            res.status(200).json({ error: true, message: "Missing mediaid" });
        }

        const s3 = new S3({
            endpoint: process.env.S3_ENDPOINT,
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
                return res.status(200).send({error: true, message: "fail to get image"});
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
    catch (err) {
        console.error("/media/access: Error occurred: " + err);
        return res.status(200).send({ error: true, message: "An error has occurred" });
    }
}

app.post('/media/upload', mediaUpload);
app.get('/media/access/:mediaid', mediaAccess);

app.listen(PORT, () => {
    console.log("Listening on port ", PORT);
})