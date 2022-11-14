import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config();

mongoose.connect(process.env.MONGO_URL, {dbName: process.env.MONGO_DBNAME, user: process.env.MONGO_USER, pass: process.env.MONGO_PASS})
    .then(() => {
        console.log('Connected to database')
    })
    .catch(e => {
        console.error('Connection error', e.message)
    })

const db = mongoose.connection
export default db;