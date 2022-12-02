import mongoose from 'mongoose'

const DocumentSchema = new mongoose.Schema({
    name: { type: String, required: true }
}, { timestamps: true })

export default mongoose.model("Document", DocumentSchema);