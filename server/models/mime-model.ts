import mongoose from 'mongoose'

const MimeSchema = new mongoose.Schema({
    mimeType: { type: String, required: true },
    mediaid: { type: String, required: true }
}, { timestamps: true })

export default mongoose.model("Mime", MimeSchema);