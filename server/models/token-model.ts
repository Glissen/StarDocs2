import mongoose from 'mongoose'

const TokenSchema = new mongoose.Schema({
    email: { type: String, required: true },
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 3600 }
})

export default mongoose.model('Token', TokenSchema)