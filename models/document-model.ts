const mongoose = require('mongoose')
const Schema = mongoose.Schema

const DocumentSchema = new Schema(
    {
        name: { type: String, required: true },
        content: { type: String, required: true }
    }, { timestamps: true }
)

const Document = mongoose.model("Document", DocumentSchema)
export default Document;