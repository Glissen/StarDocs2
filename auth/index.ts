const jwt = require("jsonwebtoken")
const crypto = require("crypto-js")

function verifyJWT(req) {
    try {
        const token = req.cookies.token;
        if (!token) 
            return 0;

        const verified = jwt.verify(token, process.env.JWT_SECRET)
        return verified.userId;
    } catch (e) {
        console.log("verifyJWT error: " + e);
        return 0;
    }
}

// function to create token by encrypting userId with secret key
function signJWT(user) {
    return jwt.sign({
        userId: user._id
    }, process.env.JWT_SECRET, { expiresIn: '1h'});
}

function encryptUser(userId) {
    if (!userId) {
        return -1;
    }
    let id = "" + userId;
    let secret = "" + process.env.TOKEN_SECRET;
    const encrypted = crypto.AES.encrypt(id, secret);
    return encrypted
}

function decryptUser(encrypted) {
    if (!encrypted) {
        return -1;
    }
    let id = "" + encrypted;
    let secret = "" + process.env.TOKEN_SECRET;
    return crypto.AES.decrypt(id, secret);
}