import jwt from 'jsonwebtoken'

export default class authManager {
    static verifyJWT = (req) => {
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

    static signJWT = (user) => {
        return jwt.sign({
            userId: user._id
        }, process.env.JWT_SECRET, { expiresIn: '1h' });
    }
}