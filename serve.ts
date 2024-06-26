import {Signature} from "./src/tools/Signature";
import {AssetHelper} from "./src/web3/AssetHelper";
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');
import {Storage} from "./src/Storage";
const ffmpeg = require('fluent-ffmpeg');
const multer = require('multer');
Storage.connect();

const app = express();
const port = 4000;

const MAX_CHUNK_SIZE = 1024 * 1024 * 5; // 5MB, adjust this to your needs

const corsOptions = {
    origin: ['https://nft.clubmixed.com','http://localhost:5173','http://localhost:8300', "https://devest.finance"], // Specify the origin you're allowing requests from
    credentials: true, // Crucial for cookies, authorization headers with HTTPS
};

app.use(cors(corsOptions));
// Use cookie-parser middleware with a secret for signing cookies
app.use(cookieParser('your secret here'));

app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/authorize/:time', async (req, res) => {

    // fetch headers for authorization
    const signature = req.headers['signature'];
    const address = req.headers['address'];
    const asset = req.headers['asset'];
    const network = req.headers['network'];

    try {
        await Storage.updateMediaAccessCount(asset);
        await Storage.updateWalletAccessCount2(address, asset);
    }   catch (e) {}

    // check for headers
    if (!signature || !address || !asset)
        return res.status(403).send("Missing header parameters");

    // check signature
    const signer = new Signature();
    if (!signer.verify(signature, address))
        return res.status(403).send("Authorization failed");

    //  check balance
    if (asset != "0x56F46Ae0B3f8Aba3C4cf5f7924C482719314384F"){
        const balance = await checkBalance(network, asset, address);
        if (balance <= 0)
            return res.status(403).send("Insufficient balance");
    }

    // issue signed cookie for access
    let body = asset + ":" + address + ":" + (new Date()).getTime();
    res.cookie('devest_stream', body, {
        signed: true,
        maxAge: 3 * 60 * 1000, // TTL of 24 hours, specified in milliseconds,
        sameSite: 'None', // Set SameSite attribute to None
        secure: true // Ensure the cookie is sent over HTTPS
    });
    res.send('Signed cookie set');
});



// Authorization Middleware
function checkAuth(req, res, next) {
    const signature = req.headers['signature'];
    const address = req.headers['address'];

    // check for headers
    if (!signature)
        return res.status(401).send("Missing header parameters");

    // check signature
    const signer = new Signature();
    if (!signer.verify(signature, address))
        return res.status(401).send("Authorization failed");

    next();
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './media/')
    },
    filename: async function (req, file, cb) {
        //cb(null, file.originalname)
        const asset = req.headers['asset'];
        const index = req.params.index;

        try {
            // Construct the final filename
            const filename = `${asset}_${index}`;

            cb(null, filename);
        } catch (err) {
            cb(err); // Handle errors
        }
    }
});

const upload = multer({ storage: storage });
/**
 * Accept files to upload
 */
app.post("/upload/:index", checkAuth, upload.single('file'), async (req, res) => {
    return res.status(200).send({
        message: "File uploaded successfully"
    })
});

// Middleware to convert .wav to .mp3
 const convertWavToMp3 = async(basepath) => {
    try {
        const wavPath = path.resolve(__dirname, './media/', `${basepath}`);
        const mp3Path = path.resolve(__dirname, './media/', `${basepath}.mp3`);

        if (!fs.existsSync(mp3Path)) {
            console.log(`Converting ${wavPath} to ${mp3Path}`);
            await new Promise((resolve, reject) => {
                ffmpeg(wavPath)
                    .toFormat('mp3')
                    .on('end', resolve)
                    .on('error', reject)
                    .save(mp3Path);
            });
        }

        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

/**
 * On stream request i need the users signature to verify that they are allowed to stream the content
 * Additionally it will count towards the songs total stream count in 24h => save to db
 * cookie: with signature
 */
app.get('/stream/:index?', async (req, res) => {
    try {
        // Verify access
        const verified = verifyCookie(req.signedCookies.devest_stream);
        if (!verified.asset) {
            console.log("rejected");
            return res.status(403).send("Unauthorized");
        }

        let audioBasePath = req.params.index
            ? path.resolve(__dirname, './media/', `${verified.asset}_${parseInt(req.params.index)}`)
            : path.resolve(__dirname, './media/', verified.asset);

        let audioPath = `${audioBasePath}.mp3`;

        try {
            // Check if mp3 file exists
            await fs.promises.stat(audioPath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                // File does not exist, call convertToMP3 function
                await convertWavToMp3(audioBasePath);
            } else {
                // Some other error occurred
                throw err;
            }
        }

        const stat = await fs.promises.stat(audioPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            // Adjust the end for the maximum chunk size
            end = Math.min(start + MAX_CHUNK_SIZE - 1, end, fileSize - 1);

            const chunksize = (end - start) + 1;
            console.log(`# streaming request : ${chunksize} bytes`);
            const file = fs.createReadStream(audioPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'audio/mp3',
            };

            res.writeHead(206, head);
            file.pipe(res);
        } else {
            res.status(403).send("Unauthorized");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/download/:index?', async (req, res) => {
    // verify access
    const verified = verifyCookie(req.signedCookies.devest_stream);
    if (!verified.cookie) {
        console.log("rejected");
        return res.status(403).send("Unauthorized");
    }

    const index = req.params.index;
    const filename = `${verified.asset}_${index}`;

    // check balance
    const balance = await checkBalance("0x89", verified.asset, verified.address);
    if (balance <= 0)
        return res.status(403).send("Insufficient balance");

    let filePath = "";
    if (!req.params.index){
        filePath = path.resolve(__dirname, './media/' + verified.asset);
    } else {
        filePath = path.resolve(__dirname, './media/' + verified.asset + "_" + parseInt(req.params.index));
    }

    // Verify the file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }

    // Send the file as a download
    res.download(filePath, filename, (err) => {
        if (err) {
            console.error("Error downloading file:", err);
            res.status(500).send("Error downloading file");
        }
    });
});

const checkBalance = async function(network, asset, address) {
    try{
        const assetHelper = new AssetHelper();
        const balance = await assetHelper.getBalance(network, asset, address);
        return balance;
    }   catch (e) {
        console.log(e);
        return 0;
    }
}

const verifyCookie = function(body):any {
    // check for cookie
    if (!body)
        return false;

    // verify cookie
    const [asset, address, timestamp] = body.split(':');
    if (!asset || !timestamp || !address)
        return false

    // check timestamp not older then 180 seconds
    if ((new Date()).getTime() - parseInt(timestamp) > 180000)
        return false;

    return {
        asset: asset,
        address: address,
    };
}


app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
