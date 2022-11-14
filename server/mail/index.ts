import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
dotenv.config();

const sendEmail = async (destination, subject, text) => {
    return new Promise((resolve, reject) => {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.MAIL_URL,
                port: process.env.MAIL_PORT,
                secure: false,
                ignoreTLS: true
            });
            transporter.verify(function (error, success) {
                if (error) {
                    console.log("Email connection failed: " + error);
                    return 0;
                }
                else {
                    console.log("Email connection successful");
                    return 1;
                }
            })
            transporter.sendMail({
                from: "david.huang.2@stonybrook.edu",
                to: destination,
                subject: subject,
                text: text,
            }, (err, data) => {
                if (err) {
                    console.log("Email failed to send: " + err);
                    resolve(false);
                }
                else {
                    console.log("Email successfully sent: " + data);
                    resolve(true);
                }
            })
        }
        catch (err) {
            console.log("Email failed to send: " + err);
            resolve(false);
        }
    })
}

export default sendEmail;