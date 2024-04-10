import {Signature} from "./src/tools/Signature";
import {AssetHelper} from "./src/web3/AssetHelper";
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');
import {Storage} from "./src/Storage";

const storage = new Storage();
Storage.connect();

(async() => {

})();

const app = express();
const port = 4000;

const MAX_CHUNK_SIZE = 1024 * 1024 * 5; // 5MB, adjust this to your needs

const corsOptions = {
    origin: ['http://localhost:8300', "https://devest.finance"], // Specify the origin you're allowing requests from
    credentials: true, // Crucial for cookies, authorization headers with HTTPS
};

app.use(cors(corsOptions));
// Use cookie-parser middleware with a secret for signing cookies
app.use(cookieParser('your secret here'));

app.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname, './../views/index.html'));
});

app.get('/authorize', async (req, res) => {

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

    // check balance
    const balance = await checkBalance(network, asset, address);
    if (balance <= 0)
        return res.status(403).send("Insufficient balance");

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

/**
 * On stream request i need the users signature to verify that they are allowed to stream the content
 * Additionally it will count towards the songs total stream count in 24h => save to db
 * cookie: with signature
 */
app.get('/stream/:index?', async (req, res) => {

    // verify access
    const asset = verifyCookie(req.signedCookies.devest_stream);
    if (!asset) {
        console.log("rejected");
        return res.status(403).send("Unauthorized");
    }

    let audioPath = "";
    if (req.params.index){
        audioPath = path.resolve(__dirname, './media/' + asset);
    } else {
        audioPath = path.resolve(__dirname, './media/' + asset + "_" + parseInt(req.params.index));
    }
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1]
            ? parseInt(parts[1], 10)
            : fileSize-1;

        // Adjust the end for the maximum chunk size
        end = Math.min(start + MAX_CHUNK_SIZE - 1, end, fileSize - 1);

        const chunksize = (end-start)+1;
        console.log("# streaming request : " + chunksize + " bytes");
        const file = fs.createReadStream(audioPath, {start, end});
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mp3',
        };

        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mp3',
        };
        res.writeHead(200, head);
        fs.createReadStream(audioPath).pipe(res);
    }
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

    return asset;
}


app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
