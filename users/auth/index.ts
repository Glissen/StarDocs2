import jwt from 'jsonwebtoken'

export default class authManager {
    static verifyJWT = (token) => {
        try {
            if (!token)
                return null;

            const verified = jwt.verify(token, process.env.JWT_SECRET)
            return verified.userId;
        } catch (e) {
            console.log("verifyJWT error: " + e);
            return null;
        }
    }

    static signJWT = (user) => {
        return jwt.sign({
            userId: user._id
        }, process.env.JWT_SECRET, { expiresIn: '1h' });
    }
}