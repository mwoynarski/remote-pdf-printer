
import express from 'express';
import fs from 'fs';
import https from 'https';
import logger from 'morgan';
import helmet from 'helmet';
import multer from 'multer';
import bodyParser from 'body-parser';
import pdfRoutes from './api/routes/printPdfRoutes.js';
import pngRoutes from './api/routes/printPngRoutes.js';
import constants from 'constants';

let formMulter = multer();

const app = express();

const options = {
	port: process.env.PORT || 3000,
	address: process.env.LISTEN || '127.0.0.1',
	use_ssl: process.env.USE_SSL || true,
	keyPath: process.env.SSL_KEY || 'privkey.pem',
	certPath: process.env.SSL_CERT || 'cert.pem',
    caPath: process.env.SSL_CA || 'chain.pem',
    logPath: process.env.LOG_PATH || '/var/log',
};

app.use(helmet());
app.use(logger('combined',{stream: fs.createWriteStream(options.logPath+'/remote-pdf-printer.log')}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: true }));

pdfRoutes(app, formMulter);
pngRoutes(app, formMulter);

if(options.use_ssl === true) {
    console.log('USING SSL! KEY: '+options.keyPath+"\nCert: "+options.certPath+"\nPort: "+options.port);
    https.createServer({
        secureOptions: constants.SSL_OP_NO_TLSv1|constants.SSL_OP_NO_SSLv2|constants.SSL_OP_NO_SSLv3,
        key: fs.readFileSync(options.keyPath),
        cert: fs.readFileSync(options.certPath),
        ca: [ fs.readFileSync(options.caPath)]
    },app).listen(options.port,options.address);
} else {
    console.log("**NOT** USING SSL! \nPort: "+options.port);
	app.listen(options.port,options.address);
}

console.log('HTML to PDF RESTful API server started');
